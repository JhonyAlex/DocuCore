import { Link, Outlet, useNavigate } from 'react-router-dom'
import TrialBanner from '@/components/TrialBanner'
import { useSession } from '@/contexts/SessionContext'
import { useTheme } from '@/hooks/useTheme'

export default function ProjectsSelectionLayout() {
  const { session, logout } = useSession()
  const { isDark, toggle } = useTheme()
  const navigate = useNavigate()

  const signOut = async () => {
    await logout()
    void navigate('/login', { replace: true })
  }

  const userName = session?.user.name ?? ''
  const userRole = session?.user.role ?? ''

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <TrialBanner />
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white/80 px-6 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex items-center gap-3">
          <img src="/logo.png" className="h-9 w-9 rounded-lg" alt="DocuCore" />
          <div>
            <div className="font-semibold tracking-tight">DocuCore</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 -mt-0.5">Gestión Documental y de Activos</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {session?.user.isPlatformAdmin && (
            <Link
              to="/admin"
              className="hidden rounded-lg px-2.5 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-50 dark:text-purple-300 dark:hover:bg-purple-950/30 sm:block"
            >
              Admin Plataforma
            </Link>
          )}

          <button
            type="button"
            onClick={toggle}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            title="Cambiar tema"
            aria-label="Cambiar tema"
          >
            <svg className={`h-5 w-5${isDark ? ' hidden' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
            <svg className={`h-5 w-5${!isDark ? ' hidden' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>

          <div className="flex items-center gap-3 border-l border-slate-200 pl-3 dark:border-slate-800">
            <Link
              to="/account"
              className="flex items-center gap-2.5 rounded-lg p-1 transition hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Mi cuenta"
            >
              <img src="/avatar.png" className="h-8 w-8 rounded-full" alt="avatar" />
              <div className="hidden text-left sm:block">
                <div className="text-xs font-medium leading-tight text-slate-900 dark:text-slate-100">{userName}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{userRole}</div>
              </div>
            </Link>

            <button
              type="button"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              onClick={() => void signOut()}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto scrollbar-thin p-6 md:p-8">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
