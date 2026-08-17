import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { ALLOWED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_SIZE_BYTES, readDocumentFile, removeDocumentFile, storeDocumentFile } from '../lib/documentStorage'
import { calculateNextExpiry, type DocumentPeriodicity, type DocumentPeriodicityMode } from '../lib/periodicity'
import { createDocumentMetadataSchema, documentListQuerySchema, documentVersionMetadataSchema, updateDocumentMetadataSchema } from '../lib/validate'
import { LOCATION_PREVIEW_SIZE } from '../lib/performance'
import { actorIdFromRequest, requireDocumentInProject, scopedProjectId } from '../lib/projectScope'

const router: Router = Router({ mergeParams: true })

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_DOCUMENT_MIME_TYPES.has(file.mimetype)) return callback(new Error('Unsupported document type'))
    callback(null, true)
  },
})

const documentInclude = {
  // ITEM-05: los activos en papelera no aparecen como asociados (el vínculo
  // persiste en BD y reaparece al restaurar el activo).
  assets: {
    where: { asset: { deletedAt: null } },
    include: { asset: { select: { id: true, code: true, name: true } } },
  },
  project: { select: { id: true, code: true, name: true } },
  documentType: { select: { id: true, name: true, iconKey: true } },
  versions: { orderBy: { version: 'desc' as const }, take: 1 },
} satisfies Prisma.DocumentInclude

type DocumentWithCurrentVersion = Prisma.DocumentGetPayload<{ include: typeof documentInclude }>

// Intentionally distinct from documentInclude. A table row must never hydrate
// a document's full version history or an unbounded many-to-many relation.
const documentListSelect = {
  id: true,
  name: true,
  eventTitle: true,
  type: true,
  typeId: true,
  projectId: true,
  createdAt: true,
  updatedAt: true,
  periodicity: true,
  periodicityMode: true,
  documentType: { select: { id: true, name: true, iconKey: true } },
  assets: {
    where: { asset: { deletedAt: null } },
    orderBy: { asset: { code: 'asc' as const } },
    take: LOCATION_PREVIEW_SIZE,
    select: { asset: { select: { id: true, code: true, name: true } } },
  },
  _count: { select: { assets: { where: { asset: { deletedAt: null } } } } },
  versions: {
    orderBy: { version: 'desc' as const },
    take: 1,
    select: { id: true, version: true, originalName: true, mimeType: true, sizeBytes: true, issueDate: true, expiryDate: true, uploadedAt: true },
  },
} satisfies Prisma.DocumentSelect
type DocumentListRow = Prisma.DocumentGetPayload<{ select: typeof documentListSelect }>

function nowClock(): Date {
  const configured = process.env.DOCUCORE_NOW ? new Date(process.env.DOCUCORE_NOW) : null
  return configured && !Number.isNaN(configured.getTime()) ? configured : new Date()
}

function documentStatus(expiryDate: Date | null, now = nowClock()): 'Vigente' | 'Por vencer' | 'Vencido' {
  if (!expiryDate) return 'Vigente'
  const days = Math.floor((Date.UTC(expiryDate.getUTCFullYear(), expiryDate.getUTCMonth(), expiryDate.getUTCDate()) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86_400_000)
  if (days < 0) return 'Vencido'
  if (days <= 30) return 'Por vencer'
  return 'Vigente'
}

export function serializeDocument(document: DocumentWithCurrentVersion) {
  const currentVersion = document.versions[0]
  return {
    id: document.id,
    name: document.name,
    type: document.type,
    typeId: document.typeId ?? null,
    documentType: document.documentType ?? null,
    assets: document.assets.map((link) => link.asset),
    projectId: document.projectId,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    project: document.project,
    periodicity: document.periodicity ?? null,
    periodicityMode: document.periodicityMode ?? null,
    currentVersion: currentVersion ? {
      id: currentVersion.id,
      version: currentVersion.version,
      originalName: currentVersion.originalName,
      mimeType: currentVersion.mimeType,
      sizeBytes: currentVersion.sizeBytes,
      issueDate: currentVersion.issueDate.toISOString(),
      expiryDate: currentVersion.expiryDate?.toISOString() ?? null,
      uploadedAt: currentVersion.uploadedAt.toISOString(),
    } : null,
    status: documentStatus(currentVersion?.expiryDate ?? null),
  }
}

function parseId(value: string): number | null {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function serializeDocumentList(document: DocumentListRow) {
  const currentVersion = document.versions[0]
  return {
    id: document.id,
    name: document.name,
    eventTitle: document.eventTitle,
    type: document.type,
    typeId: document.typeId ?? null,
    documentType: document.documentType ?? null,
    projectId: document.projectId,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    periodicity: document.periodicity ?? null,
    periodicityMode: document.periodicityMode ?? null,
    assetCount: document._count.assets,
    assets: document.assets.map((link) => link.asset),
    currentVersion: currentVersion ? {
      id: currentVersion.id,
      version: currentVersion.version,
      originalName: currentVersion.originalName,
      mimeType: currentVersion.mimeType,
      sizeBytes: currentVersion.sizeBytes,
      issueDate: currentVersion.issueDate.toISOString(),
      expiryDate: currentVersion.expiryDate?.toISOString() ?? null,
      uploadedAt: currentVersion.uploadedAt.toISOString(),
    } : null,
    status: documentStatus(currentVersion?.expiryDate ?? null),
  }
}

async function sendDocumentVersion(
  res: Response,
  version: { storageKey: string; mimeType: string; originalName: string },
  disposition: 'inline' | 'attachment',
): Promise<void> {
  let bytes: Buffer
  try {
    bytes = await readDocumentFile(version.storageKey)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      res.status(404).json({ error: 'File not found on storage' })
      return
    }
    throw error
  }
  res.setHeader('Content-Type', version.mimeType)
  res.setHeader('Content-Length', String(bytes.length))
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(version.originalName)}`)
  res.send(bytes)
}

function uploadSingle(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => upload.single('file')(req, res, (error) => error ? reject(error) : resolve()))
}

async function assertDocumentExists(id: number, projectId: number): Promise<DocumentWithCurrentVersion> {
  const document = await prisma.document.findFirst({ where: { id, projectId }, include: documentInclude })
  if (!document) {
    const error = new Error('Document not found') as Error & { status?: number }
    error.status = 404
    throw error
  }
  return document
}

async function assertDocumentAssets(projectId: number, assetIds: number[]): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) {
    const error = new Error('Project not found') as Error & { status?: number }
    error.status = 404
    throw error
  }
  const uniqueIds = [...new Set(assetIds)]
  if (uniqueIds.length === 0) return
  const assets = await prisma.asset.findMany({ where: { id: { in: uniqueIds }, deletedAt: null }, select: { id: true, projectId: true } })
  if (assets.length !== uniqueIds.length) {
    const error = new Error('Asset not found') as Error & { status?: number }
    error.status = 404
    throw error
  }
  if (assets.some((asset) => asset.projectId !== projectId)) {
    const error = new Error('All assets must belong to the document project') as Error & { status?: number }
    error.status = 400
    throw error
  }
}

async function resolveDocumentType(projectId: number, inputTypeId?: number, inputTypeName?: string): Promise<{ typeId: number | null; type: string }> {
  if (inputTypeId) {
    const docType = await prisma.documentType.findFirst({
      where: { id: inputTypeId, projectId, isActive: true },
      select: { id: true, name: true },
    })
    if (!docType) throw Object.assign(new Error('Tipo de documento no encontrado o inactivo'), { status: 400 })
    return { typeId: docType.id, type: docType.name }
  }
  if (inputTypeName) {
    const docType = await prisma.documentType.findFirst({
      where: { projectId, name: { equals: inputTypeName, mode: 'insensitive' }, isActive: true },
      select: { id: true, name: true },
    })
    if (docType) return { typeId: docType.id, type: docType.name }
    return { typeId: null, type: inputTypeName }
  }
  throw Object.assign(new Error('Tipo de documento requerido'), { status: 400 })
}

function assetCodes(document: DocumentWithCurrentVersion): string {
  return document.assets.map((link) => link.asset.code).join(', ') || 'sin activos'
}

router.get('/', asyncHandler(async (req, res) => {
  const parsed = documentListQuerySchema.parse(req.query)
  const projectId = scopedProjectId(req)
  if (parsed.projectId !== undefined && parsed.projectId !== projectId) return res.status(400).json({ error: 'Project id does not match route scope' })
  const now = nowClock()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const soon = new Date(today); soon.setUTCDate(soon.getUTCDate() + 30)
  const conditions: Prisma.Sql[] = [Prisma.sql`d."projectId" = ${projectId}`]
  if (parsed.assetId === null) conditions.push(Prisma.sql`NOT EXISTS (SELECT 1 FROM "DocumentItem" di WHERE di."documentId" = d."id")`)
  if (parsed.assetId !== undefined && parsed.assetId !== null) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "DocumentItem" di WHERE di."documentId" = d."id" AND di."assetId" = ${parsed.assetId})`)
  if (parsed.type) conditions.push(Prisma.sql`d."type" ILIKE ${parsed.type}`)
  if (parsed.search) {
    const pattern = `%${parsed.search}%`
    conditions.push(Prisma.sql`(
      d."name" ILIKE ${pattern}
      OR EXISTS (
        SELECT 1 FROM "DocumentItem" di
        INNER JOIN "Asset" a ON a."id" = di."assetId"
        WHERE di."documentId" = d."id" AND a."deletedAt" IS NULL
          AND (a."code" ILIKE ${pattern} OR a."name" ILIKE ${pattern})
      )
    )`)
  }
  if (parsed.status === 'Vencido') conditions.push(Prisma.sql`current."expiryDate" < ${today}`)
  if (parsed.status === 'Por vencer') conditions.push(Prisma.sql`current."expiryDate" >= ${today} AND current."expiryDate" <= ${soon}`)
  if (parsed.status === 'Vigente') conditions.push(Prisma.sql`(current."expiryDate" IS NULL OR current."expiryDate" > ${soon})`)

  const offset = (parsed.page - 1) * parsed.limit
  const ids = await prisma.$queryRaw<Array<{ id: number; total: bigint | number }>>(Prisma.sql`
    SELECT d."id" AS id, COUNT(*) OVER() AS total
    FROM "Document" d
    LEFT JOIN LATERAL (
      SELECT dv."expiryDate"
      FROM "DocumentVersion" dv
      WHERE dv."documentId" = d."id"
      ORDER BY dv."version" DESC
      LIMIT 1
    ) current ON TRUE
    WHERE ${Prisma.join(conditions, ' AND ')}
    ORDER BY d."updatedAt" DESC, d."id" ASC
    OFFSET ${offset} LIMIT ${parsed.limit}
  `)
  const total = ids.length === 0 ? 0 : Number(ids[0].total)
  const order = new Map(ids.map((row, index) => [Number(row.id), index]))
  const rows = ids.length === 0 ? [] : await prisma.document.findMany({ where: { id: { in: ids.map((row) => Number(row.id)) }, projectId }, select: documentListSelect })
  rows.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))
  res.json({ data: rows.map(serializeDocumentList), total, page: parsed.page, totalPages: Math.max(1, Math.ceil(total / parsed.limit)) })
}))

router.get('/kpis', asyncHandler(async (req, res) => {
  const projectId = scopedProjectId(req)
  const now = nowClock()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const soon = new Date(today); soon.setUTCDate(soon.getUTCDate() + 30)
  const rows = await prisma.$queryRaw<Array<{ vigente: bigint | number; porVencer: bigint | number; vencido: bigint | number; total: bigint | number }>>(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE current."expiryDate" IS NULL OR current."expiryDate" > ${soon}) AS vigente,
      COUNT(*) FILTER (WHERE current."expiryDate" >= ${today} AND current."expiryDate" <= ${soon}) AS "porVencer",
      COUNT(*) FILTER (WHERE current."expiryDate" < ${today}) AS vencido,
      COUNT(*) AS total
    FROM "Document" d
    LEFT JOIN LATERAL (
      SELECT dv."expiryDate" FROM "DocumentVersion" dv
      WHERE dv."documentId" = d."id" ORDER BY dv."version" DESC LIMIT 1
    ) current ON TRUE
    WHERE d."projectId" = ${projectId}
  `)
  const row = rows[0] ?? { vigente: 0, porVencer: 0, vencido: 0, total: 0 }
  res.json({ vigente: Number(row.vigente), porVencer: Number(row.porVencer), vencido: Number(row.vencido), total: Number(row.total) })
}))

router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid id' })
  const document = await assertDocumentExists(id, scopedProjectId(req))
  const versions = await prisma.documentVersion.findMany({ where: { documentId: id }, orderBy: { version: 'desc' } })
  res.json({ ...serializeDocument(document), versions: versions.map((version) => ({
    id: version.id, version: version.version, originalName: version.originalName, mimeType: version.mimeType,
    sizeBytes: version.sizeBytes, issueDate: version.issueDate.toISOString(), expiryDate: version.expiryDate?.toISOString() ?? null,
    uploadedAt: version.uploadedAt.toISOString(),
  })) })
}))

router.post('/', asyncHandler(async (req, res) => {
  await uploadSingle(req, res)
  if (!req.file) return res.status(400).json({ error: 'A document file is required' })
  const input = createDocumentMetadataSchema.parse(req.body)
  const projectId = scopedProjectId(req)
  if (input.projectId !== projectId) return res.status(400).json({ error: 'Project id does not match route scope' })
  const assetIds = input.assetIds ?? []
  await assertDocumentAssets(projectId, assetIds)
  const resolvedType = await resolveDocumentType(projectId, input.typeId, input.type)

  // DOC-03: con periodicidad y sin vencimiento explícito, la primera versión
  // nace con el vencimiento calculado desde la emisión (no hay vencimiento previo).
  const periodicity = input.periodicity ?? null
  const periodicityMode = input.periodicityMode ?? 'Calendario'
  const expiryDate = input.expiryDate
    ? new Date(input.expiryDate)
    : periodicity
      ? calculateNextExpiry(null, new Date(input.issueDate), periodicityMode, periodicity)
      : null
  const storageKey = await storeDocumentFile(req.file)
  try {
    const created = await prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          name: input.name,
          type: resolvedType.type,
          typeId: resolvedType.typeId,
          projectId,
          periodicity,
          periodicityMode: periodicity ? periodicityMode : null,
          assets: { create: assetIds.map((assetId) => ({ asset: { connect: { id: assetId } } })) },
        },
      })
      await tx.documentVersion.create({
        data: { documentId: document.id, version: 1, originalName: req.file!.originalname, storageKey, mimeType: req.file!.mimetype, sizeBytes: req.file!.size, issueDate: new Date(input.issueDate), expiryDate },
      })
      await tx.auditLog.create({ data: { projectId: document.projectId, userId: actorIdFromRequest(req), action: 'Documento subido', entityId: String(document.id), detail: `${input.name} · v1` } })
      return tx.document.findUniqueOrThrow({ where: { id: document.id }, include: documentInclude })
    })
    res.status(201).json(serializeDocument(created))
  } catch (error) {
    await removeDocumentFile(storageKey)
    throw error
  }
}))

router.post('/:id/versions', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid id' })
  await uploadSingle(req, res)
  if (!req.file) return res.status(400).json({ error: 'A document file is required' })
  const input = documentVersionMetadataSchema.parse(req.body)
  const before = await assertDocumentExists(id, scopedProjectId(req))
  // DOC-03: con periodicidad y sin vencimiento explícito, el nuevo vencimiento
  // se calcula según el modo ('Calendario' salta desde el vigente, 'Subida'
  // desde la emisión de la nueva versión).
  const periodicity = before.periodicity as DocumentPeriodicity | null
  const periodicityMode = before.periodicityMode as DocumentPeriodicityMode | null
  const expiryDate = input.expiryDate
    ? new Date(input.expiryDate)
    : periodicity && periodicityMode
      ? calculateNextExpiry(before.versions[0]?.expiryDate ?? null, new Date(input.issueDate), periodicityMode, periodicity)
      : null
  const storageKey = await storeDocumentFile(req.file)
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const lastVersion = await tx.documentVersion.findFirst({ where: { documentId: id }, orderBy: { version: 'desc' }, select: { version: true } })
      const version = (lastVersion?.version ?? 0) + 1
      await tx.documentVersion.create({ data: { documentId: id, version, originalName: req.file!.originalname, storageKey, mimeType: req.file!.mimetype, sizeBytes: req.file!.size, issueDate: new Date(input.issueDate), expiryDate } })
      await tx.document.update({ where: { id }, data: {} })
      await tx.auditLog.create({ data: { projectId: before.projectId, userId: actorIdFromRequest(req), action: 'Nueva versión de documento', entityId: String(id), detail: `Versión v${version} subida` } })
      return tx.document.findUniqueOrThrow({ where: { id }, include: documentInclude })
    })
    res.status(201).json(serializeDocument(updated))
  } catch (error) {
    await removeDocumentFile(storageKey)
    throw error
  }
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid id' })
  const input = updateDocumentMetadataSchema.parse(req.body)
  const projectId = scopedProjectId(req)
  if (input.projectId !== undefined && input.projectId !== projectId) return res.status(400).json({ error: 'Project id does not match route scope' })
  const before = await assertDocumentExists(id, projectId)
  if (input.assetIds !== undefined) await assertDocumentAssets(projectId, input.assetIds ?? [])

  let resolvedType: { typeId: number | null; type: string } | undefined
  if (input.typeId !== undefined || input.type !== undefined) {
    resolvedType = await resolveDocumentType(projectId, input.typeId ?? undefined, input.type ?? undefined)
  }

  // DOC-03: el modo requiere periodicidad (actual o entrante); null quita la regla.
  const periodicity = input.periodicity
  if (input.periodicityMode !== undefined && input.periodicityMode !== null && (periodicity ?? before.periodicity) === null) {
    return res.status(400).json({ error: 'periodicityMode requires periodicity' })
  }
  const versionMetadataChanged = input.issueDate !== undefined || input.expiryDate !== undefined
  const currentVersion = before.versions[0]
  if (versionMetadataChanged && !currentVersion) {
    const error = new Error('Document version not found') as Error & { status?: number }
    error.status = 409
    throw error
  }
  const updated = await prisma.$transaction(async (tx) => {
    const document = await tx.document.update({
      where: { id },
      data: {
        name: input.name,
        type: resolvedType ? resolvedType.type : undefined,
        typeId: resolvedType ? resolvedType.typeId : input.typeId === null ? null : undefined,
        projectId: undefined,
        periodicity,
        periodicityMode: periodicity === null ? null : input.periodicityMode,
        assets: input.assetIds === undefined ? undefined : {
          deleteMany: {},
          create: (input.assetIds ?? []).map((assetId) => ({ asset: { connect: { id: assetId } } })),
        },
      },
      include: documentInclude,
    })
    if (versionMetadataChanged && currentVersion) {
      await tx.documentVersion.update({
        where: { id: currentVersion.id },
        data: {
          issueDate: input.issueDate === undefined ? undefined : new Date(input.issueDate),
          expiryDate: input.expiryDate === undefined ? undefined : input.expiryDate === null ? null : new Date(input.expiryDate),
        },
      })
    }
    const previousAssetIds = before.assets.map((link) => link.asset.id).sort((left, right) => left - right)
    const nextAssetIds = (input.assetIds ?? previousAssetIds).slice().sort((left, right) => left - right)
    const relationChanged = JSON.stringify(previousAssetIds) !== JSON.stringify(nextAssetIds)
    const periodicityChanged = periodicity !== undefined
    const action = relationChanged && versionMetadataChanged
      ? 'Documento y relación actualizados'
      : relationChanged
        ? 'Relación documento-activo actualizada'
        : versionMetadataChanged
          ? 'Fechas de documento actualizadas'
          : periodicityChanged
            ? 'Periodicidad de documento actualizada'
            : 'Metadatos de documento actualizados'
    const detail = [
      relationChanged ? `Activos ${assetCodes(before)} → ${assetCodes(document)}` : null,
      versionMetadataChanged ? `Fechas de v${currentVersion?.version ?? 1} actualizadas` : null,
      periodicityChanged ? `Periodicidad ${before.periodicity ?? 'Sin'} → ${periodicity ?? 'Sin'} · modo ${input.periodicityMode === null ? '—' : (input.periodicityMode ?? before.periodicityMode ?? '—')}` : null,
    ].filter(Boolean).join(' · ') || 'Nombre, tipo o proyecto actualizado'
    await tx.auditLog.create({ data: { projectId: document.projectId, userId: actorIdFromRequest(req), action, entityId: String(id), detail } })
    return tx.document.findUniqueOrThrow({ where: { id }, include: documentInclude })
  })
  res.json(serializeDocument(updated))
}))

// Vista previa de la versión actual: sirve el fichero inline (Content-Disposition
// inline) para que el navegador lo muestre (iframe/PDF, <img> en imágenes); la
// descarga sigue usando los endpoints /download con attachment.
router.get('/:id/preview', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid id' })
  await requireDocumentInProject(id, scopedProjectId(req))
  const version = await prisma.documentVersion.findFirst({ where: { documentId: id }, orderBy: { version: 'desc' } })
  if (!version) return res.status(404).json({ error: 'Document version not found' })
  await sendDocumentVersion(res, version, 'inline')
}))

router.get('/:id/download', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid id' })
  await requireDocumentInProject(id, scopedProjectId(req))
  const version = await prisma.documentVersion.findFirst({ where: { documentId: id }, orderBy: { version: 'desc' } })
  if (!version) return res.status(404).json({ error: 'Document version not found' })
  await sendDocumentVersion(res, version, 'attachment')
}))

// Cada versión histórica se puede visualizar sin convertirla en la versión
// vigente. Usa el mismo contrato inline que la vista previa actual.
router.get('/:id/versions/:version/preview', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const versionNumber = parseId(req.params.version)
  if (!id || !versionNumber) return res.status(400).json({ error: 'Invalid id' })
  await requireDocumentInProject(id, scopedProjectId(req))
  const version = await prisma.documentVersion.findUnique({ where: { documentId_version: { documentId: id, version: versionNumber } } })
  if (!version) return res.status(404).json({ error: 'Document version not found' })
  await sendDocumentVersion(res, version, 'inline')
}))

router.get('/:id/versions/:version/download', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const versionNumber = parseId(req.params.version)
  if (!id || !versionNumber) return res.status(400).json({ error: 'Invalid id' })
  await requireDocumentInProject(id, scopedProjectId(req))
  const version = await prisma.documentVersion.findUnique({ where: { documentId_version: { documentId: id, version: versionNumber } } })
  if (!version) return res.status(404).json({ error: 'Document version not found' })
  await sendDocumentVersion(res, version, 'attachment')
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid id' })
  const document = await prisma.document.findFirst({ where: { id, projectId: scopedProjectId(req) }, include: { versions: true } })
  if (!document) return res.status(404).json({ error: 'Not found' })
  await prisma.$transaction([
    prisma.document.delete({ where: { id } }),
    prisma.auditLog.create({ data: { projectId: document.projectId, userId: actorIdFromRequest(req), action: 'Documento eliminado', entityId: String(id), detail: document.name } }),
  ])
  await Promise.all(document.versions.map((version) => removeDocumentFile(version.storageKey)))
  res.status(204).end()
}))

export default router
