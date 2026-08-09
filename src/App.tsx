import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from '@/layouts/AppLayout'
import DashboardView from '@/views/DashboardView'
import ProjectsView from '@/views/ProjectsView'
import AssetsView from '@/views/AssetsView'
import DocumentsView from '@/views/DocumentsView'
import CalendarView from '@/views/CalendarView'
import PlansView from '@/views/PlansView'
import LocationsView from '@/views/LocationsView'
import HistoryView from '@/views/HistoryView'
import ConfigView from '@/views/ConfigView'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardView />} />
        <Route path="/projects" element={<ProjectsView />} />
        <Route path="/assets" element={<AssetsView />} />
        <Route path="/items" element={<Navigate to="/assets" replace />} />
        <Route path="/docs" element={<DocumentsView />} />
        <Route path="/calendar" element={<CalendarView />} />
        <Route path="/plans" element={<PlansView />} />
        <Route path="/locations" element={<LocationsView />} />
        <Route path="/history" element={<HistoryView />} />
        <Route path="/config" element={<ConfigView />} />
      </Route>
    </Routes>
  )
}
