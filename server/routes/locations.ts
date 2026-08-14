import { Router } from 'express'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { createLocationSchema, updateLocationSchema } from '../lib/validate'
import { descendantLocationIds } from '../lib/locationTree'
import { LOCATION_PREVIEW_SIZE, pageLimit } from '../lib/performance'

const router: Router = Router()

const ACTOR_USER_ID = 1
const CURRENT_PROJECT_CODE = 'PRJ-2026-001'
const BOOTSTRAP_BRANCH_SIZE = 100
const BOOTSTRAP_DEPTH = 12

const locationInclude = {
  responsible: { select: { id: true, name: true, initials: true, color: true } },
  floorPlans: { select: { id: true } },
  // ITEM-05: el árbol cuenta solo activos vivos, igual que el detalle.
  _count: { select: { assets: { where: { deletedAt: null } }, children: true } },
} satisfies Prisma.LocationInclude

type LocationWithRelations = Prisma.LocationGetPayload<{ include: typeof locationInclude }>

function serializeLocation(location: LocationWithRelations) {
  const { responsible, floorPlans, _count, ...base } = location
  return {
    ...base,
    createdAt: location.createdAt.toISOString(),
    updatedAt: location.updatedAt.toISOString(),
    responsible,
    hasFloorPlan: floorPlans.length > 0,
    assetCount: _count.assets,
    childCount: _count.children,
  }
}

// Una ubicación no puede colgar de sí misma ni de uno de sus descendientes.
async function assertNoCycle(id: number, parentId: number | null): Promise<void> {
  let cursor = parentId
  const seen = new Set<number>([id])
  while (cursor !== null) {
    if (seen.has(cursor)) {
      const err = new Error('Location hierarchy would create a cycle')
      ;(err as Error & { status?: number }).status = 400
      throw err
    }
    seen.add(cursor)
    const next = await prisma.location.findUnique({ where: { id: cursor }, select: { parentId: true } })
    cursor = next?.parentId ?? null
  }
}

// Padre, ubicación y responsable deben pertenecer al mismo proyecto.
async function assertSameProject(id: number | null, projectId: number, responsibleId: number): Promise<void> {
  const invalid = new Error('Location, parent and responsible must belong to the same project')
  ;(invalid as Error & { status?: number }).status = 400
  if (id !== null) {
    const self = await prisma.location.findUnique({ where: { id }, select: { projectId: true } })
    if (!self || self.projectId !== projectId) throw invalid
  }
  const responsible = await prisma.user.findUnique({
    where: { id: responsibleId },
    select: { memberships: { where: { projectId }, select: { id: true } } },
  })
  if (!responsible || responsible.memberships.length === 0) throw invalid
}

function toNumberId(value: string | undefined): number | null {
  if (value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findUniqueOrThrow({
      where: { code: CURRENT_PROJECT_CODE },
      select: { id: true, code: true, name: true, assetCount: true },
    })
    const hasParentQuery = typeof req.query.parentId === 'string'
    const parentId = req.query.parentId === 'root' ? null : hasParentQuery ? toNumberId(req.query.parentId as string) : undefined
    if (hasParentQuery && parentId === null && req.query.parentId !== 'root') return res.status(400).json({ error: 'Invalid parentId' })
    const limit = pageLimit(req.query.limit, 100, 100)
    const locations = await prisma.location.findMany({
      where: { projectId: project.id, parentId: hasParentQuery ? parentId : undefined },
      include: locationInclude,
      orderBy: { id: 'asc' },
      // Compatibility callers without `parentId` receive a bounded catalogue;
      // hierarchy screens use parentId=root/ID to load branches on demand.
      take: limit,
    })
    res.json({ project, locations: locations.map(serializeLocation) })
  }),
)

// Initial navigation is a small, visual-equivalent slice: project roots plus
// siblings along the first actionable leaf. It avoids both an eager tree and
// a client-side walk over every location merely to open the initial branch.
router.get('/bootstrap', asyncHandler(async (req, res) => {
  const requestedProjectId = typeof req.query.projectId === 'string' ? Number(req.query.projectId) : null
  const project = Number.isInteger(requestedProjectId) && requestedProjectId! > 0
    ? await prisma.project.findUniqueOrThrow({ where: { id: requestedProjectId! }, select: { id: true, code: true, name: true, assetCount: true } })
    : await prisma.project.findUniqueOrThrow({ where: { code: CURRENT_PROJECT_CODE }, select: { id: true, code: true, name: true, assetCount: true } })
  const rows = await prisma.$queryRaw<Array<{ id: number; selectedId: number | null; openId: number | null }>>(Prisma.sql`
    WITH RECURSIVE target AS (
      SELECT location.id, location."parentId"
      FROM "Location" location
      WHERE location."projectId" = ${project.id}
      ORDER BY
        CASE WHEN EXISTS (SELECT 1 FROM "Asset" asset WHERE asset."locationId" = location.id AND asset."deletedAt" IS NULL) THEN 0 ELSE 1 END,
        CASE WHEN EXISTS (SELECT 1 FROM "Location" child WHERE child."parentId" = location.id) THEN 1 ELSE 0 END,
        location.id ASC
      LIMIT 1
    ),
    path AS (
      SELECT target.id, target."parentId", 0 AS depth FROM target
      UNION ALL
      SELECT parent.id, parent."parentId", path.depth + 1
      FROM "Location" parent
      JOIN path ON path."parentId" = parent.id
      WHERE path.depth < ${BOOTSTRAP_DEPTH}
    ),
    requested AS (
      SELECT location.id, location."parentId",
        ROW_NUMBER() OVER (PARTITION BY location."parentId" ORDER BY location.id ASC) AS position
      FROM "Location" location
      WHERE location."projectId" = ${project.id}
        AND (location."parentId" IS NULL OR location."parentId" IN (SELECT id FROM path))
    )
    SELECT requested.id,
      (SELECT id FROM target LIMIT 1) AS "selectedId",
      CASE WHEN requested.id IN (SELECT id FROM path WHERE depth > 0) THEN requested.id ELSE NULL END AS "openId"
    FROM requested
    WHERE requested."parentId" IS NULL OR requested.position <= ${BOOTSTRAP_BRANCH_SIZE}
    ORDER BY requested."parentId" NULLS FIRST, requested.id ASC
  `)
  const orderedIds = rows.map((row) => row.id)
  const locations = orderedIds.length === 0 ? [] : await prisma.location.findMany({ where: { id: { in: orderedIds } }, include: locationInclude })
  const byId = new Map(locations.map((location) => [location.id, serializeLocation(location)]))
  res.json({
    project,
    locations: orderedIds.flatMap((id) => {
      const location = byId.get(id)
      return location ? [location] : []
    }),
    selectedId: rows[0]?.selectedId ?? null,
    openBranchIds: [...new Set(rows.flatMap((row) => row.openId === null ? [] : [row.openId]))],
  })
}))

// Remote catalogue for selectors. It is intentionally separate from the
// progressive tree endpoint so forms never need a complete location list.
router.get('/search', asyncHandler(async (req, res) => {
  const requestedProjectId = typeof req.query.projectId === 'string' ? Number(req.query.projectId) : null
  const project = Number.isInteger(requestedProjectId) && requestedProjectId! > 0
    ? await prisma.project.findUniqueOrThrow({ where: { id: requestedProjectId! }, select: { id: true } })
    : await prisma.project.findUniqueOrThrow({ where: { code: CURRENT_PROJECT_CODE }, select: { id: true } })
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
  const locations = await prisma.location.findMany({
    where: {
      projectId: project.id,
      ...(search ? { OR: [
        { label: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ] } : {}),
    },
    include: locationInclude,
    orderBy: [{ label: 'asc' }, { id: 'asc' }],
    take: pageLimit(req.query.limit, 20, 50),
  })
  res.json({ data: locations.map(serializeLocation) })
}))

const locationAssetSelect = {
  id: true, code: true, name: true, installDate: true, initials: true,
  type: { select: { id: true, name: true, iconKey: true } },
  status: { select: { id: true, name: true, color: true, pulseDot: true } },
} satisfies Prisma.AssetSelect

function serializeLocationAsset(asset: Prisma.AssetGetPayload<{ select: typeof locationAssetSelect }>) {
  return { ...asset, installDate: asset.installDate.toISOString() }
}

// Detail is deliberately a preview. A separate endpoint is the only way to
// request the complete, paged location inventory.
router.get('/:id/assets', asyncHandler(async (req, res) => {
  const id = toNumberId(req.params.id)
  if (id === null) return res.status(400).json({ error: 'Invalid id' })
  const page = pageLimit(req.query.page, 1, 1_000_000)
  const limit = pageLimit(req.query.limit, 20, 100)
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
  const location = await prisma.location.findUnique({ where: { id }, select: { id: true } })
  if (!location) return res.status(404).json({ error: 'Not found' })
  const where: Prisma.AssetWhereInput = { locationId: id, deletedAt: null, ...(search ? { OR: [{ code: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }] } : {}) }
  const [rows, total] = await prisma.$transaction([
    prisma.asset.findMany({ where, select: locationAssetSelect, orderBy: { id: 'asc' }, skip: (page - 1) * limit, take: limit }),
    prisma.asset.count({ where }),
  ])
  res.json({ data: rows.map(serializeLocationAsset), total, page, totalPages: Math.max(1, Math.ceil(total / limit)) })
}))

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toNumberId(req.params.id)
    if (id === null) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    const location = await prisma.location.findUnique({ where: { id }, include: locationInclude })
    if (!location) {
      res.status(404).json({ error: 'Not found' })
      return
    }

    const ancestors: Array<{ id: number; name: string }> = []
    const visited = new Set<number>([location.id])
    let nextId = location.parentId
    while (nextId !== null && !visited.has(nextId)) {
      visited.add(nextId)
      const ancestor = await prisma.location.findUnique({
        where: { id: nextId },
        select: { id: true, name: true, parentId: true },
      })
      if (!ancestor) break
      ancestors.unshift({ id: ancestor.id, name: ancestor.name })
      nextId = ancestor.parentId
    }

    const assets = await prisma.asset.findMany({
      where: { locationId: id, deletedAt: null },
      orderBy: { id: 'asc' },
      select: locationAssetSelect,
      take: LOCATION_PREVIEW_SIZE,
    })

    // The subtree is counted inside PostgreSQL. The detail never materializes
    // a potentially huge location-id array in Node just to show this number.
    const subtreeRows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      WITH RECURSIVE subtree AS (
        SELECT id FROM "Location" WHERE id = ${id}
        UNION ALL
        SELECT child.id FROM "Location" child JOIN subtree ON child."parentId" = subtree.id
      )
      SELECT COUNT(*)::bigint AS count
      FROM "Asset" asset
      WHERE asset."deletedAt" IS NULL
        AND EXISTS (SELECT 1 FROM subtree WHERE subtree.id = asset."locationId")
    `)
    const subtreeAssets = Number(subtreeRows[0]?.count ?? 0)

    res.json({
      ...serializeLocation(location),
      assetCount: subtreeAssets,
      ancestors,
      assets: assets.map(serializeLocationAsset),
    })
  }),
)

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createLocationSchema.parse(req.body)
    const { parentId, responsibleId, projectId, label, ...rest } = parsed
    await assertSameProject(null, projectId, responsibleId)
    await assertNoCycle(0, parentId)
    if (parentId !== null) {
      const parent = await prisma.location.findUnique({ where: { id: parentId }, select: { projectId: true } })
      if (!parent || parent.projectId !== projectId) {
        const err = new Error('Location, parent and responsible must belong to the same project')
        ;(err as Error & { status?: number }).status = 400
        throw err
      }
    }
    const data: Prisma.LocationCreateInput = {
      ...rest,
      label: label ?? parsed.name,
      parent: parentId ? { connect: { id: parentId } } : undefined,
      responsible: { connect: { id: responsibleId } },
      project: { connect: { id: projectId } },
    }
    const [created] = await prisma.$transaction([
      prisma.location.create({ data, include: locationInclude }),
      prisma.auditLog.create({
        data: {
          projectId,
          userId: ACTOR_USER_ID,
          action: 'Creación',
          entityId: parsed.code,
          detail: `Nueva ubicación "${parsed.name}" creada`,
          timestamp: new Date(),
        },
      }),
    ])
    res.status(201).json(serializeLocation(created))
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
    const parsed = updateLocationSchema.parse(req.body)
    const { parentId, responsibleId, projectId, ...rest } = parsed
    const existing = await prisma.location.findUnique({
      where: { id },
      select: { projectId: true, responsibleId: true, parentId: true, name: true, label: true },
    })
    if (!existing) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const targetProject = projectId ?? existing.projectId
    const targetResponsible = responsibleId ?? existing.responsibleId
    const targetParent = parentId === undefined ? existing.parentId : parentId
    await assertSameProject(id, targetProject, targetResponsible)
    if (targetParent === id) {
      const err = new Error('Location cannot be its own parent')
      ;(err as Error & { status?: number }).status = 400
      throw err
    }
    await assertNoCycle(id, targetParent)
    if (targetParent !== null) {
      const parent = await prisma.location.findUnique({ where: { id: targetParent }, select: { projectId: true } })
      if (!parent || parent.projectId !== targetProject) {
        const err = new Error('Location, parent and responsible must belong to the same project')
        ;(err as Error & { status?: number }).status = 400
        throw err
      }
    }
    // `label` sigue al nombre salvo que sea una etiqueta personalizada: si
    // coincidía con el nombre anterior, se renombra con él; si no, se conserva.
    // Un `label` explícito en la petición siempre tiene prioridad.
    const renameTo = parsed.name !== undefined && parsed.name !== existing.name ? parsed.name : undefined
    const data: Prisma.LocationUpdateInput = {
      ...rest,
      label: parsed.label ?? (renameTo !== undefined && existing.label === existing.name ? renameTo : undefined),
      parent: parentId === undefined ? undefined : parentId === null ? { disconnect: true } : { connect: { id: parentId } },
      responsible: responsibleId ? { connect: { id: responsibleId } } : undefined,
      project: projectId ? { connect: { id: projectId } } : undefined,
    }
    const [updated] = await prisma.$transaction([
      prisma.location.update({ where: { id }, data, include: locationInclude }),
      prisma.auditLog.create({
        data: {
          projectId: targetProject,
          userId: ACTOR_USER_ID,
          action: 'Actualización',
          entityId: String(id),
          detail: 'Ubicación actualizada',
          timestamp: new Date(),
        },
      }),
    ])
    res.json(serializeLocation(updated))
  }),
)

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toNumberId(req.params.id)
    if (id === null) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    const location = await prisma.location.findUnique({ where: { id }, select: { code: true, name: true, projectId: true } })
    if (!location) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const subtreeIds = await descendantLocationIds(prisma, id)
    // Cuenta todos los activos de la subrama (incluida la papelera): la FK con
    // Restrict impide borrar la ubicación mientras exista el activo físico.
    const [subtreeAssets, anyChildren] = await Promise.all([
      prisma.asset.count({ where: { locationId: { in: subtreeIds } } }),
      prisma.location.count({ where: { parentId: id } }),
    ])
    if (subtreeAssets > 0) {
      res.status(409).json({ error: 'Conflict', message: 'No se puede eliminar: la ubicación tiene activos asignados.' })
      return
    }
    if (anyChildren > 0) {
      res.status(409).json({ error: 'Conflict', message: 'No se puede eliminar: la ubicación tiene ubicaciones hijas.' })
      return
    }
    await prisma.$transaction([
      prisma.location.delete({ where: { id } }),
      prisma.auditLog.create({
        data: {
          projectId: location.projectId,
          userId: ACTOR_USER_ID,
          action: 'Eliminación',
          entityId: location.code,
          detail: `Ubicación "${location.name}" eliminada`,
          timestamp: new Date(),
        },
      }),
    ])
    res.status(204).end()
  }),
)

export default router
