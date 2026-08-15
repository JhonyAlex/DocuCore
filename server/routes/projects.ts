import { Router } from 'express'
import { Prisma, type ProjectRole } from '@prisma/client'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { clearProjectConfiguration, copyProjectConfiguration, createMinimalProjectConfiguration } from '../lib/projectConfiguration'
import { actorIdFromRequest, parseProjectId, requireProjectCapability, resolveProjectScope } from '../lib/projectScope'
import { isProjectThemeKey, projectThemeKeys } from '../../shared/projectThemes'

const router = Router()
const projectRoleSchema = z.enum(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'])

const memberInputSchema = z.object({ userId: z.number().int().positive(), role: projectRoleSchema }).strict()
const projectInputSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9][A-Z0-9_-]*$/i, 'El código solo admite letras, números, guiones y guiones bajos').transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(''),
  themeKey: z.string().refine(isProjectThemeKey, `themeKey debe ser uno de: ${projectThemeKeys.join(', ')}`).default('blue'),
  memberIds: z.array(memberInputSchema).max(100).default([]),
  copyConfigurationFromProjectId: z.number().int().positive().optional(),
}).strict()

const projectPatchSchema = projectInputSchema.pick({ code: true, name: true, description: true, themeKey: true }).partial().refine((value) => Object.keys(value).length > 0, 'Indica al menos un campo')
const listSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'archived', 'all']).default('active'),
  sort: z.enum(['updated', 'created', 'name', 'code']).default('updated'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(18),
})
const membersQuerySchema = z.object({ search: z.string().trim().max(100).optional(), page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().positive().max(100).default(50) })

const projectInclude = {
  members: {
    take: 4,
    orderBy: { id: 'asc' as const },
    select: { userId: true, role: true, user: { select: { id: true, name: true, initials: true, color: true } } },
  },
  _count: {
    select: {
      assets: { where: { deletedAt: null } },
      documents: true,
      locations: true,
      members: true,
    },
  },
} satisfies Prisma.ProjectInclude

type ProjectWithSummary = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>

function serializeProject(project: ProjectWithSummary) {
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    description: project.description,
    status: project.status,
    themeKey: project.themeKey,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    assetCount: project._count.assets,
    documentCount: project._count.documents,
    locationCount: project._count.locations,
    memberCount: project._count.members,
    members: project.members.map((member) => ({ ...member.user, role: member.role })),
  }
}

async function ensureUsersExist(members: Array<{ userId: number }>): Promise<void> {
  const uniqueIds = [...new Set(members.map((member) => member.userId))]
  if (uniqueIds.length !== members.length) throw Object.assign(new Error('Un miembro solo puede añadirse una vez'), { status: 409 })
  if (!uniqueIds.length) return
  const count = await prisma.user.count({ where: { id: { in: uniqueIds } } })
  if (count !== uniqueIds.length) throw Object.assign(new Error('Uno o más usuarios no existen'), { status: 400 })
}

async function ensureManagementScope(projectId: number, actorId: number, capability: 'MANAGE_PROJECT' | 'MANAGE_MEMBERS' | 'MANAGE_CONFIGURATION' = 'MANAGE_PROJECT') {
  const scope = await resolveProjectScope(projectId, actorId)
  requireProjectCapability(scope, capability)
  return scope
}

async function ensureOwnerRemains(projectId: number, affectedRole: ProjectRole): Promise<void> {
  if (affectedRole !== 'OWNER') return
  const owners = await prisma.projectMember.count({ where: { projectId, role: 'OWNER' } })
  if (owners <= 1) throw Object.assign(new Error('Un proyecto debe conservar al menos una persona propietaria'), { status: 409 })
}

router.get('/', asyncHandler(async (req, res) => {
  const actorId = actorIdFromRequest(req)
  const query = listSchema.parse(req.query)
  const where: Prisma.ProjectWhereInput = {
    members: { some: { userId: actorId } },
    status: query.status === 'all' ? undefined : query.status === 'active' ? 'ACTIVE' : 'ARCHIVED',
    ...(query.search ? {
      OR: [
        { code: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ],
    } : {}),
  }
  const orderBy: Prisma.ProjectOrderByWithRelationInput[] = query.sort === 'name'
    ? [{ name: 'asc' }, { id: 'asc' }]
    : query.sort === 'code'
      ? [{ code: 'asc' }, { id: 'asc' }]
      : query.sort === 'created'
        ? [{ createdAt: 'asc' }, { id: 'asc' }]
        : [{ updatedAt: 'desc' }, { id: 'desc' }]
  const [total, rows] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.findMany({ where, include: projectInclude, orderBy, skip: (query.page - 1) * query.limit, take: query.limit }),
  ])
  res.json({ data: rows.map(serializeProject), total, page: query.page, limit: query.limit, totalPages: Math.max(1, Math.ceil(total / query.limit)) })
}))

router.post('/', asyncHandler(async (req, res) => {
  const actorId = actorIdFromRequest(req)
  const input = projectInputSchema.parse(req.body)
  await ensureUsersExist(input.memberIds)
  if (input.copyConfigurationFromProjectId) await ensureManagementScope(input.copyConfigurationFromProjectId, actorId, 'MANAGE_CONFIGURATION')

  const created = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: { code: input.code, name: input.name, description: input.description, themeKey: input.themeKey },
      select: { id: true },
    })
    const memberByUserId = new Map(input.memberIds.map((member) => [member.userId, member.role]))
    memberByUserId.set(actorId, 'OWNER')
    await tx.projectMember.createMany({ data: [...memberByUserId].map(([userId, role]) => ({ projectId: project.id, userId, role })) })
    if (input.copyConfigurationFromProjectId) await copyProjectConfiguration(tx, input.copyConfigurationFromProjectId, project.id)
    else await createMinimalProjectConfiguration(tx, project.id)
    await tx.auditLog.create({ data: { projectId: project.id, userId: actorId, action: 'Creación', entityId: `project:${project.id}`, detail: `Proyecto "${input.name}" creado${input.copyConfigurationFromProjectId ? ' copiando configuración' : ''}`, timestamp: new Date() } })
    return project.id
  })
  const project = await prisma.project.findUniqueOrThrow({ where: { id: created }, include: projectInclude })
  res.status(201).json(serializeProject(project))
}))

router.get('/:projectId', asyncHandler(async (req, res) => {
  const projectId = parseProjectId(req.params.projectId)
  await resolveProjectScope(projectId, actorIdFromRequest(req))
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: projectInclude })
  res.json(serializeProject(project))
}))

router.patch('/:projectId', asyncHandler(async (req, res) => {
  const projectId = parseProjectId(req.params.projectId)
  const actorId = actorIdFromRequest(req)
  const scope = await ensureManagementScope(projectId, actorId)
  if (scope.project.status === 'ARCHIVED') return res.status(409).json({ error: 'Archived projects are read-only' })
  const input = projectPatchSchema.parse(req.body)
  const project = await prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({ where: { id: projectId }, data: input, include: projectInclude })
    await tx.auditLog.create({ data: { projectId, userId: actorId, action: 'Actualización', entityId: `project:${projectId}`, detail: `Proyecto "${updated.name}" actualizado`, timestamp: new Date() } })
    return updated
  })
  res.json(serializeProject(project))
}))

router.post('/:projectId/archive', asyncHandler(async (req, res) => {
  const projectId = parseProjectId(req.params.projectId)
  const actorId = actorIdFromRequest(req)
  await ensureManagementScope(projectId, actorId)
  const project = await prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({ where: { id: projectId }, data: { status: 'ARCHIVED' }, include: projectInclude })
    await tx.auditLog.create({ data: { projectId, userId: actorId, action: 'Archivo', entityId: `project:${projectId}`, detail: `Proyecto "${updated.name}" archivado`, timestamp: new Date() } })
    return updated
  })
  res.json(serializeProject(project))
}))

router.post('/:projectId/restore', asyncHandler(async (req, res) => {
  const projectId = parseProjectId(req.params.projectId)
  const actorId = actorIdFromRequest(req)
  await ensureManagementScope(projectId, actorId)
  const project = await prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({ where: { id: projectId }, data: { status: 'ACTIVE' }, include: projectInclude })
    await tx.auditLog.create({ data: { projectId, userId: actorId, action: 'Reactivación', entityId: `project:${projectId}`, detail: `Proyecto "${updated.name}" reactivado`, timestamp: new Date() } })
    return updated
  })
  res.json(serializeProject(project))
}))

router.post('/:projectId/copy-configuration', asyncHandler(async (req, res) => {
  const targetProjectId = parseProjectId(req.params.projectId)
  const actorId = actorIdFromRequest(req)
  const input = z.object({ sourceProjectId: z.number().int().positive() }).strict().parse(req.body)
  const targetScope = await ensureManagementScope(targetProjectId, actorId, 'MANAGE_CONFIGURATION')
  if (targetScope.project.status === 'ARCHIVED') return res.status(409).json({ error: 'Archived projects are read-only' })
  if (input.sourceProjectId === targetProjectId) return res.status(400).json({ error: 'El proyecto origen debe ser distinto' })
  await ensureManagementScope(input.sourceProjectId, actorId, 'MANAGE_CONFIGURATION')
  const copied = await prisma.$transaction(async (tx) => {
    const operationalRows = await Promise.all([
      tx.asset.count({ where: { projectId: targetProjectId } }),
      tx.location.count({ where: { projectId: targetProjectId } }),
      tx.document.count({ where: { projectId: targetProjectId } }),
      tx.event.count({ where: { projectId: targetProjectId } }),
      tx.floorPlan.count({ where: { projectId: targetProjectId } }),
    ])
    if (operationalRows.some(Boolean)) throw Object.assign(new Error('Solo se puede copiar configuración a un proyecto sin datos operativos'), { status: 409 })
    await clearProjectConfiguration(tx, targetProjectId)
    await copyProjectConfiguration(tx, input.sourceProjectId, targetProjectId)
    await tx.auditLog.create({ data: { projectId: targetProjectId, userId: actorId, action: 'Copia de configuración', entityId: `project:${targetProjectId}`, detail: `Configuración copiada desde proyecto ${input.sourceProjectId}`, timestamp: new Date() } })
    return true
  })
  res.status(201).json({ success: copied })
}))

router.get('/:projectId/members', asyncHandler(async (req, res) => {
  const projectId = parseProjectId(req.params.projectId)
  await resolveProjectScope(projectId, actorIdFromRequest(req))
  const query = membersQuerySchema.parse(req.query)
  const where: Prisma.ProjectMemberWhereInput = {
    projectId,
    ...(query.search ? { user: { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { email: { contains: query.search, mode: 'insensitive' } }] } } : {}),
  }
  const [total, data] = await Promise.all([
    prisma.projectMember.count({ where }),
    prisma.projectMember.findMany({ where, orderBy: { id: 'asc' }, skip: (query.page - 1) * query.limit, take: query.limit, include: { user: { select: { id: true, name: true, email: true, initials: true, color: true } } } }),
  ])
  res.json({ data: data.map((member) => ({ ...member.user, role: member.role })), total, page: query.page, limit: query.limit, totalPages: Math.max(1, Math.ceil(total / query.limit)) })
}))

router.post('/:projectId/members', asyncHandler(async (req, res) => {
  const projectId = parseProjectId(req.params.projectId)
  const actorId = actorIdFromRequest(req)
  const scope = await ensureManagementScope(projectId, actorId, 'MANAGE_MEMBERS')
  if (scope.project.status === 'ARCHIVED') return res.status(409).json({ error: 'Archived projects are read-only' })
  const input = memberInputSchema.parse(req.body)
  await ensureUsersExist([input])
  const member = await prisma.$transaction(async (tx) => {
    const created = await tx.projectMember.create({ data: { projectId, userId: input.userId, role: input.role }, include: { user: { select: { id: true, name: true, email: true, initials: true, color: true } } } })
    await tx.auditLog.create({ data: { projectId, userId: actorId, action: 'Miembro añadido', entityId: `project-member:${created.id}`, detail: `${created.user.name} añadido al proyecto`, timestamp: new Date() } })
    return created
  })
  res.status(201).json({ ...member.user, role: member.role })
}))

router.patch('/:projectId/members/:userId', asyncHandler(async (req, res) => {
  const projectId = parseProjectId(req.params.projectId)
  const actorId = actorIdFromRequest(req)
  const scope = await ensureManagementScope(projectId, actorId, 'MANAGE_MEMBERS')
  if (scope.project.status === 'ARCHIVED') return res.status(409).json({ error: 'Archived projects are read-only' })
  const userId = parseProjectId(req.params.userId)
  const input = z.object({ role: projectRoleSchema }).strict().parse(req.body)
  const before = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, include: { user: true } })
  if (!before) return res.status(404).json({ error: 'Project member not found' })
  if (before.role === 'OWNER' && input.role !== 'OWNER') await ensureOwnerRemains(projectId, before.role)
  const member = await prisma.$transaction(async (tx) => {
    const updated = await tx.projectMember.update({ where: { id: before.id }, data: { role: input.role }, include: { user: { select: { id: true, name: true, email: true, initials: true, color: true } } } })
    await tx.auditLog.create({ data: { projectId, userId: actorId, action: 'Rol actualizado', entityId: `project-member:${updated.id}`, detail: `Rol de ${updated.user.name} actualizado a ${updated.role}`, timestamp: new Date() } })
    return updated
  })
  res.json({ ...member.user, role: member.role })
}))

router.delete('/:projectId/members/:userId', asyncHandler(async (req, res) => {
  const projectId = parseProjectId(req.params.projectId)
  const actorId = actorIdFromRequest(req)
  const scope = await ensureManagementScope(projectId, actorId, 'MANAGE_MEMBERS')
  if (scope.project.status === 'ARCHIVED') return res.status(409).json({ error: 'Archived projects are read-only' })
  const userId = parseProjectId(req.params.userId)
  const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, include: { user: true } })
  if (!member) return res.status(404).json({ error: 'Project member not found' })
  await ensureOwnerRemains(projectId, member.role)
  await prisma.$transaction([
    prisma.projectMember.delete({ where: { id: member.id } }),
    prisma.auditLog.create({ data: { projectId, userId: actorId, action: 'Miembro retirado', entityId: `project-member:${member.id}`, detail: `${member.user.name} retirado del proyecto`, timestamp: new Date() } }),
  ])
  res.status(204).end()
}))

export default router
