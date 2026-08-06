import { useState, useRef, useEffect } from 'react'
import type { FloorPlanMarker } from '@/types'
import { floorPlanMarkers as initialMarkers } from '@/data/mock'

const borderClasses: Record<string, string> = {
  'bg-brand-600': 'border-t-brand-600',
  'bg-red-600': 'border-t-red-600',
  'bg-amber-500': 'border-t-amber-500',
  'bg-red-500': 'border-t-red-500',
  'bg-slate-700': 'border-t-slate-700',
}

export default function PlansView() {
  const [markers, setMarkers] = useState(initialMarkers)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const dragOffset = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (draggingId === null) return
    const handleMove = (e: MouseEvent) => {
      const rect = innerRef.current?.getBoundingClientRect()
      if (!rect) return
      let x = ((e.clientX - rect.left - dragOffset.current.x) / rect.width) * 100
      let y = ((e.clientY - rect.top - dragOffset.current.y) / rect.height) * 100
      x = Math.max(0, Math.min(100, x))
      y = Math.max(0, Math.min(100, y))
      setMarkers((prev) => prev.map((m) => (m.id === draggingId ? { ...m, left: x, top: y } : m)))
    }
    const handleUp = () => setDraggingId(null)
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
  }, [draggingId])

  const startDrag = (e: React.MouseEvent, marker: FloorPlanMarker) => {
    if (e.button !== 0) return
    e.preventDefault()
    const rect = innerRef.current?.getBoundingClientRect()
    if (!rect) return
    dragOffset.current = {
      x: e.clientX - rect.left - (marker.left / 100) * rect.width,
      y: e.clientY - rect.top - (marker.top / 100) * rect.height,
    }
    setDraggingId(marker.id)
  }

  return (
    <section className="fade-in">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Planos interactivos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Visualiza y gestiona la ubicación de los activos sobre los planos</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-1">
            <button className="px-3 py-1.5 text-sm rounded-md text-slate-600 dark:text-slate-300">Ver</button>
            <button className="px-3 py-1.5 text-sm rounded-md bg-brand-600 text-white">Editar</button>
          </div>
          <button className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm">Subir nueva versión</button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <div className="xl:col-span-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="mb-4">
            <label className="text-xs text-slate-500 uppercase tracking-wider">Edificio</label>
            <select className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
              <option>Nave Principal</option><option>Anexo Oficinas</option>
            </select>
          </div>
          <div className="mb-4">
            <label className="text-xs text-slate-500 uppercase tracking-wider">Planta</label>
            <select className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
              <option>Planta baja</option><option>Planta 1</option><option>Sótano</option>
            </select>
          </div>
          <div className="mb-4">
            <label className="text-xs text-slate-500 uppercase tracking-wider">Plano</label>
            <select className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
              <option>Plano general v4.2</option><option>Plano eléctrico v2.1</option>
            </select>
            <div className="text-xs text-slate-500 mt-1">Subido: 08/06/2026 · 3.2 MB</div>
          </div>
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Capas</div>
            <label className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" defaultChecked className="rounded" /> <span className="w-2 h-2 rounded-full bg-red-500" /> Extintores</label>
            <label className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" defaultChecked className="rounded" /> <span className="w-2 h-2 rounded-full bg-brand-500" /> Maquinaria</label>
            <label className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" defaultChecked className="rounded" /> <span className="w-2 h-2 rounded-full bg-amber-500" /> Instrumentos</label>
            <label className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" className="rounded" /> <span className="w-2 h-2 rounded-full bg-emerald-500" /> Redes</label>
            <label className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" className="rounded" /> <span className="w-2 h-2 rounded-full bg-purple-500" /> Electricidad</label>
          </div>
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-2">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Leyenda de estado</div>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Activo</div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-500" /> Por revisar</div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500" /> Fuera de servicio / Vencido</div>
            </div>
          </div>
        </div>

        <div className="xl:col-span-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <button className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg></button>
              <button className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></svg></button>
              <button className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v18H3z" /><path d="M9 3v18M3 9h18" /></svg></button>
              <span className="text-xs text-slate-500">Zoom: 100% · Coordenadas normalizadas (0–1)</span>
            </div>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1.5 rounded-md text-xs bg-slate-100 dark:bg-slate-800">Deshacer</button>
              <button className="px-3 py-1.5 rounded-md text-xs bg-slate-100 dark:bg-slate-800">Rehacer</button>
              <button className="px-3 py-1.5 rounded-md text-xs bg-brand-600 text-white">Guardar posiciones</button>
            </div>
          </div>
          <div className="relative bg-slate-100 dark:bg-slate-950 overflow-auto" style={{ height: '600px' }}>
            <div ref={innerRef} className="relative mx-auto" style={{ width: '1000px', height: '580px' }}>
              <img src="/floor-plan.png" className="w-full h-full object-contain" alt="plano" />
              {markers.map((m) => (
                <div
                  key={m.id}
                  className={`pin absolute ${draggingId === m.id ? 'cursor-grabbing' : 'cursor-move'}`}
                  style={{ left: `${m.left}%`, top: `${m.top}%`, transform: 'translate(-50%,-100%)' }}
                  onMouseDown={(e) => startDrag(e, m)}
                >
                  <div className="relative flex flex-col items-center">
                    <div className={`${m.pinColorClass} text-white px-2 py-1 rounded-md shadow-lg text-xs font-medium whitespace-nowrap flex items-center gap-1.5${m.animate ? ' animate-pulse' : ''}`}>
                      <span className={`w-2 h-2 rounded-full ${m.dotColorClass}`} />
                      {m.code}{m.label && ` · ${m.label}`}
                    </div>
                    <div className={`w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent ${borderClasses[m.pinColorClass]}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
