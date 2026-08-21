import { useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { register, registerInvitee, resendVerification } from "@/lib/api"
import { useTheme } from "@/hooks/useTheme"

export default function RegisterView() {
  const { isDark, toggle } = useTheme()
  const location = useLocation()
  const invitationToken = (location.state as { invitationToken?: string } | null)?.invitationToken ?? null
  const isInvitee = Boolean(invitationToken)
  const [name, setName] = useState("")
  const [workspaceName, setWorkspaceName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [termsAccepted, setTermsAccepted] = useState(true)
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null)
  const [resendStatus, setResendStatus] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.")
      return
    }

    if (password.length < 12) {
      setError("La contraseña debe tener al menos 12 caracteres.")
      return
    }

    setBusy(true)
    try {
      const res = isInvitee
        ? await registerInvitee({ name, email, password, confirmPassword, invitationToken: invitationToken as string, termsAccepted })
        : await register({ name, workspaceName, email, password, confirmPassword, termsAccepted })
      setRegisteredEmail(res.email)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al registrar la cuenta.")
    } finally {
      setBusy(false)
    }
  }

  const handleResend = async () => {
    if (!registeredEmail) return
    setResendStatus(null)
    try {
      const res = await resendVerification(registeredEmail, (invitationToken as string) || undefined)
      setResendStatus(res.message)
    } catch {
      setResendStatus("No se pudo reenviar el enlace. Inténtalo más tarde.")
    }
  }

  if (registeredEmail) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <button
          type="button"
          onClick={toggle}
          className="absolute right-5 top-5 rounded-lg p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
          aria-label="Cambiar tema"
        >
          {isDark ? "☀" : "☾"}
        </button>

        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-2xl text-brand-600 dark:bg-brand-950 dark:text-brand-300">
            ✉️
          </div>
          <h1 className="mt-4 text-xl font-bold tracking-tight">Verifica tu correo electrónico</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Hemos enviado un enlace de confirmación a:
          </p>
          <p className="mt-1 font-semibold text-brand-600 dark:text-brand-400">{registeredEmail}</p>
          <div className="mt-4 rounded-xl bg-slate-50 p-4 text-left text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <p>
              💡{" "}
              <strong>{isInvitee ? "Verifica tu correo para continuar con la invitación." : "Tu prueba gratuita de 14 días"}</strong>{" "}
              {isInvitee
                ? "Al confirmar tu email volverás automáticamente al flujo de aceptación de la invitación."
                : "comenzará en cuanto pulses el enlace de verificación en tu correo."}
            </p>
          </div>

          {resendStatus && (
            <p className="mt-4 rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              {resendStatus}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void handleResend()}
              className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              ¿No has recibido el correo? Reenviar enlace
            </button>
            <Link
              to="/login"
              className="rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Volver a inicio de sesión
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <button
        type="button"
        onClick={toggle}
        className="absolute right-5 top-5 rounded-lg p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
        aria-label="Cambiar tema"
      >
        {isDark ? "☀" : "☾"}
      </button>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20"
      >
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo.png" className="h-10 w-10 rounded-xl" alt="Report Map Online" />
          <div>
            <h1 className="text-lg font-bold tracking-tight">{isInvitee ? "Crea tu cuenta para unirte al equipo" : "Crear cuenta en Report Map Online"}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">{isInvitee ? "Verifica tu correo para aceptar la invitación." : "14 días de prueba completa sin coste."}</p>
          </div>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="space-y-3.5 text-xs">
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300">Tu nombre completo</label>
            <input
              autoFocus
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Ana Martínez"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          {!isInvitee && (
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300">Nombre de tu empresa o espacio</label>
              <input
                type="text"
                required
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="Ej. Industrias Metalmecánicas Norte"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          )}

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300">Correo electrónico corporativo</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ana.martinez@empresa.com"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300">Contraseña (mínimo 12 caracteres)</label>
            <div className="relative mt-1">
              <input
                type={visible ? "text" : "password"}
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-16 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="absolute inset-y-0 right-2 px-2 text-xs font-medium text-slate-500"
              >
                {visible ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300">Confirmar contraseña</label>
            <input
              type="password"
              required
              minLength={12}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          <div className="pt-1">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                required
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-slate-600 dark:text-slate-400">
                Acepto los términos de servicio y la política de privacidad de Report Map Online.
              </span>
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60 dark:bg-brand-500 dark:hover:bg-brand-600"
        >
          {busy ? "Creando cuenta…" : isInvitee ? "Crear cuenta y continuar" : "Iniciar prueba gratuita de 14 días"}
        </button>

        <p className="mt-4 text-center text-xs text-slate-500">
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
            Iniciar sesión
          </Link>
        </p>
      </form>
    </main>
  )
}
