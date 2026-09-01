/**
 * Shared domain logic for document validity and expiration thresholds across DocuCore.
 * This is the SINGLE SOURCE OF TRUTH for:
 * - Validity status types: 'Vigente' | 'Próximo a vencer' | 'Vencido' | 'Sin vencimiento'
 * - Threshold days for upcoming expirations: 30 days
 * - Date calculation algorithms
 */

export const DOCUMENT_EXPIRY_THRESHOLD_DAYS = 30
export const UPCOMING_THRESHOLD_DAYS = 30

export type DocumentValidityStatus = 'Vigente' | 'Próximo a vencer' | 'Vencido' | 'Sin vencimiento'

export function computeDocumentDaysUntil(
  expiryDate: Date | string | null | undefined,
  now?: Date,
): number | null {
  if (!expiryDate) return null
  const exp = typeof expiryDate === 'string' ? new Date(expiryDate) : expiryDate
  if (Number.isNaN(exp.getTime())) return null

  const current = now ?? new Date()
  const expUtc = Date.UTC(exp.getUTCFullYear(), exp.getUTCMonth(), exp.getUTCDate())
  const nowUtc = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate())
  return Math.floor((expUtc - nowUtc) / 86_400_000)
}

export function computeDocumentStatus(
  expiryDate: Date | string | null | undefined,
  now?: Date,
): DocumentValidityStatus {
  const days = computeDocumentDaysUntil(expiryDate, now)
  if (days === null) return 'Sin vencimiento'
  if (days < 0) return 'Vencido'
  if (days <= DOCUMENT_EXPIRY_THRESHOLD_DAYS) return 'Próximo a vencer'
  return 'Vigente'
}

export interface AssetDocumentsSummary {
  total: number
  vigentes: number
  proximos: number
  vencidos: number
  sinVencimiento: number
  summaryText: string
}

export function computeAssetDocumentsSummary(
  documents: Array<{ status?: DocumentValidityStatus; currentVersion?: { expiryDate?: string | Date | null } | null }> = [],
  now?: Date,
): AssetDocumentsSummary {
  let vigentes = 0
  let proximos = 0
  let vencidos = 0
  let sinVencimiento = 0

  for (const doc of documents) {
    const status: DocumentValidityStatus = doc.status ?? computeDocumentStatus(doc.currentVersion?.expiryDate, now)
    if (status === 'Vigente') vigentes++
    else if (status === 'Próximo a vencer') proximos++
    else if (status === 'Vencido') vencidos++
    else sinVencimiento++
  }

  const parts: string[] = []
  if (vigentes > 0) parts.push(`${vigentes} vigente${vigentes > 1 ? 's' : ''}`)
  if (proximos > 0) parts.push(`${proximos} próxima${proximos > 1 ? 's' : ''} a vencer`)
  if (vencidos > 0) parts.push(`${vencidos} vencida${vencidos > 1 ? 's' : ''}`)
  if (sinVencimiento > 0 && parts.length === 0) parts.push(`${sinVencimiento} sin vencimiento`)

  const summaryText = parts.length > 0 ? parts.join(' · ') : 'Sin documentos registrados'

  return {
    total: documents.length,
    vigentes,
    proximos,
    vencidos,
    sinVencimiento,
    summaryText,
  }
}
