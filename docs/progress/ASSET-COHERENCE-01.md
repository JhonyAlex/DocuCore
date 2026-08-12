# ASSET-COHERENCE-01 — Coherencia funcional de la ficha del activo

## Estado: FUNCIONAL — validación visual bloqueada

Fecha: 2026-08-12

## Objetivo

Unificar la edición de los datos y características del activo, separar las
ocurrencias derivadas de la gestión de tareas preventivas y retirar el modelo
anterior de mantenimiento dinámico.

## Resultado confirmado

- **Un único formulario de edición**: `AssetFormModal` conserva los datos
  básicos, ubicación, tipo, estado, imagen y `DynamicFieldsFormSection`.
  `AssetCharacteristics` es de consulta y mantiene solo la operación de
  completar/programar fechas dinámicas. Se eliminó el `PUT`
  `/api/assets/:id/dynamic-fields`: el `PUT /api/assets/:id` es el contrato
  único para guardar características.
- **Resumen**: consume únicamente `nextEvents`, cuya fuente central
  `deriveAssetEvents` reúne eventos, documentos, fechas dinámicas y una única
  ocurrencia por ejecución preventiva. Ya no inserta el checklist ni la
  configuración de Preventivos.
- **Navegación de eventos**: las tarjetas abren la superficie pertinente.
  Preventivo abre la pestaña Preventivos y enfoca temporalmente la ejecución
  por estado/callbacks; Documento abre el mismo visor existente; fecha dinámica
  abre Características y evento abre Eventos.
- **Documentos asociados**: cada fila mantiene la apertura por clic y suma
  `Ver`, que llama al mismo `onOpen(document.id)` que la fila; Descargar sigue
  siendo independiente.
- **Preventivos**: Eventos ya no completa ejecuciones. `Ver preventivo`
  conduce a la ejecución correspondiente. La acción `Completar todas las
  tareas` confirma la operación y usa un único `POST`
  `/api/assets/:id/preventives/executions/:executionId/tasks/complete`.
  Es transaccional, valida activo/asignación/ejecución pendiente, toca solo
  tareas no completadas, audita y deja disponible `Completar preventivo` para
  registrar la realización y crear la siguiente ocurrencia.
- **Historial**: la pestaña visible ya no queda vacía; muestra `AuditLog` del
  activo mediante `GET /api/assets/:id/history`. Eventos conserva el historial
  de ocurrencias operativas.
- **Modelo retirado**: `Asset.hasPreventive`, su checkbox, contratos Zod/API y
  el comportamiento de desactivar planes desde PUT se eliminaron. La única
  fuente de verdad es la asignación activa `AssetPreventivePlan`.

## Migraciones y seed

- `20260812120000_remove_asset_has_preventive`: elimina el flag duplicado de
  PostgreSQL sin modificar migraciones aplicadas.
- `20260812121000_remove_legacy_preventive_data`: retira de la base ya
  existente el evento manual `Mant. preventivo` y la definición de Máquina
  `Próximo mantenimiento`; no elimina calibraciones, ITV, revisiones ni
  retimbrados independientes.
- El seed crea la única ejecución preventiva real de CNC-05 con fecha
  05/08/2026 y elimina ambos datos heredados.
- `pnpm db:deploy` aplicado y `prisma migrate status` confirma 23/23
  migraciones al día.

## Cobertura añadida o adaptada

- Edición global de características y ausencia de `Editar características`.
- Resumen sin checklist preventivo; preventivo como ocurrencia fechada.
- Botón explícito `Ver` en documentos y reutilización del visor existente.
- Salto Eventos → Preventivos con ejecución enfocada.
- Endpoint de completar todas las tareas, seguido de la finalización que genera
  la siguiente ocurrencia.
- Rechazo contractual de `hasPreventive` y seed sin los dos restos retirados.
- Ausencia del antiguo endpoint de características y edición mediante el PUT
  unificado del activo.
- Persistencia de una fecha dinámica periódica legítima y su siguiente fecha.
- Corrección adicional: `DynamicFieldsFormSection` propaga valores al formulario
  padre después del render, eliminando la advertencia React de actualización
  cruzada que el nuevo flujo reveló.

## Validación ejecutada

| Comando | Resultado |
|---|---|
| `pnpm lint` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm build` | ✅; aviso preexistente de chunk mayor de 500 kB |
| `pnpm test` | ✅ 24 archivos, 178 pruebas |
| `pnpm test:e2e` | ✅ 60 pruebas |
| `pnpm db:deploy` + `prisma migrate status` | ✅ 23/23 migraciones |
| `pnpm test:visual` | ❌ 15/30 por encima del 0,5 %; umbral y baselines intactos |

## Bloqueo visual

La comparación visual no es conforme y no se ha ocultado. Los objetivos fuera
del umbral son Activos (3,8841 % / 3,3503 % / 2,2859 %), Documentos
(2,1346 % / 1,6768 % / 1,5621 %), Planos (14,6814 % / 8,0840 % / 6,9759 %),
Configuración (2,0679 % / 1,5310 % / 1,1651 %) y ficha de activo
(3,3173 % / 14,3945 % / 2,3089 %) en los tres objetivos de captura. Las demás
15 capturas están bajo 0,5 %.

No se atribuye toda esa banda a ASSET-COHERENCE-01: el árbol de trabajo ya
contenía cambios sin confirmar de PLAN-04 que afectan Activos, Configuración y
Planos. La ficha del activo sí forma parte de este alcance y permanece por
encima del contrato, por lo que requiere una pasada visual específica antes de
marcar fidelidad visual como validada.
