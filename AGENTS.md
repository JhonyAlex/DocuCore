# DocuCore: gobernanza para agentes

## Propósito

DocuCore es una plataforma de gestión documental y de activos industriales. El repositorio transforma un prototipo HTML aprobado en una aplicación React + TypeScript con API Express, Prisma y PostgreSQL, sin alterar el contrato visual.

## Fuentes de verdad

- [Estado actual](docs/progress/CURRENT_STATUS.md): capacidad y evidencia vigentes.
- [Roadmap](docs/progress/ROADMAP.md): trabajo pendiente, orden y criterios de aceptación.
- [Arquitectura](docs/architecture/OVERVIEW.md): flujo real, brechas y límites objetivo.
- [ADR-001](docs/architecture/ADR-001-modular-boundaries.md): modularización gradual aceptada.
- [Pruebas](docs/testing/TESTING.md): comandos, prerrequisitos y evidencia.

No se duplican estados, resultados ni próximos pasos en este archivo.

## Contrato visual

> Ningún agente puede rediseñar, reinterpretar, simplificar o sustituir la interfaz del HTML de referencia sin autorización expresa del usuario.

`docs/reference/docucore-prototype.html` es un contrato visual, no una inspiración. Antes de modificar una vista se debe abrir la referencia aplicable; después se debe ejecutar la comparación visual correspondiente.

- SHA-256: `C4B90868465DC108F9140F00B3BA0120F6F5CDBAF8D1930B991B171B1E7F5112`.
- Tamaño: `126104` bytes y `1800` líneas físicas.
- Está prohibido modificar la referencia, rebajar umbrales, cambiar objetivos, regenerar una referencia o actualizar baselines para ocultar diferencias.
- Una diferencia visual exige corregir la aplicación o documentar y obtener autorización expresa para cambiar el contrato.

## Límites de arquitectura

El flujo vigente y sus brechas se describen en [OVERVIEW.md](docs/architecture/OVERVIEW.md). Las responsabilidades objetivo son:

| Frontend | Responsabilidad |
|---|---|
| `src/views/` | Composición de pantalla y coordinación de estados de vista. |
| `src/components/` | UI reutilizable sin reglas específicas de un módulo. |
| `src/features/` | Casos de uso, componentes y adaptadores propios de una capacidad. |
| `src/hooks/` | Estado y efectos reutilizables de React. |
| `src/lib/` | Infraestructura cliente, utilidades puras y adaptadores externos. |
| `src/types/` | Contratos compartidos; evitar un archivo central sin cohesión. |
| `src/contexts/` | Estado transversal estable y acotado. |

| Backend | Responsabilidad |
|---|---|
| `server/routes/` | Transporte HTTP, códigos de respuesta y delegación. |
| `server/schemas/` | Validación y contratos de entrada/salida. |
| `server/services/` | Casos de uso y reglas de negocio. |
| `server/repositories/` | Acceso a datos y consultas Prisma. |
| `server/middleware/` | Identidad, autorización, contexto y concerns HTTP transversales. |
| `server/lib/` | Infraestructura y utilidades sin reglas de dominio. |

La extracción es gradual: no se permite una reescritura masiva. Se introduce una frontera cuando una tarea nueva o una modificación demuestra complejidad, reutilización o dificultad de prueba. Véase [ADR-001](docs/architecture/ADR-001-modular-boundaries.md).

## Principios de diseño y código

- Mantener TypeScript estricto; `any` requiere justificación localizada.
- Separar presentación, casos de uso y acceso a datos.
- Preferir cambios pequeños, verticales y verificables.
- Mantener datos de dominio limpios; no persistir clases CSS ni detalles de presentación.
- Reutilizar patrones existentes antes de crear abstracciones.
- No modificar migraciones aplicadas; crear una migración nueva.
- Mantener assets propios en `public/` o `src/assets/`; no introducir recursos externos temporales.
- No presentar datos mock como persistentes ni dejar affordances sin efecto sin registrarlas como trabajo pendiente.

### Señales de cohesión por tamaño

Los tamaños son señales orientativas, no fallos mecánicos:

- Hasta unas `200` líneas: revisar por responsabilidad, no por tamaño aislado.
- Entre `201` y `300` líneas: revisar cohesión y considerar extracción si existen responsabilidades separables.
- Más de `300` líneas: señal fuerte para dividir por responsabilidad, salvo justificación clara.

Las señales actuales y su trabajo asociado se registran en la sección de deuda técnica del [ROADMAP.md](docs/progress/ROADMAP.md#deuda-técnica-y-actualizaciones-de-dependencias), no en esta gobernanza estable.

### Patrones prohibidos

- Vistas con consultas, reglas de negocio y persistencia mezcladas.
- Routers que sigan acumulando validación, consultas, reglas y auditoría cuando una extracción incremental ya sea justificable.
- Componentes JSX monolíticos o archivos centrales usados como contenedores indiscriminados.
- Fallback silencioso de API a mock que oculte errores o falta de persistencia.
- Botones, enlaces o formularios que aparenten éxito sin ejecutar una operación real.
- Duplicar tipos de dominio incompatibles entre frontend, API y Prisma sin mapeo explícito.
- Desactivar lint, tipos, pruebas o seguridad para conseguir una ejecución verde.
- Actualizar referencias, capturas o umbrales para encubrir regresiones.

## Política de dependencias

- Añadir una dependencia solo cuando exista una necesidad concreta que la plataforma o las dependencias actuales no resuelvan bien.
- Evaluar mantenimiento, licencia, seguridad, tamaño y compatibilidad antes de incorporarla.
- No realizar actualizaciones oportunistas dentro de una tarea no relacionada.
- Los cambios de dependencia y lockfile deben ser explícitos, acotados y verificados.
- Una sustitución transversal o decisión de plataforma requiere ADR; identidad, sesiones y almacenamiento documental permanecen como decisiones futuras.

## Ciclo de una tarea

### Antes

1. Leer `AGENTS.md`, [CURRENT_STATUS.md](docs/progress/CURRENT_STATUS.md) y la fila del [ROADMAP.md](docs/progress/ROADMAP.md).
2. Inspeccionar el código y la documentación afectados; no asumir que una afirmación histórica sigue vigente.
3. Identificar contrato visual, datos, permisos, migraciones, pruebas y riesgos destructivos aplicables.
4. Confirmar dependencias y criterio de aceptación antes de editar.

### Durante

1. Mantener el alcance de una unidad vertical verificable.
2. Preservar límites y extraer responsabilidades solo cuando la tarea lo justifique.
3. Registrar decisiones no triviales y no alterar archivos fuera de alcance.
4. No afirmar resultados de pruebas todavía no ejecutadas.

### Después

1. Ejecutar la matriz aplicable y conservar evidencia suficiente.
2. Comparar visualmente toda vista modificada contra la referencia protegida.
3. Actualizar estado, roadmap, arquitectura o testing solo si cambió su verdad.
4. Revisar el diff, los enlaces y los riesgos; informar pruebas no ejecutadas.

## Matriz mínima de pruebas

| Tipo de cambio | Verificación mínima |
|---|---|
| Documentación | Enlaces/rutas, conteos, consistencia y `git diff --check`. |
| Frontend sin flujo persistente | `lint`, `typecheck`, prueba enfocada y comparación visual. |
| API o negocio | `lint`, `typecheck`, unit/integration enfocada y casos HTTP negativos. |
| Persistencia o migración | Pruebas contra base aislada, migración adelante y verificación de datos. |
| Flujo vertical | E2E del caso feliz y fallos relevantes, además de pruebas de capas. |
| Despliegue | `build`, validación Compose, arranque y healthcheck en entorno controlado. |

Los comandos, prerrequisitos y advertencias destructivas están en [TESTING.md](docs/testing/TESTING.md). Un agente no puede declarar una prueba, validación o éxito que no ejecutó o para el que no conserva evidencia.

## Política de documentación

- `CURRENT_STATUS.md` es la única verdad viva del estado; `ROADMAP.md` es la única verdad del trabajo planificado.
- `SESSION_LOG.md` conserva evidencia histórica y anota contradicciones; no se borra historia útil para hacerla coincidir con el presente.
- Los ADR registran decisiones aceptadas; una pregunta abierta no se presenta como decisión.
- Usar español neutro y profesional, enlaces relativos y comandos/identificadores exactos.
- Evitar copiar contenido entre documentos; enlazar a la fuente responsable.
- Actualizar `README.md` y `CHANGELOG.md` cuando cambien la experiencia operativa o la gobernanza pública.

## Política Git

- No hacer commit, push, merge, rebase ni crear PR sin solicitud o autorización explícita.
- Cuando se soliciten commits, usar commits convencionales, atómicos y revisables; código, pruebas y documentación de una misma unidad viajan juntos.
- No reescribir historial compartido ni incluir cambios ajenos.
- Verificar rama, estado y diff antes de cualquier operación Git autorizada.

## Seguridad y datos

- No registrar secretos, credenciales, tokens ni datos personales reales.
- Toda lectura y escritura de dominio debe quedar acotada al proyecto autorizado cuando existan identidad y membresía.
- La identidad del actor de auditoría debe provenir del contexto autenticado, nunca de una constante.
- No ejecutar reset, seed, truncado o pruebas destructivas sin verificar una base aislada de desarrollo/pruebas.
- Validar entrada en el límite HTTP y aplicar autorización en servidor; ocultar controles en UI no es seguridad.
- Documentar efectos de borrado, cascadas, retención y recuperación antes de cambios destructivos.

## Subagentes

- Delegar solo un alcance autocontenido, con archivos permitidos, archivos prohibidos, evidencia requerida y criterio de aceptación.
- Un único escritor modifica cada archivo; otros subagentes pueden auditar en modo lectura.
- El subagente no amplía alcance, no encubre conflictos y no declara pruebas no ejecutadas.
- Toda devolución debe usar este contrato, conservando el significado de cada sección:

```markdown
## Alcance realizado
## Archivos modificados
## Pruebas ejecutadas
## Resultado
## Pendientes
## Riesgos
## Skill resolution
```

## Definición de terminado

- El criterio de aceptación de la tarea está satisfecho con evidencia.
- Los límites de arquitectura y el contrato visual se preservan.
- No quedan affordances engañosas nuevas ni fallbacks que oculten errores.
- Las pruebas aplicables pasaron; las omitidas y su motivo están declarados.
- No se usó una base no verificada para operaciones destructivas.
- Estado, roadmap, ADR y documentación operativa reflejan el resultado sin sobreafirmar.
- El diff contiene solo el alcance autorizado y no presenta errores de formato.

## Archivo protegido

- `docs/reference/docucore-prototype.html`: **NUNCA MODIFICAR** sin autorización expresa para cambiar el contrato visual.

No se consideran protegidos archivos inexistentes ni artefactos generados por herramientas.
