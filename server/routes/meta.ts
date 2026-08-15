import { Router } from 'express'
import type { RequestHandler } from 'express'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { actorIdFromRequest, scopedProjectId } from '../lib/projectScope'

export const sessionHandler: RequestHandler = asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: actorIdFromRequest(req) },
      select: { id: true, name: true, role: true, initials: true, color: true },
    })
    res.json({ user })
  })

const router: Router = Router({ mergeParams: true })

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const projectId = scopedProjectId(req)
    const users = await prisma.projectMember.findMany({
      where: { projectId },
      orderBy: { id: 'asc' },
      select: { user: { select: { id: true, name: true, initials: true, color: true } } },
    })
    res.json(users.map(({ user }) => user))
  }),
)

export default router
