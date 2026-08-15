import { Link, Navigate } from "react-router-dom"
import { useSession } from "@/contexts/SessionContext"
import { useTheme } from "@/hooks/useTheme"

export default function LandingView() {
  const { authenticated, loading } = useSession()
  const { isDark, toggle } = useTheme()

  if (!loading && authenticated) {
    return <Navigate to="/projects" replace />
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-brand-500 selection:text-white dark:bg-slate-950 dark:text-slate-100">
      {/* Top navigation */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo.png" className="h-9 w-9 rounded-xl shadow-sm" alt="Report Map Online" />
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              Report Map Online
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              aria-label="Cambiar tema"
            >
              {isDark ? "☀" : "☾"}
            </button>
            <Link
              to="/login"
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/register"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600"
            >
              Prueba gratis 14 días
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main>
        <section className="relative overflow-hidden px-6 py-20 lg:py-28">
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 dark:border-brand-900/60 dark:bg-brand-950/50 dark:text-brand-300">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
              Plataforma de gestión documental y activos industriales
            </div>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl dark:text-white">
              Ubica, gestiona y mantén tus activos en{" "}
              <span className="bg-gradient-to-r from-brand-600 to-blue-500 bg-clip-text text-transparent dark:from-brand-400 dark:to-blue-300">
                planos interactivos
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
              Report Map Online centraliza el inventario técnico, la documentación obligatoria, los planes de mantenimiento y los planos de planta en una única plataforma colaborativa.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                to="/register"
                className="w-full rounded-xl bg-brand-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-500/25 hover:bg-brand-700 sm:w-auto dark:bg-brand-500 dark:hover:bg-brand-600"
              >
                Comenzar prueba gratuita de 14 días
              </Link>
              <Link
                to="/login"
                className="w-full rounded-xl border border-slate-300 bg-white px-7 py-3.5 text-base font-semibold text-slate-700 hover:bg-slate-50 sm:w-auto dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Acceder al espacio
              </Link>
            </div>
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Sin tarjeta de crédito requerida · Activación instantánea · 100% exportable
            </p>
          </div>
        </section>

        {/* Feature Cards */}
        <section className="border-t border-slate-200 bg-white px-6 py-16 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="mx-auto max-w-6xl">
            <div className="text-center">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Diseñado para la operativa industrial</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Todo lo que tu equipo necesita para cumplir normativas y evitar paradas de planta.
              </p>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  🗺️
                </div>
                <h3 className="mt-4 font-semibold">Planos interactivos</h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Visualización Deep Zoom de esquemas y planos con marcadores vinculados a la ficha en tiempo real.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  📑
                </div>
                <h3 className="mt-4 font-semibold">Gestión documental</h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Control de versiones, periodicidades automáticas y visor de PDF e imágenes sin depender de plugins externos.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  📅
                </div>
                <h3 className="mt-4 font-semibold">Mantenimiento preventivo</h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Calendario interactivo de vencimientos, revisiones periódicas y plantillas de tareas recurrentes.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                  🛡️
                </div>
                <h3 className="mt-4 font-semibold">Auditoría y trazabilidad</h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Historial completo e inmutable de modificaciones, permisos granulares y aislamiento estricto por proyecto.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-slate-50 px-6 py-8 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <span>© {new Date().getFullYear()} Report Map Online. Todos los derechos reservados.</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="mailto:support@report-map.online" className="hover:underline">
              Soporte: support@report-map.online
            </a>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span>Dominio oficial: report-map.online</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
