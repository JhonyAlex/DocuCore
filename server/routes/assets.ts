import { Router, type Request, type Response } from 'express'
import { Prisma } from '@prisma/client'
import multer from 'multer'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { assetEventClock, deriveAssetEventsExcludingAcknowledged, type DerivedAssetEvent } from '../lib/assetEvents'
import { createAssetSchema, updateAssetSchema, changeStatusSchema, assetSortBySchema, sortOrderSchema } from '../lib/validate'
import { MAX_DOCUMENT_SIZE_BYTES, readDocumentFile, removeDocumentFile, storeDocumentBuffer } from '../lib/documentStorage'
import { completeDynamicDateSchema, dateScheduleValueSchema, parseDynamicValue, storedValue } from '../lib/dynamicFields'
import { asUtcDate, completeAssetDateOccurrence, createPreventiveExecution, setAssetDateSchedule } from '../lib/assetSchedules'
import { completeCalendarOccurrence, listCalendarOccurrences } from '../lib/calendarEvents'
import { isLocationDescendantOf } from '../lib/locationTree'
import { MAX_AUTOCOMPLETE_SIZE } from '../lib/performance'
import { nextAssetEventsById } from '../lib/nextAssetEvents'
import { actorIdFromRequest, scopedProjectId } from '../lib/projectScope'

const router: Router = Router({ mergeParams: true })

const preventiveAssignmentSchema = z.object({ planId: z.number().int().positive(), scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict()
const updatePreventiveAssignmentSchema = z.object({ scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict()
const completeEventSchema = z.object({ source: z.enum(['event', 'document', 'dynamic-date', 'preventive']), id: z.number().int().positive(), performedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict()

// ITEM-05: un activo en la papelera se puede recuperar hasta 30 días después
// de su eliminación; pasada esa ventana, la purga lo borra físicamente.
const TRASH_RETENTION_DAYS = 30

// IMG-01: las imágenes del activo viajan como multipart, se guardan en el storage
// gestionado de DocuCore y en BD solo quedan la clave + MIME + tamaño en AssetImage.
// Cada activo puede tener hasta 5 imágenes.
const MAX_ASSET_IMAGES = 5
const ASSET_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES, files: MAX_ASSET_IMAGES },
  fileFilter: (_req, file, callback) => {
    if (!ASSET_IMAGE_MIME_TYPES.has(file.mimetype)) return callback(new Error('Unsupported image type'))
    callback(null, true)
  },
})

// IMG-01: promisifica `upload.any()` y traduce el límite de tamaño a un mensaje de imagen.
function uploadImageFiles(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    uploadImage.any()(req, res, (error) => {
      if (!error) {
        resolve()
        return
      }
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        const translated = new Error('Image exceeds the 10 MB limit') as Error & { status?: number }
        translated.status = 400
        reject(translated)
        return
      }
      reject(error)
    })
  })
}

const assetInclude = {
  type: {
    select: {
      id: true,
      name: true,
      iconKey: true,
      color: true,
      fieldDefinitions: {
        where: { definition: { isActive: true } },
        include: {
          definition: {
            include: { options: { orderBy: { sortOrder: 'asc' } } },
          },
        },
      },
    },
  },
  status: { select: { id: true, name: true, pulseDot: true } },
  location: { select: { id: true, name: true, code: true, label: true } },
  responsible: { select: { id: true, name: true, initials: true, color: true } },
  images: {
    orderBy: { sortOrder: 'asc' },
    select: { id: true, storageKey: true, mimeType: true, sizeBytes: true, sortOrder: true },
  },
  events: {
    select: { id: true, title: true, date: true, type: true, completedAt: true },
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
  dynamicFieldValues: {
    include: {
      definition: { select: { id: true, fieldName: true, fieldType: true, isActive: true } },
    },
  },
  dateSchedules: { where: { isActive: true }, include: { definition: { select: { fieldName: true } }, occurrences: { orderBy: { id: 'asc' }, select: { id: true, scheduledDate: true, completedAt: true } } } },
  preventivePlans: { where: { isActive: true }, include: { executions: { orderBy: { id: 'asc' }, include: { tasks: { orderBy: { sortOrder: 'asc' }, select: { id: true, code: true, name: true, completedAt: true } } } } } },
  eventAcknowledgements: { select: { sourceKey: true } },
} satisfies Prisma.AssetInclude

// The grid has a dedicated DTO. It deliberately contains no growing relation:
// next-event hydration is performed by `nextAssetEventsById` with one bounded
// LATERAL probe per source and page asset.
const assetListSelect = {
  id: true, code: true, name: true, serialNumber: true, installDate: true,
  typeId: true, statusId: true, locationId: true, projectId: true, responsibleId: true,
  initials: true, deletedAt: true,
  images: {
    orderBy: { sortOrder: 'asc' },
    take: 1,
    select: { id: true, mimeType: true, sizeBytes: true },
  },
  type: { select: { id: true, name: true, iconKey: true, color: true } },
  status: { select: { id: true, name: true, pulseDot: true } },
  location: { select: { id: true, name: true, code: true, label: true } },
  responsible: { select: { id: true, name: true, initials: true, color: true } },
} satisfies Prisma.AssetSelect
type AssetListRow = Prisma.AssetGetPayload<{ select: typeof assetListSelect }>

type AssetWithRelations = Prisma.AssetGetPayload<{ include: typeof assetInclude }>

function withDerivedEvents(asset: AssetWithRelations) {
  const acknowledged = new Set(asset.eventAcknowledgements.map((entry) => entry.sourceKey))
  const documents = asset.documentAssets.map((link) => link.document).filter((document) => !acknowledged.has(`document:${document.id}`))
  const nextEvents = deriveAssetEventsExcludingAcknowledged({ ...asset, documents }, acknowledged, assetEventClock())
  // IMG-01: la clave interna de storage no se expone (como en documentos); el
  // frontend recibe URLs servidas por el propio API.
  const definitions = asset.type.fieldDefinitions.map((link) => link.definition).filter((definition) => definition.projectId === asset.projectId)
  const values = new Map(asset.dynamicFieldValues.map((value) => [value.definitionId, value]))
  const dynamicFields = definitions.map((definition) => {
    const value = values.get(definition.id)
    return {
      definitionId: definition.id,
      key: definition.key,
      fieldName: definition.fieldName,
      description: definition.description,
      groupName: definition.groupName,
      fieldType: definition.fieldType,
      required: definition.required,
      placeholder: definition.placeholder,
      unit: definition.unit,
      minValue: definition.minValue,
      maxValue: definition.maxValue,
      decimalPlaces: definition.decimalPlaces,
      sortOrder: definition.sortOrder,
      options: definition.options.filter((option) => option.isActive).map(({ id, key, label, sortOrder }) => ({ id, key, label, sortOrder })),
      value: value ? storedValue(definition.fieldType, value) : null,
      dateSchedule: asset.dateSchedules.find((schedule) => schedule.definitionId === definition.id) ? (() => { const schedule = asset.dateSchedules.find((entry) => entry.definitionId === definition.id)!; const occurrence = schedule.occurrences.find((entry) => !entry.completedAt); return { periodicity: schedule.periodicity, periodicityMode: schedule.periodicityMode, occurrenceId: occurrence?.id ?? null, date: occurrence?.scheduledDate.toISOString().slice(0, 10) ?? null } })() : null,
    }
  })
  const { events: _events, documentAssets: _documentAssets, dynamicFieldValues: _dynamicFieldValues, dateSchedules: _dateSchedules, preventivePlans, eventAcknowledgements: _eventAcknowledgements, type, images: _images, ...base } = asset
  const images = (_images ?? []).map((image) => ({
    id: image.id,
    url: `/api/projects/${base.projectId}/assets/${base.id}/images/${image.id}`,
    mimeType: image.mimeType,
    sizeBytes: image.sizeBytes,
    sortOrder: image.sortOrder,
  }))
  return {
    ...base,
    images,
    imageUrl: images[0]?.url ?? null,
    imageMimeType: images[0]?.mimeType ?? null,
    imageSizeBytes: images[0]?.sizeBytes ?? null,
    type: { id: type.id, name: type.name, iconKey: type.iconKey, color: type.color },
    dynamicFields,
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
    preventivePlans: preventivePlans.map((plan) => ({
      id: plan.id,
      planId: plan.planId,
      name: plan.name,
      periodicity: plan.periodicity,
      periodicityMode: plan.periodicityMode,
      executions: plan.executions.map((execution) => ({
        id: execution.id,
        scheduledDate: execution.scheduledDate.toISOString(),
        completedAt: execution.completedAt?.toISOString() ?? null,
        tasks: execution.tasks.map((task) => ({ ...task, completedAt: task.completedAt?.toISOString() ?? null })),
      })),
    })),
  }
}

function toNumberId(value: string | undefined): number | null {
  if (value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
async function assertAssetRelationsValid(projectId: number, typeId: number, locationId: number, responsibleId: number): Promise<void> {
  const invalid = new Error('Type, location and responsible must belong to the asset project')
  ;(invalid as Error & { status?: number }).status = 400
  const [type, location, responsible] = await Promise.all([
    prisma.assetType.findFirst({ where: { id: typeId, projectId, isActive: true }, select: { id: true } }),
    prisma.location.findUnique({ where: { id: locationId }, select: { projectId: true } }),
    prisma.user.findUnique({
      where: { id: responsibleId },
      select: { memberships: { where: { projectId }, select: { id: true } } },
    }),
  ])
  if (!type || !location || location.projectId !== projectId) throw invalid
  if (!responsible || responsible.memberships.length === 0) throw invalid
}

type DynamicInput = Array<{ definitionId: number; value?: unknown }>

async function replaceDynamicValues(
  tx: Prisma.TransactionClient,
  assetId: number,
  projectId: number,
  typeId: number,
  inputs: DynamicInput,
): Promise<void> {
  const uniqueIds = new Set(inputs.map((input) => input.definitionId))
  if (uniqueIds.size !== inputs.length) throw Object.assign(new Error('Duplicate dynamic field value'), { status: 400 })
  const definitions = await tx.dynamicFieldDefinition.findMany({
    where: { projectId, isActive: true, assetTypes: { some: { assetTypeId: typeId } } },
    include: { options: { orderBy: { sortOrder: 'asc' } } },
  })
  const byId = new Map(definitions.map((definition) => [definition.id, definition]))
  if (inputs.some((input) => !byId.has(input.definitionId))) throw Object.assign(new Error('Dynamic field does not apply to this asset'), { status: 400 })
  const supplied = new Map(inputs.map((input) => [input.definitionId, input.value]))
  for (const definition of definitions) {
    if (definition.required && !supplied.has(definition.id)) throw Object.assign(new Error(`Required dynamic field is missing: ${definition.fieldName}`), { status: 400 })
  }

  // A DATE value owns a schedule/history. It is updated in place so completing
  // an occurrence never disappears when the asset is edited again.
  for (const input of inputs) {
    const definition = byId.get(input.definitionId)!
    if (definition.fieldType === 'DATE') {
      const raw = typeof input.value === 'object' && input.value !== null && !Array.isArray(input.value)
        ? dateScheduleValueSchema.parse(input.value)
        : { date: input.value === null || input.value === undefined || input.value === '' ? null : String(input.value), periodicity: null, periodicityMode: null }
      const date = raw.date ? asUtcDate(raw.date) : null
      const empty = { textValue: null, numberValue: null, dateValue: date, booleanValue: null, jsonValue: Prisma.JsonNull }
      await tx.assetDynamicFieldValue.upsert({ where: { assetId_definitionId: { assetId, definitionId: definition.id } }, create: { assetId, definitionId: definition.id, ...empty }, update: empty })
      await setAssetDateSchedule(tx, { assetId, definitionId: definition.id, date, periodicity: raw.periodicity, periodicityMode: raw.periodicityMode })
      continue
    }
    const data = parseDynamicValue(definition, input.value)
    if (!data) {
      await tx.assetDynamicFieldValue.deleteMany({ where: { assetId, definitionId: definition.id } })
      continue
    }
    await tx.assetDynamicFieldValue.upsert({ where: { assetId_definitionId: { assetId, definitionId: definition.id } }, create: { assetId, definitionId: definition.id, ...data }, update: data })
  }
}

function serializeAssetList(asset: AssetListRow, nextEvent: DerivedAssetEvent | undefined) {
  const { images, ...base } = asset
  const primaryImage = images?.[0]
  return {
    ...base,
    installDate: asset.installDate.toISOString(),
    deletedAt: asset.deletedAt?.toISOString() ?? null,
    imageUrl: primaryImage ? `/api/projects/${asset.projectId}/assets/${asset.id}/images/${primaryImage.id}` : null,
    imageMimeType: primaryImage?.mimeType ?? null,
    imageSizeBytes: primaryImage?.sizeBytes ?? null,
    // The list exposes the single event used by its row. Counts and complete
    // histories remain the responsibility of the asset detail/endpoints.
    eventCount: nextEvent ? 1 : 0,
    nextEvents: nextEvent ? [nextEvent] : [],
    documentCount: 0,
  }
}

// ITEM-05: purga perezosa de la papelera — borra físicamente los activos cuyo
// `deletedAt` supera la ventana de retención, con auditoría por activo.
async function purgeExpiredTrashedAssets(projectId: number, actorId: number, now = assetEventClock()): Promise<void> {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const expired = await prisma.asset.findMany({
    where: { projectId, deletedAt: { not: null, lt: cutoff } },
    select: { id: true, projectId: true, code: true, name: true, images: { select: { storageKey: true } } },
    // El purgado perezoso avanza por lotes para no bloquear la lista de
    // Papelera si hay un histórico muy grande que ya ha vencido.
    take: 1_000,
  })
  if (expired.length === 0) return
  await prisma.$transaction([
    prisma.asset.deleteMany({ where: { id: { in: expired.map((asset) => asset.id) } } }),
    ...expired.map((asset) => prisma.auditLog.create({
      data: {
        projectId: asset.projectId,
        userId: actorId,
        action: 'Eliminación definitiva',
        entityId: asset.code,
        detail: `Activo "${asset.name}" purgado (más de ${TRASH_RETENTION_DAYS} días en papelera)`,
        timestamp: now,
      },
    })),
  ])
  // IMG-01: sin huérfanos — las imágenes del activo se borran del storage con él.
  await Promise.all(expired.flatMap((asset) => asset.images.map((image) => removeDocumentFile(image.storageKey))))
}

async function locationIsDescendantOf(tx: Prisma.TransactionClient, locationId: number, ancestorId: number): Promise<boolean> {
  return isLocationDescendantOf(tx, locationId, ancestorId)
}

async function removeInvalidFloorPlanMarkers(tx: Prisma.TransactionClient, assetId: number, projectId: number, locationId: number): Promise<number> {
  const markers = await tx.floorPlanMarker.findMany({ where: { assetId }, include: { floorPlan: { select: { id: true, projectId: true, locationId: true } } } })
  const invalid: number[] = []
  for (const marker of markers) {
    if (marker.floorPlan.projectId !== projectId || !await locationIsDescendantOf(tx, locationId, marker.floorPlan.locationId)) invalid.push(marker.id)
  }
  if (invalid.length) await tx.floorPlanMarker.deleteMany({ where: { id: { in: invalid } } })
  return invalid.length
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
    const projectId = scopedProjectId(req)
    const trashed = q.trashed === 'true'

    const sortByParsed = typeof q.sortBy === 'string' ? assetSortBySchema.safeParse(q.sortBy) : null
    const sortBy = sortByParsed?.success ? sortByParsed.data : undefined
    const sortOrderParsed = typeof (q.sortOrder ?? q.sortDir) === 'string' ? sortOrderSchema.safeParse(q.sortOrder ?? q.sortDir) : null
    const sortDir = sortOrderParsed?.success ? sortOrderParsed.data : 'asc'
    const isAsc = sortDir === 'asc'

    const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1
    const limit = Number.isFinite(limitParam) && limitParam >= 1 ? Math.min(100, Math.floor(limitParam)) : 10

    // Al consultar la papelera se purgan primero los activos vencidos.
    if (trashed) await purgeExpiredTrashedAssets(projectId, actorIdFromRequest(req))

    const conditions: Prisma.Sql[] = [
      Prisma.sql`asset."projectId" = ${projectId}`,
      trashed ? Prisma.sql`asset."deletedAt" IS NOT NULL` : Prisma.sql`asset."deletedAt" IS NULL`,
    ]
    if (search) conditions.push(Prisma.sql`(asset.name ILIKE ${`%${search}%`} OR asset.code ILIKE ${`%${search}%`} OR asset."serialNumber" ILIKE ${`%${search}%`})`)
    if (typeId !== null) conditions.push(Prisma.sql`asset."typeId" = ${typeId}`)
    if (statusId !== null) conditions.push(Prisma.sql`asset."statusId" = ${statusId}`)
    const locationCte = locationId === null ? Prisma.empty : Prisma.sql`
      WITH RECURSIVE subtree AS (
        SELECT id FROM "Location" WHERE id = ${locationId}
        UNION ALL
        SELECT child.id FROM "Location" child JOIN subtree ON child."parentId" = subtree.id
      )
    `
    if (locationId !== null) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM subtree WHERE subtree.id = asset."locationId")`)

    let orderBy: Prisma.Sql
    if (sortBy === 'code') {
      orderBy = isAsc ? Prisma.sql`asset."code" ASC, asset.id ASC` : Prisma.sql`asset."code" DESC, asset.id DESC`
    } else if (sortBy === 'name') {
      orderBy = isAsc ? Prisma.sql`asset."name" ASC, asset.id ASC` : Prisma.sql`asset."name" DESC, asset.id DESC`
    } else if (sortBy === 'type') {
      orderBy = isAsc
        ? Prisma.sql`(SELECT at.name FROM "AssetType" at WHERE at.id = asset."typeId") ASC, asset.id ASC`
        : Prisma.sql`(SELECT at.name FROM "AssetType" at WHERE at.id = asset."typeId") DESC, asset.id DESC`
    } else if (sortBy === 'location') {
      orderBy = isAsc
        ? Prisma.sql`(SELECT loc.name FROM "Location" loc WHERE loc.id = asset."locationId") ASC, asset.id ASC`
        : Prisma.sql`(SELECT loc.name FROM "Location" loc WHERE loc.id = asset."locationId") DESC, asset.id DESC`
    } else if (sortBy === 'status') {
      orderBy = isAsc
        ? Prisma.sql`(SELECT st.name FROM "Status" st WHERE st.id = asset."statusId") ASC, asset.id ASC`
        : Prisma.sql`(SELECT st.name FROM "Status" st WHERE st.id = asset."statusId") DESC, asset.id DESC`
    } else if (sortBy === 'responsible') {
      orderBy = isAsc
        ? Prisma.sql`(SELECT u.name FROM "User" u WHERE u.id = asset."responsibleId") ASC, asset.id ASC`
        : Prisma.sql`(SELECT u.name FROM "User" u WHERE u.id = asset."responsibleId") DESC, asset.id DESC`
    } else if (sortBy === 'deletedAt') {
      orderBy = isAsc
        ? Prisma.sql`asset."deletedAt" ASC NULLS LAST, asset.id ASC`
        : Prisma.sql`asset."deletedAt" DESC NULLS LAST, asset.id DESC`
    } else if (sortBy === 'installDate') {
      orderBy = isAsc
        ? Prisma.sql`asset."installDate" ASC, asset.id ASC`
        : Prisma.sql`asset."installDate" DESC, asset.id DESC`
    } else if (sortBy === 'nextEvent') {
      const nextEventSubquery = Prisma.sql`
        (
          SELECT MIN(event_date) FROM (
            SELECT e."date" AS event_date FROM "Event" e WHERE e."assetId" = asset.id AND e."completedAt" IS NULL
            UNION ALL
            SELECT pe."scheduledDate" AS event_date FROM "PreventiveExecution" pe JOIN "AssetPreventivePlan" app ON app.id = pe."planId" WHERE app."assetId" = asset.id AND pe."completedAt" IS NULL AND app."isActive" = true
            UNION ALL
            SELECT ado."scheduledDate" AS event_date FROM "AssetDateOccurrence" ado JOIN "AssetDateSchedule" ads ON ads.id = ado."scheduleId" WHERE ads."assetId" = asset.id AND ado."completedAt" IS NULL AND ads."isActive" = true
            UNION ALL
            SELECT dv."expiryDate" AS event_date FROM "DocumentVersion" dv JOIN "DocumentItem" di ON di."documentId" = dv."documentId" WHERE di."assetId" = asset.id AND dv."expiryDate" IS NOT NULL
          ) sub
        )
      `
      orderBy = isAsc
        ? Prisma.sql`${nextEventSubquery} ASC NULLS LAST, asset.id ASC`
        : Prisma.sql`${nextEventSubquery} DESC NULLS LAST, asset.id DESC`
    } else if (sortBy === 'id') {
      orderBy = isAsc ? Prisma.sql`asset.id ASC` : Prisma.sql`asset.id DESC`
    } else {
      orderBy = trashed ? Prisma.sql`asset."deletedAt" DESC, asset.id ASC` : Prisma.sql`asset.id ASC`
    }
    const ids = await prisma.$queryRaw<Array<{ id: number; total: bigint }>>(Prisma.sql`
      ${locationCte}
      SELECT asset.id, COUNT(*) OVER()::bigint AS total
      FROM "Asset" asset
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY ${orderBy}
      OFFSET ${(page - 1) * limit} LIMIT ${limit}
    `)
    const total = Number(ids[0]?.total ?? 0)
    const orderedIds = ids.map((row) => row.id)
    const rows = orderedIds.length === 0 ? [] : await prisma.asset.findMany({ where: { id: { in: orderedIds }, projectId }, select: assetListSelect })
    const byId = new Map(rows.map((row) => [row.id, row]))
    const nextEvents = await nextAssetEventsById(prisma, orderedIds)
    const totalPages = total === 0 ? 1 : Math.ceil(total / limit)
    res.json({ data: orderedIds.flatMap((assetId) => {
      const asset = byId.get(assetId)
      return asset ? [serializeAssetList(asset, nextEvents.get(assetId))] : []
    }), total, page, totalPages })
  }),
)

// UX-04: valores actuales de un campo de activo (Código, Nombre, Iniciales)
// para las sugerencias del formulario. Devuelve filas con los tres campos para
// mostrar el valor de los otros dos como contexto junto a cada sugerencia.
const SUGGESTION_FIELDS = ['code', 'name', 'initials'] as const
type SuggestionField = (typeof SUGGESTION_FIELDS)[number]

router.get(
  '/suggestions',
  asyncHandler(async (req, res) => {
    const q = req.query
    const field = typeof q.field === 'string' && (SUGGESTION_FIELDS as readonly string[]).includes(q.field) ? (q.field as SuggestionField) : null
    if (field === null) {
      res.status(400).json({ error: 'Invalid field' })
      return
    }
    const search = typeof q.q === 'string' ? q.q : ''
    const excludeId = toNumberId(typeof q.excludeId === 'string' ? q.excludeId : undefined)
    const projectId = scopedProjectId(req)
    const values = await prisma.asset.findMany({
      where: {
        projectId,
        deletedAt: null,
        id: excludeId === null ? undefined : { not: excludeId },
        [field]: { not: '', contains: search, mode: 'insensitive' },
      },
      distinct: [field],
      select: { code: true, name: true, initials: true },
      orderBy: { [field]: 'asc' },
      take: MAX_AUTOCOMPLETE_SIZE,
    })
    res.json({ values })
  }),
)

// Unified history: every source has a completed/pending occurrence. Documents
// use acknowledgements because their evidence remains version-owned.
router.get('/:id/events', asyncHandler(async (req, res) => {
  const id = toNumberId(req.params.id)
  if (id === null) return res.status(400).json({ error: 'Invalid id' })
  const asset = await prisma.asset.findFirst({ where: { id, projectId: scopedProjectId(req), deletedAt: null }, select: { projectId: true } })
  if (!asset) return res.status(404).json({ error: 'Not found' })
  const { events } = await listCalendarOccurrences(prisma, { projectId: asset.projectId, assetId: id })
  res.json(events
    .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id))
    // Compatibilidad del contrato histórico de ficha: esta superficie expone
    // ISO completo, mientras Calendario usa la misma fecha como YYYY-MM-DD.
    .map((event) => ({ ...event, id: event.sourceId, date: `${event.date}T00:00:00.000Z` })))
}))

// Auditoría propia del activo. «Eventos» conserva las ocurrencias operativas;
// «Historial» muestra las acciones trazables que se han realizado sobre él.
router.get('/:id/history', asyncHandler(async (req, res) => {
  const id = toNumberId(req.params.id)
  if (id === null) return res.status(400).json({ error: 'Invalid id' })
  const asset = await prisma.asset.findFirst({ where: { id, projectId: scopedProjectId(req), deletedAt: null }, select: { id: true, code: true, projectId: true } })
  if (!asset) return res.status(404).json({ error: 'Not found' })
  const page = Number.isInteger(Number(req.query.page)) && Number(req.query.page) > 0 ? Number(req.query.page) : 1
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const where = { projectId: asset.projectId, entityId: { in: [asset.code, `asset:${asset.id}`] } }
  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true, initials: true } } },
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ])
  res.json({ data: rows.map((row) => ({ id: row.id, action: row.action, detail: row.detail, timestamp: row.timestamp.toISOString(), user: row.user })), total, page, totalPages: Math.max(1, Math.ceil(total / limit)) })
}))

router.post('/:id/events/complete', asyncHandler(async (req, res) => {
  const id = toNumberId(req.params.id)
  if (id === null) return res.status(400).json({ error: 'Invalid id' })
  const input = completeEventSchema.parse(req.body)
  const asset = await prisma.asset.findFirst({ where: { id, projectId: scopedProjectId(req), deletedAt: null }, select: { id: true, code: true, projectId: true } })
  if (!asset) return res.status(404).json({ error: 'Not found' })
  await prisma.$transaction((tx) => completeCalendarOccurrence(tx, { source: input.source, sourceId: input.id, assetId: id, projectId: asset.projectId, performedDate: input.performedDate, actorId: actorIdFromRequest(req) }))
  const updated = await prisma.asset.findUniqueOrThrow({ where: { id }, include: assetInclude })
  res.json(withDerivedEvents(updated))
}))

router.post('/:id/preventives', asyncHandler(async (req, res) => {
  const id = toNumberId(req.params.id)
  if (id === null) return res.status(400).json({ error: 'Invalid id' })
  const input = preventiveAssignmentSchema.parse(req.body)
  const asset = await prisma.asset.findFirst({ where: { id, projectId: scopedProjectId(req), deletedAt: null }, select: { projectId: true, typeId: true, code: true } })
  if (!asset) return res.status(404).json({ error: 'Not found' })
  const template = await prisma.preventivePlan.findFirst({
    where: { id: input.planId, projectId: asset.projectId, isActive: true },
    include: { assetTypes: true },
  })
  if (!template) return res.status(400).json({ error: 'Preventive plan template not found' })

  const existingAssignment = await prisma.assetPreventivePlan.findFirst({
    where: { assetId: id, planId: template.id, isActive: true },
  })
  if (existingAssignment) return res.status(409).json({ error: 'El plan preventivo ya está asignado a este activo' })

  if (template.assetTypes.length > 0 && !template.assetTypes.some((at) => at.assetTypeId === asset.typeId)) {
    return res.status(400).json({ error: 'La plantilla del plan no es compatible con el tipo de este activo' })
  }
  await prisma.$transaction(async (tx) => {
    const plan = await tx.assetPreventivePlan.create({
      data: {
        assetId: id,
        planId: template.id,
        name: template.name,
        periodicity: template.periodicity,
        periodicityMode: template.periodicityMode,
      },
    })
    await createPreventiveExecution(tx, plan.id, asUtcDate(input.scheduledDate))
    await tx.auditLog.create({ data: { projectId: asset.projectId, userId: actorIdFromRequest(req), action: 'Creación', entityId: asset.code, detail: `Plan periódico "${template.name}" asignado`, timestamp: new Date() } })
  })
  const updated = await prisma.asset.findUniqueOrThrow({ where: { id }, include: assetInclude })
  res.status(201).json(withDerivedEvents(updated))
}))

router.delete('/:id/preventives/:planId', asyncHandler(async (req, res) => {
  const id = toNumberId(req.params.id)
  const planId = toNumberId(req.params.planId)
  if (id === null || planId === null) return res.status(400).json({ error: 'Invalid id' })
  const plan = await prisma.assetPreventivePlan.findFirst({ where: { id: planId, assetId: id, asset: { projectId: scopedProjectId(req) } }, include: { asset: { select: { projectId: true } } } })
  if (!plan) return res.status(404).json({ error: 'Preventive plan assignment not found' })
  await prisma.$transaction(async (tx) => {
    await tx.assetPreventivePlan.update({ where: { id: planId }, data: { isActive: false } })
    await tx.auditLog.create({ data: { projectId: plan.asset.projectId, userId: actorIdFromRequest(req), action: 'Desactivación', entityId: `asset:${id}`, detail: `Plan periódico "${plan.name}" desvinculado`, timestamp: new Date() } })
  })
  const updated = await prisma.asset.findUniqueOrThrow({ where: { id }, include: assetInclude })
  res.json(withDerivedEvents(updated))
}))

router.patch('/:id/preventives/:planId', asyncHandler(async (req, res) => {
  const id = toNumberId(req.params.id)
  const planId = toNumberId(req.params.planId)
  if (id === null || planId === null) return res.status(400).json({ error: 'Invalid id' })
  const input = updatePreventiveAssignmentSchema.parse(req.body)
  const plan = await prisma.assetPreventivePlan.findFirst({
    where: { id: planId, assetId: id, isActive: true, asset: { projectId: scopedProjectId(req) } },
    include: { asset: { select: { projectId: true } }, executions: { where: { completedAt: null }, orderBy: { id: 'asc' }, take: 1 } },
  })
  if (!plan || !plan.executions[0]) return res.status(404).json({ error: 'Pending preventive execution not found' })
  await prisma.$transaction(async (tx) => {
    await tx.preventiveExecution.update({
      where: { id: plan.executions[0].id },
      data: { scheduledDate: asUtcDate(input.scheduledDate) },
    })
    await tx.auditLog.create({
      data: {
        projectId: plan.asset.projectId,
        userId: actorIdFromRequest(req),
        action: 'Actualización',
        entityId: `asset:${id}`,
        detail: `Fecha de ejecución del plan "${plan.name}" actualizada a ${input.scheduledDate}`,
        timestamp: new Date(),
      },
    })
  })
  const updated = await prisma.asset.findUniqueOrThrow({ where: { id }, include: assetInclude })
  res.json(withDerivedEvents(updated))
}))

// Una única operación transaccional para evitar que React complete una tarea
// por petición. Solo afecta a tareas aún pendientes; completar la ejecución
// sigue siendo una acción separada porque calcula la siguiente ocurrencia.
router.post('/:id/preventives/executions/:executionId/tasks/complete', asyncHandler(async (req, res) => {
  const id = toNumberId(req.params.id)
  const executionId = toNumberId(req.params.executionId)
  if (id === null || executionId === null) return res.status(400).json({ error: 'Invalid id' })
  const updated = await prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findFirst({ where: { id, projectId: scopedProjectId(req), deletedAt: null }, select: { id: true, code: true, projectId: true } })
    if (!asset) throw Object.assign(new Error('Asset not found'), { status: 404 })
    const execution = await tx.preventiveExecution.findFirst({
      where: { id: executionId, plan: { assetId: id } },
      include: { plan: { select: { name: true, isActive: true } } },
    })
    if (!execution) throw Object.assign(new Error('Preventive execution not found'), { status: 404 })
    if (execution.completedAt || !execution.plan.isActive) throw Object.assign(new Error('Preventive execution is not pending'), { status: 409 })
    const completed = await tx.preventiveExecutionTask.updateMany({ where: { executionId, completedAt: null }, data: { completedAt: new Date() } })
    if (completed.count === 0) throw Object.assign(new Error('All preventive tasks are already complete'), { status: 409 })
    await tx.auditLog.create({ data: { projectId: asset.projectId, userId: actorIdFromRequest(req), action: 'Tareas preventivas completadas', entityId: asset.code, detail: `${completed.count} tareas pendientes completadas en "${execution.plan.name}"`, timestamp: new Date() } })
    return tx.asset.findUniqueOrThrow({ where: { id }, include: assetInclude })
  })
  res.json(withDerivedEvents(updated))
}))

router.post('/:id/preventives/executions/:executionId/tasks/:taskId/complete', asyncHandler(async (req, res) => {
  const id = toNumberId(req.params.id)
  const executionId = toNumberId(req.params.executionId)
  const taskId = toNumberId(req.params.taskId)
  if (id === null || executionId === null || taskId === null) return res.status(400).json({ error: 'Invalid id' })
  const task = await prisma.preventiveExecutionTask.findFirst({
    where: { id: taskId, executionId, execution: { plan: { assetId: id, asset: { projectId: scopedProjectId(req) } }, completedAt: null } },
    include: {
      execution: {
        include: {
          plan: { include: { asset: { select: { code: true, projectId: true } } } },
        },
      },
    },
  })
  if (!task) return res.status(404).json({ error: 'Preventive task not found' })
  await prisma.$transaction([
    prisma.preventiveExecutionTask.update({ where: { id: task.id }, data: { completedAt: task.completedAt ? null : new Date() } }),
    prisma.auditLog.create({
      data: {
        projectId: task.execution.plan.asset.projectId,
        userId: actorIdFromRequest(req),
        action: task.completedAt ? 'Tarea preventiva reabierta' : 'Tarea preventiva completada',
        entityId: task.execution.plan.asset.code,
        detail: `Tarea ${task.completedAt ? 'reabierta' : 'completada'} en "${task.execution.plan.name}"`,
        timestamp: new Date(),
      },
    }),
  ])
  const updated = await prisma.asset.findUniqueOrThrow({ where: { id }, include: assetInclude })
  res.json(withDerivedEvents(updated))
}))

router.post(
  '/:id/dynamic-fields/:definitionId/complete',
  asyncHandler(async (req, res) => {
    const id = toNumberId(req.params.id)
    const definitionId = toNumberId(req.params.definitionId)
    if (id === null || definitionId === null) return res.status(400).json({ error: 'Invalid id' })
    const { performedDate } = completeDynamicDateSchema.parse(req.body)
    const asset = await prisma.asset.findFirst({ where: { id, projectId: scopedProjectId(req), deletedAt: null }, select: { id: true, code: true, projectId: true, typeId: true } })
    if (!asset) return res.status(404).json({ error: 'Not found' })
    const schedule = await prisma.assetDateSchedule.findFirst({ where: { assetId: id, definitionId, isActive: true, definition: { projectId: asset.projectId, fieldType: 'DATE', assetTypes: { some: { assetTypeId: asset.typeId } } }, occurrences: { some: { completedAt: null } }, }, include: { definition: { select: { fieldName: true } }, occurrences: { where: { completedAt: null }, orderBy: { id: 'asc' }, take: 1 } } })
    if (!schedule?.occurrences[0]) return res.status(404).json({ error: 'Dynamic date occurrence not found' })
    const performed = asUtcDate(performedDate)
    const updated = await prisma.$transaction(async (tx) => {
      await completeAssetDateOccurrence(tx, schedule.occurrences[0].id, performed)
      await tx.auditLog.create({ data: { projectId: asset.projectId, userId: actorIdFromRequest(req), action: 'Realización', entityId: asset.code, detail: `${schedule.definition.fieldName}: ocurrencia ${schedule.occurrences[0].scheduledDate.toISOString().slice(0, 10)} completada el ${performedDate}`, timestamp: new Date() } })
      return tx.asset.findUniqueOrThrow({ where: { id }, include: assetInclude })
    })
    res.json(withDerivedEvents(updated))
  }),
)

// PLAN-04: consulta indexada por assetId. Devuelve solo los planos que ya
// contienen el activo y la versión necesaria para abrir el visor DZI.
router.get(
  '/:id/floor-plans',
  asyncHandler(async (req, res) => {
    const id = toNumberId(req.params.id)
    if (id === null) return res.status(400).json({ error: 'Invalid id' })
    const projectId = scopedProjectId(req)
    const asset = await prisma.asset.findFirst({ where: { id, projectId, deletedAt: null }, select: { id: true } })
    if (!asset) return res.status(404).json({ error: 'Not found' })
    const markers = await prisma.floorPlanMarker.findMany({
      where: { assetId: id, floorPlan: { projectId } },
      orderBy: [{ floorPlanId: 'asc' }, { id: 'asc' }],
      take: 100,
      select: {
        id: true, floorPlanId: true, x: true, y: true,
        floorPlan: {
          select: {
            name: true,
            location: { select: { id: true, name: true, label: true, code: true } },
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
              select: { id: true, version: true, originalName: true, mimeType: true, sizeBytes: true, width: true, height: true, uploadedAt: true },
            },
          },
        },
      },
    })
    res.json({
      data: markers.flatMap((marker) => {
        const currentVersion = marker.floorPlan.versions[0]
        if (!currentVersion) return []
        return [{
          planId: marker.floorPlanId,
          planName: marker.floorPlan.name,
          location: marker.floorPlan.location,
          currentVersion: { ...currentVersion, uploadedAt: currentVersion.uploadedAt.toISOString() },
          dziUrl: `/api/projects/${projectId}/floor-plans/${marker.floorPlanId}/versions/${currentVersion.version}/dzi`,
          markerId: marker.id,
          x: marker.x,
          y: marker.y,
        }]
      }),
    })
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
    const asset = await prisma.asset.findFirst({ where: { id, projectId: scopedProjectId(req), deletedAt: null }, include: assetInclude })
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
    const scopeProjectId = scopedProjectId(req)
    if (projectId !== undefined && projectId !== scopeProjectId) return res.status(400).json({ error: 'Project id does not match route scope' })
    await assertAssetRelationsValid(scopeProjectId, typeId, locationId, responsibleId)
    const status = await prisma.status.findFirst({ where: { id: statusId, projectId: scopeProjectId, isActive: true }, select: { id: true } })
    if (!status) return res.status(400).json({ error: 'Status must belong to the asset project' })
    const data: Prisma.AssetCreateInput = {
      ...rest,
      installDate: new Date(installDate),
      type: { connect: { id: typeId } },
      status: { connect: { id: statusId } },
      location: { connect: { id: locationId } },
      project: { connect: { id: scopeProjectId } },
      responsible: { connect: { id: responsibleId } },
    }
    const created = await prisma.$transaction(async (tx) => {
      const base = await tx.asset.create({ data })
      await replaceDynamicValues(tx, base.id, scopeProjectId, typeId, dynamicFields ?? [])
      await tx.auditLog.create({
        data: {
          projectId: base.projectId,
          userId: actorIdFromRequest(req),
          action: 'Creación',
          entityId: parsed.code,
          detail: `Nuevo activo "${parsed.name}" creado`,
          timestamp: new Date(),
        },
      })
      return tx.asset.findUniqueOrThrow({ where: { id: base.id }, include: assetInclude })
    })
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
    const scopeProjectId = scopedProjectId(req)
    if (projectId !== undefined && projectId !== scopeProjectId) return res.status(400).json({ error: 'Project id does not match route scope' })
    const existing = await prisma.asset.findFirst({
      where: { id, projectId: scopeProjectId, deletedAt: null },
      select: { projectId: true, typeId: true, locationId: true, responsibleId: true },
    })
    if (!existing) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    if (typeId && typeId !== existing.typeId) {
      const activePlans = await prisma.assetPreventivePlan.findMany({
        where: { assetId: id, isActive: true },
        include: { plan: { include: { assetTypes: true } } },
      })
      const incompatible = activePlans.find((p) => p.plan && p.plan.assetTypes.length > 0 && !p.plan.assetTypes.some((at) => at.assetTypeId === typeId))
      if (incompatible) {
        res.status(400).json({ error: `El nuevo tipo de activo no es compatible con el plan preventivo asignado "${incompatible.name}"` })
        return
      }
    }
    // El PUT es parcial: se valida el estado final combinando lo recibido con
    // lo existente, para que las relaciones no tocadas sigan siendo válidas.
    await assertAssetRelationsValid(
      scopeProjectId,
      typeId ?? existing.typeId,
      locationId ?? existing.locationId,
      responsibleId ?? existing.responsibleId,
    )
    if (statusId !== undefined) {
      const status = await prisma.status.findFirst({
        where: { id: statusId, projectId: scopeProjectId, isActive: true },
        select: { id: true },
      })
      if (!status) {
        res.status(400).json({ error: 'Status must belong to the asset project' })
        return
      }
    }
    const data: Prisma.AssetUpdateInput = {
      ...rest,
      installDate: installDate ? new Date(installDate) : undefined,
      type: typeId ? { connect: { id: typeId } } : undefined,
      status: statusId ? { connect: { id: statusId } } : undefined,
      location: locationId ? { connect: { id: locationId } } : undefined,
      // Assets never change tenant through an edit. Moving between projects
      // would make every relation a cross-project integrity operation.
      project: undefined,
      responsible: responsibleId ? { connect: { id: responsibleId } } : undefined,
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.asset.update({ where: { id }, data })
      const finalProjectId = scopeProjectId
      const finalTypeId = typeId ?? existing.typeId
      const finalLocationId = locationId ?? existing.locationId
      if (dynamicFields !== undefined) {
        await replaceDynamicValues(tx, id, finalProjectId, finalTypeId, dynamicFields)
      } else if (typeId && typeId !== existing.typeId) {
        await tx.assetDynamicFieldValue.deleteMany({
          where: { assetId: id, definition: { assetTypes: { none: { assetTypeId: finalTypeId } } } },
        })
      }
      const removedMarkers = await removeInvalidFloorPlanMarkers(tx, id, finalProjectId, finalLocationId)
      await tx.auditLog.create({
        data: {
          projectId: finalProjectId,
          userId: actorIdFromRequest(req),
          action: 'Actualización',
          entityId: String(id),
          detail: removedMarkers ? `Activo actualizado; ${removedMarkers} marcador(es) retirado(s) por cambio de ubicación` : 'Activo actualizado',
          timestamp: new Date(),
        },
      })
      return tx.asset.findUniqueOrThrow({ where: { id }, include: assetInclude })
    })
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
      where: { id, projectId: scopedProjectId(req), deletedAt: null },
      select: { id: true, code: true, name: true, projectId: true },
    })
    if (!asset) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    await prisma.$transaction([
      prisma.asset.update({ where: { id }, data: { deletedAt: new Date() } }),
      prisma.auditLog.create({
        data: {
          projectId: asset.projectId,
          userId: actorIdFromRequest(req),
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
      where: { id, projectId: scopedProjectId(req), deletedAt: { not: null } },
      select: { id: true, code: true, name: true, projectId: true },
    })
    if (!asset) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const [restored] = await prisma.$transaction([
      prisma.asset.update({ where: { id }, data: { deletedAt: null }, include: assetInclude }),
      prisma.auditLog.create({
        data: {
          projectId: asset.projectId,
          userId: actorIdFromRequest(req),
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
      where: { id, projectId: scopedProjectId(req), deletedAt: { not: null } },
      select: { id: true, code: true, name: true, projectId: true, images: { select: { storageKey: true } } },
    })
    if (!asset) {
      const notTrashed = await prisma.asset.findFirst({ where: { id, projectId: scopedProjectId(req) }, select: { id: true } })
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
          projectId: asset.projectId,
          userId: actorIdFromRequest(req),
          action: 'Eliminación definitiva',
          entityId: asset.code,
          detail: `Activo "${asset.name}" eliminado definitivamente`,
          timestamp: new Date(),
        },
      }),
    ])
    // IMG-01: las imágenes no se quedan huérfanas al purgar el activo.
    for (const image of asset.images) {
      await removeDocumentFile(image.storageKey).catch(() => undefined)
    }
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
        where: { id, projectId: scopedProjectId(req), deletedAt: null },
        select: { code: true, projectId: true, status: { select: { name: true } } },
      }),
      prisma.status.findFirst({ where: { id: parsed.statusId, projectId: scopedProjectId(req), isActive: true }, select: { name: true } }),
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
          projectId: existing.projectId,
          userId: actorIdFromRequest(req),
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

// IMG-01: sube hasta 5 imágenes por activo. Las nuevas se guardan primero en
// el storage gestionado; si la BD falla se deshacen los ficheros guardados.
router.post(
  ['/:id/images', '/:id/image'],
  asyncHandler(async (req, res) => {
    const id = toNumberId(req.params.id)
    if (id === null) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    const existing = await prisma.asset.findFirst({
      where: { id, projectId: scopedProjectId(req), deletedAt: null },
      select: { id: true, code: true, name: true, projectId: true, images: { select: { id: true, sortOrder: true } } },
    })
    if (!existing) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    await uploadImageFiles(req, res)
    const files = (req.files as Express.Multer.File[]) ?? (req.file ? [req.file] : [])
    if (files.length === 0) {
      res.status(400).json({ error: 'Image file is required' })
      return
    }
    if (existing.images.length + files.length > MAX_ASSET_IMAGES) {
      res.status(400).json({ error: `El activo no puede tener más de ${MAX_ASSET_IMAGES} imágenes` })
      return
    }
    const storedKeys: string[] = []
    try {
      for (const file of files) {
        const key = await storeDocumentBuffer(file.buffer, file.mimetype)
        storedKeys.push(key)
      }
    } catch (error) {
      for (const key of storedKeys) await removeDocumentFile(key).catch(() => undefined)
      const message = error instanceof Error ? error.message : ''
      if (message === 'Unsupported document type') throw new Error('Unsupported image type')
      if (message === 'Invalid document size') throw new Error('Invalid image size')
      throw error
    }
    let maxSortOrder = existing.images.reduce((max, img) => Math.max(max, img.sortOrder), -1)
    let updated: AssetWithRelations
    try {
      ;[updated] = await prisma.$transaction([
        ...storedKeys.map((storageKey, index) =>
          prisma.assetImage.create({
            data: {
              assetId: id,
              storageKey,
              mimeType: files[index].mimetype,
              sizeBytes: files[index].size,
              sortOrder: ++maxSortOrder,
            },
          })
        ),
        prisma.asset.update({
          where: { id },
          data: { updatedAt: new Date() },
          include: assetInclude,
        }),
        prisma.auditLog.create({
          data: {
            projectId: existing.projectId,
            userId: actorIdFromRequest(req),
            action: 'Imagen de activo',
            entityId: existing.code,
            detail: `${files.length} imagen(es) subida(s) para "${existing.name}"`,
            timestamp: new Date(),
          },
        }),
      ]).then((results) => [results[results.length - 2] as AssetWithRelations])
    } catch (error) {
      for (const key of storedKeys) await removeDocumentFile(key).catch(() => undefined)
      throw error
    }
    res.json(withDerivedEvents(updated))
  }),
)

// IMG-01: elimina una imagen específica del activo.
router.delete(
  '/:id/images/:imageId',
  asyncHandler(async (req, res) => {
    const id = toNumberId(req.params.id)
    const imageId = toNumberId(req.params.imageId)
    if (id === null || imageId === null) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    const existing = await prisma.asset.findFirst({
      where: { id, projectId: scopedProjectId(req), deletedAt: null },
      select: { id: true, code: true, name: true, projectId: true },
    })
    if (!existing) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const image = await prisma.assetImage.findFirst({
      where: { id: imageId, assetId: id },
      select: { id: true, storageKey: true },
    })
    if (!image) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    await prisma.$transaction([
      prisma.assetImage.delete({ where: { id: imageId } }),
      prisma.auditLog.create({
        data: {
          projectId: existing.projectId,
          userId: actorIdFromRequest(req),
          action: 'Imagen de activo eliminada',
          entityId: existing.code,
          detail: `Imagen de "${existing.name}" eliminada`,
          timestamp: new Date(),
        },
      }),
    ])
    await removeDocumentFile(image.storageKey).catch(() => undefined)
    res.status(204).end()
  }),
)

// IMG-01: elimina todas las imágenes del activo (compatibilidad con DELETE /image).
router.delete(
  '/:id/image',
  asyncHandler(async (req, res) => {
    const id = toNumberId(req.params.id)
    if (id === null) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    const existing = await prisma.asset.findFirst({
      where: { id, projectId: scopedProjectId(req), deletedAt: null },
      select: { id: true, code: true, name: true, projectId: true, images: { select: { id: true, storageKey: true } } },
    })
    if (!existing) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    await prisma.$transaction([
      prisma.assetImage.deleteMany({ where: { assetId: id } }),
      prisma.auditLog.create({
        data: {
          projectId: existing.projectId,
          userId: actorIdFromRequest(req),
          action: 'Imagen de activo eliminada',
          entityId: existing.code,
          detail: `Todas las imágenes de "${existing.name}" eliminadas`,
          timestamp: new Date(),
        },
      }),
    ])
    for (const image of existing.images) {
      await removeDocumentFile(image.storageKey).catch(() => undefined)
    }
    res.status(204).end()
  }),
)

// IMG-01: sirve una imagen específica del activo inline para `<img>`.
router.get(
  '/:id/images/:imageId',
  asyncHandler(async (req, res) => {
    const id = toNumberId(req.params.id)
    const imageId = toNumberId(req.params.imageId)
    if (id === null || imageId === null) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    const image = await prisma.assetImage.findFirst({
      where: { id: imageId, assetId: id, asset: { projectId: scopedProjectId(req), deletedAt: null } },
      select: { storageKey: true, mimeType: true },
    })
    if (!image) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    let bytes: Buffer
    try {
      bytes = await readDocumentFile(image.storageKey)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        res.status(404).json({ error: 'Not found' })
        return
      }
      throw error
    }
    res.setHeader('Content-Type', image.mimeType)
    res.setHeader('Content-Length', String(bytes.length))
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.send(bytes)
  }),
)

// IMG-01: sirve la imagen principal del activo inline para `<img>` (compatibilidad).
router.get(
  '/:id/image',
  asyncHandler(async (req, res) => {
    const id = toNumberId(req.params.id)
    if (id === null) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    const image = await prisma.assetImage.findFirst({
      where: { assetId: id, asset: { projectId: scopedProjectId(req), deletedAt: null } },
      orderBy: { sortOrder: 'asc' },
      select: { storageKey: true, mimeType: true },
    })
    if (!image) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    let bytes: Buffer
    try {
      bytes = await readDocumentFile(image.storageKey)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        res.status(404).json({ error: 'Not found' })
        return
      }
      throw error
    }
    res.setHeader('Content-Type', image.mimeType)
    res.setHeader('Content-Length', String(bytes.length))
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.send(bytes)
  }),
)

export default router
