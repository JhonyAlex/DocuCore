import { useEffect, useRef, useState } from 'react'

export type SearchableOption = { value: string; label: string; hint?: string }

type SearchablePickerProps = {
  value: string | null
  selectedLabel: string | null
  placeholder: string
  ariaLabel?: string
  onSearch: (query: string) => Promise<SearchableOption[]>
  onSelect: (option: SearchableOption | null) => void
  disabled?: boolean
  allowClear?: boolean
  clearLabel?: string
  emptyText?: string
}

export default function SearchablePicker({ value, selectedLabel, placeholder, ariaLabel, onSearch, onSelect, disabled, allowClear, clearLabel = 'Sin activo', emptyText = 'Sin resultados' }: SearchablePickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<SearchableOption[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchSeqRef = useRef(0)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  })

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

  const choose = (option: SearchableOption) => {
    setOptions([])
    close()
    onSelect(option)
  }

  const clear = () => {
    setOptions([])
    close()
    onSelect(null)
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
        value={query !== '' ? query : (selectedLabel ?? '')}
        placeholder={selectedLabel ? selectedLabel : placeholder}
        disabled={disabled}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={openWithSearch}
        onKeyDown={(event) => { if (event.key === 'Escape') close() }}
        className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
      />
      {open && (
        <ul role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
          {allowClear && <li><button type="button" role="option" aria-selected={value === null} onClick={clear} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800">{clearLabel}</button></li>}
          {searching && <li className="px-3 py-2 text-sm text-slate-500">Buscando…</li>}
          {!searching && searchError && <li className="px-3 py-2 text-sm text-red-600">No se pudo buscar. Inténtalo de nuevo.</li>}
          {!searching && !searchError && options.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">{emptyText}</li>}
          {!searching && !searchError && options.map((option) => (
            <li key={option.value}>
              <button type="button" role="option" aria-selected={value === option.value} onClick={() => choose(option)} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                <span className="block">{option.label}</span>
                {option.hint && <span className="block text-xs text-slate-500">{option.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
