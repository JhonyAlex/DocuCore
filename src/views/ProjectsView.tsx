import type { Project } from '@/types'
import { projects } from '@/data/mock'

function ProjectCard({ project }: { project: Project }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden hover:shadow-lg hover:border-brand-500/40 transition">
      <div className={`h-32 bg-gradient-to-br ${project.gradient} relative`}>
        <div className="absolute top-3 right-3"><span className="chip bg-white/20 text-white backdrop-blur">{project.status}</span></div>
      </div>
      <div className="p-5">
        <span className="text-xs font-mono text-slate-500">{project.code}</span>
        <h3 className="font-semibold text-lg mt-1">{project.name}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{project.description}</p>
        <div className="flex items-center gap-4 mt-4 text-xs text-slate-500 dark:text-slate-400">
          {project.docCount !== undefined ? <span>{project.docCount} documentos</span> : <span>{project.assetCount} activos</span>}
          <span>{project.userCount} usuarios</span>
          {project.locationCount > 0 && <span>{project.locationCount} ubicaciones</span>}
        </div>
      </div>
    </div>
  )
}

export default function ProjectsView() {
  const [first, ...rest] = projects
  return (
    <section className="fade-in">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proyectos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Organiza instalaciones, plantas, clientes o proyectos documentales</p>
        </div>
        <button className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium flex items-center gap-1.5">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Nuevo proyecto
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden hover:shadow-lg hover:border-brand-500/40 transition group">
          <div className={`h-32 bg-gradient-to-br ${first.gradient} relative`}>
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 70% 60%, white 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
            <div className="absolute top-3 right-3"><span className="chip bg-white/20 text-white backdrop-blur">Activo</span></div>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-2"><span className="text-xs font-mono text-slate-500">{first.code}</span></div>
            <h3 className="font-semibold text-lg">{first.name}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{first.description}</p>
            <div className="flex items-center gap-4 mt-4 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>{first.assetCount} activos</span>
              <span className="flex items-center gap-1"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>{first.userCount} usuarios</span>
              <span className="flex items-center gap-1"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>{first.locationCount} ubicaciones</span>
            </div>
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex -space-x-2">
                <div className="w-7 h-7 rounded-full bg-brand-500 border-2 border-white dark:border-slate-900 text-white text-xs font-medium flex items-center justify-center">MF</div>
                <div className="w-7 h-7 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 text-white text-xs font-medium flex items-center justify-center">JR</div>
                <div className="w-7 h-7 rounded-full bg-amber-500 border-2 border-white dark:border-slate-900 text-white text-xs font-medium flex items-center justify-center">AG</div>
                <div className="w-7 h-7 rounded-full bg-slate-400 border-2 border-white dark:border-slate-900 text-white text-xs font-medium flex items-center justify-center">+3</div>
              </div>
              <button className="text-sm text-brand-600 hover:text-brand-700 font-medium">Abrir →</button>
            </div>
          </div>
        </div>

        {rest.map((project) => <ProjectCard key={project.id} project={project} />)}

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 overflow-hidden hover:border-brand-500 transition flex items-center justify-center cursor-pointer group">
          <div className="text-center p-8">
            <div className="w-12 h-12 mx-auto rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-brand-50 dark:group-hover:bg-brand-900/30 flex items-center justify-center text-slate-400 group-hover:text-brand-600 transition">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </div>
            <div className="font-medium mt-3">Crear nuevo proyecto</div>
            <div className="text-xs text-slate-500 mt-1">Planta, empresa, cliente o infraestructura</div>
          </div>
        </div>
      </div>
    </section>
  )
}
