import { useState } from 'react'
import type { ApiPreventivePlan } from '@/lib/api'
import { formatApiDate } from '@/lib/assetMappers'

const today = () => new Date().toISOString().slice(0, 10)

interface AssetPreventivePlanCardProps {
  plan: ApiPreventivePlan
  busy: boolean
  highlighted: boolean
  onExecutionElement: (executionId: number, element: HTMLDivElement | null) => void
  onUpdateDate: (planId: number, scheduledDate: string) => void
  onUnassign: (planId: number) => void
  onToggleTask: (executionId: number, taskId: number) => void
  onCompleteAll: (executionId: number) => void
  onCompleteExecution: (executionId: number) => void
}

export default function AssetPreventivePlanCard({ plan, busy, highlighted, onExecutionElement, onUpdateDate, onUnassign, onToggleTask, onCompleteAll, onCompleteExecution }: AssetPreventivePlanCardProps) {
  const [editingDate, setEditingDate] = useState(false)
  const [scheduledDate, setScheduledDate] = useState('')
  const currentExecution = plan.executions.find((execution) => !execution.completedAt)
  const isOverdue = currentExecution ? Date.parse(currentExecution.scheduledDate) < Date.parse(`${today()}T00:00:00.000Z`) : false
  const completedTaskCount = currentExecution ? currentExecution.tasks.filter((task) => task.completedAt).length : 0
  const totalTaskCount = currentExecution ? currentExecution.tasks.length : 0
  const allTasksDone = totalTaskCount > 0 && completedTaskCount === totalTaskCount

  return (
    <div ref={(element) => { if (currentExecution) onExecutionElement(currentExecution.id, element) }} data-focused-preventive={highlighted || undefined} className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow dark:border-slate-800 dark:bg-slate-900 ${highlighted ? 'ring-2 ring-brand-400 ring-offset-2 dark:ring-offset-slate-900' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
        <div>
          <h5 className="font-semibold text-slate-900 dark:text-slate-100">{plan.name}</h5>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded bg-slate-100 px-2 py-0.5 font-medium dark:bg-slate-800">{plan.periodicity} · {plan.periodicityMode}</span>
            {currentExecution && !editingDate && (
              <div className="flex items-center gap-1.5">
                <span>Próxima ejecución: <strong className={isOverdue ? 'text-red-600' : 'text-slate-700 dark:text-slate-300'}>{formatApiDate(currentExecution.scheduledDate)}</strong>{isOverdue && <span className="ml-1 font-semibold text-red-600">(Vencido)</span>}</span>
                <button type="button" onClick={() => { setEditingDate(true); setScheduledDate(currentExecution.scheduledDate.slice(0, 10)) }} className="ml-1 font-medium text-brand-600 hover:underline">Editar fecha</button>
              </div>
            )}
            {currentExecution && editingDate && (
              <div className="flex items-center gap-2">
                <input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800" />
                <button type="button" onClick={() => { onUpdateDate(plan.id, scheduledDate); setEditingDate(false) }} disabled={busy || !scheduledDate} className="rounded bg-brand-600 px-2 py-1 font-medium text-white disabled:opacity-40">Guardar</button>
                <button type="button" onClick={() => setEditingDate(false)} disabled={busy} className="text-slate-500 hover:text-slate-700">Cancelar</button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentExecution && !allTasksDone && <button type="button" disabled={busy} onClick={() => onCompleteAll(currentExecution.id)} className="rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-950/30 disabled:opacity-40">Completar todas las tareas</button>}
          {currentExecution && <button type="button" disabled={busy || !allTasksDone} onClick={() => onCompleteExecution(currentExecution.id)} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-40">Completar preventivo</button>}
          <button type="button" onClick={() => onUnassign(plan.id)} disabled={busy} title="Desvincular plan" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">Desvincular</button>
        </div>
      </div>

      {currentExecution && (
        <div className="mt-3">
          <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400"><span>Progreso de tareas ({completedTaskCount}/{totalTaskCount})</span><span>{Math.round((completedTaskCount / (totalTaskCount || 1)) * 100)}%</span></div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full bg-brand-600 transition-all duration-300" style={{ width: `${(completedTaskCount / (totalTaskCount || 1)) * 100}%` }} /></div>
          <div className="mt-3 space-y-2">
            {currentExecution.tasks.map((task) => (
              <label key={task.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors ${task.completedAt ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/30 dark:bg-emerald-950/10' : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/40'}`}>
                <input type="checkbox" checked={Boolean(task.completedAt)} disabled={busy} onChange={() => onToggleTask(currentExecution.id, task.id)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{task.code}</span>
                <span className={`text-xs ${task.completedAt ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>{task.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
