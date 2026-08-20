import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { verifyEmail } from "@/lib/api"
import { useSession } from "@/contexts/SessionContext"
import { useTheme } from "@/hooks/useTheme"

export default function VerifyEmailView() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")
  const returnTo = searchParams.get("returnTo")
  const navigate = useNavigate()
  const { setSession } = useSession()
  const { isDark, toggle } = useTheme()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // A safe, same-app continuation (e.g. back to an invitation acceptance flow).
  // Never allow an absolute URL or a protocol-relative one (§13: no open redirects).
  const safeReturnTo = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/projects"

  useEffect(() => {
    if (!token) {
      setError("No se ha proporcionado un token de verificación.")
      setLoading(false)
      return
    }

    let isMounted = true
    verifyEmail(token)
      .then((sessionData) => {
        if (isMounted) {
          setSession(sessionData)
          setSuccess(true)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "El enlace de verificación no es válido o ha expirado.")
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [token, setSession])

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
        {loading && (
          <div>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-2xl text-brand-600 animate-spin dark:bg-brand-950 dark:text-brand-300">
              ⏳
            </div>
            <h1 className="mt-4 text-lg font-bold">Verificando tu cuenta…</h1>
            <p className="mt-1 text-xs text-slate-500">Un momento, por favor.</p>
          </div>
        )}

        {error && (
          <div>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-2xl text-red-600 dark:bg-red-950 dark:text-red-300">
              ✕
            </div>
            <h1 className="mt-4 text-lg font-bold text-red-600 dark:text-red-400">Verificación no completada</h1>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{error}</p>
            <div className="mt-6 flex flex-col gap-2">
              <Link
                to="/login"
                className="rounded-lg bg-brand-600 py-2.5 text-xs font-semibold text-white hover:bg-brand-700 dark:bg-brand-500"
              >
                Ir a inicio de sesión
              </Link>
              <Link
                to="/register"
                className="text-xs text-slate-500 hover:underline"
              >
                Crear una nueva cuenta
              </Link>
            </div>
          </div>
        )}

        {success && (
          <div>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-2xl text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300">
              ✓
            </div>
            <h1 className="mt-4 text-xl font-bold tracking-tight">¡Cuenta activada con éxito!</h1>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              {safeReturnTo.startsWith("/accept-invitation")
                ? "Tu correo está verificado. Continúa para aceptar la invitación."
                : <>Tu prueba gratuita de <strong>14 días</strong> ya está en marcha.</>}
            </p>
            <button
              type="button"
              onClick={() => void navigate(safeReturnTo, { replace: true })}
              className="mt-6 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600"
            >
              {safeReturnTo.startsWith("/accept-invitation") ? "Continuar con la invitación" : "Entrar a mis proyectos"}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
