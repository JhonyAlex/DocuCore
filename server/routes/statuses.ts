import { Router } from 'express'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { statusCreateSchema, statusUpdateSchema } from '../lib/statuses'
import { scopedProjectId } from '../lib/projectScope'

const router: Router = Router({ mergeParams: true })
const ACTOR_USER_ID = 1

const includeUsage = {
  _count: { select: { assets: true } },
} as const

function serializeStatus(status: { _count: { assets: number } } & Record<string, unknown>) {
  const { _count, ...base } = status
  return { ...base, assetCount: _count.assets }
}

async function assertUniqueName(projectId: number, name: string, excludeId?: number) {
  const duplicate = await prisma.status.findFirst({
    where: { projectId, name: { equals: name, mode: 'insensitive' }, id: excludeId ? { not: excludeId } : undefined },
    select: { id: true },
  })
  if (duplicate) throw Object.assign(new Error('Ya existe un estado con ese nombre'), { status: 409 })
}

async function assertCanArchive(projectId: number, id: number) {
  const status = await prisma.status.findFirst({ where: { id, projectId }, include: includeUsage })
  if (!status) throw Object.assign(new Error('Not found'), { status: 404 })
  if (status._count.assets > 0) {
    throw Object.assign(new Error(`No se puede archivar: tiene ${status._count.assets} activo(s) asociados`), { status: 409 })
  }
  return status
}

router.get('/', asyncHandler(async (req, res) => {
  const projectId = scopedProjectId(req)
  const includeInactive = req.query.includeInactive === 'true'
  const rows = await prisma.status.findMany({
    where: { projectId, isActive: includeInactive ? undefined : true },
    include: includeUsage,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  })
  res.json(rows.map(serializeStatus))
}))

router.post('/', asyncHandler(async (req, res) => {
  const projectId = scopedProjectId(req)
  const input = statusCreateSchema.parse(req.body)
  await assertUniqueName(projectId, input.name)
  const sortOrder = input.sortOrder ?? ((await prisma.status.aggregate({ where: { projectId }, _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1
  const created = await prisma.$transaction(async (tx) => {
    const status = await tx.status.create({
      data: {
        projectId,
        name: input.name,
        color: input.color ?? 'emerald',
        pulseDot: input.pulseDot ?? null,
        sortOrder,
      },
      include: includeUsage,
    })
    await tx.auditLog.create({
      data: {
        projectId,
        userId: ACTOR_USER_ID,
        action: 'Creación',
        entityId: `status:${status.id}`,
        detail: `Estado "${status.name}" creado`,
        timestamp: new Date(),
      },
    })
    return status
  })
  res.status(201).json(serializeStatus(created))
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const projectId = scopedProjectId(req)
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  const input = statusUpdateSchema.parse(req.body)
  const before = await prisma.status.findFirst({ where: { id, projectId }, include: includeUsage })
  if (!before) return res.status(404).json({ error: 'Not found' })
  if (input.name && input.name !== before.name) await assertUniqueName(projectId, input.name, id)
  if (input.isActive === false && before.isActive) await assertCanArchive(projectId, id)

  const updated = await prisma.$transaction(async (tx) => {
    const status = await tx.status.update({ where: { id }, data: input, include: includeUsage })
    const detail = input.name && input.name !== before.name
      ? `Estado "${before.name}" renombrado a "${status.name}"`
      : input.isActive === true && !before.isActive
        ? `Estado "${status.name}" reactivado`
        : `Estado "${status.name}" actualizado`
    await tx.auditLog.create({
      data: {
        projectId,
        userId: ACTOR_USER_ID,
        action: input.isActive === true && !before.isActive ? 'Reactivación' : 'Actualización',
        entityId: `status:${id}`,
        detail,
        timestamp: new Date(),
      },
    })
    return status
  })
  res.json(serializeStatus(updated))
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  const projectId = scopedProjectId(req)
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  const status = await assertCanArchive(projectId, id)
  if (!status.isActive) return res.status(204).end()
  await prisma.$transaction([
    prisma.status.update({ where: { id }, data: { isActive: false } }),
    prisma.auditLog.create({
      data: {
        projectId,
        userId: ACTOR_USER_ID,
        action: 'Archivo',
        entityId: `status:${id}`,
        detail: `Estado "${status.name}" archivado`,
        timestamp: new Date(),
      },
    }),
  ])
  res.status(204).end()
}))

export default router
