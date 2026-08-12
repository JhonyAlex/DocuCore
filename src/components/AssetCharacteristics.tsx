import { useMemo, useState } from 'react'
import DynamicDateCompleteDialog from '@/components/DynamicDateCompleteDialog'
import { completeAssetDynamicDate, type ApiAsset, type ApiAssetDynamicField } from '@/lib/api'

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
  const [completing, setCompleting] = useState<ApiAssetDynamicField | null>(null)
  const [completeBusy, setCompleteBusy] = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)

  const groups = useMemo(() => {
    const grouped = new Map<string, ApiAssetDynamicField[]>()
    fields.forEach((field) => grouped.set(field.groupName, [...(grouped.get(field.groupName) ?? []), field]))
    return [...grouped.entries()]
  }, [fields])

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
        <div><h4 className="font-medium">Características</h4><p className="text-xs text-slate-500 dark:text-slate-400">Campos configurados para {asset.type?.name ?? 'este tipo de activo'}. Edita sus valores desde el botón global «Editar».</p></div>
      </div>
      <div className="space-y-5">
        {groups.map(([group, groupFields]) => (
          <section key={group}>
            <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{group}</h5>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {groupFields.map((field) => (
                <div key={field.definitionId} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                  <div className="mb-1 flex items-start justify-between gap-2"><label className="text-xs text-slate-500 dark:text-slate-400">{field.fieldName}{field.required && <span className="ml-1 text-red-500">*</span>}</label>{field.dateSchedule?.periodicity && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">{field.dateSchedule.periodicity} · {field.dateSchedule.periodicityMode === 'Calendario' ? 'Calendario' : 'Realización'}</span>}</div>
                  <div className={`text-sm font-medium ${displayValue(field) === 'Sin informar' ? field.required ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400' : ''}`}>{displayValue(field)}</div>
                  {field.description && <p className="mt-1 text-xs text-slate-400">{field.description}</p>}
                  {field.fieldType === 'DATE' && field.dateSchedule?.occurrenceId && <button type="button" onClick={() => { setCompleteError(null); setCompleting(field) }} className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">Completar {field.dateSchedule.periodicity ? 'y programar siguiente' : 'fecha'} →</button>}
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
