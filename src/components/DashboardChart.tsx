import type { ChartBar } from '@/types'

interface DashboardChartProps {
  bars: ChartBar[]
  onMonthClick?: (month: string) => void
}

export default function DashboardChart({ bars, onMonthClick }: DashboardChartProps) {
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
      {bars.length === 0 ? (
        <div className="h-60 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">No hay actividad en los últimos siete meses.</div>
      ) : (
        <div className="h-60 flex items-end gap-2">
          {bars.map((bar) => {
            const handleClick = () => {
              if (bar.onClick) bar.onClick()
              else if (onMonthClick) onMonthClick(bar.month)
            }
            const hasClick = Boolean(bar.onClick || onMonthClick)
            return (
              <div
                key={bar.month}
                role={hasClick ? 'button' : undefined}
                tabIndex={hasClick ? 0 : undefined}
                onClick={handleClick}
                onKeyDown={(event) => {
                  if (hasClick && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault()
                    handleClick()
                  }
                }}
                title={`Mes: ${bar.month}\n• Vencimientos: ${bar.vencimientosCount ?? bar.vencimientos}\n• Completados: ${bar.completadosCount ?? bar.completados}\n• Incidencias: ${bar.incidenciasCount ?? bar.incidencias}`}
                className={`flex-1 flex flex-col items-center gap-1 ${hasClick ? 'cursor-pointer group' : ''}`}
              >
                <div className="w-full flex gap-1 items-end h-52">
                  <div className="flex-1 bg-brand-500 rounded-t transition-all group-hover:opacity-90" style={{ height: `${bar.vencimientos}%` }} />
                  <div className="flex-1 bg-emerald-500 rounded-t transition-all group-hover:opacity-90" style={{ height: `${bar.completados}%` }} />
                  <div className="flex-1 bg-red-400 rounded-t transition-all group-hover:opacity-90" style={{ height: `${bar.incidencias}%` }} />
                </div>
                <div className={`text-xs text-slate-500${bar.isCurrent ? ' font-medium' : ''}`}>{bar.month}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
