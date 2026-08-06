import type { ReactNode } from 'react'

export type ItemStatus = 'Activo' | 'En revisión' | 'Fuera de servicio' | 'Vencido' | 'Alerta'
export type ItemType = 'Máquina' | 'Extintor' | 'Vehículo' | 'Servidor' | 'Instrumento'
export type ProjectStatus = 'Activo' | 'Archivo'
export type DocStatus = 'Vencido' | 'Por vencer' | 'Vigente'
export type DocType = 'Certificado' | 'Calibración' | 'Manual' | 'Acta' | 'Contrato'
export type PulseColor = 'red' | 'amber' | 'green'

export interface ItemFilters {
  search: string
  typeId: number | null
  statusId: number | null
  location: string | null
}

export interface Pagination {
  page: number
  totalPages: number
  total: number
  limit: number
}

export interface User {
  id: number
  name: string
  role: string
  initials: string
  color: string
}

export interface Project {
  id: string
  code: string
  name: string
  description: string
  status: ProjectStatus
  gradient: string
  assetCount: number
  userCount: number
  locationCount: number
  docCount?: number
  isCreateCard?: boolean
}

export interface ItemNextEvent {
  id: string
  label: string
  date: string
  urgency: 'amber' | 'red' | 'slate'
  source: 'event' | 'document' | 'dynamic-field'
  sourceLabel: string
}

export interface Item {
  id: number
  code: string
  name: string
  serialLabel: string
  serialNumber: string
  installDate: string
  type: ItemType
  typeChipClass: string
  status: ItemStatus
  statusChipClass: string
  pulseDot?: PulseColor
  location: string
  initials: string
  initialsBgClass: string
  responsible: string
  responsibleInitials: string
  responsibleColor: string
  nextEvent: ItemNextEvent | null
}

export interface DocumentRecord {
  id: number
  name: string
  size: string
  uploadInfo: string
  itemCode: string
  itemName: string
  type: DocType
  typeChipClass: string
  version: string
  issueDate: string
  expiryDate: string
  status: DocStatus
  statusChipClass: string
  fileFormat: string
  iconBgClass: string
}

export interface CalendarEvent {
  day: number
  title: string
  colorClass: string
}

export interface FloorPlanMarker {
  id: number
  code: string
  label: string
  left: number
  top: number
  pinColorClass: string
  dotColorClass: string
  animate?: boolean
}

export interface LocationDetail {
  name: string
  parent: string
  responsible: string
  assetCount: number
  surface: string
  code: string
}

export interface LocationAsset {
  code: string
  name: string
  installedDate: string
  initials: string
  initialsBgClass: string
  statusChipClass: string
}

export interface AuditLog {
  id: number
  timestamp: string
  userName: string
  userInitials: string
  userColorClass: string
  action: string
  actionChipClass: string
  entityId: string
  detail: string
}

export interface DashboardKpi {
  id: string
  label: string
  value: string
  chipText: string
  chipClass: string
  iconBgClass: string
  iconKey: string
  footer?: string
  progress?: number
}

export interface UpcomingExpiration {
  id: number
  title: string
  subtitle: string
  iconBgClass: string
  iconKey: string
  chipText: string
  chipClass: string
  pulseDot?: PulseColor
}

export interface AlertItem {
  id: number
  title: string
  subtitle: string
  alertClass: string
  borderClass: string
  dotColorClass: string
  pulseDot: PulseColor
}

export interface ActivityItem {
  id: number
  time: string
  text: string
  detail: string
  dotColorClass: string
}

export interface ChartBar {
  month: string
  vencimientos: number
  completados: number
  incidencias: number
  isCurrent?: boolean
}

export interface NavItem {
  to: string
  label: string
  icon: ReactNode
  group: 'Principal' | 'Gestión' | 'Administración'
  badge?: string
}

export interface ConfigCard {
  title: string
  description: string
  footer: string
  iconBgClass: string
  iconKey: string
  footerClass?: string
}

export interface DocKpi {
  value: string
  label: string
  sublabel: string
  bgClass: string
}
