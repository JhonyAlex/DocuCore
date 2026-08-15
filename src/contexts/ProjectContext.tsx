import { createContext, useContext } from 'react'
import type { ApiProjectSummary } from '@/lib/api'

interface ProjectContextValue {
  projectId: number | null
  project: ApiProjectSummary | null
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
