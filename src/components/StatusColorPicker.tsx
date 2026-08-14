import { statusColorDefinitions, DEFAULT_STATUS_COLOR_KEY, type StatusColorKey } from '../../shared/statusCatalog'

interface StatusColorPickerProps {
  value?: string | null
  disabled?: boolean
  onChange: (colorKey: StatusColorKey) => void
}

export default function StatusColorPicker({ value, disabled = false, onChange }: StatusColorPickerProps) {
  const selected = statusColorDefinitions.find((color) => color.key === value) ?? statusColorDefinitions.find((color) => color.key === DEFAULT_STATUS_COLOR_KEY)!

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="text-xs font-medium">Color del estado</legend>
      <div className="mt-1 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${selected.bgClass}`}>
          <span className={`h-3 w-3 rounded-full ${selected.dotClass}`} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{selected.label}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">Paleta de color · {selected.key}</p>
        </div>
      </div>
      <div
        role="listbox"
        aria-label="Paleta de colores de estado"
        className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2"
      >
        {statusColorDefinitions.map((color) => {
          const isSelected = selected.key === color.key
          return (
            <button
              key={color.key}
              type="button"
              role="option"
              aria-selected={isSelected}
              aria-label={color.label}
              data-color-key={color.key}
              onClick={() => onChange(color.key)}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium transition ${
                isSelected
                  ? 'border-brand-500 bg-brand-50/50 text-slate-900 ring-2 ring-brand-500 dark:bg-brand-900/20 dark:text-slate-100'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              <span className={`h-3 w-3 shrink-0 rounded-full ${color.dotClass}`} />
              <span className="truncate">{color.label.split(' ')[0]}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
