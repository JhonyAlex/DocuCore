import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { fetchSession, login as loginRequest, logout as logoutRequest, type ApiSession } from '@/lib/api'
import { SessionContext } from './SessionContext'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ApiSession | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { setSession(await fetchSession()) } catch { setSession(null) } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const login = useCallback(async (email: string, password: string) => {
    const next = await loginRequest(email, password)
    setSession(next)
    return next
  }, [])

  const logout = useCallback(async () => {
    try { await logoutRequest() } finally { setSession(null) }
  }, [])

  return (
    <SessionContext.Provider value={{ session, user: session?.user ?? null, authenticated: session !== null, loading, login, logout, refreshSession: load, reload: () => { void load() } }}>
      {children}
    </SessionContext.Provider>
  )
}
