import { useEffect, useState } from "react"
import {
  changePassword,
  createBillingCheckoutSession,
  createBillingPortalSession,
  fetchBillingStatus,
  initiatePlanChange,
  updateProfile,
} from "@/lib/api"
import type { ApiBillingStatus, PlanKey } from "@/types"
import { useSession } from "@/contexts/SessionContext"
import PlanChangeWizard from "@/components/PlanChangeWizard"
import { PLAN_CATALOG } from "../../shared/planCatalog"

export default function AccountView() {
  const { user, setSession } = useSession()
  const [billing, setBilling] = useState<ApiBillingStatus | null>(null)
  const [loadingBilling, setLoadingBilling] = useState(true)
  const [billingActionBusy, setBillingActionBusy] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)
  const [downgradeNotice, setDowngradeNotice] = useState<string | null>(null)

  const [name, setName] = useState(user?.name ?? "")
  const [initials, setInitials] = useState(user?.initials ?? "")
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileBusy, setProfileBusy] = useState(false)
  const [initialsCustomized, setInitialsCustomized] = useState(false)
  const [wizardPlan, setWizardPlan] = useState<PlanKey | null>(null)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (user) {
      setName(user.name)
      setInitials(user.initials)
    }
  }, [user])

  const loadBilling = () => {
    fetchBillingStatus()
      .then((data) => {
        setBilling(data)
        setLoadingBilling(false)
      })
      .catch(() => {
        setLoadingBilling(false)
      })
  }

  useEffect(() => {
    loadBilling()
  }, [])

  const handleCheckout = async (planKey: PlanKey) => {
    if (planKey === "STARTER" && billing && (billing.activeProjectsCount > PLAN_CATALOG.STARTER.maxActiveProjects || billing.activeMembersCount > PLAN_CATALOG.STARTER.maxActiveMembers)) {
      // Downgrade with multiple active projects or members: guided wizard
      // instead of a blocking notice (§17). The selections are persisted.
      setWizardPlan("STARTER")
      return
    }

    setDowngradeNotice(null)
    setBillingActionBusy(true)
    setBillingError(null)
    try {
      // Every purchase or plan change is represented by a durable transition,
      // even when the current capacity needs no explicit selection.
      const transition = await initiatePlanChange({ targetPlanKey: planKey })
      const res = await createBillingCheckoutSession(planKey, { transitionId: transition.transitionId })
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

  const handleNameChange = (val: string) => {
    setName(val)
    if (!initialsCustomized) {
      const autoInitials = val
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("")
      setInitials(autoInitials || "")
    }
  }

  const handleInitialsChange = (val: string) => {
    setInitials(val)
    setInitialsCustomized(true)
  }

  const submitProfile = async (event: React.FormEvent) => {
    event.preventDefault()
    setProfileBusy(true)
    setProfileError(null)
    setProfileMessage(null)
    try {
      const res = await updateProfile({ name: name.trim(), initials: initials.trim() || undefined })
      if (user) {
        setSession((prev) => prev ? { ...prev, user: { ...prev.user, ...res.user } } : null)
      }
      setProfileMessage("Nombre de usuario actualizado correctamente.")
      setInitialsCustomized(false)
    } catch (reason) {
      setProfileError(reason instanceof Error ? reason.message : "No se pudo actualizar el perfil.")
    } finally {
      setProfileBusy(false)
    }
  }

  const isStarterActive = billing?.billingStatus === "ACTIVE" && billing?.planKey === "STARTER"
  const isProActive = billing?.billingStatus === "ACTIVE" && billing?.planKey === "PRO"
  const isManualLicense = billing?.billingSource === "MANUAL"

  const isProfileUnchanged =
    name.trim() === (user?.name ?? "") &&
    initials.trim() === (user?.initials ?? "")

  return (
    <div className="max-w-4xl space-y-8 fade-in pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mi cuenta</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Gestiona los datos de tu perfil, espacio de trabajo, suscripción, planes y seguridad de acceso.
        </p>
      </div>

      {/* User Profile Section */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-base font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300 ring-2 ring-brand-500/20">
            {initials.trim() || user?.initials || "US"}
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Perfil de usuario
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Actualiza tu nombre visible en la plataforma y tus iniciales de identificación.
            </p>
          </div>
        </div>

        <form onSubmit={(event) => void submitProfile(event)} className="mt-5 space-y-4 max-w-lg">
          {profileError && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 p-2.5 rounded-lg">
              {profileError}
            </p>
          )}
          {profileMessage && (
            <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-lg">
              {profileMessage}
            </p>
          )}

          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Nombre de usuario / Nombre completo
            <input
              required
              id="account-user-name"
              type="text"
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(event) => handleNameChange(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 outline-none focus:border-brand-500"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Iniciales
              <input
                id="account-user-initials"
                type="text"
                maxLength={8}
                value={initials}
                onChange={(event) => handleInitialsChange(event.target.value)}
                placeholder="ej. MF"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 outline-none focus:border-brand-500 uppercase"
              />
            </label>

            <div>
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Rol asignado
              </span>
              <div className="mt-1 flex h-8 items-center px-3 text-xs font-medium text-slate-600 bg-slate-50 dark:bg-slate-800 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700">
                {user?.role ?? "Usuario"}
              </div>
            </div>
          </div>

          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Correo electrónico de acceso
            <input
              disabled
              type="email"
              value={user?.email ?? ""}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 cursor-not-allowed dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              El correo electrónico identifica tu cuenta de acceso a DocuCore.
            </span>
          </label>

          <button
            disabled={profileBusy || isProfileUnchanged || name.trim().length < 2}
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 dark:bg-brand-500 dark:hover:bg-brand-600"
          >
            {profileBusy ? "Guardando…" : "Guardar cambios"}
          </button>
        </form>
      </section>

      {/* Subscription & Billing Section */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Suscripción y facturación
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Espacio: <span className="font-medium text-slate-700 dark:text-slate-300">{billing?.name ?? "Cargando…"}</span>
              {billing && (
                <span className="ml-2 text-slate-400">
                  · {billing.activeProjectsCount} {billing.activeProjectsCount === 1 ? "proyecto activo" : "proyectos activos"}
                  {billing.archivedProjectsCount > 0 && ` (${billing.archivedProjectsCount} archivados)`}
                </span>
              )}
            </p>
          </div>
          {billing && (
            <div>
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
                  ? `Plan ${billing.planName} Activo`
                  : billing.billingStatus === "TRIAL"
                    ? billing.trialDaysLeft > 0
                      ? `Prueba activa (${billing.trialDaysLeft}d)`
                      : "Prueba finalizada (Solo lectura)"
                    : billing.billingStatus === "PAST_DUE"
                      ? "Pago pendiente"
                      : billing.billingStatus}
              </span>
            </div>
          )}
        </div>

        {billingError && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {billingError}
          </p>
        )}

        {billing?.complianceStatus === "PLAN_ACTION_REQUIRED" && (
          <div role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="font-semibold">⚠️ Tu plan supera el límite de proyectos o usuarios activos</p>
            <p className="mt-1">
              Tienes {billing.activeProjectsCount} proyecto(s) activo(s) (máximo {billing.maxActiveProjects}) y{' '}
              {billing.activeMembersCount} usuario(s) activo(s) (máximo {billing.maxActiveMembers}). Resuelve qué
              proyecto y qué usuarios conservar; los demás datos no se eliminarán.
            </p>
            <button
              type="button"
              onClick={() => setWizardPlan("STARTER")}
              className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
            >
              Resolver ahora
            </button>
          </div>
        )}

        {wizardPlan && billing && (
          <div className="mt-4">
            <PlanChangeWizard
              targetPlanKey={wizardPlan}
              activeProjectsCount={billing.activeProjectsCount}
              onClose={() => setWizardPlan(null)}
            />
          </div>
        )}

        {downgradeNotice && (
          <div role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="font-semibold">⚠️ No es posible cambiar al plan Starter todavía</p>
            <p className="mt-1">{downgradeNotice}</p>
          </div>
        )}

        {/* Trial Status Info */}
        {billing?.billingStatus === "TRIAL" && (
          <div className="mt-4 rounded-lg bg-brand-50/70 p-4 border border-brand-200 text-xs text-brand-900 dark:bg-brand-950/30 dark:border-brand-900/50 dark:text-brand-200">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
              <strong className="text-sm">Período de prueba gratuito de 14 días activo</strong>
            </div>
            <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
              Dispones de acceso completo con <strong>hasta 15 proyectos activos y 15 usuarios activos</strong> durante tu prueba.
              {billing.trialDaysLeft > 0 ? (
                <> Te quedan <strong className="text-brand-600 dark:text-brand-400">{billing.trialDaysLeft} {billing.trialDaysLeft === 1 ? "día" : "días"}</strong> para elegir tu plan mensual.</>
              ) : (
                <> Tu período de 14 días ha finalizado. La cuenta está en modo solo lectura hasta que actives un plan.</>
              )}
            </p>
          </div>
        )}

        {isManualLicense && (
          <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-3.5 text-xs text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/35 dark:text-violet-200">
            <strong>Licencia gestionada por la plataforma.</strong> Este plan se ha activado sin Stripe; la contratación y el portal de facturación no están disponibles para esta cuenta.
          </div>
        )}

        {/* Active subscription info */}
        {billing?.billingStatus === "ACTIVE" && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
            <div className="rounded-lg bg-slate-50 p-3.5 dark:bg-slate-800/60">
              <span className="text-slate-500 dark:text-slate-400">Plan contratado</span>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                Report Map Online — {billing.planName}
              </p>
              <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                Límite: {billing.maxActiveProjects} {billing.maxActiveProjects === 1 ? "proyecto activo" : "proyectos activos"} · {billing.maxActiveMembers} {billing.maxActiveMembers === 1 ? "usuario activo" : "usuarios activos"}
              </p>
              <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                En uso: {billing.activeProjectsCount} {billing.activeProjectsCount === 1 ? "proyecto" : "proyectos"} · {billing.activeMembersCount} {billing.activeMembersCount === 1 ? "usuario" : "usuarios"}
                {billing.remainingMemberSeats > 0 && ` (${billing.remainingMemberSeats} ${billing.remainingMemberSeats === 1 ? "plaza disponible" : "plazas disponibles"})`}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-3.5 dark:bg-slate-800/60">
              <span className="text-slate-500 dark:text-slate-400">
                {isManualLicense ? "Gestión de licencia" : billing.cancelAtPeriodEnd ? "Cancelación programada para" : "Próxima fecha de facturación"}
              </span>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                {isManualLicense
                  ? "Activada por la plataforma"
                  : billing.currentPeriodEnd
                    ? new Date(billing.currentPeriodEnd).toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })
                    : "Período en curso"}
              </p>
              {billing.cancelAtPeriodEnd && !isManualLicense && (
                <p className="mt-0.5 text-amber-600 dark:text-amber-400 font-medium">
                  La suscripción no se renovará automáticamente y pasará a modo solo lectura.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Commercial Plans Grid */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
            Planes comerciales disponibles
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* STARTER PLAN */}
            <div
              className={`relative rounded-xl border p-5 transition-all ${
                isStarterActive
                  ? "border-brand-500 ring-2 ring-brand-500/20 bg-brand-50/10 dark:border-brand-500 dark:bg-brand-950/20"
                  : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/50"
              }`}
            >
              {isStarterActive && (
                <span className="absolute -top-2.5 right-4 rounded-full bg-brand-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
                  Plan Actual
                </span>
              )}
              <div className="flex items-baseline justify-between">
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">Starter</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Para instalaciones o plantas individuales</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-extrabold text-slate-900 dark:text-white">$15</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400"> USD/mes</span>
                </div>
              </div>

              <ul className="mt-4 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <strong>1 proyecto activo</strong>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <strong>Hasta 3 usuarios activos</strong>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Proyectos archivados ilimitados (sin pérdida de datos)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Planos interactivos con Deep Zoom
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Gestión documental con control de versiones y periodicidad
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Mantenimiento preventivo, calendario e historial completo
                </li>
              </ul>

              <div className="mt-6">
                {isStarterActive ? (
                  <button
                    type="button"
                    disabled
                    className="w-full rounded-lg border border-slate-200 bg-slate-100 py-2 text-xs font-semibold text-slate-500 cursor-default dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                  >
                    Tu plan contratado
                  </button>
                ) : isManualLicense ? (
                  <button
                    type="button"
                    disabled
                    className="w-full cursor-default rounded-lg border border-slate-200 bg-slate-100 py-2 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                  >
                    Licencia gestionada por plataforma
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={billingActionBusy || loadingBilling}
                    onClick={() => void handleCheckout("STARTER")}
                    className="w-full rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                  >
                    {billingActionBusy ? "Conectando…" : isProActive ? "Cambiar a Starter ($15/mes)" : "Elegir Starter ($15/mes)"}
                  </button>
                )}
              </div>
            </div>

            {/* PRO PLAN */}
            <div
              className={`relative rounded-xl border p-5 transition-all ${
                isProActive
                  ? "border-brand-500 ring-2 ring-brand-500/20 bg-brand-50/10 dark:border-brand-500 dark:bg-brand-950/20"
                  : "border-brand-200 bg-white shadow-sm hover:border-brand-300 dark:border-brand-900/60 dark:bg-slate-900/50"
              }`}
            >
              {isProActive ? (
                <span className="absolute -top-2.5 right-4 rounded-full bg-brand-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
                  Plan Actual
                </span>
              ) : (
                <span className="absolute -top-2.5 right-4 rounded-full bg-brand-100 border border-brand-200 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-800 dark:bg-brand-950 dark:text-brand-300 dark:border-brand-800">
                  Recomendado
                </span>
              )}
              <div className="flex items-baseline justify-between">
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">Pro</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Para empresas con múltiples proyectos</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-extrabold text-slate-900 dark:text-white">$39</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400"> USD/mes</span>
                </div>
              </div>

              <ul className="mt-4 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <strong>Hasta 15 proyectos activos simultáneos</strong>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <strong>Hasta 15 usuarios activos</strong>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Proyectos archivados ilimitados (sin pérdida de datos)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Planos interactivos con Deep Zoom en todos los proyectos
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Gestión documental multi-activo y periodicidad automática
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Planes preventivos, calendarios globales y trazabilidad
                </li>
              </ul>

              <div className="mt-6">
                {isProActive ? (
                  <button
                    type="button"
                    disabled
                    className="w-full rounded-lg border border-slate-200 bg-slate-100 py-2 text-xs font-semibold text-slate-500 cursor-default dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                  >
                    Tu plan contratado
                  </button>
                ) : isManualLicense ? (
                  <button
                    type="button"
                    disabled
                    className="w-full cursor-default rounded-lg border border-slate-200 bg-slate-100 py-2 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                  >
                    Licencia gestionada por plataforma
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={billingActionBusy || loadingBilling}
                    onClick={() => void handleCheckout("PRO")}
                    className="w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 dark:bg-brand-500 dark:hover:bg-brand-600"
                  >
                    {billingActionBusy ? "Conectando…" : isStarterActive ? "Actualizar a Pro ($39/mes)" : "Elegir Pro ($39/mes)"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Read-only guarantee note */}
        <div className="mt-6 rounded-lg border border-slate-200/80 bg-slate-50/60 p-3.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
          🔒 <strong>Garantía de preservación de datos:</strong> Si finaliza el período de prueba o cancelas tu suscripción, tus proyectos, documentos, fotos y planos <strong>nunca se borran</strong>; tu cuenta conserva acceso permanente de solo lectura y descarga.
        </div>

        {/* Customer Portal */}
        {billing?.stripeCustomerId && !isManualLicense && (
          <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">
            <button
              type="button"
              disabled={billingActionBusy}
              onClick={() => void handlePortal()}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Gestionar facturas y métodos de pago (Stripe Portal)
            </button>
          </div>
        )}
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
