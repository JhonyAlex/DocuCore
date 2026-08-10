import type { ApiDynamicFieldOption, DynamicFieldType } from '@/lib/api'

export interface DynamicFieldInputDefinition {
  definitionId?: number
  fieldName: string
  fieldType: DynamicFieldType
  required: boolean
  placeholder?: string | null
  unit?: string | null
  minValue?: number | null
  maxValue?: number | null
  decimalPlaces?: number | null
  options: Array<Pick<ApiDynamicFieldOption, 'key' | 'label'>>
}

interface DynamicFieldInputProps {
  field: DynamicFieldInputDefinition
  value: unknown
  onChange: (value: unknown) => void
  disabled?: boolean
}

const inputClass = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 disabled:opacity-60'

export default function DynamicFieldInput({ field, value, onChange, disabled = false }: DynamicFieldInputProps) {
  if (field.fieldType === 'PREVENTIVE') return <div className="rounded-lg border border-dashed border-brand-200 bg-brand-50/50 px-3 py-2 text-xs text-brand-700 dark:border-brand-800 dark:bg-brand-950/30 dark:text-brand-300">Se configurará como plan periódico desde la ficha del activo.</div>
  if (field.fieldType === 'TEXTAREA') {
    return <textarea aria-label={field.fieldName} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} required={field.required} disabled={disabled} rows={3} maxLength={5000} placeholder={field.placeholder ?? undefined} className={inputClass} />
  }
  if (field.fieldType === 'NUMBER') {
    const step = field.decimalPlaces === 0 ? '1' : field.decimalPlaces ? String(10 ** -field.decimalPlaces) : 'any'
    return (
      <div className="flex items-center gap-2">
        <input aria-label={field.fieldName} type="number" value={typeof value === 'number' || typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} required={field.required} disabled={disabled} min={field.minValue ?? undefined} max={field.maxValue ?? undefined} step={step} placeholder={field.placeholder ?? undefined} className={inputClass} />
        {field.unit && <span className="shrink-0 text-sm text-slate-500 dark:text-slate-400">{field.unit}</span>}
      </div>
    )
  }
  if (field.fieldType === 'DATE') {
    return <input aria-label={field.fieldName} type="date" value={typeof value === 'string' ? value.slice(0, 10) : ''} onChange={(event) => onChange(event.target.value || null)} required={field.required} disabled={disabled} className={inputClass} />
  }
  if (field.fieldType === 'SELECT') {
    return (
      <select aria-label={field.fieldName} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value || null)} required={field.required} disabled={disabled} className={inputClass}>
        <option value="">Selecciona una opción</option>
        {field.options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
      </select>
    )
  }
  if (field.fieldType === 'MULTISELECT') {
    const selected = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
    return (
      <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 dark:border-slate-700 dark:bg-slate-800">
        {field.options.map((option) => (
          <label key={option.key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.includes(option.key)} onChange={() => onChange(selected.includes(option.key) ? selected.filter((key) => key !== option.key) : [...selected, option.key])} disabled={disabled} className="rounded border-slate-300 text-brand-600" />
            {option.label}
          </label>
        ))}
      </div>
    )
  }
  if (field.fieldType === 'BOOLEAN') {
    return (
      <select aria-label={field.fieldName} value={typeof value === 'boolean' ? String(value) : ''} onChange={(event) => onChange(event.target.value === '' ? null : event.target.value === 'true')} required={field.required} disabled={disabled} className={inputClass}>
        <option value="">Sin indicar</option>
        <option value="true">Sí</option>
        <option value="false">No</option>
      </select>
    )
  }
  return <input aria-label={field.fieldName} type="text" value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} required={field.required} disabled={disabled} maxLength={500} placeholder={field.placeholder ?? undefined} className={inputClass} />
}
