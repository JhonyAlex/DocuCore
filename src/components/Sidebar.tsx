import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { navItems } from '@/lib/navigation'
import { useSession } from '@/contexts/SessionContext'
import { useProject } from '@/contexts/ProjectContext'
import { fetchProjects, type ApiProjectSummary } from '@/lib/api'

const navGroups = ['Principal', 'Gestión', 'Administración'] as const

export default function Sidebar() {
  const { session } = useSession()
  const { project, loading: projectLoading } = useProject()
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
        .then((response) => {
          if (!cancelled) setProjects(response.data)
        })
        .catch(() => {
          if (!cancelled) setProjects([])
        })
    }, query ? 200 : 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
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
  const userName = session?.user.name ?? ''
  const userRole = session?.user.role ?? ''
  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
        <img src="/logo.png" className="w-9 h-9 rounded-lg" alt="logo" />
        <div>
          <div className="font-semibold tracking-tight">DocuCore</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 -mt-0.5">Gestión Documental · v0.1</div>
        </div>
      </div>

      <div className="px-3 py-3">
        <div className="text-[11px] uppercase tracking-wider text-slate-400 px-3 pb-1">Proyecto activo</div>
        <button type="button" onClick={() => setSwitcherOpen((value) => !value)} aria-expanded={switcherOpen} className="w-full text-left px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${project?.status === 'ARCHIVED' ? 'bg-amber-500' : project ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{projectName}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{projectMeta}</div>
            </div>
            <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 9l4-4 4 4M16 15l-4 4-4-4" /></svg>
          </div>
        </button>
        {switcherOpen && (
          <div className="mt-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar proyecto…" className="mb-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-800" />
            <div className="max-h-48 overflow-y-auto scrollbar-thin">
              {projects.map((candidate) => (
                <button key={candidate.id} type="button" onClick={() => switchProject(candidate.id)} className={`w-full rounded-md px-2 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800 ${candidate.id === project?.id ? 'bg-brand-50 dark:bg-brand-950/30' : ''}`}>
                  <span className="block truncate font-medium">{candidate.name}</span>
                  <span className="block truncate text-slate-500 dark:text-slate-400">{candidate.code} · {candidate.assetCount} activos</span>
                </button>
              ))}
              {projects.length === 0 && <p className="px-2 py-3 text-xs text-slate-500">No hay proyectos activos accesibles.</p>}
            </div>
            <NavLink to="/projects" onClick={() => setSwitcherOpen(false)} className="mt-1 block rounded-md px-2 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950/30">Gestionar proyectos</NavLink>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-4">
        {navGroups.map((group, gi) => (
          <div key={group}>
            <div className={`text-[11px] uppercase tracking-wider text-slate-400 px-3 py-2${gi > 0 ? ' mt-2' : ''}`}>{group}</div>
            {navItems.filter((item) => item.group === group).map((item) => {
              const target = item.to === '/projects' ? project ? `/projects/${project.id}/portfolio` : item.to : project ? `/projects/${project.id}${item.to}` : '/projects'
              return (
              <NavLink
                key={item.to}
                to={target}
                className={({ isActive }) =>
                  `nav-link flex items-center gap-3 px-3 py-2 text-sm rounded-md border-l-2 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800${isActive ? ' active' : ''}`
                }
              >
                {item.icon}
                {item.label}
                {item.badge && (
                  <span className="ml-auto text-[11px] px-1.5 rounded bg-slate-200 dark:bg-slate-700">{item.badge}</span>
                )}
              </NavLink>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 dark:border-slate-800 p-3">
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
          <img src="/avatar.png" className="w-9 h-9 rounded-full" alt="avatar" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{userName}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{userRole}</div>
          </div>
          <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
        </div>
      </div>
    </aside>
  )
}
