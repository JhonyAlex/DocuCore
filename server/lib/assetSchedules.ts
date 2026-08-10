import { Prisma } from '@prisma/client'
import { calculateNextExpiry, type DocumentPeriodicity, type DocumentPeriodicityMode } from './periodicity'

export const PERIODICITIES = ['Mensual', 'Bimestral', 'Trimestral', 'Cuatrimestral', 'Semestral', 'Anual'] as const
export const PERIODICITY_MODES = ['Calendario', 'Subida'] as const

export function asUtcDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw Object.assign(new Error('Invalid date'), { status: 400 })
  return date
}

export async function setAssetDateSchedule(tx: Prisma.TransactionClient, input: { assetId: number; definitionId: number; date: Date | null; periodicity: string | null; periodicityMode: string | null }): Promise<void> {
  const existing = await tx.assetDateSchedule.findUnique({ where: { assetId_definitionId: { assetId: input.assetId, definitionId: input.definitionId } }, include: { occurrences: { where: { completedAt: null }, orderBy: { id: 'asc' }, take: 1 } } })
  if (!input.date) {
    if (existing) await tx.assetDateSchedule.update({ where: { id: existing.id }, data: { isActive: false } })
    return
  }
  const schedule = existing
    ? await tx.assetDateSchedule.update({ where: { id: existing.id }, data: { periodicity: input.periodicity, periodicityMode: input.periodicityMode, isActive: true } })
    : await tx.assetDateSchedule.create({ data: { assetId: input.assetId, definitionId: input.definitionId, periodicity: input.periodicity, periodicityMode: input.periodicityMode } })
  const pending = existing?.occurrences[0]
  if (pending) await tx.assetDateOccurrence.update({ where: { id: pending.id }, data: { scheduledDate: input.date } })
  else await tx.assetDateOccurrence.create({ data: { scheduleId: schedule.id, scheduledDate: input.date } })
}

export async function completeAssetDateOccurrence(tx: Prisma.TransactionClient, occurrenceId: number, performedDate: Date): Promise<void> {
  const occurrence = await tx.assetDateOccurrence.findUnique({ where: { id: occurrenceId }, include: { schedule: true } })
  if (!occurrence || occurrence.completedAt) throw Object.assign(new Error('Date occurrence is not pending'), { status: 409 })
  await tx.assetDateOccurrence.update({ where: { id: occurrenceId }, data: { completedAt: new Date(), completedDate: performedDate } })
  if (occurrence.schedule.isActive && occurrence.schedule.periodicity && occurrence.schedule.periodicityMode) {
    const next = calculateNextExpiry(occurrence.scheduledDate, performedDate, occurrence.schedule.periodicityMode as DocumentPeriodicityMode, occurrence.schedule.periodicity as DocumentPeriodicity)
    await tx.assetDateOccurrence.create({ data: { scheduleId: occurrence.scheduleId, scheduledDate: next } })
  }
}

export async function createPreventiveExecution(tx: Prisma.TransactionClient, planId: number, scheduledDate: Date, taskIds?: number[]): Promise<void> {
  const plan = await tx.assetPreventivePlan.findUniqueOrThrow({ where: { id: planId }, include: { definition: { include: { planTasks: { include: { task: true }, orderBy: { sortOrder: 'asc' } } } } } })
  const allowed = plan.definition.planTasks.filter((link) => !taskIds || taskIds.includes(link.taskId))
  const execution = await tx.preventiveExecution.create({ data: { planId, scheduledDate } })
  await tx.preventiveExecutionTask.createMany({ data: allowed.map((link) => ({ executionId: execution.id, taskId: link.taskId, code: link.task.code, name: link.task.name, sortOrder: link.sortOrder })) })
}
