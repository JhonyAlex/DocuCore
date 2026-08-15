import { Router } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { authenticatedUserId } from '../lib/auth'
import { hashPassword, passwordIsValid } from '../lib/passwords'
import { parseProjectId, requireProjectCapability, resolveProjectScope } from '../lib/projectScope'

const router = Router()
const roleSchema = z.enum(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'])
const listSchema = z.object({ projectId: z.coerce.number().int().positive(), search: z.string().trim().max(100).optional(), page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().positive().max(100).default(50) })
const createSchema = z.object({ projectId: z.number().int().positive(), name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(254), password: z.string().min(12).max(256), initials: z.string().trim().min(1).max(8), color: z.string().trim().min(1).max(40).default('brand'), isActive: z.boolean().default(true), role: roleSchema.default('VIEWER') }).strict()
const updateSchema = z.object({ projectId: z.number().int().positive(), name: z.string().trim().min(2).max(120).optional(), email: z.string().trim().email().max(254).optional(), initials: z.string().trim().min(1).max(8).optional(), color: z.string().trim().min(1).max(40).optional(), isActive: z.boolean().optional() }).strict().refine((value) => Object.keys(value).some((key) => key !== 'projectId'), 'Indica al menos un cambio')

const userSelect = { id: true, name: true, email: true, initials: true, color: true, isActive: true, role: true, createdAt: true, updatedAt: true } as const

async function requireUserManagement(projectId: number, userId: number) {
  const scope = await resolveProjectScope(projectId, userId)
  requireProjectCapability(scope, 'MANAGE_MEMBERS')
  if (scope.project.status === 'ARCHIVED') throw Object.assign(new Error('Archived projects are read-only'), { status: 409 })
  return scope
}

router.get('/', asyncHandler(async (req, res) => {
  const query = listSchema.parse(req.query)
  await requireUserManagement(query.projectId, authenticatedUserId(req))
  const where = { ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' as const } }, { email: { contains: query.search, mode: 'insensitive' as const } }] } : {}) }
  const [total, data] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, select: userSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
  ])
  res.json({ data, total, page: query.page, limit: query.limit, totalPages: Math.max(1, Math.ceil(total / query.limit)) })
}))

router.post('/', asyncHandler(async (req, res) => {
  const input = createSchema.parse(req.body)
  const actorId = authenticatedUserId(req)
  await requireUserManagement(input.projectId, actorId)
  if (!passwordIsValid(input.password)) return res.status(400).json({ error: 'La contraseña debe tener al menos 12 caracteres.' })
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({ data: { name: input.name, email: input.email.toLowerCase(), passwordHash: await hashPassword(input.password), role: 'Usuario', initials: input.initials, color: input.color, isActive: input.isActive }, select: userSelect })
    const member = await tx.projectMember.create({ data: { projectId: input.projectId, userId: created.id, role: input.role } })
    await tx.auditLog.create({ data: { projectId: input.projectId, userId: actorId, action: 'Usuario creado', entityId: `user:${created.id}`, detail: `${created.name} creado como ${member.role}`, timestamp: new Date() } })
    return { ...created, projectRole: member.role }
  })
  res.status(201).json(user)
}))

router.patch('/:userId', asyncHandler(async (req, res) => {
  const userId = parseProjectId(req.params.userId)
  const input = updateSchema.parse(req.body)
  const actorId = authenticatedUserId(req)
  await requireUserManagement(input.projectId, actorId)
  if (input.isActive === false && userId === actorId) return res.status(409).json({ error: 'No puedes desactivar tu propia cuenta.' })
  const data = { ...input }
  delete (data as { projectId?: number }).projectId
  if (data.email) data.email = data.email.toLowerCase()
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: userId }, data, select: userSelect })
    if (input.isActive === false) await tx.authSession.deleteMany({ where: { userId } })
    await tx.auditLog.create({ data: { projectId: input.projectId, userId: actorId, action: 'Usuario actualizado', entityId: `user:${userId}`, detail: `${updated.name} actualizado${input.isActive === false ? ' y desactivado' : ''}`, timestamp: new Date() } })
    return updated
  })
  res.json(user)
}))

export default router
