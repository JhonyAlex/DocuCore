import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '@/hooks/useTheme'
import { useSession } from '@/contexts/SessionContext'

function safeDestination(value: unknown): string {
  return typeof value === 'string' && (value.startsWith('/projects') || value.startsWith('/accept-invitation')) ? value : '/projects'
}

export default function LoginView() {
  const { isDark, toggle } = useTheme()
  const { login } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true); setError(null)
    try {
      await login(email, password)
      void navigate(safeDestination((location.state as { from?: string } | null)?.from), { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo iniciar sesión.')
    } finally { setBusy(false) }
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <button type="button" onClick={toggle} className="absolute right-5 top-5 rounded-lg p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800" aria-label="Cambiar tema">{isDark ? '☀' : '☾'}</button>
    <form onSubmit={(event) => void submit(event)} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
      <div className="mb-7 flex items-center gap-3"><Link to="/"><img src="/logo.png" className="h-11 w-11 rounded-xl" alt="Report Map Online" /></Link><div><h1 className="text-xl font-semibold tracking-tight">Report Map Online</h1><p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Accede a tus proyectos y planos industriales.</p></div></div>
      {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
      <div className="space-y-4">
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium">Correo electrónico</label>
          <input id="login-email" autoFocus autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900" />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="login-password" className="text-sm font-medium">Contraseña</label>
            <Link to="/forgot-password" className="text-xs text-brand-600 hover:underline dark:text-brand-400">¿Olvidaste tu contraseña?</Link>
          </div>
          <div className="relative mt-1.5">
            <input id="login-password" autoComplete="current-password" type={visible ? 'text' : 'password'} required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 pr-16 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900" />
            <button type="button" onClick={() => setVisible((value) => !value)} className="absolute inset-y-0 right-2 px-2 text-xs font-medium text-slate-500">{visible ? 'Ocultar' : 'Mostrar'}</button>
          </div>
        </div>
      </div>
      <button type="submit" disabled={busy} className="mt-6 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{busy ? 'Accediendo…' : 'Iniciar sesión'}</button>
      <p className="mt-5 text-center text-xs text-slate-500">¿No tienes cuenta? <Link to="/register" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">Crear cuenta (14 días gratis)</Link></p>
    </form>
  </main>
}
