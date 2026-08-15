import type { DocumentPeriodicity, DocumentPeriodicityMode } from '@/lib/periodicity'
import type { DashboardKpi, UpcomingExpiration, AlertItem, ChartBar, ActivityItem } from '@/types'
import type { AssetIconKey } from '../../shared/assetIconCatalog'
import type { ProjectThemeKey } from '../../shared/projectThemes'

const API_BASE = '/api'
const projectPath = (projectId: number, path = '') => `/projects/${projectId}${path}`

export interface ApiAssetType {
  id: number
  name: string
  iconKey: AssetIconKey
  projectId?: number
  sortOrder?: number
  isActive?: boolean
  assetCount?: number
  fieldCount?: number
}
export interface AssetTypeInput {
  name: string
  iconKey?: AssetIconKey
  sortOrder?: number
  isActive?: boolean
}

export interface ApiStatus {
  id: number
  projectId?: number
  name: string
  color?: string
  pulseDot: string | null
  sortOrder?: number
  isActive?: boolean
  assetCount?: number
}

export interface StatusInput {
  name: string
  color?: string
  pulseDot?: string | null
  sortOrder?: number
  isActive?: boolean
}

export type StatusUpdateInput = Partial<StatusInput>

export interface ApiUserRef {
  id: number
  name: string
  initials: string
  color: string
}

export interface ApiSessionUser {
  id: number
  name: string
  email: string
  role: string
  initials: string
  color: string
  isPlatformAdmin?: boolean
  emailVerifiedAt?: string | null
}

export interface ApiSessionWorkspace {
  id: number
  name: string
  slug: string
  billingStatus: 'PENDING_VERIFICATION' | 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED'
  trialStartedAt?: string | null
  trialEndsAt?: string | null
  trialDaysLeft?: number
  isEntitledToWrite?: boolean
  entitlementReason?: string | null
  role?: 'OWNER' | 'ADMIN' | 'MEMBER'
}

export interface ApiSession {
  user: ApiSessionUser
  workspace?: ApiSessionWorkspace | null
}

export type ApiProjectRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER'
export type ApiProjectStatus = 'ACTIVE' | 'ARCHIVED'
export interface ApiProjectMember extends ApiUserRef { email?: string; role: ApiProjectRole }
export interface ApiProjectSummary {
  id: number
  code: string
  name: string
  description: string
  status: ApiProjectStatus
  themeKey: ProjectThemeKey
  createdAt: string
  updatedAt: string
  assetCount: number
  documentCount: number
  locationCount: number
  memberCount: number
  members: ApiProjectMember[]
  currentRole?: ApiProjectRole
}
export interface ApiProjectListResponse { data: ApiProjectSummary[]; total: number; page: number; limit: number; totalPages: number }
export interface ProjectInput { code: string; name: string; description: string; themeKey: ProjectThemeKey; memberIds?: Array<{ userId: number; role: ApiProjectRole }>; copyConfigurationFromProjectId?: number }

export interface ApiAssetEvent {
  id: string
  title: string
  date: string
  daysUntil: number
  urgency: 'amber' | 'red' | 'slate'
  source: 'event' | 'document' | 'dynamic-date' | 'preventive'
  sourceLabel: string
}

export type ApiCalendarEventSource = 'event' | 'document' | 'dynamic-date' | 'preventive'
export type ApiCalendarEventCategory = 'expiry' | 'calibration' | 'maintenance' | 'review'
export type ApiCalendarEventStatus = 'overdue' | 'today' | 'upcoming' | 'pending' | 'completed'
export interface ApiCalendarEventOccurrence {
  id: string
  source: ApiCalendarEventSource
  sourceId: number
  projectId: number
  assetId: number | null
  title: string
  sourceLabel: string
  category: ApiCalendarEventCategory
  date: string
  status: ApiCalendarEventStatus
  completedAt: string | null
  completedDate: string | null
  asset: { id: number; code: string; name: string; location?: string } | null
  progress: { completed: number; total: number } | null
  canComplete: boolean
  canEdit: boolean
  canDelete: boolean
}
export interface ApiCalendarResponse {
  today: string
  events: ApiCalendarEventOccurrence[]
  counts: { total: number; overdue: number; today: number; upcoming: number }
  truncated?: boolean
}
export interface CalendarQuery {
  projectId: number
  from?: string
  to?: string
  source?: ApiCalendarEventSource
  status?: ApiCalendarEventStatus
  assetId?: number
  search?: string
  limit?: number
}
export interface CalendarManualEventInput {
  title: string
  date: string
  category: ApiCalendarEventCategory
  assetId: number | null
  projectId: number
}

export type DynamicFieldType = 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'DATE' | 'SELECT' | 'MULTISELECT' | 'BOOLEAN'

export interface ApiDynamicFieldOption {
  id: number
  key: string
  label: string
  sortOrder: number
  isActive?: boolean
}

export interface DynamicFieldDefinitionInput {
  fieldName: string
  description?: string | null
  groupName: string
  fieldType: DynamicFieldType
  required: boolean
  placeholder?: string | null
  unit?: string | null
  minValue?: number | null
  maxValue?: number | null
  decimalPlaces?: number | null
  sortOrder?: number
  isActive?: boolean
  assetTypeIds: number[]
  options: Array<{ key?: string; label: string }>
}

export interface ApiDynamicFieldDefinition extends DynamicFieldDefinitionInput {
  id: number
  projectId: number
  key: string
  assetTypes: ApiAssetType[]
  options: ApiDynamicFieldOption[]
  usageCount: number
  createdAt: string
  updatedAt: string
}

export interface ApiAssetDynamicField {
  definitionId: number
  key: string
  fieldName: string
  description: string | null
  groupName: string
  fieldType: DynamicFieldType
  required: boolean
  placeholder: string | null
  unit: string | null
  minValue: number | null
  maxValue: number | null
  decimalPlaces: number | null
  sortOrder: number
  options: ApiDynamicFieldOption[]
  value: unknown
  dateSchedule?: { periodicity: DocumentPeriodicity | null; periodicityMode: DocumentPeriodicityMode | null; occurrenceId: number | null; date: string | null } | null
}

export interface DynamicFieldValueInput {
  definitionId: number
  value: unknown
}

export interface AssetWriteInput {
  code: string
  name: string
  serialNumber: string
  installDate: string
  typeId: number
  statusId: number
  locationId: number
  projectId: number
  responsibleId: number
  initials: string
  dynamicFields?: DynamicFieldValueInput[]
}

export interface ApiLocationRef {
  id: number
  name: string
  code: string
  label: string
}

export interface ApiAssetDocument {
  id: number
  name: string
  type: string
  currentVersion: ApiDocumentVersion | null
}

export interface ApiAsset {
  id: number
  code: string
  name: string
  serialNumber: string
  installDate: string
  typeId: number
  statusId: number
  locationId: number
  projectId: number
  responsibleId: number
  initials: string
  deletedAt?: string | null
  imageUrl: string | null
  imageMimeType?: string | null
  imageSizeBytes?: number | null
  nextEvents: ApiAssetEvent[]
  documentCount: number
  documents?: ApiAssetDocument[]
  eventCount: number
  type?: { id: number; name: string; iconKey?: AssetIconKey }
  status?: { id: number; name: string; color?: string; pulseDot: string | null }
  location?: ApiLocationRef
  responsible?: ApiUserRef
  dynamicFields?: ApiAssetDynamicField[]
  preventivePlans?: ApiPreventivePlan[]
}

export interface ApiTask { id: number; projectId: number; code: string; name: string; isActive: boolean }
export interface ApiPreventiveExecutionTask { id: number; code: string; name: string; completedAt: string | null }
export interface ApiPreventiveExecution { id: number; scheduledDate: string; completedAt: string | null; tasks: ApiPreventiveExecutionTask[] }
export interface ApiPreventivePlan { id: number; planId: number | null; name: string; periodicity: DocumentPeriodicity; periodicityMode: DocumentPeriodicityMode; executions: ApiPreventiveExecution[] }

export interface ApiPreventivePlanTask { taskId: number; code: string; name: string; sortOrder: number; isActive: boolean }
export interface ApiPreventivePlanAssetType { id: number; name: string }
export interface ApiPreventivePlanTemplate {
  id: number
  projectId: number
  name: string
  description: string | null
  periodicity: DocumentPeriodicity
  periodicityMode: DocumentPeriodicityMode
  isActive: boolean
  createdAt: string
  updatedAt: string
  tasks: ApiPreventivePlanTask[]
  taskIds: number[]
  assetTypes: ApiPreventivePlanAssetType[]
  assetTypeIds: number[]
  assignmentCount: number
}

export interface PreventivePlanInput {
  name: string
  description?: string | null
  periodicity: DocumentPeriodicity
  periodicityMode: DocumentPeriodicityMode
  isActive?: boolean
  taskIds: number[]
  assetTypeIds: number[]
}

export interface ApiAssetEventHistory { source: 'event' | 'document' | 'dynamic-date' | 'preventive'; id: number; title: string; date: string; sourceLabel: string; status: ApiCalendarEventStatus; completedAt: string | null; completedDate: string | null; progress: { completed: number; total: number } | null }
export interface ApiAssetHistoryEntry { id: number; action: string; detail: string; timestamp: string; user: { name: string; initials: string } }
export interface ApiAssetHistoryPage { data: ApiAssetHistoryEntry[]; total: number; page: number; totalPages: number }

export interface ApiLocation {
  id: number
  name: string
  label: string
  code: string
  surface: string
  responsibleId: number
  parentId: number | null
  projectId: number
  responsible: ApiUserRef
  assetCount: number
  childCount: number
  hasFloorPlan: boolean
}

export interface ApiLocationTreeNode extends ApiLocation {
  children: ApiLocationTreeNode[]
}

export interface ApiLocationAsset {
  id: number
  code: string
  name: string
  installDate: string
  initials: string
  type: { id: number; name: string; iconKey?: AssetIconKey }
  status: { id: number; name: string; color?: string; pulseDot: string | null }
  typeName?: string
  statusName?: string
  responsibleInitials?: string
  responsibleColor?: string
  eventCount?: number
  documentCount?: number
}

export interface ApiLocationDetail extends ApiLocation {
  parent: ApiLocationRef | null
  project: { id: number; name: string; code: string }
  ancestors: ApiLocationRef[]
  assets?: ApiLocationAsset[]
  previewAssets: ApiLocationAsset[]
  previewAssetCount: number
}

export interface ApiFloorPlanVersion {
  id: number
  version: number
  originalName: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  sizeBytes: number
  width: number
  height: number
  uploadedAt: string
}

export interface ApiFloorPlanAsset {
  id: number
  code: string
  name: string
  locationId: number
  type: { id: number; name: string; iconKey?: AssetIconKey }
  status: { id: number; name: string; color?: string; pulseDot: string | null }
  nextEvents?: ApiAssetEvent[]
  alert?: 'overdue' | 'soon' | 'normal'
}
export interface ApiFloorPlanFacet {
  typeId: number
  name: string
  iconKey: AssetIconKey
  count: number
}

export interface ApiFloorPlanMarker {
  id: number
  floorPlanId: number
  assetId: number
  x: number
  y: number
  createdAt: string
  updatedAt: string
  asset: ApiFloorPlanAsset
}

export interface ApiFloorPlan {
  id: number
  name: string
  projectId: number
  locationId: number
  createdAt: string
  updatedAt: string
  location: ApiLocationRef
  currentVersion: ApiFloorPlanVersion | null
  markers: ApiFloorPlanMarker[]
  markerTotal?: number
  markersTruncated?: boolean
}

export interface ApiAssetFloorPlanPlacement {
  planId: number
  planName: string
  location: ApiLocationRef
  currentVersion: ApiFloorPlanVersion
  dziUrl: string
  markerId: number
  x: number
  y: number
}

export interface FloorPlanWriteInput {
  name: string
  projectId: number
  locationId: number
}

export interface ApiLocationsResponse {
  tree: ApiLocationTreeNode[]
  list: ApiLocation[]
  locations: ApiLocation[]
  project: { id: number; name: string; code: string }
}
export interface ApiLocationBootstrapResponse extends ApiLocationsResponse {
  selectedId: number | null
  openBranchIds: number[]
}

export interface LocationWriteInput {
  name: string
  label?: string
  code: string
  surface: string
  parentId: number | null
  responsibleId: number
  projectId: number
}

export interface ApiDocumentVersion {
  id: number
  version: number
  originalName: string
  mimeType: string
  sizeBytes: number
  issueDate: string
  expiryDate: string | null
  uploadedAt: string
}

export interface ApiDocument {
  id: number
  name: string
  eventTitle: string | null
  type: string
  status?: 'Vigente' | 'Por vencer' | 'Vencido'
  projectId: number
  createdAt: string
  updatedAt: string
  currentVersion: ApiDocumentVersion | null
  assetIds?: number[]
  assets?: Array<{ id: number; code: string; name: string }>
  assetCount?: number
  periodicity?: DocumentPeriodicity | null
  periodicityMode?: DocumentPeriodicityMode | null
}

export interface ApiDocumentDetail extends ApiDocument {
  versions: ApiDocumentVersion[]
}

export interface DocumentMetadataInput {
  name: string
  type: string
  projectId: number
  assetIds?: number[]
  issueDate: string
  expiryDate?: string
  periodicity?: DocumentPeriodicity
  periodicityMode?: DocumentPeriodicityMode
}

export interface DocumentListParams {
  search?: string
  type?: string
  status?: 'Vigente' | 'Por vencer' | 'Vencido'
  projectId?: number
  assetId?: number | null
  page?: number
  limit?: number
}

export interface ApiDocumentListResponse {
  data: ApiDocument[]
  total: number
  page: number
  totalPages: number
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw Object.assign(new Error(payload?.error ?? `API error ${response.status}`), { status: response.status })
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export interface FetchAssetsParams {
  page?: number
  limit?: number
  search?: string
  typeId?: number
  statusId?: number
  locationId?: number
  projectId?: number
  trashed?: boolean
}

export type AssetListParams = FetchAssetsParams

export interface FetchAssetsResponse {
  assets: ApiAsset[]
  data: ApiAsset[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export async function fetchAssets(projectId: number, params: Omit<FetchAssetsParams, 'projectId'> = {}): Promise<FetchAssetsResponse> {
  const q = new URLSearchParams()
  if (params.page) q.set('page', String(params.page))
  if (params.limit) q.set('limit', String(params.limit))
  if (params.search) q.set('search', params.search)
  if (params.typeId) q.set('typeId', String(params.typeId))
  if (params.statusId) q.set('statusId', String(params.statusId))
  if (params.locationId) q.set('locationId', String(params.locationId))
  if (params.trashed) q.set('trashed', 'true')
  const res = await request<FetchAssetsResponse>(`${projectPath(projectId, '/assets')}?${q.toString()}`)
  const rows = res.data ?? res.assets ?? []
  return { ...res, assets: res.assets ?? rows, data: rows }
}

export type ApiAssetSuggestionField = 'code' | 'name' | 'initials'
export interface ApiAssetSuggestionRow {
  code: string | null
  name: string | null
  initials: string | null
}

interface ApiAssetSuggestionsResponse {
  values: ApiAssetSuggestionRow[]
}

export async function fetchAssetSuggestions(projectId: number, field: ApiAssetSuggestionField, q = '', excludeId?: number): Promise<ApiAssetSuggestionRow[]> {
  const query = new URLSearchParams({ field })
  if (q.trim()) query.set('q', q.trim())
  if (excludeId) query.set('excludeId', String(excludeId))
  const response = await request<ApiAssetSuggestionsResponse>(`${projectPath(projectId, '/assets/suggestions')}?${query.toString()}`)
  return response.values
}

export function fetchAsset(projectId: number, id: number): Promise<ApiAsset> {
  return request<ApiAsset>(projectPath(projectId, `/assets/${id}`))
}

export function createAsset(projectId: number, data: AssetWriteInput, imageFile?: File | null): Promise<ApiAsset> {
  if (!imageFile) return request<ApiAsset>(projectPath(projectId, '/assets'), { method: 'POST', body: JSON.stringify(data) })
  const formData = new FormData()
  formData.set('data', JSON.stringify(data))
  formData.set('image', imageFile)
  return request<ApiAsset>(projectPath(projectId, '/assets'), { method: 'POST', body: formData })
}

export function updateAsset(projectId: number, id: number, data: Partial<AssetWriteInput>, imageFile?: File | null): Promise<ApiAsset> {
  if (!imageFile) return request<ApiAsset>(projectPath(projectId, `/assets/${id}`), { method: 'PUT', body: JSON.stringify(data) })
  const formData = new FormData()
  formData.set('data', JSON.stringify(data))
  formData.set('image', imageFile)
  return request<ApiAsset>(projectPath(projectId, `/assets/${id}`), { method: 'PUT', body: formData })
}

export function uploadAssetImage(projectId: number, id: number, imageFile: File): Promise<ApiAsset> {
  const formData = new FormData()
  formData.set('image', imageFile)
  return request<ApiAsset>(projectPath(projectId, `/assets/${id}/image`), { method: 'POST', body: formData })
}

export function removeAssetImage(projectId: number, id: number): Promise<ApiAsset> {
  return request<ApiAsset>(projectPath(projectId, `/assets/${id}/image`), { method: 'DELETE' })
}

export function updateAssetStatus(projectId: number, id: number, statusId: number): Promise<ApiAsset> {
  return request<ApiAsset>(projectPath(projectId, `/assets/${id}/status`), { method: 'PATCH', body: JSON.stringify({ statusId }) })
}

export const changeAssetStatus = updateAssetStatus

export function deleteAsset(projectId: number, id: number): Promise<void> {
  return request<void>(projectPath(projectId, `/assets/${id}`), { method: 'DELETE' })
}

export function restoreAsset(projectId: number, id: number): Promise<ApiAsset> {
  return request<ApiAsset>(projectPath(projectId, `/assets/${id}/restore`), { method: 'POST' })
}

export function purgeAsset(projectId: number, id: number): Promise<void> {
  return request<void>(projectPath(projectId, `/assets/${id}/purge`), { method: 'POST' })
}

export function fetchAssetTypes(projectId: number, options?: { includeInactive?: boolean; withCounts?: boolean }): Promise<ApiAssetType[]> {
  const query = new URLSearchParams()
  if (options?.includeInactive) query.set('includeInactive', 'true')
  if (options?.withCounts) query.set('withCounts', 'true')
  const q = query.toString()
  return request<ApiAssetType[]>(`${projectPath(projectId, '/asset-types')}${q ? `?${q}` : ''}`)
}

export function fetchConfiguredAssetTypes(projectId: number, includeInactive = false): Promise<ApiAssetType[]> {
  return fetchAssetTypes(projectId, { includeInactive, withCounts: true })
}

export function createAssetType(projectId: number, input: AssetTypeInput): Promise<ApiAssetType> {
  return request<ApiAssetType>(`/projects/${projectId}/asset-types`, { method: 'POST', body: JSON.stringify(input) })
}

export function updateAssetType(projectId: number, id: number, input: Partial<AssetTypeInput>): Promise<ApiAssetType> {
  return request<ApiAssetType>(`/projects/${projectId}/asset-types/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function archiveAssetType(projectId: number, id: number): Promise<void> {
  return request<void>(`/projects/${projectId}/asset-types/${id}`, { method: 'DELETE' })
}

export function fetchDynamicFieldDefinitions(projectId: number, options?: { includeInactive?: boolean; assetTypeId?: number }): Promise<ApiDynamicFieldDefinition[]> {
  const query = new URLSearchParams()
  if (options?.includeInactive) query.set('includeInactive', 'true')
  if (options?.assetTypeId) query.set('assetTypeId', String(options.assetTypeId))
  const q = query.toString()
  return request<ApiDynamicFieldDefinition[]>(`/projects/${projectId}/dynamic-fields${q ? `?${q}` : ''}`)
}

export function createDynamicFieldDefinition(projectId: number, input: DynamicFieldDefinitionInput): Promise<ApiDynamicFieldDefinition> {
  return request<ApiDynamicFieldDefinition>(`/projects/${projectId}/dynamic-fields`, { method: 'POST', body: JSON.stringify(input) })
}

export function updateDynamicFieldDefinition(projectId: number, id: number, input: Partial<DynamicFieldDefinitionInput>): Promise<ApiDynamicFieldDefinition> {
  return request<ApiDynamicFieldDefinition>(`/projects/${projectId}/dynamic-fields/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function archiveDynamicFieldDefinition(projectId: number, id: number): Promise<void> {
  return request<void>(`/projects/${projectId}/dynamic-fields/${id}`, { method: 'DELETE' })
}

export function fetchTasks(projectId: number, includeInactive = false): Promise<ApiTask[]> { return request<ApiTask[]>(`/projects/${projectId}/tasks${includeInactive ? '?includeInactive=true' : ''}`) }
export function createTask(projectId: number, input: Pick<ApiTask, 'code' | 'name'>): Promise<ApiTask> { return request(`/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(input) }) }
export function updateTask(projectId: number, id: number, input: Partial<Pick<ApiTask, 'code' | 'name' | 'isActive'>>): Promise<ApiTask> { return request(`/projects/${projectId}/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }) }
export function deleteTask(projectId: number, id: number): Promise<void> { return request(`/projects/${projectId}/tasks/${id}`, { method: 'DELETE' }) }
export function bulkUpdateTasks(projectId: number, action: 'deactivate' | 'delete', ids: number[]): Promise<void> { return request(`/projects/${projectId}/tasks/bulk`, { method: 'POST', body: JSON.stringify({ action, ids }) }) }

export function fetchPreventivePlans(projectId: number, options?: { includeInactive?: boolean; assetTypeId?: number }): Promise<ApiPreventivePlanTemplate[]> {
  const query = new URLSearchParams()
  if (options?.includeInactive) query.set('includeInactive', 'true')
  if (options?.assetTypeId) query.set('assetTypeId', String(options.assetTypeId))
  const q = query.toString()
  return request<ApiPreventivePlanTemplate[]>(`/projects/${projectId}/preventive-plans${q ? `?${q}` : ''}`)
}
export function fetchPreventivePlan(projectId: number, id: number): Promise<ApiPreventivePlanTemplate> { return request(`/projects/${projectId}/preventive-plans/${id}`) }
export function createPreventivePlan(projectId: number, input: PreventivePlanInput): Promise<ApiPreventivePlanTemplate> { return request(`/projects/${projectId}/preventive-plans`, { method: 'POST', body: JSON.stringify(input) }) }
export function updatePreventivePlan(projectId: number, id: number, input: Partial<PreventivePlanInput>): Promise<ApiPreventivePlanTemplate> { return request(`/projects/${projectId}/preventive-plans/${id}`, { method: 'PATCH', body: JSON.stringify(input) }) }
export function duplicatePreventivePlan(projectId: number, id: number): Promise<ApiPreventivePlanTemplate> { return request(`/projects/${projectId}/preventive-plans/${id}/duplicate`, { method: 'POST' }) }
export function deletePreventivePlan(projectId: number, id: number): Promise<void> { return request(`/projects/${projectId}/preventive-plans/${id}`, { method: 'DELETE' }) }
export function bulkUpdatePreventivePlans(projectId: number, action: 'deactivate' | 'delete', ids: number[]): Promise<void> { return request(`/projects/${projectId}/preventive-plans/bulk`, { method: 'POST', body: JSON.stringify({ action, ids }) }) }

export function completeAssetDynamicDate(projectId: number, assetId: number, definitionId: number, performedDate: string): Promise<ApiAsset> {
  return request<ApiAsset>(projectPath(projectId, `/assets/${assetId}/dynamic-fields/${definitionId}/complete`), { method: 'POST', body: JSON.stringify({ performedDate }) })
}

export function fetchAssetEventHistory(projectId: number, assetId: number): Promise<ApiAssetEventHistory[]> { return request(projectPath(projectId, `/assets/${assetId}/events`)) }
export function fetchAssetHistory(projectId: number, assetId: number, page = 1): Promise<ApiAssetHistoryPage> { return request(projectPath(projectId, `/assets/${assetId}/history?page=${page}&limit=20`)) }
export function completeAssetEvent(projectId: number, assetId: number, source: ApiAssetEventHistory['source'], id: number, performedDate: string): Promise<ApiAsset> { return request(projectPath(projectId, `/assets/${assetId}/events/complete`), { method: 'POST', body: JSON.stringify({ source, id, performedDate }) }) }
export function createAssetPreventive(projectId: number, assetId: number, input: { planId: number; scheduledDate: string }): Promise<ApiAsset> { return request(projectPath(projectId, `/assets/${assetId}/preventives`), { method: 'POST', body: JSON.stringify(input) }) }
export function updateAssetPreventiveDate(projectId: number, assetId: number, planId: number, scheduledDate: string): Promise<ApiAsset> { return request(projectPath(projectId, `/assets/${assetId}/preventives/${planId}`), { method: 'PATCH', body: JSON.stringify({ scheduledDate }) }) }
export function deleteAssetPreventive(projectId: number, assetId: number, planId: number): Promise<ApiAsset> { return request(projectPath(projectId, `/assets/${assetId}/preventives/${planId}`), { method: 'DELETE' }) }
export function completePreventiveTask(projectId: number, assetId: number, executionId: number, taskId: number): Promise<ApiAsset> { return request(projectPath(projectId, `/assets/${assetId}/preventives/executions/${executionId}/tasks/${taskId}/complete`), { method: 'POST' }) }
export function completeAllPreventiveTasks(projectId: number, assetId: number, executionId: number): Promise<ApiAsset> { return request(projectPath(projectId, `/assets/${assetId}/preventives/executions/${executionId}/tasks/complete`), { method: 'POST' }) }

export function fetchCalendar(projectId: number, input: Omit<CalendarQuery, 'projectId'>): Promise<ApiCalendarResponse> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) if (value !== undefined && value !== '') query.set(key, String(value))
  return request<ApiCalendarResponse>(`${projectPath(projectId, '/calendar')}?${query.toString()}`)
}
export function createCalendarEvent(projectId: number, input: Omit<CalendarManualEventInput, 'projectId'>): Promise<ApiCalendarEventOccurrence> {
  return request(projectPath(projectId, '/calendar/events'), { method: 'POST', body: JSON.stringify(input) })
}
export function updateCalendarEvent(projectId: number, id: number, input: Partial<Pick<CalendarManualEventInput, 'title' | 'date' | 'category' | 'assetId'>>): Promise<ApiCalendarEventOccurrence> {
  return request(projectPath(projectId, `/calendar/events/${id}`), { method: 'PATCH', body: JSON.stringify(input) })
}
export function deleteCalendarEvent(projectId: number, id: number): Promise<void> { return request(projectPath(projectId, `/calendar/events/${id}`), { method: 'DELETE' }) }
export function completeCalendarEvent(input: Pick<ApiCalendarEventOccurrence, 'source' | 'sourceId' | 'assetId' | 'projectId'> & { performedDate: string }): Promise<void> {
  return request<void>(projectPath(input.projectId, '/calendar/events/complete'), { method: 'POST', body: JSON.stringify(input) })
}

export function fetchStatuses(projectId: number): Promise<ApiStatus[]> {
  return request<ApiStatus[]>(projectPath(projectId, '/statuses'))
}

export function fetchConfiguredStatuses(projectId: number, includeInactive = false): Promise<ApiStatus[]> {
  return request<ApiStatus[]>(`/projects/${projectId}/statuses${includeInactive ? '?includeInactive=true' : ''}`)
}

export function createStatus(projectId: number, input: StatusInput): Promise<ApiStatus> {
  return request<ApiStatus>(`/projects/${projectId}/statuses`, { method: 'POST', body: JSON.stringify(input) })
}

export function updateStatus(projectId: number, id: number, input: StatusUpdateInput): Promise<ApiStatus> {
  return request<ApiStatus>(`/projects/${projectId}/statuses/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function archiveStatus(projectId: number, id: number): Promise<void> {
  return request<void>(`/projects/${projectId}/statuses/${id}`, { method: 'DELETE' })
}

export async function fetchLocations(projectId: number, options?: { parentId?: number | null; limit?: number }): Promise<ApiLocationsResponse> {
  const query = new URLSearchParams()
  if (options && Object.prototype.hasOwnProperty.call(options, 'parentId')) query.set('parentId', options.parentId === null ? 'root' : String(options.parentId))
  if (options?.limit) query.set('limit', String(options.limit))
  const res = await request<ApiLocationsResponse>(`${projectPath(projectId, '/locations')}${query.size ? `?${query.toString()}` : ''}`)
  return { ...res, locations: res.locations ?? res.tree ?? [] }
}
export async function fetchLocationBootstrap(projectId: number): Promise<ApiLocationBootstrapResponse> {
  const res = await request<ApiLocationBootstrapResponse>(projectPath(projectId, '/locations/bootstrap'))
  return { ...res, locations: res.locations ?? res.tree ?? [], selectedId: res.selectedId ?? null, openBranchIds: res.openBranchIds ?? [] }
}
export function searchLocations(projectId: number, search = '', limit = 20): Promise<{ data: ApiLocation[] }> {
  const query = new URLSearchParams({ search, limit: String(limit) })
  return request(`${projectPath(projectId, '/locations/search')}?${query.toString()}`)
}

export function fetchLocation(projectId: number, id: number): Promise<ApiLocationDetail> {
  return request<ApiLocationDetail>(projectPath(projectId, `/locations/${id}`))
}

export function fetchLocationAssets(projectId: number, id: number, params: { page?: number; limit?: number; search?: string } = {}): Promise<{ data: ApiLocationAsset[]; total: number; page: number; totalPages: number }> {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.search) query.set('search', params.search)
  return request(`${projectPath(projectId, `/locations/${id}/assets`)}${query.size ? `?${query.toString()}` : ''}`)
}

export function createLocation(projectId: number, data: Omit<LocationWriteInput, 'projectId'>): Promise<ApiLocation> {
  return request<ApiLocation>(projectPath(projectId, '/locations'), { method: 'POST', body: JSON.stringify(data) })
}

export function updateLocation(projectId: number, id: number, data: Partial<Omit<LocationWriteInput, 'projectId'>>): Promise<ApiLocation> {
  return request<ApiLocation>(projectPath(projectId, `/locations/${id}`), { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteLocation(projectId: number, id: number): Promise<void> {
  return request<void>(projectPath(projectId, `/locations/${id}`), { method: 'DELETE' })
}

export function fetchFloorPlans(projectId: number, locationId?: number): Promise<{ data: ApiFloorPlan[] }> {
  const query = new URLSearchParams()
  if (locationId) query.set('locationId', String(locationId))
  return request(`${projectPath(projectId, '/floor-plans')}?${query.toString()}`)
}

export function fetchFloorPlan(projectId: number, id: number): Promise<ApiFloorPlan> {
  return request(projectPath(projectId, `/floor-plans/${id}`))
}

export function fetchFloorPlanAssets(projectId: number, id: number, search = '', limit = 20): Promise<{ data: ApiFloorPlanAsset[] }> {
  const query = new URLSearchParams({ limit: String(limit) })
  if (search.trim()) query.set('search', search.trim())
  return request(`${projectPath(projectId, `/floor-plans/${id}/assets`)}?${query.toString()}`)
}
export function fetchFloorPlanFacets(projectId: number, id: number): Promise<{ types: ApiFloorPlanFacet[] }> {
  return request(projectPath(projectId, `/floor-plans/${id}/facets`))
}
export function fetchFloorPlanMarkers(projectId: number, id: number, page: number, limit = 500): Promise<{ data: ApiFloorPlanMarker[]; total: number; page: number; totalPages: number }> {
  return request(`${projectPath(projectId, `/floor-plans/${id}/markers`)}?page=${page}&limit=${limit}`)
}

export function fetchAssetFloorPlanPlacements(projectId: number, assetId: number): Promise<{ data: ApiAssetFloorPlanPlacement[] }> {
  return request(projectPath(projectId, `/assets/${assetId}/floor-plans`))
}

function floorPlanFormData(input: FloorPlanWriteInput, file: File): FormData {
  const form = new FormData()
  form.set('name', input.name)
  form.set('projectId', String(input.projectId))
  form.set('locationId', String(input.locationId))
  form.set('file', file)
  return form
}

export function createFloorPlan(projectId: number, input: Omit<FloorPlanWriteInput, 'projectId'>, file: File): Promise<ApiFloorPlan> {
  return request(projectPath(projectId, '/floor-plans'), { method: 'POST', body: floorPlanFormData({ ...input, projectId }, file) })
}

export function updateFloorPlan(projectId: number, id: number, input: Partial<Omit<FloorPlanWriteInput, 'projectId'>>): Promise<ApiFloorPlan> {
  return request(projectPath(projectId, `/floor-plans/${id}`), { method: 'PATCH', body: JSON.stringify(input) })
}

export function deleteFloorPlan(projectId: number, id: number): Promise<void> {
  return request<void>(projectPath(projectId, `/floor-plans/${id}`), { method: 'DELETE' })
}

export function createFloorPlanVersion(projectId: number, id: number, file: File): Promise<ApiFloorPlan> {
  const form = new FormData()
  form.set('file', file)
  return request(projectPath(projectId, `/floor-plans/${id}/versions`), { method: 'POST', body: form })
}

export function createFloorPlanMarker(projectId: number, id: number, input: Pick<ApiFloorPlanMarker, 'assetId' | 'x' | 'y'>): Promise<ApiFloorPlanMarker> {
  return request(projectPath(projectId, `/floor-plans/${id}/markers`), { method: 'POST', body: JSON.stringify(input) })
}

export function updateFloorPlanMarker(projectId: number, id: number, markerId: number, input: Pick<ApiFloorPlanMarker, 'x' | 'y'>): Promise<ApiFloorPlanMarker> {
  return request(projectPath(projectId, `/floor-plans/${id}/markers/${markerId}`), { method: 'PATCH', body: JSON.stringify(input) })
}

export function deleteFloorPlanMarker(projectId: number, id: number, markerId: number): Promise<void> {
  return request<void>(projectPath(projectId, `/floor-plans/${id}/markers/${markerId}`), { method: 'DELETE' })
}

export function floorPlanDziUrl(projectId: number, id: number, version: number): string {
  return `${API_BASE}${projectPath(projectId, `/floor-plans/${id}/versions/${version}/dzi`)}`
}

export function fetchUsers(projectId: number): Promise<ApiUserRef[]> {
  return request<ApiUserRef[]>(projectPath(projectId, '/users'))
}

export function fetchSession(): Promise<ApiSession> {
  return request<ApiSession>('/auth/session')
}

export function login(email: string, password: string): Promise<ApiSession> {
  return request<ApiSession>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
}

export function register(input: {
  name: string
  workspaceName: string
  email: string
  password: string
  confirmPassword: string
  termsAccepted?: boolean
}): Promise<{ message: string; email: string }> {
  return request<{ message: string; email: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function verifyEmail(token: string): Promise<ApiSession> {
  return request<ApiSession>('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
}

export function resendVerification(email: string): Promise<{ message: string }> {
  return request<{ message: string }>('/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function forgotPassword(email: string): Promise<{ message: string }> {
  return request<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function resetPassword(input: {
  token: string
  newPassword: string
  confirmPassword: string
}): Promise<{ message: string }> {
  return request<{ message: string }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function logout(): Promise<void> {
  return request<void>('/auth/logout', { method: 'POST' })
}

export function changePassword(input: { currentPassword: string; newPassword: string; confirmPassword: string }): Promise<void> {
  return request<void>('/auth/password', { method: 'POST', body: JSON.stringify(input) })
}

export function fetchBillingStatus(): Promise<import('@/types').ApiBillingStatus> {
  return request<import('@/types').ApiBillingStatus>('/billing/status')
}

export function createBillingCheckoutSession(): Promise<{ checkoutUrl: string }> {
  return request<{ checkoutUrl: string }>('/billing/checkout', { method: 'POST' })
}

export function createBillingPortalSession(): Promise<{ portalUrl: string }> {
  return request<{ portalUrl: string }>('/billing/portal', { method: 'POST' })
}

export function reconcileBilling(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>('/billing/reconcile', { method: 'POST' })
}

export function fetchAdminWorkspaces(options: {
  search?: string
  status?: string
  page?: number
  limit?: number
} = {}): Promise<{ data: import('@/types').ApiAdminWorkspace[]; total: number; page: number; limit: number; totalPages: number }> {
  const query = new URLSearchParams()
  if (options.search?.trim()) query.set('search', options.search.trim())
  if (options.status && options.status !== 'all') query.set('status', options.status)
  if (options.page) query.set('page', String(options.page))
  if (options.limit) query.set('limit', String(options.limit))
  return request(`/admin/workspaces${query.size ? `?${query.toString()}` : ''}`)
}

export function fetchAdminWorkspace(workspaceId: number): Promise<import('@/types').ApiAdminWorkspace & { members: Array<import('@/types').User & { role: string }> }> {
  return request(`/admin/workspaces/${workspaceId}`)
}

export function adminExtendTrial(workspaceId: number, input: { days?: number; untilDate?: string }): Promise<{ workspaceId: number; billingStatus: string; trialEndsAt?: string }> {
  return request(`/admin/workspaces/${workspaceId}/extend-trial`, { method: 'POST', body: JSON.stringify(input) })
}

export function adminSuspendWorkspace(workspaceId: number, reason?: string): Promise<{ workspaceId: number; billingStatus: string }> {
  return request(`/admin/workspaces/${workspaceId}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) })
}

export function adminReactivateWorkspace(workspaceId: number): Promise<{ workspaceId: number; billingStatus: string }> {
  return request(`/admin/workspaces/${workspaceId}/reactivate`, { method: 'POST' })
}

export function fetchProjects(options: { search?: string; status?: ApiProjectStatus | 'ALL'; sort?: 'updatedAt' | 'name' | 'code' | 'createdAt'; page?: number; limit?: number } = {}): Promise<ApiProjectListResponse> {
  const query = new URLSearchParams()
  if (options.search?.trim()) query.set('search', options.search.trim())
  if (options.status) query.set('status', options.status === 'ALL' ? 'all' : options.status === 'ACTIVE' ? 'active' : 'archived')
  if (options.sort) query.set('sort', options.sort === 'updatedAt' ? 'updated' : options.sort === 'createdAt' ? 'created' : options.sort)
  if (options.page) query.set('page', String(options.page))
  if (options.limit) query.set('limit', String(options.limit))
  return request<ApiProjectListResponse>(`/projects${query.size ? `?${query.toString()}` : ''}`)
}

export function fetchProject(projectId: number): Promise<ApiProjectSummary> {
  return request<ApiProjectSummary>(`/projects/${projectId}`)
}

export function createProject(input: ProjectInput): Promise<ApiProjectSummary> {
  return request<ApiProjectSummary>('/projects', { method: 'POST', body: JSON.stringify(input) })
}

export function updateProject(projectId: number, input: Partial<Pick<ProjectInput, 'code' | 'name' | 'description' | 'themeKey'>>): Promise<ApiProjectSummary> {
  return request<ApiProjectSummary>(`/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function archiveProject(projectId: number): Promise<ApiProjectSummary> {
  return request<ApiProjectSummary>(`/projects/${projectId}/archive`, { method: 'POST' })
}

export function restoreProject(projectId: number): Promise<ApiProjectSummary> {
  return request<ApiProjectSummary>(`/projects/${projectId}/restore`, { method: 'POST' })
}

export function copyProjectConfiguration(projectId: number, sourceProjectId: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/projects/${projectId}/copy-configuration`, { method: 'POST', body: JSON.stringify({ sourceProjectId }) })
}

export function fetchProjectMembers(projectId: number, options: { search?: string; page?: number; limit?: number } = {}): Promise<{ data: ApiProjectMember[]; total: number; page: number; limit: number; totalPages: number }> {
  const query = new URLSearchParams()
  if (options.search?.trim()) query.set('search', options.search.trim())
  if (options.page) query.set('page', String(options.page))
  if (options.limit) query.set('limit', String(options.limit))
  return request(`/projects/${projectId}/members${query.size ? `?${query.toString()}` : ''}`)
}

export function addProjectMember(projectId: number, input: { userId: number; role: ApiProjectRole }): Promise<ApiProjectMember> {
  return request<ApiProjectMember>(`/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify(input) })
}

export function updateProjectMember(projectId: number, userId: number, role: ApiProjectRole): Promise<ApiProjectMember> {
  return request<ApiProjectMember>(`/projects/${projectId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) })
}

export function removeProjectMember(projectId: number, userId: number): Promise<void> {
  return request<void>(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' })
}

export interface ApiManagedUser extends ApiUserRef { email: string; role: string; isActive: boolean; createdAt: string; updatedAt: string; projectRole?: ApiProjectRole }
export function fetchManagedUsers(projectId: number, search = ''): Promise<{ data: ApiManagedUser[]; total: number; page: number; totalPages: number }> {
  const query = new URLSearchParams({ projectId: String(projectId) })
  if (search.trim()) query.set('search', search.trim())
  return request(`/users?${query}`)
}
export function createManagedUser(input: { projectId: number; name: string; email: string; password: string; initials: string; color: string; isActive: boolean; role: ApiProjectRole }): Promise<ApiManagedUser> {
  return request<ApiManagedUser>('/users', { method: 'POST', body: JSON.stringify(input) })
}
export function updateManagedUser(userId: number, input: { projectId: number; name?: string; email?: string; initials?: string; color?: string; isActive?: boolean }): Promise<ApiManagedUser> {
  return request<ApiManagedUser>(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export async function fetchDocuments(projectId: number, params: Omit<DocumentListParams, 'projectId'> = {}): Promise<ApiDocumentListResponse> {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') q.set(key, String(value))
  return request<ApiDocumentListResponse>(`${projectPath(projectId, '/documents')}?${q.toString()}`)
}

export function fetchDocumentKpis(projectId: number): Promise<{ vigente: number; porVencer: number; vencido: number; total: number }> {
  return request(projectPath(projectId, '/documents/kpis'))
}

export function fetchDocument(projectId: number, id: number): Promise<ApiDocumentDetail> {
  return request(projectPath(projectId, `/documents/${id}`))
}

export function createDocument(projectId: number, input: Omit<DocumentMetadataInput, 'projectId'>, file: File): Promise<ApiDocument> {
  return request(projectPath(projectId, '/documents'), { method: 'POST', body: documentFormData({ ...input, projectId }, file) })
}

export function createDocumentVersion(projectId: number, id: number, input: Pick<DocumentMetadataInput, 'issueDate' | 'expiryDate'>, file: File): Promise<ApiDocument> {
  const body = new FormData()
  body.set('issueDate', input.issueDate)
  if (input.expiryDate) body.set('expiryDate', input.expiryDate)
  body.set('file', file)
  return request(projectPath(projectId, `/documents/${id}/versions`), { method: 'POST', body })
}

export function updateDocument(projectId: number, id: number, input: Partial<Omit<DocumentMetadataInput, 'projectId'>>): Promise<ApiDocument> {
  return request(projectPath(projectId, `/documents/${id}`), { method: 'PATCH', body: JSON.stringify(input) })
}

export function deleteDocument(projectId: number, id: number): Promise<void> {
  return request<void>(projectPath(projectId, `/documents/${id}`), { method: 'DELETE' })
}

export async function fetchDocumentPreview(projectId: number, id: number, version?: number): Promise<Blob> {
  const suffix = version ? `/versions/${version}/preview` : '/preview'
  const response = await fetch(`${API_BASE}${projectPath(projectId, `/documents/${id}${suffix}`)}`)
  if (!response.ok) throw new Error(`API ${response.status}: preview failed`)
  return response.blob()
}

export async function downloadDocument(projectId: number, id: number, version?: number): Promise<void> {
  const suffix = version ? `/versions/${version}/download` : '/download'
  const response = await fetch(`${API_BASE}${projectPath(projectId, `/documents/${id}${suffix}`)}`)
  if (!response.ok) throw new Error(`API ${response.status}: download failed`)
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = ''
  link.click()
  URL.revokeObjectURL(url)
}

function documentFormData(input: DocumentMetadataInput, file: File): FormData {
  const body = new FormData()
  body.set('name', input.name)
  body.set('type', input.type)
  body.set('projectId', String(input.projectId))
  if (input.assetIds && input.assetIds.length > 0) body.set('assetIds', JSON.stringify(input.assetIds))
  body.set('issueDate', input.issueDate)
  if (input.expiryDate) body.set('expiryDate', input.expiryDate)
  if (input.periodicity) body.set('periodicity', input.periodicity)
  if (input.periodicityMode) body.set('periodicityMode', input.periodicityMode)
  body.set('file', file)
  return body
}

export interface ApiDashboardResponse {
  project: {
    id: number
    code: string
    name: string
  }
  referenceDate: string
  kpis: DashboardKpi[]
  upcomingExpirations: UpcomingExpiration[]
  criticalAlerts: AlertItem[]
  criticalAlertCount?: number
  chartBars: ChartBar[]
  activityFeed: ActivityItem[]
}

export function fetchDashboard(projectId: number, params?: { range?: '30d' | '7d' | 'year' }): Promise<ApiDashboardResponse> {
  const q = new URLSearchParams()
  if (params?.range) q.set('range', params.range)
  const queryStr = q.toString()
  return request<ApiDashboardResponse>(`${projectPath(projectId, '/dashboard')}${queryStr ? `?${queryStr}` : ''}`)
}

export async function downloadDashboardExport(projectId: number, params?: { range?: '30d' | '7d' | 'year' }): Promise<void> {
  const q = new URLSearchParams()
  if (params?.range) q.set('range', params.range)
  const queryStr = q.toString()
  const response = await fetch(`${API_BASE}${projectPath(projectId, '/dashboard/export')}${queryStr ? `?${queryStr}` : ''}`)
  if (!response.ok) throw new Error('Error al descargar reporte de dashboard')
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = `dashboard-reporte.csv`
  window.document.body.appendChild(link)
  link.click()
  window.document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export interface ApiSearchAsset {
  id: number
  code: string
  name: string
  serialNumber: string
  locationName: string | null
  typeName: string
  typeIconKey: string | null
  statusName: string
  statusColor: string | null
  pulseDot: string | null
}

export interface ApiSearchDocument {
  id: number
  name: string
  type: string
  periodicity: string | null
  assetCodes: string[]
}

export interface ApiSearchLocation {
  id: number
  code: string
  name: string
  label: string
  parentName: string | null
}

export interface ApiSearchPlan {
  id: number
  name: string
  locationName: string
  locationCode: string
}

export interface ApiSearchEvent {
  id: number
  title: string
  type: string
  date: string
  assetCode: string | null
  assetName: string | null
}

export interface ApiSearchSetting {
  id: string
  kind: 'Tipo de activo' | 'Estado' | 'Campo dinámico' | 'Plan preventivo'
  title: string
  subtitle: string
  path: string
}

export interface ApiSearchHistoryEntry {
  id: number
  action: string
  entityId: string
  detail: string
  timestamp: string
}

export interface ApiGlobalSearchResult {
  query: string
  assets: ApiSearchAsset[]
  documents: ApiSearchDocument[]
  locations: ApiSearchLocation[]
  plans: ApiSearchPlan[]
  events: ApiSearchEvent[]
  settings: ApiSearchSetting[]
  history: ApiSearchHistoryEntry[]
  totalMatches: number
}

export function searchGlobal(projectId: number, query: string, signal?: AbortSignal): Promise<ApiGlobalSearchResult> {
  const q = new URLSearchParams()
  q.set('q', query)
  return request<ApiGlobalSearchResult>(`${projectPath(projectId, '/search')}?${q.toString()}`, { signal })
}

export interface FetchNotificationsParams {
  filter?: 'all' | 'unread' | 'critical'
  limit?: number
  sync?: boolean
}

export function fetchNotifications(projectId: number, params: FetchNotificationsParams = {}): Promise<import('@/types').NotificationsResponse> {
  const q = new URLSearchParams()
  if (params.filter) q.set('filter', params.filter)
  if (params.limit) q.set('limit', String(params.limit))
  if (params.sync !== undefined) q.set('sync', String(params.sync))
  return request<import('@/types').NotificationsResponse>(`${projectPath(projectId, '/notifications')}?${q.toString()}`)
}

export function markNotificationAsRead(projectId: number, id: number, read = true): Promise<import('@/types').ApiNotification> {
  return request<import('@/types').ApiNotification>(projectPath(projectId, `/notifications/${id}/read`), {
    method: 'PATCH',
    body: JSON.stringify({ read }),
  })
}

export function markAllNotificationsAsRead(projectId: number): Promise<{ success: boolean; count: number }> {
  return request<{ success: boolean; count: number }>(projectPath(projectId, '/notifications/read-all'), {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function deleteNotification(projectId: number, id: number): Promise<void> {
  return request<void>(projectPath(projectId, `/notifications/${id}`), {
    method: 'DELETE',
  })
}

export interface ApiHistoryEntry {
  id: number
  timestamp: string
  action: string
  entityId: string
  detail: string
  projectId: number | null
  user: ApiUserRef
}

export interface ApiHistoryQuery {
  search?: string
  userId?: number
  action?: string
  startDate?: string
  endDate?: string
  page?: number
  limit?: number
}

export interface ApiHistoryPage {
  data: ApiHistoryEntry[]
  total: number
  page: number
  totalPages: number
  limit: number
  availableActions: string[]
}

export function fetchHistory(projectId: number, query: ApiHistoryQuery = {}, signal?: AbortSignal): Promise<ApiHistoryPage> {
  const q = new URLSearchParams()
  if (query.search?.trim()) q.set('search', query.search.trim())
  if (query.userId) q.set('userId', String(query.userId))
  if (query.action?.trim()) q.set('action', query.action.trim())
  if (query.startDate) q.set('startDate', query.startDate)
  if (query.endDate) q.set('endDate', query.endDate)
  if (query.page) q.set('page', String(query.page))
  if (query.limit) q.set('limit', String(query.limit))
  const qs = q.toString()
  return request<ApiHistoryPage>(`${projectPath(projectId, '/history')}${qs ? `?${qs}` : ''}`, { signal })
}

export async function downloadHistoryCsv(projectId: number, query: ApiHistoryQuery = {}): Promise<void> {
  const q = new URLSearchParams()
  if (query.search?.trim()) q.set('search', query.search.trim())
  if (query.userId) q.set('userId', String(query.userId))
  if (query.action?.trim()) q.set('action', query.action.trim())
  if (query.startDate) q.set('startDate', query.startDate)
  if (query.endDate) q.set('endDate', query.endDate)
  const qs = q.toString()
  const res = await fetch(`${API_BASE}${projectPath(projectId, '/history/export')}${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error('Error al descargar el archivo CSV')
  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `historial-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}
