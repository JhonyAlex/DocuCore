import type { CalendarViewMode } from '@/lib/calendarDates'
import { calendarCategoryPresentation } from '@/lib/calendarPresentation'
import type { ApiCalendarEventCategory } from '@/lib/api'

interface CalendarToolbarProps {
  view: CalendarViewMode
  title: string
  activeCategories: Set<ApiCalendarEventCategory>
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
  onToggleCategory: (category: ApiCalendarEventCategory) => void
}

export default function CalendarToolbar({ view, title, activeCategories, onPrevious, onNext, onToday, onToggleCategory }: CalendarToolbarProps) {
  return <>
    <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Periodo anterior" onClick={onPrevious} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg></button>
        <button type="button" aria-label="Periodo siguiente" onClick={onNext} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg></button>
        <h2 className="text-lg font-semibold ml-2">{title}</h2>
        <button type="button" onClick={onToday} className="ml-2 px-3 py-1 rounded-md text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700">Hoy</button>
      </div>
      <div className="flex items-center gap-3 text-xs">
        {(Object.keys(calendarCategoryPresentation) as ApiCalendarEventCategory[]).map((category) => {
          const presentation = calendarCategoryPresentation[category]
          const selected = activeCategories.has(category)
          return <button key={category} type="button" aria-pressed={selected} onClick={() => onToggleCategory(category)} className={`flex items-center gap-1.5 transition-opacity ${selected ? '' : 'opacity-35'}`}><span className={`w-2.5 h-2.5 rounded-sm ${presentation.dotClass}`} />{presentation.label}</button>
        })}
      </div>
    </div>
    <div className="sr-only" aria-live="polite">Vista {view}: {title}</div>
  </>
}
