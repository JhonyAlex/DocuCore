import { useEffect as lifecycleEffect, useState } from 'react'
import { completeAssetEvent, fetchAssetEventHistory, type ApiAsset, type ApiAssetEventHistory } from '@/lib/api'
import { formatApiDate } from '@/lib/assetMappers'

function status(row: ApiAssetEventHistory): string {
  if (row.completedAt) return `Completado · ${formatApiDate(row.completedDate ?? row.completedAt)}`
  return ({ overdue: 'Vencido', today: 'Hoy', upcoming: 'Próximo', pending: 'Pendiente', completed: 'Completado' })[row.status]
}

export default function AssetEventsPanel({ asset, onChanged, onOpenPreventive }: { asset: ApiAsset; onChanged: (asset: ApiAsset) => void; onOpenPreventive: (executionId: number) => void }) {
  const [rows, setRows] = useState<ApiAssetEventHistory[]>([])
  const [performedDate, setPerformedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = async () => { try { setRows(await fetchAssetEventHistory(asset.projectId, asset.id)) } catch { setError('No se pudo cargar el historial de eventos.') } }
  lifecycleEffect(() => { void load() }, [asset.id, asset.projectId])
  const complete = async (row: ApiAssetEventHistory) => {
    setBusy(row.id); setError(null)
    try { onChanged(await completeAssetEvent(asset.projectId, asset.id, row.source, row.id, performedDate)); await load() } catch (reason) { setError(reason instanceof Error && reason.message.includes('409') ? 'Completa antes todas las tareas del preventivo.' : 'No se pudo completar el evento.') } finally { setBusy(null) }
  }
  return <div className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h4 className="font-medium">Eventos y realizaciones</h4><p className="text-xs text-slate-500 dark:text-slate-400">Pendientes, próximos, vencidos y completados de todas las fuentes.</p></div><label className="text-xs text-slate-500">Fecha de realización<input type="date" value={performedDate} onChange={(event) => setPerformedDate(event.target.value)} className="ml-2 rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800" /></label></div>{error && <p role="alert" className="mb-3 text-xs text-red-600">{error}</p>}{rows.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-700">Sin eventos registrados.</div> : <div className="space-y-2">{rows.map((row) => <div key={`${row.source}:${row.id}`} className={`flex items-center gap-3 rounded-lg border p-3 ${row.completedAt ? 'border-slate-200 bg-slate-50 opacity-70 dark:border-slate-700 dark:bg-slate-800/50' : status(row) === 'Vencido' ? 'border-red-100 bg-red-50/70 dark:border-red-900/50 dark:bg-red-900/20' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{row.title}</div><div className="text-xs text-slate-500 dark:text-slate-400">{formatApiDate(row.date)} · {row.sourceLabel}{row.progress ? ` · ${row.progress.completed}/${row.progress.total} tareas` : ''}</div></div><span className="text-xs font-medium text-slate-500">{status(row)}</span>{!row.completedAt && <button type="button" onClick={() => row.source === 'preventive' ? onOpenPreventive(row.id) : void complete(row)} disabled={row.source !== 'preventive' && busy === row.id} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-600 dark:border-slate-700 dark:bg-slate-900 disabled:opacity-40">{row.source === 'preventive' ? 'Ver preventivo' : busy === row.id ? 'Completando…' : 'Completar'}</button>}</div>)}</div>}</div>
}
