import type { PulseColor } from '@/types'

interface StatusChipProps {
  label: string
  chipClass: string
  pulseDot?: PulseColor
}

export default function StatusChip({ label, chipClass, pulseDot }: StatusChipProps) {
  return (
    <span className={`chip ${chipClass}${pulseDot ? ` pulse-dot ${pulseDot}` : ''}`}>
      {pulseDot && <span className="relative w-1.5 h-1.5 rounded-full bg-red-500" />}
      {label}
    </span>
  )
}
