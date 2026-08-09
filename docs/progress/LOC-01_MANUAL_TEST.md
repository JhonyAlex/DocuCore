# LOC-01 — Prueba manual de Ubicaciones

Estado inicial: la implementación y la matriz automática están completas, pero LOC-01 permanece **EN REVISIÓN** hasta que el usuario valide este checklist. No cambiar a VALIDADO solo porque las pruebas automáticas estén verdes.

## Preparación

1. Levantar base, API y frontend:

   ```bash
   docker compose up -d db
   pnpm db:migrate
   pnpm db:seed
   pnpm server
   pnpm dev
   ```

2. Abrir `http://localhost:5173/locations`.
3. Mantener abierto también `http://localhost:5173/items` para comprobar la relación Activo ↔ Ubicación.
4. El seed y el reset son destructivos por la regla pre-release vigente. Restaurar siempre el seed canónico al finalizar.

## Checklist funcional con seed canónico

| # | Acción | Resultado esperado | Resultado observado / notas |
|---:|---|---|---|
| 1 | Abrir **Ubicaciones** | Aparece el proyecto Planta Industrial Norte, sin error de carga ni errores de consola. | |
| 2 | Expandir todas las ramas | Todas las 10 ubicaciones del proyecto activo son visibles; no existen nodos ocultos o inaccesibles. | |
| 3 | Revisar los conteos del árbol | Se observan los conteos canónicos de subrama 98/42/31/8/17/32/12 donde corresponda. | |
| 4 | Seleccionar una hoja y una ubicación padre | Breadcrumb, código, superficie, responsable y conteo aparecen; el conteo del detalle coincide con el del árbol. | |
| 5 | Buscar por nombre | El árbol conserva las ramas necesarias para llegar al resultado y permite seleccionar la coincidencia. | |
| 6 | Crear una ubicación raíz | Se guarda con código único, superficie y responsable; aparece inmediatamente en el árbol. | |
| 7 | Crear una hija y una nieta | La jerarquía aparece anidada y persiste tras recargar la página. | |
| 8 | Editar nombre, superficie, responsable y padre | Los cambios persisten; renombrar mantiene `label` sincronizado cuando no era personalizado. | |
| 9 | Intentar crear un ciclo o usar relaciones de otro proyecto por API | La API responde 400 y no altera la jerarquía. Este caso también está cubierto por E2E. | |
| 10 | Intentar borrar una ubicación con hija | Responde con mensaje de conflicto y no elimina la rama. | |
| 11 | Asignar un activo a una ubicación desde **Nuevo ítem** | El selector muestra `location.label`; el activo se crea y el Sidebar aumenta sin recargar. | |
| 12 | Filtrar Activos por una ubicación padre | Aparecen los activos de toda la subrama, no solo los asignados directamente al padre. | |
| 13 | Intentar borrar una ubicación con activos en su subrama | Responde con mensaje de conflicto y conserva ubicación y activos. | |
| 14 | Borrar primero el activo de prueba por API y luego una hoja vacía | El contador del Sidebar refleja el borrado después de recargar; la hoja vacía se elimina con confirmación. | |
| 15 | Pulsar **Ver plano** en una ubicación sin plano | El control está deshabilitado; la persistencia de planos sigue perteneciendo a PLAN-01. | |

## Checklist del estado vacío

1. Ejecutar:

   ```bash
   pnpm db:reset:manual-test
   ```

2. Verificar:

| # | Acción | Resultado esperado | Resultado observado / notas |
|---:|---|---|---|
| 16 | Abrir Ubicaciones | Estado vacío recuperable, sin ubicaciones ficticias ni error de consola. | |
| 17 | Abrir Activos y Documentos | 0 activos y 0 documentos/versiones/eventos. | |
| 18 | Revisar `DOCUMENT_STORAGE_PATH` | Solo puede permanecer el marcador `.docucore-storage.json`; no quedan ficheros documentales gestionados. | |
| 19 | Crear una ubicación desde cero | El formulario funciona con los proyectos, usuarios y membresías mínimas conservadas. | |
| 20 | Restaurar `pnpm db:seed` y recargar | Vuelven 142 activos y 11 ubicaciones canónicas; no quedan datos `QA-*` de la prueba. | |

## Resultado de la validación

- Fecha y navegador:
- Resultado global: ☐ Correcto  ☐ Con incidencias  ☐ Bloqueado
- Pasos que fallaron:
- Incidencias observadas:
- Mejoras sugeridas:
- Evidencia o capturas relevantes:
- Confirmación del usuario para cambiar LOC-01 a VALIDADO: ☐ Sí  ☐ No

## Límites y pendientes conocidos

- La suite visual completa queda en 24/30 porque `documents` e `item-modal` pertenecen al pendiente visual de DOC-01. `locations` pasa sus 3 objetivos bajo el umbral fijo de 0,5%.
- El selector global de proyecto todavía es demostrativo; las reglas entre proyectos están verificadas por API/E2E.
- El borrado directo de un activo por API no notifica al frontend: el Sidebar refleja el nuevo total al recargar.
- El botón **Ver plano** solo se habilita si existe un plano; la persistencia de planos es PLAN-01.
