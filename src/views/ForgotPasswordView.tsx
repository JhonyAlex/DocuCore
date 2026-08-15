import { useState } from "react"
import { Link } from "react-router-dom"
import { forgotPassword } from "@/lib/api"
import { useTheme } from "@/hooks/useTheme"

export default function ForgotPasswordView() {
  const { isDark, toggle } = useTheme()
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await forgotPassword(email)
      setSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al procesar la solicitud.")
    } finally {
      setBusy(false)
    }
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

      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo.png" className="h-10 w-10 rounded-xl" alt="Report Map Online" />
          <div>
            <h1 className="text-lg font-bold tracking-tight">Recuperar contraseña</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Report Map Online</p>
          </div>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-xl text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300">
              ✉️
            </div>
            <h2 className="mt-3 text-base font-semibold">Revisa tu correo</h2>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              Si la dirección <strong>{email}</strong> está registrada, recibirás las instrucciones para restablecer tu contraseña.
            </p>
            <div className="mt-6">
              <Link
                to="/login"
                className="inline-block w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700 dark:bg-brand-500"
              >
                Volver a inicio de sesión
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)}>
            {error && (
              <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </p>
            )}

            <p className="mb-4 text-xs text-slate-600 dark:text-slate-300">
              Introduce tu correo electrónico para recibir un enlace de recuperación válido durante 1 hora.
            </p>

            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Correo electrónico
              <input
                autoFocus
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@empresa.com"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              className="mt-5 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60 dark:bg-brand-500 dark:hover:bg-brand-600"
            >
              {busy ? "Enviando…" : "Enviar enlace de recuperación"}
            </button>

            <p className="mt-4 text-center text-xs text-slate-500">
              <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
                ← Volver a inicio de sesión
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  )
}
