import { Link } from "react-router-dom"

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || "admin@report-map.online"
const APP_URL = import.meta.env.VITE_APP_PUBLIC_URL || "https://app.report-map.online"

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white px-6 py-12 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 pb-8 border-b border-slate-100 dark:border-slate-900">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" className="h-7 w-7 rounded-lg" alt="Report Map Online" />
              <span className="text-sm font-bold text-slate-900 dark:text-white">Report Map Online</span>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Plataforma colaborativa para la gestión de activos industriales, documentación técnica, planes preventivos y planos interactivos.
            </p>
          </div>

          <div className="flex flex-wrap gap-8 text-xs">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white mb-2">Producto</p>
              <ul className="space-y-1.5">
                <li><a href="#funciones" className="hover:text-brand-600 dark:hover:text-brand-400">Características</a></li>
                <li><a href="#precios" className="hover:text-brand-600 dark:hover:text-brand-400">Precios</a></li>
                <li><a href="#faq" className="hover:text-brand-600 dark:hover:text-brand-400">Preguntas frecuentes</a></li>
                <li><a href={`${APP_URL}/register`} className="hover:text-brand-600 dark:hover:text-brand-400">Prueba gratuita 14 días</a></li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-slate-900 dark:text-white mb-2">Legal & Soporte</p>
              <ul className="space-y-1.5">
                <li><Link to="/terminos-y-condiciones" className="hover:text-brand-600 dark:hover:text-brand-400">Términos y condiciones</Link></li>
                <li><Link to="/politica-de-privacidad" className="hover:text-brand-600 dark:hover:text-brand-400">Política de privacidad</Link></li>
                <li><Link to="/contacto" className="hover:text-brand-600 dark:hover:text-brand-400">Contacto & Ayuda</Link></li>
                <li><a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-brand-600 dark:hover:text-brand-400">{SUPPORT_EMAIL}</a></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-400">
          <p>© {new Date().getFullYear()} Report Map Online. Todos los derechos reservados.</p>
          <div className="flex items-center gap-4">
            <span>Garantía de preservación de datos en modo solo lectura</span>
            <span>·</span>
            <span>Dominio oficial: report-map.online</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
