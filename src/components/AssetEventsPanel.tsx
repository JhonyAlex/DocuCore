import type { ApiAsset } from '@/lib/api'
import { formatApiDate, mapApiAssetEventToDisplay } from '@/lib/assetMappers'

const cardStyles = {
  amber: 'border-amber-100 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-900/20',
  red: 'border-red-100 bg-red-50/70 dark:border-red-900/50 dark:bg-red-900/20',
  slate: 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50',
}

const sourceLabels = { event: 'Evento', document: 'Documento', 'dynamic-field': 'Característica' }

export default function AssetEventsPanel({ asset }: { asset: ApiAsset }) {
  const events = asset.nextEvents.map((event) => ({ ...mapApiAssetEventToDisplay(event), calendarDate: formatApiDate(event.date), sourceLabel: event.sourceLabel }))
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin">
      <div className="mb-3"><h4 className="font-medium">Eventos del activo</h4><p className="text-xs text-slate-500 dark:text-slate-400">Generados desde eventos, documentos y características con fecha.</p></div>
      {events.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Sin eventos programados.</div> : (
        <div className="space-y-2">
          {events.map((event) => (
            <div key={event.id} className={`flex items-center gap-3 rounded-lg border p-3 ${cardStyles[event.urgency]}`}>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm dark:bg-slate-900"><svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg></div>
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{event.label}</div><div className="text-xs text-slate-500 dark:text-slate-400">{event.calendarDate} · {sourceLabels[event.source]} · {event.sourceLabel}</div></div>
              <span className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-slate-600 dark:bg-slate-900 dark:text-slate-300">{event.date}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
