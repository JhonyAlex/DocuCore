import { Router } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'

const router: Router = Router({ mergeParams: true })
const ACTOR_USER_ID = 1
const taskSchema = z.object({ code: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(100), isActive: z.boolean().optional() }).strict()
const bulkTaskSchema = z.object({
  action: z.enum(['deactivate', 'delete']),
  ids: z.array(z.number().int().positive()).min(1).max(200),
}).strict()

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
    await tx.auditLog.create({ data: { projectId, userId: ACTOR_USER_ID, action: 'Creación', entityId: `task:${task.id}`, detail: `Tarea "${task.code}" creada`, timestamp: new Date() } })
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
    await tx.auditLog.create({ data: { projectId, userId: ACTOR_USER_ID, action: 'Actualización', entityId: `task:${id}`, detail: `Tarea "${task.code}" actualizada`, timestamp: new Date() } })
    return task
  })
  res.json(updated)
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  const projectId = projectIdOf(req.params.projectId)
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  const task = await prisma.task.findFirst({ where: { id, projectId } })
  if (!task) return res.status(404).json({ error: 'Not found' })

  const [planRefs, execRefs] = await Promise.all([
    prisma.preventivePlanTask.count({ where: { taskId: id } }),
    prisma.preventiveExecutionTask.count({ where: { taskId: id } }),
  ])
  const isReferenced = planRefs > 0 || execRefs > 0

  await prisma.$transaction(async (tx) => {
    if (isReferenced) {
      await tx.task.update({ where: { id }, data: { isActive: false } })
      await tx.auditLog.create({ data: { projectId, userId: ACTOR_USER_ID, action: 'Desactivación', entityId: `task:${id}`, detail: `Tarea "${task.code}" desactivada por estar en uso`, timestamp: new Date() } })
    } else {
      await tx.task.delete({ where: { id } })
      await tx.auditLog.create({ data: { projectId, userId: ACTOR_USER_ID, action: 'Eliminación', entityId: `task:${id}`, detail: `Tarea "${task.code}" eliminada`, timestamp: new Date() } })
    }
  })
  res.status(204).end()
}))

router.post('/bulk', asyncHandler(async (req, res) => {
  const projectId = projectIdOf(req.params.projectId)
  const input = bulkTaskSchema.parse(req.body)
  const tasks = await prisma.task.findMany({ where: { id: { in: input.ids }, projectId } })
  if (tasks.length === 0) return res.status(404).json({ error: 'No tasks found' })

  await prisma.$transaction(async (tx) => {
    if (input.action === 'deactivate') {
      await tx.task.updateMany({ where: { id: { in: tasks.map((t) => t.id) } }, data: { isActive: false } })
      await tx.auditLog.create({ data: { projectId, userId: ACTOR_USER_ID, action: 'Desactivación masiva', entityId: `tasks:bulk`, detail: `${tasks.length} tareas desactivadas`, timestamp: new Date() } })
    } else {
      for (const task of tasks) {
        const [planRefs, execRefs] = await Promise.all([
          tx.preventivePlanTask.count({ where: { taskId: task.id } }),
          tx.preventiveExecutionTask.count({ where: { taskId: task.id } }),
        ])
        if (planRefs > 0 || execRefs > 0) {
          await tx.task.update({ where: { id: task.id }, data: { isActive: false } })
        } else {
          await tx.task.delete({ where: { id: task.id } })
        }
      }
      await tx.auditLog.create({ data: { projectId, userId: ACTOR_USER_ID, action: 'Eliminación masiva', entityId: `tasks:bulk`, detail: `${tasks.length} tareas procesadas (eliminadas/desactivadas)`, timestamp: new Date() } })
    }
  })
  res.status(200).json({ success: true, count: tasks.length })
}))

export default router
