import { createContext, useContext } from 'react'
import type { ApiProjectSummary } from '@/lib/api'

interface ProjectContextValue {
  projectId: number | null
  project: ApiProjectSummary | null
  /** Project/archive or workspace/member entitlement prevents every mutation. */
  readOnly: boolean
  loading: boolean
  error: string | null
  refresh: () => void
}

export const ProjectContext = createContext<ProjectContextValue | null>(null)

export function useProject() {
  const context = useContext(ProjectContext)
  if (!context) throw new Error('useProject must be used within ProjectProvider')
  return context
}

/**
 * Non-throwing variant for shared components that are also rendered outside
 * the project-scoped layout (e.g. `ProjectsSelectionLayout`, which has no
 * `ProjectProvider`). Callers must handle the `null` case.
 */
export function useProjectOptional() {
  return useContext(ProjectContext)
}
