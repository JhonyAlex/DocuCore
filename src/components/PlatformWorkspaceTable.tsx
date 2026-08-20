import type { ApiAdminWorkspace, PlanKey } from "@/types"
import { useTableDragScroll } from "@/hooks/useTableDragScroll"

interface PlatformWorkspaceTableProps {
  workspaces: ApiAdminWorkspace[]
  loading: boolean
  page: number
  total: number
  totalPages: number
  actionBusyId: number | null
  onPageChange: (page: number) => void
  onExtendTrial: (workspaceId: number) => void
  onSuspend: (workspaceId: number) => void
  onReactivate: (workspaceId: number) => void
  onAssignManualPlan: (workspace: ApiAdminWorkspace, planKey: PlanKey) => void
}

export default function PlatformWorkspaceTable({
  workspaces,
  loading,
  page,
  total,
  totalPages,
  actionBusyId,
  onPageChange,
  onExtendTrial,
  onSuspend,
  onReactivate,
  onAssignManualPlan,
}: PlatformWorkspaceTableProps) {
  const tableContainerRef = useTableDragScroll<HTMLDivElement>()

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div ref={tableContainerRef} className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-100 bg-slate-50/75 text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Espacio / Empresa</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Propietario</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Estado</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Prueba / Período</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Proyectos</th>
              <th className="sticky right-0 z-10 bg-slate-50 dark:bg-slate-800 px-4 py-3 font-semibold text-right whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)] dark:shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.3)]">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500 whitespace-nowrap">Cargando espacios de trabajo…</td></tr>
            ) : workspaces.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500 whitespace-nowrap">No se han encontrado espacios de trabajo con los filtros actuales.</td></tr>
            ) : (
              workspaces.map((workspace) => {
                const busy = actionBusyId === workspace.id
                return (
                  <tr key={workspace.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="max-w-44 truncate font-semibold text-slate-900 dark:text-white" title={workspace.name}>{workspace.name}</div>
                      <div className="truncate text-[11px] text-slate-400">slug: {workspace.slug}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {workspace.owner ? (
                        <div className="max-w-44">
                          <div className="truncate font-medium" title={workspace.owner.name}>{workspace.owner.name}</div>
                          <div className="truncate text-[11px] text-slate-400" title={workspace.owner.email}>{workspace.owner.email}</div>
                        </div>
                      ) : <span className="text-slate-400">Sin propietario</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        workspace.billingStatus === "ACTIVE"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : workspace.billingStatus === "TRIAL"
                            ? "bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300"
                            : workspace.billingStatus === "PAST_DUE"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                      }`}>{workspace.billingStatus}</span>
                      {workspace.billingSource === "MANUAL" && (
                        <div className="mt-1 text-[10px] font-medium text-violet-700 dark:text-violet-300">
                          Manual · {workspace.planKey === "STARTER" ? "Starter" : "Pro"}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {workspace.billingSource === "MANUAL"
                        ? "Licencia sin vencimiento"
                        : workspace.trialEndsAt
                          ? `Prueba: ${new Date(workspace.trialEndsAt).toLocaleDateString("es-ES")}`
                          : workspace.currentPeriodEnd
                            ? `Hasta: ${new Date(workspace.currentPeriodEnd).toLocaleDateString("es-ES")}`
                            : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {workspace.projectCount} {workspace.projectCount === 1 ? "proyecto" : "proyectos"}
                    </td>
                    <td className="sticky right-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/70 px-4 py-3 text-right whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)] dark:shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.3)]">
                      <div className="flex items-center justify-end gap-1.5">
                        <button type="button" disabled={busy || workspace.billingSource === "MANUAL"} onClick={() => onExtendTrial(workspace.id)} className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">+14d Prueba</button>
                        <button type="button" disabled={busy} onClick={() => onAssignManualPlan(workspace, "STARTER")} className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-200">Starter manual</button>
                        <button type="button" disabled={busy} onClick={() => onAssignManualPlan(workspace, "PRO")} className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-200">Pro manual</button>
                        {workspace.billingStatus !== "SUSPENDED" ? (
                          <button type="button" disabled={busy} onClick={() => onSuspend(workspace.id)} className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">Suspender</button>
                        ) : (
                          <button type="button" disabled={busy} onClick={() => onReactivate(workspace.id)} className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">Reactivar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 dark:border-slate-800">
          <span className="text-xs text-slate-500">Mostrando página {page} de {totalPages} ({total} espacios)</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))} className="rounded border border-slate-200 px-2.5 py-1 text-xs disabled:opacity-40 dark:border-slate-700">Anterior</button>
            <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))} className="rounded border border-slate-200 px-2.5 py-1 text-xs disabled:opacity-40 dark:border-slate-700">Siguiente</button>
          </div>
        </div>
      )}
    </div>
  )
}
