import { useEffect, useRef, useState } from 'react'
import type { ApiLocation, ApiUserRef } from '@/lib/api'

export interface LocationFormValues {
  name: string
  code: string
  surface: string
  parentId: number | null
  responsibleId: number
}

interface LocationFormModalProps {
  mode: 'create' | 'edit'
  location: ApiLocation | null
  locations: ApiLocation[]
  users: ApiUserRef[]
  projectId: number
  optionsError: boolean
  onClose: () => void
  onSubmit: (values: LocationFormValues) => Promise<void>
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">{children}</label>
}

function locationDepth(locations: ApiLocation[], id: number): number {
  let depth = 0
  let cursor = locations.find((location) => location.id === id)
  const visited = new Set<number>()
  while (cursor && cursor.parentId !== null && !visited.has(cursor.id)) {
    visited.add(cursor.id)
    depth += 1
    cursor = locations.find((location) => location.id === cursor?.parentId)
  }
  return depth
}

export default function LocationFormModal({
  mode,
  location,
  locations,
  users,
  optionsError,
  onClose,
  onSubmit,
}: LocationFormModalProps) {
  const [values, setValues] = useState<LocationFormValues>({
    name: location?.name ?? '',
    code: location?.code ?? '',
    surface: location?.surface ?? '',
    parentId: location?.parentId ?? null,
    responsibleId: location?.responsibleId ?? users[0]?.id ?? 0,
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const onCloseRef = useRef(onClose)
  const savingRef = useRef(saving)
  const optionsReady = users.length > 0

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
    nameInputRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [location?.id, mode])

  const updateValue = <K extends keyof LocationFormValues>(key: K, value: LocationFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await onSubmit(values)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo guardar la ubicación. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  // Una ubicación no puede colgar de sí misma ni de uno de sus descendientes.
  const excludedIds = new Set<number>()
  if (location) {
    excludedIds.add(location.id)
    let grew = true
    while (grew) {
      grew = false
      for (const candidate of locations) {
        if (candidate.parentId !== null && excludedIds.has(candidate.parentId) && !excludedIds.has(candidate.id)) {
          excludedIds.add(candidate.id)
          grew = true
        }
      }
    }
  }
  const parentOptions = locations.filter((candidate) => !excludedIds.has(candidate.id))

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="location-form-title" className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono text-slate-500">{mode === 'create' ? 'NUEVA UBICACIÓN' : location?.code}</div>
            <h3 id="location-form-title" className="font-semibold text-lg">{mode === 'create' ? 'Nueva ubicación' : 'Editar ubicación'}</h3>
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
                <FieldLabel htmlFor="location-name">Nombre</FieldLabel>
                <input ref={nameInputRef} id="location-name" value={values.name} onChange={(event) => updateValue('name', event.target.value)} required className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <FieldLabel htmlFor="location-code">Código</FieldLabel>
                <input id="location-code" value={values.code} onChange={(event) => updateValue('code', event.target.value)} required placeholder="PIN-XX-00" className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <FieldLabel htmlFor="location-surface">Superficie</FieldLabel>
                <input id="location-surface" value={values.surface} onChange={(event) => updateValue('surface', event.target.value)} required placeholder="120 m²" className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <FieldLabel htmlFor="location-responsible">Responsable</FieldLabel>
                <select id="location-responsible" value={values.responsibleId || ''} onChange={(event) => updateValue('responsibleId', Number(event.target.value))} required className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                  <option value="">Selecciona un responsable</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <FieldLabel htmlFor="location-parent">Ubicación padre</FieldLabel>
                <select id="location-parent" value={values.parentId ?? ''} onChange={(event) => updateValue('parentId', event.target.value ? Number(event.target.value) : null)} className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                  <option value="">Sin padre (raíz del proyecto)</option>
                  {parentOptions.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{'—'.repeat(locationDepth(locations, candidate.id))} {candidate.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm disabled:opacity-40">Cancelar</button>
            <button type="submit" disabled={saving || !optionsReady || optionsError} className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">{saving ? 'Guardando…' : mode === 'create' ? 'Crear ubicación' : 'Guardar cambios'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
