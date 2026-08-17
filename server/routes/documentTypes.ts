import { Router } from 'express'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { documentTypeCreateSchema, documentTypeUpdateSchema } from '../lib/documentTypes'
import { actorIdFromRequest, scopedProjectId } from '../lib/projectScope'

const router: Router = Router({ mergeParams: true })

const includeUsage = {
  _count: { select: { documents: true } },
} as const

function serializeDocumentType(type: { _count: { documents: number } } & Record<string, unknown>) {
  const { _count, ...base } = type
  return { ...base, documentCount: _count.documents }
}

async function assertUniqueName(projectId: number, name: string, excludeId?: number) {
  const duplicate = await prisma.documentType.findFirst({
    where: { projectId, name: { equals: name, mode: 'insensitive' }, id: excludeId ? { not: excludeId } : undefined },
    select: { id: true },
  })
  if (duplicate) throw Object.assign(new Error('Ya existe un tipo de documento con ese nombre'), { status: 409 })
}

async function assertCanArchive(projectId: number, id: number) {
  const type = await prisma.documentType.findFirst({ where: { id, projectId }, include: includeUsage })
  if (!type) throw Object.assign(new Error('Not found'), { status: 404 })
  if (type._count.documents > 0) {
    throw Object.assign(new Error(`No se puede archivar: tiene ${type._count.documents} documento(s) asociados`), { status: 409 })
  }
  return type
}

router.get('/', asyncHandler(async (req, res) => {
  const projectId = scopedProjectId(req)
  const includeInactive = req.query.includeInactive === 'true'
  const rows = await prisma.documentType.findMany({
    where: { projectId, isActive: includeInactive ? undefined : true },
    include: includeUsage,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  })
  res.json(rows.map(serializeDocumentType))
}))

router.post('/', asyncHandler(async (req, res) => {
  const projectId = scopedProjectId(req)
  const input = documentTypeCreateSchema.parse(req.body)
  await assertUniqueName(projectId, input.name)
  const sortOrder = input.sortOrder ?? ((await prisma.documentType.aggregate({ where: { projectId }, _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1
  const created = await prisma.$transaction(async (tx) => {
    const type = await tx.documentType.create({ data: { projectId, name: input.name, iconKey: input.iconKey ?? 'file-text', sortOrder }, include: includeUsage })
    await tx.auditLog.create({ data: { projectId, userId: actorIdFromRequest(req), action: 'Creación', entityId: `document-type:${type.id}`, detail: `Tipo de documento "${type.name}" creado`, timestamp: new Date() } })
    return type
  })
  res.status(201).json(serializeDocumentType(created))
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const projectId = scopedProjectId(req)
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  const input = documentTypeUpdateSchema.parse(req.body)
  const before = await prisma.documentType.findFirst({ where: { id, projectId }, include: includeUsage })
  if (!before) return res.status(404).json({ error: 'Not found' })
  if (input.name && input.name !== before.name) await assertUniqueName(projectId, input.name, id)
  if (input.isActive === false && before.isActive) await assertCanArchive(projectId, id)
  const updated = await prisma.$transaction(async (tx) => {
    const type = await tx.documentType.update({ where: { id }, data: input, include: includeUsage })
    if (input.name && input.name !== before.name) {
      await tx.document.updateMany({ where: { typeId: id }, data: { type: type.name } })
    }
    const detail = input.name && input.name !== before.name
      ? `Tipo de documento "${before.name}" renombrado a "${type.name}"`
      : input.isActive === true && !before.isActive
        ? `Tipo de documento "${type.name}" reactivado`
        : `Tipo de documento "${type.name}" actualizado`
    await tx.auditLog.create({ data: { projectId, userId: actorIdFromRequest(req), action: input.isActive === true && !before.isActive ? 'Reactivación' : 'Actualización', entityId: `document-type:${id}`, detail, timestamp: new Date() } })
    return type
  })
  res.json(serializeDocumentType(updated))
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  const projectId = scopedProjectId(req)
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  const type = await assertCanArchive(projectId, id)
  if (!type.isActive) return res.status(204).end()
  await prisma.$transaction([
    prisma.documentType.update({ where: { id }, data: { isActive: false } }),
    prisma.auditLog.create({ data: { projectId, userId: actorIdFromRequest(req), action: 'Archivo', entityId: `document-type:${id}`, detail: `Tipo de documento "${type.name}" archivado`, timestamp: new Date() } }),
  ])
  res.status(204).end()
}))

export default router
