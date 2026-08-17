import { useMemo, useState } from 'react'
import DocumentIcon from '@/components/DocumentIcon'
import { documentIconDefinitions, DEFAULT_DOCUMENT_ICON_KEY, type DocumentIconKey } from '../../shared/documentIconCatalog'

interface DocumentIconPickerProps {
  value?: string | null
  disabled?: boolean
  onChange: (iconKey: DocumentIconKey) => void
}

export default function DocumentIconPicker({ value, disabled = false, onChange }: DocumentIconPickerProps) {
  const [search, setSearch] = useState('')
  const normalizedSearch = search.trim().toLocaleLowerCase('es')
  const icons = useMemo(() => documentIconDefinitions.filter((icon) => !normalizedSearch || `${icon.label} ${icon.key} ${icon.group}`.toLocaleLowerCase('es').includes(normalizedSearch)), [normalizedSearch])
  const selected = documentIconDefinitions.find((icon) => icon.key === value) ?? documentIconDefinitions.find((icon) => icon.key === DEFAULT_DOCUMENT_ICON_KEY)!
  const groups = new Map<string, typeof icons>()
  for (const icon of icons) groups.set(icon.group, [...(groups.get(icon.group) ?? []), icon])

  return <fieldset disabled={disabled} className="min-w-0">
    <legend className="text-xs font-medium">Icono de documento</legend>
    <div className="mt-1 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm"><DocumentIcon iconKey={selected.key} size={22} /></span>
      <div className="min-w-0"><p className="text-sm font-medium">{selected.label}</p><p className="truncate text-xs text-slate-500 dark:text-slate-400">{selected.group} · {selected.key}</p></div>
    </div>
    <label className="mt-3 block text-xs text-slate-500 dark:text-slate-400">Buscar icono
      <input aria-label="Buscar icono de documento" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ej. contrato, certificado, manual, acta…" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950" />
    </label>
    <div role="listbox" aria-label="Catálogo de iconos de documento" className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1 scrollbar-thin">
      {[...groups.entries()].map(([group, groupIcons]) => <section key={group}><p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">{group}</p><div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">{groupIcons.map((icon) => <button key={icon.key} type="button" role="option" aria-selected={selected.key === icon.key} aria-label={icon.label} title={`${icon.label} · ${icon.group}`} data-icon-key={icon.key} onClick={() => onChange(icon.key)} className={`flex aspect-square items-center justify-center rounded-md border transition ${selected.key === icon.key ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500 dark:bg-brand-900/30 dark:text-brand-300' : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}><DocumentIcon iconKey={icon.key} size={18} /></button>)}</div></section>)}
      {icons.length === 0 && <p className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-500 dark:border-slate-700">No hay iconos que coincidan con la búsqueda.</p>}
    </div>
  </fieldset>
}
