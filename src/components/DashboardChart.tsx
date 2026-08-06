import { chartBars } from '@/data/mock'

export default function DashboardChart() {
  return (
    <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Evolución de eventos y vencimientos</h2>
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand-500" />Vencimientos</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />Completados</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" />Incidencias</span>
        </div>
      </div>
      <div className="h-60 flex items-end gap-2">
        {chartBars.map((bar) => (
          <div key={bar.month} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex gap-1 items-end h-52">
              <div className="flex-1 bg-brand-500 rounded-t" style={{ height: `${bar.vencimientos}%` }} />
              <div className="flex-1 bg-emerald-500 rounded-t" style={{ height: `${bar.completados}%` }} />
              <div className="flex-1 bg-red-400 rounded-t" style={{ height: `${bar.incidencias}%` }} />
            </div>
            <div className={`text-xs text-slate-500${bar.isCurrent ? ' font-medium' : ''}`}>{bar.month}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
