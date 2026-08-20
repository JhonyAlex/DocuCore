import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ConfirmDialog from '@/components/ConfirmDialog'
import ProjectFormModal from '@/components/ProjectFormModal'
import { archiveProject, ApiError, createProject, fetchProjects, restoreProject, updateProject, type ApiProjectSummary, type ProjectInput } from '@/lib/api'
import { projectThemeClass } from '../../shared/projectThemes'

const PAGE_SIZE = 12

type ProjectCardProps = {
  project: ApiProjectSummary
  onOpen: () => void
  onEdit: () => void
  onArchive: () => void
}

function CardAdminActions({ project, onEdit, onArchive }: Omit<ProjectCardProps, 'onOpen'>) {
  const planLocked = project.status === 'ARCHIVED' && project.archivedByPlan
  const archiveLabel = project.status === 'ACTIVE' ? 'Archivar' : planLocked ? 'Plan requerido' : 'Reactivar'
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onEdit()
        }}
        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700 dark:hover:text-white"
      >
        Editar
      </button>
      <button
        type="button"
        disabled={planLocked}
        onClick={(event) => {
          event.stopPropagation()
          onArchive()
        }}
        title={planLocked ? 'Actualiza a Pro para reactivar este proyecto bloqueado por el límite del plan.' : undefined}
        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700 dark:hover:text-white"
      >
        {archiveLabel}
      </button>
    </div>
  )
}

function ProjectCard({ project, onOpen, onEdit, onArchive }: ProjectCardProps) {
  const status = project.status === 'ACTIVE' ? 'Activo' : project.archivedByPlan ? 'Bloqueado por plan' : 'Archivo'
  const statusClassName = project.archivedByPlan ? 'bg-amber-600/30 text-white' : 'bg-white/20 text-white'
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onOpen()
      }}
      className="group relative flex cursor-pointer flex-col overflow-visible rounded-xl border border-slate-200 bg-white transition hover:border-brand-500/40 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
    >
      <div className={`relative h-32 shrink-0 rounded-t-xl bg-gradient-to-br ${projectThemeClass[project.themeKey]}`}>
        <div className="absolute right-3 top-3">
          <span className={`chip backdrop-blur ${statusClassName}`}>{status}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <span className="font-mono text-xs text-slate-500">{project.code}</span>
        <h3 className="mt-1 text-lg font-semibold">{project.name}</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{project.description}</p>
        <div className="mt-4 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          {project.documentCount > 0 && project.assetCount === 0 ? (
            <span>{project.documentCount} documentos</span>
          ) : (
            <span>{project.assetCount} activos</span>
          )}
          <span>{project.memberCount} usuarios</span>
          {project.locationCount > 0 && <span>{project.locationCount} ubicaciones</span>}
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="flex -space-x-2">
            {project.members.slice(0, 3).map((member) => (
              <div
                key={member.id}
                title={member.name}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-medium text-white dark:border-slate-900"
                style={{ backgroundColor: member.color }}
              >
                {member.initials}
              </div>
            ))}
            {project.memberCount > 3 && (
              <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-400 text-xs font-medium text-white dark:border-slate-900">
                +{project.memberCount - 3}
              </div>
            )}
          </div>
          <CardAdminActions project={project} onEdit={onEdit} onArchive={onArchive} />
        </div>
      </div>
    </div>
  )
}

function FeaturedProjectCard({ project, onOpen, onEdit, onArchive }: ProjectCardProps) {
  const status = project.status === 'ACTIVE' ? 'Activo' : project.archivedByPlan ? 'Bloqueado por plan' : 'Archivo'
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onOpen()
      }}
      className="group relative flex cursor-pointer flex-col overflow-visible rounded-xl border border-slate-200 bg-white transition hover:border-brand-500/40 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
    >
      <div className={`relative h-32 shrink-0 rounded-t-xl bg-gradient-to-br ${projectThemeClass[project.themeKey]}`}>
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 70% 60%, white 1px, transparent 1px)',
            backgroundSize: '30px 30px',
          }}
        />
        <div className="absolute right-3 top-3">
          <span className="chip bg-white/20 text-white backdrop-blur">{status}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-mono text-xs text-slate-500">{project.code}</span>
        </div>
        <h3 className="text-lg font-semibold">{project.name}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{project.description}</p>
        <div className="mt-4 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
            {project.assetCount} activos
          </span>
          <span className="flex items-center gap-1">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            {project.memberCount} usuarios
          </span>
          <span className="flex items-center gap-1">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {project.locationCount} ubicaciones
          </span>
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="flex -space-x-2">
            {project.members.slice(0, 3).map((member) => (
              <div
                key={member.id}
                title={member.name}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-medium text-white dark:border-slate-900"
                style={{ backgroundColor: member.color }}
              >
                {member.initials}
              </div>
            ))}
            {project.memberCount > 3 && (
              <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-400 text-xs font-medium text-white dark:border-slate-900">
                +{project.memberCount - 3}
              </div>
            )}
          </div>
          <CardAdminActions project={project} onEdit={onEdit} onArchive={onArchive} />
        </div>
      </div>
    </div>
  )
}

export default function ProjectsView() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ApiProjectSummary[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<ApiProjectSummary | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<ApiProjectSummary | null>(null)
  const [archiving, setArchiving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetchProjects({ status: 'ALL', sort: 'createdAt', page, limit: PAGE_SIZE })
      setProjects(response.data)
      setTotalPages(response.totalPages)
    } catch {
      setProjects([])
      setError('No se pudieron cargar los proyectos.')
    } finally {
      setLoading(false)
    }
  }, [page])
  useEffect(() => {
    void load()
  }, [load])

  const save = async (input: ProjectInput) => {
    setSaving(true)
    setFormError(null)
    try {
      if (editing) await updateProject(editing.id, input)
      else await createProject(input)
      setEditing(undefined)
      await load()
    } catch (reason) {
      const code = reason instanceof ApiError ? reason.code : null
      setFormError(
        code === 'PROJECT_LIMIT_EXCEEDED'
          ? 'Has alcanzado el límite de proyectos activos de tu plan. Archiva uno o actualiza tu plan.'
          : code === 'PLAN_COMPLIANCE_REQUIRED'
            ? 'Debes resolver primero qué proyecto conservar para tu plan antes de crear otro.'
            : reason instanceof Error && reason.message.includes('409')
              ? 'Ya existe un proyecto con ese código.'
              : 'No se pudo guardar el proyecto.'
      )
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    if (!archiveTarget) return
    setArchiving(true)
    try {
      if (archiveTarget.status === 'ACTIVE') await archiveProject(archiveTarget.id)
      else await restoreProject(archiveTarget.id)
      setArchiveTarget(null)
      await load()
    } catch (reason) {
      const code = reason instanceof ApiError ? reason.code : null
      setError(
        code === 'PLAN_LOCKED_PROJECT'
          ? 'Este proyecto está bloqueado por el límite del plan Starter. Actualiza a Pro para reactivarlo.'
          : code === 'GRACE_PERIOD_EXPIRED'
            ? 'La ventana de 30 días para seleccionar el proyecto activo ha finalizado.'
            : 'No se pudo actualizar el estado del proyecto.'
      )
    } finally {
      setArchiving(false)
    }
  }

  const first = projects[0]

  return (
    <section className="fade-in">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proyectos</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Organiza instalaciones, plantas, clientes o proyectos documentales
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFormError(null)
            setEditing(null)
          }}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nuevo proyecto
        </button>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            />
          ))
        ) : (
          <>
            {first && (
              <FeaturedProjectCard
                project={first}
                onOpen={() => navigate(`/projects/${first.id}/dashboard`)}
                onEdit={() => {
                  setFormError(null)
                  setEditing(first)
                }}
                onArchive={() => setArchiveTarget(first)}
              />
            )}
            {projects.slice(1).map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={() => navigate(`/projects/${project.id}/dashboard`)}
                onEdit={() => {
                  setFormError(null)
                  setEditing(project)
                }}
                onArchive={() => setArchiveTarget(project)}
              />
            ))}
          </>
        )}
        <button
          type="button"
          onClick={() => {
            setFormError(null)
            setEditing(null)
          }}
          className="group flex items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white transition hover:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-400 transition group-hover:bg-brand-50 group-hover:text-brand-600 dark:bg-slate-800 dark:group-hover:bg-brand-900/30">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <div className="mt-3 font-medium">Crear nuevo proyecto</div>
            <div className="mt-1 text-xs text-slate-500">Planta, empresa, cliente o infraestructura</div>
          </div>
        </button>
      </div>
      {!loading && totalPages > 1 && (
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((value) => value - 1)}
            className="rounded border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-700"
          >
            Anterior
          </button>
          <span className="px-2 py-1.5 text-sm text-slate-500">
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            disabled={page === totalPages}
            onClick={() => setPage((value) => value + 1)}
            className="rounded border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-700"
          >
            Siguiente
          </button>
        </div>
      )}
      {editing !== undefined && (
        <ProjectFormModal
          project={editing}
          sources={projects}
          busy={saving}
          error={formError}
          onClose={() => setEditing(undefined)}
          onSubmit={(input) => void save(input)}
        />
      )}
      <ConfirmDialog
        open={archiveTarget !== null}
        title={archiveTarget?.status === 'ACTIVE' ? 'Archivar proyecto' : 'Reactivar proyecto'}
        message={
          archiveTarget?.status === 'ACTIVE' ? (
            <>
              El proyecto <span className="font-medium">{archiveTarget?.name}</span> conservará todos sus datos, pero no
              permitirá operaciones ordinarias de escritura.
            </>
          ) : (
            <>
              El proyecto <span className="font-medium">{archiveTarget?.name}</span> volverá a permitir operaciones
              ordinarias.
            </>
          )
        }
        confirmLabel={archiveTarget?.status === 'ACTIVE' ? 'Archivar' : 'Reactivar'}
        busy={archiving}
        busyLabel="Guardando…"
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => void archive()}
        variant={archiveTarget?.status === 'ACTIVE' ? 'danger' : 'primary'}
      />
    </section>
  )
}
