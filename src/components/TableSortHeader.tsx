interface TableSortHeaderProps {
  label: string
  field: string
  currentSortBy?: string
  currentSortOrder?: 'asc' | 'desc'
  onSort?: (field: string) => void
  align?: 'left' | 'right' | 'center'
  className?: string
}

export default function TableSortHeader({
  label,
  field,
  currentSortBy,
  currentSortOrder = 'asc',
  onSort,
  align = 'left',
  className = '',
}: TableSortHeaderProps) {
  const isActive = currentSortBy === field

  if (!onSort) {
    return <span className={className}>{label}</span>
  }

  const justifyClass = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      aria-label={`Ordenar por ${label}`}
      className={`group inline-flex items-center gap-1.5 font-medium hover:text-slate-900 dark:hover:text-slate-100 transition-colors select-none focus:outline-none focus-visible:underline ${justifyClass} ${
        isActive ? 'text-brand-600 dark:text-brand-400 font-semibold' : ''
      } ${className}`}
    >
      <span>{label}</span>
      <span className="shrink-0">
        {isActive ? (
          currentSortOrder === 'asc' ? (
            <svg className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m18 15-6-6-6 6" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          )
        ) : (
          <svg className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 text-slate-400 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m7 15 5 5 5-5" />
            <path d="m7 9 5-5 5 5" />
          </svg>
        )}
      </span>
    </button>
  )
}
