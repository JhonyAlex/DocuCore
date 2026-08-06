import { documents, docKpis } from '@/data/mock'

export default function DocumentsView() {
  return (
    <section className="fade-in">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Fichas técnicas, certificados, manuales y contratos</p>
        </div>
        <button className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium flex items-center gap-1.5">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
          Subir documento
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        {docKpis.map((kpi) => (
          <div key={kpi.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${kpi.bgClass} flex items-center justify-center text-lg font-semibold`}>{kpi.value}</div>
            <div>
              <div className="text-sm font-medium">{kpi.label}</div>
              <div className="text-xs text-slate-500">{kpi.sublabel}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Documento</th>
                <th className="text-left px-4 py-3">Ítem asociado</th>
                <th className="text-left px-4 py-3">Tipo</th>
                <th className="text-left px-4 py-3">Versión</th>
                <th className="text-left px-4 py-3">Emisión</th>
                <th className="text-left px-4 py-3">Vencimiento</th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="text-right px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg ${doc.iconBgClass} flex items-center justify-center text-xs font-bold`}>{doc.fileFormat}</div>
                      <div>
                        <div className="font-medium">{doc.name}</div>
                        <div className="text-xs text-slate-500">{doc.size}{doc.uploadInfo && ` · ${doc.uploadInfo}`}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{doc.itemCode} · {doc.itemName}</td>
                  <td className="px-4 py-3"><span className={`chip ${doc.typeChipClass}`}>{doc.type}</span></td>
                  <td className="px-4 py-3 font-mono text-xs">{doc.version}</td>
                  <td className="px-4 py-3 text-xs">{doc.issueDate}</td>
                  <td className="px-4 py-3 text-xs">{doc.expiryDate}</td>
                  <td className="px-4 py-3"><span className={`chip ${doc.statusChipClass}`}>{doc.status}</span></td>
                  <td className="px-4 py-3 text-right"><button className="px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-xs">Descargar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
