# Arquitectura de DocuCore

DocuCore combina una interfaz React con una API Express y persistencia PostgreSQL mediante Prisma. La arquitectura actual tiene una vertical persistente en Items; el resto de vistas es principalmente representación visual sobre mocks o modelos todavía no expuestos.

## Flujo actual

```text
React views/components
        |
        v
src/lib/api.ts -> fetch('/api')
        |
        v
Express routers
        |
        v
Prisma Client
        |
        v
PostgreSQL
```

- `src/App.tsx` registra el shell y nueve rutas.
- `src/lib/api.ts` implementa el cliente de Items y metadatos.
- `server/routes/items.ts` atiende lista, detalle, alta, actualización y cambio de estado.
- `server/routes/meta.ts` expone tipos, estados y una lista de ubicaciones derivada de `Item.location`.
- Prisma define `13` modelos, pero un modelo no implica que exista un caso de uso, API o interfaz funcional.

## Capacidad por capa

| Capa | Realidad actual | Brecha principal |
|---|---|---|
| Presentación | Shell y nueve vistas React | Ocho vistas dependen principalmente de mocks; existen affordances no-op |
| Cliente API | Items y metadatos de lectura | No hay cliente funcional para el resto de dominios ni contrato de errores uniforme |
| HTTP | Routers de Items, metadatos y healthcheck | Falta autenticación, autorización, contexto de proyecto y APIs de los demás módulos |
| Negocio | Reglas embebidas en routers/componentes | No hay services explícitos para casos de uso crecientes |
| Datos | Prisma y PostgreSQL con 13 modelos | Varias fuentes de verdad se solapan y la mayoría de modelos no tiene flujo funcional |
| Operación | Dockerfile, Compose y healthcheck básico | Faltan observabilidad, backup/restauración y evidencia actual de runtime |

## Brechas de capas actuales

`server/routes/items.ts` combina transporte HTTP, parseo/validación, construcción de consultas Prisma, reglas de escritura y creación de auditoría. Es aceptable como punto de partida pequeño, pero la incorporación de identidad, autorización o reglas nuevas justifica extraer schemas, services y repositories de forma incremental.

En frontend, las vistas mock importan datos directamente desde `src/data/mock.ts`. Items ya separa parte de la infraestructura en `src/lib/api.ts`, pero la coordinación del caso de uso sigue concentrada en la vista. Las nuevas capacidades deben introducir `src/features/` cuando exista lógica propia reutilizable o difícil de probar, sin mover código por estética.

## Límites objetivo

### Frontend

| Ruta | Responsabilidad objetivo |
|---|---|
| `src/views/` | Componer la pantalla y coordinar estados propios de la ruta |
| `src/components/` | UI reutilizable y ajena a reglas específicas de un módulo |
| `src/features/` | Casos de uso, componentes y adaptadores de una capacidad |
| `src/hooks/` | Estado y efectos React reutilizables |
| `src/lib/` | Cliente HTTP, infraestructura, adaptadores externos y utilidades puras |
| `src/types/` | Contratos compartidos cohesionados |
| `src/contexts/` | Estado transversal estable, como sesión o proyecto activo |

### Backend

| Ruta | Responsabilidad objetivo |
|---|---|
| `server/routes/` | Transporte, códigos HTTP y delegación |
| `server/schemas/` | Validación y contratos de entrada/salida |
| `server/services/` | Casos de uso y reglas de negocio |
| `server/repositories/` | Consultas y persistencia Prisma |
| `server/middleware/` | Identidad, autorización, contexto y concerns HTTP transversales |
| `server/lib/` | Infraestructura y utilidades sin reglas de dominio |

## Regla de extracción gradual

La dirección aceptada está en [ADR-001](ADR-001-modular-boundaries.md): no habrá reescritura masiva. Una tarea extrae solo la frontera que necesita cuando aparece al menos una de estas señales:

- lógica compartida o duplicada;
- una regla de negocio que no pertenece al transporte o a la vista;
- consultas que requieren aislamiento, transacción o pruebas propias;
- un archivo que acumula responsabilidades separables;
- dificultad para probar un caso sin levantar capas no relacionadas.

Código, pruebas y documentación de la misma unidad vertical deben avanzar juntos.

## Riesgos de fuente de verdad

### Ubicación de Items

`Item.location` es un `String`, mientras `Location` modela ubicaciones por proyecto. `GET /api/locations` obtiene valores distintos desde Items y no consulta `Location`. Antes de implementar el CRUD de ubicaciones se debe decidir relación y migración; mantener ambas como autoridades produciría árboles y filtros divergentes.

### Próximos eventos

`Item.nextEventLabel`, `Item.nextEventDate` y `Item.nextEventUrgency` duplican información potencial de `Event`. Debe definirse si son una proyección calculada/cacheada o si se eliminan. No deben actualizarse como fuentes independientes.

### Campos dinámicos

`DynamicFieldDefinition` describe campos por tipo, mientras `Item.dynamicFields` almacena JSON. Falta una regla funcional que valide tipo, obligatoriedad, opciones, evolución y eliminación de definiciones.

### Actor de auditoría

Items registra escrituras en `AuditLog`, pero `ACTOR_USER_ID = 1` no representa al usuario real. El actor debe provenir del contexto autenticado aprobado en un ADR futuro de identidad y sesión.

### Alcance de proyecto

Items incluye `projectId`, pero las consultas de lista y por ID no se restringen al proyecto activo ni verifican membresía. Toda lectura y escritura futura debe recibir contexto autorizado; filtrar solo en la UI no es aislamiento.

## Decisiones pendientes

- Identidad, sesión, membresía y RBAC: ADR futuro, tarea `AUTH-01` del [roadmap](../progress/ROADMAP.md).
- Almacenamiento documental, acceso, retención y borrado: ADR futuro antes de implementar Documentos.
- Backup/restauración e integraciones: decisiones posteriores, basadas en requisitos concretos.

Estas preguntas no se consideran resueltas por ADR-001.
