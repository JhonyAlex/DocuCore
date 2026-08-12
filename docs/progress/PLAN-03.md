# PLAN-03 — Interacción directa de planos

## Objetivo

Simplificar el uso operativo de los planos sin alterar el contrato técnico de PLAN-01 y PLAN-02: OpenSeadragon sigue leyendo DZI, las posiciones siguen siendo coordenadas normalizadas y `useFloorPlanEditor` continúa siendo la única fuente del borrador, undo/redo y guardado por lote.

## Modelo de interacción actual

- Pan, rueda, pinch y zoom están siempre disponibles. Se elimina el cambio previo entre «Ver» y «Editar».
- Un `canvas-click` de OpenSeadragon con `quick === true` sobre una zona vacía abre «Añadir activo aquí». El selector solo lista activos vivos válidos de la ubicación del plano y sus descendientes que aún no tengan marcador en ese plano.
- Un arrastre de lienzo no abre ese selector: OpenSeadragon marca el gesto como no rápido.
- La búsqueda vive sobre el visor. Un activo colocado se centra; uno pendiente deja preparado el mismo flujo de colocación y el siguiente toque rápido en el plano lo coloca.
- Un clic o toque rápido sobre un marcador abre un popover local con tipo, estado, evento próximo, «Ver activo», «Quitar del plano» y la indicación de arrastrarlo para moverlo.
- El arrastre de un marcador actualiza únicamente el borrador local durante el gesto. Al terminar crea una única entrada de undo; la escritura API solo ocurre al pulsar «Guardar posiciones».

## Controles retirados o reubicados

- Retirado `PlanModeToggle` («Ver / Editar»).
- Retirados del lateral «Activo a colocar», «Marcadores colocados», «Mover …» y las flechas de ajuste de 5 %.
- Retirado el panel fijo de activo de la esquina inferior derecha.
- «Buscar activo» pasa a ser un control flotante persistente sobre el visor.
- El lateral queda reservado para edificio, planta, plano, capas, leyenda, filtros y gestión general del plano.

## Marcadores e importación

- El hover ya no altera la traslación de un overlay de OpenSeadragon. Solo escala el contenido interno un 3 % y cambia sutilmente su sombra, manteniendo el anclaje y el área de clic.
- Los marcadores muestran icono solo en LOD lejano, icono y `asset.name` en LOD medio, e icono, nombre y `asset.code` secundario en LOD cercano. La base con borde blanco semitransparente y sombra mejora el contraste sin oscurecer el plano.
- El formulario «Crear plano» permite «Subir imagen» o «Importar desde PDF». El importador ya existente convierte en cliente la región elegida a PNG, devuelve un `File` al mismo formulario y `createFloorPlan` recibe exclusivamente ese PNG. Nombre y ubicación se conservan mientras se cierra el importador.

## Alcance preservado

No cambia la migración, las rutas, DZI/Sharp, capas, alertas, filtros, zoom, fit, relación jerárquica de ubicaciones, búsqueda, undo/redo ni el guardado por lote. El PDF fuente no se sube ni se guarda.

## Cobertura añadida

El flujo E2E de planos valida creación directa desde PDF, conservación del formulario, pan sin selector, clic vacío con selector, colocación, hover sin desplazamiento, etiqueta principal por nombre, búsqueda/enfoque, toque básico, popover de marcador, arrastre con persistencia tras recarga y retirada confirmada del marcador.

## Validación ejecutada

- `pnpm lint`, `pnpm typecheck`, `pnpm build` y `pnpm test` pasan (171 unitarias/API).
- `pnpm test:e2e` pasa (58 pruebas, incluida la de PLAN-03).
- `pnpm test:visual` mantiene el umbral protegido del 0,5 % y los baselines sin cambios: 15/30 objetivos pasan. Los tres objetivos de Planos quedan fuera del contrato de reposo por el visor DZI operativo y esta nueva interacción pedida: 14,6355 % (1440 oscuro), 8,0408 % (1440 claro) y 6,9321 % (1920 oscuro). También continúan los desfases ya conocidos de Activos, Documentos, Configuración y ficha de activo.
