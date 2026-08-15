import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
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

  const refresh = useCallback(() => setReloadToken((value) => value + 1), [])

  useEffect(() => {
    if (!projectId) {
      setProject(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    // Refrescar los metadatos del mismo proyecto (por ejemplo, su contador de
    // activos) no debe desmontar la vista operativa ni perder la ficha,
    // filtros o selección actuales. Al cambiar realmente de proyecto sí se
    // entra en carga y el outlet descarta el estado anterior.
    const isCurrentScope = project?.id === projectId
    if (!isCurrentScope) setLoading(true)
    setError(null)
    fetchProject(projectId)
      .then((next) => {
        if (cancelled) return
        setProject(next)
        window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, String(next.id))
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setProject(null)
        setError(reason instanceof Error ? reason.message : 'No se pudo cargar el proyecto')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [project?.id, projectId, reloadToken])

  const value = useMemo(() => ({ projectId, project, loading, error, refresh }), [error, loading, project, projectId, refresh])
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

export { ACTIVE_PROJECT_STORAGE_KEY }
