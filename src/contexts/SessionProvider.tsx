import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { fetchSession, type ApiSession } from '@/lib/api'
import { SessionContext } from './SessionContext'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ApiSession | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetchSession()
      .then((next) => setSession(next))
      .catch(() => setSession(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <SessionContext.Provider value={{ session, loading, reload: load }}>
      {children}
    </SessionContext.Provider>
  )
}
