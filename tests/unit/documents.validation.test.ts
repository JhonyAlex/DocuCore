import { describe, expect, it } from 'vitest'
import { createDocumentMetadataSchema, documentListQuerySchema, updateDocumentMetadataSchema } from '../../server/lib/validate'

describe('document list query schema', () => {
  it('accepts assetId=null to filter documents without an asset', () => {
    const parsed = documentListQuerySchema.parse({ assetId: 'null', page: 1, limit: 20 })

    expect(parsed.assetId).toBeNull()
  })

  it('accepts assetId=null as a raw null value', () => {
    const parsed = documentListQuerySchema.parse({ assetId: null, page: 1, limit: 20 })

    expect(parsed.assetId).toBeNull()
  })

  it('parses a positive numeric assetId', () => {
    const parsed = documentListQuerySchema.parse({ assetId: '7', page: 1, limit: 20 })

    expect(parsed.assetId).toBe(7)
  })

  it('treats an empty assetId as undefined (no filter)', () => {
    const parsed = documentListQuerySchema.parse({ assetId: '', page: 1, limit: 20 })

    expect(parsed.assetId).toBeUndefined()
  })

  it('rejects a non-numeric assetId', () => {
    expect(() => documentListQuerySchema.parse({ assetId: 'abc', page: 1, limit: 20 })).toThrow()
  })
})

describe('document metadata schemas', () => {
  it('allows detaching all assets through updateDocumentMetadataSchema', () => {
    const parsed = updateDocumentMetadataSchema.parse({ assetIds: null })

    expect(parsed.assetIds).toBeNull()
  })

  it('accepts an empty assetIds as null when updating', () => {
    const parsed = updateDocumentMetadataSchema.parse({ assetIds: '' })

    expect(parsed.assetIds).toBeNull()
  })

  it('treats an empty assetIds array as null when updating', () => {
    const parsed = updateDocumentMetadataSchema.parse({ assetIds: [] })

    expect(parsed.assetIds).toBeNull()
  })

  it('accepts a list of asset ids when updating', () => {
    const parsed = updateDocumentMetadataSchema.parse({ assetIds: [2, 5] })

    expect(parsed.assetIds).toEqual([2, 5])
  })

  it('parses a JSON string assetIds when updating (multipart compatible)', () => {
    const parsed = updateDocumentMetadataSchema.parse({ assetIds: '[2,5]' })

    expect(parsed.assetIds).toEqual([2, 5])
  })

  it('accepts current-version dates when updating document metadata', () => {
    const parsed = updateDocumentMetadataSchema.parse({ issueDate: '2026-08-01', expiryDate: '2026-12-31' })

    expect(parsed).toMatchObject({ issueDate: '2026-08-01', expiryDate: '2026-12-31' })
  })

  it('accepts null to clear the current expiry date', () => {
    const parsed = updateDocumentMetadataSchema.parse({ expiryDate: null })

    expect(parsed.expiryDate).toBeNull()
  })

  it('rejects an invalid current-version expiry date', () => {
    expect(() => updateDocumentMetadataSchema.parse({ expiryDate: '31/12/2026' })).toThrow()
  })

  it('rejects a non-numeric assetIds list', () => {
    expect(() => updateDocumentMetadataSchema.parse({ assetIds: 'abc' })).toThrow()
  })

  it('rejects a non-positive asset id', () => {
    expect(() => updateDocumentMetadataSchema.parse({ assetIds: [0] })).toThrow()
  })

  it('accepts a JSON string assetIds when creating a document', () => {
    const parsed = createDocumentMetadataSchema.parse({
      name: 'X', type: 'Manual', projectId: 1, assetIds: '[2,5]', issueDate: '2026-08-01',
    })

    expect(parsed.assetIds).toEqual([2, 5])
  })

  it('accepts a list of asset ids when creating a document', () => {
    const parsed = createDocumentMetadataSchema.parse({
      name: 'X', type: 'Manual', projectId: 1, assetIds: [2, 5], issueDate: '2026-08-01',
    })

    expect(parsed.assetIds).toEqual([2, 5])
  })

  it('rejects createDocumentMetadataSchema with a non-numeric assetIds', () => {
    expect(() => createDocumentMetadataSchema.parse({
      name: 'X', type: 'Manual', projectId: 1, assetIds: 'abc', issueDate: '2026-08-01',
    })).toThrow()
  })
})
