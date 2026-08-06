import { Router } from 'express'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'

const router: Router = Router()

router.get(
  '/item-types',
  asyncHandler(async (_req, res) => {
    const types = await prisma.itemType.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    })
    res.json(types)
  }),
)

router.get(
  '/statuses',
  asyncHandler(async (_req, res) => {
    const statuses = await prisma.status.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true, pulseDot: true },
    })
    res.json(statuses)
  }),
)

router.get(
  '/locations',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.item.findMany({
      distinct: ['location'],
      select: { location: true },
      orderBy: { location: 'asc' },
    })
    res.json(rows.map((r) => r.location))
  }),
)

export default router
