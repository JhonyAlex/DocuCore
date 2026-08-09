import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const GAP = 4
const BOTTOM_PADDING = 8
const MIN_MAX_HEIGHT = 96

interface PortalListboxProps {
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
  children: ReactNode
}

// UX-02: listbox renderizado en un portal a `document.body` con posición fija,
// para que los modales con `overflow` (max-h + scroll) no recorten el
// desplegable. Se posiciona bajo el campo de referencia, con el ancho del campo
// y el alto limitado al espacio visible; se cierra con scroll, resize o un
// click fuera del campo y del propio listbox.
export default function PortalListbox({ anchorRef, onClose, children }: PortalListboxProps) {
  const listboxRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) {
      setPosition(null)
      return
    }
    const rect = anchor.getBoundingClientRect()
    setPosition({
      top: rect.bottom + GAP,
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(MIN_MAX_HEIGHT, window.innerHeight - rect.bottom - GAP - BOTTOM_PADDING),
    })
  }, [anchorRef])

  useEffect(() => {
    if (!position) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (anchorRef.current?.contains(target) || listboxRef.current?.contains(target)) return
      onClose()
    }
    const close = () => onClose()
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [position, anchorRef, onClose])

  if (!position) return null
  return createPortal(
    <div
      ref={listboxRef}
      style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}
      className="fixed z-[70] mt-1 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg fade-in"
    >
      {children}
    </div>,
    document.body,
  )
}
