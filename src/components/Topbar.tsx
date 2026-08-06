import { useLocation } from 'react-router-dom'
import { useTheme } from '@/hooks/useTheme'
import { routeLabels } from '@/lib/navigation'

export default function Topbar() {
  const { isDark, toggle } = useTheme()
  const location = useLocation()
  const label = routeLabels[location.pathname] ?? 'Panel general'

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur px-6 flex items-center gap-4">
      <div className="text-sm text-slate-500 dark:text-slate-400">
        <span>DocuCore</span>
        <svg className="w-3 h-3 inline mx-1 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
        <span className="text-slate-800 dark:text-slate-200 font-medium">{label}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative hidden md:block">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input placeholder="Buscar activos, documentos, ubicaciones…" className="pl-9 pr-16 py-2 w-80 rounded-lg bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-brand-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none text-sm" />
          <kbd className="kbd absolute right-2 top-1/2 -translate-y-1/2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-500">⌘K</kbd>
        </div>

        <button className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 relative" title="Notificaciones">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900"></span>
        </button>

        <button onClick={toggle} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" title="Cambiar tema">
          <svg className={`w-5 h-5${isDark ? ' hidden' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
          <svg className={`w-5 h-5${!isDark ? ' hidden' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
        </button>

        <button className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium flex items-center gap-1.5">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Nuevo ítem
        </button>
      </div>
    </header>
  )
}
