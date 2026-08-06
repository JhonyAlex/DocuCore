export default function ItemsFilters() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input placeholder="Buscar por nombre, código, serie…" className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-brand-500" />
        </div>
        <select className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
          <option>Todos los tipos</option><option>Máquina</option><option>Extintor</option><option>Vehículo</option><option>Servidor</option><option>Instrumento</option>
        </select>
        <select className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
          <option>Todos los estados</option><option>Activo</option><option>En revisión</option><option>Fuera de servicio</option><option>Vencido</option>
        </select>
        <select className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
          <option>Todas las ubicaciones</option><option>Planta 1 · Nave A</option><option>Planta 1 · Nave B</option><option>Almacén</option>
        </select>
        <button className="px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Limpiar</button>
      </div>
      <div className="flex items-center gap-2 mt-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="chip bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">Tipo: Máquina ×</span>
        <span className="chip bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">Estado: Activo ×</span>
        <button className="text-brand-600 hover:text-brand-700 ml-2">Limpiar todos</button>
      </div>
    </div>
  )
}
