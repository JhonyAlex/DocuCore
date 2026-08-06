# ROADMAP — DocuCore

Estados: `NO INICIADO`, `VISUAL MOCK`, `PARCIAL`, `FUNCIONAL`, `VALIDADO`, `BLOQUEADO`.

| ID | Módulo | Tarea | Estado | Criterio de aceptación | Prueba manual | Prueba automática | Dependencias |
|---|---|---|---|---|---|---|---|
| SHELL-01 | Shell | Conectar buscador, proyecto y notificaciones | PARCIAL | Los tres controles producen resultados reales y recuperables | Recorrer topbar y cambiar proyecto | E2E de búsqueda/proyecto/notificaciones | API de proyectos y búsqueda |
| DASH-01 | Panel | Sustituir KPIs y acciones mock | VISUAL MOCK | Datos y filtros provienen de API; exportación genera archivo | Cambiar periodo y exportar | API + E2E | Agregaciones backend |
| PROJ-01 | Proyectos | Implementar listado y CRUD | VISUAL MOCK | Alta, apertura, edición y persistencia PostgreSQL | Crear y reabrir proyecto | API + E2E CRUD | Reglas de permisos |
| ITEM-01 | Activos | Mantener CRUD, filtros, errores y auditoría | VALIDADO | Ciclo CRUD persiste, maneja errores y registra auditoría | Checklist local de activos | 8 unit/API + 9 E2E | PostgreSQL |
| ITEM-02 | Activos | Responsable seleccionable y campos dinámicos | PARCIAL | Formulario carga usuarios/campos por tipo y persiste cambios | Editar responsable/campos y recargar | API + E2E | Endpoints usuarios/definiciones |
| ITEM-03 | Activos | Próximos eventos derivados de relaciones | FUNCIONAL | El ítem no almacena ni edita fechas manuales; lista evento, vencimiento documental vigente y campo DATE por orden y urgencia | Relacionar, versionar y retirar un documento fechado | Unit + API + E2E + visual pendiente | CRUD de Documentos, Calendario y campos dinámicos |
| DOC-01 | Documentos | Implementar subida, versión y descarga | FUNCIONAL | Archivo y metadatos persisten con validación; cada fichero queda en su versión y puede descargarse | Subir, descargar, versionar, recargar y retirar relación | API + E2E verdes; visual pendiente | Almacenamiento local persistente |
| CAL-01 | Calendario | Implementar eventos y vistas | VISUAL MOCK | Crear/editar evento persiste y actualiza mes/semana/día | Crear evento y recargar | API + E2E | API de eventos |
| PLAN-01 | Planos | Persistir posiciones, capas y versiones | PARCIAL | Guardar/deshacer/rehacer sobreviven a recarga | Mover marcador, guardar y recargar | API + E2E drag | API de planos/marcadores |
| LOC-01 | Ubicaciones | Implementar jerarquía y CRUD | VISUAL MOCK | Alta/edición y “Ver plano” navegan a datos reales | Crear ubicación y abrir plano | API + E2E | API de ubicaciones |
| HIST-01 | Historial | Conectar la vista a `AuditLog` | VISUAL MOCK | Altas, cambios y bajas aparecen con actor/detalle | Ejecutar CRUD y abrir historial | API + E2E | Endpoint de auditoría |
| CONF-01 | Configuración | Persistir preferencias y catálogos | VISUAL MOCK | Cambios sobreviven a recarga con permisos | Cambiar opción y recargar | API + E2E | Autenticación/permisos |
| PERF-01 | Frontend | Dividir el bundle | NO INICIADO | Build sin chunk >500 kB o presupuesto acordado | Navegar todas las rutas | Build + visual | Estrategia lazy loading |
| QA-01 | Tooling | Validar con Node LTS en CI | NO INICIADO | Matriz CI sin `DEP0205` y con suite completa | Arranque local LTS | CI lint/test/E2E | Pipeline CI |
