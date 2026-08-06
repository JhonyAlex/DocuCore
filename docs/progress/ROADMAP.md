# Roadmap de DocuCore

Este roadmap organiza `24` módulos en unidades verticales verificables. La apariencia, el modelo, la persistencia, el CRUD, las pruebas y la validación final se registran por separado; una interfaz visible no demuestra funcionalidad.

Estados permitidos: `NO INICIADO`, `VISUAL MOCK`, `PARCIAL`, `FUNCIONAL`, `VALIDADO`, `BLOQUEADO`.

## Orden y dependencias

1. Ejecutar primero `AUTH-01`; aprobar límites antes de ampliar persistencia.
2. Implementar identidad y contexto de proyecto antes de autorizar nuevos CRUD (`AUTH-02`, `AUTH-03`, `SEC-01`).
3. Resolver una única fuente de verdad de cada dominio antes de conectar UI y API.
4. Entregar cada módulo como corte vertical pequeño: contrato, backend, persistencia, UI, casos negativos y evidencia.
5. Ejecutar la validación visual después de cualquier cambio de vista y la validación E2E solo contra una base aislada verificada.

## 1. Gobernanza y límites modulares

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| GOV-01 | Registrar límites modulares graduales en ADR-001 | `FUNCIONAL` | Ninguna | ADR aceptado, responsabilidades explícitas y sin reescritura masiva | Revisar decisión y consecuencias | Comprobar enlaces y formato Markdown |
| GOV-02 | Separar gobernanza, estado, roadmap, arquitectura y pruebas | `PARCIAL` | GOV-01 | Cada verdad tiene un único documento responsable | Seguir enlaces desde `AGENTS.md` | Validar rutas y `git diff --check` |
| GOV-03 | Aplicar una extracción incremental en el siguiente cambio complejo | `NO INICIADO` | GOV-01 | El cambio delega al límite objetivo sin ampliar alcance | Revisar flujo antes/después | Prueba enfocada del caso de uso |

## 2. Identidad, sesión, membresía y RBAC

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| AUTH-01 | Definir y aprobar identidad, sesión, membresía de proyecto y RBAC en un ADR dedicado | `NO INICIADO` | Ninguna | El ADR define actor, ciclo de sesión, proyecto activo, roles, denegaciones y límites; no implementa tecnología | Revisar escenarios de usuario autorizado/no autorizado y cambio de proyecto | Validar enlaces, estados de decisión y escenarios documentados |
| AUTH-02 | Implementar identidad y sesión en middleware y cliente | `BLOQUEADO` | AUTH-01 | Las peticiones obtienen un actor autenticado y la sesión se crea, expira y revoca según el ADR | Iniciar/cerrar sesión y comprobar expiración | Integración de sesión y respuestas `401` |
| AUTH-03 | Implementar membresía y RBAC por proyecto | `BLOQUEADO` | AUTH-02 | Cada operación exige membresía y permiso, con denegación uniforme | Cambiar rol/proyecto y probar acceso permitido/denegado | Matriz de autorización con `403` y casos positivos |

## 3. Shell, navegación y contexto activo

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| SHELL-01 | Mantener shell, nueve rutas, breadcrumbs y tema | `FUNCIONAL` | Ninguna | Navegación y tema responden sin errores visibles | Recorrer las nueve rutas en claro/oscuro | E2E de rutas, breadcrumbs y tema |
| SHELL-02 | Conectar selector y contexto de proyecto activo | `VISUAL MOCK` | AUTH-03, PROJ-03 | El proyecto elegido gobierna consultas, creación y navegación | Cambiar proyecto y verificar datos distintos | E2E de cambio de proyecto sin mezcla de datos |
| SHELL-03 | Retener evidencia actual de validación del shell | `PARCIAL` | SHELL-01 | Existe reporte actual reproducible de rutas, tema y consola | Revisar navegación y consola | Ejecutar E2E enfocado y conservar reporte |

## 4. Panel general

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| DASH-01 | Preservar apariencia del panel con datos identificados como mock | `VISUAL MOCK` | Ninguna | La vista coincide con el contrato y no aparenta persistencia | Comparar KPIs y tarjetas con la referencia | Comparación visual de la ruta |
| DASH-02 | Crear consultas agregadas acotadas al proyecto y periodo | `BLOQUEADO` | AUTH-03, CAL-03, DOC-04 | KPIs, vencimientos, alertas y actividad provienen de datos reales autorizados | Cambiar periodo/proyecto y verificar resultados | Integración de agregados y aislamiento |
| DASH-03 | Conectar panel y validar estados vacío/error/carga | `BLOQUEADO` | DASH-02 | La UI consume agregados sin fallback silencioso a mock | Simular vacío, fallo y carga | Prueba de componente, E2E y visual |

## 5. Proyectos

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| PROJ-01 | Preservar catálogo visual de proyectos | `VISUAL MOCK` | Ninguna | Tarjetas y acciones mantienen el contrato, señalando que no persisten | Comparar vista con referencia | Comparación visual de Proyectos |
| PROJ-02 | Alinear modelo `Project` y contadores con fuentes calculadas | `PARCIAL` | AUTH-01 | Se decide qué campos son derivados y se elimina duplicidad ambigua | Revisar un proyecto y sus conteos | Prueba de repositorio para conteos |
| PROJ-03 | Implementar listado, detalle, alta, edición y archivado autorizados | `BLOQUEADO` | AUTH-03, PROJ-02 | API y UI persisten cambios, aplican permisos y no simulan apertura/creación | Crear, editar, abrir y archivar proyecto | Integración HTTP negativa/positiva y E2E CRUD |

## 6. Activos e ítems

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| ITEM-01 | Mantener lista, detalle, filtros y paginación persistentes | `FUNCIONAL` | PostgreSQL disponible | La UI lee Items reales, filtra y pagina sin fallback a mock | Buscar, filtrar, paginar y abrir detalle | Integración de GET y prueba de UI enfocada |
| ITEM-02 | Mantener alta, actualización y cambio de estado | `FUNCIONAL` | ITEM-01 | POST, PUT y PATCH persisten y reflejan errores reales | Crear, editar y cambiar estado; recargar | Integración HTTP y E2E de persistencia |
| ITEM-03 | Definir e implementar baja/eliminación con retención explícita | `NO INICIADO` | AUTH-01 | Se decide baja lógica o borrado y sus efectos; existe endpoint y UI coherentes | Ejecutar baja y comprobar relaciones/historial | Casos HTTP, cascadas/retención y E2E |
| ITEM-04 | Aplicar aislamiento y autorización por proyecto | `BLOQUEADO` | AUTH-03 | Lista y accesos por ID no leen ni escriben fuera del proyecto autorizado | Intentar acceso cruzado entre dos proyectos | Integración `403/404` y ausencia de fuga |
| ITEM-05 | Obtener validación final actual con evidencia retenida | `PARCIAL` | ITEM-03, ITEM-04, QA-03 | Casos funcionales, negativos, visuales y de seguridad pasan en entorno aislado | Recorrer el módulo completo | Unit, integración, E2E y visual con reportes |

## 7. Tipos y estados de ítem

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| META-01 | Mantener lectura de tipos y estados desde PostgreSQL | `FUNCIONAL` | Ninguna | Formularios y filtros reciben metadatos reales | Abrir formulario y filtros | Integración GET de metadatos |
| META-02 | Implementar CRUD autorizado y reglas de uso | `NO INICIADO` | AUTH-03 | Alta/edición/archivo evitan romper Items existentes | Crear y editar metadatos en Configuración | Integración de conflictos y E2E CRUD |
| META-03 | Validar migración y uso de metadatos | `BLOQUEADO` | META-02 | Cambios se reflejan en Items sin valores huérfanos | Editar tipo/estado y revisar Items | Integridad referencial y E2E |

## 8. Campos dinámicos

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| FIELD-01 | Auditar contrato entre definiciones y `Item.dynamicFields` | `PARCIAL` | Ninguna | Tipos, obligatoriedad, opciones y evolución tienen una única regla documentada | Revisar ejemplos por cada `FieldType` | Pruebas de esquema y compatibilidad |
| FIELD-02 | Implementar API de definiciones y validación de valores | `NO INICIADO` | FIELD-01, AUTH-03 | La API rechaza valores inválidos y respeta tipo de ítem/proyecto | Probar cada tipo y error de requerido | Integración de validación y autorización |
| FIELD-03 | Implementar configuración, formulario y validación final | `BLOQUEADO` | FIELD-02, META-02 | UI crea definiciones y captura valores persistentes sin perder datos | Configurar campo y usarlo en un ítem | Componente, E2E y visual |

## 9. Documentos

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| DOC-01 | Preservar tabla y KPIs documentales | `VISUAL MOCK` | Ninguna | Vista coincide con referencia y no confirma subidas/descargas falsas | Comparar tabla y estados | Comparación visual de Documentos |
| DOC-02 | Aprobar ADR de almacenamiento, acceso, retención y borrado | `NO INICIADO` | AUTH-01 | ADR decide límites sin asumir proveedor no aprobado | Revisar carga, descarga, expiración y borrado | Validar escenarios y enlaces del ADR |
| DOC-03 | Alinear modelo y metadatos documentales | `PARCIAL` | DOC-02 | Fechas, versión, tamaño, estado y vínculo a Item tienen contratos tipados | Revisar documento con/sin Item | Pruebas de esquema y repositorio |
| DOC-04 | Implementar listado, carga, descarga, edición y baja | `BLOQUEADO` | AUTH-03, DOC-02, DOC-03 | Archivo y metadatos persisten con autorización y manejo de fallos | Cargar, descargar, editar y retirar | Integración, seguridad y E2E CRUD |
| DOC-05 | Validar módulo documental | `BLOQUEADO` | DOC-04, QA-03 | Flujos, expiración, permisos y visual pasan con evidencia | Recorrer casos feliz y fallos | Unit, integración, E2E y visual |

## 10. Calendario y eventos

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| CAL-01 | Preservar calendario mensual | `VISUAL MOCK` | Ninguna | Cuadrícula y eventos mock coinciden con la referencia | Revisar mes y eventos visibles | Comparación visual de Calendario |
| CAL-02 | Resolver `Item.nextEvent*` frente a `Event` | `PARCIAL` | AUTH-01 | `Event` o una proyección definida es la única fuente de próximos eventos | Comparar evento e indicador de Item | Pruebas de proyección y consistencia |
| CAL-03 | Implementar API y CRUD autorizado de eventos | `BLOQUEADO` | AUTH-03, CAL-02 | Eventos persisten por proyecto/Item y se consultan por rango | Crear, editar y eliminar evento | Integración de rangos/permisos y E2E |
| CAL-04 | Validar calendario real y estados límite | `BLOQUEADO` | CAL-03 | Zonas horarias, límites de mes, vacío y errores están cubiertos | Navegar fechas y probar bordes | Unit de fechas, E2E y visual |

## 11. Planos y marcadores

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| PLAN-01 | Mantener apariencia y arrastre local de marcadores | `PARCIAL` | Ninguna | El arrastre funciona en memoria sin afirmar guardado | Mover marcador y recargar para comprobar límite | Prueba de interacción local y visual |
| PLAN-02 | Alinear `FloorPlan`, `FloorPlanMarker`, Item y Location | `PARCIAL` | LOC-02 | Relaciones, coordenadas, imagen y versión tienen contrato único | Revisar marcador vinculado/no vinculado | Pruebas de esquema y repositorio |
| PLAN-03 | Persistir posiciones y versión con control de concurrencia | `BLOQUEADO` | AUTH-03, PLAN-02 | Guardar persiste; conflictos no sobrescriben silenciosamente | Mover, guardar, recargar y provocar conflicto | Integración de versión y E2E |
| PLAN-04 | Implementar deshacer, rehacer y capas reales | `BLOQUEADO` | PLAN-03 | Controles modifican estado persistible y no son simulados | Editar, deshacer, rehacer y alternar capas | Pruebas de estado y E2E |
| PLAN-05 | Validar interacción, persistencia y contrato visual | `BLOQUEADO` | PLAN-04, QA-03 | Ratón/teclado, errores, permisos y visual tienen evidencia | Recorrer edición completa | Componentes, E2E y visual |

## 12. Ubicaciones

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| LOC-01 | Preservar árbol y detalle visual | `VISUAL MOCK` | Ninguna | Vista coincide con referencia y acciones no simulan éxito | Revisar árbol, búsqueda y detalle | Comparación visual de Ubicaciones |
| LOC-02 | Resolver `Item.location` frente a `Location` | `PARCIAL` | AUTH-01 | Se define relación/migración y una única fuente de verdad sin perder datos | Comparar Items y árbol tras migración de prueba | Migración en base aislada e integridad |
| LOC-03 | Sustituir `/api/locations` derivado de Items | `PARCIAL` | LOC-02 | Endpoint consulta el dominio Location y queda acotado por proyecto | Comparar respuesta con tabla Location | Integración de consulta y aislamiento |
| LOC-04 | Implementar CRUD jerárquico autorizado | `BLOQUEADO` | AUTH-03, LOC-03 | Alta, edición, movimiento y archivo preservan jerarquía y referencias | Crear/mover ubicación y revisar Items | Integración de ciclos/conflictos y E2E |
| LOC-05 | Validar ubicaciones y navegación a plano | `BLOQUEADO` | LOC-04, PLAN-03 | Árbol, búsqueda, detalle y plano pasan con permisos | Recorrer árbol y abrir plano | Unit, integración, E2E y visual |

## 13. Historial y auditoría

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| AUDIT-01 | Preservar historial visual | `VISUAL MOCK` | Ninguna | Timeline coincide con referencia y se identifica como mock | Comparar filtros y entradas | Comparación visual de Historial |
| AUDIT-02 | Sustituir actor fijo por identidad autenticada | `BLOQUEADO` | AUTH-02 | Cada escritura registra actor real y contexto de proyecto | Ejecutar acciones con dos usuarios | Integración de actor y ausencia de constante |
| AUDIT-03 | Definir cobertura, inmutabilidad y retención de eventos | `NO INICIADO` | AUTH-01 | Acciones auditables y política de retención quedan aprobadas | Revisar matriz de eventos | Pruebas de servicio por operación |
| AUDIT-04 | Implementar consulta y filtros autorizados | `BLOQUEADO` | AUTH-03, AUDIT-02, AUDIT-03 | La vista consulta eventos reales sin exponer otros proyectos | Filtrar por usuario/acción/fecha | Integración de filtros/permisos y E2E |
| AUDIT-05 | Validar trazabilidad extremo a extremo | `BLOQUEADO` | AUDIT-04 | Una operación de dominio aparece una sola vez con actor y detalle correctos | Crear/cambiar Item y revisar historial | E2E de trazabilidad y visual |

## 14. Configuración

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| CONFIG-01 | Preservar tarjetas de configuración | `VISUAL MOCK` | Ninguna | Apariencia coincide y tarjetas sin flujo no aparentan guardar | Comparar vista y accesos | Comparación visual de Configuración |
| CONFIG-02 | Enrutar cada tarjeta a una capacidad real o estado explícito | `BLOQUEADO` | META-02, FIELD-03, AUTH-03 | Ninguna tarjeta queda como affordance engañosa | Abrir cada tarjeta y verificar destino | E2E de navegación y permisos |
| CONFIG-03 | Validar configuración y roles administrativos | `BLOQUEADO` | CONFIG-02 | Solo roles autorizados modifican configuración persistente | Probar usuario admin y no admin | Matriz RBAC, E2E y visual |

## 15. Búsqueda global

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| SEARCH-01 | Mantener input y atajo sin simular resultados | `VISUAL MOCK` | Ninguna | El control conserva apariencia y comunica indisponibilidad hasta implementarse | Usar input y `⌘K` | Prueba de accesibilidad y visual del shell |
| SEARCH-02 | Definir índice/consulta transversal autorizada | `BLOQUEADO` | AUTH-03, DOC-04, LOC-04 | Resultados de Items, documentos y ubicaciones respetan proyecto/permisos | Buscar términos comunes en dos proyectos | Integración de ranking y aislamiento |
| SEARCH-03 | Implementar resultados, teclado y validación final | `BLOQUEADO` | SEARCH-02 | Navegación por teclado, vacío, error y destino funcionan | Buscar y abrir cada tipo de resultado | Componente, E2E, accesibilidad y visual |

## 16. Importación

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| IMPORT-01 | Definir formatos, validación, idempotencia y reporte de errores | `NO INICIADO` | AUTH-01 | Contrato aprobado con límites de tamaño y estrategia de duplicados | Revisar archivo válido e inválido | Casos de contrato y seguridad de archivos |
| IMPORT-02 | Implementar importación de un dominio piloto | `BLOQUEADO` | IMPORT-01, AUTH-03 | Vista previa y confirmación persisten solo filas válidas en el proyecto | Importar mezcla válida/inválida | Integración transaccional y autorización |
| IMPORT-03 | Validar rollback, volumen y trazabilidad | `BLOQUEADO` | IMPORT-02, AUDIT-04 | Fallos no dejan estado parcial y el resultado queda auditado | Cancelar y provocar error a mitad | E2E, rendimiento acotado y auditoría |

## 17. Exportación

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| EXPORT-01 | Identificar controles de exportación como no funcionales | `VISUAL MOCK` | Ninguna | Botones visibles no confirman una descarga inexistente | Accionar exportación del panel | Prueba de UI sin falso éxito |
| EXPORT-02 | Implementar exportación autorizada de un dominio piloto | `BLOQUEADO` | AUTH-03 | Archivo contiene filtros aplicados y solo datos permitidos | Exportar y cotejar filas/campos | Integración de contenido y aislamiento |
| EXPORT-03 | Validar formato, volumen y datos sensibles | `BLOQUEADO` | EXPORT-02, SEC-02 | Codificación, fórmulas, límites y campos restringidos están cubiertos | Abrir archivo en herramienta común | Pruebas de sanitización y E2E |

## 18. Integraciones

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| INT-01 | Mantener acceso visual sin presentar conectores reales | `VISUAL MOCK` | Ninguna | Configuración no afirma conexión ni éxito | Abrir tarjeta de integraciones | Prueba de UI y visual |
| INT-02 | Aprobar ADR para el primer caso de integración | `NO INICIADO` | AUTH-01 | ADR define necesidad, límites, secretos, reintentos y propiedad de datos | Revisar fallos y revocación | Validar escenarios del ADR |
| INT-03 | Implementar y validar el primer conector | `BLOQUEADO` | INT-02, OBS-02 | Sincronización es idempotente, observable y revocable | Conectar, sincronizar y revocar | Contract tests, integración y fallos |

## 19. Backup y restauración

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| BACKUP-01 | Definir RPO, RTO, alcance y responsable | `NO INICIADO` | DOC-02 | Política incluye DB, archivos documentales, secretos y retención | Revisar escenarios de pérdida | Validar checklist de política |
| BACKUP-02 | Implementar copias automatizadas verificables | `BLOQUEADO` | BACKUP-01 | Copias cifradas se generan, rotan y monitorizan | Inspeccionar una copia sin datos expuestos | Job controlado y verificación de artefacto |
| BACKUP-03 | Ejecutar y documentar restauración aislada | `BLOQUEADO` | BACKUP-02 | Restauración cumple RPO/RTO y valida integridad | Restaurar en entorno aislado | Prueba periódica de restore y checksums |

## 20. Observabilidad

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| OBS-01 | Mantener healthcheck básico | `PARCIAL` | Ninguna | Endpoint distingue proceso vivo de dependencias críticas | Consultar `/api/health` con DB disponible/no disponible | Integración de healthcheck |
| OBS-02 | Añadir logging estructurado y correlación sin datos sensibles | `NO INICIADO` | AUTH-02 | Peticiones y errores tienen correlación, actor seguro y niveles consistentes | Seguir una petición en logs | Pruebas de redacción y correlación |
| OBS-03 | Definir métricas, alertas y validación operativa | `BLOQUEADO` | OBS-02, DEPLOY-02 | Fallos de API, DB, jobs y backups generan señales accionables | Provocar fallo controlado | Smoke de métricas y regla de alerta |

## 21. Seguridad y aislamiento de datos

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| SEC-01 | Aplicar contexto de actor/proyecto en todas las lecturas y escrituras | `BLOQUEADO` | AUTH-03 | Ningún repositorio de dominio opera sin contexto autorizado | Intentar acceso cruzado por lista e ID | Suite de aislamiento por módulo |
| SEC-02 | Establecer validación, errores y protección de datos comunes | `NO INICIADO` | AUTH-01 | Entradas, respuestas, logs y descargas siguen una política verificable | Probar payloads inválidos y datos sensibles | Tests negativos, redacción y análisis estático |
| SEC-03 | Proteger helpers destructivos con guarda de base aislada | `NO INICIADO` | Ninguna | Tests/seed abortan salvo identificación inequívoca de dev/test aislado | Apuntar a URL no permitida y confirmar aborto | Test unitario de guarda y E2E solo en DB aislada |

## 22. Plataforma API y datos

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| API-01 | Mantener flujo React -> Express -> Prisma -> PostgreSQL para Items | `FUNCIONAL` | PostgreSQL disponible | Lecturas/escrituras existentes atraviesan API sin mock silencioso | Inspeccionar una operación y recargar | Integración HTTP existente |
| API-02 | Extraer schemas, services y repositories al tocar Items por complejidad | `NO INICIADO` | GOV-01 | Router conserva transporte y delega validación/casos de uso/datos | Revisar responsabilidades del diff | Unit de servicio e integración de router |
| API-03 | Unificar contrato de errores, paginación y concurrencia | `NO INICIADO` | AUTH-02 | Clientes reciben errores tipados y semántica consistente | Probar 400, 401, 403, 404 y conflicto | Contract tests HTTP |

## 23. Despliegue

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| DEPLOY-01 | Mantener Dockerfile, Compose y guía Dokploy coherentes | `PARCIAL` | Ninguna | Configuración describe puertos, migraciones, volúmenes y seed sin ambigüedad | Revisar `docker compose config` | `docker compose config --quiet` |
| DEPLOY-02 | Validar build, arranque, migración y healthcheck en entorno controlado | `NO INICIADO` | SEC-03 | Stack arranca desde cero sin seed implícito y responde healthcheck | Desplegar entorno desechable | Build, arranque y smoke HTTP |
| DEPLOY-03 | Aprobar preparación de producción | `BLOQUEADO` | AUTH-03, SEC-01, BACKUP-03, OBS-03, DEPLOY-02 | Checklist de seguridad, datos, recuperación y operación tiene evidencia | Simular despliegue y rollback | Pipeline y smoke post-deploy |

## 24. Calidad y pruebas

| ID | Tarea | Estado | Dependencia | Criterio de aceptación | Prueba manual | Prueba automática |
|---|---|---|---|---|---|---|
| QA-01 | Mantener lint, tipos y unit/integración enfocada | `VALIDADO` | Ninguna | Auditoría actual conserva `lint`, `typecheck` y `7/7` pruebas correctas | Revisar salida registrada | `pnpm lint`, `pnpm typecheck`, `pnpm test` |
| QA-02 | Corregir seguridad de base E2E antes de repetir suites | `BLOQUEADO` | SEC-03 | Suite solo migra/siembra una DB inequívocamente aislada | Verificar URL y contenedor antes de ejecutar | Test de guarda y setup aislado |
| QA-03 | Repetir E2E y visual con reportes retenidos | `BLOQUEADO` | QA-02 | E2E y los 30 pares visuales tienen reporte actual; ninguna referencia/umbral se altera | Revisar artefactos y diferencias | `pnpm test:e2e`, `pnpm test:visual` |
| QA-04 | Ejecutar validación final por módulo | `BLOQUEADO` | Tareas funcionales del módulo, QA-03 | Criterios funcionales, negativos, visuales y operativos pasan con evidencia | Checklist del módulo | Matriz automática aplicable |

## Deuda técnica y actualizaciones de dependencias

- Prioridad crítica: añadir la guarda de base aislada antes de cualquier E2E, migración o seed automatizado.
- Extraer `server/routes/items.ts` de forma incremental cuando la siguiente modificación añada autorización, reglas o consultas; no hacer una reescritura preventiva.
- Dividir `src/data/mock.ts` al retirar mocks por módulo; no trasladar datos obsoletos a un nuevo contenedor central.
- Revisar cohesión de `server/seed.ts`, `src/types/index.ts` e `ItemFormModal.tsx` al tocar esas responsabilidades.
- Evaluar code splitting solo con medición actual de `pnpm build` y sin alterar el contrato visual.
- No actualizar dependencias o lockfile de forma oportunista. Cada actualización requiere motivo, compatibilidad, seguridad, prueba enfocada y registro en `CHANGELOG.md`; una sustitución transversal requiere ADR.

## Próxima tarea exacta

`AUTH-01`: definir y aprobar identidad, sesión, membresía de proyecto y RBAC en un ADR dedicado. La implementación queda en tareas posteriores.

## Conteo final

El conteo se calcula sobre las filas de tarea anteriores y debe coincidir con el total tras cualquier edición:

- `NO INICIADO`: `16`.
- `VISUAL MOCK`: `11`.
- `PARCIAL`: `13`.
- `FUNCIONAL`: `6`.
- `VALIDADO`: `1`.
- `BLOQUEADO`: `37`.
- Total de tareas: `84` (`16 + 11 + 13 + 6 + 1 + 37 = 84`).
