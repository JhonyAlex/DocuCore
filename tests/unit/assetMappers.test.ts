import { describe, expect, it } from 'vitest'
import type { ApiAsset, ApiLocationAsset } from '@/lib/api'
import { mapApiAssetToDisplay, mapApiLocationAssetToDisplay } from '@/lib/assetMappers'

function apiAsset(overrides: Partial<ApiAsset>): ApiAsset {
  return {
    id: 1,
    code: 'CNC-05',
    name: 'Torno CNC Haas ST-20',
    serialNumber: 'HA20-2024-8821',
    installDate: '2024-02-04T00:00:00.000Z',
    typeId: 1,
    statusId: 1,
    locationId: 2,
    projectId: 1,
    responsibleId: 2,
    initials: 'CN',
    nextEvents: [{
      id: 'event:1',
      title: 'Mant. preventivo',
      date: '2026-08-27T00:00:00.000Z',
      daysUntil: 21,
      urgency: 'amber',
      source: 'event',
      sourceLabel: 'Recurrente cada 3 meses',
    }],
    documentCount: 1,
    eventCount: 2,
    type: { id: 1, name: 'Máquina' },
    status: { id: 1, name: 'Activo', pulseDot: null },
    location: { id: 2, name: 'Planta 1 · Nave A', code: 'PIN-NA-01A', label: 'Planta 1 · Nave A' },
    responsible: { id: 2, name: 'J. Ramírez', initials: 'JR', color: 'emerald' },
    ...overrides,
  }
}

describe('mapApiAssetToDisplay', () => {
  it('maps the canonical machine asset to the approved Assets UI tokens', () => {
    expect(mapApiAssetToDisplay(apiAsset({}))).toMatchObject({
      typeChipClass: 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300',
      statusChipClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      pulseDot: undefined,
      initialsBgClass: 'bg-brand-50 dark:bg-brand-900/30 text-brand-600',
      responsibleColor: 'bg-emerald-500',
      location: 'Planta 1 · Nave A',
      installDate: '04/02/2024',
      serialLabel: 'SN: HA20-2024-8821',
      nextEvent: {
        id: 'event:1',
        label: 'Mant. preventivo',
        date: '27/08/2026 · 21d',
        urgency: 'amber',
        source: 'event',
        sourceLabel: 'Recurrente cada 3 meses',
      },
    })
  })

  it('derives the serial presentation from the asset type without storing a separate label', () => {
    expect(mapApiAssetToDisplay(apiAsset({ type: { id: 2, name: 'Extintor' }, serialNumber: 'EXT-2026-01' })).serialLabel).toBe('Lote: EXT-2026-01')
    expect(mapApiAssetToDisplay(apiAsset({ type: { id: 3, name: 'Vehículo' }, serialNumber: '1234 ABC' })).serialLabel).toBe('Mat: 1234 ABC')
  })

  it('uses the status color for initials and pulse rendering when an asset is under review', () => {
    const display = mapApiAssetToDisplay(apiAsset({
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
    const decommissioned = mapApiAssetToDisplay(apiAsset({
      status: { id: 3, name: 'Fuera de servicio', pulseDot: 'red' },
      responsible: { id: 3, name: 'A. Gómez', initials: 'AG', color: 'amber' },
    }))
    const expired = mapApiAssetToDisplay(apiAsset({
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
    const display = mapApiAssetToDisplay(apiAsset({
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

  it('shows no invented upcoming event when an asset has no dated relations', () => {
    expect(mapApiAssetToDisplay(apiAsset({ nextEvents: [], eventCount: 0, documentCount: 0 })).nextEvent).toBeNull()
  })

  it('renders the trash date label only for deleted assets', () => {
    expect(mapApiAssetToDisplay(apiAsset({})).deletedLabel).toBeUndefined()
    expect(mapApiAssetToDisplay(apiAsset({ deletedAt: '2026-08-09T10:00:00.000Z' })).deletedLabel).toBe('Eliminado el 09/08/2026')
  })
})

function locationAsset(overrides: Partial<ApiLocationAsset>): ApiLocationAsset {
  return {
    id: 1,
    code: 'CNC-05',
    name: 'Torno CNC Haas ST-20',
    installDate: '2024-02-04T00:00:00.000Z',
    initials: 'CN',
    type: { id: 1, name: 'Máquina' },
    status: { id: 1, name: 'Activo', pulseDot: null },
    ...overrides,
  }
}

describe('mapApiLocationAssetToDisplay', () => {
  it('uses the type color for the avatar, matching the reference location list', () => {
    expect(mapApiLocationAssetToDisplay(locationAsset({}))).toEqual({
      id: 1,
      code: 'CNC-05',
      name: 'Torno CNC Haas ST-20',
      installedDate: '04/02/2024',
      initials: 'CN',
      initialsBgClass: 'bg-brand-50 dark:bg-brand-900/30 text-brand-600',
      statusLabel: 'Activo',
      statusChipClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    })
  })

  it('keeps the type color for the avatar even when the asset is under review', () => {
    const asset = mapApiLocationAssetToDisplay(locationAsset({
      code: 'BSC-11',
      name: 'Báscula industrial',
      installDate: '2025-09-10T00:00:00.000Z',
      initials: 'BA',
      type: { id: 5, name: 'Instrumento' },
      status: { id: 2, name: 'En revisión', pulseDot: null },
    }))

    expect(asset.initialsBgClass).toBe('bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600')
    expect(asset.statusLabel).toBe('En revisión')
    expect(asset.statusChipClass).toBe('bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300')
  })

  it('leaves unknown tokens empty instead of inventing a visual class', () => {
    const asset = mapApiLocationAssetToDisplay(locationAsset({
      type: { id: 99, name: 'Desconocido' },
      status: { id: 99, name: 'Pendiente', pulseDot: null },
    }))

    expect(asset.initialsBgClass).toBe('')
    expect(asset.statusChipClass).toBe('')
  })
})
