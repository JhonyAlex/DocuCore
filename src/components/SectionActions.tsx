import { createPortal } from 'react-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { useProjectOptional } from '@/contexts/ProjectContext'

/** Renders page-specific actions in the shared application top bar. */
export default function SectionActions({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  // This component is also rendered by views mounted outside the project-scoped
  // layout (`ProjectsSelectionLayout` has no ProjectProvider), so the project
  // context must be read optionally instead of throwing.
  const project = useProjectOptional()
  const readOnly = project?.readOnly ?? false

  useEffect(() => {
    setTarget(document.getElementById('topbar-section-actions'))
  }, [])

  if (!target) {
    // Layouts without a top-bar anchor still have to expose their actions:
    // rendering them inline keeps the buttons reachable instead of silently
    // dropping the whole section.
    return (
      <div
        data-project-write-actions={readOnly ? 'disabled' : undefined}
        title={readOnly ? 'Este espacio está en modo solo lectura' : undefined}
        className={readOnly ? 'mb-6 flex justify-end [&>button]:pointer-events-none [&>button]:cursor-not-allowed [&>button]:opacity-50 [&>label]:pointer-events-none [&>label]:cursor-not-allowed [&>label]:opacity-50' : 'mb-6 flex justify-end'}
      >
        {children}
      </div>
    )
  }

  return createPortal(
    <div
      data-project-write-actions={readOnly ? 'disabled' : undefined}
      title={readOnly ? 'Este espacio está en modo solo lectura' : undefined}
      className={readOnly ? '[&>button]:pointer-events-none [&>button]:cursor-not-allowed [&>button]:opacity-50 [&>label]:pointer-events-none [&>label]:cursor-not-allowed [&>label]:opacity-50' : undefined}
    >
      {children}
    </div>,
    target,
  )
}
