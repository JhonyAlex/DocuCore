import { Prisma } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { assetEventClock } from '../lib/assetEvents'
import { asCalendarDate } from '../lib/calendarDomain'
import { listCalendarOccurrences } from '../lib/calendarEvents'
import { scopedProjectId } from '../lib/projectScope'

const router: Router = Router({ mergeParams: true })
const DAY_MS = 86_400_000

const dashboardQuerySchema = z.object({
  range: z.enum(['30d', '7d', 'year']).default('30d'),
})

type ProjectSummary = { id: number; code: string; name: string }
type MonthlyDashboardRow = { month: Date; expirations: bigint; completed: bigint; incidents: bigint }
type ExpiringDocumentRow = {
  id: number
  name: string
  eventTitle: string | null
  type: string
  expiryDate: Date
  assetId: number | null
  assetCode: string | null
  locationName: string | null
  responsibleName: string | null
}

function asCount(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days))
}

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function monthKey(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(value: Date): string {
  return new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' })
    .format(value)
    .replace('.', '')
    .replace(/^./, (letter) => letter.toUpperCase())
}

function formatRelativeTime(date: Date, now: Date): string {
  const difference = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    - Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())) / DAY_MS)
  const time = `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
  if (difference === 0) return `Hoy · ${time}`
  if (difference === 1) return `Ayer · ${time}`
  return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')} · ${time}`
}

function actionDotColor(action: string): string {
  const normalized = action.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  if (normalized.includes('complet') || normalized.includes('realiz')) return 'bg-emerald-500'
  if (normalized.includes('creaci') || normalized.includes('subid')) return 'bg-brand-500'
  if (normalized.includes('elimin') || normalized.includes('baja')) return 'bg-red-500'
  if (normalized.includes('cambio') || normalized.includes('actualiz')) return 'bg-amber-500'
  return 'bg-slate-400'
}

function dateChip(date: string, now: Date): { text: string; className: string; pulseDot?: 'red' | 'amber' } {
  const eventDay = new Date(`${date}T00:00:00.000Z`)
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const difference = Math.round((eventDay.getTime() - today) / DAY_MS)
  if (difference < 0) {
    return { text: `Vencido hace ${Math.abs(difference)} ${Math.abs(difference) === 1 ? 'día' : 'días'}`, className: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300', pulseDot: 'red' }
  }
  if (difference === 0) return { text: 'Vence hoy', className: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300', pulseDot: 'red' }
  if (difference <= 7) return { text: `Vence en ${difference} ${difference === 1 ? 'día' : 'días'}`, className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', pulseDot: 'amber' }
  return { text: `Vence en ${difference} días`, className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' }
}

function expirationVisual(source: 'event' | 'document' | 'dynamic-date' | 'preventive', category: string) {
  if (source === 'document') return { iconBgClass: 'bg-red-50 dark:bg-red-900/30 text-red-600', iconKey: 'file' }
  if (category === 'maintenance' || source === 'preventive') return { iconBgClass: 'bg-brand-50 dark:bg-brand-900/30 text-brand-600', iconKey: 'heart' }
  return { iconBgClass: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600', iconKey: 'grid' }
}

async function resolveProject(id: number): Promise<ProjectSummary> {
  return prisma.project.findUniqueOrThrow({ where: { id }, select: { id: true, code: true, name: true } })
}

async function monthlyChart(projectId: number, now: Date) {
  const chartEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  const chartStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1))
  const rows = await prisma.$queryRaw<MonthlyDashboardRow[]>(Prisma.sql`
    WITH months AS (
      SELECT generate_series(date_trunc('month', ${chartStart}::timestamp), date_trunc('month', ${now}::timestamp), interval '1 month') AS month
    ), expirations AS (
      SELECT date_trunc('month', event."date") AS month, count(*)::bigint AS value
      FROM "Event" event
      WHERE event."projectId" = ${projectId} AND event."date" >= ${chartStart} AND event."date" < ${chartEnd}
      GROUP BY 1
      UNION ALL
      SELECT date_trunc('month', version."expiryDate") AS month, count(*)::bigint AS value
      FROM "Document" document
      JOIN LATERAL (
        SELECT "expiryDate" FROM "DocumentVersion"
        WHERE "documentId" = document.id
        ORDER BY version DESC
        LIMIT 1
      ) version ON version."expiryDate" IS NOT NULL
      WHERE document."projectId" = ${projectId} AND version."expiryDate" >= ${chartStart} AND version."expiryDate" < ${chartEnd}
      GROUP BY 1
      UNION ALL
      SELECT date_trunc('month', occurrence."scheduledDate") AS month, count(*)::bigint AS value
      FROM "AssetDateOccurrence" occurrence
      JOIN "AssetDateSchedule" schedule ON schedule.id = occurrence."scheduleId"
      JOIN "Asset" asset ON asset.id = schedule."assetId"
      WHERE asset."projectId" = ${projectId} AND asset."deletedAt" IS NULL
        AND occurrence."scheduledDate" >= ${chartStart} AND occurrence."scheduledDate" < ${chartEnd}
      GROUP BY 1
      UNION ALL
      SELECT date_trunc('month', execution."scheduledDate") AS month, count(*)::bigint AS value
      FROM "PreventiveExecution" execution
      JOIN "AssetPreventivePlan" plan ON plan.id = execution."planId"
      JOIN "Asset" asset ON asset.id = plan."assetId"
      WHERE asset."projectId" = ${projectId} AND asset."deletedAt" IS NULL
        AND execution."scheduledDate" >= ${chartStart} AND execution."scheduledDate" < ${chartEnd}
      GROUP BY 1
    ), completed AS (
      SELECT date_trunc('month', log.timestamp) AS month, count(*)::bigint AS value
      FROM "AuditLog" log
      WHERE log."projectId" = ${projectId} AND log.timestamp >= ${chartStart} AND log.timestamp < ${chartEnd}
        AND (log.action ILIKE '%complet%' OR log.action ILIKE '%realiz%')
      GROUP BY 1
    ), incidents AS (
      SELECT date_trunc('month', log.timestamp) AS month, count(*)::bigint AS value
      FROM "AuditLog" log
      WHERE log."projectId" = ${projectId} AND log.timestamp >= ${chartStart} AND log.timestamp < ${chartEnd}
        AND (log.action ILIKE '%cambio estado%' OR log.action ILIKE '%incidencia%')
      GROUP BY 1
    )
    SELECT months.month,
      COALESCE((SELECT sum(value) FROM expirations WHERE expirations.month = months.month), 0)::bigint AS expirations,
      COALESCE((SELECT sum(value) FROM completed WHERE completed.month = months.month), 0)::bigint AS completed,
      COALESCE((SELECT sum(value) FROM incidents WHERE incidents.month = months.month), 0)::bigint AS incidents
    FROM months
    ORDER BY months.month
  `)
  const maximum = Math.max(1, ...rows.flatMap((row) => [asCount(row.expirations), asCount(row.completed), asCount(row.incidents)]))
  return rows.map((row) => ({
    month: monthLabel(row.month),
    vencimientos: Math.round((asCount(row.expirations) / maximum) * 100),
    completados: Math.round((asCount(row.completed) / maximum) * 100),
    incidencias: Math.round((asCount(row.incidents) / maximum) * 100),
    vencimientosCount: asCount(row.expirations),
    completadosCount: asCount(row.completed),
    incidenciasCount: asCount(row.incidents),
    isCurrent: monthKey(row.month) === monthKey(now),
  }))
}

async function buildDashboard(project: ProjectSummary, range: '30d' | '7d' | 'year') {
  const now = assetEventClock()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const rangeEnd = range === 'year'
    ? new Date(Date.UTC(now.getUTCFullYear(), 11, 31))
    : addUtcDays(today, range === '7d' ? 7 : 30)
  const rangeStart = range === 'year' ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1)) : today
  const alertStart = addUtcDays(today, -30)

  const [
    totalAssets,
    newAssets,
    activeAssets,
    incidentAssets,
    documentStats,
    expiringDocuments,
    criticalAssets,
    activityLogs,
    calendar,
    chartBars,
    manualEvents,
    dateOccurrences,
    preventiveExecutions,
  ] = await Promise.all([
    prisma.asset.count({ where: { projectId: project.id, deletedAt: null } }),
    prisma.asset.count({ where: { projectId: project.id, deletedAt: null, createdAt: { gte: monthStart(now) } } }),
    prisma.asset.count({ where: { projectId: project.id, deletedAt: null, status: { color: 'emerald' } } }),
    prisma.asset.count({ where: { projectId: project.id, deletedAt: null, status: { OR: [{ color: 'red' }, { pulseDot: 'red' }] } } }),
    prisma.$queryRaw<Array<{ total: bigint; expired: bigint; upcoming: bigint }>>(Prisma.sql`
      SELECT count(*)::bigint AS total,
        count(*) FILTER (WHERE current_version."expiryDate" < ${today})::bigint AS expired,
        count(*) FILTER (WHERE current_version."expiryDate" >= ${today})::bigint AS upcoming
      FROM "Document" document
      JOIN LATERAL (
        SELECT "expiryDate" FROM "DocumentVersion"
        WHERE "documentId" = document.id
        ORDER BY version DESC
        LIMIT 1
      ) current_version ON current_version."expiryDate" IS NOT NULL
      WHERE document."projectId" = ${project.id} AND current_version."expiryDate" <= ${rangeEnd}
        AND (document."eventTitle" IS NOT NULL OR EXISTS (
          SELECT 1 FROM "DocumentItem" item
          JOIN "Asset" asset ON asset.id = item."assetId" AND asset."deletedAt" IS NULL
          WHERE item."documentId" = document.id
        ))
    `),
    prisma.$queryRaw<ExpiringDocumentRow[]>(Prisma.sql`
      SELECT document.id, document.name, document."eventTitle", document.type,
        current_version."expiryDate" AS "expiryDate",
        linked_asset.id AS "assetId", linked_asset.code AS "assetCode",
        COALESCE(location.label, location.name) AS "locationName", responsible.name AS "responsibleName"
      FROM "Document" document
      JOIN LATERAL (
        SELECT "expiryDate" FROM "DocumentVersion"
        WHERE "documentId" = document.id
        ORDER BY version DESC
        LIMIT 1
      ) current_version ON current_version."expiryDate" IS NOT NULL
      LEFT JOIN LATERAL (
        SELECT asset.id, asset.code, asset."locationId", asset."responsibleId"
        FROM "DocumentItem" item
        JOIN "Asset" asset ON asset.id = item."assetId" AND asset."deletedAt" IS NULL
        WHERE item."documentId" = document.id
        ORDER BY item."assetId"
        LIMIT 1
      ) linked_asset ON true
      LEFT JOIN "Location" location ON location.id = linked_asset."locationId"
      LEFT JOIN "User" responsible ON responsible.id = linked_asset."responsibleId"
      WHERE document."projectId" = ${project.id} AND current_version."expiryDate" <= ${rangeEnd}
        AND (document."eventTitle" IS NOT NULL OR linked_asset.id IS NOT NULL)
      ORDER BY current_version."expiryDate" ASC, document.id ASC
      LIMIT 5
    `),
    prisma.asset.findMany({
      where: { projectId: project.id, deletedAt: null, status: { OR: [{ color: 'red' }, { pulseDot: 'red' }] } },
      select: { id: true, code: true, name: true, status: { select: { name: true } }, location: { select: { label: true, name: true } } },
      orderBy: { id: 'asc' },
      take: 5,
    }),
    prisma.auditLog.findMany({
      where: { projectId: project.id },
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: 5,
      include: { user: { select: { name: true } } },
    }),
    listCalendarOccurrences(prisma, {
      projectId: project.id,
      from: asCalendarDate(alertStart),
      to: asCalendarDate(rangeEnd),
      limit: 20,
    }),
    monthlyChart(project.id, now),
    prisma.event.count({ where: { projectId: project.id, completedAt: null, date: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.assetDateOccurrence.count({ where: { completedAt: null, scheduledDate: { gte: rangeStart, lte: rangeEnd }, schedule: { asset: { projectId: project.id, deletedAt: null } } } }),
    prisma.preventiveExecution.count({ where: { completedAt: null, scheduledDate: { gte: rangeStart, lte: rangeEnd }, plan: { isActive: true, asset: { projectId: project.id, deletedAt: null } } } }),
  ])

  const docCounts = documentStats[0] ?? { total: 0n, expired: 0n, upcoming: 0n }
  const totalUpcomingEvents = manualEvents + dateOccurrences + preventiveExecutions + asCount(docCounts.upcoming)
  const intervalLabel = range === 'year' ? 'este año' : `próximos ${range === '7d' ? '7' : '30'} días`

  const documentExpirations = expiringDocuments.map((document) => {
    const date = document.expiryDate.toISOString().slice(0, 10)
    const chip = dateChip(date, now)
    return {
      id: `document:${document.id}`,
      title: `${document.eventTitle ?? document.name}${document.assetCode ? ` · ${document.assetCode}` : ''}`,
      subtitle: [document.type, document.locationName, document.responsibleName ? `Responsable: ${document.responsibleName}` : null].filter(Boolean).join(' · '),
      ...expirationVisual('document', 'expiry'),
      chipText: chip.text,
      chipClass: chip.className,
      pulseDot: chip.pulseDot,
      targetType: document.assetId ? ('asset' as const) : ('docs' as const),
      targetId: document.assetId ?? undefined,
      searchQuery: document.assetId ? undefined : document.name,
      date,
    }
  })
  const calendarExpirations = calendar.events
    .filter((event) => event.status !== 'completed')
    .map((event) => {
      const chip = dateChip(event.date, now)
      return {
        id: event.id,
        title: `${event.title}${event.asset ? ` · ${event.asset.code}` : ''}`,
        subtitle: [event.sourceLabel, event.asset?.location, event.asset?.name].filter(Boolean).join(' · '),
        ...expirationVisual(event.source, event.category),
        chipText: chip.text,
        chipClass: chip.className,
        pulseDot: chip.pulseDot,
        targetType: event.assetId ? ('asset' as const) : ('calendar' as const),
        targetId: event.assetId ?? undefined,
        date: event.date,
      }
    })
  const seenExpirationIds = new Set<string>()
  const upcomingExpirations = [...documentExpirations, ...calendarExpirations]
    .sort((left, right) => left.date.localeCompare(right.date))
    .filter((entry) => {
      if (seenExpirationIds.has(entry.id)) return false
      seenExpirationIds.add(entry.id)
      return true
    })
    .slice(0, 5)
    .map(({ date: _date, ...entry }) => entry)

  const criticalAlerts = criticalAssets.map((asset) => ({
    id: `asset:${asset.id}`,
    title: `${asset.code} · ${asset.name}`,
    subtitle: `${asset.status.name}${asset.location ? ` · ${asset.location.label || asset.location.name}` : ''}`,
    alertClass: 'bg-red-50/70 dark:bg-red-900/20',
    borderClass: 'border-red-100 dark:border-red-900/50',
    dotColorClass: 'bg-red-500',
    pulseDot: 'red' as const,
    targetType: 'asset' as const,
    targetId: asset.id,
  }))
  const activityFeed = activityLogs.map((entry) => {
    const assetMatch = entry.entityId.match(/(?:asset:)?(\d+)/)
    const assetId = assetMatch ? Number(assetMatch[1]) : undefined
    return {
      id: entry.id,
      time: formatRelativeTime(entry.timestamp, now),
      text: `${entry.user.name} ${entry.action.toLocaleLowerCase('es')}`,
      detail: entry.detail,
      dotColorClass: actionDotColor(entry.action),
      entityId: entry.entityId,
      assetId,
      targetType: assetId ? ('asset' as const) : ('history' as const),
    }
  })

  return {
    project,
    referenceDate: now.toISOString(),
    kpis: [
      {
        id: 'assets', label: 'Activos totales', value: String(totalAssets), chipText: `+${newAssets} este mes`,
        chipClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
        iconBgClass: 'bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-300', iconKey: 'box',
        progress: totalAssets === 0 ? 0 : Math.round((activeAssets / totalAssets) * 100),
      },
      {
        id: 'docs', label: 'Documentos por vencer', value: String(asCount(docCounts.total)), chipText: `${asCount(docCounts.expired)} vencidos`,
        chipClass: asCount(docCounts.expired) > 0 ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
        iconBgClass: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300', iconKey: 'warning', footer: `${intervalLabel} · ${asCount(docCounts.upcoming)} documentos`,
      },
      {
        id: 'events', label: 'Eventos próximos', value: String(totalUpcomingEvents), chipText: `${calendar.counts.overdue} atrasados`,
        chipClass: calendar.counts.overdue > 0 ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
        iconBgClass: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300', iconKey: 'calendar', footer: `Pendientes en ${intervalLabel}`,
      },
      {
        id: 'incidents', label: 'Incidencias abiertas', value: String(incidentAssets), chipText: `${criticalAssets.length} críticas`,
        chipClass: incidentAssets > 0 ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
        iconBgClass: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300', iconKey: 'info', footer: 'Estados críticos del catálogo actual',
      },
    ],
    upcomingExpirations,
    criticalAlerts,
    criticalAlertCount: criticalAssets.length,
    chartBars,
    activityFeed,
  }
}

function escapeCsv(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`
}

router.get('/', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store')
  const query = dashboardQuerySchema.parse(req.query)
  const project = await resolveProject(scopedProjectId(req))
  res.json(await buildDashboard(project, query.range))
}))

router.get('/export', asyncHandler(async (req, res) => {
  const query = dashboardQuerySchema.parse(req.query)
  const project = await resolveProject(scopedProjectId(req))
  const dashboard = await buildDashboard(project, query.range)
  const rows = [
    ['DocuCore - Reporte Ejecutivo de Panel General'],
    ['Proyecto', dashboard.project.name],
    ['Fecha de referencia', dashboard.referenceDate.slice(0, 10)],
    [],
    ['INDICADORES'],
    ['Indicador', 'Valor', 'Resumen'],
    ...dashboard.kpis.map((kpi) => [kpi.label, kpi.value, kpi.chipText]),
    [],
    ['PRÓXIMOS VENCIMIENTOS'],
    ['Elemento', 'Detalle', 'Estado'],
    ...dashboard.upcomingExpirations.map((item) => [item.title, item.subtitle, item.chipText]),
    [],
    ['ALERTAS CRÍTICAS'],
    ['Elemento', 'Detalle'],
    ...dashboard.criticalAlerts.map((item) => [item.title, item.subtitle]),
  ]
  const csv = `\uFEFF${rows.map((row) => row.map((value) => escapeCsv(value ?? '')).join(';')).join('\r\n')}`
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="dashboard-${project.code}-${dashboard.referenceDate.slice(0, 10)}.csv"`)
  res.send(csv)
}))

export default router
