import { useCallback, useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import ManualPlanActivationDialog from "@/components/ManualPlanActivationDialog"
import PlatformWorkspaceTable from "@/components/PlatformWorkspaceTable"
import {
  adminAssignManualPlan,
  adminExtendTrial,
  adminReactivateWorkspace,
  adminSuspendWorkspace,
  fetchAdminWorkspaces,
} from "@/lib/api"
import type { ApiAdminWorkspace, PlanKey } from "@/types"
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
  const [manualPlanTarget, setManualPlanTarget] = useState<{ workspace: ApiAdminWorkspace; planKey: PlanKey } | null>(null)
  const [manualPlanError, setManualPlanError] = useState<string | null>(null)

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

  const handleAssignManualPlan = async () => {
    if (!manualPlanTarget) return
    const { workspace, planKey } = manualPlanTarget
    setActionBusyId(workspace.id)
    setManualPlanError(null)
    setFeedback(null)
    try {
      await adminAssignManualPlan(workspace.id, planKey)
      setManualPlanTarget(null)
      setFeedback({ type: "success", text: `Licencia manual ${planKey === "STARTER" ? "Starter" : "Pro"} activada para ${workspace.name}.` })
      await loadWorkspaces()
    } catch (err: unknown) {
      setManualPlanError(err instanceof Error ? err.message : "Error al activar la licencia manual.")
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

      <PlatformWorkspaceTable
        workspaces={workspaces}
        loading={loading}
        page={page}
        total={total}
        totalPages={totalPages}
        actionBusyId={actionBusyId}
        onPageChange={setPage}
        onExtendTrial={(workspaceId) => void handleExtendTrial(workspaceId)}
        onSuspend={(workspaceId) => void handleSuspend(workspaceId)}
        onReactivate={(workspaceId) => void handleReactivate(workspaceId)}
        onAssignManualPlan={(workspace, planKey) => {
          setManualPlanError(null)
          setManualPlanTarget({ workspace, planKey })
        }}
      />

      <ManualPlanActivationDialog
        target={manualPlanTarget}
        busy={actionBusyId === manualPlanTarget?.workspace.id}
        error={manualPlanError}
        onConfirm={() => void handleAssignManualPlan()}
        onCancel={() => {
          if (actionBusyId === null) setManualPlanTarget(null)
        }}
      />

    </div>
  )
}
