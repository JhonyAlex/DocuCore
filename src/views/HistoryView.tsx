import { auditLogs } from '@/data/mock'

export default function HistoryView() {
  return (
    <section className="fade-in">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Historial y auditoría</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Trazabilidad completa de cambios en activos, documentos y eventos</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
            <option>Todos los tipos de acción</option>
            <option>Creación</option>
            <option>Modificación</option>
            <option>Cambio de estado</option>
            <option>Cambio de ubicación</option>
          </select>
          <button className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">Exportar</button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Fecha</th>
              <th className="text-left px-4 py-3">Usuario</th>
              <th className="text-left px-4 py-3">Acción</th>
              <th className="text-left px-4 py-3">Entidad</th>
              <th className="text-left px-4 py-3">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {auditLogs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{log.timestamp}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full ${log.userColorClass} text-white text-xs font-medium flex items-center justify-center`}>{log.userInitials}</div>
                    <span>{log.userName}</span>
                  </div>
                </td>
                <td className="px-4 py-3"><span className={`chip ${log.actionChipClass}`}>{log.action}</span></td>
                <td className="px-4 py-3 font-mono text-xs">{log.entityId}</td>
                <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{log.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
