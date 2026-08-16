import { Link } from "react-router-dom"

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || "admin@report-map.online"
const APP_URL = import.meta.env.VITE_APP_PUBLIC_URL || "https://app.report-map.online"

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="text-center">
        <Link to="/" className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">
          ← Volver al inicio
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          Contacto y Soporte
        </h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 max-w-lg mx-auto leading-relaxed">
          ¿Tienes dudas sobre los planes comerciales, la migración de datos o necesitas asistencia técnica con Report Map Online?
        </p>
      </div>

      <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-8 md:p-10 shadow-sm dark:border-slate-800 dark:bg-slate-900 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-400 text-2xl font-bold">
          ✉️
        </div>

        <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">
          Atención directa por correo electrónico
        </h2>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Respondemos a consultas técnicas, comerciales y de facturación.
        </p>

        <div className="mt-6 inline-block rounded-xl bg-slate-50 border border-slate-200 px-6 py-3.5 dark:bg-slate-800 dark:border-slate-700">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-base font-semibold text-brand-600 dark:text-brand-400 hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
        </div>

        <div className="mt-8 border-t border-slate-100 pt-6 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row justify-center gap-6">
          <div>
            <strong>Horario de atención:</strong> Lunes a Viernes, 9:00 - 18:00 (CET)
          </div>
          <div>
            <strong>Tiempo de respuesta estimado:</strong> Menos de 24 horas laborables
          </div>
        </div>
      </div>

      <div className="mt-10 text-center">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          ¿Listo para empezar?{" "}
          <a href={`${APP_URL}/register`} className="font-semibold text-brand-600 dark:text-brand-400 hover:underline">
            Comienza tu prueba de 14 días gratis →
          </a>
        </p>
      </div>
    </div>
  )
}
