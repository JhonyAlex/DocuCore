import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, Outlet, useLocation, useParams } from 'react-router-dom'
import AppLayout from '@/layouts/AppLayout'
import { SessionProvider } from '@/contexts/SessionProvider'
import { useSession } from '@/contexts/SessionContext'
import { useProject } from '@/contexts/ProjectContext'
import { ACTIVE_PROJECT_STORAGE_KEY } from '@/contexts/ProjectProvider'

// Las vistas se cargan por ruta: mantiene el shell disponible de inmediato y
// evita descargar visores, catálogos y flujos de gestión que aún no se usan.
const DashboardView = lazy(() => import('@/views/DashboardView'))
const ProjectsView = lazy(() => import('@/views/ProjectsView'))
const AssetsView = lazy(() => import('@/views/AssetsView'))
const DocumentsView = lazy(() => import('@/views/DocumentsView'))
const CalendarView = lazy(() => import('@/views/CalendarView'))
const PlansView = lazy(() => import('@/views/PlansView'))
const LocationsView = lazy(() => import('@/views/LocationsView'))
const HistoryView = lazy(() => import('@/views/HistoryView'))
const ConfigView = lazy(() => import('@/views/ConfigView'))
const DynamicFieldsConfigView = lazy(() => import('@/views/DynamicFieldsConfigView'))
const AssetTypesConfigView = lazy(() => import('@/views/AssetTypesConfigView'))
const DocumentTypesConfigView = lazy(() => import('@/views/DocumentTypesConfigView'))
const StatusesConfigView = lazy(() => import('@/views/StatusesConfigView'))
const PreventivesConfigView = lazy(() => import('@/views/PreventivesConfigView'))
const LoginView = lazy(() => import('@/views/LoginView'))
const AccountView = lazy(() => import('@/views/AccountView'))
const UsersConfigView = lazy(() => import('@/views/UsersConfigView'))
const RegisterView = lazy(() => import('@/views/RegisterView'))
const VerifyEmailView = lazy(() => import('@/views/VerifyEmailView'))
const ForgotPasswordView = lazy(() => import('@/views/ForgotPasswordView'))
const ResetPasswordView = lazy(() => import('@/views/ResetPasswordView'))
const PlatformAdminView = lazy(() => import('@/views/PlatformAdminView'))

function DeferredRoute({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500 dark:text-slate-400">Cargando vista…</div>}>
      {children}
    </Suspense>
  )
}

function ProjectScopedOutlet() {
  const { projectId } = useParams()
  const { project, loading, error } = useProject()
  if (loading || (project !== null && project.id !== Number(projectId))) return <div className="p-6 text-sm text-slate-500 dark:text-slate-400">Cargando proyecto…</div>
  if (!project || error) return <div className="p-6 text-sm text-red-600 dark:text-red-300">{error ?? `El proyecto ${projectId ?? ''} no está disponible.`}</div>
  return <Outlet key={project.id} />
}

function AuthenticatedOutlet() {
  const { authenticated, loading } = useSession()
  const location = useLocation()
  // A background refresh after an operational write must not unmount the
  // application (and its open modal) while the previous valid identity exists.
  if (loading && !authenticated) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400">Comprobando sesión…</div>
  if (!authenticated) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />
  return <Outlet />
}

function LoginRoute() {
  const { authenticated, loading } = useSession()
  const location = useLocation()
  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400">Comprobando sesión…</div>
  const destination = (location.state as { from?: unknown } | null)?.from
  if (authenticated) return <Navigate to={typeof destination === 'string' && destination.startsWith('/projects') ? destination : '/projects'} replace />
  return <DeferredRoute><LoginView /></DeferredRoute>
}

function LegacyProjectRedirect({ section }: { section: string }) {
  const location = useLocation()
  const storedProjectId = window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY)
  if (!storedProjectId || !/^\d+$/.test(storedProjectId)) return <Navigate to="/projects" replace />
  return <Navigate to={`/projects/${storedProjectId}${section}${location.search}${location.hash}`} replace />
}

function ProjectTasksRedirect() {
  const { projectId } = useParams()
  return <Navigate to={`/projects/${projectId}/config/preventives`} replace />
}

function RootRoute() {
  const { authenticated, loading } = useSession()
  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400">Comprobando sesión…</div>
  if (authenticated) return <Navigate to="/projects" replace />
  return <Navigate to="/login" replace />
}

export default function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/register" element={<DeferredRoute><RegisterView /></DeferredRoute>} />
        <Route path="/verify-email" element={<DeferredRoute><VerifyEmailView /></DeferredRoute>} />
        <Route path="/forgot-password" element={<DeferredRoute><ForgotPasswordView /></DeferredRoute>} />
        <Route path="/reset-password" element={<DeferredRoute><ResetPasswordView /></DeferredRoute>} />
        <Route element={<AuthenticatedOutlet />}>
        <Route element={<AppLayout />}>
        <Route path="/projects" element={<DeferredRoute><ProjectsView /></DeferredRoute>} />
        <Route path="/projects/:projectId" element={<ProjectScopedOutlet />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="portfolio" element={<DeferredRoute><ProjectsView /></DeferredRoute>} />
          <Route path="dashboard" element={<DeferredRoute><DashboardView /></DeferredRoute>} />
          <Route path="assets" element={<DeferredRoute><AssetsView /></DeferredRoute>} />
          <Route path="docs" element={<DeferredRoute><DocumentsView /></DeferredRoute>} />
          <Route path="calendar" element={<DeferredRoute><CalendarView /></DeferredRoute>} />
          <Route path="plans" element={<DeferredRoute><PlansView /></DeferredRoute>} />
          <Route path="locations" element={<DeferredRoute><LocationsView /></DeferredRoute>} />
          <Route path="history" element={<DeferredRoute><HistoryView /></DeferredRoute>} />
          <Route path="config" element={<DeferredRoute><ConfigView /></DeferredRoute>} />
          <Route path="config/dynamic-fields" element={<DeferredRoute><DynamicFieldsConfigView /></DeferredRoute>} />
          <Route path="config/asset-types" element={<DeferredRoute><AssetTypesConfigView /></DeferredRoute>} />
          <Route path="config/document-types" element={<DeferredRoute><DocumentTypesConfigView /></DeferredRoute>} />
          <Route path="config/statuses" element={<DeferredRoute><StatusesConfigView /></DeferredRoute>} />
          <Route path="config/preventives" element={<DeferredRoute><PreventivesConfigView /></DeferredRoute>} />
          <Route path="config/users" element={<DeferredRoute><UsersConfigView /></DeferredRoute>} />
          <Route path="config/tasks" element={<ProjectTasksRedirect />} />
        </Route>
        <Route path="/dashboard" element={<LegacyProjectRedirect section="/dashboard" />} />
        <Route path="/assets" element={<LegacyProjectRedirect section="/assets" />} />
        <Route path="/items" element={<LegacyProjectRedirect section="/assets" />} />
        <Route path="/docs" element={<LegacyProjectRedirect section="/docs" />} />
        <Route path="/calendar" element={<LegacyProjectRedirect section="/calendar" />} />
        <Route path="/plans" element={<LegacyProjectRedirect section="/plans" />} />
        <Route path="/locations" element={<LegacyProjectRedirect section="/locations" />} />
        <Route path="/history" element={<LegacyProjectRedirect section="/history" />} />
        <Route path="/config" element={<LegacyProjectRedirect section="/config" />} />
        <Route path="/config/dynamic-fields" element={<LegacyProjectRedirect section="/config/dynamic-fields" />} />
        <Route path="/config/asset-types" element={<LegacyProjectRedirect section="/config/asset-types" />} />
        <Route path="/config/document-types" element={<LegacyProjectRedirect section="/config/document-types" />} />
        <Route path="/config/statuses" element={<LegacyProjectRedirect section="/config/statuses" />} />
        <Route path="/config/preventives" element={<LegacyProjectRedirect section="/config/preventives" />} />
        <Route path="/config/tasks" element={<LegacyProjectRedirect section="/config/preventives" />} />
        <Route path="/account" element={<DeferredRoute><AccountView /></DeferredRoute>} />
        <Route path="/billing" element={<DeferredRoute><AccountView /></DeferredRoute>} />
        <Route path="/admin" element={<DeferredRoute><PlatformAdminView /></DeferredRoute>} />
        </Route>
        </Route>
      </Routes>
    </SessionProvider>
  )
}
