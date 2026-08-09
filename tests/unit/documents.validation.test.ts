import { describe, expect, it } from 'vitest'
import { createDocumentMetadataSchema, documentListQuerySchema, updateDocumentMetadataSchema } from '../../server/lib/validate'

describe('document list query schema', () => {
  it('accepts itemId=null to filter documents without an asset', () => {
    const parsed = documentListQuerySchema.parse({ itemId: 'null', page: 1, limit: 20 })

    expect(parsed.itemId).toBeNull()
  })

  it('accepts itemId=null as a raw null value', () => {
    const parsed = documentListQuerySchema.parse({ itemId: null, page: 1, limit: 20 })

    expect(parsed.itemId).toBeNull()
  })

  it('parses a positive numeric itemId', () => {
    const parsed = documentListQuerySchema.parse({ itemId: '7', page: 1, limit: 20 })

    expect(parsed.itemId).toBe(7)
  })

  it('treats an empty itemId as undefined (no filter)', () => {
    const parsed = documentListQuerySchema.parse({ itemId: '', page: 1, limit: 20 })

    expect(parsed.itemId).toBeUndefined()
  })

  it('rejects a non-numeric itemId', () => {
    expect(() => documentListQuerySchema.parse({ itemId: 'abc', page: 1, limit: 20 })).toThrow()
  })
})

describe('document metadata schemas', () => {
  it('allows detaching all assets through updateDocumentMetadataSchema', () => {
    const parsed = updateDocumentMetadataSchema.parse({ itemIds: null })

    expect(parsed.itemIds).toBeNull()
  })

  it('accepts an empty itemIds as null when updating', () => {
    const parsed = updateDocumentMetadataSchema.parse({ itemIds: '' })

    expect(parsed.itemIds).toBeNull()
  })

  it('treats an empty itemIds array as null when updating', () => {
    const parsed = updateDocumentMetadataSchema.parse({ itemIds: [] })

    expect(parsed.itemIds).toBeNull()
  })

  it('accepts a list of item ids when updating', () => {
    const parsed = updateDocumentMetadataSchema.parse({ itemIds: [2, 5] })

    expect(parsed.itemIds).toEqual([2, 5])
  })

  it('parses a JSON string itemIds when updating (multipart compatible)', () => {
    const parsed = updateDocumentMetadataSchema.parse({ itemIds: '[2,5]' })

    expect(parsed.itemIds).toEqual([2, 5])
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

  it('rejects a non-numeric itemIds list', () => {
    expect(() => updateDocumentMetadataSchema.parse({ itemIds: 'abc' })).toThrow()
  })

  it('rejects a non-positive item id', () => {
    expect(() => updateDocumentMetadataSchema.parse({ itemIds: [0] })).toThrow()
  })

  it('accepts a JSON string itemIds when creating a document', () => {
    const parsed = createDocumentMetadataSchema.parse({
      name: 'X', type: 'Manual', projectId: 1, itemIds: '[2,5]', issueDate: '2026-08-01',
    })

    expect(parsed.itemIds).toEqual([2, 5])
  })

  it('accepts a list of item ids when creating a document', () => {
    const parsed = createDocumentMetadataSchema.parse({
      name: 'X', type: 'Manual', projectId: 1, itemIds: [2, 5], issueDate: '2026-08-01',
    })

    expect(parsed.itemIds).toEqual([2, 5])
  })

  it('rejects createDocumentMetadataSchema with a non-numeric itemIds', () => {
    expect(() => createDocumentMetadataSchema.parse({
      name: 'X', type: 'Manual', projectId: 1, itemIds: 'abc', issueDate: '2026-08-01',
    })).toThrow()
  })
})
