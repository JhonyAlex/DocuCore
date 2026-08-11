import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { PERIODICITIES, PERIODICITY_MODES } from '../lib/assetSchedules'

const router: Router = Router({ mergeParams: true })
const ACTOR_USER_ID = 1

const planInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  periodicity: z.enum(PERIODICITIES),
  periodicityMode: z.enum(PERIODICITY_MODES),
  isActive: z.boolean().optional(),
  taskIds: z.array(z.number().int().positive()).min(1, 'El plan preventivo debe contener al menos una tarea'),
  assetTypeIds: z.array(z.number().int().positive()).default([]),
}).strict()

const bulkPlanSchema = z.object({
  action: z.enum(['deactivate', 'delete']),
  ids: z.array(z.number().int().positive()).min(1).max(200),
}).strict()

function projectIdOf(value: string | undefined): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw Object.assign(new Error('Invalid project id'), { status: 400 })
  return id
}

const planInclude = {
  tasks: { include: { task: true }, orderBy: { sortOrder: 'asc' as const } },
  assetTypes: { include: { assetType: true }, orderBy: { assetTypeId: 'asc' as const } },
  _count: { select: { assetAssignments: true } },
}

type PlanQueryResult = Prisma.PreventivePlanGetPayload<{ include: typeof planInclude }>

function serializePlan(plan: PlanQueryResult) {
  return {
    id: plan.id,
    projectId: plan.projectId,
    name: plan.name,
    description: plan.description,
    periodicity: plan.periodicity,
    periodicityMode: plan.periodicityMode,
    isActive: plan.isActive,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    tasks: plan.tasks.map((t) => ({ taskId: t.taskId, code: t.task.code, name: t.task.name, sortOrder: t.sortOrder, isActive: t.task.isActive })),
    taskIds: plan.tasks.map((t) => t.taskId),
    assetTypes: plan.assetTypes.map((at) => ({ id: at.assetType.id, name: at.assetType.name })),
    assetTypeIds: plan.assetTypes.map((at) => at.assetTypeId),
    assignmentCount: plan._count?.assetAssignments ?? 0,
  }
}

router.get('/', asyncHandler(async (req, res) => {
  const projectId = projectIdOf(req.params.projectId)
  const includeInactive = req.query.includeInactive === 'true'
  const assetTypeId = req.query.assetTypeId ? Number(req.query.assetTypeId) : null

  const plans = await prisma.preventivePlan.findMany({
    where: {
      projectId,
      isActive: includeInactive ? undefined : true,
      ...(assetTypeId ? {
        OR: [
          { assetTypes: { none: {} } },
          { assetTypes: { some: { assetTypeId } } },
        ],
      } : {}),
    },
    include: planInclude,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  })
  res.json(plans.map(serializePlan))
}))

router.post('/', asyncHandler(async (req, res) => {
  const projectId = projectIdOf(req.params.projectId)
  const input = planInputSchema.parse(req.body)

  const [validTasks, validTypes] = await Promise.all([
    input.taskIds.length > 0 ? prisma.task.count({ where: { id: { in: input.taskIds }, projectId } }) : 0,
    input.assetTypeIds.length > 0 ? prisma.assetType.count({ where: { id: { in: input.assetTypeIds }, projectId } }) : 0,
  ])
  if (input.taskIds.length > 0 && validTasks !== new Set(input.taskIds).size) return res.status(400).json({ error: 'Unknown task ID' })
  if (input.assetTypeIds.length > 0 && validTypes !== new Set(input.assetTypeIds).size) return res.status(400).json({ error: 'Unknown asset type ID' })

  const created = await prisma.$transaction(async (tx) => {
    const plan = await tx.preventivePlan.create({
      data: {
        projectId,
        name: input.name,
        description: input.description ?? null,
        periodicity: input.periodicity,
        periodicityMode: input.periodicityMode,
        isActive: input.isActive ?? true,
        tasks: {
          create: [...new Set(input.taskIds)].map((taskId, sortOrder) => ({ taskId, sortOrder })),
        },
        assetTypes: {
          create: [...new Set(input.assetTypeIds)].map((assetTypeId) => ({ assetTypeId })),
        },
      },
      include: planInclude,
    })
    await tx.auditLog.create({
      data: { userId: ACTOR_USER_ID, action: 'Creación', entityId: `preventive-plan:${plan.id}`, detail: `Plan preventivo "${plan.name}" creado`, timestamp: new Date() },
    })
    return plan
  })
  res.status(201).json(serializePlan(created))
}))

router.get('/:id', asyncHandler(async (req, res) => {
  const projectId = projectIdOf(req.params.projectId)
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })

  const plan = await prisma.preventivePlan.findFirst({ where: { id, projectId }, include: planInclude })
  if (!plan) return res.status(404).json({ error: 'Not found' })
  res.json(serializePlan(plan))
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const projectId = projectIdOf(req.params.projectId)
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })

  const input = planInputSchema.partial().parse(req.body)
  const before = await prisma.preventivePlan.findFirst({ where: { id, projectId } })
  if (!before) return res.status(404).json({ error: 'Not found' })

  if (input.taskIds) {
    if (input.taskIds.length === 0) return res.status(400).json({ error: 'Preventive plan must have at least one task' })
    const valid = await prisma.task.count({ where: { id: { in: input.taskIds }, projectId } })
    if (valid !== new Set(input.taskIds).size) return res.status(400).json({ error: 'Unknown task ID' })
  }
  if (input.assetTypeIds) {
    const valid = await prisma.assetType.count({ where: { id: { in: input.assetTypeIds }, projectId } })
    if (valid !== new Set(input.assetTypeIds).size) return res.status(400).json({ error: 'Unknown asset type ID' })
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.taskIds) {
      await tx.preventivePlanTask.deleteMany({ where: { planId: id } })
      await tx.preventivePlanTask.createMany({ data: [...new Set(input.taskIds)].map((taskId, sortOrder) => ({ planId: id, taskId, sortOrder })) })
    }
    if (input.assetTypeIds) {
      await tx.preventivePlanAssetType.deleteMany({ where: { planId: id } })
      await tx.preventivePlanAssetType.createMany({ data: [...new Set(input.assetTypeIds)].map((assetTypeId) => ({ planId: id, assetTypeId })) })
    }
    const { taskIds: _t, assetTypeIds: _a, ...data } = input
    const plan = await tx.preventivePlan.update({
      where: { id },
      data: {
        ...data,
        description: input.description === undefined ? undefined : input.description,
      },
      include: planInclude,
    })
    await tx.auditLog.create({
      data: { userId: ACTOR_USER_ID, action: 'Actualización', entityId: `preventive-plan:${id}`, detail: `Plan preventivo "${plan.name}" actualizado`, timestamp: new Date() },
    })
    return plan
  })
  res.json(serializePlan(updated))
}))

router.post('/:id/duplicate', asyncHandler(async (req, res) => {
  const projectId = projectIdOf(req.params.projectId)
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })

  const origin = await prisma.preventivePlan.findFirst({ where: { id, projectId }, include: planInclude })
  if (!origin) return res.status(404).json({ error: 'Not found' })

  const duplicated = await prisma.$transaction(async (tx) => {
    const plan = await tx.preventivePlan.create({
      data: {
        projectId,
        name: `${origin.name} (Copia)`,
        description: origin.description,
        periodicity: origin.periodicity,
        periodicityMode: origin.periodicityMode,
        isActive: true,
        tasks: {
          create: origin.tasks.map((t) => ({ taskId: t.taskId, sortOrder: t.sortOrder })),
        },
        assetTypes: {
          create: origin.assetTypes.map((at) => ({ assetTypeId: at.assetTypeId })),
        },
      },
      include: planInclude,
    })
    await tx.auditLog.create({
      data: { userId: ACTOR_USER_ID, action: 'Duplicación', entityId: `preventive-plan:${plan.id}`, detail: `Plan preventivo "${origin.name}" duplicado como "${plan.name}"`, timestamp: new Date() },
    })
    return plan
  })
  res.status(201).json(serializePlan(duplicated))
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  const projectId = projectIdOf(req.params.projectId)
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })

  const plan = await prisma.preventivePlan.findFirst({ where: { id, projectId } })
  if (!plan) return res.status(404).json({ error: 'Not found' })

  const assignmentCount = await prisma.assetPreventivePlan.count({ where: { planId: id } })
  await prisma.$transaction(async (tx) => {
    if (assignmentCount > 0) {
      await tx.preventivePlan.update({ where: { id }, data: { isActive: false } })
      await tx.auditLog.create({ data: { userId: ACTOR_USER_ID, action: 'Desactivación', entityId: `preventive-plan:${id}`, detail: `Plan preventivo "${plan.name}" archivado/desactivado (en uso)`, timestamp: new Date() } })
    } else {
      await tx.preventivePlan.delete({ where: { id } })
      await tx.auditLog.create({ data: { userId: ACTOR_USER_ID, action: 'Eliminación', entityId: `preventive-plan:${id}`, detail: `Plan preventivo "${plan.name}" eliminado`, timestamp: new Date() } })
    }
  })
  res.status(204).end()
}))

router.post('/bulk', asyncHandler(async (req, res) => {
  const projectId = projectIdOf(req.params.projectId)
  const input = bulkPlanSchema.parse(req.body)
  const plans = await prisma.preventivePlan.findMany({ where: { id: { in: input.ids }, projectId } })
  if (plans.length === 0) return res.status(404).json({ error: 'No plans found' })

  await prisma.$transaction(async (tx) => {
    if (input.action === 'deactivate') {
      await tx.preventivePlan.updateMany({ where: { id: { in: plans.map((p) => p.id) } }, data: { isActive: false } })
      await tx.auditLog.create({ data: { userId: ACTOR_USER_ID, action: 'Desactivación masiva', entityId: `preventive-plans:bulk`, detail: `${plans.length} planes desactivados`, timestamp: new Date() } })
    } else {
      for (const plan of plans) {
        const assignmentCount = await tx.assetPreventivePlan.count({ where: { planId: plan.id } })
        if (assignmentCount > 0) {
          await tx.preventivePlan.update({ where: { id: plan.id }, data: { isActive: false } })
        } else {
          await tx.preventivePlan.delete({ where: { id: plan.id } })
        }
      }
      await tx.auditLog.create({ data: { userId: ACTOR_USER_ID, action: 'Eliminación masiva', entityId: `preventive-plans:bulk`, detail: `${plans.length} planes procesados (eliminados/desactivados)`, timestamp: new Date() } })
    }
  })
  res.status(200).json({ success: true, count: plans.length })
}))

export default router
