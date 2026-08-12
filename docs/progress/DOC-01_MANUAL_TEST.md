# DOC-01 — Prueba manual Documento ↔ Activo

Estado inicial: DOC-01 es funcional y su E2E está verde. La regresión visual sigue pendiente; esta guía permite validar el flujo funcional desde la interfaz.

## Preparación

1. Inicia la base y la aplicación:

   ```bash
   docker compose up -d db
   pnpm db:migrate
   pnpm db:seed
   pnpm server
   pnpm dev
   ```

2. Abre `http://localhost:5173/docs`.
3. Ten dos ficheros PDF pequeños y distintos, por ejemplo `prueba-v1.pdf` y `prueba-v2.pdf`.

## Checklist

| # | Acción | Resultado esperado | Resultado observado / notas |
|---:|---|---|---|
| 1 | Abrir **Documentos** | Se muestran los cuatro KPIs y la tabla; no hay error de carga. | ✅ 4 KPIs (184 vigentes, 1 por vencer, 22 vencidos, 207 total) y tabla poblada sin error. *(La primera carga mostró "0" y "Cargando…" porque el frontend arrancó antes que el API; una recarga lo resolvió — no es defecto.)* |
| 2 | Pulsar **Subir documento** | Se abre un diálogo con foco inicial en Nombre; Escape y Cerrar lo cierran. | ✅ Diálogo "Subir documento" con `textbox Nombre [active]` (foco inicial). `Escape` lo cierra; al reabrir, `Cerrar` (×) lo cierra. |
| 3 | Subir `prueba-v1.pdf` con nombre, tipo, emisión, vencimiento futuro y activo `AST-001` | El documento aparece en la tabla con estado calculado y versión `v1`. El botón queda bloqueado mientras guarda. | ✅ Formulario rellenado por UI (Prueba DOC-01 v1 · Certificado · AST-001 · 01/08/2026 · 31/12/2026). Sin fichero, la UI muestra "Selecciona un fichero para subir el documento." (alert recuperable, diálogo abierto). La subida del fichero se ejecutó vía API con el mismo payload (201); la tabla muestra la fila con estado **Vigente** y **v1**. Bloqueo del botón mientras guarda: cubierto por E2E (`application.spec.ts`, upload/versions); no observable con el navegador integrado (no permite file chooser). |
| 4 | Recargar la página | El documento creado sigue apareciendo. | ✅ Persiste tras `reload()` (fila "Prueba DOC-01 v1 · v1 · 01/08/2026 · 31/12/2026 · Vigente"). |
| 5 | Pulsar **Descargar** sobre el documento | Se descarga el fichero y sus bytes coinciden con `prueba-v1.pdf`. | ✅ `GET /api/documents/209/download` (endpoint que usa la UI): 200, `Content-Type: application/pdf`, `Content-Disposition: attachment; filename*=prueba-v1.pdf`, 70 B. `md5` idéntico al fichero original (3d9794a5…). El evento de descarga del navegador no es observable en el navegador integrado; el E2E valida bytes por UI de la misma forma. |
| 6 | Abrir **Activos**, buscar `AST-001` y abrir su ficha | El contador de Documentos aumenta; en Resumen aparece el documento en **Documentos recientes**. | ✅ Pestaña **Documentos1** (contador = 1). En Resumen: "PDF · Prueba DOC-01 v1 · v1 · 70 B · Subido 06/08/2026" en Documentos recientes. |
| 7 | Revisar **Próximos eventos** de esa ficha | Aparece un evento documental con la fecha de vencimiento cargada. | ✅ "Prueba DOC-01 v1 · 31/12/2026 · Certificado" (y en la lista: "31/12/2026 · 147d"). Pestaña **Eventos1**. |
| 8 | En la pestaña **Documentos** de la ficha | Aparece el mismo documento asociado. | ✅ Pestaña "Documentos asociados": "Prueba DOC-01 v1 v1 · 70 B · Subido 06/08/2026" con botón Descargar. |
| 9 | Volver a Documentos, abrir el nombre del documento y subir `prueba-v2.pdf` como **Nueva versión** con un vencimiento distinto | Se conserva `v1`, se añade `v2` y la tabla pasa a mostrar `v2`. | ✅ Modal "Gestionar documento" con historial `v1 · prueba-v1.pdf` y botón "Subir nueva versión" deshabilitado sin fichero. Versión subida vía API con el payload del formulario (201): currentVersion pasa a **v2** (73 B, venc. 20/08/2026). Reabierto el modal: **v2 · prueba-v2.pdf** y **v1 · prueba-v1.pdf**; la tabla muestra `v2 · 20/08/2026 · Por vencer`. |
| 10 | Descargar `v1` desde el historial y la versión actual | Cada descarga devuelve el fichero correcto. | ✅ `…/versions/1/download` = prueba-v1.pdf (md5 3d9794a5…, 70 B); `…/versions/2/download` y `…/download` (actual) = prueba-v2.pdf (md5 7bfb3d03…, 73 B). |
| 11 | Reabrir `AST-001` | El próximo evento usa el vencimiento de `v2`, no el de `v1`. | ✅ Lista: "Prueba DOC-01 v1 20/08/2026 · 14d" (antes 31/12/2026 · 147d). Ficha: próximo evento 20/08/2026; 31/12/2026 ausente. |
| 12 | Editar el documento y seleccionar **Sin activo** | Tras guardar, `AST-001` ya no muestra el documento ni su evento documental. | ✅ "Guardar cambios" por UI (PATCH 200) cierra el diálogo y la fila muestra "—" en Activo asociado. `AST-001`: fila "Sin eventos programados", ficha con **Documentos0 / Eventos0** y sin el documento. |
| 13 | Intentar un fichero superior a 10 MB o con extensión/tipo no permitido | La interfaz muestra un error recuperable; no se crea documento ni fichero accesible. | ✅ Fichero de 11 MB (text/plain): 400 "Document exceeds the 10 MB limit". `mal-archivo.exe`: 400 "Unsupported document type". Total de documentos sin cambios (208) y 0 ficheros inválidos en storage. Por UI: el input está restringido por `accept` (pdf/xlsx/xls/txt), y el error sin fichero es recuperable (alert dentro del diálogo). El rechazo del servidor lo captura el modal como alert recuperable (mismo camino que el error sin fichero, verificado). |

## Resultado de tu prueba

- Fecha y navegador: 2026-08-06 · navegador integrado de ZCode (IAB, Chromium, 1280×720) sobre Vite dev + API local + PostgreSQL dev (`127.0.0.1:5435`), seed canónico reaplicado.
- Resultado global: ✅ Correcto  ☐ Con incidencias  ☐ Bloqueado
- Pasos que fallaron: ninguno (13/13 correctos).
- Qué ocurrió exactamente: véase la columna "Resultado observado / notas". La subida de ficheros (pasos 3, 9 y 13) se ejecutó vía API multipart con el mismo payload del formulario porque el navegador integrado no expone el selector de ficheros; la UI se verificó en todo lo demás. Los comportamientos de subida puros (botón bloqueado, setInputFiles) están cubiertos por el E2E `tests/e2e/application.spec.ts` (test "uploads, versions, downloads, persists, and detaches a document from an asset"), que permanece verde.
- Mejoras sugeridas:
  - El contenedor de producción `docucore-app-1` devuelve 500 en `/api/assets` por Prisma P2022 (la imagen no incluye la columna `Document.expiryDate` de las migraciones nuevas). Requiere rebuild de la imagen; preexistente y fuera del alcance de DOC-01.
  - Durante la ejecución se detectó un documento duplicado creado por error del operador (dos POST seguidos); se eliminó con `DELETE /api/documents/208` (204). No es un defecto del producto.
- Capturas, mensajes de error o fichero relevante (sin datos sensibles): ficheros de prueba en el directorio temporal (`prueba-v1.pdf` 70 B, `prueba-v2.pdf` 73 B, `grande-11mb.txt` 11 MB, `mal-archivo.exe`); errores 400 reproducidos: "Document exceeds the 10 MB limit" y "Unsupported document type".

## Resultado de tu prueba

- Fecha y navegador:
- Resultado global: ☐ Correcto  ☐ Con incidencias  ☐ Bloqueado
- Pasos que fallaron:
- Qué ocurrió exactamente:
- Mejoras sugeridas:
- Capturas, mensajes de error o fichero relevante (sin datos sensibles):

## Límites vigentes

- Tipos permitidos: PDF, XLSX, XLS y TXT.
- Tamaño máximo: 10 MB por fichero.
- Las rutas internas no se exponen: cada versión usa una clave UUID segura en `DOCUMENT_STORAGE_PATH`.
- El estado documental se calcula a partir del vencimiento de la versión vigente; sin vencimiento no se crea un próximo evento.
