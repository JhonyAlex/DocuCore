import type { ReactNode } from 'react'
import KpiCard from '@/components/KpiCard'
import DashboardChart from '@/components/DashboardChart'
import { dashboardKpis, upcomingExpirations, alertItems, activityFeed } from '@/data/mock'

const expirationIcons: Record<string, ReactNode> = {
  file: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
  heart: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>,
  grid: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v18H3z" /><path d="M3 9h18M9 21V9" /></svg>,
}

export default function DashboardView() {
  return (
    <section className="fade-in">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Panel general</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Resumen del proyecto <span className="font-medium text-slate-700 dark:text-slate-300">Planta Industrial Norte</span> · miércoles, 15 de julio de 2026</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
            <option>Últimos 30 días</option>
            <option>Últimos 7 días</option>
            <option>Este año</option>
          </select>
          <button className="text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Exportar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {dashboardKpis.map((kpi) => <KpiCard key={kpi.id} kpi={kpi} />)}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Próximos vencimientos</h2>
            <button className="text-sm text-brand-600 hover:text-brand-700">Ver todos →</button>
          </div>
          <div className="space-y-2">
            {upcomingExpirations.map((exp) => (
              <div key={exp.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div className={`w-10 h-10 rounded-lg ${exp.iconBgClass} flex items-center justify-center`}>{expirationIcons[exp.iconKey]}</div>
                <div className="flex-1">
                  <div className="font-medium text-sm">{exp.title}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{exp.subtitle}</div>
                </div>
                <span className={`chip ${exp.chipClass}${exp.pulseDot ? ` pulse-dot ${exp.pulseDot}` : ''}`}>
                  {exp.pulseDot && <span className="relative w-1.5 h-1.5 rounded-full bg-red-500" />}
                  {exp.chipText}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Alertas críticas</h2>
            <span className="chip bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300">6</span>
          </div>
          <div className="space-y-3">
            {alertItems.map((alert) => (
              <div key={alert.id} className={`p-3 rounded-lg ${alert.alertClass} border ${alert.borderClass}`}>
                <div className="flex items-start gap-2">
                  <span className={`w-2 h-2 mt-1.5 rounded-full ${alert.dotColorClass} pulse-dot ${alert.pulseDot}`} />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{alert.title}</div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{alert.subtitle}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">
        <DashboardChart />
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Actividad reciente</h2>
            <button className="text-sm text-brand-600 hover:text-brand-700">Ver historial</button>
          </div>
          <ol className="relative border-l border-slate-200 dark:border-slate-800 ml-3 space-y-4">
            {activityFeed.map((item) => (
              <li key={item.id} className="ml-4">
                <span className={`absolute -left-1.5 flex items-center justify-center w-3 h-3 ${item.dotColorClass} rounded-full ring-4 ring-white dark:ring-slate-900`} />
                <time className="text-xs text-slate-500 dark:text-slate-400">{item.time}</time>
                <div className="text-sm font-medium">{item.text}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{item.detail}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
