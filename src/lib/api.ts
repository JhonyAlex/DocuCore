import type { DocumentPeriodicity, DocumentPeriodicityMode } from '@/lib/periodicity'
import type { AssetIconKey } from '../../shared/assetIconCatalog'

const API_BASE = '/api'

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
  name: string
  pulseDot: string | null
}

export interface ApiUserRef {
  id: number
  name: string
  initials: string
  color: string
}

export interface ApiSessionUser {
  id: number
  name: string
  role: string
  initials: string
  color: string
}

export interface ApiSessionProject {
  id: number
  code: string
  name: string
  assetCount: number
}

export interface ApiSession {
  project: ApiSessionProject
  user: ApiSessionUser
}

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
  status?: { id: number; name: string; pulseDot: string | null }
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
  status: { id: number; name: string; pulseDot: string | null }
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
  status: { id: number; name: string; pulseDot: string | null }
  nextEvents?: ApiAssetEvent[]
  alert?: 'overdue' | 'soon' | 'normal'
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

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers })
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

export async function fetchAssets(params: FetchAssetsParams = {}): Promise<FetchAssetsResponse> {
  const q = new URLSearchParams()
  if (params.page) q.set('page', String(params.page))
  if (params.limit) q.set('limit', String(params.limit))
  if (params.search) q.set('search', params.search)
  if (params.typeId) q.set('typeId', String(params.typeId))
  if (params.statusId) q.set('statusId', String(params.statusId))
  if (params.locationId) q.set('locationId', String(params.locationId))
  if (params.projectId) q.set('projectId', String(params.projectId))
  if (params.trashed) q.set('trashed', 'true')
  const res = await request<FetchAssetsResponse>(`/assets?${q.toString()}`)
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

export async function fetchAssetSuggestions(field: ApiAssetSuggestionField, q = '', excludeId?: number): Promise<ApiAssetSuggestionRow[]> {
  const query = new URLSearchParams({ field })
  if (q.trim()) query.set('q', q.trim())
  if (excludeId) query.set('excludeId', String(excludeId))
  const response = await request<ApiAssetSuggestionsResponse>(`/assets/suggestions?${query.toString()}`)
  return response.values
}

export function fetchAsset(id: number): Promise<ApiAsset> {
  return request<ApiAsset>(`/assets/${id}`)
}

export function createAsset(data: AssetWriteInput, imageFile?: File | null): Promise<ApiAsset> {
  if (!imageFile) return request<ApiAsset>('/assets', { method: 'POST', body: JSON.stringify(data) })
  const formData = new FormData()
  formData.set('data', JSON.stringify(data))
  formData.set('image', imageFile)
  return request<ApiAsset>('/assets', { method: 'POST', body: formData })
}

export function updateAsset(id: number, data: Partial<AssetWriteInput>, imageFile?: File | null): Promise<ApiAsset> {
  if (!imageFile) return request<ApiAsset>(`/assets/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  const formData = new FormData()
  formData.set('data', JSON.stringify(data))
  formData.set('image', imageFile)
  return request<ApiAsset>(`/assets/${id}`, { method: 'PUT', body: formData })
}

export function uploadAssetImage(id: number, imageFile: File): Promise<ApiAsset> {
  const formData = new FormData()
  formData.set('image', imageFile)
  return request<ApiAsset>(`/assets/${id}/image`, { method: 'POST', body: formData })
}

export function removeAssetImage(id: number): Promise<ApiAsset> {
  return request<ApiAsset>(`/assets/${id}/image`, { method: 'DELETE' })
}

export function updateAssetStatus(id: number, statusId: number): Promise<ApiAsset> {
  return request<ApiAsset>(`/assets/${id}/status`, { method: 'PATCH', body: JSON.stringify({ statusId }) })
}

export const changeAssetStatus = updateAssetStatus

export function deleteAsset(id: number): Promise<void> {
  return request<void>(`/assets/${id}`, { method: 'DELETE' })
}

export function restoreAsset(id: number): Promise<ApiAsset> {
  return request<ApiAsset>(`/assets/${id}/restore`, { method: 'POST' })
}

export function purgeAsset(id: number): Promise<void> {
  return request<void>(`/assets/${id}/purge`, { method: 'POST' })
}

export function fetchAssetTypes(projectId = 1, options?: { includeInactive?: boolean; withCounts?: boolean }): Promise<ApiAssetType[]> {
  const query = new URLSearchParams()
  if (options?.includeInactive) query.set('includeInactive', 'true')
  if (options?.withCounts) query.set('withCounts', 'true')
  const q = query.toString()
  return request<ApiAssetType[]>(`/projects/${projectId}/asset-types${q ? `?${q}` : ''}`)
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

export function completeAssetDynamicDate(assetId: number, definitionId: number, performedDate: string): Promise<ApiAsset> {
  return request<ApiAsset>(`/assets/${assetId}/dynamic-fields/${definitionId}/complete`, { method: 'POST', body: JSON.stringify({ performedDate }) })
}

export function fetchAssetEventHistory(assetId: number): Promise<ApiAssetEventHistory[]> { return request(`/assets/${assetId}/events`) }
export function fetchAssetHistory(assetId: number, page = 1): Promise<ApiAssetHistoryPage> { return request(`/assets/${assetId}/history?page=${page}&limit=20`) }
export function completeAssetEvent(assetId: number, source: ApiAssetEventHistory['source'], id: number, performedDate: string): Promise<ApiAsset> { return request(`/assets/${assetId}/events/complete`, { method: 'POST', body: JSON.stringify({ source, id, performedDate }) }) }
export function createAssetPreventive(assetId: number, input: { planId: number; scheduledDate: string }): Promise<ApiAsset> { return request(`/assets/${assetId}/preventives`, { method: 'POST', body: JSON.stringify(input) }) }
export function updateAssetPreventiveDate(assetId: number, planId: number, scheduledDate: string): Promise<ApiAsset> { return request(`/assets/${assetId}/preventives/${planId}`, { method: 'PATCH', body: JSON.stringify({ scheduledDate }) }) }
export function deleteAssetPreventive(assetId: number, planId: number): Promise<ApiAsset> { return request(`/assets/${assetId}/preventives/${planId}`, { method: 'DELETE' }) }
export function completePreventiveTask(assetId: number, executionId: number, taskId: number): Promise<ApiAsset> { return request(`/assets/${assetId}/preventives/executions/${executionId}/tasks/${taskId}/complete`, { method: 'POST' }) }
export function completeAllPreventiveTasks(assetId: number, executionId: number): Promise<ApiAsset> { return request(`/assets/${assetId}/preventives/executions/${executionId}/tasks/complete`, { method: 'POST' }) }

export function fetchCalendar(input: CalendarQuery): Promise<ApiCalendarResponse> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) if (value !== undefined && value !== '') query.set(key, String(value))
  return request<ApiCalendarResponse>(`/calendar?${query.toString()}`)
}
export function createCalendarEvent(input: CalendarManualEventInput): Promise<ApiCalendarEventOccurrence> {
  return request('/calendar/events', { method: 'POST', body: JSON.stringify(input) })
}
export function updateCalendarEvent(id: number, input: Partial<Pick<CalendarManualEventInput, 'title' | 'date' | 'category' | 'assetId'>>): Promise<ApiCalendarEventOccurrence> {
  return request(`/calendar/events/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}
export function deleteCalendarEvent(id: number): Promise<void> { return request(`/calendar/events/${id}`, { method: 'DELETE' }) }
export function completeCalendarEvent(input: Pick<ApiCalendarEventOccurrence, 'source' | 'sourceId' | 'assetId' | 'projectId'> & { performedDate: string }): Promise<void> {
  return request<void>('/calendar/events/complete', { method: 'POST', body: JSON.stringify(input) })
}

export function fetchStatuses(): Promise<ApiStatus[]> {
  return request<ApiStatus[]>('/statuses')
}

export async function fetchLocations(options?: { parentId?: number | null; limit?: number }): Promise<ApiLocationsResponse> {
  const query = new URLSearchParams()
  if (options && Object.prototype.hasOwnProperty.call(options, 'parentId')) query.set('parentId', options.parentId === null ? 'root' : String(options.parentId))
  if (options?.limit) query.set('limit', String(options.limit))
  const res = await request<ApiLocationsResponse>(`/locations${query.size ? `?${query.toString()}` : ''}`)
  return { ...res, locations: res.locations ?? res.tree ?? [] }
}
export function searchLocations(search = '', limit = 20): Promise<{ data: ApiLocation[] }> {
  const query = new URLSearchParams({ search, limit: String(limit) })
  return request(`/locations/search?${query.toString()}`)
}

export function fetchLocation(id: number): Promise<ApiLocationDetail> {
  return request<ApiLocationDetail>(`/locations/${id}`)
}

export function fetchLocationAssets(id: number, params: { page?: number; limit?: number; search?: string } = {}): Promise<{ data: ApiLocationAsset[]; total: number; page: number; totalPages: number }> {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.search) query.set('search', params.search)
  return request(`/locations/${id}/assets${query.size ? `?${query.toString()}` : ''}`)
}

export function createLocation(data: LocationWriteInput): Promise<ApiLocation> {
  return request<ApiLocation>('/locations', { method: 'POST', body: JSON.stringify(data) })
}

export function updateLocation(id: number, data: Partial<LocationWriteInput>): Promise<ApiLocation> {
  return request<ApiLocation>(`/locations/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteLocation(id: number): Promise<void> {
  return request<void>(`/locations/${id}`, { method: 'DELETE' })
}

export function fetchFloorPlans(projectId: number, locationId?: number): Promise<{ data: ApiFloorPlan[] }> {
  const query = new URLSearchParams({ projectId: String(projectId) })
  if (locationId) query.set('locationId', String(locationId))
  return request(`/floor-plans?${query.toString()}`)
}

export function fetchFloorPlan(id: number): Promise<ApiFloorPlan> {
  return request(`/floor-plans/${id}`)
}

export function fetchFloorPlanAssets(id: number, search = '', limit = 20): Promise<{ data: ApiFloorPlanAsset[] }> {
  const query = new URLSearchParams({ limit: String(limit) })
  if (search.trim()) query.set('search', search.trim())
  return request(`/floor-plans/${id}/assets?${query.toString()}`)
}
export function fetchFloorPlanMarkers(id: number, page: number, limit = 500): Promise<{ data: ApiFloorPlanMarker[]; total: number; page: number; totalPages: number }> {
  return request(`/floor-plans/${id}/markers?page=${page}&limit=${limit}`)
}

export function fetchAssetFloorPlanPlacements(assetId: number): Promise<{ data: ApiAssetFloorPlanPlacement[] }> {
  return request(`/assets/${assetId}/floor-plans`)
}

function floorPlanFormData(input: FloorPlanWriteInput, file: File): FormData {
  const form = new FormData()
  form.set('name', input.name)
  form.set('projectId', String(input.projectId))
  form.set('locationId', String(input.locationId))
  form.set('file', file)
  return form
}

export function createFloorPlan(input: FloorPlanWriteInput, file: File): Promise<ApiFloorPlan> {
  return request('/floor-plans', { method: 'POST', body: floorPlanFormData(input, file) })
}

export function updateFloorPlan(id: number, input: Partial<FloorPlanWriteInput>): Promise<ApiFloorPlan> {
  return request(`/floor-plans/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function deleteFloorPlan(id: number): Promise<void> {
  return request<void>(`/floor-plans/${id}`, { method: 'DELETE' })
}

export function createFloorPlanVersion(id: number, file: File): Promise<ApiFloorPlan> {
  const form = new FormData()
  form.set('file', file)
  return request(`/floor-plans/${id}/versions`, { method: 'POST', body: form })
}

export function createFloorPlanMarker(id: number, input: Pick<ApiFloorPlanMarker, 'assetId' | 'x' | 'y'>): Promise<ApiFloorPlanMarker> {
  return request(`/floor-plans/${id}/markers`, { method: 'POST', body: JSON.stringify(input) })
}

export function updateFloorPlanMarker(id: number, markerId: number, input: Pick<ApiFloorPlanMarker, 'x' | 'y'>): Promise<ApiFloorPlanMarker> {
  return request(`/floor-plans/${id}/markers/${markerId}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function deleteFloorPlanMarker(id: number, markerId: number): Promise<void> {
  return request<void>(`/floor-plans/${id}/markers/${markerId}`, { method: 'DELETE' })
}

export function floorPlanDziUrl(id: number, version: number): string {
  return `${API_BASE}/floor-plans/${id}/versions/${version}/dzi`
}

export function fetchUsers(): Promise<ApiUserRef[]> {
  return request<ApiUserRef[]>('/users')
}

export function fetchSession(): Promise<ApiSession> {
  return request<ApiSession>('/session')
}

export async function fetchDocuments(params: DocumentListParams = {}): Promise<ApiDocumentListResponse> {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') q.set(key, String(value))
  return request<ApiDocumentListResponse>(`/documents?${q.toString()}`)
}

export function fetchDocumentKpis(projectId?: number): Promise<{ vigente: number; porVencer: number; vencido: number; total: number }> {
  return request(`/documents/kpis${projectId ? `?projectId=${projectId}` : ''}`)
}

export function fetchDocument(id: number): Promise<ApiDocumentDetail> {
  return request(`/documents/${id}`)
}

export function createDocument(input: DocumentMetadataInput, file: File): Promise<ApiDocument> {
  return request('/documents', { method: 'POST', body: documentFormData(input, file) })
}

export function createDocumentVersion(id: number, input: Pick<DocumentMetadataInput, 'issueDate' | 'expiryDate'>, file: File): Promise<ApiDocument> {
  const body = new FormData()
  body.set('issueDate', input.issueDate)
  if (input.expiryDate) body.set('expiryDate', input.expiryDate)
  body.set('file', file)
  return request(`/documents/${id}/versions`, { method: 'POST', body })
}

export function updateDocument(id: number, input: Partial<Pick<DocumentMetadataInput, 'name' | 'type' | 'projectId' | 'assetIds' | 'issueDate' | 'expiryDate' | 'periodicity' | 'periodicityMode'>>): Promise<ApiDocument> {
  return request(`/documents/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function deleteDocument(id: number): Promise<void> {
  return request(`/documents/${id}`, { method: 'DELETE' })
}

export async function fetchDocumentPreview(id: number, version?: number): Promise<Blob> {
  const suffix = version ? `/versions/${version}/preview` : '/preview'
  const response = await fetch(`${API_BASE}/documents/${id}${suffix}`)
  if (!response.ok) throw new Error(`API ${response.status}: preview failed`)
  return response.blob()
}

export async function downloadDocument(id: number, version?: number): Promise<void> {
  const suffix = version ? `/versions/${version}/download` : '/download'
  const response = await fetch(`${API_BASE}/documents/${id}${suffix}`)
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
