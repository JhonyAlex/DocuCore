import { useEffect, useRef, useState } from 'react'
import PortalListbox from '@/components/PortalListbox'
import type { SuggestRow } from '@/lib/assetSuggestions'

type SuggestInputProps = {
  id: string
  value: string
  onChange: (value: string) => void
  onSearch: (query: string) => Promise<SuggestRow[]>
  placeholder?: string
  maxLength?: number
  required?: boolean
  inputRef?: React.Ref<HTMLInputElement>
  className?: string
}

const DEFAULT_CLASSNAME = 'w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-brand-500'

// UX-04: campo de texto libre con lista de valores actuales como sugerencias
// (Código, Nombre e Iniciales del formulario de activo). El desplegable viaja
// en portal (PortalListbox) para no ser recortado por el scroll del modal; la
// selección rellena el campo, que sigue aceptando cualquier valor nuevo. El
// listbox solo se renderiza con opciones: un panel «Sin resultados» flotante
// taparía el formulario y podría interceptar el clic en «Crear activo».
export default function SuggestInput({ id, value, onChange, onSearch, placeholder, maxLength, required, inputRef, className = DEFAULT_CLASSNAME }: SuggestInputProps) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<SuggestRow[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchSeqRef = useRef(0)

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  const close = () => setOpen(false)

  const runSearch = (raw: string) => {
    const seq = ++searchSeqRef.current
    onSearch(raw.trim())
      .then((next) => { if (seq === searchSeqRef.current) { setRows(next); setActiveIndex(0) } })
      .catch(() => { if (seq === searchSeqRef.current) setRows([]) })
  }

  // Al enfocar solo se abre si el campo ya tiene texto (p. ej. al editar): en
  // un alta vacía el desplegable no debe tapar el formulario recién abierto.
  const openWithSearch = () => {
    if (value.trim() === '') return
    setOpen(true)
    runSearch(value)
  }

  const handleChange = (raw: string) => {
    onChange(raw)
    setOpen(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(raw), raw.trim() === '' ? 0 : 250)
  }

  const choose = (row: SuggestRow) => {
    setRows([])
    setOpen(false)
    onChange(row.value)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        event.stopPropagation()
        close()
      }
      return
    }
    if (!open || rows.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % rows.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => (current - 1 + rows.length) % rows.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(rows[Math.min(activeIndex, rows.length - 1)])
    }
  }

  return (
    <div ref={rootRef}>
      <input
        type="text"
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={openWithSearch}
        onBlur={close}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        required={required}
        className={className}
      />
      {open && rows.length > 0 && (
        <PortalListbox anchorRef={rootRef} onClose={close}>
          <ul role="listbox">
            {rows.map((row, index) => (
              <li key={`${row.value}-${index}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(row)}
                  className={`w-full px-3 py-2 text-left text-sm ${index === activeIndex ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  <span className="block">{row.value}</span>
                  {row.hint && <span className="block text-xs text-slate-500">{row.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        </PortalListbox>
      )}
    </div>
  )
}
