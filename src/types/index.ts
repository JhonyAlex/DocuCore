import type { ReactNode } from 'react'

export type AssetStatus = 'Activo' | 'En revisión' | 'Fuera de servicio' | 'Vencido' | 'Alerta'
export type AssetType = 'Máquina' | 'Extintor' | 'Vehículo' | 'Servidor' | 'Instrumento'
export type ProjectStatus = 'Activo' | 'Archivo'
export type DocStatus = 'Vencido' | 'Por vencer' | 'Vigente'
export type DocType = 'Certificado' | 'Calibración' | 'Manual' | 'Acta' | 'Contrato'
export type PulseColor = 'red' | 'amber' | 'green'

export interface AssetFilters {
  search: string
  typeId: number | null
  statusId: number | null
  locationId: number | null
}
export interface Pagination {
  page: number
  totalPages: number
  total: number
  limit: number
}

export type BillingStatus = 'PENDING_VERIFICATION' | 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED'
export type BillingSource = 'STRIPE' | 'MANUAL'
export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER'
export type WorkspaceMemberStatus = 'ACTIVE' | 'SUSPENDED' | 'PLAN_LOCKED'
export type PlanKey = 'STARTER' | 'PRO'

export interface ApiWorkspaceSummary {
  id: number
  name: string
  slug: string
  billingStatus: BillingStatus
  billingSource?: BillingSource
  planKey?: PlanKey | null
  trialStartedAt?: string | null
  trialEndsAt?: string | null
  trialDaysLeft?: number
  isEntitledToWrite?: boolean
  entitlementReason?: string | null
  role?: WorkspaceRole
}

export interface ApiBillingStatus {
  workspaceId: number
  name: string
  slug: string
  billingStatus: BillingStatus
  billingSource: BillingSource
  planKey: PlanKey | null
  planName: string
  maxActiveProjects: number
  activeProjectsCount: number
  archivedProjectsCount: number
  maxActiveMembers: number
  activeMembersCount: number
  planLockedMembersCount: number
  suspendedMembersCount: number
  remainingMemberSeats: number
  projectsCompliant: boolean
  membersCompliant: boolean
  complianceStatus: string
  canDowngradeToStarter: boolean
  canInviteMember: boolean
  canActivateMember: boolean
  trialStartedAt: string | null
  trialEndsAt: string | null
  trialDaysLeft: number
  isEntitledToWrite: boolean
  entitlementReason: string | null
  hasSubscription: boolean
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  role: WorkspaceRole
  isOwner: boolean
}

export interface ApiAdminWorkspace {
  id: number
  name: string
  slug: string
  billingStatus: BillingStatus
  billingSource: BillingSource
  planKey?: string | null
  trialStartedAt: string | null
  trialEndsAt: string | null
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  projectCount: number
  memberCount: number
  owner?: {
    id: number
    name: string
    email: string
    initials: string
    color: string
  } | null
  createdAt: string
  updatedAt: string
}

export interface User {
  id: number
  name: string
  email: string
  role: string
  initials: string
  color: string
  isPlatformAdmin?: boolean
  emailVerifiedAt?: string | null
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

export interface AssetNextEvent {
  id: string
  label: string
  date: string
  urgency: 'amber' | 'red' | 'slate'
  source: 'event' | 'document' | 'dynamic-date' | 'preventive'
  sourceLabel: string
}

export interface Asset {
  id: number
  code: string
  name: string
  serialLabel: string
  serialNumber: string
  installDate: string
  type: AssetType
  typeColorKey?: string
  typeChipClass: string
  status: AssetStatus
  statusChipClass: string
  pulseDot?: PulseColor
  location: string
  initials: string
  initialsBgClass: string
  responsible: string
  responsibleInitials: string
  responsibleColor: string
  nextEvent: AssetNextEvent | null
  // ITEM-05: fecha de eliminación (solo presente para activos en papelera).
  deletedLabel?: string
}

export interface DocumentRecord {
  id: number
  name: string
  size: string
  uploadInfo: string
  assetCode: string
  assetName: string
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

export interface LocationAsset {
  id: number
  code: string
  name: string
  installedDate: string
  initials: string
  initialsBgClass: string
  statusLabel: string
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
  onClick?: () => void
}

export interface UpcomingExpiration {
  id: string | number
  title: string
  subtitle: string
  iconBgClass: string
  iconKey: string
  chipText: string
  chipClass: string
  pulseDot?: PulseColor
  targetType?: 'asset' | 'docs' | 'calendar'
  targetId?: number
  assetCode?: string
  searchQuery?: string
  onClick?: () => void
}

export interface AlertItem {
  id: string | number
  title: string
  subtitle: string
  alertClass: string
  borderClass: string
  dotColorClass: string
  pulseDot?: PulseColor
  targetType?: 'asset' | 'assets-filter' | 'docs' | 'calendar'
  targetId?: number
  assetCode?: string
  filterParams?: Record<string, string | number>
  onClick?: () => void
}

export interface ActivityItem {
  id: number
  time: string
  text: string
  detail: string
  dotColorClass: string
  targetType?: 'asset' | 'history'
  assetId?: number
  entityId?: string
  onClick?: () => void
}

export interface ChartBar {
  month: string
  vencimientos: number
  completados: number
  incidencias: number
  vencimientosCount?: number
  completadosCount?: number
  incidenciasCount?: number
  isCurrent?: boolean
  onClick?: () => void
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

export type NotificationCategory = 'expiry' | 'maintenance' | 'status' | 'system'
export type NotificationUrgency = 'critical' | 'warning' | 'info'
export type NotificationTargetType = 'asset' | 'document' | 'calendar' | 'url'

export interface ApiNotification {
  id: number
  projectId: number
  userId: number | null
  title: string
  message: string
  category: NotificationCategory
  urgency: NotificationUrgency
  targetType: NotificationTargetType | null
  targetId: string | null
  readAt: string | null
  sourceKey: string | null
  createdAt: string
  updatedAt: string
}

export interface NotificationsResponse {
  notifications: ApiNotification[]
  unreadCount: number
  total: number
}
