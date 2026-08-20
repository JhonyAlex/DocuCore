import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { fetchProject, type ApiProjectSummary } from '@/lib/api'
import { ProjectContext } from './ProjectContext'

const ACTIVE_PROJECT_STORAGE_KEY = 'docucore.activeProjectId'

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { projectId: rawProjectId } = useParams()
  const projectId = rawProjectId && /^\d+$/.test(rawProjectId) ? Number(rawProjectId) : null
  const [project, setProject] = useState<ApiProjectSummary | null>(null)
  const [loading, setLoading] = useState(Boolean(projectId))
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const loadedProjectIdRef = useRef<number | null>(null)

  const refresh = useCallback(() => setReloadToken((value) => value + 1), [])

  useEffect(() => {
    if (!projectId) {
      loadedProjectIdRef.current = null
      setProject(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    const isCurrentScope = loadedProjectIdRef.current === projectId
    if (!isCurrentScope) setLoading(true)
    setError(null)
    fetchProject(projectId)
      .then((next) => {
        if (cancelled) return
        loadedProjectIdRef.current = next.id
        setProject(next)
        window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, String(next.id))
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        loadedProjectIdRef.current = null
        setProject(null)
        setError(reason instanceof Error ? reason.message : 'No se pudo cargar el proyecto')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, reloadToken])

  const value = useMemo(() => ({ projectId, project, loading, error, refresh }), [error, loading, project, projectId, refresh])
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

export { ACTIVE_PROJECT_STORAGE_KEY }
