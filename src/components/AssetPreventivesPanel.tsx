import { useEffect, useState } from 'react'
import {
  completeAssetEvent,
  completePreventiveTask,
  createAssetPreventive,
  deleteAssetPreventive,
  fetchPreventivePlans,
  updateAssetPreventiveDate,
  type ApiAsset,
  type ApiPreventivePlanTemplate,
} from '@/lib/api'
import { formatApiDate } from '@/lib/assetMappers'

const today = () => new Date().toISOString().slice(0, 10)

export default function AssetPreventivesPanel({ asset, onChanged }: { asset: ApiAsset; onChanged: (asset: ApiAsset) => void }) {
  const [availableTemplates, setAvailableTemplates] = useState<ApiPreventivePlanTemplate[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<number>(0)
  const [scheduledDate, setScheduledDate] = useState(today)
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAssignForm, setShowAssignForm] = useState(false)

  const [editingDatePlanId, setEditingDatePlanId] = useState<number | null>(null)
  const [editingScheduledDate, setEditingScheduledDate] = useState('')

  useEffect(() => {
    if (!asset.projectId) return
    setLoadingTemplates(true)
    fetchPreventivePlans(asset.projectId, { assetTypeId: asset.typeId })
      .then((templates) => {
        setAvailableTemplates(templates)
        if (templates[0]) setSelectedPlanId(templates[0].id)
      })
      .catch(() => undefined)
      .finally(() => setLoadingTemplates(false))
  }, [asset.projectId, asset.typeId])

  const handleAssign = async () => {
    if (!selectedPlanId || !scheduledDate) return
    setBusy(true)
    setError(null)
    try {
      const updated = await createAssetPreventive(asset.id, { planId: selectedPlanId, scheduledDate })
      onChanged(updated)
      setShowAssignForm(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo asignar el plan preventivo.')
    } finally {
      setBusy(false)
    }
  }

  const handleUnassign = async (planId: number) => {
    setBusy(true)
    setError(null)
    try {
      const updated = await deleteAssetPreventive(asset.id, planId)
      onChanged(updated)
    } catch {
      setError('No se pudo desvincular el plan.')
    } finally {
      setBusy(false)
    }
  }

  const handleUpdateDate = async (planId: number) => {
    if (!editingScheduledDate) return
    setBusy(true)
    setError(null)
    try {
      const updated = await updateAssetPreventiveDate(asset.id, planId, editingScheduledDate)
      onChanged(updated)
      setEditingDatePlanId(null)
    } catch {
      setError('No se pudo actualizar la fecha del preventivo.')
    } finally {
      setBusy(false)
    }
  }

  const handleToggleTask = async (executionId: number, taskId: number) => {
    setBusy(true)
    setError(null)
    try {
      const updated = await completePreventiveTask(asset.id, executionId, taskId)
      onChanged(updated)
    } catch {
      setError('No se pudo actualizar el estado de la tarea.')
    } finally {
      setBusy(false)
    }
  }

  const handleCompleteExecution = async (executionId: number) => {
    setBusy(true)
    setError(null)
    try {
      const updated = await completeAssetEvent(asset.id, 'preventive', executionId, today())
      onChanged(updated)
    } catch {
      setError('Marca todas las tareas antes de completar la ejecución.')
    } finally {
      setBusy(false)
    }
  }

  const activePlans = asset.preventivePlans ?? []

  return (
    <section className="space-y-4">
      {/* Panel header & Action */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-slate-900 dark:text-slate-100">Preventivos y planes periódicos</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Planes asignados, ejecución de tareas e integración unificada en eventos.
          </p>
        </div>
        {!showAssignForm && (
          <button
            type="button"
            onClick={() => setShowAssignForm(true)}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            ＋ Asignar plan desde plantilla
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Form: Assign plan from template selecting ONLY the start date */}
      {showAssignForm && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-900/50 dark:bg-brand-950/30">
          <h5 className="text-xs font-semibold text-brand-900 dark:text-brand-200">Asignar plantilla de plan preventivo</h5>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Selecciona el plan y la fecha de inicio. Heredará automáticamente la lista de tareas y la periodicidad.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium">
              Plantilla de plan
              <select
                value={selectedPlanId}
                onChange={(e) => setSelectedPlanId(Number(e.target.value))}
                disabled={loadingTemplates || availableTemplates.length === 0}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
              >
                {availableTemplates.length === 0 ? (
                  <option value={0}>No hay plantillas disponibles para este activo</option>
                ) : (
                  availableTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({template.periodicity} · {template.tasks.length} tareas)
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="block text-xs font-medium">
              Fecha de inicio / primera ejecución
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAssignForm(false)}
              disabled={busy}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleAssign()}
              disabled={busy || !selectedPlanId || !scheduledDate}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              {busy ? 'Asignando…' : 'Confirmar asignación'}
            </button>
          </div>
        </div>
      )}

      {/* Active Plans List */}
      {activePlans.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Este activo no tiene planes preventivos asignados actualmente.
        </div>
      ) : (
        <div className="space-y-4">
          {activePlans.map((plan) => {
            const currentExec = plan.executions.find((e) => !e.completedAt)
            const isOverdue = currentExec ? Date.parse(currentExec.scheduledDate) < Date.parse(`${today()}T00:00:00.000Z`) : false
            const completedTaskCount = currentExec ? currentExec.tasks.filter((t) => t.completedAt).length : 0
            const totalTaskCount = currentExec ? currentExec.tasks.length : 0
            const allTasksDone = totalTaskCount > 0 && completedTaskCount === totalTaskCount
            const isEditingDate = editingDatePlanId === plan.id

            return (
              <div key={plan.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                {/* Plan Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div>
                    <h5 className="font-semibold text-slate-900 dark:text-slate-100">{plan.name}</h5>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-medium dark:bg-slate-800">
                        {plan.periodicity} · {plan.periodicityMode}
                      </span>

                      {currentExec && !isEditingDate && (
                        <div className="flex items-center gap-1.5">
                          <span>
                            Próxima ejecución: <strong className={isOverdue ? 'text-red-600' : 'text-slate-700 dark:text-slate-300'}>{formatApiDate(currentExec.scheduledDate)}</strong>
                            {isOverdue && <span className="ml-1 font-semibold text-red-600">(Vencido)</span>}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDatePlanId(plan.id)
                              setEditingScheduledDate(currentExec.scheduledDate.slice(0, 10))
                            }}
                            className="text-brand-600 hover:underline font-medium ml-1"
                          >
                            Editar fecha
                          </button>
                        </div>
                      )}

                      {currentExec && isEditingDate && (
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={editingScheduledDate}
                            onChange={(e) => setEditingScheduledDate(e.target.value)}
                            className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                          />
                          <button
                            type="button"
                            onClick={() => void handleUpdateDate(plan.id)}
                            disabled={busy || !editingScheduledDate}
                            className="rounded bg-brand-600 px-2 py-1 font-medium text-white disabled:opacity-40"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingDatePlanId(null)}
                            disabled={busy}
                            className="text-slate-500 hover:text-slate-700"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {currentExec && (
                      <button
                        type="button"
                        disabled={busy || !allTasksDone}
                        onClick={() => void handleCompleteExecution(currentExec.id)}
                        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-40"
                      >
                        Completar preventivo
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleUnassign(plan.id)}
                      disabled={busy}
                      title="Desvincular plan"
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      Desvincular
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                {currentExec && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                      <span>Progreso de tareas ({completedTaskCount}/{totalTaskCount})</span>
                      <span>{Math.round((completedTaskCount / (totalTaskCount || 1)) * 100)}%</span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full bg-brand-600 transition-all duration-300"
                        style={{ width: `${(completedTaskCount / (totalTaskCount || 1)) * 100}%` }}
                      />
                    </div>

                    {/* Task checklist */}
                    <div className="mt-3 space-y-2">
                      {currentExec.tasks.map((task) => (
                        <label
                          key={task.id}
                          className={`flex items-center gap-3 rounded-lg border p-2.5 transition-colors cursor-pointer ${
                            task.completedAt
                              ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/30 dark:bg-emerald-950/10'
                              : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/40'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(task.completedAt)}
                            disabled={busy}
                            onChange={() => void handleToggleTask(currentExec.id, task.id)}
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{task.code}</span>
                          <span className={`text-xs ${task.completedAt ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                            {task.name}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
