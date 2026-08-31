export const EXCEL_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
])

export const PDF_MIME_TYPES = new Set([
  'application/pdf',
])

export const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

export const TEXT_MIME_TYPES = new Set([
  'text/plain',
])

export type PreviewKind = 'pdf' | 'excel' | 'image' | 'text' | 'unsupported'

export function isExcelMimeType(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false
  return EXCEL_MIME_TYPES.has(mimeType)
}

export function isPdfMimeType(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false
  return PDF_MIME_TYPES.has(mimeType)
}

export function isImageMimeType(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false
  return IMAGE_MIME_TYPES.has(mimeType) || mimeType.startsWith('image/')
}

export function isTextMimeType(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false
  return TEXT_MIME_TYPES.has(mimeType) || mimeType.startsWith('text/')
}

export function isViewableMimeType(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false
  return isPdfMimeType(mimeType) || isExcelMimeType(mimeType) || isImageMimeType(mimeType) || isTextMimeType(mimeType)
}

export function getPreviewKind(mimeType: string | null | undefined): PreviewKind {
  if (!mimeType) return 'unsupported'
  if (isPdfMimeType(mimeType)) return 'pdf'
  if (isExcelMimeType(mimeType)) return 'excel'
  if (isImageMimeType(mimeType)) return 'image'
  if (isTextMimeType(mimeType)) return 'text'
  return 'unsupported'
}
