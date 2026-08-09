# Changelog

## Unreleased

### Added

- Un documento puede asociarse a **varios activos** (relación N-N `DocumentItem`, migración `20260810000000_document_item_join`): «Gestionar documento» muestra y edita la lista completa de activos con un selector multi, y «Vincular documento» desde la ficha añade el vínculo sin reasignar.
- **Un único control «Subir nueva versión»**: sube la versión al elegir el fichero (con las fechas del formulario); desaparece el campo duplicado «Nueva versión».
- La fila completa de la lista de Documentos abre el documento al hacer click en cualquier parte.
- Formato de tamaño de documento legible y unificado (B/KB/MB, como el HTML de referencia) en la lista y en la ficha del activo — nunca «0 MB».
- Los modales quedan anclados al borde superior: al cambiar de pestaña o de tamaño ya no se recentran.
- El campo «Estado» de la ficha del activo abre inmediatamente el menú de opciones (con indicación chevron) en lugar de exigir un control intermedio.
- Duplicación de ítems desde el menú de acciones: copia propiedades reutilizables y exige código y número de serie nuevos.
- Reactivación directa de ítems en estado `Fuera de servicio`, con auditoría legible del cambio inverso.
- Módulo documental real: entidad lógica `Document`, historial inmutable `DocumentVersion`, almacenamiento local seguro, API multipart y descargas actual/históricas.
- Relación Documento-Activo desde la interfaz, edición de metadatos, nueva versión e historial accesible.
- E2E Documento ↔ Activo que verifica bytes descargados, versiones, persistencia, auditoría implícita y actualización/retiro de próximos eventos.
- Volumen Docker `document_data` y almacenamiento E2E aislado para ficheros documentales.
- Derivación de próximos eventos desde relaciones `Event`, vencimientos de `Document` y campos dinámicos de tipo fecha.
- Lista relacional de “Próximos eventos” dentro de la ficha del activo, con origen, fecha, días y urgencia calculados.
- PostgreSQL E2E aislado del volumen y puerto de desarrollo.
- Configuración real de Vitest con pruebas de mapeo visual y validación HTTP de la API.
- Suite Playwright para navegación, tema, modal, filtros, paginación y ciclo CRUD persistente.
- Comparación visual directa contra el HTML protegido con artefactos app/referencia/diff y umbral explícito.
- Imagen Docker de producción, migración al arranque, SPA fallback seguro y healthchecks Compose.
- Documentación operativa para desarrollo, Docker y Dokploy.

### Changed

- La relación documento-activo pasa de 1-N (`Document.itemId`) a N-N (tabla `DocumentItem`); la API de documentos usa `itemIds` en lugar de `itemId` en creación y edición, y el `PATCH` reemplaza el conjunto completo.
- El duplicado de un ítem nace con el estado por defecto de un ítem nuevo (Activo) en lugar de heredar el ciclo de vida del origen; código y número de serie quedan vacíos por unicidad.
- `Item.serialLabel` se elimina del formulario, API y PostgreSQL; la presentación `SN`, `Lote` o `Mat` se deriva del tipo y del número de serie. `Item.serialNumber` pasa a ser único mediante la migración `20260809190000_item_serial_unique_remove_label`.
- El vencimiento y estado del documento se calculan exclusivamente desde la versión más reciente; los próximos eventos del activo ya consultan esa versión.
- El alta y la edición de ítems ya no aceptan “Próximo evento”, “Fecha del evento” ni “Urgencia”; son datos derivados de solo lectura.
- La respuesta de ítems expone `nextEvents`, `documentCount` y `eventCount` calculados desde relaciones vigentes.
- Express puede servir `dist/` en producción sin capturar rutas `/api/*`.
- Las pruebas E2E reseed la base canónica antes y después de sus flujos.

### Fixed

- El menú de acciones de Activos e ítems se renderiza fuera del contenedor desplazable de la tabla para evitar recortes y barras de desplazamiento al abrirlo.
- Se evita que respuestas antiguas de filtros sustituyan el estado más reciente del listado de activos.
- Las fechas de instalación imposibles devuelven HTTP 400 en lugar de normalizarse o provocar errores internos.
- Los modales soportan semántica de diálogo, Escape y restauración de foco.
- El listado de activos permite reintentar tras una caída temporal del API.
- La suite E2E detecta warnings de consola y cubre nueve flujos funcionales.
