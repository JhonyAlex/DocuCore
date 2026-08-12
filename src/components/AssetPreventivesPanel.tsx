import { useEffect, useRef, useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import AssetPreventivePlanCard from '@/components/AssetPreventivePlanCard'
import {
  completeAllPreventiveTasks,
  completeAssetEvent,
  completePreventiveTask,
  createAssetPreventive,
  deleteAssetPreventive,
  fetchPreventivePlans,
  updateAssetPreventiveDate,
  type ApiAsset,
  type ApiPreventivePlanTemplate,
} from '@/lib/api'

const today = () => new Date().toISOString().slice(0, 10)

interface AssetPreventivesPanelProps {
  asset: ApiAsset
  onChanged: (asset: ApiAsset) => void
  focusExecutionId?: number | null
  onFocusHandled?: () => void
}

export default function AssetPreventivesPanel({ asset, onChanged, focusExecutionId = null, onFocusHandled }: AssetPreventivesPanelProps) {
  const [availableTemplates, setAvailableTemplates] = useState<ApiPreventivePlanTemplate[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState(0)
  const [scheduledDate, setScheduledDate] = useState(today)
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAssignForm, setShowAssignForm] = useState(false)
  const [confirmAllExecutionId, setConfirmAllExecutionId] = useState<number | null>(null)
  const [highlightedExecutionId, setHighlightedExecutionId] = useState<number | null>(null)
  const executionElements = useRef(new Map<number, HTMLDivElement>())

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

  useEffect(() => {
    if (!focusExecutionId) return
    const frame = window.requestAnimationFrame(() => {
      const element = executionElements.current.get(focusExecutionId)
      if (element) {
        setHighlightedExecutionId(focusExecutionId)
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      onFocusHandled?.()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusExecutionId, onFocusHandled])

  useEffect(() => {
    if (!highlightedExecutionId) return
    const timeout = window.setTimeout(() => setHighlightedExecutionId(null), 2_400)
    return () => window.clearTimeout(timeout)
  }, [highlightedExecutionId])

  const withUpdate = async (operation: () => Promise<ApiAsset>, fallback: string) => {
    setBusy(true)
    setError(null)
    try {
      onChanged(await operation())
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : fallback)
      return false
    } finally {
      setBusy(false)
    }
  }

  const activePlans = asset.preventivePlans ?? []
  const confirmPlan = activePlans.find((plan) => plan.executions.some((execution) => execution.id === confirmAllExecutionId))

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h4 className="font-medium text-slate-900 dark:text-slate-100">Preventivos y planes periódicos</h4><p className="text-xs text-slate-500 dark:text-slate-400">Planes asignados, ejecución de tareas e integración unificada en eventos.</p></div>
        {!showAssignForm && <button type="button" onClick={() => setShowAssignForm(true)} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">＋ Asignar plan desde plantilla</button>}
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</div>}

      {showAssignForm && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-900/50 dark:bg-brand-950/30">
          <h5 className="text-xs font-semibold text-brand-900 dark:text-brand-200">Asignar plantilla de plan preventivo</h5>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Selecciona el plan y la fecha de inicio. Heredará automáticamente la lista de tareas y la periodicidad.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium">Plantilla de plan<select value={selectedPlanId} onChange={(event) => setSelectedPlanId(Number(event.target.value))} disabled={loadingTemplates || availableTemplates.length === 0} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900">{availableTemplates.length === 0 ? <option value={0}>No hay plantillas disponibles para este activo</option> : availableTemplates.map((template) => <option key={template.id} value={template.id}>{template.name} ({template.periodicity} · {template.tasks.length} tareas)</option>)}</select></label>
            <label className="block text-xs font-medium">Fecha de inicio / primera ejecución<input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900" /></label>
          </div>
          <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setShowAssignForm(false)} disabled={busy} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800">Cancelar</button><button type="button" onClick={() => void withUpdate(() => createAssetPreventive(asset.id, { planId: selectedPlanId, scheduledDate }), 'No se pudo asignar el plan preventivo.').then((ok) => ok && setShowAssignForm(false))} disabled={busy || !selectedPlanId || !scheduledDate} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">{busy ? 'Asignando…' : 'Confirmar asignación'}</button></div>
        </div>
      )}

      {activePlans.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">Este activo no tiene planes preventivos asignados actualmente.</div> : (
        <div className="space-y-4">
          {activePlans.map((plan) => <AssetPreventivePlanCard key={plan.id} plan={plan} busy={busy} highlighted={plan.executions.some((execution) => execution.id === highlightedExecutionId)} onExecutionElement={(executionId, element) => { if (element) executionElements.current.set(executionId, element); else executionElements.current.delete(executionId) }} onUpdateDate={(planId, date) => void withUpdate(() => updateAssetPreventiveDate(asset.id, planId, date), 'No se pudo actualizar la fecha del preventivo.')} onUnassign={(planId) => void withUpdate(() => deleteAssetPreventive(asset.id, planId), 'No se pudo desvincular el plan.')} onToggleTask={(executionId, taskId) => void withUpdate(() => completePreventiveTask(asset.id, executionId, taskId), 'No se pudo actualizar el estado de la tarea.')} onCompleteAll={setConfirmAllExecutionId} onCompleteExecution={(executionId) => void withUpdate(() => completeAssetEvent(asset.id, 'preventive', executionId, today()), 'Marca todas las tareas antes de completar la ejecución.')} />)}
        </div>
      )}

      <ConfirmDialog open={confirmAllExecutionId !== null} title="Completar todas las tareas" message={`Se marcarán como realizadas solo las tareas pendientes de ${confirmPlan?.name ?? 'este preventivo'}. La ejecución seguirá abierta hasta completar el preventivo.`} confirmLabel="Completar tareas" variant="primary" busy={busy} busyLabel="Completando tareas…" onCancel={() => !busy && setConfirmAllExecutionId(null)} onConfirm={() => { if (confirmAllExecutionId === null) return; void withUpdate(() => completeAllPreventiveTasks(asset.id, confirmAllExecutionId), 'No se pudieron completar las tareas pendientes.').then((ok) => ok && setConfirmAllExecutionId(null)) }} />
    </section>
  )
}
