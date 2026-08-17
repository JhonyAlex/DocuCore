import { describe, expect, it } from 'vitest'
import { assetSortBySchema, documentListQuerySchema, documentSortBySchema, sortOrderSchema } from '../../server/lib/validate'

describe('sorting validation schemas', () => {
  it('validates sortOrderSchema', () => {
    expect(sortOrderSchema.safeParse('asc').success).toBe(true)
    expect(sortOrderSchema.safeParse('desc').success).toBe(true)
    expect(sortOrderSchema.safeParse('ascending').success).toBe(false)
    expect(sortOrderSchema.safeParse('').success).toBe(false)
  })

  it('validates assetSortBySchema', () => {
    const validFields = ['code', 'name', 'type', 'location', 'status', 'nextEvent', 'deletedAt', 'responsible', 'installDate', 'id']
    for (const field of validFields) {
      expect(assetSortBySchema.safeParse(field).success).toBe(true)
    }
    expect(assetSortBySchema.safeParse('unknownField').success).toBe(false)
    expect(assetSortBySchema.safeParse('').success).toBe(false)
  })

  it('validates documentSortBySchema', () => {
    const validFields = ['name', 'assets', 'type', 'version', 'issueDate', 'expiryDate', 'periodicity', 'status', 'updatedAt', 'createdAt']
    for (const field of validFields) {
      expect(documentSortBySchema.safeParse(field).success).toBe(true)
    }
    expect(documentSortBySchema.safeParse('unknownDocField').success).toBe(false)
  })

  it('validates documentListQuerySchema with sortBy and sortOrder', () => {
    const validQuery = {
      page: '1',
      limit: '10',
      sortBy: 'name',
      sortOrder: 'asc',
    }
    const result = documentListQuerySchema.safeParse(validQuery)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sortBy).toBe('name')
      expect(result.data.sortOrder).toBe('asc')
    }

    const invalidSortQuery = {
      sortBy: 'invalidField',
    }
    expect(documentListQuerySchema.safeParse(invalidSortQuery).success).toBe(false)
  })
})
