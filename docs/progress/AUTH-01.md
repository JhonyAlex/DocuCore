# AUTH-01 — Usuarios, autenticación y permisos reales

## Decisión

DocuCore usa sesiones persistentes en PostgreSQL. El navegador recibe un token aleatorio de 256 bits únicamente mediante la cookie HTTP-only `docucore_session`; PostgreSQL guarda sólo su digest SHA-256 como `AuthSession.id`. La sesión se comprueba en cada petición, expira por defecto a los 14 días y se revoca al cerrar sesión, desactivar una cuenta o cambiar la contraseña (excepto la sesión actual).

Las contraseñas se derivan con `crypto.scrypt` nativo (`N=32768`, `r=8`, `p=1`, sal aleatoria de 128 bits y clave de 64 bytes). Se eligió frente a añadir una dependencia criptográfica nativa: conserva una función de derivación resistente a fuerza bruta, es mantenida por Node y funciona de forma uniforme en Docker/Dokploy. Ni hash, token ni contraseña forman parte de los DTO, auditorías o logs.

## Cadena de autorización

`optionalAuth` resuelve la cookie y adjunta la identidad a la petición. `requireAuth` protege todas las APIs salvo health y login/logout/session. `ProjectScope` toma esa identidad, resuelve la membresía por el `:projectId` de URL, aplica la capacidad y finalmente el bloqueo de proyecto archivado. Sin sesión devuelve `401`; sin membresía, `403`; y una escritura permitida en un proyecto archivado, `409`.

| Capacidad | OWNER | ADMIN | EDITOR | VIEWER |
|---|:---:|:---:|:---:|:---:|
| Lectura | Sí | Sí | Sí | Sí |
| Operación ordinaria | Sí | Sí | Sí | No |
| Configuración, proyecto y miembros | Sí | Sí | No | No |

## Operación

- Desarrollo: ejecutar `pnpm db:seed` e iniciar sesión con `maria@docucore.local` / `DocuCore!2026`. Son credenciales públicas de desarrollo; el seed incluye editor, viewer, admin por proyecto e inactiva.
- Producción: definir `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` (12+ caracteres) antes del primer `docker compose up`. El contenedor ejecuta `pnpm db:bootstrap-admin` sólo si `User` está vacío; después elimina esas variables. La primera cuenta crea su primer proyecto desde la cartera y es OWNER de él.
- Revocación: logout elimina la sesión actual; desactivar un usuario elimina todas; un cambio de contraseña revoca las restantes.

## Seguridad y rendimiento

La cookie usa `HttpOnly`, `SameSite=Lax` y `Secure` en producción. En Dokploy establecer `TRUST_PROXY=true` para la terminación HTTPS del proxy y limitar `CORS_ORIGIN` si UI y API no comparten origen. SameSite y el despliegue same-origin son la protección CSRF de AUTH-01; no se permite CORS con credenciales para orígenes no configurados. Los intentos de login se limitan en memoria a 10 por correo/IP en 15 minutos; los mensajes no distinguen correo inexistente, contraseña incorrecta o cuenta inactiva.

`User.email` es único; `AuthSession` indexa `userId, expiresAt` y `expiresAt`. El scope consulta sólo la membresía compuesta del proyecto solicitado, nunca carga todos los proyectos o membresías.

El perfil protegido con 10.000 activos y 10.000 documentos por entidad mantiene respuestas paginadas y DTOs ligeros: p95 de 68–270 ms en las once consultas de lista, búsqueda, árbol, plano y calendario medidas. A 100.000 se preserva el mismo comportamiento: el coste de autenticación/autorización es una cookie y una sesión por petición, más una búsqueda de membresía compuesta; no depende del total de usuarios, proyectos o activos. `PERF_RECORDS` admite hasta 100.000 para la ejecución de capacidad, que queda preparada pero no se ha corrido en esta estación.
