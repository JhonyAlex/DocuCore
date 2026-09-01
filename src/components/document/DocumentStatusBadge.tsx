import { getDocumentStatusStyle, type DocumentValidityStatus } from '@/lib/documentStatus'

interface DocumentStatusBadgeProps {
  status: DocumentValidityStatus
  className?: string
}

export default function DocumentStatusBadge({ status, className = '' }: DocumentStatusBadgeProps) {
  const style = getDocumentStatusStyle(status)
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${style.chipClass} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${style.dotClass}`} aria-hidden="true" />
      <span>{style.label}</span>
    </span>
  )
}
