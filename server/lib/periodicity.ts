// DOC-03: periodicidad de documentos basada en el vencimiento. Cuando un
// documento tiene periodicidad, el vencimiento de cada nueva versión se
// calcula automáticamente según el modo:
//   - 'Calendario': salta desde el vencimiento vigente (o la emisión si no hay).
//   - 'Subida': salta desde la emisión de la nueva versión (por defecto hoy).
// La misma lógica vive en src/lib/periodicity.ts (el frontend precalcula el
// campo editable); el servidor es la fuente autoritativa cuando no llega fecha.

// Compartida por documentos, fechas configurables de activos y preventivos.
// Las unidades cortas se calculan por días UTC y las mensuales conservan el
// día de mes (con clamp al último día cuando sea necesario).
export const PERIODICITIES = ['Diaria', 'Semanal', 'Quincenal', 'Mensual', 'Bimestral', 'Trimestral', 'Cuatrimestral', 'Semestral', 'Anual', 'Cada 2 años', 'Cada 3 años', 'Cada 4 años', 'Cada 5 años', 'Cada 10 años'] as const
export type DocumentPeriodicity = (typeof PERIODICITIES)[number]

export const PERIODICITY_MODES = ['Calendario', 'Subida'] as const
export type DocumentPeriodicityMode = (typeof PERIODICITY_MODES)[number]

const PERIODICITY_MONTHS: Record<DocumentPeriodicity, number> = {
  Diaria: 0,
  Semanal: 0,
  Quincenal: 0,
  Mensual: 1,
  Bimestral: 2,
  Trimestral: 3,
  Cuatrimestral: 4,
  Semestral: 6,
  Anual: 12,
  'Cada 2 años': 24,
  'Cada 3 años': 36,
  'Cada 4 años': 48,
  'Cada 5 años': 60,
  'Cada 10 años': 120,
}

const PERIODICITY_DAYS: Partial<Record<DocumentPeriodicity, number>> = {
  Diaria: 1,
  Semanal: 7,
  Quincenal: 15,
}

export function periodicityMonths(periodicity: DocumentPeriodicity): number {
  return PERIODICITY_MONTHS[periodicity]
}

export function addDaysUtc(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days))
}

// Suma meses a una fecha UTC conservando el día del mes; si el día no existe en
// el mes destino (p. ej. 31/01 + 1 mes), se ajusta al último día del mes.
export function addMonthsClamped(date: Date, months: number): Date {
  const target = new Date(date.getTime())
  const targetYear = target.getUTCFullYear() + Math.floor((target.getUTCMonth() + months) / 12)
  const targetMonth = (target.getUTCMonth() + months) % 12
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(target.getUTCDate(), lastDay)))
}

// Calcula el próximo vencimiento según la periodicidad y su modo.
// previousExpiry: vencimiento de la versión vigente (null si no hay).
// issueDate: emisión de la nueva versión.
export function calculateNextExpiry(
  previousExpiry: Date | null,
  issueDate: Date,
  mode: DocumentPeriodicityMode,
  periodicity: DocumentPeriodicity,
): Date {
  const base = mode === 'Calendario' ? (previousExpiry ?? issueDate) : issueDate
  const days = PERIODICITY_DAYS[periodicity]
  return days ? addDaysUtc(base, days) : addMonthsClamped(base, PERIODICITY_MONTHS[periodicity])
}
