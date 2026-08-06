import { Router } from 'express'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { createItemSchema, updateItemSchema, changeStatusSchema } from '../lib/validate'

const router: Router = Router()

const ACTOR_USER_ID = 1

const itemInclude = {
  type: { select: { id: true, name: true } },
  status: { select: { id: true, name: true, pulseDot: true } },
  responsible: { select: { id: true, name: true, initials: true, color: true } },
}

function toNumberId(value: string | undefined): number | null {
  if (value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = req.query
    const search = typeof q.search === 'string' ? q.search : undefined
    const location = typeof q.location === 'string' ? q.location : undefined
    const pageParam = typeof q.page === 'string' ? Number(q.page) : NaN
    const limitParam = typeof q.limit === 'string' ? Number(q.limit) : NaN
    const typeId = toNumberId(typeof q.typeId === 'string' ? q.typeId : undefined)
    const statusId = toNumberId(typeof q.statusId === 'string' ? q.statusId : undefined)

    const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1
    const limit = Number.isFinite(limitParam) && limitParam >= 1 ? Math.min(100, Math.floor(limitParam)) : 10

    const where: Prisma.ItemWhereInput = {}
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { serialNumber: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (typeId !== null) where.typeId = typeId
    if (statusId !== null) where.statusId = statusId
    if (location) where.location = location

    const [rows, total] = await prisma.$transaction([
      prisma.item.findMany({
        where,
        include: itemInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { id: 'asc' },
      }),
      prisma.item.count({ where }),
    ])

    const totalPages = total === 0 ? 1 : Math.ceil(total / limit)
    res.json({ data: rows, total, page, totalPages })
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
    const item = await prisma.item.findUnique({ where: { id }, include: itemInclude })
    if (!item) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json(item)
  }),
)

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createItemSchema.parse(req.body)
    const { typeId, statusId, projectId, responsibleId, installDate, dynamicFields, ...rest } = parsed
    const data: Prisma.ItemCreateInput = {
      ...rest,
      installDate: new Date(installDate),
      type: { connect: { id: typeId } },
      status: { connect: { id: statusId } },
      project: { connect: { id: projectId } },
      responsible: { connect: { id: responsibleId } },
      dynamicFields: dynamicFields ? (dynamicFields as Prisma.InputJsonValue) : undefined,
    }
    const [created] = await prisma.$transaction([
      prisma.item.create({ data, include: itemInclude }),
      prisma.auditLog.create({
        data: {
          userId: ACTOR_USER_ID,
          action: 'Creación',
          entityId: parsed.code,
          detail: `Nuevo ítem "${parsed.name}" creado`,
          timestamp: new Date(),
        },
      }),
    ])
    res.status(201).json(created)
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
    const parsed = updateItemSchema.parse(req.body)
    const { typeId, statusId, projectId, responsibleId, installDate, dynamicFields, ...rest } = parsed
    const data: Prisma.ItemUpdateInput = {
      ...rest,
      installDate: installDate ? new Date(installDate) : undefined,
      type: typeId ? { connect: { id: typeId } } : undefined,
      status: statusId ? { connect: { id: statusId } } : undefined,
      project: projectId ? { connect: { id: projectId } } : undefined,
      responsible: responsibleId ? { connect: { id: responsibleId } } : undefined,
      dynamicFields: dynamicFields ? (dynamicFields as Prisma.InputJsonValue) : undefined,
    }
    const [updated] = await prisma.$transaction([
      prisma.item.update({ where: { id }, data, include: itemInclude }),
      prisma.auditLog.create({
        data: {
          userId: ACTOR_USER_ID,
          action: 'Actualización',
          entityId: String(id),
          detail: 'Ítem actualizado',
          timestamp: new Date(),
        },
      }),
    ])
    res.json(updated)
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
    const [updated] = await prisma.$transaction([
      prisma.item.update({
        where: { id },
        data: { status: { connect: { id: parsed.statusId } } },
        include: itemInclude,
      }),
      prisma.auditLog.create({
        data: {
          userId: ACTOR_USER_ID,
          action: 'Cambio estado',
          entityId: String(id),
          detail: `Estado actualizado a #${parsed.statusId}`,
          timestamp: new Date(),
        },
      }),
    ])
    res.json(updated)
  }),
)

export default router
