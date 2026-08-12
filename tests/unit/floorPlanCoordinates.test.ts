import { describe, expect, it } from 'vitest'
import { clampNormalized, denormalizeImagePoint, normalizeImagePoint } from '../../src/lib/floorPlanCoordinates'
import { createFloorPlanMarkerSchema, createFloorPlanSchema, updateFloorPlanMarkerSchema } from '../../server/lib/validate'

describe('floor plan normalized coordinates', () => {
  it('normalizes and denormalizes independently from the image resolution', () => {
    const point = normalizeImagePoint(500, 250, 1000, 500)
    expect(point).toEqual({ x: 0.5, y: 0.5 })
    expect(denormalizeImagePoint(point, 4000, 2000)).toEqual({ x: 2000, y: 1000 })
  })

  it('clamps external points to the normalized image bounds', () => {
    expect(clampNormalized(-0.1)).toBe(0)
    expect(clampNormalized(1.1)).toBe(1)
    expect(normalizeImagePoint(2500, -20, 1000, 500)).toEqual({ x: 1, y: 0 })
  })
})

describe('floor plan API input validation', () => {
  it('accepts multipart create data and only normalized marker coordinates', () => {
    expect(createFloorPlanSchema.parse({ name: 'Plano producción', projectId: '1', locationId: '2' })).toMatchObject({ projectId: 1, locationId: 2 })
    expect(createFloorPlanMarkerSchema.parse({ assetId: 3, x: 0, y: 1 })).toEqual({ assetId: 3, x: 0, y: 1 })
  })

  it('rejects arbitrary URLs, out-of-range coordinates and empty marker updates', () => {
    expect(() => createFloorPlanSchema.parse({ name: 'Plano', projectId: 1, locationId: 2, imageUrl: 'https://externo.invalid/plano.png' })).toThrow()
    expect(() => createFloorPlanMarkerSchema.parse({ assetId: 3, x: 1.01, y: 0.5 })).toThrow()
    expect(() => updateFloorPlanMarkerSchema.parse({})).toThrow()
  })
})
