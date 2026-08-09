import { describe, expect, it } from 'vitest'
import { createLocationSchema, updateLocationSchema } from '../../server/lib/validate'

const validLocation = {
  name: 'Planta 1 · Nave A',
  code: 'PIN-NA-01A',
  surface: '840 m²',
  parentId: null,
  responsibleId: 2,
  projectId: 1,
}

describe('createLocationSchema', () => {
  it('accepts a root location with parentId null', () => {
    expect(createLocationSchema.parse(validLocation)).toMatchObject({ parentId: null, responsibleId: 2 })
  })

  it('accepts a child location with a positive parentId', () => {
    expect(createLocationSchema.parse({ ...validLocation, parentId: 7 }).parentId).toBe(7)
  })

  it('rejects an empty name', () => {
    expect(() => createLocationSchema.parse({ ...validLocation, name: '   ' })).toThrow()
  })

  it('rejects a non-positive responsibleId', () => {
    expect(() => createLocationSchema.parse({ ...validLocation, responsibleId: 0 })).toThrow()
  })

  it('rejects unknown fields to keep derived data server-side', () => {
    expect(() => createLocationSchema.parse({ ...validLocation, itemCount: 42 })).toThrow()
  })
})

describe('updateLocationSchema', () => {
  it('accepts a partial update with only the surface', () => {
    expect(updateLocationSchema.parse({ surface: '900 m²' })).toEqual({ surface: '900 m²' })
  })

  it('accepts clearing the parent through parentId null', () => {
    expect(updateLocationSchema.parse({ parentId: null }).parentId).toBeNull()
  })

  it('accepts an empty payload as a no-op update', () => {
    expect(updateLocationSchema.parse({})).toEqual({})
  })
})
