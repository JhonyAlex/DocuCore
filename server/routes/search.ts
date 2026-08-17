import { Router } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { scopedProjectId } from '../lib/projectScope'

const router: Router = Router({ mergeParams: true })

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().positive().max(20).default(5),
})

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const parseResult = searchQuerySchema.safeParse(req.query)
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Parámetros de búsqueda inválidos',
        issues: parseResult.error.issues,
      })
      return
    }

    const { q, limit } = parseResult.data
    const projectId = scopedProjectId(req)

    const [assets, documents, locations, plans, events, assetTypes, statuses, fields, preventivePlans, history] = await Promise.all([
      prisma.asset.findMany({
        where: {
          projectId,
          deletedAt: null,
          OR: [
            { code: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
            { serialNumber: { contains: q, mode: 'insensitive' } },
            { location: { name: { contains: q, mode: 'insensitive' } } },
            { type: { name: { contains: q, mode: 'insensitive' } } },
          ],
        },
        select: {
          id: true,
          code: true,
          name: true,
          serialNumber: true,
          location: { select: { id: true, name: true, label: true } },
          type: { select: { id: true, name: true, iconKey: true, color: true } },
          status: { select: { id: true, name: true, color: true, pulseDot: true } },
        },
        orderBy: [{ id: 'asc' }],
        take: limit,
      }),

      prisma.document.findMany({
        where: {
          projectId,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { type: { contains: q, mode: 'insensitive' } },
            { eventTitle: { contains: q, mode: 'insensitive' } },
            { assets: { some: { asset: { code: { contains: q, mode: 'insensitive' } } } } },
            { versions: { some: { originalName: { contains: q, mode: 'insensitive' } } } },
          ],
        },
        select: {
          id: true,
          name: true,
          type: true,
          periodicity: true,
          assets: {
            take: 3,
            select: {
              asset: { select: { id: true, code: true, name: true } },
            },
          },
        },
        orderBy: [{ id: 'asc' }],
        take: limit,
      }),

      prisma.location.findMany({
        where: {
          projectId,
          OR: [
            { code: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
            { label: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          code: true,
          name: true,
          label: true,
          parent: { select: { id: true, name: true, label: true } },
        },
        orderBy: [{ id: 'asc' }],
        take: limit,
      }),

      prisma.floorPlan.findMany({
        where: {
          projectId,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { location: { name: { contains: q, mode: 'insensitive' } } },
            { location: { code: { contains: q, mode: 'insensitive' } } },
          ],
        },
        select: {
          id: true,
          name: true,
          location: { select: { id: true, code: true, name: true, label: true } },
        },
        orderBy: [{ id: 'asc' }],
        take: limit,
      }),

      prisma.event.findMany({
        where: {
          projectId,
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { type: { contains: q, mode: 'insensitive' } },
            { asset: { code: { contains: q, mode: 'insensitive' } } },
            { asset: { name: { contains: q, mode: 'insensitive' } } },
          ],
        },
        select: {
          id: true,
          title: true,
          type: true,
          date: true,
          asset: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ date: 'asc' }],
        take: limit,
      }),

      prisma.assetType.findMany({
        where: { projectId, isActive: true, name: { contains: q, mode: 'insensitive' } },
        select: { id: true, name: true, iconKey: true, color: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        take: limit,
      }),

      prisma.status.findMany({
        where: { projectId, isActive: true, name: { contains: q, mode: 'insensitive' } },
        select: { id: true, name: true, color: true, pulseDot: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        take: limit,
      }),

      prisma.dynamicFieldDefinition.findMany({
        where: {
          projectId,
          isActive: true,
          OR: [
            { fieldName: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { groupName: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, fieldName: true, fieldType: true, groupName: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        take: limit,
      }),

      prisma.preventivePlan.findMany({
        where: {
          projectId,
          isActive: true,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, description: true, periodicity: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: limit,
      }),

      prisma.auditLog.findMany({
        where: {
          projectId,
          OR: [
            { action: { contains: q, mode: 'insensitive' } },
            { entityId: { contains: q, mode: 'insensitive' } },
            { detail: { contains: q, mode: 'insensitive' } },
            { user: { name: { contains: q, mode: 'insensitive' } } },
          ],
        },
        select: { id: true, action: true, entityId: true, detail: true, timestamp: true },
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        take: limit,
      }),
    ])

    const formattedAssets = assets.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      serialNumber: a.serialNumber,
      locationName: a.location?.label ?? a.location?.name ?? null,
      typeName: a.type.name,
      typeIconKey: a.type.iconKey,
      typeColor: a.type.color,
      statusName: a.status.name,
      statusColor: a.status.color,
      pulseDot: a.status.pulseDot,
    }))

    const formattedDocuments = documents.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      periodicity: d.periodicity,
      assetCodes: d.assets.map((a) => a.asset.code),
    }))

    const formattedLocations = locations.map((l) => ({
      id: l.id,
      code: l.code,
      name: l.name,
      label: l.label,
      parentName: l.parent?.label ?? l.parent?.name ?? null,
    }))

    const formattedPlans = plans.map((p) => ({
      id: p.id,
      name: p.name,
      locationName: p.location.label ?? p.location.name,
      locationCode: p.location.code,
    }))

    const formattedEvents = events.map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      date: e.date.toISOString(),
      assetCode: e.asset?.code ?? null,
      assetName: e.asset?.name ?? null,
    }))

    const settings = [
      ...assetTypes.map((type) => ({
        id: `asset-type:${type.id}`,
        kind: 'Tipo de activo',
        title: type.name,
        subtitle: `Icono: ${type.iconKey} · Color: ${type.color}`,
        path: `/projects/${projectId}/config/asset-types`,
      })),
      ...statuses.map((status) => ({
        id: `status:${status.id}`,
        kind: 'Estado',
        title: status.name,
        subtitle: `Color: ${status.color}${status.pulseDot ? ' · Alerta pulsante' : ''}`,
        path: `/projects/${projectId}/config/statuses`,
      })),
      ...fields.map((field) => ({
        id: `dynamic-field:${field.id}`,
        kind: 'Campo dinámico',
        title: field.fieldName,
        subtitle: `${field.fieldType}${field.groupName ? ` · ${field.groupName}` : ''}`,
        path: `/projects/${projectId}/config/dynamic-fields`,
      })),
      ...preventivePlans.map((plan) => ({
        id: `preventive-plan:${plan.id}`,
        kind: 'Plan preventivo',
        title: plan.name,
        subtitle: `${plan.periodicity}${plan.description ? ` · ${plan.description}` : ''}`,
        path: `/projects/${projectId}/config/preventives`,
      })),
    ]

    const formattedHistory = history.map((entry) => ({
      id: entry.id,
      action: entry.action,
      entityId: entry.entityId,
      detail: entry.detail,
      timestamp: entry.timestamp.toISOString(),
    }))

    const totalMatches =
      formattedAssets.length +
      formattedDocuments.length +
      formattedLocations.length +
      formattedPlans.length +
      formattedEvents.length +
      settings.length +
      formattedHistory.length

    res.json({
      query: q,
      assets: formattedAssets,
      documents: formattedDocuments,
      locations: formattedLocations,
      plans: formattedPlans,
      events: formattedEvents,
      settings,
      history: formattedHistory,
      totalMatches,
    })
  }),
)

export default router
