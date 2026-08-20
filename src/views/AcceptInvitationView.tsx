import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { acceptWorkspaceInvitation, switchActiveWorkspace } from '@/lib/api'
import { useSession } from '@/contexts/SessionContext'

/**
 * Consumes a single-use invitation token from `?token=` (email link).
 *
 * This route is public: a new user who has not registered yet is offered to log
 * in or create an account, and — because the token travels in the `returnTo`
 * of the verification email — lands back here automatically after verifying,
 * never having to re-open the first email (§13). On acceptance the active
 * workspace context is switched to the invited workspace and the session
 * refreshed so the new membership is visible without re-login.
 */
export default function AcceptInvitationView() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { authenticated, loading, refreshSession } = useSession()
  const token = searchParams.get('token')
  const [state, setState] = useState<'working' | 'done' | 'error'>('working')
  const [message, setMessage] = useState('Aceptando invitación…')

  useEffect(() => {
    if (!token) {
      setState('error')
      setMessage('Esta invitación no es válida o le falta el enlace.')
      return
    }
    if (!authenticated) return
    let cancelled = false
    acceptWorkspaceInvitation(token)
      .then(async (result) => {
        if (cancelled) return
        setState('done')
        setMessage('Invitación aceptada. Ya puedes entrar al workspace.')
        searchParams.delete('token')
        setSearchParams(searchParams, { replace: true })
        try {
          await switchActiveWorkspace(result.workspaceId)
        } catch {
          // Non-fatal: switching context fails silently; the session still refreshes.
        }
        try { await refreshSession() } catch { /* non-fatal: session refreshes on next navigation */ }
      })
      .catch((reason) => {
        if (cancelled) return
        setState('error')
        setMessage(reason instanceof Error ? reason.message : 'No se pudo aceptar la invitación.')
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, authenticated])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <p className="text-sm text-slate-500">Comprobando sesión…</p>
      </main>
    )
  }

  if (!authenticated && token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-xl font-semibold tracking-tight">Invitación al workspace</h1>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
            Te han invitado a unirte a un espacio de trabajo. Para aceptar la invitación, inicia sesión con el correo
            al que la recibiste o crea una cuenta con ese mismo correo.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Link
              to="/login"
              state={{ from: `/accept-invitation?token=${encodeURIComponent(token)}` }}
              className="rounded-lg bg-brand-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-brand-700"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/register"
              state={{ invitationToken: token }}
              className="rounded-lg border border-slate-200 px-4 py-2 text-center text-sm font-medium dark:border-slate-700"
            >
              Crear cuenta
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-semibold tracking-tight">Invitación al workspace</h1>
        <p role="status" className="mt-4 text-sm text-slate-600 dark:text-slate-300">{message}</p>
        <div className="mt-6 flex gap-3">
          {state === 'done' && (
            <Link to="/projects" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Ir a mis proyectos
            </Link>
          )}
          {state === 'error' && (
            <Link to="/projects" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium dark:border-slate-700">
              Volver a proyectos
            </Link>
          )}
          {(state === 'done' || state === 'error') && (
            <button type="button" onClick={() => navigate('/projects', { replace: true })} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium dark:border-slate-700">
              Continuar
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
