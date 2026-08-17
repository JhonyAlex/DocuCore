import type { ApiAsset, ApiAssetEvent, ApiLocationAsset } from '@/lib/api'
import type { Asset, AssetNextEvent, LocationAsset, PulseColor } from '@/types'
import { assetTypeColorBgMap, assetTypeColorChipMap, isAssetTypeColorKey, type AssetTypeColorKey } from '../../shared/assetTypeColorCatalog'
import { statusColorMap } from '../../shared/statusCatalog'

const statusChipMap: Record<string, string> = {
  Activo: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'En revisión': 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'Fuera de servicio': 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  Vencido: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  Alerta: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
}

export function getStatusChipClass(status: { name: string; color?: string | null }): string {
  if (status.color && statusColorMap[status.color]) {
    return statusColorMap[status.color]
  }
  return statusChipMap[status.name] ?? ''
}

// Compatibilidad con respuestas anteriores a la migración. El API actual
// siempre devuelve el color persistido por tipo.
const legacyTypeColorToken: Record<string, AssetTypeColorKey> = {
  Máquina: 'brand',
  Extintor: 'red',
  Instrumento: 'indigo',
  Servidor: 'slate',
  Vehículo: 'purple',
}

function assetTypeColor(type: { name: string; color?: string } | undefined): AssetTypeColorKey | undefined {
  if (isAssetTypeColorKey(type?.color)) return type.color
  return type ? legacyTypeColorToken[type.name] : undefined
}

export const responsibleColorMap: Record<string, string> = {
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

export function mapApiAssetEventToDisplay(event: ApiAssetEvent): AssetNextEvent {
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

// En cualquier lista, las iniciales se colorean por el tipo de activo y no por
// su estado. Así el mismo tipo conserva una identidad visual coherente.
export function mapApiLocationAssetToDisplay(asset: ApiLocationAsset): LocationAsset {
  const typeColor = assetTypeColor(asset.type)
  return {
    id: asset.id,
    code: asset.code,
    name: asset.name,
    installedDate: formatApiDate(asset.installDate),
    initials: asset.initials,
    initialsBgClass: typeColor ? assetTypeColorBgMap[typeColor] : '',
    statusLabel: asset.status.name,
    statusChipClass: getStatusChipClass(asset.status),
  }
}

export function mapApiAssetToDisplay(api: ApiAsset): Asset {
  const typeName = api.type?.name ?? ''
  const statusName = api.status?.name ?? ''
  const typeColor = assetTypeColor(api.type)
  const serialPrefix = typeName === 'Extintor' ? 'Lote' : typeName === 'Vehículo' ? 'Mat' : 'SN'
  const pulseDot = (api.status?.pulseDot ?? undefined) as PulseColor | undefined

  return {
    id: api.id,
    code: api.code,
    name: api.name,
    serialLabel: `${serialPrefix}: ${api.serialNumber}`,
    serialNumber: api.serialNumber,
    installDate: formatApiDate(api.installDate),
    type: typeName as Asset['type'],
    typeColorKey: typeColor,
    typeChipClass: typeColor ? assetTypeColorChipMap[typeColor] : '',
    status: statusName as Asset['status'],
    statusChipClass: api.status ? getStatusChipClass(api.status) : (statusChipMap[statusName] ?? ''),
    pulseDot,
    location: api.location?.label ?? api.location?.name ?? '',
    initials: api.initials,
    initialsBgClass: typeColor ? assetTypeColorBgMap[typeColor] : '',
    responsible: api.responsible?.name ?? '',
    responsibleInitials: api.responsible?.initials ?? '',
    responsibleColor: responsibleColorMap[api.responsible?.color ?? ''] ?? '',
    nextEvent: api.nextEvents[0] ? mapApiAssetEventToDisplay(api.nextEvents[0]) : null,
    deletedLabel: api.deletedAt ? `Eliminado el ${formatApiDate(api.deletedAt)}` : undefined,
  }
}

export function formatApiDateTime(isoString: string): string {
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return isoString
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const year = d.getUTCFullYear()
  const hours = String(d.getUTCHours()).padStart(2, '0')
  const minutes = String(d.getUTCMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

export function getHistoryActionChipClass(action: string): string {
  const normalized = action.toLowerCase().trim()
  if (normalized.includes('creación') || normalized.includes('creado') || normalized.includes('subid') || normalized.includes('restaur')) {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 ring-1 ring-emerald-600/20'
  }
  if (normalized.includes('elimin') || normalized.includes('archivo') || normalized.includes('baja') || normalized.includes('desactiv')) {
    return 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 ring-1 ring-rose-600/20'
  }
  if (normalized.includes('actualiz') || normalized.includes('cambio') || normalized.includes('movid') || normalized.includes('renombr')) {
    return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 ring-1 ring-amber-600/20'
  }
  if (normalized.includes('realiz') || normalized.includes('completad')) {
    return 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 ring-1 ring-blue-600/20'
  }
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 ring-1 ring-slate-400/20'
}
