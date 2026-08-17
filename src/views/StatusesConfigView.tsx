import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StatusFormModal from '@/components/StatusFormModal'
import StatusChip from '@/components/StatusChip'
import BulkActionBar from '@/components/BulkActionBar'
import ConfirmDialog from '@/components/ConfirmDialog'
import RowActionsMenu from '@/components/RowActionsMenu'
import { useProject } from '@/contexts/ProjectContext'
import { useSelection } from '@/hooks/useSelection'
import {
  archiveStatus,
  createStatus,
  fetchConfiguredStatuses,
  updateStatus,
  type ApiStatus,
  type StatusInput,
} from '@/lib/api'
import { statusColorMap } from '../../shared/statusCatalog'
import type { PulseColor } from '@/types'

export default function StatusesConfigView() {
  const navigate = useNavigate()
  const { project, projectId } = useProject()
  if (projectId === null) throw new Error('StatusesConfigView requires a project scope')
  const selection = useSelection<number>()
  const [statuses, setStatuses] = useState<ApiStatus[]>([])
  const [showInactive, setShowInactive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formStatus, setFormStatus] = useState<ApiStatus | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [archiveIds, setArchiveIds] = useState<number[]>([])
  const [archiving, setArchiving] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setStatuses(await fetchConfiguredStatuses(projectId, showInactive))
    } catch {
      setError('No se pudieron cargar los estados.')
    } finally {
      setLoading(false)
    }
  }, [projectId, showInactive])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async (input: StatusInput) => {
    setSaving(true)
    setFormError(null)
    try {
      if (formStatus) await updateStatus(projectId, formStatus.id, input)
      else await createStatus(projectId, input)
      setFormStatus(undefined)
      await load()
    } catch (writeError) {
      setFormError(
        writeError instanceof Error && writeError.message.includes('409')
          ? 'Ya existe un estado con ese nombre.'
          : 'No se pudo guardar el estado.',
      )
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    setArchiving(true)
    setArchiveError(null)
    try {
      for (const id of archiveIds) await archiveStatus(projectId, id)
      selection.clear()
      setArchiveIds([])
      await load()
    } catch (archiveFailure) {
      setArchiveError(
        archiveFailure instanceof Error && archiveFailure.message.includes('409')
          ? 'No se puede archivar un estado que tenga activos asociados.'
          : 'No se pudieron archivar los estados seleccionados.',
      )
    } finally {
      setArchiving(false)
    }
  }

  const reactivate = async (statusItem: ApiStatus) => {
    setError(null)
    try {
      await updateStatus(projectId, statusItem.id, { isActive: true })
      await load()
    } catch {
      setError('No se pudo reactivar el estado.')
    }
  }

  const activeIds = statuses.filter((statusItem) => statusItem.isActive !== false).map((statusItem) => statusItem.id)

  return (
    <section className="fade-in">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => navigate(`/projects/${projectId}/config`)}
            className="mb-2 text-xs font-medium text-brand-600 hover:underline"
          >
            ← Configuración
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">Estados</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Catálogo de estados del proyecto {project?.name ?? ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFormError(null)
            setFormStatus(null)
          }}
          className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Nuevo estado
        </button>
      </div>

      <div className="mb-4">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => {
              setShowInactive(event.target.checked)
              selection.clear()
            }}
          />
          Mostrar archivados
        </label>
      </div>

      <BulkActionBar selectedCount={selection.selectedCount} onClear={selection.clear}>
        <button
          type="button"
          onClick={() => setArchiveIds(selection.selectedIds)}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          Archivar
        </button>
      </BulkActionBar>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Cargando estados…</div>
        ) : error ? (
          <div role="alert" className="p-8 text-center text-sm text-red-600">
            {error}
          </div>
        ) : statuses.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-slate-500">No hay estados configurados.</p>
            <button
              type="button"
              onClick={() => setFormStatus(null)}
              className="mt-2 text-sm font-medium text-brand-600"
            >
              Crear el primero
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                <tr>
                  <th className="w-10 px-4 py-3 whitespace-nowrap">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos los estados"
                      checked={selection.allSelected(activeIds)}
                      ref={(node) => {
                        if (node) node.indeterminate = selection.someSelected(activeIds)
                      }}
                      onChange={() => selection.toggleAll(activeIds)}
                    />
                  </th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Estado</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Visualización</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Visibilidad</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Activos</th>
                  <th className="w-14 px-4 py-3 whitespace-nowrap" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {statuses.map((statusItem) => (
                  <tr key={statusItem.id} className={statusItem.isActive === false ? 'opacity-55' : ''}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${statusItem.name}`}
                        disabled={statusItem.isActive === false}
                        checked={selection.isSelected(statusItem.id)}
                        onChange={() => selection.toggle(statusItem.id)}
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium text-slate-900 dark:text-slate-100 max-w-xs truncate" title={statusItem.name}>{statusItem.name}</div>
                      <div className="text-xs text-slate-400 truncate">
                        Estado {statusItem.id} · {statusItem.color ?? 'emerald'}
                        {statusItem.pulseDot ? ' · Alerta pulsante' : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusChip
                        label={statusItem.name}
                        chipClass={statusColorMap[statusItem.color ?? 'emerald'] ?? statusColorMap.emerald}
                        pulseDot={statusItem.pulseDot as PulseColor | undefined}
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          statusItem.isActive === false
                            ? 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        }`}
                      >
                        {statusItem.isActive === false ? 'Archivado' : 'Activo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{statusItem.assetCount ?? 0}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <RowActionsMenu
                        ariaLabel={`Acciones de ${statusItem.name}`}
                        items={[
                          {
                            label: 'Editar',
                            onSelect: () => {
                              setFormError(null)
                              setFormStatus(statusItem)
                            },
                          },
                          ...(statusItem.isActive === false
                            ? [
                                {
                                  label: 'Reactivar',
                                  variant: 'success' as const,
                                  onSelect: () => void reactivate(statusItem),
                                },
                              ]
                            : [
                                {
                                  label: 'Archivar',
                                  variant: 'danger' as const,
                                  onSelect: () => setArchiveIds([statusItem.id]),
                                },
                              ]),
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

      {formStatus !== undefined && (
        <StatusFormModal
          status={formStatus}
          busy={saving}
          error={formError}
          onClose={() => setFormStatus(undefined)}
          onSubmit={(input) => void submit(input)}
        />
      )}

      <ConfirmDialog
        open={archiveIds.length > 0}
        title="Archivar estados"
        message={
          <>
            Los estados archivados dejarán de estar disponibles para nuevos activos y cambios de estado. Solo se
            archivarán si no tienen activos asociados. ¿Archivar{' '}
            {archiveIds.length === 1 ? 'este estado' : `estos ${archiveIds.length} estados`}?
          </>
        }
        confirmLabel="Archivar"
        busy={archiving}
        busyLabel="Archivando…"
        error={archiveError}
        onConfirm={() => void archive()}
        onCancel={() => {
          setArchiveIds([])
          setArchiveError(null)
        }}
      />
    </section>
  )
}
