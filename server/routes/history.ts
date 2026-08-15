import { Router } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import type { Prisma } from '@prisma/client'
import { scopedProjectId } from '../lib/projectScope'

const router: Router = Router({ mergeParams: true })

const historyQuerySchema = z.object({
  search: z.string().trim().optional(),
  userId: z.coerce.number().int().positive().optional(),
  action: z.string().trim().optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""'
  const str = String(value)
  return `"${str.replace(/"/g, '""')}"`
}

function formatCsvDateTime(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = date.getUTCFullYear()
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const min = String(date.getUTCMinutes()).padStart(2, '0')
  const ss = String(date.getUTCSeconds()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`
}

function buildHistoryWhere(
  projectId: number,
  query: z.infer<typeof historyQuerySchema>,
): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = { projectId }

  if (query.userId !== undefined) {
    where.userId = query.userId
  }

  if (query.action && query.action !== 'all' && query.action !== 'Todos los tipos de acción') {
    where.action = { contains: query.action, mode: 'insensitive' }
  }

  if (query.search && query.search.length > 0) {
    const s = query.search
    where.AND = [
      {
        OR: [
          { detail: { contains: s, mode: 'insensitive' } },
          { entityId: { contains: s, mode: 'insensitive' } },
          { action: { contains: s, mode: 'insensitive' } },
          { user: { name: { contains: s, mode: 'insensitive' } } },
        ],
      },
    ]
  }

  if (query.startDate || query.endDate) {
    const timestampFilter: Prisma.DateTimeFilter = {}
    if (query.startDate) {
      const start = new Date(query.startDate)
      if (!Number.isNaN(start.getTime())) {
        timestampFilter.gte = start
      }
    }
    if (query.endDate) {
      const endStr = query.endDate.includes('T') ? query.endDate : `${query.endDate}T23:59:59.999Z`
      const end = new Date(endStr)
      if (!Number.isNaN(end.getTime())) {
        timestampFilter.lte = end
      }
    }
    if (Object.keys(timestampFilter).length > 0) {
      where.timestamp = timestampFilter
    }
  }

  return where
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    const query = historyQuerySchema.parse(req.query)
    const projectId = scopedProjectId(req)
    const where = buildHistoryWhere(projectId, query)

    const [rows, total, availableActions] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              initials: true,
              color: true,
            },
          },
        },
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where: { projectId },
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      }),
    ])

    res.json({
      data: rows.map((r) => ({
        id: r.id,
        timestamp: r.timestamp.toISOString(),
        action: r.action,
        entityId: r.entityId,
        detail: r.detail,
        user: r.user,
      })),
      total,
      page: query.page,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
      limit: query.limit,
      availableActions: availableActions.map((a) => a.action),
    })
  }),
)

router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const query = historyQuerySchema.parse(req.query)
    const projectId = scopedProjectId(req)
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { code: true } })
    const where = buildHistoryWhere(projectId, query)

    const rows = await prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            name: true,
            initials: true,
          },
        },
      },
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: 5000,
    })

    const header = ['Fecha', 'Usuario', 'Acción', 'Entidad', 'Detalle'].map(escapeCsvField).join(';')
    const lines = rows.map((r) => [
      escapeCsvField(formatCsvDateTime(r.timestamp)),
      escapeCsvField(r.user.name),
      escapeCsvField(r.action),
      escapeCsvField(r.entityId),
      escapeCsvField(r.detail),
    ].join(';'))

    const nowFormatted = new Date().toISOString().slice(0, 10)
    const csvContent = `\uFEFF${[header, ...lines].join('\r\n')}`

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="historial-auditoria-${project.code}-${nowFormatted}.csv"`)
    res.send(csvContent)
  }),
)

export default router
