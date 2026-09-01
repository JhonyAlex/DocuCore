export {
  DOCUMENT_EXPIRY_THRESHOLD_DAYS,
  UPCOMING_THRESHOLD_DAYS,
  type DocumentValidityStatus,
  type AssetDocumentsSummary,
  computeDocumentDaysUntil,
  computeDocumentStatus,
  computeAssetDocumentsSummary,
} from '../../shared/documentStatus'

export function nowClock(): Date {
  const configured = process.env.DOCUCORE_NOW ? new Date(process.env.DOCUCORE_NOW) : null
  return configured && !Number.isNaN(configured.getTime()) ? configured : new Date()
}
