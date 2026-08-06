import type { Item } from '@/types'
import StatusChip from '@/components/StatusChip'
import { items } from '@/data/mock'

const urgencyClass: Record<string, string> = {
  amber: 'text-amber-600',
  red: 'text-red-600',
  slate: 'text-slate-600',
}

export default function ItemsTable({ onRowClick }: { onRowClick: (item: Item) => void }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 font-medium"><input type="checkbox" className="rounded" /></th>
              <th className="text-left px-4 py-3 font-medium">Código</th>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 font-medium">Tipo</th>
              <th className="text-left px-4 py-3 font-medium">Ubicación</th>
              <th className="text-left px-4 py-3 font-medium">Estado</th>
              <th className="text-left px-4 py-3 font-medium">Próximo evento</th>
              <th className="text-left px-4 py-3 font-medium">Responsable</th>
              <th className="text-right px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((item) => (
              <tr key={item.id} onClick={() => onRowClick(item)} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer">
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="rounded" /></td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.code}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg ${item.initialsBgClass} flex items-center justify-center text-xs font-semibold`}>{item.initials}</div>
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-slate-500">{item.serialLabel}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3"><span className={`chip ${item.typeChipClass}`}>{item.type}</span></td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.location}</td>
                <td className="px-4 py-3"><StatusChip label={item.status} chipClass={item.statusChipClass} pulseDot={item.pulseDot} /></td>
                <td className="px-4 py-3">
                  <div className="text-xs">{item.nextEvent.label}</div>
                  <div className={`text-xs ${urgencyClass[item.nextEvent.urgency]}`}>{item.nextEvent.date}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full ${item.responsibleColor} text-white text-xs font-medium flex items-center justify-center`}>{item.responsibleInitials}</div>
                    <span className="text-xs">{item.responsible}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <button className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="text-sm text-slate-500 dark:text-slate-400">Mostrando 1-6 de 142 resultados</div>
        <div className="flex items-center gap-1">
          <button className="px-3 py-1.5 rounded-md text-sm hover:bg-slate-100 dark:hover:bg-slate-800">Anterior</button>
          <button className="px-3 py-1.5 rounded-md text-sm bg-brand-600 text-white">1</button>
          <button className="px-3 py-1.5 rounded-md text-sm hover:bg-slate-100 dark:hover:bg-slate-800">2</button>
          <button className="px-3 py-1.5 rounded-md text-sm hover:bg-slate-100 dark:hover:bg-slate-800">3</button>
          <span className="px-2 text-slate-400">…</span>
          <button className="px-3 py-1.5 rounded-md text-sm hover:bg-slate-100 dark:hover:bg-slate-800">24</button>
          <button className="px-3 py-1.5 rounded-md text-sm hover:bg-slate-100 dark:hover:bg-slate-800">Siguiente</button>
        </div>
      </div>
    </div>
  )
}
