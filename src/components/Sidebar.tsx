import { NavLink } from 'react-router-dom'
import { navItems } from '@/lib/navigation'
import { useSession } from '@/contexts/SessionContext'

const navGroups = ['Principal', 'Gestión', 'Administración'] as const

export default function Sidebar() {
  const { session } = useSession()
  const projectName = session?.project.name ?? ''
  const projectMeta = session ? `${session.project.code} · ${session.project.assetCount} activos` : ''
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
        <button className="w-full text-left px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{projectName}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{projectMeta}</div>
            </div>
            <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 9l4-4 4 4M16 15l-4 4-4-4" /></svg>
          </div>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-4">
        {navGroups.map((group, gi) => (
          <div key={group}>
            <div className={`text-[11px] uppercase tracking-wider text-slate-400 px-3 py-2${gi > 0 ? ' mt-2' : ''}`}>{group}</div>
            {navItems.filter((item) => item.group === group).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
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
            ))}
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
