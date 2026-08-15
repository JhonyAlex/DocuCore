import { useEffect, useState } from "react"
import {
  changePassword,
  createBillingCheckoutSession,
  createBillingPortalSession,
  fetchBillingStatus,
} from "@/lib/api"
import type { ApiBillingStatus } from "@/types"
import { useSession } from "@/contexts/SessionContext"

export default function AccountView() {
  const { user } = useSession()
  const [billing, setBilling] = useState<ApiBillingStatus | null>(null)
  const [loadingBilling, setLoadingBilling] = useState(true)
  const [billingActionBusy, setBillingActionBusy] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let isMounted = true
    fetchBillingStatus()
      .then((data) => {
        if (isMounted) {
          setBilling(data)
          setLoadingBilling(false)
        }
      })
      .catch(() => {
        if (isMounted) setLoadingBilling(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const handleCheckout = async () => {
    setBillingActionBusy(true)
    setBillingError(null)
    try {
      const res = await createBillingCheckoutSession()
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl
      }
    } catch (err: unknown) {
      setBillingError(err instanceof Error ? err.message : "Error al iniciar la pasarela de pago.")
      setBillingActionBusy(false)
    }
  }

  const handlePortal = async () => {
    setBillingActionBusy(true)
    setBillingError(null)
    try {
      const res = await createBillingPortalSession()
      if (res.portalUrl) {
        window.location.href = res.portalUrl
      }
    } catch (err: unknown) {
      setBillingError(err instanceof Error ? err.message : "Error al abrir el portal de facturación.")
      setBillingActionBusy(false)
    }
  }

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await changePassword({ currentPassword, newPassword, confirmPassword })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setMessage("Contraseña actualizada. Las demás sesiones activas se han revocado.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo actualizar la contraseña.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-8 fade-in pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mi cuenta</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Gestiona los datos de tu espacio de trabajo, suscripción y seguridad de acceso.
        </p>
      </div>

      {/* Subscription & Billing Section */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Suscripción y facturación
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Espacio: <span className="font-medium text-slate-700 dark:text-slate-300">{billing?.name ?? "Cargando…"}</span>
            </p>
          </div>
          {billing && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                billing.billingStatus === "ACTIVE"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : billing.billingStatus === "TRIAL"
                    ? billing.trialDaysLeft > 0
                      ? "bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
              }`}
            >
              {billing.billingStatus === "ACTIVE"
                ? "Suscripción activa"
                : billing.billingStatus === "TRIAL"
                  ? billing.trialDaysLeft > 0
                    ? `Prueba activa (${billing.trialDaysLeft}d)`
                    : "Prueba finalizada (Solo lectura)"
                  : billing.billingStatus === "PAST_DUE"
                    ? "Pago pendiente"
                    : billing.billingStatus}
            </span>
          )}
        </div>

        {billingError && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {billingError}
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
          <div className="rounded-lg bg-slate-50 p-3.5 dark:bg-slate-800/60">
            <span className="text-slate-500 dark:text-slate-400">Plan contratado</span>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
              Report Map Online — Plan Profesional
            </p>
            <p className="mt-0.5 text-slate-500">Proyectos, planos y activos ilimitados</p>
          </div>

          <div className="rounded-lg bg-slate-50 p-3.5 dark:bg-slate-800/60">
            <span className="text-slate-500 dark:text-slate-400">
              {billing?.billingStatus === "TRIAL" ? "Fin del período de prueba" : "Período actual"}
            </span>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
              {billing?.trialEndsAt
                ? new Date(billing.trialEndsAt).toLocaleDateString("es-ES", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })
                : billing?.currentPeriodEnd
                  ? new Date(billing.currentPeriodEnd).toLocaleDateString("es-ES", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })
                  : "Acceso estándar"}
            </p>
            {billing?.billingStatus === "TRIAL" && billing.trialDaysLeft > 0 && (
              <p className="mt-0.5 text-brand-600 dark:text-brand-400 font-medium">
                Quedan {billing.trialDaysLeft} {billing.trialDaysLeft === 1 ? "día" : "días"} de prueba completa
              </p>
            )}
          </div>
        </div>

        {/* Read-only guarantee note */}
        <div className="mt-4 rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/30 dark:text-slate-300">
          🔒 <strong>Garantía de preservación de datos:</strong> Si finaliza el período de prueba sin contratar, tus proyectos, documentos, fotos y planos <strong>nunca se borran</strong>; tu cuenta conserva acceso permanente de lectura y descarga.
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {(!billing?.hasSubscription || billing.billingStatus === "TRIAL") && (
            <button
              type="button"
              disabled={billingActionBusy || loadingBilling}
              onClick={() => void handleCheckout()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60 dark:bg-brand-500 dark:hover:bg-brand-600"
            >
              {billingActionBusy ? "Conectando…" : "Contratar suscripción"}
            </button>
          )}

          {billing?.stripeCustomerId && (
            <button
              type="button"
              disabled={billingActionBusy}
              onClick={() => void handlePortal()}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Gestionar método de pago y facturas
            </button>
          )}
        </div>
      </section>

      {/* Security & Password Section */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          Seguridad y acceso
        </h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Usuario: <span className="font-medium text-slate-700 dark:text-slate-300">{user?.email}</span>
        </p>

        <form onSubmit={(event) => void submitPassword(event)} className="mt-5 space-y-4 max-w-lg">
          {error && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 p-2.5 rounded-lg">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-lg">
              {message}
            </p>
          )}

          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Contraseña actual
            <input
              required
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 outline-none focus:border-brand-500"
            />
          </label>

          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Nueva contraseña (mínimo 12 caracteres)
            <input
              required
              minLength={12}
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 outline-none focus:border-brand-500"
            />
          </label>

          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Confirmar nueva contraseña
            <input
              required
              minLength={12}
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 outline-none focus:border-brand-500"
            />
          </label>

          <button
            disabled={busy}
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 dark:bg-brand-500 dark:hover:bg-brand-600"
          >
            {busy ? "Guardando…" : "Actualizar contraseña"}
          </button>
        </form>
      </section>
    </div>
  )
}
