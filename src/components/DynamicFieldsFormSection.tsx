import { useEffect, useRef, useState } from 'react'
import DynamicFieldInput from '@/components/DynamicFieldInput'
import { fetchDynamicFieldDefinitions, type ApiAssetDynamicField, type ApiDynamicFieldDefinition, type DynamicFieldValueInput } from '@/lib/api'
import { PERIODICITIES, type DocumentPeriodicityMode } from '@/lib/periodicity'

interface DynamicFieldsFormSectionProps {
  projectId: number
  assetTypeId: number
  initialFields: ApiAssetDynamicField[]
  duplicate: boolean
  disabled: boolean
  onChange: (values: DynamicFieldValueInput[]) => void
}

export default function DynamicFieldsFormSection({ projectId, assetTypeId, initialFields, duplicate, disabled, onChange }: DynamicFieldsFormSectionProps) {
  const [definitions, setDefinitions] = useState<ApiDynamicFieldDefinition[]>([])
  const [values, setValues] = useState<Record<number, unknown>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const initialFieldsRef = useRef(initialFields)
  const onChangeRef = useRef(onChange)

  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  useEffect(() => {
    if (!projectId || !assetTypeId) { setDefinitions([]); setValues({}); return }
    let active = true
    setLoading(true)
    setError(false)
    fetchDynamicFieldDefinitions(projectId, { assetTypeId })
      .then((next) => {
        if (!active) return
        const initialById = new Map(initialFieldsRef.current.map((field) => [field.definitionId, field]))
        const nextValues = Object.fromEntries(next.map((definition) => {
          const prior = initialById.get(definition.id)
          const value = duplicate && definition.fieldType === 'DATE' ? null : prior?.value ?? null
          return [definition.id, definition.fieldType === 'DATE' ? { date: value, periodicity: prior?.dateSchedule?.periodicity ?? null, periodicityMode: prior?.dateSchedule?.periodicityMode ?? null } : value]
        }))
        setDefinitions(next)
        setValues(nextValues)
      })
      .catch(() => { if (active) setError(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [assetTypeId, duplicate, projectId])

  // La propagación al formulario padre ocurre después de renderizar los nuevos
  // valores. Hacerla dentro del actualizador de `setValues` provoca una
  // actualización cruzada durante el render de React.
  useEffect(() => {
    if (!projectId || !assetTypeId || definitions.length === 0) {
      onChangeRef.current([])
      return
    }
    onChangeRef.current(definitions.map((definition) => ({ definitionId: definition.id, value: values[definition.id] })))
  }, [assetTypeId, definitions, projectId, values])

  const update = (definitionId: number, value: unknown) => {
    setValues((current) => ({ ...current, [definitionId]: value }))
  }

  if (!assetTypeId) return null
  return (
    <section className="md:col-span-2 border-t border-slate-200 pt-4 dark:border-slate-700">
      <div className="mb-3">
        <h4 className="text-sm font-semibold">Características</h4>
        <p className="text-xs text-slate-500 dark:text-slate-400">Campos configurados para el tipo de activo seleccionado.</p>
      </div>
      {loading ? (
        <p className="text-sm text-slate-500">Cargando características…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-600">No se pudieron cargar las características.</p>
      ) : definitions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-4 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Este tipo no tiene campos dinámicos.</p>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Puedes configurar campos personalizados desde la sección de configuración.</p>
          </div>
          <a
            href={`/projects/${projectId}/config/dynamic-fields`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors shrink-0"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            Configurar campos dinámicos ↗
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {definitions.map((definition) => (
            <div key={definition.id}>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                {definition.fieldName}
                {definition.required && <span className="ml-1 text-red-500">*</span>}
              </label>
              {definition.fieldType === 'DATE' ? (
                <div className="space-y-2">
                  <DynamicFieldInput
                    field={{ ...definition, definitionId: definition.id }}
                    value={(values[definition.id] as { date?: string | null } | undefined)?.date ?? null}
                    onChange={(date) => update(definition.id, { ...(values[definition.id] as object), date })}
                    disabled={disabled}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      aria-label={`Periodicidad de ${definition.fieldName}`}
                      value={(values[definition.id] as { periodicity?: string | null } | undefined)?.periodicity ?? ''}
                      onChange={(event) => update(definition.id, { ...(values[definition.id] as object), periodicity: event.target.value || null, periodicityMode: event.target.value ? ((values[definition.id] as { periodicityMode?: string | null }).periodicityMode ?? 'Calendario') : null })}
                      disabled={disabled}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="">Sin periodicidad</option>
                      {PERIODICITIES.map((item) => <option key={item}>{item}</option>)}
                    </select>
                    {(values[definition.id] as { periodicity?: string | null } | undefined)?.periodicity && (
                      <select
                        aria-label={`Modo de ${definition.fieldName}`}
                        value={(values[definition.id] as { periodicityMode?: string | null }).periodicityMode ?? 'Calendario'}
                        onChange={(event) => update(definition.id, { ...(values[definition.id] as object), periodicityMode: event.target.value as DocumentPeriodicityMode })}
                        disabled={disabled}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                      >
                        <option value="Calendario">Según calendario</option>
                        <option value="Subida">Según realización</option>
                      </select>
                    )}
                  </div>
                </div>
              ) : (
                <DynamicFieldInput
                  field={{ ...definition, definitionId: definition.id }}
                  value={values[definition.id]}
                  onChange={(value) => update(definition.id, value)}
                  disabled={disabled}
                />
              )}
              {definition.description && <p className="mt-1 text-xs text-slate-400">{definition.description}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
