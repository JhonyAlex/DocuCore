import ConfirmDialog from "@/components/ConfirmDialog"
import type { ApiAdminWorkspace, PlanKey } from "@/types"

interface ManualPlanActivationDialogProps {
  target: { workspace: ApiAdminWorkspace; planKey: PlanKey } | null
  busy: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}

const planLabels: Record<PlanKey, string> = {
  STARTER: "Starter",
  PRO: "Pro",
}

export default function ManualPlanActivationDialog({ target, busy, error, onConfirm, onCancel }: ManualPlanActivationDialogProps) {
  if (!target) return null

  const { workspace, planKey } = target
  return (
    <ConfirmDialog
      open
      title="Activar licencia manual"
      confirmLabel={`Activar ${planLabels[planKey]} sin Stripe`}
      busy={busy}
      busyLabel="Activando licencia…"
      error={error}
      variant="primary"
      onConfirm={onConfirm}
      onCancel={onCancel}
      message={
        <>
          Se activará el plan <strong>{planLabels[planKey]}</strong> para <strong>{workspace.name}</strong> sin pasar por Stripe. El acceso de escritura quedará activo hasta que lo suspendas o cambies desde esta administración.
          {workspace.stripeSubscriptionId && (
            <span className="mt-2 block font-medium text-amber-700 dark:text-amber-300">
              Esta acción no cancela la suscripción existente en Stripe. Cancélala allí si corresponde para evitar un cobro.
            </span>
          )}
        </>
      }
    />
  )
}
