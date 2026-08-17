import { DEFAULT_DOCUMENT_ICON_KEY, isDocumentIconKey, type DocumentIconKey } from '../../shared/documentIconCatalog'

export function resolveDocumentIconKey(iconKey: string | null | undefined): DocumentIconKey {
  return isDocumentIconKey(iconKey) ? iconKey : DEFAULT_DOCUMENT_ICON_KEY
}
