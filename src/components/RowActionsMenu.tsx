import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'

export interface RowActionsMenuItem {
  label: string
  onSelect: () => void
  variant?: 'default' | 'danger' | 'success'
}

interface RowActionsMenuProps {
  items: RowActionsMenuItem[]
  /** Etiqueta aria del botón ⋯, ej. "Acciones de CNC-05". */
  ariaLabel: string
}

const variantClass: Record<NonNullable<RowActionsMenuItem['variant']>, string> = {
  default: '',
  danger: 'text-red-600 dark:text-red-400',
  success: 'text-emerald-600 dark:text-emerald-400',
}

interface MenuState {
  top: number
  left: number
  width: number
}

/**
 * Menú de acciones por fila (⋯) con portal, posicionamiento viewport y cierre
 * por Escape / scroll / resize / click fuera. Extraído de AssetsTable para reusarse
 * en AssetsTable, DocumentsTable y futuras tablas con acciones por fila.
 */
export default function RowActionsMenu({ items, ariaLabel }: RowActionsMenuProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const ignoreOpeningScrollRef = useRef(false)

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onScroll = () => {
      // Playwright and browsers may deliver the scroll caused by bringing the
      // action button into view after the click handler has opened this portal.
      // Ignore only that opening scroll; later user scrolling still closes it.
      if (ignoreOpeningScrollRef.current) return
      close()
    }
    const enableScrollClose = window.setTimeout(() => { ignoreOpeningScrollRef.current = false }, 0)
    document.addEventListener('keydown', onEscape)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.clearTimeout(enableScrollClose)
      document.removeEventListener('keydown', onEscape)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [menu])

  const open = (event: MouseEvent<HTMLButtonElement>) => {
    if (menu) {
      ignoreOpeningScrollRef.current = false
      setMenu(null)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const width = 176
    const padding = 8
    ignoreOpeningScrollRef.current = true
    setMenu({
      top: rect.bottom + 4,
      left: Math.min(window.innerWidth - width - padding, Math.max(padding, rect.right - width)),
      width,
    })
  }

  return (
    <>
      <button type="button" aria-label={ariaLabel} aria-expanded={menu !== null} onClick={open} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
      </button>
      {menu && createPortal(
        <>
          <button type="button" tabIndex={-1} aria-label="Cerrar menú de acciones" onClick={() => setMenu(null)} className="fixed inset-0 z-[60] cursor-default" />
          <div role="menu" className="fixed z-[70] rounded-lg border border-slate-200 bg-white p-1 text-left shadow-lg dark:border-slate-700 dark:bg-slate-900" style={{ top: menu.top, left: menu.left, width: menu.width }}>
            {items.map((item) => (
              <button key={item.label} type="button" role="menuitem" onClick={() => { setMenu(null); item.onSelect() }} className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${variantClass[item.variant ?? 'default']}`}>
                {item.label}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
