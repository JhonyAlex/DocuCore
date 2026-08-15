# Monitorización y Observabilidad — Report Map Online

Este documento resume los mecanismos de monitorización, healthchecks y trazabilidad estructurada de **Report Map Online**.

---

## 1. Endpoints de Salud y Diagnóstico

### Liveness Probe (`/api/health`)
- **URL**: `GET /api/health`
- **Propósito**: Comprueba que el servidor HTTP Express está vivo y respondiendo a peticiones de red.
- **Respuesta normal**: `HTTP 200 OK` `{"status":"ok"}`
- **Uso**: Configurar en balanceadores de carga / proxies para reinicios rápidos de procesos colgados.

### Readiness Probe (`/api/ready`)
- **URL**: `GET /api/ready`
- **Propósito**: Verifica que el servidor está conectado activamente a la base de datos PostgreSQL mediante `SELECT 1`.
- **Respuesta normal**: `HTTP 200 OK` `{"status":"ready","database":"connected","timestamp":"..."}`
- **Respuesta de fallo**: `HTTP 503 Service Unavailable` `{"status":"unready","error":"Database unavailable"}`
- **Uso**: Configurar en Docker Compose `healthcheck` y en Dokploy / Kubernetes para pausar el tráfico entrante durante migraciones o reinicios de BD.

---

## 2. Identificadores de Petición y Trazabilidad (`X-Request-Id`)

Cada solicitud entrante a la API recibe o genera un identificador único `X-Request-Id` (UUIDv4):
- Si el cliente o proxy (ej. Cloudflare, Traefik) envía `X-Request-Id`, se preserva.
- Si no está presente, Express lo genera automáticamente y lo incluye en las cabeceras de respuesta HTTP.
- Todos los logs estructurados y registros de auditoría vinculan el `requestId` para permitir la correlación de errores extremo a extremo.

---

## 3. Logs Estructurados

La API emite logs estructurados en formato JSON / texto con:
- `timestamp`: Marca de tiempo ISO-8601.
- `requestId`: Identificador único de la petición.
- `method`: Verbo HTTP (`GET`, `POST`, `PATCH`, etc.).
- `url`: Ruta consultada.
- `status`: Código de estado HTTP retornado.
- `durationMs`: Tiempo de respuesta en milisegundos.
- `userId`: ID del usuario autenticado (si aplica).

---

## 4. Alertas Críticas Recomendadas

1. **Uptime / HTTP 5xx**: Alertar si `/api/ready` falla 3 veces consecutivas en 1 minuto.
2. **Espacio en Disco**: Alertar si el volumen `/app/storage` supera el 85% de capacidad.
3. **Fallos de Pago Stripe**: Alertar ante webhooks `invoice.payment_failed` continuados.
