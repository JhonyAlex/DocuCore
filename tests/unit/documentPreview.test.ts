import { describe, expect, it } from 'vitest'
import {
  getPreviewKind,
  isExcelMimeType,
  isImageMimeType,
  isPdfMimeType,
  isTextMimeType,
  isViewableMimeType,
} from '../../src/lib/documentPreview'

describe('documentPreview utilities', () => {
  it('identifies Excel MIME types correctly', () => {
    expect(isExcelMimeType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true)
    expect(isExcelMimeType('application/vnd.ms-excel')).toBe(true)
    expect(isExcelMimeType('application/pdf')).toBe(false)
    expect(isExcelMimeType('image/png')).toBe(false)
    expect(isExcelMimeType(null)).toBe(false)
    expect(isExcelMimeType(undefined)).toBe(false)
  })

  it('identifies PDF MIME types correctly', () => {
    expect(isPdfMimeType('application/pdf')).toBe(true)
    expect(isPdfMimeType('application/vnd.ms-excel')).toBe(false)
    expect(isPdfMimeType(null)).toBe(false)
  })

  it('identifies Image MIME types correctly', () => {
    expect(isImageMimeType('image/png')).toBe(true)
    expect(isImageMimeType('image/jpeg')).toBe(true)
    expect(isImageMimeType('image/webp')).toBe(true)
    expect(isImageMimeType('image/gif')).toBe(true)
    expect(isImageMimeType('application/pdf')).toBe(false)
  })

  it('identifies Text MIME types correctly', () => {
    expect(isTextMimeType('text/plain')).toBe(true)
    expect(isTextMimeType('application/pdf')).toBe(false)
  })

  it('identifies viewable documents and preview kinds', () => {
    expect(isViewableMimeType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true)
    expect(isViewableMimeType('application/pdf')).toBe(true)
    expect(isViewableMimeType('image/png')).toBe(true)
    expect(isViewableMimeType('text/plain')).toBe(true)
    expect(isViewableMimeType('application/zip')).toBe(false)
    expect(isViewableMimeType('video/mp4')).toBe(false)

    expect(getPreviewKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('excel')
    expect(getPreviewKind('application/vnd.ms-excel')).toBe('excel')
    expect(getPreviewKind('application/pdf')).toBe('pdf')
    expect(getPreviewKind('image/jpeg')).toBe('image')
    expect(getPreviewKind('text/plain')).toBe('text')
    expect(getPreviewKind('application/octet-stream')).toBe('unsupported')
  })
})
