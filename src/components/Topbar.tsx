import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '@/hooks/useTheme'
import { routeLabels } from '@/lib/navigation'
import { pageDescriptions, pageLabels } from '@/lib/pageMetadata'
import { useAssetCreateRequest } from '@/contexts/AssetCreateContext'
import { useNotifications } from '@/contexts/NotificationContext'
import { useProject } from '@/contexts/ProjectContext'
import { useSidebar } from '@/contexts/SidebarContext'
import GlobalSearchModal from '@/components/GlobalSearchModal'
import NotificationsPopover from '@/components/NotificationsPopover'

export default function Topbar() {
  const { isDark, toggle } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const { requestCreate } = useAssetCreateRequest()
  const { unreadCount, isOpen, toggleOpen } = useNotifications()
  const { project } = useProject()
  const { collapsed, toggle: toggleSidebar } = useSidebar()
  const [searchOpen, setSearchOpen] = useState(false)
  const scopedPath = location.pathname.replace(/^\/projects\/\d+/, '') || '/dashboard'
  const label = pageLabels[scopedPath] ?? routeLabels[scopedPath] ?? 'Panel general'
  const description = pageDescriptions[scopedPath] ?? 'Espacio de trabajo DocuCore'

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const openAssetForm = () => {
    if (!project || project.status === 'ARCHIVED') {
      void navigate('/projects')
      return
    }
    requestCreate()
    void navigate(`/projects/${project.id}/assets`)
  }

  return (
    <>
      <header className="grid h-16 grid-cols-[minmax(0,1fr)_minmax(10rem,auto)_minmax(0,1fr)] items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 md:px-6">
        <div className="flex min-w-0 items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <button type="button" onClick={toggleSidebar} aria-label={collapsed ? 'Desplegar panel lateral' : 'Plegar panel lateral'} aria-pressed={collapsed} title={collapsed ? 'Desplegar panel lateral' : 'Plegar panel lateral'} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100">
            <svg className={`h-4 w-4 transition-transform ${collapsed ? '' : 'rotate-180'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
          </button>
          <span className="hidden sm:inline">DocuCore</span>
          <svg className="hidden h-3 w-3 opacity-50 sm:inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
          <span className="truncate font-medium text-slate-800 dark:text-slate-200">{label}</span>
        </div>

        <div className="pointer-events-none min-w-0 text-center">
          <h1 className="truncate text-sm font-semibold leading-tight text-slate-800 dark:text-slate-100">{label}</h1>
          <div className="truncate text-[11px] leading-tight text-slate-500 dark:text-slate-400">{description}</div>
        </div>

        <div className="flex min-w-0 items-center justify-self-end gap-2">
          <div className="relative hidden md:block">
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input id="topbar-search-input" readOnly onClick={() => setSearchOpen(true)} onFocus={() => setSearchOpen(true)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSearchOpen(true) } }} placeholder="Buscar…" className="w-56 cursor-pointer rounded-lg border border-transparent bg-slate-100 py-2 pl-9 pr-12 text-sm focus:border-brand-500 focus:bg-white focus:outline-none dark:bg-slate-800 dark:focus:bg-slate-900" />
            <kbd className="kbd pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 border border-slate-300 bg-white text-slate-500 dark:border-slate-600 dark:bg-slate-700">⌘K</kbd>
          </div>

          <div id="topbar-section-actions" className="hidden items-center gap-2 xl:flex" />

          <div className="relative">
            <button type="button" onClick={toggleOpen} className="relative rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" title="Notificaciones" aria-label="Notificaciones" aria-expanded={isOpen}>
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              {unreadCount > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" />}
            </button>
            <NotificationsPopover />
          </div>

          <button onClick={toggle} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" title="Cambiar tema">
            <svg className={`h-5 w-5${isDark ? ' hidden' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
            <svg className={`h-5 w-5${!isDark ? ' hidden' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
          </button>

          <button type="button" onClick={openAssetForm} disabled={!project || project.status === 'ARCHIVED'} title={project?.status === 'ARCHIVED' ? 'Los proyectos archivados no permiten altas' : undefined} className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" /></svg>
            <span>Nuevo activo</span>
          </button>
        </div>
      </header>
      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
