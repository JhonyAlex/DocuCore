import { useEffect, useState } from 'react'
import { fetchAssetHistory, type ApiAsset, type ApiAssetHistoryEntry } from '@/lib/api'
import { formatApiDate } from '@/lib/assetMappers'

export default function AssetHistoryPanel({ asset }: { asset: ApiAsset }) {
  const [entries, setEntries] = useState<ApiAssetHistoryEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setError(null)
    fetchAssetHistory(asset.id).then((rows) => { if (active) setEntries(rows) }).catch(() => { if (active) setError('No se pudo cargar el historial del activo.') })
    return () => { active = false }
  }, [asset.id])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin">
      <div className="mb-4"><h4 className="font-medium">Historial</h4><p className="text-xs text-slate-500 dark:text-slate-400">Cambios y acciones trazables sobre este activo.</p></div>
      {error && <p role="alert" className="mb-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {entries.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-700">Todavía no hay acciones registradas para este activo.</div> : <ol className="space-y-3 border-l border-slate-200 pl-4 dark:border-slate-700">{entries.map((entry) => <li key={entry.id} className="relative"><span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand-500" /><div className="text-sm font-medium">{entry.action}</div><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{entry.detail}</p><p className="mt-1 text-[11px] text-slate-400">{formatApiDate(entry.timestamp)} · {entry.user.name}</p></li>)}</ol>}
    </div>
  )
}
