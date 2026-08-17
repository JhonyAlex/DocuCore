import { useCallback, useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import {
  adminExtendTrial,
  adminReactivateWorkspace,
  adminSuspendWorkspace,
  fetchAdminWorkspaces,
} from "@/lib/api"
import type { ApiAdminWorkspace } from "@/types"
import { useSession } from "@/contexts/SessionContext"

export default function PlatformAdminView() {
  const { user } = useSession()
  const [workspaces, setWorkspaces] = useState<ApiAdminWorkspace[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [actionBusyId, setActionBusyId] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const loadWorkspaces = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchAdminWorkspaces({
        search,
        status: statusFilter,
        page,
        limit: 20,
      })
      setWorkspaces(res.data)
      setTotal(res.total)
      setTotalPages(res.totalPages)
    } catch {
      setFeedback({ type: "error", text: "Error al cargar los espacios de trabajo." })
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, page])

  useEffect(() => {
    if (user?.isPlatformAdmin) {
      void loadWorkspaces()
    }
  }, [user, loadWorkspaces])

  if (!user?.isPlatformAdmin) {
    return <Navigate to="/projects" replace />
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    void loadWorkspaces()
  }

  const handleExtendTrial = async (wsId: number) => {
    setActionBusyId(wsId)
    setFeedback(null)
    try {
      await adminExtendTrial(wsId, { days: 14 })
      setFeedback({ type: "success", text: "Prueba extendida 14 días con éxito." })
      await loadWorkspaces()
    } catch (err: unknown) {
      setFeedback({ type: "error", text: err instanceof Error ? err.message : "Error al extender la prueba." })
    } finally {
      setActionBusyId(null)
    }
  }

  const handleSuspend = async (wsId: number) => {
    if (!window.confirm("¿Seguro que deseas suspender este espacio? Los usuarios perderán acceso de escritura.")) return
    setActionBusyId(wsId)
    setFeedback(null)
    try {
      await adminSuspendWorkspace(wsId, "Suspensión administrativa")
      setFeedback({ type: "success", text: "Espacio suspendido correctamente." })
      await loadWorkspaces()
    } catch (err: unknown) {
      setFeedback({ type: "error", text: err instanceof Error ? err.message : "Error al suspender el espacio." })
    } finally {
      setActionBusyId(null)
    }
  }

  const handleReactivate = async (wsId: number) => {
    setActionBusyId(wsId)
    setFeedback(null)
    try {
      await adminReactivateWorkspace(wsId)
      setFeedback({ type: "success", text: "Espacio reactivado correctamente." })
      await loadWorkspaces()
    } catch (err: unknown) {
      setFeedback({ type: "error", text: err instanceof Error ? err.message : "Error al reactivar el espacio." })
    } finally {
      setActionBusyId(null)
    }
  }

  return (
    <div className="space-y-6 fade-in pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Administración de plataforma</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Supervisión global de clientes, períodos de prueba y suscripciones de Report Map Online.
        </p>
      </div>

      {feedback && (
        <div
          role="alert"
          className={`rounded-lg p-3 text-xs ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <form onSubmit={handleSearchSubmit} className="flex flex-1 items-center gap-2">
          <input
            type="text"
            placeholder="Buscar por nombre, slug o correo del propietario…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-800"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 dark:bg-brand-500"
          >
            Buscar
          </button>
        </form>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Estado:</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="all">Todos los estados</option>
            <option value="TRIAL">En prueba</option>
            <option value="ACTIVE">Suscripción activa</option>
            <option value="PAST_DUE">Pago pendiente</option>
            <option value="PENDING_VERIFICATION">Verificación pendiente</option>
            <option value="SUSPENDED">Suspendidos</option>
            <option value="CANCELED">Cancelados</option>
          </select>
        </div>
      </div>

      {/* Workspaces Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50/75 text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Espacio / Empresa</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Propietario</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Estado</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Prueba / Período</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Proyectos</th>
                <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500 whitespace-nowrap">
                    Cargando espacios de trabajo…
                  </td>
                </tr>
              ) : workspaces.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500 whitespace-nowrap">
                    No se han encontrado espacios de trabajo con los filtros actuales.
                  </td>
                </tr>
              ) : (
                workspaces.map((ws) => (
                  <tr key={ws.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-900 dark:text-white max-w-44 truncate" title={ws.name}>{ws.name}</div>
                      <div className="text-[11px] text-slate-400 truncate">slug: {ws.slug}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {ws.owner ? (
                        <div className="max-w-44">
                          <div className="font-medium truncate" title={ws.owner.name}>{ws.owner.name}</div>
                          <div className="text-[11px] text-slate-400 truncate" title={ws.owner.email}>{ws.owner.email}</div>
                        </div>
                      ) : (
                        <span className="text-slate-400">Sin propietario</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          ws.billingStatus === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : ws.billingStatus === "TRIAL"
                              ? "bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300"
                              : ws.billingStatus === "PAST_DUE"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                        }`}
                      >
                        {ws.billingStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {ws.trialEndsAt
                        ? `Prueba: ${new Date(ws.trialEndsAt).toLocaleDateString("es-ES")}`
                        : ws.currentPeriodEnd
                          ? `Hasta: ${new Date(ws.currentPeriodEnd).toLocaleDateString("es-ES")}`
                          : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {ws.projectCount} {ws.projectCount === 1 ? "proyecto" : "proyectos"}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={actionBusyId === ws.id}
                          onClick={() => void handleExtendTrial(ws.id)}
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          +14d Prueba
                        </button>
                        {ws.billingStatus !== "SUSPENDED" ? (
                          <button
                            type="button"
                            disabled={actionBusyId === ws.id}
                            onClick={() => void handleSuspend(ws.id)}
                            className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                          >
                            Suspender
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={actionBusyId === ws.id}
                            onClick={() => void handleReactivate(ws.id)}
                            className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                          >
                            Reactivar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 dark:border-slate-800">
            <span className="text-xs text-slate-500">
              Mostrando página {page} de {totalPages} ({total} espacios)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border border-slate-200 px-2.5 py-1 text-xs disabled:opacity-40 dark:border-slate-700"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded border border-slate-200 px-2.5 py-1 text-xs disabled:opacity-40 dark:border-slate-700"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
