import { createPortal } from 'react-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { useProject } from '@/contexts/ProjectContext'

/** Renders page-specific actions in the shared application top bar. */
export default function SectionActions({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const { readOnly } = useProject()

  useEffect(() => {
    setTarget(document.getElementById('topbar-section-actions'))
  }, [])

  return target ? createPortal(
    <div
      data-project-write-actions={readOnly ? 'disabled' : undefined}
      title={readOnly ? 'Este espacio está en modo solo lectura' : undefined}
      className={readOnly ? '[&>button]:pointer-events-none [&>button]:cursor-not-allowed [&>button]:opacity-50 [&>label]:pointer-events-none [&>label]:cursor-not-allowed [&>label]:opacity-50' : undefined}
    >
      {children}
    </div>,
    target,
  ) : null
}
