import { useState } from 'react'
import StatusChip from '@/components/StatusChip'
import type { ApiItem, ApiStatus } from '@/lib/api'
import { mapApiItemToDisplay } from '@/lib/itemMappers'

const tabs = ['Resumen', 'Características', 'Documentos', 'Eventos', 'Historial', 'Plano']

interface ItemModalProps {
  item: ApiItem | null
  statuses: ApiStatus[]
  onClose: () => void
  onEdit: () => void
  onChangeStatus: (statusId: number) => Promise<void>
}

export default function ItemModal({ item, statuses, onClose, onEdit, onChangeStatus }: ItemModalProps) {
  const [activeTab, setActiveTab] = useState(0)
  const [showStatusSelector, setShowStatusSelector] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [changingStatus, setChangingStatus] = useState(false)
  if (!item) return null
  const displayItem = mapApiItemToDisplay(item)
  const decommissionedStatus = statuses.find((status) => status.name === 'Fuera de servicio')

  const changeStatus = async (statusId: number) => {
    setStatusError(null)
    setChangingStatus(true)
    try {
      await onChangeStatus(statusId)
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'No se pudo actualizar el estado.')
    } finally {
      setChangingStatus(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono text-slate-500">{displayItem.code}</div>
            <h3 className="font-semibold text-lg">{displayItem.name}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="border-b border-slate-200 dark:border-slate-800 px-5 flex items-center gap-4 text-sm overflow-x-auto">
          {tabs.map((tab, i) => (
            <button key={tab} onClick={() => setActiveTab(i)} className={`py-3 border-b-2 ${activeTab === i ? 'border-brand-600 text-brand-600 font-medium' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'} whitespace-nowrap`}>
              {tab}
              {tab === 'Documentos' && <span className="text-xs text-slate-400 ml-1">4</span>}
              {tab === 'Eventos' && <span className="text-xs text-slate-400 ml-1">3</span>}
            </button>
          ))}
        </div>

        {activeTab === 0 && (
          <div className="p-5 overflow-y-auto scrollbar-thin">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <div className="md:col-span-2 grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                      <div className="text-xs text-slate-500">Estado</div>
                      <div className="relative mt-1 inline-block">
                        <button type="button" onClick={() => setShowStatusSelector((current) => !current)} aria-label="Cambiar estado" className="block">
                          <StatusChip label={displayItem.status} chipClass={displayItem.statusChipClass} pulseDot={displayItem.pulseDot} />
                        </button>
                        {showStatusSelector && (
                          <select value={item.statusId} onChange={(event) => void changeStatus(Number(event.target.value))} disabled={changingStatus || statuses.length === 0} aria-label="Seleccionar estado" className="absolute left-0 top-full z-10 mt-1 px-2 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs disabled:opacity-40">
                            {statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <div className="text-xs text-slate-500">Tipo</div>
                    <div className="mt-1 text-sm font-medium">{displayItem.type}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <div className="text-xs text-slate-500">Ubicación</div>
                    <div className="mt-1 text-sm font-medium">{displayItem.location}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <div className="text-xs text-slate-500">Responsable</div>
                    <div className="mt-1 text-sm font-medium flex items-center gap-1.5">
                      <span className={`w-5 h-5 rounded-full ${displayItem.responsibleColor} text-white text-[10px] font-medium flex items-center justify-center`}>{displayItem.responsibleInitials}</span>
                      {displayItem.responsible}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <div className="text-xs text-slate-500">Nº de serie</div>
                    <div className="mt-1 text-sm font-mono">{displayItem.serialNumber}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <div className="text-xs text-slate-500">Instalación</div>
                    <div className="mt-1 text-sm font-medium">{displayItem.installDate}</div>
                </div>
              </div>
              <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center aspect-square">
                <svg className="w-20 h-20 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
              </div>
            </div>

            <h4 className="font-medium mb-3">Próximos eventos</h4>
            <div className="space-y-2 mb-5">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50/70 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/50">
                <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">Mantenimiento preventivo trimestral</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">05/08/2026 · Recurrente cada 3 meses</div>
                </div>
                <button className="px-3 py-1.5 rounded-md text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">Completar</button>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-brand-50/50 dark:bg-brand-900/20 border border-brand-100 dark:border-brand-900/50">
                <div className="w-10 h-10 rounded-lg bg-brand-100 dark:bg-brand-900/40 text-brand-600 flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">Revisión certificado garantía</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">04/02/2027 · Anual</div>
                </div>
                <button className="px-3 py-1.5 rounded-md text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">Detalles</button>
              </div>
            </div>

            <h4 className="font-medium mb-3">Documentos recientes</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="w-9 h-9 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 flex items-center justify-center text-xs font-bold">PDF</div>
                <div className="flex-1">
                  <div className="text-sm font-medium">Manual técnico Haas ST-20 v3.2</div>
                  <div className="text-xs text-slate-500">4.8 MB · Subido 14/07/2026</div>
                </div>
                <button className="text-xs text-brand-600">Descargar</button>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 flex items-center justify-center text-xs font-bold">XLS</div>
                <div className="flex-1">
                  <div className="text-sm font-medium">Acta mantenimiento Q2 2026</div>
                  <div className="text-xs text-slate-500">1.2 MB · Subido 15/04/2026</div>
                </div>
                <button className="text-xs text-brand-600">Descargar</button>
              </div>
            </div>
          </div>
        )}

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <button type="button" onClick={() => decommissionedStatus && void changeStatus(decommissionedStatus.id)} disabled={changingStatus || !decommissionedStatus || item.statusId === decommissionedStatus.id} className="text-sm text-red-600 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed">Dar de baja</button>
            {statusError && <div role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{statusError}</div>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">Cerrar</button>
            <button type="button" onClick={onEdit} className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium">Editar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
