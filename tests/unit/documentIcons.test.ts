import { describe, expect, it } from 'vitest'
import { resolveDocumentIconKey } from '../../src/lib/documentIconRegistry'
import { documentIconDefinitions, DEFAULT_DOCUMENT_ICON_KEY } from '../../shared/documentIconCatalog'

describe('document icon catalog', () => {
  it('maintains a comprehensive, unique document icon catalog with categorization', () => {
    expect(documentIconDefinitions.length).toBeGreaterThanOrEqual(25)
    expect(new Set(documentIconDefinitions.map((icon) => icon.key)).size).toBe(documentIconDefinitions.length)
    expect(new Set(documentIconDefinitions.map((icon) => icon.group)).size).toBeGreaterThanOrEqual(5)
  })

  it('resolves unknown or missing keys to DEFAULT_DOCUMENT_ICON_KEY', () => {
    expect(resolveDocumentIconKey('unknown-icon-key')).toBe(DEFAULT_DOCUMENT_ICON_KEY)
    expect(resolveDocumentIconKey(null)).toBe(DEFAULT_DOCUMENT_ICON_KEY)
    expect(resolveDocumentIconKey(undefined)).toBe(DEFAULT_DOCUMENT_ICON_KEY)
    expect(resolveDocumentIconKey('file-signature')).toBe('file-signature')
    expect(resolveDocumentIconKey('badge-check')).toBe('badge-check')
  })
})
