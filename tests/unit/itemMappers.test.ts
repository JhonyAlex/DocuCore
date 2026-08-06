import { describe, expect, it } from 'vitest'
import type { ApiItem } from '@/lib/api'
import { mapApiItemToDisplay } from '@/lib/itemMappers'

function apiItem(overrides: Partial<ApiItem>): ApiItem {
  return {
    id: 1,
    code: 'CNC-05',
    name: 'Torno CNC Haas ST-20',
    serialNumber: 'HA20-2024-8821',
    serialLabel: 'SN: HA20-2024-8821',
    installDate: '2024-02-04T00:00:00.000Z',
    typeId: 1,
    statusId: 1,
    location: 'Planta 1 · Nave A',
    projectId: 1,
    responsibleId: 2,
    initials: 'CN',
    nextEventLabel: 'Mant. preventivo',
    nextEventDate: '05/08/2026 · 21d',
    nextEventUrgency: 'amber',
    type: { id: 1, name: 'Máquina' },
    status: { id: 1, name: 'Activo', pulseDot: null },
    responsible: { id: 2, name: 'J. Ramírez', initials: 'JR', color: 'emerald' },
    ...overrides,
  }
}

describe('mapApiItemToDisplay', () => {
  it('maps the canonical machine item to the approved Items UI tokens', () => {
    expect(mapApiItemToDisplay(apiItem({}))).toMatchObject({
      typeChipClass: 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300',
      statusChipClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      pulseDot: undefined,
      initialsBgClass: 'bg-brand-50 dark:bg-brand-900/30 text-brand-600',
      responsibleColor: 'bg-emerald-500',
      installDate: '04/02/2024',
    })
  })

  it('uses the status color for initials and pulse rendering when an item is under review', () => {
    const display = mapApiItemToDisplay(apiItem({
      type: { id: 5, name: 'Instrumento' },
      status: { id: 2, name: 'En revisión', pulseDot: null },
      responsible: { id: 4, name: 'L. Torres', initials: 'LT', color: 'brand' },
    }))

    expect(display).toMatchObject({
      typeChipClass: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
      statusChipClass: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      initialsBgClass: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600',
      responsibleColor: 'bg-brand-500',
      pulseDot: undefined,
    })
  })

  it('preserves red status chips and pulse dots for decommissioned and expired assets', () => {
    const decommissioned = mapApiItemToDisplay(apiItem({
      status: { id: 3, name: 'Fuera de servicio', pulseDot: 'red' },
      responsible: { id: 3, name: 'A. Gómez', initials: 'AG', color: 'amber' },
    }))
    const expired = mapApiItemToDisplay(apiItem({
      type: { id: 3, name: 'Vehículo' },
      status: { id: 4, name: 'Vencido', pulseDot: 'red' },
    }))

    expect(decommissioned).toMatchObject({
      statusChipClass: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      initialsBgClass: 'bg-red-50 dark:bg-red-900/30 text-red-600',
      responsibleColor: 'bg-amber-500',
      pulseDot: 'red',
    })
    expect(expired).toMatchObject({
      typeChipClass: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
      statusChipClass: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      pulseDot: 'red',
    })
  })

  it('leaves unknown API display tokens empty instead of inventing a visual class', () => {
    const display = mapApiItemToDisplay(apiItem({
      type: { id: 99, name: 'Desconocido' },
      status: { id: 99, name: 'Pendiente', pulseDot: null },
      responsible: { id: 99, name: 'Persona', initials: 'PP', color: 'pink' },
      installDate: 'invalid-date',
    }))

    expect(display).toMatchObject({
      typeChipClass: '',
      statusChipClass: '',
      initialsBgClass: '',
      responsibleColor: '',
      installDate: 'invalid-date',
    })
  })
})
