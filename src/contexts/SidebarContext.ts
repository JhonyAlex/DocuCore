import { createContext, useContext } from 'react'

export interface SidebarContextValue {
  collapsed: boolean
  toggle: () => void
}

export const SidebarContext = createContext<SidebarContextValue | null>(null)

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) throw new Error('useSidebar must be used inside SidebarProvider')
  return context
}
