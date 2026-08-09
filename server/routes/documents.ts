import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { ALLOWED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_SIZE_BYTES, readDocumentFile, removeDocumentFile, storeDocumentFile } from '../lib/documentStorage'
import { createDocumentMetadataSchema, documentListQuerySchema, updateDocumentMetadataSchema } from '../lib/validate'

const router: Router = Router()
const ACTOR_USER_ID = 1

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_DOCUMENT_MIME_TYPES.has(file.mimetype)) return callback(new Error('Unsupported document type'))
    callback(null, true)
  },
})

const documentInclude = {
  items: { include: { item: { select: { id: true, code: true, name: true } } } },
  project: { select: { id: true, code: true, name: true } },
  versions: { orderBy: { version: 'desc' as const }, take: 1 },
} satisfies Prisma.DocumentInclude

type DocumentWithCurrentVersion = Prisma.DocumentGetPayload<{ include: typeof documentInclude }>

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
    items: document.items.map((link) => link.item),
    projectId: document.projectId,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    project: document.project,
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

function uploadSingle(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => upload.single('file')(req, res, (error) => error ? reject(error) : resolve()))
}

async function assertDocumentExists(id: number): Promise<DocumentWithCurrentVersion> {
  const document = await prisma.document.findUnique({ where: { id }, include: documentInclude })
  if (!document) {
    const error = new Error('Document not found') as Error & { status?: number }
    error.status = 404
    throw error
  }
  return document
}

async function assertDocumentItems(projectId: number, itemIds: number[]): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) {
    const error = new Error('Project not found') as Error & { status?: number }
    error.status = 404
    throw error
  }
  const uniqueIds = [...new Set(itemIds)]
  if (uniqueIds.length === 0) return
  const items = await prisma.item.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, projectId: true } })
  if (items.length !== uniqueIds.length) {
    const error = new Error('Item not found') as Error & { status?: number }
    error.status = 404
    throw error
  }
  if (items.some((item) => item.projectId !== projectId)) {
    const error = new Error('All items must belong to the document project') as Error & { status?: number }
    error.status = 400
    throw error
  }
}

function itemCodes(document: DocumentWithCurrentVersion): string {
  return document.items.map((link) => link.item.code).join(', ') || 'sin activos'
}

router.get('/', asyncHandler(async (req, res) => {
  const parsed = documentListQuerySchema.parse(req.query)
  const rows = await prisma.document.findMany({
    where: {
      projectId: parsed.projectId,
      items: parsed.itemId === null ? { none: {} } : parsed.itemId !== undefined ? { some: { itemId: parsed.itemId } } : undefined,
      type: parsed.type ? { equals: parsed.type, mode: 'insensitive' } : undefined,
      OR: parsed.search ? [
        { name: { contains: parsed.search, mode: 'insensitive' } },
        { items: { some: { item: { code: { contains: parsed.search, mode: 'insensitive' } } } } },
        { items: { some: { item: { name: { contains: parsed.search, mode: 'insensitive' } } } } },
      ] : undefined,
    },
    include: documentInclude,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  })
  const filtered = parsed.status ? rows.filter((document) => documentStatus(document.versions[0]?.expiryDate ?? null) === parsed.status) : rows
  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / parsed.limit))
  const start = (parsed.page - 1) * parsed.limit
  res.json({ data: filtered.slice(start, start + parsed.limit).map(serializeDocument), total, page: parsed.page, totalPages })
}))

router.get('/kpis', asyncHandler(async (_req, res) => {
  const documents = await prisma.document.findMany({ include: documentInclude })
  const kpis = { vigente: 0, porVencer: 0, vencido: 0, total: documents.length }
  for (const document of documents) {
    const status = documentStatus(document.versions[0]?.expiryDate ?? null)
    if (status === 'Vigente') kpis.vigente += 1
    if (status === 'Por vencer') kpis.porVencer += 1
    if (status === 'Vencido') kpis.vencido += 1
  }
  res.json(kpis)
}))

router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid id' })
  const document = await assertDocumentExists(id)
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
  const itemIds = input.itemIds ?? []
  await assertDocumentItems(input.projectId, itemIds)
  const storageKey = await storeDocumentFile(req.file)
  try {
    const created = await prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          name: input.name,
          type: input.type,
          projectId: input.projectId,
          items: { create: itemIds.map((itemId) => ({ item: { connect: { id: itemId } } })) },
        },
      })
      await tx.documentVersion.create({
        data: { documentId: document.id, version: 1, originalName: req.file!.originalname, storageKey, mimeType: req.file!.mimetype, sizeBytes: req.file!.size, issueDate: new Date(input.issueDate), expiryDate: input.expiryDate ? new Date(input.expiryDate) : null },
      })
      await tx.auditLog.create({ data: { userId: ACTOR_USER_ID, action: 'Documento subido', entityId: String(document.id), detail: `${input.name} · v1` } })
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
  const input = createDocumentMetadataSchema.pick({ issueDate: true, expiryDate: true }).parse(req.body)
  await assertDocumentExists(id)
  const storageKey = await storeDocumentFile(req.file)
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const lastVersion = await tx.documentVersion.findFirst({ where: { documentId: id }, orderBy: { version: 'desc' }, select: { version: true } })
      const version = (lastVersion?.version ?? 0) + 1
      await tx.documentVersion.create({ data: { documentId: id, version, originalName: req.file!.originalname, storageKey, mimeType: req.file!.mimetype, sizeBytes: req.file!.size, issueDate: new Date(input.issueDate), expiryDate: input.expiryDate ? new Date(input.expiryDate) : null } })
      await tx.document.update({ where: { id }, data: {} })
      await tx.auditLog.create({ data: { userId: ACTOR_USER_ID, action: 'Nueva versión de documento', entityId: String(id), detail: `Versión v${version} subida` } })
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
  const before = await assertDocumentExists(id)
  if (input.itemIds !== undefined) await assertDocumentItems(input.projectId ?? before.projectId, input.itemIds ?? [])
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
        type: input.type,
        projectId: input.projectId,
        items: input.itemIds === undefined ? undefined : {
          deleteMany: {},
          create: (input.itemIds ?? []).map((itemId) => ({ item: { connect: { id: itemId } } })),
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
    const previousItemIds = before.items.map((link) => link.item.id).sort((left, right) => left - right)
    const nextItemIds = (input.itemIds ?? previousItemIds).slice().sort((left, right) => left - right)
    const relationChanged = JSON.stringify(previousItemIds) !== JSON.stringify(nextItemIds)
    const action = relationChanged && versionMetadataChanged
      ? 'Documento y relación actualizados'
      : relationChanged
        ? 'Relación documento-ítem actualizada'
        : versionMetadataChanged
          ? 'Fechas de documento actualizadas'
          : 'Metadatos de documento actualizados'
    const detail = [
      relationChanged ? `Activos ${itemCodes(before)} → ${itemCodes(document)}` : null,
      versionMetadataChanged ? `Fechas de v${currentVersion?.version ?? 1} actualizadas` : null,
    ].filter(Boolean).join(' · ') || 'Nombre, tipo o proyecto actualizado'
    await tx.auditLog.create({ data: { userId: ACTOR_USER_ID, action, entityId: String(id), detail } })
    return tx.document.findUniqueOrThrow({ where: { id }, include: documentInclude })
  })
  res.json(serializeDocument(updated))
}))

router.get('/:id/download', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid id' })
  const version = await prisma.documentVersion.findFirst({ where: { documentId: id }, orderBy: { version: 'desc' } })
  if (!version) return res.status(404).json({ error: 'Document version not found' })
  const bytes = await readDocumentFile(version.storageKey)
  res.setHeader('Content-Type', version.mimeType)
  res.setHeader('Content-Length', String(bytes.length))
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(version.originalName)}`)
  res.send(bytes)
}))

router.get('/:id/versions/:version/download', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const versionNumber = parseId(req.params.version)
  if (!id || !versionNumber) return res.status(400).json({ error: 'Invalid id' })
  const version = await prisma.documentVersion.findUnique({ where: { documentId_version: { documentId: id, version: versionNumber } } })
  if (!version) return res.status(404).json({ error: 'Document version not found' })
  const bytes = await readDocumentFile(version.storageKey)
  res.setHeader('Content-Type', version.mimeType)
  res.setHeader('Content-Length', String(bytes.length))
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(version.originalName)}`)
  res.send(bytes)
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid id' })
  const document = await prisma.document.findUnique({ where: { id }, include: { versions: true } })
  if (!document) return res.status(404).json({ error: 'Not found' })
  await prisma.$transaction([
    prisma.document.delete({ where: { id } }),
    prisma.auditLog.create({ data: { userId: ACTOR_USER_ID, action: 'Documento eliminado', entityId: String(id), detail: document.name } }),
  ])
  await Promise.all(document.versions.map((version) => removeDocumentFile(version.storageKey)))
  res.status(204).end()
}))

export default router
