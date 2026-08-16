import { Link } from "react-router-dom"

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || "admin@report-map.online"

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8">
        <Link to="/" className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">
          ← Volver al inicio
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Términos y Condiciones del Servicio
        </h1>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Última actualización: 16 de agosto de 2026
        </p>
      </div>

      <div className="prose prose-slate dark:prose-invert max-w-none text-xs leading-relaxed space-y-6 text-slate-600 dark:text-slate-300">
        <section>
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-2">1. Objeto y Titularidad</h2>
          <p>
            Los presentes Términos y Condiciones regulan el acceso y uso de la plataforma de software como servicio (SaaS) disponible en <strong>https://app.report-map.online</strong> y su sitio informativo en <strong>https://report-map.online</strong> (en adelante, «el Servicio» o «Report Map Online»).
          </p>
          <p className="mt-2">
            El Servicio es provisto como una herramienta de software en la nube orientada a la gestión técnica de activos, planos interactivos, documentación y planes de mantenimiento industrial.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-2">2. Período de Prueba y Modalidad de Acceso</h2>
          <p>
            Report Map Online ofrece un período de prueba gratuito de 14 días naturales contados a partir de la verificación de la dirección de correo electrónico del usuario. Durante dicho período, el usuario dispone de acceso a todas las funcionalidades del Servicio con una capacidad máxima de hasta 15 proyectos activos simultáneos, sin requerir la introducción de métodos de pago.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-2">3. Planes Comerciales y Facturación</h2>
          <p>
            El Servicio cuenta con dos modalidades de suscripción de facturación mensual recurrente:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>Plan Starter:</strong> 15 USD/mes. Permite un máximo de 1 proyecto activo simultáneo y proyectos archivados ilimitados.</li>
            <li><strong>Plan Pro:</strong> 39 USD/mes. Permite hasta 15 proyectos activos simultáneos y proyectos archivados ilimitados.</li>
          </ul>
          <p className="mt-2">
            La facturación y el procesamiento de pagos se gestiona mediante la pasarela segura Stripe. La cancelación puede solicitarse en cualquier momento desde el panel de la cuenta y surtirá efecto al finalizar el ciclo de facturación vigente.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-2">4. Garantía de Preservación de Datos</h2>
          <p>
            Al finalizar el período de prueba sin suscripción activa o ante la cancelación de un plan, la cuenta pasará a modo de solo lectura. Report Map Online garantiza la <strong>no eliminación ni destrucción de proyectos, activos, planos o documentos almacenados</strong>, manteniendo permanentemente habilitada la consulta y descarga de la información técnica del usuario.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-2">5. Uso Aceptable y Responsabilidades</h2>
          <p>
            El usuario es responsable de custodiar sus credenciales de acceso y de garantizar la licitud del contenido que almacene en la plataforma. Queda expresamente prohibido el uso del servicio para actividades ilícitas o que comprometan la seguridad de la infraestructura.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-2">6. Contacto y Soporte</h2>
          <p>
            Para cualquier consulta sobre estos términos o asistencia técnica, puedes contactar con nuestro equipo de administración en: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-600 dark:text-brand-400 font-medium">{SUPPORT_EMAIL}</a>.
          </p>
        </section>
      </div>
    </div>
  )
}
