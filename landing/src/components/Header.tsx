import { Link } from "react-router-dom"

const APP_URL = import.meta.env.VITE_APP_PUBLIC_URL || "https://app.report-map.online"

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/85">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-3 group">
          <img src="/logo.png" className="h-9 w-9 rounded-xl shadow-sm transition-transform group-hover:scale-105" alt="Report Map Online Logo" />
          <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Report Map Online
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-300">
          <a href="#funciones" className="transition-colors hover:text-brand-600 dark:hover:text-brand-400">
            Características
          </a>
          <a href="#como-funciona" className="transition-colors hover:text-brand-600 dark:hover:text-brand-400">
            Cómo funciona
          </a>
          <a href="#precios" className="transition-colors hover:text-brand-600 dark:hover:text-brand-400">
            Precios
          </a>
          <a href="#faq" className="transition-colors hover:text-brand-600 dark:hover:text-brand-400">
            FAQ
          </a>
          <Link to="/contacto" className="transition-colors hover:text-brand-600 dark:hover:text-brand-400">
            Contacto
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={`${APP_URL}/login`}
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
          >
            Iniciar sesión
          </a>
          <a
            href={`${APP_URL}/register`}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 transition dark:bg-brand-500 dark:hover:bg-brand-600"
          >
            Prueba gratis 14 días
          </a>
        </div>
      </div>
    </header>
  )
}
