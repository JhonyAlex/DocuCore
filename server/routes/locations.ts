import { Router } from 'express'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { createLocationSchema, updateLocationSchema } from '../lib/validate'

const router: Router = Router()

const ACTOR_USER_ID = 1
const CURRENT_PROJECT_CODE = 'PRJ-2026-001'

const locationInclude = {
  responsible: { select: { id: true, name: true, initials: true, color: true } },
  floorPlan: { select: { id: true } },
  _count: { select: { items: true, children: true } },
} satisfies Prisma.LocationInclude

type LocationWithRelations = Prisma.LocationGetPayload<{ include: typeof locationInclude }>

function serializeLocation(location: LocationWithRelations) {
  const { responsible, floorPlan, _count, ...base } = location
  return {
    ...base,
    createdAt: location.createdAt.toISOString(),
    updatedAt: location.updatedAt.toISOString(),
    responsible,
    hasFloorPlan: floorPlan !== null,
    itemCount: _count.items,
    childCount: _count.children,
  }
}

// Ids de una ubicación y todos sus descendientes (visibles y ocultos).
async function collectSubtreeIds(rootId: number): Promise<number[]> {
  const all = await prisma.location.findMany({ select: { id: true, parentId: true } })
  const byParent = new Map<number | null, number[]>()
  for (const loc of all) {
    const siblings = byParent.get(loc.parentId) ?? []
    siblings.push(loc.id)
    byParent.set(loc.parentId, siblings)
  }
  const ids: number[] = []
  const stack = [rootId]
  while (stack.length > 0) {
    const current = stack.pop() as number
    ids.push(current)
    stack.push(...(byParent.get(current) ?? []))
  }
  return ids
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
  asyncHandler(async (_req, res) => {
    const project = await prisma.project.findUniqueOrThrow({
      where: { code: CURRENT_PROJECT_CODE },
      select: { id: true, code: true, name: true, assetCount: true },
    })
    const locations = await prisma.location.findMany({
      where: { projectId: project.id },
      include: locationInclude,
      orderBy: { id: 'asc' },
    })
    res.json({ project, locations: locations.map(serializeLocation) })
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

    const items = await prisma.item.findMany({
      where: { locationId: id },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        installDate: true,
        initials: true,
        type: { select: { id: true, name: true } },
        status: { select: { id: true, name: true, pulseDot: true } },
      },
    })

    // El detalle comparte el conteo de subrama del árbol (activos directos e
    // hijos), de modo que árbol y detalle muestran siempre el mismo número.
    const subtreeIds = await collectSubtreeIds(id)
    const subtreeItems = await prisma.item.count({ where: { locationId: { in: subtreeIds } } })

    res.json({
      ...serializeLocation(location),
      itemCount: subtreeItems,
      ancestors,
      items: items.map((item) => ({ ...item, installDate: item.installDate.toISOString() })),
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
    const location = await prisma.location.findUnique({ where: { id }, select: { code: true, name: true } })
    if (!location) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const subtreeIds = await collectSubtreeIds(id)
    const [subtreeItems, anyChildren] = await Promise.all([
      prisma.item.count({ where: { locationId: { in: subtreeIds } } }),
      prisma.location.count({ where: { parentId: id } }),
    ])
    if (subtreeItems > 0) {
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
