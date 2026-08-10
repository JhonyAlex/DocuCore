import { useMemo, useState } from 'react'
import DynamicFieldInput from '@/components/DynamicFieldInput'
import DynamicDateCompleteDialog from '@/components/DynamicDateCompleteDialog'
import { completeAssetDynamicDate, updateAssetDynamicFields, type ApiAsset, type ApiAssetDynamicField } from '@/lib/api'
import { PERIODICITIES, type DocumentPeriodicityMode } from '@/lib/periodicity'

interface AssetCharacteristicsProps {
  asset: ApiAsset
  onChanged: (asset: ApiAsset) => void
}

function displayValue(field: ApiAssetDynamicField): string {
  if (field.fieldType === 'DATE' && field.dateSchedule?.date) return new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC' }).format(new Date(`${field.dateSchedule.date}T00:00:00.000Z`))
  if (field.value === null || field.value === undefined || field.value === '' || (Array.isArray(field.value) && field.value.length === 0)) return 'Sin informar'
  if (field.fieldType === 'DATE' && typeof field.value === 'string') return new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC' }).format(new Date(`${field.value.slice(0, 10)}T00:00:00.000Z`))
  if (field.fieldType === 'BOOLEAN') return field.value ? 'Sí' : 'No'
  if (field.fieldType === 'SELECT' && typeof field.value === 'string') return field.options.find((option) => option.key === field.value)?.label ?? field.value
  if (field.fieldType === 'MULTISELECT' && Array.isArray(field.value)) return field.value.map((key) => field.options.find((option) => option.key === key)?.label ?? String(key)).join(', ')
  return `${String(field.value)}${field.unit ? ` ${field.unit}` : ''}`
}

export default function AssetCharacteristics({ asset, onChanged }: AssetCharacteristicsProps) {
  const fields = useMemo(() => asset.dynamicFields ?? [], [asset.dynamicFields])
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<Record<number, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [completing, setCompleting] = useState<ApiAssetDynamicField | null>(null)
  const [completeBusy, setCompleteBusy] = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)

  const groups = useMemo(() => {
    const grouped = new Map<string, ApiAssetDynamicField[]>()
    fields.forEach((field) => grouped.set(field.groupName, [...(grouped.get(field.groupName) ?? []), field]))
    return [...grouped.entries()]
  }, [fields])

  const beginEdit = () => {
    setValues(Object.fromEntries(fields.map((field) => [field.definitionId, field.fieldType === 'DATE' ? { date: field.dateSchedule?.date ?? field.value ?? null, periodicity: field.dateSchedule?.periodicity ?? null, periodicityMode: field.dateSchedule?.periodicityMode ?? null } : field.value])))
    setError(null)
    setEditing(true)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateAssetDynamicFields(asset.id, fields.map((field) => ({ definitionId: field.definitionId, value: values[field.definitionId] ?? null })))
      onChanged(updated)
      setEditing(false)
    } catch {
      setError('No se pudieron guardar las características. Revisa los campos obligatorios y sus límites.')
    } finally {
      setSaving(false)
    }
  }

  const complete = async (performedDate: string) => {
    if (!completing) return
    setCompleteBusy(true)
    setCompleteError(null)
    try {
      const updated = await completeAssetDynamicDate(asset.id, completing.definitionId, performedDate)
      onChanged(updated)
      setCompleting(null)
    } catch {
      setCompleteError('No se pudo calcular la siguiente fecha. Inténtalo de nuevo.')
    } finally {
      setCompleteBusy(false)
    }
  }

  if (fields.length === 0) {
    return <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center dark:border-slate-700"><p className="text-sm text-slate-500 dark:text-slate-400">Este tipo de activo no tiene campos dinámicos configurados.</p><p className="mt-1 text-xs text-slate-400">Puedes crearlos desde Configuración · Campos dinámicos.</p></div>
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div><h4 className="font-medium">Características</h4><p className="text-xs text-slate-500 dark:text-slate-400">Campos configurados para {asset.type?.name ?? 'este tipo de activo'}</p></div>
        {editing ? (
          <div className="flex gap-2"><button type="button" onClick={() => setEditing(false)} disabled={saving} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700">Cancelar</button><button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">{saving ? 'Guardando…' : 'Guardar características'}</button></div>
        ) : <button type="button" onClick={beginEdit} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Editar características</button>}
      </div>
      {error && <p role="alert" className="mb-3 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</p>}
      <div className="space-y-5">
        {groups.map(([group, groupFields]) => (
          <section key={group}>
            <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{group}</h5>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {groupFields.map((field) => (
                <div key={field.definitionId} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                  <div className="mb-1 flex items-start justify-between gap-2"><label className="text-xs text-slate-500 dark:text-slate-400">{field.fieldName}{field.required && <span className="ml-1 text-red-500">*</span>}</label>{field.dateSchedule?.periodicity && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">{field.dateSchedule.periodicity} · {field.dateSchedule.periodicityMode === 'Calendario' ? 'Calendario' : 'Realización'}</span>}</div>
                  {editing ? field.fieldType === 'DATE' ? <div className="space-y-2"><DynamicFieldInput field={field} value={(values[field.definitionId] as { date?: string | null } | undefined)?.date ?? null} onChange={(date) => setValues((current) => ({ ...current, [field.definitionId]: { ...(current[field.definitionId] as object), date } }))} disabled={saving} /><div className="grid grid-cols-2 gap-2"><select aria-label="Periodicidad de la fecha" value={(values[field.definitionId] as { periodicity?: string | null } | undefined)?.periodicity ?? ''} onChange={(event) => setValues((current) => ({ ...current, [field.definitionId]: { ...(current[field.definitionId] as object), periodicity: event.target.value || null, periodicityMode: event.target.value ? ((current[field.definitionId] as { periodicityMode?: string | null }).periodicityMode ?? 'Calendario') : null } }))} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"><option value="">Sin periodicidad</option>{PERIODICITIES.map((item) => <option key={item}>{item}</option>)}</select>{(values[field.definitionId] as { periodicity?: string | null } | undefined)?.periodicity && <select aria-label="Modo de cálculo de la fecha" value={(values[field.definitionId] as { periodicityMode?: string | null }).periodicityMode ?? 'Calendario'} onChange={(event) => setValues((current) => ({ ...current, [field.definitionId]: { ...(current[field.definitionId] as object), periodicityMode: event.target.value as DocumentPeriodicityMode } }))} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"><option value="Calendario">Según calendario</option><option value="Subida">Según realización</option></select>}</div></div> : <DynamicFieldInput field={field} value={values[field.definitionId]} onChange={(value) => setValues((current) => ({ ...current, [field.definitionId]: value }))} disabled={saving} /> : <div className={`text-sm font-medium ${displayValue(field) === 'Sin informar' ? field.required ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400' : ''}`}>{displayValue(field)}</div>}
                  {field.description && <p className="mt-1 text-xs text-slate-400">{field.description}</p>}
                  {!editing && field.fieldType === 'DATE' && field.dateSchedule?.occurrenceId && <button type="button" onClick={() => { setCompleteError(null); setCompleting(field) }} className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">Completar {field.dateSchedule.periodicity ? 'y programar siguiente' : 'fecha'} →</button>}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <DynamicDateCompleteDialog open={completing !== null} fieldName={completing?.fieldName ?? ''} busy={completeBusy} error={completeError} onConfirm={(date) => void complete(date)} onCancel={() => !completeBusy && setCompleting(null)} />
    </>
  )
}
