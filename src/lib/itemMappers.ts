import type { ApiItem, ApiItemEvent, ApiLocationItem } from '@/lib/api'
import type { Item, ItemNextEvent, LocationAsset, PulseColor } from '@/types'

const typeChipMap: Record<string, string> = {
  Máquina: 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300',
  Extintor: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  Instrumento: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  Servidor: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  Vehículo: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
}

const statusChipMap: Record<string, string> = {
  Activo: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'En revisión': 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'Fuera de servicio': 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  Vencido: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  Alerta: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
}

const typeColorToken: Record<string, string> = {
  Máquina: 'brand',
  Extintor: 'red',
  Instrumento: 'indigo',
  Servidor: 'slate',
  Vehículo: 'purple',
}

const statusColorToken: Record<string, string> = {
  Activo: 'emerald',
  'En revisión': 'amber',
  'Fuera de servicio': 'red',
  Vencido: 'red',
  Alerta: 'amber',
}

const avatarStatusOverride = new Set(['En revisión', 'Fuera de servicio'])

const avatarBgMap: Record<string, string> = {
  brand: 'bg-brand-50 dark:bg-brand-900/30 text-brand-600',
  red: 'bg-red-50 dark:bg-red-900/30 text-red-600',
  indigo: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600',
  purple: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600',
  emerald: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600',
  amber: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600',
  slate: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
}

const responsibleColorMap: Record<string, string> = {
  brand: 'bg-brand-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  indigo: 'bg-indigo-500',
  red: 'bg-red-500',
  slate: 'bg-slate-500',
  purple: 'bg-purple-500',
}

export function formatApiDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = d.getUTCFullYear()
  return `${dd}/${mm}/${yyyy}`
}

// Formato de tamaño de documento compartido por la lista y la ficha de activo:
// B, KB o MB con una cifra, como muestra el HTML de referencia ("840 KB", "2.4 MB").
export function formatDocumentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatRelativeDays(daysUntil: number): string {
  if (daysUntil < 0) return `Atrasado · ${Math.abs(daysUntil)}d`
  if (daysUntil === 0) return 'Hoy'
  return `${daysUntil}d`
}

export function mapApiItemEventToDisplay(event: ApiItemEvent): ItemNextEvent {
  return {
    id: event.id,
    label: event.title,
    date: event.daysUntil < 0
      ? formatRelativeDays(event.daysUntil)
      : `${formatApiDate(event.date)} · ${formatRelativeDays(event.daysUntil)}`,
    urgency: event.urgency,
    source: event.source,
    sourceLabel: event.sourceLabel,
  }
}

// En la lista de activos de una ubicación el avatar usa el color del tipo,
// sin la sobreescritura por estado que aplica la tabla de ítems (el HTML de
// referencia muestra BSC-11 "En revisión" con avatar índigo de Instrumento).
export function mapApiLocationItemToAsset(item: ApiLocationItem): LocationAsset {
  return {
    code: item.code,
    name: item.name,
    installedDate: formatApiDate(item.installDate),
    initials: item.initials,
    initialsBgClass: avatarBgMap[typeColorToken[item.type.name] ?? ''] ?? '',
    statusLabel: item.status.name,
    statusChipClass: statusChipMap[item.status.name] ?? '',
  }
}

export function mapApiItemToDisplay(api: ApiItem): Item {
  const typeName = api.type?.name ?? ''
  const statusName = api.status?.name ?? ''
  const serialPrefix = typeName === 'Extintor' ? 'Lote' : typeName === 'Vehículo' ? 'Mat' : 'SN'
  const avatarToken = avatarStatusOverride.has(statusName)
    ? statusColorToken[statusName]
    : typeColorToken[typeName]
  const pulseDot = (api.status?.pulseDot ?? undefined) as PulseColor | undefined

  return {
    id: api.id,
    code: api.code,
    name: api.name,
    serialLabel: `${serialPrefix}: ${api.serialNumber}`,
    serialNumber: api.serialNumber,
    installDate: formatApiDate(api.installDate),
    type: typeName as Item['type'],
    typeChipClass: typeChipMap[typeName] ?? '',
    status: statusName as Item['status'],
    statusChipClass: statusChipMap[statusName] ?? '',
    pulseDot,
    location: api.location?.label ?? api.location?.name ?? '',
    initials: api.initials,
    initialsBgClass: avatarBgMap[avatarToken ?? ''] ?? '',
    responsible: api.responsible?.name ?? '',
    responsibleInitials: api.responsible?.initials ?? '',
    responsibleColor: responsibleColorMap[api.responsible?.color ?? ''] ?? '',
    nextEvent: api.nextEvents[0] ? mapApiItemEventToDisplay(api.nextEvents[0]) : null,
  }
}
