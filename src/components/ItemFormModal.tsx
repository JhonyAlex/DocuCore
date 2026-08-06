import { useEffect, useRef, useState } from 'react'
import type { ApiItem, ApiItemType, ApiStatus } from '@/lib/api'

export interface ItemFormValues {
  code: string
  name: string
  serialNumber: string
  serialLabel: string
  installDate: string
  typeId: number
  statusId: number
  location: string
  projectId: number
  responsibleId: number
  initials: string
}

interface ItemFormModalProps {
  mode: 'create' | 'edit'
  item: ApiItem | null
  types: ApiItemType[]
  statuses: ApiStatus[]
  locations: string[]
  projectName: string
  responsibleName: string
  projectId: number
  responsibleId: number
  optionsError: boolean
  onClose: () => void
  onSubmit: (values: ItemFormValues) => Promise<void>
}

function dateForInput(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const [day, month, year] = value.split('/')
  return day && month && year ? `${year}-${month}-${day}` : ''
}

function initialValues(item: ApiItem | null, typeId: number, statusId: number, projectId: number, responsibleId: number): ItemFormValues {
  return {
    code: item?.code ?? '',
    name: item?.name ?? '',
    serialNumber: item?.serialNumber ?? '',
    serialLabel: item?.serialLabel ?? '',
    installDate: item ? dateForInput(item.installDate) : '',
    typeId: item?.typeId ?? typeId,
    statusId: item?.statusId ?? statusId,
    location: item?.location ?? '',
    projectId: item?.projectId ?? projectId,
    responsibleId: item?.responsibleId ?? responsibleId,
    initials: item?.initials ?? '',
  }
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">{children}</label>
}

export default function ItemFormModal({
  mode,
  item,
  types,
  statuses,
  locations,
  projectName,
  responsibleName,
  projectId,
  responsibleId,
  optionsError,
  onClose,
  onSubmit,
}: ItemFormModalProps) {
  const [values, setValues] = useState(() => initialValues(item, types[0]?.id ?? 0, statuses[0]?.id ?? 0, projectId, responsibleId))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const codeInputRef = useRef<HTMLInputElement>(null)
  const onCloseRef = useRef(onClose)
  const savingRef = useRef(saving)
  const optionsReady = types.length > 0 && statuses.length > 0 && locations.length > 0

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    savingRef.current = saving
  }, [saving])

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || savingRef.current) return
      event.preventDefault()
      onCloseRef.current()
    }

    document.addEventListener('keydown', handleKeyDown)
    codeInputRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [item?.id, mode])

  useEffect(() => {
    setValues(initialValues(item, types[0]?.id ?? 0, statuses[0]?.id ?? 0, projectId, responsibleId))
    setError(null)
  }, [item, mode, projectId, responsibleId, statuses, types])

  const updateValue = <K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await onSubmit(values)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo guardar el ítem. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="item-form-title" className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono text-slate-500">{mode === 'create' ? 'NUEVO ÍTEM' : item?.code}</div>
            <h3 id="item-form-title" className="font-semibold text-lg">{mode === 'create' ? 'Nuevo ítem' : 'Editar ítem'}</h3>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar formulario" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="p-5 overflow-y-auto scrollbar-thin">
            {(error || optionsError) && <div role="alert" className="mb-4 rounded-lg border border-red-100 bg-red-50/70 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error ?? 'No se pudieron cargar las opciones necesarias. Cierra el formulario e inténtalo de nuevo.'}</div>}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <FieldLabel htmlFor="item-code">Código</FieldLabel>
                <input ref={codeInputRef} id="item-code" value={values.code} onChange={(event) => updateValue('code', event.target.value)} required className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <FieldLabel htmlFor="item-name">Nombre</FieldLabel>
                <input id="item-name" value={values.name} onChange={(event) => updateValue('name', event.target.value)} required className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <FieldLabel htmlFor="item-serial-number">Nº de serie</FieldLabel>
                <input id="item-serial-number" value={values.serialNumber} onChange={(event) => updateValue('serialNumber', event.target.value)} required className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <FieldLabel htmlFor="item-serial-label">Etiqueta de serie</FieldLabel>
                <input id="item-serial-label" value={values.serialLabel} onChange={(event) => updateValue('serialLabel', event.target.value)} required placeholder="SN: ..." className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <FieldLabel htmlFor="item-install-date">Instalación</FieldLabel>
                <input id="item-install-date" type="date" value={values.installDate} onChange={(event) => updateValue('installDate', event.target.value)} required className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <FieldLabel htmlFor="item-location">Ubicación</FieldLabel>
                <select id="item-location" value={values.location} onChange={(event) => updateValue('location', event.target.value)} required className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                  <option value="">Selecciona una ubicación</option>
                  {locations.map((location) => <option key={location} value={location}>{location}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="item-type">Tipo</FieldLabel>
                <select id="item-type" value={values.typeId || ''} onChange={(event) => updateValue('typeId', Number(event.target.value))} required className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                  <option value="">Selecciona un tipo</option>
                  {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="item-status">Estado</FieldLabel>
                <select id="item-status" value={values.statusId || ''} onChange={(event) => updateValue('statusId', Number(event.target.value))} required className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                  <option value="">Selecciona un estado</option>
                  {statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="item-initials">Iniciales</FieldLabel>
                <input id="item-initials" value={values.initials} onChange={(event) => updateValue('initials', event.target.value)} required maxLength={4} className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <FieldLabel htmlFor="item-project">Proyecto</FieldLabel>
                <input id="item-project" value={projectName} readOnly className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400" />
              </div>
              <div>
                <FieldLabel htmlFor="item-responsible">Responsable</FieldLabel>
                <input id="item-responsible" value={responsibleName} readOnly className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400" />
              </div>
            </div>
          </div>
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm disabled:opacity-40">Cancelar</button>
            <button type="submit" disabled={saving || !optionsReady || optionsError} className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">{saving ? 'Guardando…' : mode === 'create' ? 'Crear ítem' : 'Guardar cambios'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
