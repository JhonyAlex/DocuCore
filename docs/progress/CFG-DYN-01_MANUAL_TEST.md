# CFG-DYN-01 — Validación manual de campos dinámicos

Fecha: ____ / ____ / ______

Validador: ______________________________
Entorno/URL: _____________________________

## Preparación

1. Ejecutar `pnpm db:seed`.
2. Iniciar DocuCore con `docker compose up --build -d` o `pnpm dev` + `pnpm server`.
3. Entrar en **Configuración → Campos dinámicos**.

## Checklist editable

| # | Prueba | Resultado esperado | Resultado observado | Incidencia / mejora |
|---|---|---|---|---|
| 1 | Abrir la tarjeta «Campos dinámicos» | Navega a la gestión del proyecto y muestra 24 definiciones | | |
| 2 | Crear un campo de texto para Máquina | Aparece en la tabla y en «Características» de activos Máquina | | |
| 3 | Crear un número con unidad, mínimo, máximo y decimales | El control muestra la unidad y rechaza valores fuera de rango | | |
| 4 | Crear una selección única | Las opciones configuradas aparecen y persisten al recargar | | |
| 5 | Crear una selección múltiple | Permite marcar varias opciones y conserva todas | | |
| 6 | Crear un campo Sí/No | Permite guardar Sí, No y vacío si no es obligatorio | | |
| 7 | Crear una fecha sin periodicidad | La fecha aparece en Características y en Eventos del activo | | |
| 8 | Crear fecha trimestral «Según calendario» | Al completar 15/09 calcula 15/12 independientemente de la fecha de realización | | |
| 9 | Crear fecha mensual «Según realización» | Calcula la siguiente fecha desde la fecha efectiva indicada | | |
| 10 | Editar manualmente una fecha calculada | Se respeta el valor y el evento se actualiza | | |
| 11 | Abrir un activo y editar Características | Guarda los valores reales sin cerrar accidentalmente la ficha | | |
| 12 | Crear un activo nuevo | Carga los campos del tipo seleccionado y exige los obligatorios | | |
| 13 | Duplicar un activo | Copia características no fechadas y deja vacías las fechas dinámicas | | |
| 14 | Aplicar un campo a varios tipos | Se muestra en todos los tipos seleccionados y no en los demás | | |
| 15 | Intentar cambiar el tipo de un campo usado | La API/UI bloquea la operación con un mensaje comprensible | | |
| 16 | Intentar retirar una opción utilizada | La operación se bloquea y conserva los valores existentes | | |
| 17 | Archivar un campo | Desaparece de los activos, pero sus valores y auditoría se conservan | | |
| 18 | Revisar modo claro, oscuro y 1440×1000 | No hay recortes, solapes ni menús fuera del viewport | | |
| 19 | Pulsar Escape en desplegables y diálogos | Cierra solo la capa superior | | |
| 20 | Recargar navegador y reabrir el activo | Definiciones, valores, periodicidad y próximo evento persisten | | |

## Resultado final

- [ ] Aceptado
- [ ] Aceptado con mejoras
- [ ] Rechazado

Resumen de incidencias:

______________________________________________________________________________
______________________________________________________________________________

Mejoras propuestas:

______________________________________________________________________________
______________________________________________________________________________
