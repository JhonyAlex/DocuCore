import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DocumentTypeFormModal from '@/components/DocumentTypeFormModal'
import DocumentIcon from '@/components/DocumentIcon'
import BulkActionBar from '@/components/BulkActionBar'
import ConfirmDialog from '@/components/ConfirmDialog'
import RowActionsMenu from '@/components/RowActionsMenu'
import { useProject } from '@/contexts/ProjectContext'
import { useSelection } from '@/hooks/useSelection'
import { archiveDocumentType, createDocumentType, fetchConfiguredDocumentTypes, updateDocumentType, type ApiDocumentType, type DocumentTypeInput } from '@/lib/api'

export default function DocumentTypesConfigView() {
  const navigate = useNavigate()
  const { project, projectId } = useProject()
  if (projectId === null) throw new Error('DocumentTypesConfigView requires a project scope')
  const selection = useSelection<number>()
  const [types, setTypes] = useState<ApiDocumentType[]>([])
  const [showInactive, setShowInactive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formType, setFormType] = useState<ApiDocumentType | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [archiveIds, setArchiveIds] = useState<number[]>([])
  const [archiving, setArchiving] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setTypes(await fetchConfiguredDocumentTypes(projectId, showInactive))
    } catch {
      setError('No se pudieron cargar los tipos de documento.')
    } finally {
      setLoading(false)
    }
  }, [projectId, showInactive])

  useEffect(() => { void load() }, [load])

  const submit = async (input: DocumentTypeInput) => {
    setSaving(true)
    setFormError(null)
    try {
      if (formType) await updateDocumentType(projectId, formType.id, input)
      else await createDocumentType(projectId, input)
      setFormType(undefined)
      await load()
    } catch (writeError) {
      setFormError(writeError instanceof Error && writeError.message.includes('409') ? 'Ya existe un tipo de documento con ese nombre.' : 'No se pudo guardar el tipo de documento.')
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    setArchiving(true)
    setArchiveError(null)
    try {
      for (const id of archiveIds) await archiveDocumentType(projectId, id)
      selection.clear()
      setArchiveIds([])
      await load()
    } catch (archiveFailure) {
      setArchiveError(archiveFailure instanceof Error && archiveFailure.message.includes('409') ? 'No se puede archivar un tipo que tenga documentos asociados.' : 'No se pudieron archivar los tipos seleccionados.')
    } finally {
      setArchiving(false)
    }
  }

  const reactivate = async (type: ApiDocumentType) => {
    setError(null)
    try {
      await updateDocumentType(projectId, type.id, { isActive: true })
      await load()
    } catch {
      setError('No se pudo reactivar el tipo de documento.')
    }
  }

  const activeIds = types.filter((type) => type.isActive !== false).map((type) => type.id)
  return (
    <section className="fade-in">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <button type="button" onClick={() => navigate(`/projects/${projectId}/config`)} className="mb-2 text-xs font-medium text-brand-600">← Configuración</button>
          <h1 className="text-2xl font-semibold tracking-tight">Tipos de documento</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Catálogo de tipos de documento del proyecto {project?.name ?? ''}</p>
        </div>
        <button type="button" onClick={() => { setFormError(null); setFormType(null) }} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">Nuevo tipo</button>
      </div>
      <div className="mb-4">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={showInactive} onChange={(event) => { setShowInactive(event.target.checked); selection.clear() }} />
          Mostrar archivados
        </label>
      </div>
      <BulkActionBar selectedCount={selection.selectedCount} onClear={selection.clear}>
        <button type="button" onClick={() => setArchiveIds(selection.selectedIds)} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white">Archivar</button>
      </BulkActionBar>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Cargando tipos…</div>
        ) : error ? (
          <div role="alert" className="p-8 text-center text-sm text-red-600">{error}</div>
        ) : types.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-slate-500">No hay tipos de documento configurados.</p>
            <button type="button" onClick={() => setFormType(null)} className="mt-2 text-sm font-medium text-brand-600">Crear el primero</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                <tr>
                  <th className="w-10 px-4 py-3 whitespace-nowrap">
                    <input type="checkbox" aria-label="Seleccionar todos los tipos" checked={selection.allSelected(activeIds)} ref={(node) => { if (node) node.indeterminate = selection.someSelected(activeIds) }} onChange={() => selection.toggleAll(activeIds)} />
                  </th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Tipo de documento</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Estado</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Documentos</th>
                  <th className="w-14 px-4 py-3 whitespace-nowrap" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {types.map((type) => (
                  <tr key={type.id} className={type.isActive === false ? 'opacity-55' : ''}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <input type="checkbox" aria-label={`Seleccionar ${type.name}`} disabled={type.isActive === false} checked={selection.isSelected(type.id)} onChange={() => selection.toggle(type.id)} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2 font-medium min-w-0 max-w-xs">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                          <DocumentIcon iconKey={type.iconKey} size={16} />
                        </span>
                        <span className="truncate" title={type.name}>{type.name}</span>
                      </div>
                      <div className="text-xs text-slate-400 truncate">Tipo {type.id} · {type.iconKey}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`rounded-full px-2 py-1 text-xs ${type.isActive === false ? 'bg-slate-100 text-slate-500 dark:bg-slate-800' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                        {type.isActive === false ? 'Archivado' : 'Activo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{type.documentCount ?? 0}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <RowActionsMenu
                        ariaLabel={`Acciones de ${type.name}`}
                        items={[
                          { label: 'Editar', onSelect: () => { setFormError(null); setFormType(type) } },
                          ...(type.isActive === false
                            ? [{ label: 'Reactivar', variant: 'success' as const, onSelect: () => void reactivate(type) }]
                            : [{ label: 'Archivar', variant: 'danger' as const, onSelect: () => setArchiveIds([type.id]) }]),
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {formType !== undefined && (
        <DocumentTypeFormModal
          type={formType}
          busy={saving}
          error={formError}
          onClose={() => setFormType(undefined)}
          onSubmit={(input) => void submit(input)}
        />
      )}
      <ConfirmDialog
        open={archiveIds.length > 0}
        title="Archivar tipos de documento"
        message={<>Los tipos archivados dejarán de estar disponibles para nuevos documentos. Solo se archivarán si no tienen documentos asociados. ¿Archivar {archiveIds.length === 1 ? 'este tipo' : `estos ${archiveIds.length} tipos`}?</>}
        confirmLabel="Archivar"
        busy={archiving}
        busyLabel="Archivando…"
        error={archiveError}
        onConfirm={() => void archive()}
        onCancel={() => { setArchiveIds([]); setArchiveError(null) }}
      />
    </section>
  )
}
