import { Link } from "react-router-dom"
import { useSession } from "@/contexts/SessionContext"

export default function TrialBanner() {
  const { workspace } = useSession()
  if (!workspace) return null

  if (workspace.billingStatus === "TRIAL") {
    const daysLeft = workspace.trialDaysLeft ?? 0
    if (daysLeft > 0) {
      return (
        <div className="flex items-center justify-between border-b border-brand-200 bg-brand-50 px-4 py-2 text-xs font-medium text-brand-900 dark:border-brand-900/60 dark:bg-brand-950/40 dark:text-brand-200">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
            <span>
              Período de prueba de Report Map Online activo: <strong>quedan {daysLeft} {daysLeft === 1 ? "día" : "días"}</strong>.
            </span>
          </div>
          <Link
            to="/account"
            className="rounded bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600"
          >
            Contratar plan
          </Link>
        </div>
      )
    }

    // Trial expired (Read-only mode)
    return (
      <div className="flex items-center justify-between border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-amber-500" />
          <span>
            Tu período de prueba ha finalizado. La cuenta está en <strong>modo solo lectura</strong> (tus datos y proyectos se conservan intactos).
          </span>
        </div>
        <Link
          to="/account"
          className="rounded bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
        >
          Activar suscripción
        </Link>
      </div>
    )
  }

  if (workspace.billingStatus === "PAST_DUE") {
    return (
      <div className="flex items-center justify-between border-b border-red-300 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-red-500" />
          <span>
            Hay un problema con tu pago. Tu cuenta está temporalmente en modo solo lectura.
          </span>
        </div>
        <Link
          to="/account"
          className="rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-700"
        >
          Actualizar método de pago
        </Link>
      </div>
    )
  }

  if (workspace.billingStatus === "SUSPENDED") {
    return (
      <div className="flex items-center justify-between border-b border-red-300 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-red-500" />
          <span>Tu cuenta ha sido suspendida por la administración de la plataforma.</span>
        </div>
        <a
          href="mailto:admin@report-map.online"
          className="rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
        >
          Contactar soporte
        </a>
      </div>
    )
  }

  return null
}
