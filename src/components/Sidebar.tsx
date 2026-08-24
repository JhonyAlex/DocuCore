import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { navItems } from '@/lib/navigation'
import { useSession } from '@/contexts/SessionContext'
import { useProject } from '@/contexts/ProjectContext'
import { useSidebar } from '@/contexts/SidebarContext'
import { fetchProjects, type ApiProjectSummary } from '@/lib/api'

const navGroups = ['Principal', 'Gestión', 'Administración'] as const

export default function Sidebar() {
  const { session, logout } = useSession()
  const { project, loading: projectLoading } = useProject()
  const { collapsed } = useSidebar()
  const location = useLocation()
  const navigate = useNavigate()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [projects, setProjects] = useState<ApiProjectSummary[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!switcherOpen) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      fetchProjects({ search: query, status: 'ACTIVE', sort: 'updatedAt', limit: 20 })
        .then((response) => { if (!cancelled) setProjects(response.data) })
        .catch(() => { if (!cancelled) setProjects([]) })
    }, query ? 200 : 0)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [query, switcherOpen])

  const switchProject = (nextProjectId: number) => {
    const matched = location.pathname.match(/^\/projects\/\d+(\/.*)?$/)
    const section = matched?.[1] || '/dashboard'
    setSwitcherOpen(false)
    setQuery('')
    void navigate(`/projects/${nextProjectId}${section}${location.search}`)
  }

  const projectName = project?.name ?? (projectLoading ? 'Cargando proyecto…' : 'Selecciona un proyecto')
  const projectMeta = project ? `${project.code} · ${project.assetCount} activos` : 'Las áreas operativas requieren ámbito'
  const signOut = async () => { await logout(); void navigate('/login', { replace: true }) }

  return (
    <aside className={`relative flex shrink-0 flex-col overflow-visible border-r border-slate-200 bg-white transition-[width] duration-200 dark:border-slate-800 dark:bg-slate-900 ${collapsed ? 'w-16' : 'w-64'}`}>
      <div className={`flex items-center border-b border-slate-200 py-4 dark:border-slate-800 ${collapsed ? 'justify-center px-2' : 'gap-3 px-5'}`}>
        <img src="/logo.png" className="h-9 w-9 rounded-lg" alt="DocuCore" />
        <div className={collapsed ? 'hidden' : ''}>
          <div className="font-semibold tracking-tight">DocuCore</div>
          <div className="-mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Gestión Documental · v0.1</div>
        </div>
      </div>

      <div className={`relative px-3 py-3 ${collapsed ? 'flex justify-center' : ''}`}>
        <div className={collapsed ? 'hidden' : 'px-3 pb-1 text-[11px] uppercase tracking-wider text-slate-400'}>Proyecto activo</div>
        <button type="button" onClick={() => setSwitcherOpen((value) => !value)} aria-expanded={switcherOpen} title={collapsed ? projectName : undefined} className={`rounded-lg bg-slate-100 text-left transition hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 ${collapsed ? 'flex h-9 w-9 items-center justify-center p-0' : 'w-full px-3 py-2'}`}>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${project?.status === 'ARCHIVED' ? 'bg-amber-500' : project ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            <div className={collapsed ? 'hidden' : 'min-w-0 flex-1'}>
              <div className="truncate text-sm font-medium">{projectName}</div>
              <div className="truncate text-xs text-slate-500 dark:text-slate-400">{projectMeta}</div>
            </div>
            <span className={collapsed ? 'hidden' : 'text-xs text-slate-400'}>▼</span>
          </div>
        </button>
        {switcherOpen && (
          <div className={`z-30 mt-2 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900 ${collapsed ? 'absolute left-14 top-2 w-64' : ''}`}>
            <input type="search" placeholder="Buscar proyecto…" value={query} onChange={(event) => setQuery(event.target.value)} className="mb-2 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-800" />
            <div className="max-h-44 space-y-1 overflow-y-auto scrollbar-thin">
              {projects.map((candidate) => <button key={candidate.id} type="button" onClick={() => switchProject(candidate.id)} className={`w-full rounded-md px-2 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800 ${candidate.id === project?.id ? 'bg-brand-50 dark:bg-brand-950/30' : ''}`}><span className="block truncate font-medium">{candidate.name}</span><span className="block truncate text-slate-500 dark:text-slate-400">{candidate.code} · {candidate.assetCount} activos</span></button>)}
              {projects.length === 0 && <p className="px-2 py-3 text-xs text-slate-500">No hay proyectos activos accesibles.</p>}
            </div>
            <NavLink to="/projects" onClick={() => setSwitcherOpen(false)} className="mt-1 block rounded-md px-2 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950/30">Gestionar proyectos</NavLink>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4 scrollbar-thin">
        {navGroups.map((group, groupIndex) => (
          <div key={group}>
            <div className={`px-3 py-2 text-[11px] uppercase tracking-wider text-slate-400 ${groupIndex > 0 ? 'mt-2' : ''} ${collapsed ? 'hidden' : ''}`}>{group}</div>
            {navItems.filter((item) => item.group === group).map((item) => {
              const target = item.to === '/projects' ? (project ? `/projects/${project.id}/portfolio` : item.to) : (project ? `/projects/${project.id}${item.to}` : '/projects')
              return <NavLink key={item.to} to={target} title={collapsed ? item.label : undefined} className={({ isActive }) => `nav-link flex items-center rounded-md border-l-2 border-transparent py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'}${isActive ? ' active' : ''}`}>
                {item.icon}<span className={collapsed ? 'sr-only' : ''}>{item.label}</span>{item.badge && !collapsed && <span className="ml-auto rounded bg-slate-200 px-1.5 text-[11px] dark:bg-slate-700">{item.badge}</span>}
              </NavLink>
            })}
          </div>
        ))}
        {session?.user.isPlatformAdmin && <div><div className={`mt-2 px-3 py-2 text-[11px] uppercase tracking-wider text-slate-400 ${collapsed ? 'hidden' : ''}`}>Plataforma</div><NavLink to="/admin" title={collapsed ? 'Admin Plataforma' : undefined} className={({ isActive }) => `nav-link flex items-center rounded-md border-l-2 border-transparent py-2 text-sm text-purple-700 hover:bg-slate-100 dark:text-purple-300 dark:hover:bg-slate-800 ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'}${isActive ? ' active' : ''}`}><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg><span className={collapsed ? 'sr-only' : ''}>Admin Plataforma</span></NavLink></div>}
      </nav>

      <div className={`border-t border-slate-200 dark:border-slate-800 ${collapsed ? 'p-2' : 'p-3'}`}>
        <div className={`flex items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 ${collapsed ? 'justify-center p-1' : 'gap-3 p-2'}`}>
          <NavLink to="/account" title={collapsed ? session?.user.name : undefined} className={`flex min-w-0 items-center ${collapsed ? '' : 'flex-1 gap-3'}`}><img src="/avatar.png" className="h-9 w-9 rounded-full" alt="avatar" /><div className={collapsed ? 'hidden' : 'min-w-0 flex-1'}><div className="truncate text-sm font-medium">{session?.user.name ?? ''}</div><div className="truncate text-xs text-slate-500 dark:text-slate-400">{session?.user.role ?? ''}</div></div></NavLink>
          <button type="button" title="Cerrar sesión" onClick={() => void signOut()} className={`rounded p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 ${collapsed ? 'hidden' : ''}`}><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg></button>
        </div>
      </div>
    </aside>
  )
}
