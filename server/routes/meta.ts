import { Router } from 'express'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'

const router: Router = Router()

const CURRENT_PROJECT_CODE = 'PRJ-2026-001'
const ACTOR_USER_ID = 1

router.get(
  '/session',
  asyncHandler(async (_req, res) => {
    res.set('Cache-Control', 'no-store')
    const project = await prisma.project.findUniqueOrThrow({
      where: { code: CURRENT_PROJECT_CODE },
      select: { id: true, code: true, name: true },
    })
    const [assetCount, user] = await Promise.all([
      prisma.item.count({ where: { projectId: project.id } }),
      prisma.user.findUniqueOrThrow({
        where: { id: ACTOR_USER_ID },
        select: { id: true, name: true, role: true, initials: true, color: true },
      }),
    ])
    res.json({ project: { ...project, assetCount }, user })
  }),
)

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
  '/users',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true, initials: true, color: true },
    })
    res.json(users)
  }),
)

export default router
