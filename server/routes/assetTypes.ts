import { Router } from 'express'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { assetTypeCreateSchema, assetTypeUpdateSchema, projectIdOf } from '../lib/assetTypes'

const router: Router = Router({ mergeParams: true })
const ACTOR_USER_ID = 1

const includeUsage = {
  _count: { select: { assets: true, fieldDefinitions: true } },
} as const

function serializeAssetType(type: { _count: { assets: number; fieldDefinitions: number } } & Record<string, unknown>) {
  const { _count, ...base } = type
  return { ...base, assetCount: _count.assets, fieldCount: _count.fieldDefinitions }
}

async function assertUniqueName(projectId: number, name: string, excludeId?: number) {
  const duplicate = await prisma.assetType.findFirst({
    where: { projectId, name: { equals: name, mode: 'insensitive' }, id: excludeId ? { not: excludeId } : undefined },
    select: { id: true },
  })
  if (duplicate) throw Object.assign(new Error('Ya existe un tipo de activo con ese nombre'), { status: 409 })
}

async function assertCanArchive(projectId: number, id: number) {
  const type = await prisma.assetType.findFirst({ where: { id, projectId }, include: includeUsage })
  if (!type) throw Object.assign(new Error('Not found'), { status: 404 })
  if (type._count.assets > 0 || type._count.fieldDefinitions > 0) {
    throw Object.assign(new Error(`No se puede archivar: tiene ${type._count.assets} activo(s) y ${type._count.fieldDefinitions} campo(s) dinámico(s) asociados`), { status: 409 })
  }
  return type
}

router.get('/', asyncHandler(async (req, res) => {
  const projectId = projectIdOf(req.params.projectId)
  const includeInactive = req.query.includeInactive === 'true'
  const rows = await prisma.assetType.findMany({
    where: { projectId, isActive: includeInactive ? undefined : true },
    include: includeUsage,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  })
  res.json(rows.map(serializeAssetType))
}))

router.post('/', asyncHandler(async (req, res) => {
  const projectId = projectIdOf(req.params.projectId)
  const input = assetTypeCreateSchema.parse(req.body)
  if (!await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })) return res.status(404).json({ error: 'Project not found' })
  await assertUniqueName(projectId, input.name)
  const sortOrder = input.sortOrder ?? ((await prisma.assetType.aggregate({ where: { projectId }, _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1
  const created = await prisma.$transaction(async (tx) => {
    const type = await tx.assetType.create({ data: { projectId, name: input.name, iconKey: input.iconKey, sortOrder }, include: includeUsage })
    await tx.auditLog.create({ data: { projectId, userId: ACTOR_USER_ID, action: 'Creación', entityId: `asset-type:${type.id}`, detail: `Tipo de activo "${type.name}" creado`, timestamp: new Date() } })
    return type
  })
  res.status(201).json(serializeAssetType(created))
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const projectId = projectIdOf(req.params.projectId)
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  const input = assetTypeUpdateSchema.parse(req.body)
  const before = await prisma.assetType.findFirst({ where: { id, projectId }, include: includeUsage })
  if (!before) return res.status(404).json({ error: 'Not found' })
  if (input.name && input.name !== before.name) await assertUniqueName(projectId, input.name, id)
  if (input.isActive === false && before.isActive) await assertCanArchive(projectId, id)
  const updated = await prisma.$transaction(async (tx) => {
    const type = await tx.assetType.update({ where: { id }, data: input, include: includeUsage })
    const detail = input.name && input.name !== before.name
      ? `Tipo de activo "${before.name}" renombrado a "${type.name}"`
      : input.isActive === true && !before.isActive
        ? `Tipo de activo "${type.name}" reactivado`
        : `Tipo de activo "${type.name}" actualizado`
    await tx.auditLog.create({ data: { projectId, userId: ACTOR_USER_ID, action: input.isActive === true && !before.isActive ? 'Reactivación' : 'Actualización', entityId: `asset-type:${id}`, detail, timestamp: new Date() } })
    return type
  })
  res.json(serializeAssetType(updated))
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  const projectId = projectIdOf(req.params.projectId)
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  const type = await assertCanArchive(projectId, id)
  if (!type.isActive) return res.status(204).end()
  await prisma.$transaction([
    prisma.assetType.update({ where: { id }, data: { isActive: false } }),
    prisma.auditLog.create({ data: { projectId, userId: ACTOR_USER_ID, action: 'Archivo', entityId: `asset-type:${id}`, detail: `Tipo de activo "${type.name}" archivado`, timestamp: new Date() } }),
  ])
  res.status(204).end()
}))

export default router
