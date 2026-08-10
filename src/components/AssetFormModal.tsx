import { useEffect, useRef, useState } from 'react'
import type { ApiAsset, ApiAssetType, ApiLocation, ApiStatus, ApiUserRef } from '@/lib/api'
import LocationFormModal, { type LocationFormValues } from '@/components/LocationFormModal'
import SuggestInput from '@/components/SuggestInput'
import AssetImagePicker from '@/components/AssetImagePicker'
import { buildAssetSuggestionSearch } from '@/lib/assetSuggestions'

// UX-03: valor especial del select de ubicación que abre el alta rápida de ubicación.
const NEW_LOCATION_OPTION = '__new__'

export interface AssetFormValues {
  code: string
  name: string
  serialNumber: string
  installDate: string
  typeId: number
  statusId: number
  locationId: number
  projectId: number
  responsibleId: number
  initials: string
}

interface AssetFormModalProps {
  mode: 'create' | 'edit' | 'duplicate'
  asset: ApiAsset | null
  types: ApiAssetType[]
  statuses: ApiStatus[]
  locations: ApiLocation[]
  projectName: string
  responsibleName: string
  projectId: number
  responsibleId: number
  // UX-03: alta rápida de ubicación desde el formulario de activo.
  users: ApiUserRef[]
  onCreateLocation: (values: LocationFormValues) => Promise<ApiLocation>
  optionsError: boolean
  onClose: () => void
  // IMG-01: la imagen solo se selecciona aquí; el caller la sube al guardar.
  onSubmit: (values: AssetFormValues, imageFile: File | null) => Promise<void>
}

function dateForInput(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const [day, month, year] = value.split('/')
  return day && month && year ? `${year}-${month}-${day}` : ''
}

function initialValues(asset: ApiAsset | null, mode: AssetFormModalProps['mode'], typeId: number, statusId: number, projectId: number, responsibleId: number): AssetFormValues {
  const needsNewIdentity = mode === 'duplicate'
  return {
    code: needsNewIdentity ? '' : asset?.code ?? '',
    name: asset?.name ?? '',
    serialNumber: needsNewIdentity ? '' : asset?.serialNumber ?? '',
    installDate: asset ? dateForInput(asset.installDate) : '',
    typeId: asset?.typeId ?? typeId,
    // Al duplicar no se hereda el ciclo de vida del origen: el duplicado nace con el
    // estado por defecto de un activo nuevo (el primero de la lista), como en crear.
    statusId: mode === 'duplicate' ? statusId : asset?.statusId ?? statusId,
    locationId: asset?.locationId ?? 0,
    projectId: asset?.projectId ?? projectId,
    responsibleId: asset?.responsibleId ?? responsibleId,
    initials: asset?.initials ?? '',
  }
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">{children}</label>
}

export default function AssetFormModal({
  mode,
  asset,
  types,
  statuses,
  locations,
  projectName,
  responsibleName,
  projectId,
  responsibleId,
  users,
  onCreateLocation,
  optionsError,
  onClose,
  onSubmit,
}: AssetFormModalProps) {
  const [values, setValues] = useState(() => initialValues(asset, mode, types[0]?.id ?? 0, statuses[0]?.id ?? 0, projectId, responsibleId))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showLocationForm, setShowLocationForm] = useState(false)
  // IMG-01: fichero elegido (no se sube hasta guardar). El duplicado (ITEM-04)
  // no hereda la imagen del origen: arranca sin imagen como un activo nuevo.
  const [imageFile, setImageFile] = useState<File | null>(null)
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
  }, [asset?.id, mode])

  useEffect(() => {
    setValues(initialValues(asset, mode, types[0]?.id ?? 0, statuses[0]?.id ?? 0, projectId, responsibleId))
    setImageFile(null)
    setError(null)
  }, [asset, mode, projectId, responsibleId, statuses, types])

  const updateValue = <K extends keyof AssetFormValues>(key: K, value: AssetFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
  }

  // UX-03: la opción «Crear nueva ubicación…» abre el alta rápida sin cambiar la
  // selección actual; el select conserva el valor previo mientras el modal está abierto.
  const handleLocationChange = (value: string) => {
    if (value === NEW_LOCATION_OPTION) {
      setShowLocationForm(true)
      return
    }
    updateValue('locationId', Number(value))
  }

  const handleCreateLocation = async (locationValues: LocationFormValues) => {
    const created = await onCreateLocation(locationValues)
    updateValue('locationId', created.id)
    setShowLocationForm(false)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await onSubmit(values, imageFile)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo guardar el activo. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4" onClick={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="asset-form-title" className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="shrink-0 p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono text-slate-500">{mode === 'create' ? 'NUEVO ACTIVO' : mode === 'duplicate' ? `DUPLICAR ${asset?.code ?? ''}` : asset?.code}</div>
            <h3 id="asset-form-title" className="font-semibold text-lg">{mode === 'create' ? 'Nuevo activo' : mode === 'duplicate' ? 'Duplicar activo' : 'Editar activo'}</h3>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar formulario" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 p-5 overflow-y-auto scrollbar-thin">
            {(error || optionsError) && <div role="alert" className="mb-4 rounded-lg border border-red-100 bg-red-50/70 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error ?? 'No se pudieron cargar las opciones necesarias. Cierra el formulario e inténtalo de nuevo.'}</div>}
            {mode === 'duplicate' && <div className="mb-4 rounded-lg border border-brand-100 bg-brand-50/70 px-3 py-2 text-sm text-brand-700 dark:border-brand-900/50 dark:bg-brand-900/20 dark:text-brand-300">Se han copiado las propiedades de {asset?.code}. Introduce un código y un número de serie nuevos para identificar el duplicado.</div>}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <FieldLabel htmlFor="asset-code">Código</FieldLabel>
                <SuggestInput id="asset-code" inputRef={codeInputRef} value={values.code} onChange={(value) => updateValue('code', value)} onSearch={buildAssetSuggestionSearch('code', mode === 'edit' ? asset?.id : undefined)} required />
              </div>
              <div>
                <FieldLabel htmlFor="asset-name">Nombre</FieldLabel>
                <SuggestInput id="asset-name" value={values.name} onChange={(value) => updateValue('name', value)} onSearch={buildAssetSuggestionSearch('name', mode === 'edit' ? asset?.id : undefined)} required />
              </div>
              <div>
                <FieldLabel htmlFor="asset-serial-number">Nº de serie</FieldLabel>
                <input id="asset-serial-number" value={values.serialNumber} onChange={(event) => updateValue('serialNumber', event.target.value)} required className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <FieldLabel htmlFor="asset-install-date">Instalación</FieldLabel>
                <input id="asset-install-date" type="date" value={values.installDate} onChange={(event) => updateValue('installDate', event.target.value)} required className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <FieldLabel htmlFor="asset-location">Ubicación</FieldLabel>
                <select id="asset-location" value={values.locationId || ''} onChange={(event) => handleLocationChange(event.target.value)} required className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                  <option value="">Selecciona una ubicación</option>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}
                  <option value={NEW_LOCATION_OPTION}>＋ Crear nueva ubicación…</option>
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="asset-type">Tipo</FieldLabel>
                <select id="asset-type" value={values.typeId || ''} onChange={(event) => updateValue('typeId', Number(event.target.value))} required className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                  <option value="">Selecciona un tipo</option>
                  {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="asset-status">Estado</FieldLabel>
                <select id="asset-status" value={values.statusId || ''} onChange={(event) => updateValue('statusId', Number(event.target.value))} required className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                  <option value="">Selecciona un estado</option>
                  {statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="asset-initials">Iniciales</FieldLabel>
                <SuggestInput id="asset-initials" value={values.initials} onChange={(value) => updateValue('initials', value)} onSearch={buildAssetSuggestionSearch('initials', mode === 'edit' ? asset?.id : undefined)} required maxLength={4} />
              </div>
              <div>
                <FieldLabel htmlFor="asset-project">Proyecto</FieldLabel>
                <input id="asset-project" value={projectName} readOnly className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400" />
              </div>
              <div>
                <FieldLabel htmlFor="asset-responsible">Responsable</FieldLabel>
                <input id="asset-responsible" value={responsibleName} readOnly className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400" />
              </div>
              <div className="md:col-span-2">
                <AssetImagePicker asset={mode === 'edit' ? asset : null} value={imageFile} onChange={setImageFile} />
              </div>
            </div>
          </div>
          <div className="shrink-0 p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm disabled:opacity-40">Cancelar</button>
            <button type="submit" disabled={saving || !optionsReady || optionsError} className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">{saving ? 'Guardando…' : mode === 'edit' ? 'Guardar cambios' : mode === 'duplicate' ? 'Crear duplicado' : 'Crear activo'}</button>
          </div>
        </form>
      </div>
      {showLocationForm && (
        <LocationFormModal
          mode="create"
          location={null}
          locations={locations}
          users={users}
          projectId={values.projectId}
          optionsError={users.length === 0}
          // La nueva ubicación cuelga de la seleccionada y hereda el responsable del formulario.
          initialParentId={values.locationId || null}
          initialResponsibleId={responsibleId}
          onClose={() => setShowLocationForm(false)}
          onSubmit={handleCreateLocation}
        />
      )}
    </div>
  )
}
