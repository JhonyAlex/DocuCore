import { Router } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import {
  deleteNotificationById,
  listNotifications,
  markAllNotificationsAsRead,
  setNotificationReadStatus,
  syncProjectNotifications,
} from '../lib/notifications'

const router: Router = Router()

const CURRENT_PROJECT_CODE = 'PRJ-2026-001'

const listNotificationsQuerySchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  filter: z.enum(['all', 'unread', 'critical']).default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sync: z.enum(['true', 'false']).transform((v) => v === 'true').optional().default('true'),
})

const patchReadSchema = z.object({
  read: z.boolean().optional().default(true),
})

const readAllSchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
})

const createNotificationSchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(1000),
  category: z.enum(['expiry', 'maintenance', 'status', 'system']).default('system'),
  urgency: z.enum(['critical', 'warning', 'info']).default('info'),
  targetType: z.enum(['asset', 'document', 'calendar', 'url']).nullable().optional(),
  targetId: z.string().nullable().optional(),
})

async function resolveProjectId(explicitId?: number): Promise<number> {
  if (explicitId && Number.isInteger(explicitId) && explicitId > 0) {
    return explicitId
  }
  const project = await prisma.project.findUniqueOrThrow({
    where: { code: CURRENT_PROJECT_CODE },
    select: { id: true },
  })
  return project.id
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    const query = listNotificationsQuerySchema.parse(req.query)
    const projectId = await resolveProjectId(query.projectId)

    if (query.sync) {
      await syncProjectNotifications(prisma, projectId)
    }

    const result = await listNotifications(prisma, {
      projectId,
      filter: query.filter,
      limit: query.limit,
    })

    res.json(result)
  }),
)

router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid notification id' })
    }

    const body = patchReadSchema.parse(req.body ?? {})
    const existing = await prisma.notification.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ error: 'Notification not found' })
    }

    const updated = await setNotificationReadStatus(prisma, id, body.read)
    res.json(updated)
  }),
)

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const body = readAllSchema.parse(req.body ?? {})
    const projectId = await resolveProjectId(body.projectId)

    const updatedCount = await markAllNotificationsAsRead(prisma, projectId)
    res.json({ success: true, count: updatedCount })
  }),
)

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid notification id' })
    }

    const existing = await prisma.notification.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ error: 'Notification not found' })
    }

    await deleteNotificationById(prisma, id)
    res.status(204).end()
  }),
)

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createNotificationSchema.parse(req.body)
    const projectId = await resolveProjectId(input.projectId)

    const created = await prisma.notification.create({
      data: {
        projectId,
        title: input.title,
        message: input.message,
        category: input.category,
        urgency: input.urgency,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
      },
    })

    res.status(201).json(created)
  }),
)

export default router
