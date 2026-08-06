import { locationDetail, locationAssets } from '@/data/mock'

export default function LocationsView() {
  return (
    <section className="fade-in">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ubicaciones</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Estructura jerárquica de centros, edificios, plantas y áreas</p>
        </div>
        <button className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium flex items-center gap-1.5">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Nueva ubicación
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="relative mb-3">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input placeholder="Buscar ubicación…" className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm" />
          </div>
          <div className="space-y-0.5 text-sm">
            <details open>
              <summary className="flex items-center gap-2 p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 font-medium">
                <svg className="w-3 h-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                <svg className="w-4 h-4 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                Planta Industrial Norte
                <span className="ml-auto text-xs text-slate-400">142</span>
              </summary>
              <div className="ml-4 space-y-0.5 mt-1">
                <details open>
                  <summary className="flex items-center gap-2 p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                    <svg className="w-3 h-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                    <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
                    Nave Principal
                    <span className="ml-auto text-xs text-slate-400">98</span>
                  </summary>
                  <div className="ml-4 space-y-0.5 mt-1">
                    <a className="flex items-center gap-2 p-2 rounded bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                      Planta 1 · Nave A
                      <span className="ml-auto text-xs">42</span>
                    </a>
                    <a className="flex items-center gap-2 p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                      <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                      Planta 1 · Nave B
                      <span className="ml-auto text-xs">31</span>
                    </a>
                    <a className="flex items-center gap-2 p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                      <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                      Sala compresores
                      <span className="ml-auto text-xs">8</span>
                    </a>
                    <a className="flex items-center gap-2 p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                      <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                      Laboratorio
                      <span className="ml-auto text-xs">17</span>
                    </a>
                  </div>
                </details>
                <details>
                  <summary className="flex items-center gap-2 p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                    <svg className="w-3 h-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                    <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
                    Anexo Oficinas
                    <span className="ml-auto text-xs text-slate-400">32</span>
                  </summary>
                </details>
                <details>
                  <summary className="flex items-center gap-2 p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                    <svg className="w-3 h-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                    <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
                    Almacén exterior
                    <span className="ml-auto text-xs text-slate-400">12</span>
                  </summary>
                </details>
              </div>
            </details>
          </div>
        </div>

        <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">{locationDetail.name}</h2>
              <div className="text-xs text-slate-500 mt-0.5">{locationDetail.parent}</div>
            </div>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1.5 rounded-md text-xs bg-slate-100 dark:bg-slate-800">Editar</button>
              <button className="px-3 py-1.5 rounded-md text-xs bg-brand-600 text-white">Ver plano</button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <div className="text-xs text-slate-500">Responsable</div>
              <div className="text-sm font-medium mt-0.5">{locationDetail.responsible}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <div className="text-xs text-slate-500">Activos</div>
              <div className="text-sm font-medium mt-0.5">{locationDetail.assetCount}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <div className="text-xs text-slate-500">Superficie</div>
              <div className="text-sm font-medium mt-0.5">{locationDetail.surface}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <div className="text-xs text-slate-500">Código</div>
              <div className="text-sm font-medium mt-0.5 font-mono">{locationDetail.code}</div>
            </div>
          </div>
          <h3 className="font-medium text-sm mb-3">Activos en esta ubicación</h3>
          <div className="space-y-2">
            {locationAssets.map((asset) => (
              <div key={asset.code} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${asset.initialsBgClass} flex items-center justify-center text-xs font-semibold`}>{asset.initials}</div>
                  <div>
                    <div className="text-sm font-medium">{asset.code} · {asset.name}</div>
                    <div className="text-xs text-slate-500">Instalado: {asset.installedDate}</div>
                  </div>
                </div>
                <span className={`chip ${asset.statusChipClass}`}>{asset.statusChipClass.includes('emerald') ? 'Activo' : 'En revisión'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
