import { useRef, useEffect } from 'react'

export interface TableDragScrollOptions {
  /** Permitir scroll horizontal además del vertical en el contenedor (por defecto true) */
  enableHorizontal?: boolean
  /** Umbral en píxeles antes de activar el modo arrastre (por defecto 4) */
  dragThreshold?: number
}

/**
 * Hook para permitir mover la vista verticalmente (y horizontalmente) arrastrando
 * con el cursor sobre una tabla o su contenedor. Cancela la apertura accidental de
 * filas al soltar tras un arrastre y respeta clics en botones/inputs.
 */
export function useTableDragScroll<T extends HTMLElement = HTMLDivElement>(options: TableDragScrollOptions = {}) {
  const containerRef = useRef<T | null>(null)
  const { enableHorizontal = true, dragThreshold = 4 } = options

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let isPointerDown = false
    let isDragging = false
    let startX = 0
    let startY = 0
    let initialScrollLeft = 0
    let initialScrollTop = 0
    let scrollParent: HTMLElement | null = null

    const findScrollParent = (el: HTMLElement): HTMLElement => {
      let current = el.parentElement
      while (current && current !== document.body && current !== document.documentElement) {
        const style = window.getComputedStyle(current)
        if (
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          current.scrollHeight > current.clientHeight
        ) {
          return current
        }
        current = current.parentElement
      }
      return (document.scrollingElement as HTMLElement) || document.documentElement
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return

      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.closest(
          'button, input, select, textarea, a, label, [role="button"], [role="menuitem"], [role="checkbox"], [data-no-drag]',
        ) ||
          target.isContentEditable)
      ) {
        return
      }

      isPointerDown = true
      isDragging = false
      startX = e.clientX
      startY = e.clientY
      initialScrollLeft = container.scrollLeft
      scrollParent = findScrollParent(container)
      initialScrollTop = scrollParent.scrollTop
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!isPointerDown) return

      const deltaX = e.clientX - startX
      const deltaY = e.clientY - startY

      if (!isDragging) {
        if (Math.hypot(deltaX, deltaY) >= dragThreshold) {
          isDragging = true
          container.style.userSelect = 'none'
          container.style.cursor = 'grabbing'
        }
      }

      if (isDragging) {
        if (scrollParent) {
          scrollParent.scrollTop = initialScrollTop - deltaY
        }
        if (enableHorizontal && container.scrollWidth > container.clientWidth) {
          container.scrollLeft = initialScrollLeft - deltaX
        }
      }
    }

    const onPointerUp = () => {
      if (!isPointerDown) return
      isPointerDown = false

      if (isDragging) {
        container.style.userSelect = ''
        container.style.cursor = ''

        const captureClick = (clickEvent: MouseEvent) => {
          clickEvent.stopPropagation()
          clickEvent.preventDefault()
          window.removeEventListener('click', captureClick, true)
        }
        window.addEventListener('click', captureClick, true)
        window.setTimeout(() => {
          window.removeEventListener('click', captureClick, true)
        }, 50)
      }
    }

    const onPointerCancel = () => {
      isPointerDown = false
      if (isDragging) {
        container.style.userSelect = ''
        container.style.cursor = ''
      }
    }

    container.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)

    return () => {
      container.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      container.style.userSelect = ''
      container.style.cursor = ''
    }
  }, [enableHorizontal, dragThreshold])

  return containerRef
}
