import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import KpiCard from '@/components/KpiCard'
import DashboardChart from '@/components/DashboardChart'
import { fetchDashboard, downloadDashboardExport, type ApiDashboardResponse } from '@/lib/api'
import { useSession } from '@/contexts/SessionContext'

const expirationIcons: Record<string, ReactNode> = {
  file: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
  heart: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>,
  grid: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v18H3z" /><path d="M3 9h18M9 21V9" /></svg>,
}

function formatSpanishDate(isoDateString: string): string {
  const date = new Date(isoDateString)
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(utcDate)
}

export default function DashboardView() {
  const navigate = useNavigate()
  const { session } = useSession()
  const [range, setRange] = useState<'30d' | '7d' | 'year'>('30d')
  const [dashboardData, setDashboardData] = useState<ApiDashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchDashboard({
        projectId: session?.project.id,
        range,
      })
      setDashboardData(data)
    } catch {
      setDashboardData(null)
      setError('No se pudo cargar el resumen del proyecto.')
    } finally {
      setLoading(false)
    }
  }, [session?.project.id, range])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadDashboardExport({
        projectId: session?.project.id,
        range,
      })
    } catch {
      // Error silencioso de descarga
    } finally {
      setExporting(false)
    }
  }

  const kpis = dashboardData?.kpis ?? []
  const upcoming = dashboardData?.upcomingExpirations ?? []
  const alerts = dashboardData?.criticalAlerts ?? []
  const bars = dashboardData?.chartBars ?? []
  const activity = dashboardData?.activityFeed ?? []

  const projectName = dashboardData?.project.name ?? session?.project.name ?? 'Sin proyecto'
  const formattedDate = dashboardData ? formatSpanishDate(dashboardData.referenceDate) : 'Cargando datos…'

  // Enlazar navegación a KPIs
  const interactiveKpis = kpis.map((kpi) => {
    let onClick: (() => void) | undefined
    if (kpi.id === 'assets') {
      onClick = () => navigate('/assets')
    } else if (kpi.id === 'docs') {
      onClick = () => navigate('/docs')
    } else if (kpi.id === 'events') {
      onClick = () => navigate('/calendar')
    } else if (kpi.id === 'incidents') {
      onClick = () => navigate('/assets')
    }
    return { ...kpi, onClick }
  })

  return (
    <section className="fade-in">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Panel general</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Resumen del proyecto <span className="font-medium text-slate-700 dark:text-slate-300">{projectName}</span> · {formattedDate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as '30d' | '7d' | 'year')}
            className="text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          >
            <option value="30d">Últimos 30 días</option>
            <option value="7d">Últimos 7 días</option>
            <option value="year">Este año</option>
          </select>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            className="text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            {exporting ? 'Exportando…' : 'Exportar'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {loading && !dashboardData
          ? Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
          ))
          : interactiveKpis.map((kpi) => <KpiCard key={kpi.id} kpi={kpi} />)}
      </div>

      {error && (
        <div role="alert" className="mb-6 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          <span>{error}</span>
          <button type="button" onClick={() => void loadData()} className="font-medium underline">Reintentar</button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Próximos vencimientos</h2>
            <button
              type="button"
              onClick={() => navigate('/calendar')}
              className="text-sm text-brand-600 hover:text-brand-700"
            >
              Ver todos →
            </button>
          </div>
          <div className="space-y-2">
            {upcoming.length === 0 && !loading && (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No hay vencimientos programados en este periodo.</p>
            )}
            {upcoming.map((exp) => {
              const handleItemClick = () => {
                if (exp.targetType === 'asset' && exp.targetId) {
                  navigate(`/assets?assetId=${exp.targetId}`)
                } else if (exp.targetType === 'docs') {
                  navigate(exp.searchQuery ? `/docs?search=${encodeURIComponent(exp.searchQuery)}` : '/docs')
                } else {
                  navigate('/calendar')
                }
              }

              return (
                <div
                  key={exp.id}
                  role="button"
                  tabIndex={0}
                  onClick={handleItemClick}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleItemClick()
                    }
                  }}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition"
                >
                  <div className={`w-10 h-10 rounded-lg ${exp.iconBgClass} flex items-center justify-center`}>
                    {expirationIcons[exp.iconKey]}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{exp.title}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{exp.subtitle}</div>
                  </div>
                  <span className={`chip ${exp.chipClass}${exp.pulseDot ? ` pulse-dot ${exp.pulseDot}` : ''}`}>
                    {exp.pulseDot && <span className="relative w-1.5 h-1.5 rounded-full bg-red-500" />}
                    {exp.chipText}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Alertas críticas</h2>
            <span className="chip bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {alerts.length}
            </span>
          </div>
          <div className="space-y-3">
            {alerts.length === 0 && !loading && (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No hay alertas críticas activas.</p>
            )}
            {alerts.map((alert) => {
              const handleAlertClick = () => {
                if (alert.targetType === 'asset' && alert.targetId) {
                  navigate(`/assets?assetId=${alert.targetId}`)
                } else if (alert.targetType === 'assets-filter') {
                  navigate('/assets?search=Extintor')
                } else if (alert.targetType === 'docs') {
                  navigate('/docs')
                } else {
                  navigate('/assets')
                }
              }

              return (
                <div
                  key={alert.id}
                  role="button"
                  tabIndex={0}
                  onClick={handleAlertClick}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleAlertClick()
                    }
                  }}
                  className={`p-3 rounded-lg ${alert.alertClass} border ${alert.borderClass} cursor-pointer hover:shadow-sm transition`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`w-2 h-2 mt-1.5 rounded-full ${alert.dotColorClass} pulse-dot ${alert.pulseDot}`} />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{alert.title}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{alert.subtitle}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">
        <DashboardChart
          bars={bars}
          onMonthClick={() => navigate('/calendar')}
        />
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Actividad reciente</h2>
            <button
              type="button"
              onClick={() => navigate('/history')}
              className="text-sm text-brand-600 hover:text-brand-700"
            >
              Ver historial
            </button>
          </div>
          <ol className="relative border-l border-slate-200 dark:border-slate-800 ml-3 space-y-4">
            {activity.length === 0 && !loading && (
              <li className="ml-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">Aún no hay actividad registrada.</li>
            )}
            {activity.map((item) => {
              const handleActivityClick = () => {
                if (item.assetId) {
                  navigate(`/assets?assetId=${item.assetId}`)
                } else {
                  navigate('/history')
                }
              }

              return (
                <li
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={handleActivityClick}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleActivityClick()
                    }
                  }}
                  className="ml-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 p-1.5 rounded transition -my-1.5"
                >
                  <span className={`absolute -left-1.5 flex items-center justify-center w-3 h-3 ${item.dotColorClass} rounded-full ring-4 ring-white dark:ring-slate-900`} />
                  <time className="text-xs text-slate-500 dark:text-slate-400">{item.time}</time>
                  <div className="text-sm font-medium">{item.text}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{item.detail}</div>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}
