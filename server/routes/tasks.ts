import { Router } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'

const router: Router = Router({ mergeParams: true })
const ACTOR_USER_ID = 1
const taskSchema = z.object({ code: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(100), isActive: z.boolean().optional() }).strict()

function projectIdOf(value: string | undefined): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw Object.assign(new Error('Invalid project id'), { status: 400 })
  return id
}

router.get('/', asyncHandler(async (req, res) => {
  const projectId = projectIdOf(req.params.projectId)
  const includeInactive = req.query.includeInactive === 'true'
  const tasks = await prisma.task.findMany({ where: { projectId, isActive: includeInactive ? undefined : true }, orderBy: [{ code: 'asc' }, { id: 'asc' }] })
  res.json(tasks)
}))

router.post('/', asyncHandler(async (req, res) => {
  const projectId = projectIdOf(req.params.projectId)
  const input = taskSchema.parse(req.body)
  const created = await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({ data: { projectId, ...input, isActive: input.isActive ?? true } })
    await tx.auditLog.create({ data: { userId: ACTOR_USER_ID, action: 'Creación', entityId: `task:${task.id}`, detail: `Tarea "${task.code}" creada`, timestamp: new Date() } })
    return task
  })
  res.status(201).json(created)
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const projectId = projectIdOf(req.params.projectId)
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  const input = taskSchema.partial().parse(req.body)
  const before = await prisma.task.findFirst({ where: { id, projectId } })
  if (!before) return res.status(404).json({ error: 'Not found' })
  const updated = await prisma.$transaction(async (tx) => {
    const task = await tx.task.update({ where: { id }, data: input })
    await tx.auditLog.create({ data: { userId: ACTOR_USER_ID, action: 'Actualización', entityId: `task:${id}`, detail: `Tarea "${task.code}" actualizada`, timestamp: new Date() } })
    return task
  })
  res.json(updated)
}))

export default router
