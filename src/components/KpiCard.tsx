import type { DashboardKpi } from '@/types'
import type { ReactNode } from 'react'

const kpiIcons: Record<string, ReactNode> = {
  box: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>,
  warning: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  calendar: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  info: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>,
}

export default function KpiCard({ kpi }: { kpi: DashboardKpi }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500 dark:text-slate-400">{kpi.label}</div>
        <div className={`w-9 h-9 rounded-lg ${kpi.iconBgClass} flex items-center justify-center`}>
          {kpiIcons[kpi.iconKey]}
        </div>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-3xl font-semibold">{kpi.value}</div>
        <span className={`chip ${kpi.chipClass}`}>{kpi.chipText}</span>
      </div>
      {kpi.progress !== undefined ? (
        <div className="mt-3 h-1 bg-slate-100 dark:bg-slate-800 rounded">
          <div className="h-full bg-gradient-to-r from-brand-500 to-brand-300 rounded" style={{ width: `${kpi.progress}%` }} />
        </div>
      ) : (
        kpi.footer && <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">{kpi.footer}</div>
      )}
    </div>
  )
}
