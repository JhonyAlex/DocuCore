import { Link } from "react-router-dom"

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || "admin@report-map.online"

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8">
        <Link to="/" className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">
          ← Volver al inicio
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Política de Privacidad
        </h1>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Última actualización: 16 de agosto de 2026
        </p>
      </div>

      <div className="prose prose-slate dark:prose-invert max-w-none text-xs leading-relaxed space-y-6 text-slate-600 dark:text-slate-300">
        <section>
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-2">1. Responsable del Tratamiento</h2>
          <p>
            Report Map Online (accesible en <strong>https://report-map.online</strong> y <strong>https://app.report-map.online</strong>) es el responsable del tratamiento de los datos personales recabados para la prestación del servicio.
          </p>
          <p className="mt-2">
            Correo electrónico de contacto para privacidad y ejercicio de derechos: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-600 dark:text-brand-400 font-medium">{SUPPORT_EMAIL}</a>.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-2">2. Datos Recabados y Finalidad</h2>
          <p>Tratamos los datos necesarios para:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>Gestión de cuenta y autenticación:</strong> Nombre, dirección de correo electrónico, credenciales cifradas (hash seguro) y registro de sesiones.</li>
            <li><strong>Prestación del servicio SaaS:</strong> Información técnica de proyectos, activos, planos, documentos y registros de mantenimiento subidos por el usuario.</li>
            <li><strong>Facturación y pagos:</strong> Gestión de suscripciones mediante Stripe (no almacenamos números completos de tarjetas en nuestros servidores).</li>
            <li><strong>Comunicaciones operativas:</strong> Verificación de email, recuperación de contraseñas y avisos de servicio.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-2">3. Seguridad de la Información</h2>
          <p>
            Implementamos medidas técnicas avanzadas para salvaguardar la confidencialidad e integridad de la información, incluyendo conexiones cifradas TLS/HTTPS, almacenamiento persistente en volúmenes protegidos, digests criptográficos SHA-256 para tokens de sesión y auditoría de accesos.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-2">4. Derechos del Usuario</h2>
          <p>
            Puedes ejercer tus derechos de acceso, rectificación, supresión, limitación del tratamiento y portabilidad de datos en cualquier momento enviando una solicitud por correo a <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-600 dark:text-brand-400 font-medium">{SUPPORT_EMAIL}</a>.
          </p>
        </section>
      </div>
    </div>
  )
}
