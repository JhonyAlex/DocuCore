import { calendarConfig, calendarEvents } from '@/data/mock'

export default function CalendarView() {
  const { daysInMonth, firstDayOffset, today, monthLabel } = calendarConfig
  const emptyCells = Array.from({ length: firstDayOffset })
  const dayCells = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  return (
    <section className="fade-in">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendario</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Eventos, vencimientos, calibraciones y mantenimientos</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-1">
            <button className="px-3 py-1.5 text-sm rounded-md bg-brand-600 text-white">Mes</button>
            <button className="px-3 py-1.5 text-sm rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Semana</button>
            <button className="px-3 py-1.5 text-sm rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Día</button>
          </div>
          <button className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium flex items-center gap-1.5">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Nuevo evento
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg></button>
            <button className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg></button>
            <h2 className="text-lg font-semibold ml-2">{monthLabel}</h2>
            <button className="ml-2 px-3 py-1 rounded-md text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700">Hoy</button>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" />Vencimiento</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />Calibración</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand-500" />Mantenimiento</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />Revisión</span>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
            <div key={d} className="p-2 text-center font-medium">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 text-sm">
          {emptyCells.map((_, i) => (
            <div key={`empty-${i}`} className="cal-cell border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-2" />
          ))}
          {dayCells.map((day) => {
            const isToday = day === today
            const events = calendarEvents.filter((e) => e.day === day)
            return (
              <div key={day} className="cal-cell border border-slate-100 dark:border-slate-800 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer">
                <div className="flex items-center justify-between mb-1">
                  <span className={isToday ? 'w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-semibold flex items-center justify-center' : 'text-xs font-medium'}>{day}</span>
                </div>
                <div className="space-y-1">
                  {events.map((e, ei) => (
                    <div key={ei} className={`${e.colorClass} text-white text-[10px] px-1.5 py-0.5 rounded truncate`}>{e.title}</div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
