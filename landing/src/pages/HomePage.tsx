import { useState } from "react"
import { PLAN_CATALOG } from "../../../shared/planCatalog"

const APP_URL = import.meta.env.VITE_APP_PUBLIC_URL || "https://app.report-map.online"

interface FaqItem {
  question: string
  answer: string
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "¿Necesito tarjeta de crédito para empezar?",
    answer: "No. Puedes registrarte y comenzar tu período de prueba gratuita de 14 días inmediatamente después de verificar tu correo electrónico, sin introducir ningún dato de pago ni tarjeta.",
  },
  {
    question: "¿Qué ocurre después de los 14 días de prueba?",
    answer: "Si decides no contratar un plan, tu cuenta pasa automáticamente a modo solo lectura. Podrás seguir accediendo, consultando todos tus proyectos, visualizando planos y descargando tu documentación sin ningún coste adicional.",
  },
  {
    question: "¿Pierdo mis datos si no continúo?",
    answer: "Nunca. En Report Map Online tenemos una estricta política de preservación de datos: tus proyectos, activos, planos, fotos e historiales jamás se eliminan por falta de suscripción activa.",
  },
  {
    question: "¿Puedo cambiar de plan más adelante?",
    answer: "Sí. Puedes actualizar de Starter a Pro en cualquier momento. Si deseas pasar de Pro a Starter, el plan Starter admite 1 proyecto y 3 usuarios activos: al bajar de plan eliges cuáles conservarán acceso, y el resto de tus datos no se elimina (queda archivado o bloqueado, listo para reactivarse).",
  },
  {
    question: "¿Puedo archivar proyectos para liberar capacidad?",
    answer: "Sí. Los proyectos archivados conservan íntegramente sus activos, planos e historiales pero no consumen cupo de proyectos activos, permitiéndote reactivarlos cuando lo necesites.",
  },
  {
    question: "¿Funciona en dispositivos móviles y tablets?",
    answer: "Sí. Toda la plataforma está diseñada de forma responsiva para que los operarios y técnicos de mantenimiento puedan consultar planos, fichas y registrar tareas directamente desde su teléfono o tablet.",
  },
]

export default function HomePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index)
  }

  return (
    <div className="space-y-24 pb-20">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 md:pt-20">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50/80 px-3.5 py-1 text-xs font-medium text-brand-900 backdrop-blur dark:border-brand-900/60 dark:bg-brand-950/50 dark:text-brand-300">
            <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
            Plataforma de gestión técnica y mantenimiento industrial
          </div>

          <h1 className="mt-8 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl dark:text-white leading-[1.15]">
            Gestiona activos, mantenimiento, documentos y planos{" "}
            <span className="bg-gradient-to-r from-brand-600 to-blue-500 bg-clip-text text-transparent dark:from-brand-400 dark:to-blue-300">
              desde un solo lugar
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
            Report Map Online es la plataforma para organizar la información técnica y operativa de instalaciones, equipos y proyectos industriales con planos interactivos y trazabilidad total.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href={`${APP_URL}/register`}
              className="w-full sm:w-auto rounded-xl bg-brand-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 hover:bg-brand-700 transition dark:bg-brand-500 dark:hover:bg-brand-600"
            >
              Prueba gratis 14 días →
            </a>
            <a
              href={`${APP_URL}/login`}
              className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-8 py-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Iniciar sesión
            </a>
          </div>

          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            Sin tarjeta de crédito requerida · 14 días de prueba completa · Hasta 15 proyectos y 15 usuarios
          </p>
        </div>
      </section>

      {/* Value Proposition / Problem Section */}
      <section className="mx-auto max-w-6xl px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 md:p-12 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              Centraliza la operativa técnica sin hojas de cálculo dispersas
            </h2>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              La gestión de plantas e instalaciones suele fragmentarse en carpetas locales, correos y planos en papel desactualizados. Report Map Online unifica todo tu ecosistema técnico:
            </p>
          </div>

          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 dark:bg-slate-800/50 dark:border-slate-800">
              <span className="text-2xl font-bold text-brand-600 dark:text-brand-400">100%</span>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Trazabilidad de cambios</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 dark:bg-slate-800/50 dark:border-slate-800">
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">Deep Zoom</span>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Planos en alta resolución</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 dark:bg-slate-800/50 dark:border-slate-800">
              <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">Multi-Activo</span>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Gestión documental unificada</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 dark:bg-slate-800/50 dark:border-slate-800">
              <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">Automático</span>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Cálculo de periodicidades</p>
            </div>
          </div>
        </div>
      </section>

      {/* Main Features Section */}
      <section id="funciones" className="mx-auto max-w-6xl px-6">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            Todo lo necesario para la gestión técnica
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Diseñado específicamente para responsables de mantenimiento, ingenieros de planta y empresas de servicios técnicos.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1 */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-bold text-lg">
              ⚙️
            </div>
            <h3 className="mt-4 font-semibold text-sm text-slate-900 dark:text-white">Gestión de activos</h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Inventario técnico completo, números de serie únicos, estados en tiempo real, fotos y campos dinámicos configurables.
            </p>
          </div>

          {/* Card 2 */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-lg">
              🗺️
            </div>
            <h3 className="mt-4 font-semibold text-sm text-slate-900 dark:text-white">Planos interactivos</h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Visor piramidal Deep Zoom con marcadores arrastrables que conectan cada equipo directamente con su ficha técnica.
            </p>
          </div>

          {/* Card 3 */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 font-bold text-lg">
              📑
            </div>
            <h3 className="mt-4 font-semibold text-sm text-slate-900 dark:text-white">Documentación organizada</h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Control de versiones, relaciones multi-activo, periodicidades según calendario/subida y visor integrado de PDF e imágenes.
            </p>
          </div>

          {/* Card 4 */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-bold text-lg">
              🛠️
            </div>
            <h3 className="mt-4 font-semibold text-sm text-slate-900 dark:text-white">Mantenimiento preventivo</h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Planes periódicos, listas de tareas reutilizables, asignación masiva por tipo de activo y seguimiento de ejecuciones.
            </p>
          </div>

          {/* Card 5 */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 font-bold text-lg">
              📅
            </div>
            <h3 className="mt-4 font-semibold text-sm text-slate-900 dark:text-white">Calendario y eventos</h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Vistas mensual, semanal y diaria con derivación automática de vencimientos de documentos, preventivos y fechas dinámicas.
            </p>
          </div>

          {/* Card 6 */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 font-bold text-lg">
              📜
            </div>
            <h3 className="mt-4 font-semibold text-sm text-slate-900 dark:text-white">Historial y trazabilidad</h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Registro inmutable de auditoría para cada creación, edición, baja, archivo o cambio de estado, exportable a CSV.
            </p>
          </div>

          {/* Card 7 */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 font-bold text-lg">
              🏢
            </div>
            <h3 className="mt-4 font-semibold text-sm text-slate-900 dark:text-white">Multi-proyecto</h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Aislamiento estricto de datos por planta o cliente, copiado de plantillas maestras y temas visuales personalizables.
            </p>
          </div>

          {/* Card 8 */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300 font-bold text-lg">
              👥
            </div>
            <h3 className="mt-4 font-semibold text-sm text-slate-900 dark:text-white">Usuarios y permisos</h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Invitaciones seguras, roles por workspace y por proyecto, y control granular de acceso para cada miembro de tu equipo.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="como-funciona" className="mx-auto max-w-5xl px-6">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            Comienza en tres sencillos pasos
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Sin instalaciones complejas ni servidores que mantener.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div className="flex flex-col items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white font-bold text-base shadow-md">
              1
            </div>
            <h3 className="mt-4 font-semibold text-base text-slate-900 dark:text-white">Regístrate</h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Crea tu cuenta en 30 segundos sin necesidad de tarjeta. Activa tu prueba de 14 días verificando tu email.
            </p>
          </div>

          <div className="flex flex-col items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white font-bold text-base shadow-md">
              2
            </div>
            <h3 className="mt-4 font-semibold text-base text-slate-900 dark:text-white">Crea tu proyecto</h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Define tu instalación, sube los planos de planta y configura la jerarquía de ubicaciones y zonas.
            </p>
          </div>

          <div className="flex flex-col items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white font-bold text-base shadow-md">
              3
            </div>
            <h3 className="mt-4 font-semibold text-base text-slate-900 dark:text-white">Organiza y mantén</h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Ubica tus equipos en el plano, vincula certificados y manuales, y programa planes preventivos automáticos.
            </p>
          </div>
        </div>
      </section>

      {/* Trial Callout Section */}
      <section className="mx-auto max-w-5xl px-6">
        <div className="rounded-2xl bg-gradient-to-r from-brand-600 to-blue-600 p-8 sm:p-12 text-white shadow-xl">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold sm:text-3xl">Prueba todas las funciones durante 14 días</h2>
            <p className="mt-3 text-sm text-brand-100 leading-relaxed">
              Disfruta de acceso total para crear <strong>hasta 15 proyectos activos</strong> e invitar a{' '}
              <strong>hasta 15 usuarios</strong> durante tu período de prueba. Explora la plataforma con tu equipo sin
              compromiso y sin ingresar tarjeta de crédito.
            </p>
            <div className="mt-8 flex flex-wrap gap-4 items-center">
              <a
                href={`${APP_URL}/register`}
                className="rounded-xl bg-white px-7 py-3 text-sm font-semibold text-brand-700 shadow hover:bg-brand-50 transition"
              >
                Comenzar prueba gratuita
              </a>
              <span className="text-xs text-brand-200">
                🔒 Tus datos se conservan siempre en modo solo lectura si decides no continuar
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="precios" className="mx-auto max-w-5xl px-6">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            Planes transparentes y sin sorpresas
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Ambos planes incluyen 14 días de prueba gratuita sin tarjeta de crédito.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {/* STARTER */}
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between">
            <div>
              <div className="flex items-baseline justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Starter</h3>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Instalación individual
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Ideal para pequeñas industrias o plantas con un proyecto único.
              </p>

              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-slate-900 dark:text-white">$15</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">USD / mes</span>
              </div>

              <ul className="mt-6 space-y-3 text-xs text-slate-600 dark:text-slate-300">
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <strong>1 proyecto activo</strong>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <strong>Hasta {PLAN_CATALOG.STARTER.maxActiveMembers} usuarios</strong>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Roles y permisos
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Compartir el proyecto con tu equipo
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Activos y documentos
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Calendario y preventivos
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Planos interactivos
                </li>
              </ul>
            </div>

            <div className="mt-8">
              <a
                href={`${APP_URL}/register`}
                className="block w-full text-center rounded-xl border border-slate-300 bg-white py-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Comenzar prueba gratuita
              </a>
            </div>
          </div>

          {/* PRO */}
          <div className="relative rounded-2xl border-2 border-brand-500 bg-white p-8 shadow-xl dark:border-brand-500 dark:bg-slate-900 flex flex-col justify-between">
            <span className="absolute -top-3 right-6 rounded-full bg-brand-600 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm">
              Recomendado
            </span>

            <div>
              <div className="flex items-baseline justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Pro</h3>
                <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-800 dark:bg-brand-950 dark:text-brand-300">
                  Multi-proyecto
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Para empresas que gestionan múltiples plantas, clientes o sedes.
              </p>

              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-slate-900 dark:text-white">$39</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">USD / mes</span>
              </div>

              <ul className="mt-6 space-y-3 text-xs text-slate-600 dark:text-slate-300">
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <strong>Hasta {PLAN_CATALOG.PRO.maxActiveProjects} proyectos activos</strong>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <strong>Hasta {PLAN_CATALOG.PRO.maxActiveMembers} usuarios</strong>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Roles y permisos
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Compartir múltiples proyectos y equipos
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Planos interactivos Deep Zoom en todos los proyectos
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Documentos multi-activo con visor integrado
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Planes preventivos y calendarios consolidados
                </li>
              </ul>
            </div>

            <div className="mt-8">
              <a
                href={`${APP_URL}/register`}
                className="block w-full text-center rounded-xl bg-brand-600 py-3 text-xs font-semibold text-white shadow-md hover:bg-brand-700 transition dark:bg-brand-500 dark:hover:bg-brand-600"
              >
                Comenzar prueba gratuita
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="mx-auto max-w-4xl px-6">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            Preguntas frecuentes
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Respuestas directas sobre la plataforma, el período de prueba y los planes.
          </p>
        </div>

        <div className="mt-10 space-y-4">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openFaq === index
            return (
              <div
                key={item.question}
                className="rounded-xl border border-slate-200 bg-white transition dark:border-slate-800 dark:bg-slate-900"
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(index)}
                  className="flex w-full items-center justify-between p-5 text-left text-sm font-semibold text-slate-900 dark:text-white focus:outline-none"
                >
                  <span>{item.question}</span>
                  <span className={`ml-4 transform transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
                    ▾
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 px-5 pb-5 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400 leading-relaxed">
                    {item.answer}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
