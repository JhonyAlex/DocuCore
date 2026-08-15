import { Router } from 'express'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { completeCalendarOccurrence, listCalendarOccurrences } from '../lib/calendarEvents'
import { asCalendarDate } from '../lib/calendarDomain'
import { assetEventClock } from '../lib/assetEvents'
import { calendarCreateEventSchema, calendarListQuerySchema, calendarUpdateEventSchema, completeCalendarOccurrenceSchema } from '../lib/validate'
import { actorIdFromRequest, requireAssetInProject, scopedProjectId } from '../lib/projectScope'

const router: Router = Router({ mergeParams: true })

async function assertAssetInProject(assetId: number | null | undefined, projectId: number): Promise<void> {
  if (!assetId) return
  await requireAssetInProject(assetId, projectId)
}

router.get('/', asyncHandler(async (req, res) => {
  const input = calendarListQuerySchema.parse(req.query)
  const projectId = scopedProjectId(req)
  if (input.projectId !== undefined && input.projectId !== projectId) return res.status(400).json({ error: 'Project id does not match route scope' })
  // La primera carga tampoco descarga todo el historial: si la URL no trae
  // rango todavía, el servidor usa su propio reloj y el mes que lo contiene.
  const clock = assetEventClock()
  const defaultFrom = asCalendarDate(new Date(Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), 1)))
  const defaultTo = asCalendarDate(new Date(Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth() + 1, 0)))
  res.json(await listCalendarOccurrences(prisma, { ...input, projectId, from: input.from ?? defaultFrom, to: input.to ?? defaultTo }))
}))

router.post('/events', asyncHandler(async (req, res) => {
  const input = calendarCreateEventSchema.parse(req.body)
  const projectId = scopedProjectId(req)
  if (input.projectId !== undefined && input.projectId !== projectId) return res.status(400).json({ error: 'Project id does not match route scope' })
  await assertAssetInProject(input.assetId, projectId)
  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({ data: { title: input.title, date: new Date(`${input.date}T00:00:00.000Z`), type: input.category, projectId, assetId: input.assetId ?? null } })
    await tx.auditLog.create({ data: { projectId, userId: actorIdFromRequest(req), action: 'Creación', entityId: `event:${created.id}`, detail: `Evento "${created.title}" creado para ${input.date}`, timestamp: new Date() } })
    return created
  })
  const occurrence = (await listCalendarOccurrences(prisma, { projectId: event.projectId, from: input.date, to: input.date, source: 'event' })).events.find((entry) => entry.sourceId === event.id)
  res.status(201).json(occurrence ?? event)
}))

router.patch('/events/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  const input = calendarUpdateEventSchema.parse(req.body)
  const projectId = scopedProjectId(req)
  const existing = await prisma.event.findFirst({ where: { id, projectId }, select: { id: true, projectId: true } })
  if (!existing) return res.status(404).json({ error: 'Event not found' })
  await assertAssetInProject(input.assetId, existing.projectId)
  const updated = await prisma.$transaction(async (tx) => {
    const event = await tx.event.update({ where: { id }, data: { ...(input.title !== undefined ? { title: input.title } : {}), ...(input.date !== undefined ? { date: new Date(`${input.date}T00:00:00.000Z`) } : {}), ...(input.category !== undefined ? { type: input.category } : {}), ...(input.assetId !== undefined ? { assetId: input.assetId } : {}) } })
    await tx.auditLog.create({ data: { projectId: event.projectId, userId: actorIdFromRequest(req), action: 'Actualización', entityId: `event:${id}`, detail: `Evento "${event.title}" actualizado`, timestamp: new Date() } })
    return event
  })
  const date = updated.date.toISOString().slice(0, 10)
  const occurrence = (await listCalendarOccurrences(prisma, { projectId: updated.projectId, from: date, to: date, source: 'event' })).events.find((entry) => entry.sourceId === updated.id)
  res.json(occurrence ?? updated)
}))

router.delete('/events/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  const event = await prisma.event.findFirst({ where: { id, projectId: scopedProjectId(req) }, select: { id: true, title: true, projectId: true } })
  if (!event) return res.status(404).json({ error: 'Event not found' })
  await prisma.$transaction([
    prisma.event.delete({ where: { id } }),
    prisma.auditLog.create({ data: { projectId: event.projectId, userId: actorIdFromRequest(req), action: 'Eliminación', entityId: `event:${id}`, detail: `Evento "${event.title}" eliminado`, timestamp: new Date() } }),
  ])
  res.status(204).end()
}))

router.post('/events/complete', asyncHandler(async (req, res) => {
  const input = completeCalendarOccurrenceSchema.parse(req.body)
  const projectId = scopedProjectId(req)
  if (input.projectId !== projectId) return res.status(400).json({ error: 'Project id does not match route scope' })
  await prisma.$transaction((tx) => completeCalendarOccurrence(tx, { ...input, projectId, actorId: actorIdFromRequest(req) }))
  res.status(204).end()
}))

export default router
