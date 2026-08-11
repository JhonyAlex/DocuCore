import { useEffect, useState } from 'react'
import DynamicFieldInput from '@/components/DynamicFieldInput'
import type { ApiAssetType, ApiDynamicFieldDefinition, DynamicFieldDefinitionInput, DynamicFieldType } from '@/lib/api'

interface DynamicFieldFormModalProps {
  field: ApiDynamicFieldDefinition | null
  types: ApiAssetType[]
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: DynamicFieldDefinitionInput) => void
}

const typeOptions: Array<{ value: DynamicFieldType; label: string }> = [
  { value: 'TEXT', label: 'Texto corto' },
  { value: 'TEXTAREA', label: 'Texto largo' },
  { value: 'NUMBER', label: 'Número' },
  { value: 'DATE', label: 'Fecha' },
  { value: 'SELECT', label: 'Selección única' },
  { value: 'MULTISELECT', label: 'Selección múltiple' },
  { value: 'BOOLEAN', label: 'Sí / No' },
]

function initial(field: ApiDynamicFieldDefinition | null, types: ApiAssetType[]): DynamicFieldDefinitionInput {
  return {
    fieldName: field?.fieldName ?? '',
    description: field?.description ?? '',
    groupName: field?.groupName ?? 'General',
    fieldType: field?.fieldType ?? 'TEXT',
    required: field?.required ?? false,
    placeholder: field?.placeholder ?? '',
    unit: field?.unit ?? '',
    minValue: field?.minValue ?? null,
    maxValue: field?.maxValue ?? null,
    decimalPlaces: field?.decimalPlaces ?? null,
    assetTypeIds: field?.assetTypeIds ?? (types[0] ? [types[0].id] : []),
    options: field?.options.map(({ key, label }) => ({ key, label })) ?? [],
    isActive: field?.isActive ?? true,
  }
}

const controlClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800'

export default function DynamicFieldFormModal({ field, types, busy, error, onClose, onSubmit }: DynamicFieldFormModalProps) {
  const [values, setValues] = useState(() => initial(field, types))
  const [optionLines, setOptionLines] = useState(() => field?.options.map((option) => option.label).join('\n') ?? '')

  useEffect(() => {
    setValues(initial(field, types))
    setOptionLines(field?.options.map((option) => option.label).join('\n') ?? '')
  }, [field, types])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  const update = <K extends keyof DynamicFieldDefinitionInput>(key: K, value: DynamicFieldDefinitionInput[K]) => setValues((current) => ({ ...current, [key]: value }))
  const toggleType = (id: number) => update('assetTypeIds', values.assetTypeIds.includes(id) ? values.assetTypeIds.filter((typeId) => typeId !== id) : [...values.assetTypeIds, id])
  const isSelection = values.fieldType === 'SELECT' || values.fieldType === 'MULTISELECT'

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const labels = optionLines.split('\n').map((line) => line.trim()).filter(Boolean)
    const options = labels.map((label, index) => ({ key: field?.options[index]?.key, label }))
    onSubmit({
      ...values,
      options: isSelection ? options : [],
      unit: values.fieldType === 'NUMBER' ? values.unit || null : null,
      minValue: values.fieldType === 'NUMBER' ? values.minValue : null,
      maxValue: values.fieldType === 'NUMBER' ? values.maxValue : null,
      decimalPlaces: values.fieldType === 'NUMBER' ? values.decimalPlaces : null,
      description: values.description || null,
      placeholder: values.placeholder || null,
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm" onClick={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="dynamic-field-form-title" className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
          <div>
            <div className="text-xs font-mono text-slate-500">{field ? field.key : 'NUEVO CAMPO'}</div>
            <h3 id="dynamic-field-form-title" className="text-lg font-semibold">{field ? 'Editar campo dinámico' : 'Nuevo campo dinámico'}</h3>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar" className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800">×</button>
        </div>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 scrollbar-thin">
            {error && <p role="alert" className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</p>}
            <section>
              <h4 className="mb-3 text-sm font-semibold">Información básica</h4>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="text-xs font-medium">Nombre<input value={values.fieldName} onChange={(event) => update('fieldName', event.target.value)} required maxLength={120} className={controlClass} /></label>
                <label className="text-xs font-medium">Grupo<input value={values.groupName} onChange={(event) => update('groupName', event.target.value)} required maxLength={80} className={controlClass} /></label>
                <label className="text-xs font-medium">Tipo<select value={values.fieldType} onChange={(event) => update('fieldType', event.target.value as DynamicFieldType)} className={controlClass}>{typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="text-xs font-medium">Placeholder<input value={values.placeholder ?? ''} onChange={(event) => update('placeholder', event.target.value)} className={controlClass} /></label>
                <label className="text-xs font-medium md:col-span-2">Descripción<textarea value={values.description ?? ''} onChange={(event) => update('description', event.target.value)} rows={2} maxLength={500} className={controlClass} /></label>
              </div>
            </section>
            <section>
              <h4 className="mb-2 text-sm font-semibold">Tipos de activo</h4>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {types.map((type) => (
                  <label key={type.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700">
                    <input type="checkbox" checked={values.assetTypeIds.includes(type.id)} onChange={() => toggleType(type.id)} />
                    {type.name}
                  </label>
                ))}
              </div>
            </section>
            {values.fieldType === 'NUMBER' && (
              <section>
                <h4 className="mb-3 text-sm font-semibold">Formato numérico</h4>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <label className="text-xs">Unidad<input value={values.unit ?? ''} onChange={(event) => update('unit', event.target.value)} className={controlClass} /></label>
                  <label className="text-xs">Mínimo<input type="number" value={values.minValue ?? ''} onChange={(event) => update('minValue', event.target.value === '' ? null : Number(event.target.value))} className={controlClass} /></label>
                  <label className="text-xs">Máximo<input type="number" value={values.maxValue ?? ''} onChange={(event) => update('maxValue', event.target.value === '' ? null : Number(event.target.value))} className={controlClass} /></label>
                  <label className="text-xs">Decimales<input type="number" min="0" max="6" value={values.decimalPlaces ?? ''} onChange={(event) => update('decimalPlaces', event.target.value === '' ? null : Number(event.target.value))} className={controlClass} /></label>
                </div>
              </section>
            )}
            {isSelection && (
              <section>
                <h4 className="mb-2 text-sm font-semibold">Opciones</h4>
                <textarea value={optionLines} onChange={(event) => setOptionLines(event.target.value)} required rows={5} placeholder={'Una opción por línea\nOpción A\nOpción B'} className={controlClass} />
                <p className="mt-1 text-xs text-slate-400">Una opción por línea. Las opciones utilizadas no pueden eliminarse.</p>
              </section>
            )}
            {values.fieldType === 'DATE' && (
              <section>
                <h4 className="mb-1 text-sm font-semibold">Fecha del activo</h4>
                <p className="text-xs text-slate-500">La periodicidad se define al asignar la fecha a cada activo.</p>
              </section>
            )}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Vista previa</h4>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={values.required} onChange={(event) => update('required', event.target.checked)} />
                  Obligatorio
                </label>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <label className="mb-1 block text-xs text-slate-500">
                  {values.fieldName || 'Nombre del campo'}
                  {values.required && <span className="ml-1 text-red-500">*</span>}
                </label>
                <DynamicFieldInput field={{ ...values, options: values.options.map((option, index) => ({ key: option.key ?? String(index), label: option.label })) }} value={null} onChange={() => undefined} />
              </div>
            </section>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">Cancelar</button>
            <button type="submit" disabled={busy || values.assetTypeIds.length === 0} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40">{busy ? 'Guardando…' : field ? 'Guardar cambios' : 'Crear campo'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
