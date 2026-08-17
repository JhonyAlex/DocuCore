import { createContext, useContext } from 'react'
import type { ApiSession } from '@/lib/api'

interface SessionContextValue {
  session: ApiSession | null
  user: ApiSession['user'] | null
  workspace: ApiSession['workspace'] | null
  authenticated: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<ApiSession>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
  reload: () => void
  setSession: (session: ApiSession | null | ((prev: ApiSession | null) => ApiSession | null)) => void
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used within SessionProvider')
  return context
}
