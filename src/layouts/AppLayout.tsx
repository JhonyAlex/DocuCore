import { Outlet } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import Topbar from '@/components/Topbar'
import { ItemCreateProvider } from '@/contexts/ItemCreateProvider'
import { SessionProvider } from '@/contexts/SessionProvider'

export default function AppLayout() {
  return (
    <SessionProvider>
      <ItemCreateProvider>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 flex flex-col overflow-hidden">
            <Topbar />
            <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
              <Outlet />
            </div>
          </main>
        </div>
      </ItemCreateProvider>
    </SessionProvider>
  )
}
