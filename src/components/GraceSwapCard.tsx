import { useCallback, useEffect, useState } from 'react'
import { ApiError, fetchProjects, swapActiveProject, type ApiProjectSummary } from '@/lib/api'
import type { ApiBillingStatus } from '@/types'

interface GraceSwapCardProps {
  billing: ApiBillingStatus
  onSwapped: () => void
}

/**
 * 30-day grace window after a plan-limit downgrade: the OWNER/ADMIN may swap
 * which plan-locked project stays active. The backend remains the authority
 * (/billing/plan-change/swap); this card only renders while the window is open
 * and never re-implements the grace logic.
 */
export default function GraceSwapCard({ billing, onSwapped }: GraceSwapCardProps) {
  const [lockedProjects, setLockedProjects] = useState<ApiProjectSummary[]>([])
  const [activeProjects, setActiveProjects] = useState<ApiProjectSummary[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    Promise.all([
      fetchProjects({ status: 'ARCHIVED', limit: 100 }),
      fetchProjects({ status: 'ACTIVE', limit: 20 }),
    ])
      .then(([archived, active]) => {
        setLockedProjects(archived.data.filter((project) => project.archivedByPlan))
        setActiveProjects(active.data)
      })
      .catch(() => {
        setLockedProjects([])
        setActiveProjects([])
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const swap = async () => {
    if (selectedId === null || busy) return
    setBusy(true)
    setError(null)
    try {
      await swapActiveProject(selectedId)
      setSelectedId(null)
      onSwapped()
      load()
    } catch (reason) {
      const code = reason instanceof ApiError ? reason.code : null
      setError(
        code === 'GRACE_PERIOD_EXPIRED'
          ? 'La ventana de 30 días para seleccionar el proyecto activo ha finalizado.'
          : code === 'INVALID_PROJECT_SELECTION'
            ? 'El proyecto elegido ya no puede intercambiarse.'
            : reason instanceof Error
              ? reason.message
              : 'No se pudo cambiar el proyecto activo.',
      )
    } finally {
      setBusy(false)
    }
  }

  const graceDate = billing.graceEndsAt
    ? new Date(billing.graceEndsAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
    : ''

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="font-semibold">Ventana de gracia: cambio de proyecto activo</p>
      <p className="mt-1 text-slate-600 dark:text-slate-300">
        Hasta el <strong>{graceDate}</strong> puedes elegir qué proyecto permanece activo en tu plan. Los demás
        permanecen archivados por límite de plan (solo lectura, sin pérdida de datos).
      </p>

      {activeProjects.length > 0 && (
        <p className="mt-2 text-slate-600 dark:text-slate-300">
          Proyecto activo actual: <strong>{activeProjects[0].name}</strong> ({activeProjects[0].code})
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {lockedProjects.length > 0 ? (
        <div className="mt-3 space-y-2">
          {lockedProjects.map((project) => (
            <label
              key={project.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            >
              <input
                type="radio"
                name="grace-keep-project"
                checked={selectedId === project.id}
                onChange={() => setSelectedId(project.id)}
              />
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold">{project.name}</span>
                <span className="block truncate text-[11px] text-slate-500">{project.code}</span>
              </span>
            </label>
          ))}
          <button
            type="button"
            disabled={selectedId === null || busy}
            onClick={() => void swap()}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {busy ? 'Cambiando…' : 'Establecer como proyecto activo'}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-slate-500 dark:text-slate-400">No hay proyectos bloqueados por límite de plan en esta ventana.</p>
      )}
    </div>
  )
}
