# ADR-001: límites modulares graduales

- Estado: Accepted
- Fecha: 2026-08-06

## Contexto

DocuCore nació como réplica React de un prototipo HTML y añadió una primera vertical persistente en Items. La estructura actual permite avanzar, pero `server/routes/items.ts` ya reúne transporte, validación, consultas, reglas y auditoría; varias vistas reúnen composición y datos mock. Una reescritura por capas retrasaría capacidades y aumentaría el riesgo de alterar el contrato visual.

Se requieren límites explícitos para que cada nueva vertical pueda aislar reglas, datos y pruebas sin convertir la reorganización en un proyecto separado.

## Decisión

Adoptar límites modulares objetivo y migrar hacia ellos de forma gradual. No se realizará una reescritura masiva ni una redistribución preventiva de todos los archivos.

### Responsabilidades frontend

| Límite | Responsabilidad |
|---|---|
| `src/views/` | Composición de pantalla y coordinación de estados de vista |
| `src/components/` | UI reutilizable sin reglas específicas de un módulo |
| `src/features/` | Casos de uso, componentes y adaptadores propios de una capacidad |
| `src/hooks/` | Estado y efectos reutilizables de React |
| `src/lib/` | Infraestructura cliente, utilidades puras y adaptadores externos |
| `src/types/` | Contratos compartidos cohesionados |
| `src/contexts/` | Estado transversal estable y acotado |

### Responsabilidades backend

| Límite | Responsabilidad |
|---|---|
| `server/routes/` | Transporte HTTP, códigos de respuesta y delegación |
| `server/schemas/` | Validación y contratos de entrada/salida |
| `server/services/` | Casos de uso y reglas de negocio |
| `server/repositories/` | Acceso a datos y consultas Prisma |
| `server/middleware/` | Identidad, autorización, contexto y concerns HTTP transversales |
| `server/lib/` | Infraestructura y utilidades sin reglas de dominio |

## Enfoque de migración

1. Mantener el código existente mientras no sea necesario modificarlo.
2. Al trabajar una unidad vertical, identificar la responsabilidad que dificulta reutilización, autorización o prueba.
3. Extraer únicamente esa responsabilidad al límite objetivo.
4. Conservar el contrato HTTP/visual salvo cambio aprobado.
5. Añadir pruebas en el límite extraído y pruebas de integración del flujo.
6. Evitar adaptadores de compatibilidad si no existe un consumidor o dato persistido que lo requiera.

El primer candidato natural es Items cuando se incorpore autorización: el router debe delegar validación, caso de uso y consultas acotadas al proyecto, sin reescribir módulos no relacionados.

## Consecuencias

### Positivas

- Los cambios permanecen pequeños y revisables.
- Las reglas pueden probarse sin depender del router o de una vista completa.
- La autorización y el alcance de proyecto pueden aplicarse de forma uniforme.
- Se reduce el riesgo de romper la fidelidad visual por una refactorización transversal.

### Costes

- Durante la transición coexistirán módulos con distinta profundidad arquitectónica.
- La ubicación de una responsabilidad deberá decidirse en cada cambio relevante.
- Puede existir duplicación temporal, pero debe registrarse y retirarse en una tarea concreta.

### Restricciones

- No crear capas vacías ni wrappers que solo reenvían llamadas.
- No mover archivos únicamente para satisfacer una estructura nominal.
- No introducir un contenedor central de tipos, datos o servicios sin cohesión.
- No mezclar esta migración con rediseños visuales o actualizaciones oportunistas de dependencias.

## Alternativas descartadas

### Reescritura completa por capas

Se descarta porque amplía el alcance, retrasa valor verificable y aumenta el riesgo sobre la única vertical persistente y el contrato visual.

### Mantener routers y vistas como límite único

Se descarta como dirección permanente porque identidad, permisos, transacciones y reglas de dominio no pueden probarse ni reutilizarse de forma segura dentro del transporte o la composición visual.

## Decisiones no incluidas

Este ADR no elige proveedor o mecanismo de autenticación, formato de sesión, matriz RBAC, almacenamiento documental, servicio de archivos, backup ni integración externa. Esas decisiones requieren requisitos y ADR propios. La siguiente decisión es `AUTH-01` en el [roadmap](../progress/ROADMAP.md).
