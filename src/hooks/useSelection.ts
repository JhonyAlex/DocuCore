import { useCallback, useState } from 'react'

/**
 * Funciones puras de manipulación de selección (testeables sin DOM).
 * El hook useSelection las envuelve en estado de React.
 */

export function toggleId<T extends number>(prev: Set<T>, id: T): Set<T> {
  const next = new Set(prev)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export function toggleAllIds<T extends number>(prev: Set<T>, ids: T[]): Set<T> {
  const allSelected = ids.length > 0 && ids.every((id) => prev.has(id))
  const next = new Set(prev)
  if (allSelected) ids.forEach((id) => next.delete(id))
  else ids.forEach((id) => next.add(id))
  return next
}

export function allSelectedIds<T extends number>(selected: Set<T>, ids: T[]): boolean {
  return ids.length > 0 && ids.every((id) => selected.has(id))
}

export function someSelectedIds<T extends number>(selected: Set<T>, ids: T[]): boolean {
  return ids.some((id) => selected.has(id)) && !allSelectedIds(selected, ids)
}

/**
 * Hook compartido para selección múltiple por id numérico.
 * Lo usan AssetsView, DocumentsView y futuras vistas con selección bulk.
 * La selección persiste entre páginas (el Set vive en la vista, no en la tabla).
 */
export function useSelection<T extends number>() {
  const [selected, setSelected] = useState<Set<T>>(new Set())

  const toggle = useCallback((id: T) => setSelected((prev) => toggleId(prev, id)), [])
  const toggleAll = useCallback((ids: T[]) => setSelected((prev) => toggleAllIds(prev, ids)), [])
  const clear = useCallback(() => setSelected(new Set()), [])
  const isSelected = useCallback((id: T) => selected.has(id), [selected])

  return {
    selected,
    selectedIds: [...selected],
    selectedCount: selected.size,
    toggle,
    toggleAll,
    clear,
    isSelected,
    allSelected: (ids: T[]) => allSelectedIds(selected, ids),
    someSelected: (ids: T[]) => someSelectedIds(selected, ids),
  }
}
