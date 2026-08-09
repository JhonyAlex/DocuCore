import { useEffect, useRef, useState } from 'react'
import type { SearchableOption } from '@/components/SearchablePicker'
import PortalListbox from '@/components/PortalListbox'

export type SelectedValue = { id: number; label: string }

type SearchableMultiPickerProps = {
  values: SelectedValue[]
  placeholder: string
  ariaLabel?: string
  onSearch: (query: string) => Promise<SearchableOption[]>
  onChange: (values: SelectedValue[]) => void
  disabled?: boolean
  emptyText?: string
}

// Variante multi-selección del SearchablePicker: chips de seleccionados +
// búsqueda con debounce y check en las opciones ya elegidas. El listbox viaja
// en un portal (PortalListbox) para no recortarse dentro del modal.
export default function SearchableMultiPicker({ values, placeholder, ariaLabel, onSearch, onChange, disabled, emptyText = 'Sin resultados' }: SearchableMultiPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<SearchableOption[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchSeqRef = useRef(0)

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  const close = () => {
    setQuery('')
    setOpen(false)
  }

  const runSearch = (raw: string) => {
    const seq = ++searchSeqRef.current
    setSearching(true)
    setSearchError(false)
    onSearch(raw.trim())
      .then((next) => { if (seq === searchSeqRef.current) setOptions(next) })
      .catch(() => { if (seq === searchSeqRef.current) { setOptions([]); setSearchError(true) } })
      .finally(() => { if (seq === searchSeqRef.current) setSearching(false) })
  }

  const openWithSearch = () => {
    if (disabled) return
    setOpen(true)
    if (query === '') runSearch('')
  }

  const handleChange = (raw: string) => {
    setQuery(raw)
    setOpen(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(raw), raw.trim() === '' ? 0 : 250)
  }

  const toggle = (option: SearchableOption) => {
    const id = Number(option.value)
    const exists = values.some((selected) => selected.id === id)
    onChange(exists ? values.filter((selected) => selected.id !== id) : [...values, { id, label: option.label }])
    close()
  }

  const remove = (selected: SelectedValue) => {
    onChange(values.filter((value) => value.id !== selected.id))
  }

  const selectedValueIds = new Set(values.map((value) => value.id))

  return (
    <div ref={rootRef}>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5">
        {values.map((selected) => (
          <span key={selected.id} className="inline-flex items-center gap-1 rounded-md bg-brand-50 dark:bg-brand-900/30 px-2 py-0.5 text-xs font-medium text-brand-700 dark:text-brand-300">
            {selected.label}
            <button type="button" aria-label={`Quitar ${selected.label}`} disabled={disabled} onClick={() => remove(selected)} className="text-brand-500 hover:text-brand-700 dark:hover:text-brand-200 disabled:opacity-40">×</button>
          </span>
        ))}
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          value={query}
          placeholder={values.length === 0 ? placeholder : 'Añadir otro activo…'}
          disabled={disabled}
          onChange={(event) => handleChange(event.target.value)}
          onFocus={openWithSearch}
          onKeyDown={(event) => { if (event.key === 'Escape') close() }}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm focus:outline-none disabled:opacity-40"
        />
      </div>
      {open && (
        <PortalListbox anchorRef={rootRef} onClose={close}>
          <ul role="listbox">
            {searching && <li className="px-3 py-2 text-sm text-slate-500">Buscando…</li>}
            {!searching && searchError && <li className="px-3 py-2 text-sm text-red-600">No se pudo buscar. Inténtalo de nuevo.</li>}
            {!searching && !searchError && options.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">{emptyText}</li>}
            {!searching && !searchError && options.map((option) => {
              const selected = selectedValueIds.has(Number(option.value))
              return (
                <li key={option.value}>
                  <button type="button" role="option" aria-selected={selected} onClick={() => toggle(option)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{option.label}</span>
                      {option.hint && <span className="block truncate text-xs text-slate-500">{option.hint}</span>}
                    </span>
                    {selected && <span className="text-brand-600" aria-hidden="true">✓</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </PortalListbox>
      )}
    </div>
  )
}
