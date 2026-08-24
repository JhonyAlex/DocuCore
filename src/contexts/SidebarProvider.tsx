import { useEffect, useState, type ReactNode } from 'react'
import { SidebarContext } from '@/contexts/SidebarContext'

const STORAGE_KEY = 'docucore.sidebar.collapsed'

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem(STORAGE_KEY) === 'true')

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(collapsed))
  }, [collapsed])

  return <SidebarContext.Provider value={{ collapsed, toggle: () => setCollapsed((value) => !value) }}>{children}</SidebarContext.Provider>
}
