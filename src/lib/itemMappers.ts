import type { ApiItem } from '@/lib/api'
import type { Item, PulseColor } from '@/types'

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

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = d.getUTCFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export function mapApiItemToDisplay(api: ApiItem): Item {
  const typeName = api.type?.name ?? ''
  const statusName = api.status?.name ?? ''
  const avatarToken = avatarStatusOverride.has(statusName)
    ? statusColorToken[statusName]
    : typeColorToken[typeName]
  const pulseDot = (api.status?.pulseDot ?? undefined) as PulseColor | undefined

  return {
    id: api.id,
    code: api.code,
    name: api.name,
    serialLabel: api.serialLabel,
    serialNumber: api.serialNumber,
    installDate: formatDate(api.installDate),
    type: typeName as Item['type'],
    typeChipClass: typeChipMap[typeName] ?? '',
    status: statusName as Item['status'],
    statusChipClass: statusChipMap[statusName] ?? '',
    pulseDot,
    location: api.location,
    initials: api.initials,
    initialsBgClass: avatarBgMap[avatarToken ?? ''] ?? '',
    responsible: api.responsible?.name ?? '',
    responsibleInitials: api.responsible?.initials ?? '',
    responsibleColor: responsibleColorMap[api.responsible?.color ?? ''] ?? '',
    nextEvent: {
      label: api.nextEventLabel,
      date: api.nextEventDate,
      urgency: api.nextEventUrgency as 'amber' | 'red' | 'slate',
    },
  }
}
