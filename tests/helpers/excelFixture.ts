import { utils, write } from 'xlsx'

export function createSampleWorkbookBuffer(): Buffer {
  const wb = utils.book_new()

  // Hoja 1: Inventario con título combinado, números, textos, porcentajes y celdas vacías
  const ws1Data = [
    ['Resumen de Equipos y Calibración', '', '', ''],
    ['Código', 'Descripción', 'Unidades', 'Estado'],
    ['MG-203', 'Manómetro digital', 5, 'Operativo'],
    ['EXT-A12', 'Extintor CO2', 12, 'Revisado'],
    ['CNC-05', '', 2, 'En espera'],
    ['Total', 'Porcentaje revisado', 19, '85%'],
  ]
  const ws1 = utils.aoa_to_sheet(ws1Data)
  ws1['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, // A1:D1
  ]
  utils.book_append_sheet(wb, ws1, 'Inventario')

  // Hoja 2: Mantenimiento con fechas y tareas
  const ws2Data = [
    ['Fecha', 'Tarea', 'Responsable', 'Coste'],
    ['15/07/2026', 'Calibración anual', 'Juan Pérez', '150 €'],
    ['20/07/2026', 'Inspección', 'María López', '80 €'],
  ]
  const ws2 = utils.aoa_to_sheet(ws2Data)
  utils.book_append_sheet(wb, ws2, 'Mantenimiento')

  const arrayBuffer = write(wb, { type: 'buffer', bookType: 'xlsx' })
  return Buffer.from(arrayBuffer)
}
