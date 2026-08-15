import { useEffect, useState } from 'react'
import { projectThemeKeys, type ProjectThemeKey } from '../../shared/projectThemes'
import type { ApiProjectSummary, ProjectInput } from '@/lib/api'

type ProjectFormModalProps = {
  project?: ApiProjectSummary | null
  sources: ApiProjectSummary[]
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: ProjectInput) => void
}

const themeLabels: Record<ProjectThemeKey, string> = { blue: 'Azul', emerald: 'Verde', amber: 'Ámbar', rose: 'Rosa', slate: 'Pizarra' }

export default function ProjectFormModal({ project, sources, busy, error, onClose, onSubmit }: ProjectFormModalProps) {
  const [code, setCode] = useState(project?.code ?? '')
  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [themeKey, setThemeKey] = useState<ProjectThemeKey>(project?.themeKey ?? 'blue')
  const [sourceId, setSourceId] = useState<number | null>(null)

  useEffect(() => {
    setCode(project?.code ?? '')
    setName(project?.name ?? '')
    setDescription(project?.description ?? '')
    setThemeKey(project?.themeKey ?? 'blue')
    setSourceId(null)
  }, [project])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!code.trim() || !name.trim()) return
    onSubmit({ code: code.trim().toUpperCase(), name: name.trim(), description: description.trim(), themeKey, ...(project ? {} : sourceId ? { copyConfigurationFromProjectId: sourceId } : {}) })
  }

  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 pt-12" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <form role="dialog" aria-modal="true" aria-labelledby="project-form-title" onSubmit={submit} className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700"><h2 id="project-form-title" className="text-lg font-semibold">{project ? 'Editar proyecto' : 'Nuevo proyecto'}</h2><button type="button" aria-label="Cerrar" disabled={busy} onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">×</button></div>
      <div className="space-y-4 p-5">
        {error && <p role="alert" className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</p>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Código<input value={code} maxLength={48} onChange={(event) => setCode(event.target.value.toUpperCase())} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" required /></label><label className="block text-sm font-medium">Tema<select value={themeKey} onChange={(event) => setThemeKey(event.target.value as ProjectThemeKey)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">{projectThemeKeys.map((key) => <option key={key} value={key}>{themeLabels[key]}</option>)}</select></label></div>
        <label className="block text-sm font-medium">Nombre<input value={name} maxLength={160} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" required /></label>
        <label className="block text-sm font-medium">Descripción<textarea value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} rows={3} className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" /></label>
        {!project && <label className="block text-sm font-medium">Configuración inicial<select value={sourceId ?? ''} onChange={(event) => setSourceId(event.target.value ? Number(event.target.value) : null)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"><option value="">Configuración mínima</option>{sources.filter((source) => source.status === 'ACTIVE').map((source) => <option key={source.id} value={source.id}>Clonar configuración de {source.code} · {source.name}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-500">Copia estados, tipos, campos, tareas y planes preventivos; nunca datos operativos.</span></label>}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-700"><button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">Cancelar</button><button type="submit" disabled={busy || !code.trim() || !name.trim()} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">{busy ? 'Guardando…' : project ? 'Guardar cambios' : 'Crear proyecto'}</button></div>
    </form>
  </div>
}
