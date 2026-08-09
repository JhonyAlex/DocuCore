import { Router } from 'express'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { deriveAssetEvents } from '../lib/assetEvents'
import { createAssetSchema, updateAssetSchema, changeStatusSchema } from '../lib/validate'

const router: Router = Router()

const ACTOR_USER_ID = 1

// ITEM-05: un activo en la papelera se puede recuperar hasta 30 días después
// de su eliminación; pasada esa ventana, la purga lo borra físicamente.
const TRASH_RETENTION_DAYS = 30

const assetInclude = {
  type: {
    select: {
      id: true,
      name: true,
      fieldDefinitions: {
        where: { fieldType: 'DATE' as const },
        select: { id: true, fieldName: true },
      },
    },
  },
  status: { select: { id: true, name: true, pulseDot: true } },
  location: { select: { id: true, name: true, code: true, label: true } },
  responsible: { select: { id: true, name: true, initials: true, color: true } },
  events: {
    where: { completedAt: null },
    select: { id: true, title: true, date: true, type: true },
  },
  documentAssets: {
    orderBy: { document: { updatedAt: 'desc' } },
    include: {
      document: {
        select: {
          id: true,
          name: true,
          eventTitle: true,
          type: true,
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
            select: { id: true, version: true, originalName: true, mimeType: true, sizeBytes: true, expiryDate: true, uploadedAt: true },
          },
        },
      },
    },
  },
} satisfies Prisma.AssetInclude

type AssetWithRelations = Prisma.AssetGetPayload<{ include: typeof assetInclude }>

function derivedEventClock(): Date {
  const configured = process.env.DOCUCORE_NOW ? new Date(process.env.DOCUCORE_NOW) : null
  return configured && !Number.isNaN(configured.getTime()) ? configured : new Date()
}

function withDerivedEvents(asset: AssetWithRelations) {
  const documents = asset.documentAssets.map((link) => link.document)
  const nextEvents = deriveAssetEvents({ ...asset, documents }, derivedEventClock())
  const { events: _events, documentAssets: _documentAssets, type, ...base } = asset
  return {
    ...base,
    type: { id: type.id, name: type.name },
    documentCount: documents.length,
    documents: documents.map((document) => ({
      id: document.id,
      name: document.name,
      type: document.type,
      currentVersion: document.versions[0] ? {
        ...document.versions[0],
        expiryDate: document.versions[0].expiryDate?.toISOString() ?? null,
        uploadedAt: document.versions[0].uploadedAt.toISOString(),
      } : null,
    })),
    eventCount: nextEvents.length,
    nextEvents,
  }
}

function toNumberId(value: string | undefined): number | null {
  if (value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// Ubicación y responsable deben pertenecer al proyecto del activo. En POST se
// validan los cuatro ids recibidos; en PUT se valida el estado final
// (existentes + cambios), de modo que modificar solo una relación nunca deja
// las demás incoherentes con el proyecto.
async function assertAssetRelationsValid(projectId: number, locationId: number, responsibleId: number): Promise<void> {
  const invalid = new Error('Location and responsible must belong to the asset project')
  ;(invalid as Error & { status?: number }).status = 400
  const [location, responsible] = await Promise.all([
    prisma.location.findUnique({ where: { id: locationId }, select: { projectId: true } }),
    prisma.user.findUnique({
      where: { id: responsibleId },
      select: { memberships: { where: { projectId }, select: { id: true } } },
    }),
  ])
  if (!location || location.projectId !== projectId) throw invalid
  if (!responsible || responsible.memberships.length === 0) throw invalid
}

// Filtrar por una ubicación incluye los activos de toda su rama jerárquica.
async function collectLocationSubtree(rootId: number): Promise<number[]> {
  const locations = await prisma.location.findMany({ select: { id: true, parentId: true } })
  const childrenByParent = new Map<number | null, number[]>()
  for (const location of locations) {
    const siblings = childrenByParent.get(location.parentId) ?? []
    siblings.push(location.id)
    childrenByParent.set(location.parentId, siblings)
  }
  const ids: number[] = []
  const stack = [rootId]
  while (stack.length > 0) {
    const id = stack.pop() as number
    ids.push(id)
    stack.push(...(childrenByParent.get(id) ?? []))
  }
  return ids
}

// ITEM-05: purga perezosa de la papelera — borra físicamente los activos cuyo
// `deletedAt` supera la ventana de retención, con auditoría por activo.
async function purgeExpiredTrashedAssets(now = derivedEventClock()): Promise<void> {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const expired = await prisma.asset.findMany({
    where: { deletedAt: { not: null, lt: cutoff } },
    select: { id: true, code: true, name: true },
  })
  if (expired.length === 0) return
  await prisma.$transaction([
    prisma.asset.deleteMany({ where: { id: { in: expired.map((asset) => asset.id) } } }),
    ...expired.map((asset) => prisma.auditLog.create({
      data: {
        userId: ACTOR_USER_ID,
        action: 'Eliminación definitiva',
        entityId: asset.code,
        detail: `Activo "${asset.name}" purgado (más de ${TRASH_RETENTION_DAYS} días en papelera)`,
        timestamp: now,
      },
    })),
  ])
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = req.query
    const search = typeof q.search === 'string' ? q.search : undefined
    const pageParam = typeof q.page === 'string' ? Number(q.page) : NaN
    const limitParam = typeof q.limit === 'string' ? Number(q.limit) : NaN
    const typeId = toNumberId(typeof q.typeId === 'string' ? q.typeId : undefined)
    const statusId = toNumberId(typeof q.statusId === 'string' ? q.statusId : undefined)
    const locationId = toNumberId(typeof q.locationId === 'string' ? q.locationId : undefined)
    const trashed = q.trashed === 'true'

    const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1
    const limit = Number.isFinite(limitParam) && limitParam >= 1 ? Math.min(100, Math.floor(limitParam)) : 10

    // Al consultar la papelera se purgan primero los activos vencidos.
    if (trashed) await purgeExpiredTrashedAssets()

    const where: Prisma.AssetWhereInput = { deletedAt: trashed ? { not: null } : null }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { serialNumber: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (typeId !== null) where.typeId = typeId
    if (statusId !== null) where.statusId = statusId
    if (locationId !== null) where.locationId = { in: await collectLocationSubtree(locationId) }

    const [rows, total] = await prisma.$transaction([
      prisma.asset.findMany({
        where,
        include: assetInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: trashed ? { deletedAt: 'desc' } : { id: 'asc' },
      }),
      prisma.asset.count({ where }),
    ])

    const totalPages = total === 0 ? 1 : Math.ceil(total / limit)
    res.json({ data: rows.map(withDerivedEvents), total, page, totalPages })
  }),
)

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toNumberId(req.params.id)
    if (id === null) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    const asset = await prisma.asset.findFirst({ where: { id, deletedAt: null }, include: assetInclude })
    if (!asset) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json(withDerivedEvents(asset))
  }),
)

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createAssetSchema.parse(req.body)
    const { typeId, statusId, locationId, projectId, responsibleId, installDate, dynamicFields, ...rest } = parsed
    await assertAssetRelationsValid(projectId, locationId, responsibleId)
    const data: Prisma.AssetCreateInput = {
      ...rest,
      installDate: new Date(installDate),
      type: { connect: { id: typeId } },
      status: { connect: { id: statusId } },
      location: { connect: { id: locationId } },
      project: { connect: { id: projectId } },
      responsible: { connect: { id: responsibleId } },
      dynamicFields: dynamicFields ? (dynamicFields as Prisma.InputJsonValue) : undefined,
    }
    const [created] = await prisma.$transaction([
      prisma.asset.create({ data, include: assetInclude }),
      prisma.auditLog.create({
        data: {
          userId: ACTOR_USER_ID,
          action: 'Creación',
          entityId: parsed.code,
          detail: `Nuevo activo "${parsed.name}" creado`,
          timestamp: new Date(),
        },
      }),
    ])
    res.status(201).json(withDerivedEvents(created))
  }),
)

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toNumberId(req.params.id)
    if (id === null) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    const parsed = updateAssetSchema.parse(req.body)
    const { typeId, statusId, locationId, projectId, responsibleId, installDate, dynamicFields, ...rest } = parsed
    const existing = await prisma.asset.findFirst({
      where: { id, deletedAt: null },
      select: { projectId: true, locationId: true, responsibleId: true },
    })
    if (!existing) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    // El PUT es parcial: se valida el estado final combinando lo recibido con
    // lo existente, para que las relaciones no tocadas sigan siendo válidas.
    await assertAssetRelationsValid(
      projectId ?? existing.projectId,
      locationId ?? existing.locationId,
      responsibleId ?? existing.responsibleId,
    )
    const data: Prisma.AssetUpdateInput = {
      ...rest,
      installDate: installDate ? new Date(installDate) : undefined,
      type: typeId ? { connect: { id: typeId } } : undefined,
      status: statusId ? { connect: { id: statusId } } : undefined,
      location: locationId ? { connect: { id: locationId } } : undefined,
      project: projectId ? { connect: { id: projectId } } : undefined,
      responsible: responsibleId ? { connect: { id: responsibleId } } : undefined,
      dynamicFields: dynamicFields ? (dynamicFields as Prisma.InputJsonValue) : undefined,
    }
    const [updated] = await prisma.$transaction([
      prisma.asset.update({ where: { id }, data, include: assetInclude }),
      prisma.auditLog.create({
        data: {
          userId: ACTOR_USER_ID,
          action: 'Actualización',
          entityId: String(id),
          detail: 'Activo actualizado',
          timestamp: new Date(),
        },
      }),
    ])
    res.json(withDerivedEvents(updated))
  }),
)

// ITEM-05: el DELETE mueve el activo a la papelera (recuperable 30 días); el
// borrado físico queda reservado a la purga o a `POST /:id/purge`.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toNumberId(req.params.id)
    if (id === null) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    const asset = await prisma.asset.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, code: true, name: true },
    })
    if (!asset) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    await prisma.$transaction([
      prisma.asset.update({ where: { id }, data: { deletedAt: new Date() } }),
      prisma.auditLog.create({
        data: {
          userId: ACTOR_USER_ID,
          action: 'Eliminación',
          entityId: asset.code,
          detail: `Activo "${asset.name}" movido a la papelera`,
          timestamp: new Date(),
        },
      }),
    ])
    res.status(204).end()
  }),
)

router.post(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    const id = toNumberId(req.params.id)
    if (id === null) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    const asset = await prisma.asset.findFirst({
      where: { id, deletedAt: { not: null } },
      select: { id: true, code: true, name: true },
    })
    if (!asset) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const [restored] = await prisma.$transaction([
      prisma.asset.update({ where: { id }, data: { deletedAt: null }, include: assetInclude }),
      prisma.auditLog.create({
        data: {
          userId: ACTOR_USER_ID,
          action: 'Restauración',
          entityId: asset.code,
          detail: `Activo "${asset.name}" restaurado de la papelera`,
          timestamp: new Date(),
        },
      }),
    ])
    res.json(withDerivedEvents(restored))
  }),
)

// ITEM-05: borrado físico inmediato — solo válido para activos en papelera.
router.post(
  '/:id/purge',
  asyncHandler(async (req, res) => {
    const id = toNumberId(req.params.id)
    if (id === null) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    const asset = await prisma.asset.findFirst({
      where: { id, deletedAt: { not: null } },
      select: { id: true, code: true, name: true },
    })
    if (!asset) {
      const notTrashed = await prisma.asset.findUnique({ where: { id }, select: { id: true } })
      if (notTrashed) {
        res.status(409).json({ error: 'Asset is not in the trash' })
        return
      }
      res.status(404).json({ error: 'Not found' })
      return
    }
    await prisma.$transaction([
      prisma.asset.delete({ where: { id } }),
      prisma.auditLog.create({
        data: {
          userId: ACTOR_USER_ID,
          action: 'Eliminación definitiva',
          entityId: asset.code,
          detail: `Activo "${asset.name}" eliminado definitivamente`,
          timestamp: new Date(),
        },
      }),
    ])
    res.status(204).end()
  }),
)

router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const id = toNumberId(req.params.id)
    if (id === null) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    const parsed = changeStatusSchema.parse(req.body)
    const [existing, targetStatus] = await Promise.all([
      prisma.asset.findFirst({
        where: { id, deletedAt: null },
        select: { code: true, status: { select: { name: true } } },
      }),
      prisma.status.findUnique({ where: { id: parsed.statusId }, select: { name: true } }),
    ])
    if (!existing) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    if (!targetStatus) {
      res.status(400).json({ error: 'Invalid status' })
      return
    }
    const [updated] = await prisma.$transaction([
      prisma.asset.update({
        where: { id },
        data: { status: { connect: { id: parsed.statusId } } },
        include: assetInclude,
      }),
      prisma.auditLog.create({
        data: {
          userId: ACTOR_USER_ID,
          action: 'Cambio estado',
          entityId: existing.code,
          detail: `${existing.status.name} → ${targetStatus.name}`,
          timestamp: new Date(),
        },
      }),
    ])
    res.json(withDerivedEvents(updated))
  }),
)

export default router
