# PLAN-02 — Planos operativos: capas, eventos y conversión PDF

## Arquitectura implementada

- `GET /api/floor-plans/:id` es la fuente de datos operativa: devuelve los activos vivos de la ubicación del plano y de toda su subrama como `availableAssets`, además de los marcadores existentes.
- Cada activo del plano se serializa con tipo, estado operativo y `nextEvents`. Estos eventos se calculan en servidor con `deriveAssetEventsExcludingAcknowledged`, que delega en la lógica central `deriveAssetEvents`; no hay reglas de vencimiento duplicadas en React ni en `FloorPlanMarker`.
- `assetEventClock` vive junto a la lógica derivada y homogeneiza el reloj configurado (`DOCUCORE_NOW`) para activos y planos.
- `floorPlanPresentation.ts` concentra colores estables por `AssetType`, severidad, LOD y filtros. El color del tipo identifica la capa; la urgencia se muestra independientemente como anillo rojo/ámbar y pulso sutil solo para vencidos.
- `FloorPlanViewer` mantiene OpenSeadragon y los overlays en roots aisladas. Cambia entre punto, código y detalle según zoom; los controles reactivos y rueda/pinch actualizan LOD sin recalcular coordenadas ni persistir animaciones.
- `FloorPlanAssetPanel` separa capas dinámicas, buscador, filtros de estado/alerta, conteos colocado/no colocado, colocación y recolocación del componente de vista.
- `FloorPlanPdfImportModal` procesa el PDF exclusivamente en el navegador con `pdfjs-dist`: página seleccionable, rectángulo táctil/ratón y render de solo la región elegida a 1,5×/2×/3×. El PNG resultante entra en el endpoint existente de nueva versión; el PDF original no se transmite ni se almacena.

## Integridad y reglas de ubicación

- Al editar un activo, `removeInvalidFloorPlanMarkers` revisa sus marcadores dentro de la misma transacción. Si la nueva ubicación ya no es la ubicación del plano ni una descendiente, elimina el marcador y deja auditoría. Así nunca permanece una posición engañosa.
- La validación al colocar un marcador continúa comprobando proyecto, activo vivo y relación ubicación/ancestro; la unicidad `(floorPlanId, assetId)` evita duplicados.

## Endpoints y almacenamiento

No se añaden rutas de persistencia nuevas respecto a PLAN-01. Se amplía el payload de `GET /api/floor-plans/:id` con `availableAssets` y `nextEvents`; las rutas de versiones y DZI existentes continúan siendo el único pipeline de imágenes:

- `GET /api/floor-plans/:id`
- `POST /api/floor-plans/:id/versions`
- `GET /api/floor-plans/:id/versions/:version/dzi`
- `GET /api/floor-plans/:id/versions/:version/tiles/:level/:tile`
- `POST`, `PATCH` y `DELETE /api/floor-plans/:id/markers[/:markerId]`

El resultado PDF es PNG y, como cualquier imagen de plano, conserva el original gestionado y genera DZI con Sharp. No se guardan URLs externas ni PDFs fuente.

## Validación

- `pnpm lint` ✅
- `pnpm typecheck` ✅
- `pnpm build` ✅
- `pnpm test` ✅ — 171 pruebas unitarias/API, incluidas coordenadas, LOD, filtros, severidad central, información derivada, retirada al mover ubicación y un PNG de 6000×4000 para la pirámide DZI.
- `pnpm test:e2e` ✅ — 58 pruebas. El flujo de Planos crea plano, coloca un vencido y un próximo, verifica capas/filtros/LOD, busca/centra, mueve/persiste, sube versión, importa la región de la página 2 de un PDF multipágina y elimina la asociación.
- `pnpm test:visual` ❌ — umbral protegido de 0,5 % y baselines intactos. Los objetivos Planos siguen fuera del contrato por el visor DZI real y los controles operativos: 14,9240 % (1440 oscuro), 7,9017 % (1440 claro) y 7,4976 % (1920 oscuro). También persisten los desfases ya documentados de Activos, Documentos, Configuración y ficha de activo.

## Deuda real y siguiente mejora acotada

- Reducir el desfase visual de Planos exige una tarea explícita de paridad del estado en reposo entre OpenSeadragon y el HTML protegido; no se han relajado umbrales ni reemplazado baselines.
- El bundle conserva el aviso de Vite por tamaño. `pdfjs-dist` se carga bajo demanda, pero el worker es grande; se puede revisar el particionado sin cambiar el comportamiento.
- Quedan fuera CAD/BIM, importación persistente de PDF, reconocimiento visual de alertas y edición vectorial, por no pertenecer a esta fase.
