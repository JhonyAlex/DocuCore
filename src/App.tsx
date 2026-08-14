import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from '@/layouts/AppLayout'

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
const StatusesConfigView = lazy(() => import('@/views/StatusesConfigView'))
const PreventivesConfigView = lazy(() => import('@/views/PreventivesConfigView'))

function DeferredRoute({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500 dark:text-slate-400">Cargando vista…</div>}>
      {children}
    </Suspense>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DeferredRoute><DashboardView /></DeferredRoute>} />
        <Route path="/projects" element={<DeferredRoute><ProjectsView /></DeferredRoute>} />
        <Route path="/assets" element={<DeferredRoute><AssetsView /></DeferredRoute>} />
        <Route path="/items" element={<Navigate to="/assets" replace />} />
        <Route path="/docs" element={<DeferredRoute><DocumentsView /></DeferredRoute>} />
        <Route path="/calendar" element={<DeferredRoute><CalendarView /></DeferredRoute>} />
        <Route path="/plans" element={<DeferredRoute><PlansView /></DeferredRoute>} />
        <Route path="/locations" element={<DeferredRoute><LocationsView /></DeferredRoute>} />
        <Route path="/history" element={<DeferredRoute><HistoryView /></DeferredRoute>} />
        <Route path="/config" element={<DeferredRoute><ConfigView /></DeferredRoute>} />
        <Route path="/config/dynamic-fields" element={<DeferredRoute><DynamicFieldsConfigView /></DeferredRoute>} />
        <Route path="/config/asset-types" element={<DeferredRoute><AssetTypesConfigView /></DeferredRoute>} />
        <Route path="/config/statuses" element={<DeferredRoute><StatusesConfigView /></DeferredRoute>} />
        <Route path="/config/preventives" element={<DeferredRoute><PreventivesConfigView /></DeferredRoute>} />
        <Route path="/config/tasks" element={<Navigate to="/config/preventives" replace />} />
      </Route>
    </Routes>
  )
}
