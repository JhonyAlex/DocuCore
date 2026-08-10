import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/contexts/SessionContext'
import { createTask, fetchTasks, updateTask, type ApiTask } from '@/lib/api'

export default function TasksConfigView() {
  const navigate = useNavigate()
  const { session } = useSession()
  const projectId = session?.project.id ?? 0
  const [tasks, setTasks] = useState<ApiTask[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => { if (projectId) setTasks(await fetchTasks(projectId, true)) }, [projectId])
  useEffect(() => { void load().catch(() => setError('No se pudieron cargar las tareas.')) }, [load])
  const add = async (event: React.FormEvent) => { event.preventDefault(); setError(null); try { await createTask(projectId, { code, name }); setCode(''); setName(''); await load() } catch { setError('No se pudo crear la tarea. El código debe ser único.') } }
  const toggle = async (task: ApiTask) => { try { await updateTask(projectId, task.id, { isActive: !task.isActive }); await load() } catch { setError('No se pudo actualizar la tarea.') } }
  return <section className="fade-in"><div className="mb-6"><button type="button" onClick={() => navigate('/config')} className="mb-2 text-xs font-medium text-brand-600">← Configuración</button><h1 className="text-2xl font-semibold tracking-tight">Tareas</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Catálogo reutilizable para preventivos, inspecciones y otros planes periódicos.</p></div><form onSubmit={(event) => void add(event)} className="mb-5 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-[10rem_1fr_auto] dark:border-slate-800 dark:bg-slate-900"><input aria-label="Código de tarea" value={code} onChange={(event) => setCode(event.target.value)} required maxLength={40} placeholder="Código" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"/><input aria-label="Nombre de tarea" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} placeholder="Nombre o descripción corta" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"/><button className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white">Nueva tarea</button></form>{error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}<div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800/50"><tr><th className="px-4 py-3">Código</th><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3"/></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{tasks.map((task) => <tr key={task.id} className={!task.isActive ? 'opacity-50' : ''}><td className="px-4 py-3 font-mono">{task.code}</td><td className="px-4 py-3">{task.name}</td><td className="px-4 py-3">{task.isActive ? 'Activa' : 'Inactiva'}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => void toggle(task)} className="text-xs font-medium text-brand-600">{task.isActive ? 'Desactivar' : 'Activar'}</button></td></tr>)}</tbody></table></div></section>
}
