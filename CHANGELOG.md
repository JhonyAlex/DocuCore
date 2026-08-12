# Changelog

## Unreleased

### Release

- **RELEASE-01**: se aprueba y versiona el contrato visual actual sin tocar el HTML protegido ni elevar el umbral de `pixelmatch` (0,5 %). Dashboard, Proyectos, Calendario, Ubicaciones e Historial continúan contra el HTML; Activos, Documentos, Planos, Configuración y ficha de activo usan los 15 baselines inspeccionados de `tests/visual/baselines/release-01/`.

### Added

- **Coherencia de ficha de activo (ASSET-COHERENCE-01)**: las características se editan junto con el resto del activo desde el único formulario global; el Resumen consume solo ocurrencias derivadas (evento, documento, fecha dinámica o preventivo), los documentos asociados exponen «Ver» además de «Descargar», Eventos redirige los preventivos a su ejecución enfocada y la pestaña Historial muestra la auditoría propia del activo. Preventivos incorpora «Completar todas las tareas» con confirmación y una única operación transaccional; completar la ejecución permanece separado para registrar la realización y generar la siguiente ocurrencia.

- **Planos operativos (PLAN-02)**: capas dinámicas de los `AssetType` realmente presentes (color estable y contador), filtros de tipo/estado/urgencia, búsqueda y centrado de activos, detalle de próximo evento/origen y LOD de marcador (punto, código, código + nombre) sobre OpenSeadragon. La urgencia se deriva exclusivamente de `deriveAssetEvents`: vencidos se señalan en rojo con pulso sutil; próximos a 21 días, en ámbar; el estado operativo queda separado del color de tipo.
- **Conversión local PDF → plano**: «Importar desde PDF» permite elegir página, delimitar una región y renderizar únicamente ese recorte a calidad configurable usando `pdfjs-dist`. Se sube solo el PNG generado al pipeline existente de versiones/DZI; el PDF origen no se envía ni se almacena.
- **Vista previa por versión documental**: cada entrada del historial de «Gestionar documento» incorpora «Ver» junto a «Descargar»; `GET /api/documents/:id/versions/:version/preview` sirve exactamente la versión elegida inline sin alterar la versión vigente.
- **Gestión documental desde la ficha del activo**: los documentos asociados son clicables y abren «Gestionar documento» encima de la ficha, sin navegar ni perder el contexto del activo.
- **Imagen del activo (IMG-01)**: el cuadro de imagen de la ficha del activo muestra la foto (o el placeholder del HTML de referencia) y permite **subirla, cambiarla y quitarla** desde el hover; el formulario de alta/edición permite **elegir la imagen al añadir un activo desde cero** (se sube al guardar). Una imagen por activo, reemplazable, persistente en el storage gestionado de DocuCore (`POST/DELETE /api/assets/:id/image` y `GET /api/assets/:id/image` que la sirve inline con el MIME almacenado; PNG/JPG/WebP/GIF, máx. 10 MB); la purga del activo borra también su fichero. En reposo sin imagen, el cuadro es idéntico al HTML de referencia.
- **Confirmación de acciones destructivas y de baja**: dar de baja un activo (desde la ficha o el formulario de edición), eliminarlo (ficha, fila y papelera, incluido el borrado masivo), quitar la foto del activo, descartar la selección de imagen, quitar la asociación de un documento a un activo y eliminar una ubicación pasan por un diálogo de confirmación dedicado (`AssetActionConfirmDialog`/`ConfirmDialog`) con estado ocupado durante la operación. La confirmación se monta sobre el modal y Escape la cierra solo a ella, sin cerrar el modal padre.
- **Vista previa de documentos (DOC-03)**: al abrir «Gestionar documento», la versión actual se muestra incrustada justo debajo del campo Emisión, sin botón previo — PDF renderizado con pdf.js en canvas propios, imágenes en `<img>` y texto plano en `<pre>`; al tocar la vista previa se abre el visor ampliado. Los formatos sin visor nativo (xlsx/xls) muestran el área deshabilitada con la indicación de descargar el archivo. Escape/backdrop/✕ cierran solo el visor sin cerrar el modal padre.
- **Formatos de imagen permitidos (DOC-03)**: la subida de documentos (alta y nuevas versiones) acepta también PNG, JPG/JPEG, WebP y GIF, tanto en el servidor (MIME + claves de almacenamiento) como en el selector de fichero; `GET /api/documents/:id/preview` sirve la versión actual en línea (`Content-Disposition: inline`), la descarga conserva `attachment`.
- **Periodicidad de documentos (DOC-04)**: un documento puede tener periodicidad (Mensual, Bimestral, Trimestral, Cuatrimestral, Semestral, Anual) con dos modos por documento — «Según calendario» (el vencimiento salta desde el vencimiento vigente) o «Según subida» (desde la emisión de la nueva versión). Al crear o subir una versión sin vencimiento explícito, el sistema lo calcula automáticamente (clamp al último día del mes: 31/01 + 1 mes → 28/02); el formulario muestra el cálculo en vivo y el campo sigue siendo editable. Nueva columna «Periodicidad» en la lista de Documentos.
- **Ficha de activo desde Ubicaciones (LOC-02)**: los activos del detalle de una ubicación se pueden tocar y abren la misma ficha que en Activos — ver datos y próximo evento, cambiar estado, editar, eliminar (papelera) y gestionar documentos — sin salir de la vista; cualquier cambio refresca el detalle, el árbol y el sidebar.
- **Sugerencias de valores en el formulario de activo (UX-04)**: al crear o editar un activo, los campos Código, Nombre e Iniciales muestran un desplegable con los valores actuales de otros activos; cada fila incluye el valor de los otros dos campos como contexto (p. ej. `CNC-05` con «Torno CNC Haas ST-20 · CN») y se rellena el campo al seleccionarla con clic o teclado (↑/↓ + Enter). El campo sigue aceptando cualquier valor nuevo; al editar no se sugiere el valor del propio activo.
- **Alta de activos con creación de ubicación (UX-03)**: el campo «Ubicación» del formulario de activo ofrece «＋ Crear nueva ubicación…» — el alta se abre sin salir del formulario (responsable precargado y padre = ubicación seleccionada) y la ubicación creada queda seleccionada automáticamente.
- **Botón único de alta (UX-03)**: el «Nuevo activo» de la cabecera es el único punto de alta; desaparece el botón duplicado de la vista Activos.
- **Papelera de activos (ITEM-05)**: eliminar un activo (desde la ficha o el menú de fila) lo mueve a una papelera recuperable hasta 30 días; «Papelera» con contador lista los eliminados con fecha, **Restaurar** y **Eliminar definitivamente** (con confirmación); pasados 30 días la purga automática los borra físicamente. La sesión, las ubicaciones, los documentos y los selectores excluyen la papelera, y el código/número de serie único sigue ocupado hasta purgar.
- **Renombrado unificado «Activo» (ITEM-06)**: el término «ítem» desaparece de toda la app — la vista pasa a llamarse «Activos» y el modelo/API usan `Asset`/`/api/assets`/`assetIds` (la ruta `/items` redirige a `/assets`; las migraciones renombran las tablas conservando los datos).
- **Modales (UX-02)**: la ficha del activo abre siempre en «Resumen» (no hereda la pestaña del modal anterior) y los desplegables de búsqueda («Activos asociados», «Vincular documento») viajan en un portal: ya no se recortan dentro del modal.
- Un documento puede asociarse a **varios activos** (relación N-N `DocumentItem`, migración `20260810000000_document_item_join`): «Gestionar documento» muestra y edita la lista completa de activos con un selector multi, y «Vincular documento» desde la ficha añade el vínculo sin reasignar.
- **Un único control «Subir nueva versión»**: sube la versión al elegir el fichero (con las fechas del formulario); desaparece el campo duplicado «Nueva versión».
- La fila completa de la lista de Documentos abre el documento al hacer click en cualquier parte.
- Formato de tamaño de documento legible y unificado (B/KB/MB, como el HTML de referencia) en la lista y en la ficha del activo — nunca «0 MB».
- Los modales quedan anclados al borde superior: al cambiar de pestaña o de tamaño ya no se recentran.
- El campo «Estado» de la ficha del activo abre inmediatamente el menú de opciones (con indicación chevron) en lugar de exigir un control intermedio.
- Duplicación de activos desde el menú de acciones: copia propiedades reutilizables y exige código y número de serie nuevos.
- Reactivación directa de activos en estado `Fuera de servicio`, con auditoría legible del cambio inverso.
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

- El mantenimiento preventivo deja de tener flag, checkbox o contrato genérico en `Asset`: la asignación activa `AssetPreventivePlan` es la única fuente de verdad. Se elimina `Asset.hasPreventive` mediante la migración `20260812120000_remove_asset_has_preventive`, el campo dinámico de seed «Próximo mantenimiento» y el evento manual preventivo duplicado de CNC-05; las fechas dinámicas legítimas siguen siendo independientes.

- Las barras de desplazamiento de toda la aplicación pasan a 5 px, con pista transparente y pulgar sutil que gana contraste al pasar el puntero.
- Los modales con acciones mantienen cabecera y pie visibles; solo se desplaza el cuerpo, incluidos formularios de activo/ubicación, gestión documental y confirmaciones.
- La relación documento-activo pasa de 1-N (`Document.itemId`) a N-N (tabla `DocumentItem`); la API de documentos usa `itemIds` en lugar de `itemId` en creación y edición, y el `PATCH` reemplaza el conjunto completo.
- El duplicado de un activo nace con el estado por defecto de un activo nuevo (Activo) en lugar de heredar el ciclo de vida del origen; código y número de serie quedan vacíos por unicidad.
- `Item.serialLabel` se elimina del formulario, API y PostgreSQL; la presentación `SN`, `Lote` o `Mat` se deriva del tipo y del número de serie. `Item.serialNumber` pasa a ser único mediante la migración `20260809190000_item_serial_unique_remove_label`.
- El vencimiento y estado del documento se calculan exclusivamente desde la versión más reciente; los próximos eventos del activo ya consultan esa versión.
- El alta y la edición de activos ya no aceptan “Próximo evento”, “Fecha del evento” ni “Urgencia”; son datos derivados de solo lectura.
- La respuesta de activos expone `nextEvents`, `documentCount` y `eventCount` calculados desde relaciones vigentes.
- Express puede servir `dist/` en producción sin capturar rutas `/api/*`.
- Las pruebas E2E reseed la base canónica antes y después de sus flujos.

### Fixed

- **Estabilización de runtime y Planos**: la imagen Docker de producción incluye `shared/` y `public/`; el seed genera PDF válidos; los popovers de colocación y marcador cierran con Escape; los chips de Activos reflejan únicamente filtros reales; la API cubre explícitamente fuentes de plano JPEG/WebP; y OpenSeadragon libera teselas y capturas Pointer pendientes sin avisos al navegar, recargar o retirar marcadores.
- **Carga inicial**: las vistas, OpenSeadragon y el catálogo de iconos se cargan bajo demanda; el bundle de entrada deja de superar 500 kB.
- Los contratos de cliente de Documentos y sugerencias de activos vuelven a consumir las respuestas reales `data` y `values`; los listados y el picker de sugerencias ya no quedan vacíos. La traducción de errores de escritura usa el `status` HTTP preservado por el cliente, por lo que los conflictos de código/serie muestran su mensaje específico.
- La vista previa de PDF ya no conserva la posición de scroll entre la vista incrustada y el visor ampliado, ni muestra la barra de navegación del visor del navegador: el PDF se renderiza con pdf.js en canvas propios (`PdfPreview`), siempre desde la primera página (el scroll es del contenedor propio y cada apertura arranca en 0). El fichero se comparte sin volver a pedirlo; pdf.js se carga en un chunk aparte solo al abrir un PDF.
- El menú de acciones de Activos se renderiza fuera del contenedor desplazable de la tabla para evitar recortes y barras de desplazamiento al abrirlo.
- Se evita que respuestas antiguas de filtros sustituyan el estado más reciente del listado de activos.
- Las fechas de instalación imposibles devuelven HTTP 400 en lugar de normalizarse o provocar errores internos.
- Los modales soportan semántica de diálogo, Escape y restauración de foco.
- El listado de activos permite reintentar tras una caída temporal del API.
- La suite E2E detecta warnings de consola y cubre nueve flujos funcionales.
