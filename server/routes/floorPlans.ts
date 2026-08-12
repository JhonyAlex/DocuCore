import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { ALLOWED_FLOOR_PLAN_MIME_TYPES, MAX_FLOOR_PLAN_SIZE_BYTES, readFloorPlanDzi, readFloorPlanOriginal, readFloorPlanTile, removeFloorPlanFiles, storeFloorPlan } from '../lib/floorPlanStorage'
import { createFloorPlanMarkerSchema, createFloorPlanSchema, floorPlanListQuerySchema, updateFloorPlanMarkerSchema, updateFloorPlanSchema } from '../lib/validate'
import { deriveAssetEventsExcludingAcknowledged } from '../lib/assetEvents'

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
  status: { select: { id: true, name: true, pulseDot: true } },
  events: { select: { id: true, title: true, date: true, type: true, completedAt: true } },
  documentAssets: { include: { document: { select: { id: true, name: true, eventTitle: true, type: true, versions: { orderBy: { version: 'desc' as const }, take: 1, select: { expiryDate: true } } } } } },
  dynamicFieldValues: { include: { definition: { select: { id: true, fieldName: true, fieldType: true, isActive: true } } } },
  dateSchedules: { where: { isActive: true }, include: { definition: { select: { fieldName: true } }, occurrences: { orderBy: { id: 'asc' as const }, select: { id: true, scheduledDate: true, completedAt: true } } } },
  preventivePlans: { where: { isActive: true }, include: { executions: { orderBy: { id: 'asc' as const }, include: { tasks: { select: { completedAt: true } } } } } },
  eventAcknowledgements: { select: { sourceKey: true } },
} satisfies Prisma.AssetSelect
type PlanAsset = Prisma.AssetGetPayload<{ select: typeof floorPlanAssetSelect }>

const planInclude = {
  location: { select: { id: true, name: true, label: true, code: true, parentId: true } },
  versions: { orderBy: { version: 'desc' as const }, take: 1 },
  markers: {
    orderBy: { id: 'asc' as const },
    include: {
      asset: {
        select: floorPlanAssetSelect,
      },
    },
  },
} satisfies Prisma.FloorPlanInclude
type PlanWithCurrent = Prisma.FloorPlanGetPayload<{ include: typeof planInclude }>

function httpError(status: number, message: string): Error & { status: number } { return Object.assign(new Error(message), { status }) }
function id(value: string): number | null { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null }
function versionOf(plan: PlanWithCurrent): number | null { return plan.versions[0]?.version ?? null }
function serializeVersion(version: { id: number; version: number; originalName: string; mimeType: string; sizeBytes: number; width: number; height: number; uploadedAt: Date }) { return { ...version, uploadedAt: version.uploadedAt.toISOString() } }
function serializeAsset(asset: PlanAsset) {
  const acknowledgements = asset.eventAcknowledgements.map((entry) => entry.sourceKey)
  const documents = asset.documentAssets.map((entry) => entry.document)
  const nextEvents = deriveAssetEventsExcludingAcknowledged({ ...asset, documents }, acknowledgements)
  return { id: asset.id, code: asset.code, name: asset.name, locationId: asset.locationId, type: asset.type, status: asset.status, nextEvents }
}
function serializePlan(plan: PlanWithCurrent, availableAssets: PlanAsset[] = []) {
  return {
    id: plan.id, name: plan.name, projectId: plan.projectId, locationId: plan.locationId, createdAt: plan.createdAt.toISOString(), updatedAt: plan.updatedAt.toISOString(), location: plan.location,
    currentVersion: plan.versions[0] ? serializeVersion(plan.versions[0]) : null,
    markers: plan.markers.map((marker) => ({ id: marker.id, floorPlanId: marker.floorPlanId, assetId: marker.assetId, x: marker.x, y: marker.y, createdAt: marker.createdAt.toISOString(), updatedAt: marker.updatedAt.toISOString(), asset: serializeAsset(marker.asset) })),
    availableAssets: availableAssets.map(serializeAsset),
  }
}

function uploadFile(req: Request, res: Response): Promise<void> { return new Promise((resolve, reject) => upload.single('file')(req, res, (error) => error ? reject(error) : resolve())) }

async function getPlan(planId: number): Promise<PlanWithCurrent> {
  const plan = await prisma.floorPlan.findUnique({ where: { id: planId }, include: planInclude })
  if (!plan) throw httpError(404, 'Floor plan not found')
  return plan
}

async function assetsForPlan(plan: PlanWithCurrent): Promise<PlanAsset[]> {
  const locations = await prisma.location.findMany({ where: { projectId: plan.projectId }, select: { id: true, parentId: true } })
  const children = new Map<number | null, number[]>()
  for (const location of locations) children.set(location.parentId, [...(children.get(location.parentId) ?? []), location.id])
  const ids: number[] = []; const stack = [plan.locationId]
  while (stack.length) { const current = stack.pop() as number; ids.push(current); stack.push(...(children.get(current) ?? [])) }
  return prisma.asset.findMany({ where: { projectId: plan.projectId, locationId: { in: ids }, deletedAt: null }, select: floorPlanAssetSelect, orderBy: { code: 'asc' } })
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
  const visited = new Set<number>()
  let locationId: number | null = asset.locationId
  while (locationId !== null && !visited.has(locationId)) {
    if (locationId === planLocationId) return
    visited.add(locationId)
    const location: { parentId: number | null } | null = await prisma.location.findUnique({ where: { id: locationId }, select: { parentId: true } })
    locationId = location?.parentId ?? null
  }
  throw httpError(400, 'Asset location must be the floor plan location or a descendant')
}

async function assertMoveAllowed(plan: PlanWithCurrent, projectId: number, locationId: number): Promise<void> {
  await assertLocation(projectId, locationId)
  await Promise.all(plan.markers.map((marker) => assertAssetPlacement(projectId, locationId, marker.assetId)))
}

router.get('/', asyncHandler(async (req, res) => {
  const query = floorPlanListQuerySchema.parse(req.query)
  const plans = await prisma.floorPlan.findMany({ where: { projectId: query.projectId, locationId: query.locationId }, include: planInclude, orderBy: [{ locationId: 'asc' }, { name: 'asc' }] })
  res.json({ data: plans.map((plan) => serializePlan(plan)) })
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
      await tx.auditLog.create({ data: { userId: ACTOR_USER_ID, action: 'Plano creado', entityId: String(created.id), detail: `${input.name} · v1` } })
      return tx.floorPlan.findUniqueOrThrow({ where: { id: created.id }, include: planInclude })
    })
    res.status(201).json(serializePlan(plan))
  } catch (error) { await removeFloorPlanFiles(stored); throw error }
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const planId = id(req.params.id); if (!planId) return res.status(400).json({ error: 'Invalid id' })
  const input = updateFloorPlanSchema.parse(req.body); const plan = await getPlan(planId)
  const projectId = input.projectId ?? plan.projectId; const locationId = input.locationId ?? plan.locationId
  await assertMoveAllowed(plan, projectId, locationId)
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.floorPlan.update({ where: { id: planId }, data: { name: input.name, projectId, locationId }, include: planInclude })
    await tx.auditLog.create({ data: { userId: ACTOR_USER_ID, action: 'Plano actualizado', entityId: String(planId), detail: `Plano ${plan.name} actualizado` } })
    return next
  })
  res.json(serializePlan(updated))
}))

router.post('/:id/versions', asyncHandler(async (req, res) => {
  const planId = id(req.params.id); if (!planId) return res.status(400).json({ error: 'Invalid id' })
  await uploadFile(req, res); if (!req.file) return res.status(400).json({ error: 'A floor plan image file is required' })
  const plan = await getPlan(planId); const stored = await storeFloorPlan(req.file)
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const nextVersion = (versionOf(plan) ?? 0) + 1
      await tx.floorPlanVersion.create({ data: { floorPlanId: planId, version: nextVersion, originalName: req.file!.originalname, mimeType: req.file!.mimetype, sizeBytes: req.file!.size, ...stored } })
      await tx.auditLog.create({ data: { userId: ACTOR_USER_ID, action: 'Nueva versión de plano', entityId: String(planId), detail: `${plan.name} · v${nextVersion}` } })
      return tx.floorPlan.findUniqueOrThrow({ where: { id: planId }, include: planInclude })
    })
    res.status(201).json(serializePlan(updated))
  } catch (error) { await removeFloorPlanFiles(stored); throw error }
}))

router.post('/:id/markers', asyncHandler(async (req, res) => {
  const planId = id(req.params.id); if (!planId) return res.status(400).json({ error: 'Invalid id' })
  const input = createFloorPlanMarkerSchema.parse(req.body); const plan = await getPlan(planId)
  await assertAssetPlacement(plan.projectId, plan.locationId, input.assetId)
  const marker = await prisma.$transaction(async (tx) => {
    const created = await tx.floorPlanMarker.create({ data: { floorPlanId: planId, ...input }, include: { asset: { select: floorPlanAssetSelect } } })
    await tx.auditLog.create({ data: { userId: ACTOR_USER_ID, action: 'Activo colocado en plano', entityId: String(input.assetId), detail: `${plan.name} · (${input.x.toFixed(3)}, ${input.y.toFixed(3)})` } })
    return created
  })
  res.status(201).json({ id: marker.id, floorPlanId: marker.floorPlanId, assetId: marker.assetId, x: marker.x, y: marker.y, createdAt: marker.createdAt.toISOString(), updatedAt: marker.updatedAt.toISOString(), asset: serializeAsset(marker.asset) })
}))

router.patch('/:id/markers/:markerId', asyncHandler(async (req, res) => {
  const planId = id(req.params.id); const markerId = id(req.params.markerId); if (!planId || !markerId) return res.status(400).json({ error: 'Invalid id' })
  const input = updateFloorPlanMarkerSchema.parse(req.body)
  const marker = await prisma.floorPlanMarker.findFirst({ where: { id: markerId, floorPlanId: planId }, include: { asset: { select: floorPlanAssetSelect } } })
  if (!marker) return res.status(404).json({ error: 'Floor plan marker not found' })
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.floorPlanMarker.update({ where: { id: markerId }, data: input, include: { asset: { select: floorPlanAssetSelect } } })
    await tx.auditLog.create({ data: { userId: ACTOR_USER_ID, action: 'Marcador movido', entityId: String(marker.assetId), detail: `Plano #${planId} · (${next.x.toFixed(3)}, ${next.y.toFixed(3)})` } })
    return next
  })
  res.json({ id: updated.id, floorPlanId: updated.floorPlanId, assetId: updated.assetId, x: updated.x, y: updated.y, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString(), asset: serializeAsset(updated.asset) })
}))

router.delete('/:id/markers/:markerId', asyncHandler(async (req, res) => {
  const planId = id(req.params.id); const markerId = id(req.params.markerId); if (!planId || !markerId) return res.status(400).json({ error: 'Invalid id' })
  const marker = await prisma.floorPlanMarker.findFirst({ where: { id: markerId, floorPlanId: planId }, include: { asset: { select: { code: true } } } })
  if (!marker) return res.status(404).json({ error: 'Floor plan marker not found' })
  await prisma.$transaction([prisma.floorPlanMarker.delete({ where: { id: markerId } }), prisma.auditLog.create({ data: { userId: ACTOR_USER_ID, action: 'Activo retirado del plano', entityId: marker.asset.code, detail: `Plano #${planId}` } })])
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

router.get('/:id', asyncHandler(async (req, res) => { const planId = id(req.params.id); if (!planId) return res.status(400).json({ error: 'Invalid id' }); const plan = await getPlan(planId); res.json(serializePlan(plan, await assetsForPlan(plan))) }))

router.delete('/:id', asyncHandler(async (req, res) => {
  const planId = id(req.params.id); if (!planId) return res.status(400).json({ error: 'Invalid id' }); const plan = await getPlan(planId)
  const versions = await prisma.floorPlanVersion.findMany({ where: { floorPlanId: planId }, select: { storageKey: true, dziKey: true } })
  await prisma.$transaction([prisma.floorPlan.delete({ where: { id: planId } }), prisma.auditLog.create({ data: { userId: ACTOR_USER_ID, action: 'Plano eliminado', entityId: String(planId), detail: plan.name } })])
  await Promise.all(versions.map(removeFloorPlanFiles)); res.status(204).end()
}))

export default router
