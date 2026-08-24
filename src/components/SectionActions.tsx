import { createPortal } from 'react-dom'
import { useEffect, useState, type ReactNode } from 'react'

/** Renders page-specific actions in the shared application top bar. */
export default function SectionActions({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setTarget(document.getElementById('topbar-section-actions'))
  }, [])

  return target ? createPortal(children, target) : null
}
