import { describe, expect, it } from 'vitest'
import { filterFloorPlanAssets, floorPlanAlert, floorPlanEventOrigin, lodForZoom } from '../../src/lib/floorPlanPresentation'
import type { ApiFloorPlanAsset } from '../../src/lib/api'

const asset = (id: number, urgency: 'red' | 'amber' | 'slate' = 'slate', statusId = 1): ApiFloorPlanAsset => ({ id, code: `A-${id}`, name: `Activo ${id}`, locationId: 1, type: { id, name: `Tipo ${id}` }, status: { id: statusId, name: 'Activo', pulseDot: null }, nextEvents: urgency === 'slate' ? [] : [{ id: 'x', title: 'Prueba', date: '2026-08-12T00:00:00.000Z', daysUntil: urgency === 'red' ? -1 : 5, urgency, source: 'event', sourceLabel: 'Evento' }] })

describe('floor plan presentation', () => {
  it('derives severity exclusively from the server event urgency', () => { expect(floorPlanAlert(asset(1, 'red'))).toBe('overdue'); expect(floorPlanAlert(asset(2, 'amber'))).toBe('soon'); expect(floorPlanAlert(asset(3))).toBe('normal') })
  it('uses compact, name and detailed marker LODs', () => { expect(lodForZoom(1)).toBe('dot'); expect(lodForZoom(1.5)).toBe('code'); expect(lodForZoom(3)).toBe('detail') })
  it('labels the event origin independently from its source detail', () => { expect(floorPlanEventOrigin('preventive')).toBe('Preventivo'); expect(floorPlanEventOrigin('dynamic-date')).toBe('Fecha dinámica') })
  it('filters the location asset list by search, type, operational status and alert', () => { expect(filterFloorPlanAssets([asset(1, 'red'), asset(2, 'amber', 2)], { search: 'a-2', typeIds: new Set([2]), statusIds: new Set([2]), alert: 'soon' })).toHaveLength(1) })
})
