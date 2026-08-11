import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BulkActionBar from '@/components/BulkActionBar'
import ConfirmDialog from '@/components/ConfirmDialog'
import RowActionsMenu from '@/components/RowActionsMenu'
import { useSelection } from '@/hooks/useSelection'
import { useSession } from '@/contexts/SessionContext'
import {
  bulkUpdatePreventivePlans,
  bulkUpdateTasks,
  createPreventivePlan,
  createTask,
  deletePreventivePlan,
  deleteTask,
  duplicatePreventivePlan,
  fetchAssetTypes,
  fetchPreventivePlans,
  fetchTasks,
  updatePreventivePlan,
  updateTask,
  type ApiAssetType,
  type ApiPreventivePlanTemplate,
  type ApiTask,
  type PreventivePlanInput,
} from '@/lib/api'
import type { DocumentPeriodicity, DocumentPeriodicityMode } from '@/lib/periodicity'

const PERIODICITIES: DocumentPeriodicity[] = ['Mensual', 'Bimestral', 'Trimestral', 'Cuatrimestral', 'Semestral', 'Anual']
const PERIODICITY_MODES: DocumentPeriodicityMode[] = ['Calendario', 'Subida']

const controlClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800'

export default function PreventivesConfigView() {
  const navigate = useNavigate()
  const { session } = useSession()
  const projectId = session?.project.id ?? 0

  const [activeTab, setActiveTab] = useState<'tasks' | 'plans'>('plans')

  // Data states
  const [tasks, setTasks] = useState<ApiTask[]>([])
  const [plans, setPlans] = useState<ApiPreventivePlanTemplate[]>([])
  const [assetTypes, setAssetTypes] = useState<ApiAssetType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters & selection
  const [showInactive, setShowInactive] = useState(false)
  const taskSelection = useSelection<number>()
  const planSelection = useSelection<number>()

  // Task form modal state
  const [editingTask, setEditingTask] = useState<ApiTask | null | undefined>(undefined)
  const [taskCode, setTaskCode] = useState('')
  const [taskName, setTaskName] = useState('')
  const [taskBusy, setTaskBusy] = useState(false)
  const [taskError, setTaskError] = useState<string | null>(null)

  // Task delete state
  const [deleteTaskIds, setDeleteTaskIds] = useState<number[]>([])
  const [deletingTasks, setDeletingTasks] = useState(false)
  const [deleteTaskError, setDeleteTaskError] = useState<string | null>(null)

  // Plan form modal state
  const [editingPlan, setEditingPlan] = useState<ApiPreventivePlanTemplate | null | undefined>(undefined)
  const [planName, setPlanName] = useState('')
  const [planDescription, setPlanDescription] = useState('')
  const [planPeriodicity, setPlanPeriodicity] = useState<DocumentPeriodicity>('Trimestral')
  const [planPeriodicityMode, setPlanPeriodicityMode] = useState<DocumentPeriodicityMode>('Calendario')
  const [planTaskIds, setPlanTaskIds] = useState<number[]>([])
  const [planAssetTypeIds, setPlanAssetTypeIds] = useState<number[]>([])
  const [planBusy, setPlanBusy] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)

  // Plan delete state
  const [deletePlanIds, setDeletePlanIds] = useState<number[]>([])
  const [deletingPlans, setDeletingPlans] = useState(false)
  const [deletePlanError, setDeletePlanError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const [fetchedTasks, fetchedPlans, fetchedTypes] = await Promise.all([
        fetchTasks(projectId, showInactive),
        fetchPreventivePlans(projectId, { includeInactive: showInactive }),
        fetchAssetTypes(projectId),
      ])
      setTasks(fetchedTasks)
      setPlans(fetchedPlans)
      setAssetTypes(fetchedTypes)
    } catch {
      setError('No se pudieron cargar los datos de preventivos.')
    } finally {
      setLoading(false)
    }
  }, [projectId, showInactive])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Clear selections when switching tab or filter
  const handleTabChange = (tab: 'tasks' | 'plans') => {
    setActiveTab(tab)
    taskSelection.clear()
    planSelection.clear()
  }

  // --- TASK ACTIONS ---
  const openTaskModal = (task?: ApiTask | null) => {
    setEditingTask(task)
    setTaskCode(task?.code ?? `TSK-${String(tasks.length + 1).padStart(2, '0')}`)
    setTaskName(task?.name ?? '')
    setTaskError(null)
  }

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId) return
    setTaskBusy(true)
    setTaskError(null)
    try {
      if (editingTask) {
        await updateTask(projectId, editingTask.id, { code: taskCode, name: taskName })
      } else {
        await createTask(projectId, { code: taskCode, name: taskName })
      }
      setEditingTask(undefined)
      await loadData()
    } catch (err: unknown) {
      setTaskError(err instanceof Error ? err.message : 'No se pudo guardar la tarea.')
    } finally {
      setTaskBusy(false)
    }
  }

  const handleToggleTaskActive = async (task: ApiTask) => {
    if (!projectId) return
    try {
      await updateTask(projectId, task.id, { isActive: !task.isActive })
      await loadData()
    } catch {
      setError('No se pudo cambiar el estado de la tarea.')
    }
  }

  const handleConfirmDeleteTasks = async () => {
    if (!projectId || deleteTaskIds.length === 0) return
    setDeletingTasks(true)
    setDeleteTaskError(null)
    try {
      if (deleteTaskIds.length === 1) {
        await deleteTask(projectId, deleteTaskIds[0])
      } else {
        await bulkUpdateTasks(projectId, 'delete', deleteTaskIds)
      }
      setDeleteTaskIds([])
      taskSelection.clear()
      await loadData()
    } catch {
      setDeleteTaskError('Error al eliminar/desactivar las tareas.')
    } finally {
      setDeletingTasks(false)
    }
  }

  const handleBulkDeactivateTasks = async () => {
    if (!projectId || taskSelection.selectedIds.length === 0) return
    try {
      await bulkUpdateTasks(projectId, 'deactivate', taskSelection.selectedIds)
      taskSelection.clear()
      await loadData()
    } catch {
      setError('No se pudieron desactivar las tareas.')
    }
  }

  // --- PLAN ACTIONS ---
  const openPlanModal = (plan?: ApiPreventivePlanTemplate | null) => {
    setEditingPlan(plan)
    setPlanName(plan?.name ?? '')
    setPlanDescription(plan?.description ?? '')
    setPlanPeriodicity(plan?.periodicity ?? 'Trimestral')
    setPlanPeriodicityMode(plan?.periodicityMode ?? 'Calendario')
    setPlanTaskIds(plan?.taskIds ?? [])
    setPlanAssetTypeIds(plan?.assetTypeIds ?? (assetTypes[0] ? [assetTypes[0].id] : []))
    setPlanError(null)
  }

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId) return
    setPlanBusy(true)
    setPlanError(null)
    try {
      const payload: PreventivePlanInput = {
        name: planName,
        description: planDescription || null,
        periodicity: planPeriodicity,
        periodicityMode: planPeriodicityMode,
        taskIds: planTaskIds,
        assetTypeIds: planAssetTypeIds,
      }
      if (editingPlan) {
        await updatePreventivePlan(projectId, editingPlan.id, payload)
      } else {
        await createPreventivePlan(projectId, payload)
      }
      setEditingPlan(undefined)
      await loadData()
    } catch (err: unknown) {
      setPlanError(err instanceof Error ? err.message : 'No se pudo guardar el plan.')
    } finally {
      setPlanBusy(false)
    }
  }

  const handleDuplicatePlan = async (plan: ApiPreventivePlanTemplate) => {
    if (!projectId) return
    try {
      await duplicatePreventivePlan(projectId, plan.id)
      await loadData()
    } catch {
      setError('No se pudo duplicar el plan.')
    }
  }

  const handleTogglePlanActive = async (plan: ApiPreventivePlanTemplate) => {
    if (!projectId) return
    try {
      await updatePreventivePlan(projectId, plan.id, { isActive: !plan.isActive })
      await loadData()
    } catch {
      setError('No se pudo cambiar el estado del plan.')
    }
  }

  const handleConfirmDeletePlans = async () => {
    if (!projectId || deletePlanIds.length === 0) return
    setDeletingPlans(true)
    setDeletePlanError(null)
    try {
      if (deletePlanIds.length === 1) {
        await deletePreventivePlan(projectId, deletePlanIds[0])
      } else {
        await bulkUpdatePreventivePlans(projectId, 'delete', deletePlanIds)
      }
      setDeletePlanIds([])
      planSelection.clear()
      await loadData()
    } catch {
      setDeletePlanError('Error al eliminar/desactivar los planes.')
    } finally {
      setDeletingPlans(false)
    }
  }

  const handleBulkDeactivatePlans = async () => {
    if (!projectId || planSelection.selectedIds.length === 0) return
    try {
      await bulkUpdatePreventivePlans(projectId, 'deactivate', planSelection.selectedIds)
      planSelection.clear()
      await loadData()
    } catch {
      setError('No se pudieron desactivar los planes.')
    }
  }

  const toggleTaskSelectionForPlan = (taskId: number) => {
    setPlanTaskIds((prev) => (prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]))
  }

  const toggleAssetTypeSelectionForPlan = (assetTypeId: number) => {
    setPlanAssetTypeIds((prev) => (prev.includes(assetTypeId) ? prev.filter((id) => id !== assetTypeId) : [...prev, assetTypeId]))
  }

  const taskIds = tasks.map((t) => t.id)
  const planIds = plans.map((p) => p.id)

  return (
    <section className="fade-in space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <button type="button" onClick={() => navigate('/config')} className="mb-2 text-xs font-medium text-brand-600">
            ← Configuración
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">Gestión de preventivos</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Catálogo de tareas reutilizables y plantillas de planes preventivos del proyecto {session?.project.name ?? ''}
          </p>
        </div>
        <div>
          {activeTab === 'tasks' ? (
            <button type="button" onClick={() => openTaskModal(null)} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
              ＋ Nueva tarea
            </button>
          ) : (
            <button type="button" onClick={() => openPlanModal(null)} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
              ＋ Nuevo plan preventivo
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
        <div className="flex gap-6">
          <button
            type="button"
            onClick={() => handleTabChange('plans')}
            className={`pb-3 text-sm font-medium transition-colors ${activeTab === 'plans' ? 'border-b-2 border-brand-600 text-brand-600 dark:text-brand-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
          >
            Planes preventivos ({plans.length})
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('tasks')}
            className={`pb-3 text-sm font-medium transition-colors ${activeTab === 'tasks' ? 'border-b-2 border-brand-600 text-brand-600 dark:text-brand-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
          >
            Catálogo de tareas ({tasks.length})
          </button>
        </div>
        <label className="mb-2 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Mostrar inactivos / archivados
        </label>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</div>}

      {/* TAB 1: PLANES PREVENTIVOS */}
      {activeTab === 'plans' && (
        <>
          <BulkActionBar selectedCount={planSelection.selectedCount} onClear={planSelection.clear}>
            <button type="button" onClick={() => void handleBulkDeactivatePlans()} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              Desactivar
            </button>
            <button type="button" onClick={() => setDeletePlanIds(planSelection.selectedIds)} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white">
              Eliminar
            </button>
          </BulkActionBar>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">Cargando planes preventivos…</div>
            ) : plans.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-slate-500">No hay plantillas de planes preventivos configuradas.</p>
                <button type="button" onClick={() => openPlanModal(null)} className="mt-2 text-sm font-medium text-brand-600">
                  Crear la primera plantilla
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                    <tr>
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label="Seleccionar todos los planes"
                          checked={planSelection.allSelected(planIds)}
                          ref={(node) => {
                            if (node) node.indeterminate = planSelection.someSelected(planIds)
                          }}
                          onChange={() => planSelection.toggleAll(planIds)}
                        />
                      </th>
                      <th className="px-4 py-3 text-left">Plan preventivo</th>
                      <th className="px-4 py-3 text-left">Periodicidad</th>
                      <th className="px-4 py-3 text-left">Tareas ({tasks.length})</th>
                      <th className="px-4 py-3 text-left">Tipos de activo</th>
                      <th className="px-4 py-3 text-left">Estado</th>
                      <th className="w-14 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {plans.map((plan) => (
                      <tr key={plan.id} className={!plan.isActive ? 'opacity-55' : ''}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar ${plan.name}`}
                            checked={planSelection.isSelected(plan.id)}
                            onChange={() => planSelection.toggle(plan.id)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{plan.name}</div>
                          {plan.description && <div className="text-xs text-slate-400">{plan.description}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                            {plan.periodicity} · {plan.periodicityMode}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{plan.tasks.length} tareas</div>
                          <div className="max-w-xs truncate text-xs text-slate-400">
                            {plan.tasks.map((t) => t.code).join(', ')}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                          {plan.assetTypes.length > 0 ? plan.assetTypes.map((at) => at.name).join(', ') : 'Todos'}
                        </td>
                        <td className="px-4 py-3">
                          {plan.isActive ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Activo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              Inactivo
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <RowActionsMenu
                            ariaLabel={`Acciones de ${plan.name}`}
                            items={[
                              { label: 'Editar', onSelect: () => openPlanModal(plan) },
                              { label: 'Duplicar', onSelect: () => void handleDuplicatePlan(plan) },
                              { label: plan.isActive ? 'Desactivar' : 'Activar', onSelect: () => void handleTogglePlanActive(plan) },
                              { label: 'Eliminar', variant: 'danger' as const, onSelect: () => setDeletePlanIds([plan.id]) },
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
        </>
      )}

      {/* TAB 2: CATÁLOGO DE TAREAS */}
      {activeTab === 'tasks' && (
        <>
          <BulkActionBar selectedCount={taskSelection.selectedCount} onClear={taskSelection.clear}>
            <button type="button" onClick={() => void handleBulkDeactivateTasks()} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              Desactivar
            </button>
            <button type="button" onClick={() => setDeleteTaskIds(taskSelection.selectedIds)} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white">
              Eliminar
            </button>
          </BulkActionBar>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">Cargando tareas…</div>
            ) : tasks.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-slate-500">No hay tareas reutilizables configuradas.</p>
                <button type="button" onClick={() => openTaskModal(null)} className="mt-2 text-sm font-medium text-brand-600">
                  Crear la primera tarea
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                    <tr>
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label="Seleccionar todas las tareas"
                          checked={taskSelection.allSelected(taskIds)}
                          ref={(node) => {
                            if (node) node.indeterminate = taskSelection.someSelected(taskIds)
                          }}
                          onChange={() => taskSelection.toggleAll(taskIds)}
                        />
                      </th>
                      <th className="px-4 py-3 text-left">Código</th>
                      <th className="px-4 py-3 text-left">Nombre de la tarea</th>
                      <th className="px-4 py-3 text-left">Estado</th>
                      <th className="w-14 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {tasks.map((task) => (
                      <tr key={task.id} className={!task.isActive ? 'opacity-55' : ''}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar ${task.name}`}
                            checked={taskSelection.isSelected(task.id)}
                            onChange={() => taskSelection.toggle(task.id)}
                          />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{task.code}</td>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{task.name}</td>
                        <td className="px-4 py-3">
                          {task.isActive ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Activa
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              Inactiva
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <RowActionsMenu
                            ariaLabel={`Acciones de ${task.name}`}
                            items={[
                              { label: 'Editar', onSelect: () => openTaskModal(task) },
                              { label: task.isActive ? 'Desactivar' : 'Activar', onSelect: () => void handleToggleTaskActive(task) },
                              { label: 'Eliminar', variant: 'danger' as const, onSelect: () => setDeleteTaskIds([task.id]) },
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
        </>
      )}

      {/* TASK MODAL */}
      {editingTask !== undefined && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && !taskBusy && setEditingTask(undefined)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-lg font-semibold">{editingTask ? 'Editar tarea' : 'Nueva tarea reutilizable'}</h3>
            <form onSubmit={handleSaveTask} className="mt-4 space-y-4">
              {taskError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-300">{taskError}</p>}
              <label className="block text-xs font-medium">
                Código
                <input value={taskCode} onChange={(e) => setTaskCode(e.target.value)} required maxLength={40} className={controlClass} placeholder="TSK-01" />
              </label>
              <label className="block text-xs font-medium">
                Nombre de la tarea
                <input value={taskName} onChange={(e) => setTaskName(e.target.value)} required maxLength={100} className={controlClass} placeholder="Comprobar presión del circuito..." />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingTask(undefined)} disabled={taskBusy} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                  Cancelar
                </button>
                <button type="submit" disabled={taskBusy || !taskCode || !taskName} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40">
                  {taskBusy ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PLAN MODAL */}
      {editingPlan !== undefined && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && !planBusy && setEditingPlan(undefined)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-lg font-semibold">{editingPlan ? 'Editar plantilla de plan preventivo' : 'Nueva plantilla de plan preventivo'}</h3>
            <form onSubmit={handleSavePlan} className="mt-4 space-y-4">
              {planError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-300">{planError}</p>}

              <label className="block text-xs font-medium">
                Nombre del plan
                <input value={planName} onChange={(e) => setPlanName(e.target.value)} required maxLength={120} className={controlClass} placeholder="Mantenimiento Trimestral Climatización" />
              </label>

              <label className="block text-xs font-medium">
                Descripción
                <textarea value={planDescription} onChange={(e) => setPlanDescription(e.target.value)} rows={2} maxLength={500} className={controlClass} placeholder="Descripción opcional de los requerimientos..." />
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block text-xs font-medium">
                  Periodicidad
                  <select value={planPeriodicity} onChange={(e) => setPlanPeriodicity(e.target.value as DocumentPeriodicity)} className={controlClass}>
                    {PERIODICITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-medium">
                  Modo de periodicidad
                  <select value={planPeriodicityMode} onChange={(e) => setPlanPeriodicityMode(e.target.value as DocumentPeriodicityMode)} className={controlClass}>
                    {PERIODICITY_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              </div>

              {/* Task Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Tareas asociadas al plan ({planTaskIds.length} seleccionadas)
                </label>
                <div className="mt-1 max-h-44 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  {tasks.length === 0 ? (
                    <p className="text-xs text-slate-500">No hay tareas en el catálogo. Crea primero tareas en la pestaña "Catálogo de tareas".</p>
                  ) : (
                    tasks.map((task) => (
                      <label key={task.id} className="flex items-center gap-2 text-xs hover:text-brand-600">
                        <input
                          type="checkbox"
                          checked={planTaskIds.includes(task.id)}
                          onChange={() => toggleTaskSelectionForPlan(task.id)}
                          className="rounded border-slate-300 text-brand-600"
                        />
                        <span className="font-mono font-semibold">{task.code}</span>
                        <span>{task.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Asset Type Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Tipos de activo aplicables ({planAssetTypeIds.length} seleccionados)
                </label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {assetTypes.map((at) => {
                    const selected = planAssetTypeIds.includes(at.id)
                    return (
                      <button
                        key={at.id}
                        type="button"
                        onClick={() => toggleAssetTypeSelectionForPlan(at.id)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          selected
                            ? 'bg-brand-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {at.name} {selected ? '✓' : '+'}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingPlan(undefined)} disabled={planBusy} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                  Cancelar
                </button>
                <button type="submit" disabled={planBusy || !planName} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40">
                  {planBusy ? 'Guardando…' : 'Guardar plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE TASKS */}
      <ConfirmDialog
        open={deleteTaskIds.length > 0}
        title="Eliminar / Archivar tareas"
        message={
          <>
            Las tareas que ya hayan sido ejecutadas o estén asociadas a planes se desactivarán automáticamente para preservar el histórico.
            ¿Deseas eliminar/desactivar {deleteTaskIds.length === 1 ? 'esta tarea' : `estas ${deleteTaskIds.length} tareas`}?
          </>
        }
        confirmLabel="Eliminar"
        busy={deletingTasks}
        busyLabel="Procesando…"
        error={deleteTaskError}
        onConfirm={() => void handleConfirmDeleteTasks()}
        onCancel={() => {
          setDeleteTaskIds([])
          setDeleteTaskError(null)
        }}
      />

      {/* CONFIRM DELETE PLANS */}
      <ConfirmDialog
        open={deletePlanIds.length > 0}
        title="Eliminar / Archivar plantillas de plan"
        message={
          <>
            Los planes asignados a activos conservarán su histórico de ejecuciones. Si la plantilla está asignada a algún activo, se desactivará en lugar de borrarse físicamente.
            ¿Deseas continuar con {deletePlanIds.length === 1 ? 'este plan' : `estos ${deletePlanIds.length} planes`}?
          </>
        }
        confirmLabel="Eliminar"
        busy={deletingPlans}
        busyLabel="Procesando…"
        error={deletePlanError}
        onConfirm={() => void handleConfirmDeletePlans()}
        onCancel={() => {
          setDeletePlanIds([])
          setDeletePlanError(null)
        }}
      />
    </section>
  )
}
