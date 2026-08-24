import { Outlet } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import Topbar from '@/components/Topbar'
import TrialBanner from '@/components/TrialBanner'
import { AssetCreateProvider } from '@/contexts/AssetCreateProvider'
import { NotificationProvider } from '@/contexts/NotificationProvider'
import { ProjectProvider } from '@/contexts/ProjectProvider'
import { SidebarProvider } from '@/contexts/SidebarProvider'

export default function AppLayout() {
  return (
    <ProjectProvider>
      <SidebarProvider>
        <NotificationProvider>
          <AssetCreateProvider>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <main className="flex flex-1 flex-col overflow-hidden">
                <TrialBanner />
                <Topbar />
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                  <Outlet />
                </div>
              </main>
            </div>
          </AssetCreateProvider>
        </NotificationProvider>
      </SidebarProvider>
    </ProjectProvider>
  )
}
