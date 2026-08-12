import { useEffect, useRef, useState } from 'react'
import type { ApiLocation, FloorPlanWriteInput } from '@/lib/api'

interface FloorPlanCreateModalProps {
  open: boolean
  locations: ApiLocation[]
  projectId: number
  initialLocationId: number | null
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: FloorPlanWriteInput, file: File) => Promise<void>
}

export default function FloorPlanCreateModal({ open, locations, projectId, initialLocationId, busy, error, onClose, onSubmit }: FloorPlanCreateModalProps) {
  const [name, setName] = useState('')
  const [locationId, setLocationId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const location = locations.find((item) => item.id === initialLocationId) ?? locations[0]
    setLocationId(location ? String(location.id) : '')
    setName(location ? `Plano ${location.label}` : '')
    setFile(null)
  }, [initialLocationId, locations, open])

  if (!open) return null
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!file || !locationId) return
    await onSubmit({ name: name.trim(), projectId, locationId: Number(locationId) }, file)
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4" onClick={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <form role="dialog" aria-modal="true" aria-label="Crear plano" onSubmit={(event) => void submit(event)} className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between"><h2 className="font-semibold">Crear plano</h2><button type="button" aria-label="Cerrar" disabled={busy} onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">×</button></div>
        <div className="p-5 space-y-4">
          <label className="block text-sm font-medium">Nombre<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" /></label>
          <label className="block text-sm font-medium">Ubicación<select required value={locationId} onChange={(event) => setLocationId(event.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"><option value="">Selecciona una ubicación</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}</select></label>
          <label className="block text-sm font-medium">Imagen del plano<input ref={fileRef} required type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" /></label>
          {file && <p className="text-xs text-slate-500">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <div className="p-5 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm">Cancelar</button><button type="submit" disabled={busy || !file || !name.trim() || !locationId} className="px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-40">{busy ? 'Creando…' : 'Crear plano'}</button></div>
      </form>
    </div>
  )
}
