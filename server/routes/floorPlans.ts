import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { ALLOWED_FLOOR_PLAN_MIME_TYPES, MAX_FLOOR_PLAN_SIZE_BYTES, readFloorPlanDzi, readFloorPlanOriginal, readFloorPlanTile, removeFloorPlanFiles, storeFloorPlan } from '../lib/floorPlanStorage'
import { createFloorPlanMarkerSchema, createFloorPlanSchema, floorPlanListQuerySchema, updateFloorPlanMarkerSchema, updateFloorPlanSchema } from '../lib/validate'
import { isLocationDescendantOf } from '../lib/locationTree'
import { MAX_AUTOCOMPLETE_SIZE, MAX_MARKER_PAGE_SIZE, pageLimit } from '../lib/performance'
import { nextAssetEventsById } from '../lib/nextAssetEvents'
import type { DerivedAssetEvent } from '../lib/assetEvents'

const router: Router = Router()
const ACTOR_USER_ID = 1
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FLOOR_PLAN_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_FLOOR_PLAN_MIME_TYPES.has(file.mimetype)) return callback(new Error('Unsupported floor plan type'))
    callback(null, true)
  },
})

const floorPlanAssetSelect = {
  id: true, code: true, name: true, locationId: true,
  type: { select: { id: true, name: true, iconKey: true } },
  status: { select: { id: true, name: true, color: true, pulseDot: true } },
} satisfies Prisma.AssetSelect
type PlanAsset = Prisma.AssetGetPayload<{ select: typeof floorPlanAssetSelect }>

const planInclude = {
  location: { select: { id: true, name: true, label: true, code: true, parentId: true } },
  versions: { orderBy: { version: 'desc' as const }, take: 1 },
  markers: {
    orderBy: { id: 'asc' as const },
    take: MAX_MARKER_PAGE_SIZE,
    include: {
      asset: {
        select: floorPlanAssetSelect,
      },
    },
  },
} satisfies Prisma.FloorPlanInclude
type PlanWithCurrent = Prisma.FloorPlanGetPayload<{ include: typeof planInclude }>

// The plan selector is intentionally distinct from the editor selector: the
// left-hand plan list never needs to deserialize a marker collection.
const planListInclude = {
  location: { select: { id: true, name: true, label: true, code: true, parentId: true } },
  versions: { orderBy: { version: 'desc' as const }, take: 1 },
} satisfies Prisma.FloorPlanInclude
type PlanListItem = Prisma.FloorPlanGetPayload<{ include: typeof planListInclude }>

function httpError(status: number, message: string): Error & { status: number } { return Object.assign(new Error(message), { status }) }
function id(value: string): number | null { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null }
function versionOf(plan: PlanWithCurrent): number | null { return plan.versions[0]?.version ?? null }
function serializeVersion(version: { id: number; version: number; originalName: string; mimeType: string; sizeBytes: number; width: number; height: number; uploadedAt: Date }) { return { ...version, uploadedAt: version.uploadedAt.toISOString() } }
function serializeAsset(asset: PlanAsset, nextEvent?: DerivedAssetEvent) {
  const alert = nextEvent?.urgency === 'red' ? 'overdue' : nextEvent?.urgency === 'amber' ? 'soon' : 'normal'
  return { id: asset.id, code: asset.code, name: asset.name, locationId: asset.locationId, type: asset.type, status: asset.status, alert, nextEvents: nextEvent ? [nextEvent] : [] }
}
async function serializeAssets(assets: PlanAsset[]) {
  const events = await nextAssetEventsById(prisma, assets.map((asset) => asset.id))
  return assets.map((asset) => serializeAsset(asset, events.get(asset.id)))
}
async function serializeMarker(marker: PlanWithCurrent['markers'][number], events?: Map<number, DerivedAssetEvent>) {
  return { id: marker.id, floorPlanId: marker.floorPlanId, assetId: marker.assetId, x: marker.x, y: marker.y, createdAt: marker.createdAt.toISOString(), updatedAt: marker.updatedAt.toISOString(), asset: serializeAsset(marker.asset, events?.get(marker.assetId)) }
}
async function serializePlan(plan: PlanWithCurrent, markerTotal = plan.markers.length) {
  const events = await nextAssetEventsById(prisma, plan.markers.map((marker) => marker.assetId))
  return {
    id: plan.id, name: plan.name, projectId: plan.projectId, locationId: plan.locationId, createdAt: plan.createdAt.toISOString(), updatedAt: plan.updatedAt.toISOString(), location: plan.location,
    currentVersion: plan.versions[0] ? serializeVersion(plan.versions[0]) : null,
    markers: await Promise.all(plan.markers.map((marker) => serializeMarker(marker, events))),
    markerTotal,
    markersTruncated: markerTotal > plan.markers.length,
  }
}
function serializePlanList(plan: PlanListItem) {
  return {
    id: plan.id, name: plan.name, projectId: plan.projectId, locationId: plan.locationId, createdAt: plan.createdAt.toISOString(), updatedAt: plan.updatedAt.toISOString(), location: plan.location,
    currentVersion: plan.versions[0] ? serializeVersion(plan.versions[0]) : null,
    markers: [],
  }
}

function uploadFile(req: Request, res: Response): Promise<void> { return new Promise((resolve, reject) => upload.single('file')(req, res, (error) => error ? reject(error) : resolve())) }

async function getPlan(planId: number): Promise<PlanWithCurrent> {
  const plan = await prisma.floorPlan.findUnique({ where: { id: planId }, include: planInclude })
  if (!plan) throw httpError(404, 'Floor plan not found')
  return plan
}

async function assertLocation(projectId: number, locationId: number): Promise<void> {
  const location = await prisma.location.findUnique({ where: { id: locationId }, select: { projectId: true } })
  if (!location) throw httpError(404, 'Location not found')
  if (location.projectId !== projectId) throw httpError(400, 'Floor plan location must belong to the project')
}

async function assertAssetPlacement(projectId: number, planLocationId: number, assetId: number): Promise<void> {
  const asset = await prisma.asset.findFirst({ where: { id: assetId, deletedAt: null }, select: { projectId: true, locationId: true } })
  if (!asset) throw httpError(404, 'Asset not found')
  if (asset.projectId !== projectId) throw httpError(400, 'Asset must belong to the floor plan project')
  if (await isLocationDescendantOf(prisma, asset.locationId, planLocationId)) return
  throw httpError(400, 'Asset location must be the floor plan location or a descendant')
}

async function assertMoveAllowed(plan: PlanWithCurrent, projectId: number, locationId: number): Promise<void> {
  await assertLocation(projectId, locationId)
  // This is a write-time integrity guard, not a list DTO. It checks every
  // marker in one SQL statement, including markers beyond the editor's first
  // page, so moving a large plan cannot silently invalidate hidden markers.
  const invalid = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    WITH RECURSIVE subtree AS (
      SELECT id FROM "Location" WHERE id = ${locationId}
      UNION ALL
      SELECT child.id FROM "Location" child JOIN subtree ON child."parentId" = subtree.id
    )
    SELECT COUNT(*)::bigint AS count
    FROM "FloorPlanMarker" marker
    JOIN "Asset" asset ON asset.id = marker."assetId"
    WHERE marker."floorPlanId" = ${plan.id}
      AND (asset."projectId" <> ${projectId} OR asset."deletedAt" IS NOT NULL OR NOT EXISTS (SELECT 1 FROM subtree WHERE subtree.id = asset."locationId"))
  `)
  if (Number(invalid[0]?.count ?? 0) > 0) throw httpError(400, 'All marker assets must belong to the floor plan location or a descendant')
}

router.get('/', asyncHandler(async (req, res) => {
  const query = floorPlanListQuerySchema.parse(req.query)
  const where = { projectId: query.projectId, locationId: query.locationId }
  const [plans, total] = await prisma.$transaction([
    prisma.floorPlan.findMany({ where, include: planListInclude, orderBy: [{ locationId: 'asc' }, { name: 'asc' }], take: query.limit }),
    prisma.floorPlan.count({ where }),
  ])
  res.json({ data: plans.map(serializePlanList), total, truncated: total > plans.length })
}))

router.get('/:id/assets', asyncHandler(async (req, res) => {
  const planId = id(req.params.id); if (!planId) return res.status(400).json({ error: 'Invalid id' })
  const plan = await getPlan(planId)
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
  const limit = pageLimit(req.query.limit, MAX_AUTOCOMPLETE_SIZE, MAX_AUTOCOMPLETE_SIZE)
  const ids = await prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    WITH RECURSIVE subtree AS (
      SELECT id FROM "Location" WHERE id = ${plan.locationId}
      UNION ALL
      SELECT child.id FROM "Location" child JOIN subtree ON child."parentId" = subtree.id
    )
    SELECT asset.id
    FROM "Asset" asset
    WHERE asset."projectId" = ${plan.projectId}
      AND asset."deletedAt" IS NULL
      AND EXISTS (SELECT 1 FROM subtree WHERE subtree.id = asset."locationId")
      ${search ? Prisma.sql`AND (asset.code ILIKE ${`%${search}%`} OR asset.name ILIKE ${`%${search}%`})` : Prisma.empty}
    ORDER BY asset.code ASC, asset.id ASC
    LIMIT ${limit}
  `)
  const orderedIds = ids.map((row) => row.id)
  const rows = orderedIds.length === 0 ? [] : await prisma.asset.findMany({ where: { id: { in: orderedIds } }, select: floorPlanAssetSelect })
  const byId = new Map(rows.map((asset) => [asset.id, asset]))
  const assets = orderedIds.flatMap((assetId) => {
    const asset = byId.get(assetId)
    return asset ? [asset] : []
  })
  res.json({ data: await serializeAssets(assets) })
}))

// The layer panel needs counts for every eligible asset type, not every asset.
// This aggregate stays in PostgreSQL and remains constant-size with a large
// location subtree.
router.get('/:id/facets', asyncHandler(async (req, res) => {
  const planId = id(req.params.id); if (!planId) return res.status(400).json({ error: 'Invalid id' })
  const plan = await prisma.floorPlan.findUnique({ where: { id: planId }, select: { projectId: true, locationId: true } })
  if (!plan) return res.status(404).json({ error: 'Floor plan not found' })
  const types = await prisma.$queryRaw<Array<{ typeId: number; name: string; iconKey: string; count: bigint }>>(Prisma.sql`
    WITH RECURSIVE subtree AS (
      SELECT id FROM "Location" WHERE id = ${plan.locationId}
      UNION ALL
      SELECT child.id FROM "Location" child JOIN subtree ON child."parentId" = subtree.id
    )
    SELECT type.id AS "typeId", type.name, type."iconKey", COUNT(*)::bigint AS count
    FROM "Asset" asset
    JOIN "AssetType" type ON type.id = asset."typeId"
    WHERE asset."projectId" = ${plan.projectId}
      AND asset."deletedAt" IS NULL
      AND EXISTS (SELECT 1 FROM subtree WHERE subtree.id = asset."locationId")
    GROUP BY type.id, type.name, type."iconKey"
    ORDER BY type.name ASC, type.id ASC
  `)
  res.json({ types: types.map((type) => ({ ...type, count: Number(type.count) })) })
}))

// The editor receives the first chunk with the plan. Larger plans can append
// marker chunks explicitly without making the opening request proportional to
// every marker ever placed on the floor.
router.get('/:id/markers', asyncHandler(async (req, res) => {
  const planId = id(req.params.id); if (!planId) return res.status(400).json({ error: 'Invalid id' })
  const page = pageLimit(req.query.page, 1, 1_000_000)
  const limit = pageLimit(req.query.limit, MAX_MARKER_PAGE_SIZE, MAX_MARKER_PAGE_SIZE)
  const plan = await prisma.floorPlan.findUnique({ where: { id: planId }, select: { id: true } })
  if (!plan) return res.status(404).json({ error: 'Floor plan not found' })
  const [markers, total] = await prisma.$transaction([
    prisma.floorPlanMarker.findMany({ where: { floorPlanId: planId }, orderBy: { id: 'asc' }, skip: (page - 1) * limit, take: limit, include: { asset: { select: floorPlanAssetSelect } } }),
    prisma.floorPlanMarker.count({ where: { floorPlanId: planId } }),
  ])
  const events = await nextAssetEventsById(prisma, markers.map((marker) => marker.assetId))
  res.json({ data: await Promise.all(markers.map((marker) => serializeMarker(marker as PlanWithCurrent['markers'][number], events))), total, page, totalPages: Math.max(1, Math.ceil(total / limit)) })
}))

router.post('/', asyncHandler(async (req, res) => {
  await uploadFile(req, res)
  if (!req.file) return res.status(400).json({ error: 'A floor plan image file is required' })
  const input = createFloorPlanSchema.parse(req.body)
  await assertLocation(input.projectId, input.locationId)
  const stored = await storeFloorPlan(req.file)
  try {
    const plan = await prisma.$transaction(async (tx) => {
      const created = await tx.floorPlan.create({ data: { name: input.name, projectId: input.projectId, locationId: input.locationId } })
      await tx.floorPlanVersion.create({ data: { floorPlanId: created.id, version: 1, originalName: req.file!.originalname, mimeType: req.file!.mimetype, sizeBytes: req.file!.size, ...stored } })
      await tx.auditLog.create({ data: { projectId: input.projectId, userId: ACTOR_USER_ID, action: 'Plano creado', entityId: String(created.id), detail: `${input.name} · v1` } })
      return tx.floorPlan.findUniqueOrThrow({ where: { id: created.id }, include: planInclude })
    })
    res.status(201).json(await serializePlan(plan))
  } catch (error) { await removeFloorPlanFiles(stored); throw error }
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const planId = id(req.params.id); if (!planId) return res.status(400).json({ error: 'Invalid id' })
  const input = updateFloorPlanSchema.parse(req.body); const plan = await getPlan(planId)
  const projectId = input.projectId ?? plan.projectId; const locationId = input.locationId ?? plan.locationId
  await assertMoveAllowed(plan, projectId, locationId)
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.floorPlan.update({ where: { id: planId }, data: { name: input.name, projectId, locationId }, include: planInclude })
    await tx.auditLog.create({ data: { projectId, userId: ACTOR_USER_ID, action: 'Plano actualizado', entityId: String(planId), detail: `Plano ${plan.name} actualizado` } })
    return next
  })
  res.json(await serializePlan(updated))
}))

router.post('/:id/versions', asyncHandler(async (req, res) => {
  const planId = id(req.params.id); if (!planId) return res.status(400).json({ error: 'Invalid id' })
  await uploadFile(req, res); if (!req.file) return res.status(400).json({ error: 'A floor plan image file is required' })
  const plan = await getPlan(planId); const stored = await storeFloorPlan(req.file)
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const nextVersion = (versionOf(plan) ?? 0) + 1
      await tx.floorPlanVersion.create({ data: { floorPlanId: planId, version: nextVersion, originalName: req.file!.originalname, mimeType: req.file!.mimetype, sizeBytes: req.file!.size, ...stored } })
      await tx.auditLog.create({ data: { projectId: plan.projectId, userId: ACTOR_USER_ID, action: 'Nueva versión de plano', entityId: String(planId), detail: `${plan.name} · v${nextVersion}` } })
      return tx.floorPlan.findUniqueOrThrow({ where: { id: planId }, include: planInclude })
    })
    res.status(201).json(await serializePlan(updated))
  } catch (error) { await removeFloorPlanFiles(stored); throw error }
}))

router.post('/:id/markers', asyncHandler(async (req, res) => {
  const planId = id(req.params.id); if (!planId) return res.status(400).json({ error: 'Invalid id' })
  const input = createFloorPlanMarkerSchema.parse(req.body); const plan = await getPlan(planId)
  await assertAssetPlacement(plan.projectId, plan.locationId, input.assetId)
  const marker = await prisma.$transaction(async (tx) => {
    const created = await tx.floorPlanMarker.create({ data: { floorPlanId: planId, ...input }, include: { asset: { select: floorPlanAssetSelect } } })
    await tx.auditLog.create({ data: { projectId: plan.projectId, userId: ACTOR_USER_ID, action: 'Activo colocado en plano', entityId: String(input.assetId), detail: `${plan.name} · (${input.x.toFixed(3)}, ${input.y.toFixed(3)})` } })
    return created
  })
  res.status(201).json(await serializeMarker(marker as PlanWithCurrent['markers'][number]))
}))

router.patch('/:id/markers/:markerId', asyncHandler(async (req, res) => {
  const planId = id(req.params.id); const markerId = id(req.params.markerId); if (!planId || !markerId) return res.status(400).json({ error: 'Invalid id' })
  const input = updateFloorPlanMarkerSchema.parse(req.body)
  const marker = await prisma.floorPlanMarker.findFirst({ where: { id: markerId, floorPlanId: planId }, include: { asset: { select: floorPlanAssetSelect }, floorPlan: { select: { projectId: true } } } })
  if (!marker) return res.status(404).json({ error: 'Floor plan marker not found' })
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.floorPlanMarker.update({ where: { id: markerId }, data: input, include: { asset: { select: floorPlanAssetSelect } } })
    await tx.auditLog.create({ data: { projectId: marker.floorPlan.projectId, userId: ACTOR_USER_ID, action: 'Marcador movido', entityId: String(marker.assetId), detail: `Plano #${planId} · (${next.x.toFixed(3)}, ${next.y.toFixed(3)})` } })
    return next
  })
  res.json(await serializeMarker(updated as PlanWithCurrent['markers'][number]))
}))

router.delete('/:id/markers/:markerId', asyncHandler(async (req, res) => {
  const planId = id(req.params.id); const markerId = id(req.params.markerId); if (!planId || !markerId) return res.status(400).json({ error: 'Invalid id' })
  const plan = await getPlan(planId)
  const marker = await prisma.floorPlanMarker.findFirst({ where: { id: markerId, floorPlanId: planId }, include: { asset: { select: { code: true } } } })
  if (!marker) return res.status(404).json({ error: 'Floor plan marker not found' })
  await prisma.$transaction([prisma.floorPlanMarker.delete({ where: { id: markerId } }), prisma.auditLog.create({ data: { projectId: plan.projectId, userId: ACTOR_USER_ID, action: 'Activo retirado del plano', entityId: marker.asset.code, detail: `Plano #${planId}` } })])
  res.status(204).end()
}))

router.get('/:id/current', asyncHandler(async (req, res) => {
  const planId = id(req.params.id); if (!planId) return res.status(400).json({ error: 'Invalid id' }); const plan = await getPlan(planId)
  if (!plan.versions[0]) return res.status(404).json({ error: 'Floor plan version not found' })
  res.json(serializeVersion(plan.versions[0]))
}))

router.get('/:id/current/image', asyncHandler(async (req, res) => {
  const planId = id(req.params.id); if (!planId) return res.status(400).json({ error: 'Invalid id' }); const plan = await getPlan(planId); const version = plan.versions[0]
  if (!version) return res.status(404).json({ error: 'Floor plan version not found' })
  const bytes = await readFloorPlanOriginal(version.storageKey); res.set({ 'Content-Type': version.mimeType, 'Content-Length': String(bytes.length), 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(version.originalName)}`, 'Cache-Control': 'private, max-age=3600' }).send(bytes)
}))

router.get('/:id/versions/:version/dzi', asyncHandler(async (req, res) => {
  const planId = id(req.params.id); const versionNumber = id(req.params.version); if (!planId || !versionNumber) return res.status(400).json({ error: 'Invalid id' })
  const version = await prisma.floorPlanVersion.findUnique({ where: { floorPlanId_version: { floorPlanId: planId, version: versionNumber } } }); if (!version) return res.status(404).json({ error: 'Floor plan version not found' })
  const dzi = await readFloorPlanDzi(version.dziKey); const url = `/api/floor-plans/${planId}/versions/${versionNumber}/tiles/`
  const withTileUrl = /Url="[^"]*"/.test(dzi) ? dzi.replace(/Url="[^"]*"/, `Url="${url}"`) : dzi.replace('<Image ', `<Image Url="${url}" `)
  res.set('Cache-Control', 'private, max-age=3600').type('application/xml').send(withTileUrl)
}))

router.get('/:id/versions/:version/tiles/:level/:tile', asyncHandler(async (req, res) => {
  const planId = id(req.params.id); const versionNumber = id(req.params.version); if (!planId || !versionNumber) return res.status(400).json({ error: 'Invalid id' })
  const version = await prisma.floorPlanVersion.findUnique({ where: { floorPlanId_version: { floorPlanId: planId, version: versionNumber } } }); if (!version) return res.status(404).json({ error: 'Floor plan version not found' })
  const bytes = await readFloorPlanTile(version.dziKey, req.params.level, req.params.tile); const extension = req.params.tile.split('.').pop()?.toLowerCase(); res.set('Cache-Control', 'private, max-age=3600').type(extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg').send(bytes)
}))

router.get('/:id', asyncHandler(async (req, res) => {
  const planId = id(req.params.id); if (!planId) return res.status(400).json({ error: 'Invalid id' })
  const [plan, markerTotal] = await Promise.all([getPlan(planId), prisma.floorPlanMarker.count({ where: { floorPlanId: planId } })])
  res.json(await serializePlan(plan, markerTotal))
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  const planId = id(req.params.id); if (!planId) return res.status(400).json({ error: 'Invalid id' }); const plan = await getPlan(planId)
  const versions = await prisma.floorPlanVersion.findMany({ where: { floorPlanId: planId }, select: { storageKey: true, dziKey: true } })
  await prisma.$transaction([prisma.floorPlan.delete({ where: { id: planId } }), prisma.auditLog.create({ data: { projectId: plan.projectId, userId: ACTOR_USER_ID, action: 'Plano eliminado', entityId: String(planId), detail: plan.name } })])
  await Promise.all(versions.map(removeFloorPlanFiles)); res.status(204).end()
}))

export default router
