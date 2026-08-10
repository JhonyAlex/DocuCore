import { useEffect, useRef, useState } from 'react'
import DynamicFieldInput from '@/components/DynamicFieldInput'
import { fetchDynamicFieldDefinitions, type ApiAssetDynamicField, type ApiDynamicFieldDefinition, type DynamicFieldValueInput } from '@/lib/api'

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
    if (!projectId || !assetTypeId) { setDefinitions([]); setValues({}); onChangeRef.current([]); return }
    let active = true
    setLoading(true)
    setError(false)
    fetchDynamicFieldDefinitions(projectId, { assetTypeId })
      .then((next) => {
        if (!active) return
        const initialById = new Map(initialFieldsRef.current.map((field) => [field.definitionId, duplicate && field.fieldType === 'DATE' ? null : field.value]))
        const nextValues = Object.fromEntries(next.map((definition) => [definition.id, initialById.get(definition.id) ?? null]))
        setDefinitions(next)
        setValues(nextValues)
        onChangeRef.current(next.map((definition) => ({ definitionId: definition.id, value: nextValues[definition.id] })))
      })
      .catch(() => { if (active) setError(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [assetTypeId, duplicate, projectId])

  const update = (definitionId: number, value: unknown) => {
    setValues((current) => {
      const next = { ...current, [definitionId]: value }
      onChangeRef.current(definitions.map((definition) => ({ definitionId: definition.id, value: next[definition.id] })))
      return next
    })
  }

  if (!assetTypeId) return null
  return (
    <section className="md:col-span-2 border-t border-slate-200 pt-4 dark:border-slate-700">
      <div className="mb-3"><h4 className="text-sm font-semibold">Características</h4><p className="text-xs text-slate-500 dark:text-slate-400">Campos configurados para el tipo de activo seleccionado.</p></div>
      {loading ? <p className="text-sm text-slate-500">Cargando características…</p> : error ? <p role="alert" className="text-sm text-red-600">No se pudieron cargar las características.</p> : definitions.length === 0 ? <p className="text-sm text-slate-400">Este tipo no tiene campos dinámicos.</p> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {definitions.map((definition) => <div key={definition.id}><label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">{definition.fieldName}{definition.required && <span className="ml-1 text-red-500">*</span>}</label><DynamicFieldInput field={{ ...definition, definitionId: definition.id }} value={values[definition.id]} onChange={(value) => update(definition.id, value)} disabled={disabled} />{definition.description && <p className="mt-1 text-xs text-slate-400">{definition.description}</p>}</div>)}
        </div>
      )}
    </section>
  )
}
