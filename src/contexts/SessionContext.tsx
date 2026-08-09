import { createContext, useContext } from 'react'
import type { ApiSession } from '@/lib/api'

interface SessionContextValue {
  session: ApiSession | null
  loading: boolean
  reload: () => void
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used within SessionProvider')
  return context
}
