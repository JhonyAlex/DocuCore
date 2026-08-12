import type { FloorPlanViewerActions } from '@/components/FloorPlanViewer'

interface PlanEditorControlsProps {
  dirty: boolean
  canUndo: boolean
  canRedo: boolean
  saving: boolean
  actions: FloorPlanViewerActions | null
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
}

export function PlanModeToggle({ editMode, onModeChange }: { editMode: boolean; onModeChange: (editMode: boolean) => void }) {
  return (
    <div className="flex items-center bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-1">
      <button type="button" onClick={() => onModeChange(false)} aria-pressed={!editMode} className={`px-3 py-1.5 text-sm rounded-md ${!editMode ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>Ver</button>
      <button type="button" onClick={() => onModeChange(true)} aria-pressed={editMode} className={`px-3 py-1.5 text-sm rounded-md ${editMode ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>Editar</button>
    </div>
  )
}

export default function PlanEditorControls({ dirty, canUndo, canRedo, saving, actions, onUndo, onRedo, onSave }: PlanEditorControlsProps) {
  return (
    <>
      <button type="button" aria-label="Acercar" onClick={() => actions?.zoomIn()} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800">＋</button>
      <button type="button" aria-label="Alejar" onClick={() => actions?.zoomOut()} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800">−</button>
      <button type="button" aria-label="Ajustar al visor" onClick={() => actions?.fit()} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800">⌗</button>
      <button type="button" disabled={!canUndo || saving} onClick={onUndo} className="px-3 py-1.5 rounded-md text-xs bg-slate-100 dark:bg-slate-800 disabled:opacity-40">Deshacer</button>
      <button type="button" disabled={!canRedo || saving} onClick={onRedo} className="px-3 py-1.5 rounded-md text-xs bg-slate-100 dark:bg-slate-800 disabled:opacity-40">Rehacer</button>
      <button type="button" disabled={!dirty || saving} onClick={onSave} className="px-3 py-1.5 rounded-md text-xs bg-brand-600 text-white disabled:opacity-40">{saving ? 'Guardando…' : 'Guardar posiciones'}</button>
    </>
  )
}
