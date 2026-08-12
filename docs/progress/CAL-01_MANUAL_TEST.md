# CAL-01 — Checklist manual del Calendario

## Precondiciones

- Aplicación y PostgreSQL arrancados con el seed canónico.
- Sesión del proyecto activo disponible.

| # | Acción | Resultado esperado | Observado |
|---|---|---|---|
| 1 | Abrir `/calendar` | Carga los eventos reales del mes desde la API, sin datos simulados ni errores de consola. | |
| 2 | Cambiar entre Mes, Semana y Día; usar anterior, siguiente y Hoy | La URL conserva `view` y `date`; cada vista muestra el mismo origen de datos para su rango. | |
| 3 | Abrir un vencimiento documental | Se ve la fuente, activo, fecha y estado; «Abrir documento» lleva a Documentos. | |
| 4 | Abrir una fecha dinámica | Se ve su origen y el activo; completar actualiza la siguiente ocurrencia según la periodicidad. | |
| 5 | Abrir un preventivo con tareas pendientes | Se muestra el progreso y no aparece «Completar». «Abrir preventivo» abre la ficha del activo en Preventivos y enfoca la ejecución. | |
| 6 | Crear un evento manual, recargar, editarlo, completarlo y eliminarlo | Cada cambio persiste, se audita y se refleja en la vista vigente. El borrado pide confirmación. | |
| 7 | Filtrar por la leyenda/categoría y abrir «+N más» si aparece | Se reduce la visualización sin cambiar la fuente; «+N más» abre el día correspondiente. | |

## Contrato visual aprobado

El usuario autorizó explícitamente el contrato funcional de CAL-01 el 2026-08-12. Calendario se compara ahora contra los tres baselines versionados `calendar-1440x1000-dark.png`, `calendar-1440x1000-light.png` y `calendar-1920x1080-dark.png`, con el mismo umbral protegido de 0,5 %. La matriz final `pnpm test:visual` pasó 30/30; no se modificó el HTML protegido ni se aprobó ningún otro contrato visual.
