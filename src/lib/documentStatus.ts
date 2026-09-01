import {
  DOCUMENT_EXPIRY_THRESHOLD_DAYS,
  UPCOMING_THRESHOLD_DAYS,
  type DocumentValidityStatus,
  type AssetDocumentsSummary,
  computeDocumentDaysUntil,
  computeDocumentStatus,
  computeAssetDocumentsSummary,
} from '../../shared/documentStatus'

export {
  DOCUMENT_EXPIRY_THRESHOLD_DAYS,
  UPCOMING_THRESHOLD_DAYS,
  type DocumentValidityStatus,
  type AssetDocumentsSummary,
  computeDocumentDaysUntil,
  computeDocumentStatus,
  computeAssetDocumentsSummary,
}

export interface DocumentStatusStyle {
  label: DocumentValidityStatus
  chipClass: string
  dotClass: string
  bgClass: string
  borderClass: string
  textClass: string
}

export function getDocumentStatusStyle(status: DocumentValidityStatus): DocumentStatusStyle {
  switch (status) {
    case 'Vigente':
      return {
        label: 'Vigente',
        chipClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/60',
        dotClass: 'bg-emerald-500',
        bgClass: 'bg-emerald-50 dark:bg-emerald-950/20',
        borderClass: 'border-emerald-200 dark:border-emerald-800/50',
        textClass: 'text-emerald-700 dark:text-emerald-400',
      }
    case 'Próximo a vencer':
      return {
        label: 'Próximo a vencer',
        chipClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/60',
        dotClass: 'bg-amber-500',
        bgClass: 'bg-amber-50 dark:bg-amber-950/20',
        borderClass: 'border-amber-200 dark:border-amber-800/50',
        textClass: 'text-amber-700 dark:text-amber-400',
      }
    case 'Vencido':
      return {
        label: 'Vencido',
        chipClass: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800/60',
        dotClass: 'bg-red-500',
        bgClass: 'bg-red-50 dark:bg-red-950/20',
        borderClass: 'border-red-200 dark:border-red-800/50',
        textClass: 'text-red-700 dark:text-red-400',
      }
    case 'Sin vencimiento':
    default:
      return {
        label: 'Sin vencimiento',
        chipClass: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
        dotClass: 'bg-slate-400',
        bgClass: 'bg-slate-50 dark:bg-slate-800/50',
        borderClass: 'border-slate-200 dark:border-slate-700',
        textClass: 'text-slate-600 dark:text-slate-400',
      }
  }
}
