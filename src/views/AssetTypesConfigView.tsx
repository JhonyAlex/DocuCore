import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AssetTypeFormModal from '@/components/AssetTypeFormModal'
import AssetIcon from '@/components/AssetIcon'
import BulkActionBar from '@/components/BulkActionBar'
import ConfirmDialog from '@/components/ConfirmDialog'
import RowActionsMenu from '@/components/RowActionsMenu'
import { useProject } from '@/contexts/ProjectContext'
import { useSelection } from '@/hooks/useSelection'
import { useTableDragScroll } from '@/hooks/useTableDragScroll'
import { archiveAssetType, createAssetType, fetchConfiguredAssetTypes, updateAssetType, type ApiAssetType, type AssetTypeInput } from '@/lib/api'
import { assetTypeColorBgMap } from '../../shared/assetTypeColorCatalog'

export default function AssetTypesConfigView() {
  const navigate = useNavigate()
  const { project, projectId } = useProject()
  if (projectId === null) throw new Error('AssetTypesConfigView requires a project scope')
  const selection = useSelection<number>()
  const [types, setTypes] = useState<ApiAssetType[]>([])
  const [showInactive, setShowInactive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formType, setFormType] = useState<ApiAssetType | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [archiveIds, setArchiveIds] = useState<number[]>([])
  const [archiving, setArchiving] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setTypes(await fetchConfiguredAssetTypes(projectId, showInactive))
    } catch {
      setError('No se pudieron cargar los tipos de activo.')
    } finally {
      setLoading(false)
    }
  }, [projectId, showInactive])

  useEffect(() => { void load() }, [load])

  const submit = async (input: AssetTypeInput) => {
    setSaving(true)
    setFormError(null)
    try {
      if (formType) await updateAssetType(projectId, formType.id, input)
      else await createAssetType(projectId, input)
      setFormType(undefined)
      await load()
    } catch (writeError) {
      setFormError(writeError instanceof Error && writeError.message.includes('409') ? 'Ya existe un tipo de activo con ese nombre.' : 'No se pudo guardar el tipo de activo.')
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    setArchiving(true)
    setArchiveError(null)
    try {
      for (const id of archiveIds) await archiveAssetType(projectId, id)
      selection.clear()
      setArchiveIds([])
      await load()
    } catch (archiveFailure) {
      setArchiveError(archiveFailure instanceof Error && archiveFailure.message.includes('409') ? 'No se puede archivar un tipo que tenga activos o campos dinámicos asociados.' : 'No se pudieron archivar los tipos seleccionados.')
    } finally {
      setArchiving(false)
    }
  }

  const reactivate = async (type: ApiAssetType) => {
    setError(null)
    try {
      await updateAssetType(projectId, type.id, { isActive: true })
      await load()
    } catch {
      setError('No se pudo reactivar el tipo de activo.')
    }
  }

  const activeIds = types.filter((type) => type.isActive !== false).map((type) => type.id)
  const tableContainerRef = useTableDragScroll<HTMLDivElement>()

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button type="button" onClick={() => navigate('/config')} className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">← Volver a Configuración</button>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Tipos de activo</h2>
          <p className="text-sm text-slate-500">Gestiona los tipos de activo disponibles en {project?.name ?? 'el proyecto'}.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded" />
            Mostrar archivados
          </label>
          <button type="button" onClick={() => { setFormError(null); setFormType(null) }} className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700">＋ Nuevo tipo de activo</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <BulkActionBar selectedCount={selection.selectedCount} onClear={selection.clear}>
          <button type="button" onClick={() => setArchiveIds(selection.selectedIds)} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white">Archivar</button>
        </BulkActionBar>
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Cargando tipos…</div>
        ) : error ? (
          <div role="alert" className="p-8 text-center text-sm text-red-600">{error}</div>
        ) : types.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-slate-500">No hay tipos de activo configurados.</p>
            <button type="button" onClick={() => setFormType(null)} className="mt-2 text-sm font-medium text-brand-600">Crear el primero</button>
          </div>
        ) : (
          <div ref={tableContainerRef} className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                <tr>
                  <th className="w-10 px-4 py-3 whitespace-nowrap">
                    <input type="checkbox" aria-label="Seleccionar todos los tipos" checked={selection.allSelected(activeIds)} ref={(node) => { if (node) node.indeterminate = selection.someSelected(activeIds) }} onChange={() => selection.toggleAll(activeIds)} />
                  </th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Tipo de activo</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Estado</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Activos</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Campos dinámicos</th>
                  <th className="sticky right-0 z-10 bg-slate-50 dark:bg-slate-800 w-14 px-4 py-3 whitespace-nowrap text-right shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)] dark:shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.3)]">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {types.map((type) => (
                  <tr key={type.id} className={`group ${type.isActive === false ? 'opacity-55' : ''}`}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <input type="checkbox" aria-label={`Seleccionar ${type.name}`} disabled={type.isActive === false} checked={selection.isSelected(type.id)} onChange={() => selection.toggle(type.id)} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2 font-medium min-w-0 max-w-xs">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${assetTypeColorBgMap[type.color]}`}>
                          <AssetIcon iconKey={type.iconKey} size={16} />
                        </span>
                        <span className="truncate" title={type.name}>{type.name}</span>
                      </div>
                      <div className="text-xs text-slate-400 truncate">Tipo {type.id} · {type.iconKey} · {type.color}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`rounded-full px-2 py-1 text-xs ${type.isActive === false ? 'bg-slate-100 text-slate-500 dark:bg-slate-800' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                        {type.isActive === false ? 'Archivado' : 'Activo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{type.assetCount ?? 0}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{type.fieldCount ?? 0}</td>
                    <td className="sticky right-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/70 w-14 px-4 py-3 text-right whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)] dark:shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.3)]">
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
      {formType !== undefined && <AssetTypeFormModal type={formType} busy={saving} error={formError} onClose={() => setFormType(undefined)} onSubmit={(input) => void submit(input)} />}
      <ConfirmDialog open={archiveIds.length > 0} title="Archivar tipos de activo" message={<>Los tipos archivados dejarán de estar disponibles para nuevos activos y campos dinámicos. Solo se archivarán si no tienen relaciones. ¿Archivar {archiveIds.length === 1 ? 'este tipo' : `estos ${archiveIds.length} tipos`}?</>} confirmLabel="Archivar" busy={archiving} busyLabel="Archivando…" error={archiveError} onConfirm={() => void archive()} onCancel={() => { setArchiveIds([]); setArchiveError(null) }} />
    </section>
  )
}
