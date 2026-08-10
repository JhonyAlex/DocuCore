import type { DocumentPeriodicity, DocumentPeriodicityMode } from '@/lib/periodicity'

const API_BASE = '/api'

export interface ApiAssetType {
  id: number
  name: string
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
  source: 'event' | 'document' | 'dynamic-field'
  sourceLabel: string
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
  dynamicFields?: Record<string, unknown>
}

export interface ApiLocationRef {
  id: number
  name: string
  code: string
  label: string
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
  nextEvents: ApiAssetEvent[]
  documentCount: number
  documents?: ApiAssetDocument[]
  eventCount: number
  type?: { id: number; name: string }
  status?: { id: number; name: string; pulseDot: string | null }
  location?: ApiLocationRef
  responsible?: ApiUserRef
  dynamicFields?: Record<string, unknown>
}

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

export interface ApiLocationsResponse {
  project: { id: number; code: string; name: string; assetCount: number }
  locations: ApiLocation[]
}

export interface ApiLocationAsset {
  id: number
  code: string
  name: string
  installDate: string
  initials: string
  type: { id: number; name: string }
  status: { id: number; name: string; pulseDot: string | null }
}

export interface ApiLocationDetail extends ApiLocation {
  ancestors: Array<{ id: number; name: string }>
  assets: ApiLocationAsset[]
}

export interface LocationWriteInput {
  name: string
  code: string
  surface: string
  parentId: number | null
  responsibleId: number
  projectId: number
}

export interface ApiAssetDocument {
  id: number
  name: string
  type: string
  currentVersion: ApiDocumentVersion | null
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
  type: string
  assets: Array<{ id: number; code: string; name: string }>
  projectId: number
  project: { id: number; code: string; name: string }
  periodicity: DocumentPeriodicity | null
  periodicityMode: DocumentPeriodicityMode | null
  currentVersion: ApiDocumentVersion | null
  status: 'Vigente' | 'Por vencer' | 'Vencido'
}

export interface ApiDocumentDetail extends ApiDocument {
  versions: ApiDocumentVersion[]
}

export interface ApiDocumentListResponse {
  data: ApiDocument[]
  total: number
  page: number
  totalPages: number
}

export interface DocumentListParams {
  page?: number
  limit?: number
  search?: string
  type?: string
  status?: ApiDocument['status']
  projectId?: number
  assetId?: number
}

export interface DocumentMetadataInput {
  name: string
  type: string
  projectId: number
  assetIds?: number[]
  issueDate: string
  expiryDate?: string | null
  periodicity?: DocumentPeriodicity | null
  periodicityMode?: DocumentPeriodicityMode | null
}

export interface ApiAssetListResponse {
  data: ApiAsset[]
  total: number
  page: number
  totalPages: number
}

export interface AssetListParams {
  page?: number
  limit?: number
  search?: string
  typeId?: number
  statusId?: number
  locationId?: number
  trashed?: boolean
}

// UX-04: sugerencias de valores actuales para el formulario de activo.
export type ApiAssetSuggestionField = 'code' | 'name' | 'initials'

export interface ApiAssetSuggestionRow {
  code: string | null
  name: string | null
  initials: string | null
}

export interface ApiAssetSuggestionsResponse {
  values: ApiAssetSuggestionRow[]
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${body || res.statusText}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

function documentFormData(input: DocumentMetadataInput, file: File): FormData {
  const body = new FormData()
  body.set('name', input.name)
  body.set('type', input.type)
  body.set('projectId', String(input.projectId))
  if (input.assetIds?.length) body.set('assetIds', JSON.stringify(input.assetIds))
  body.set('issueDate', input.issueDate)
  if (input.expiryDate) body.set('expiryDate', input.expiryDate)
  if (input.periodicity) {
    body.set('periodicity', input.periodicity)
    body.set('periodicityMode', input.periodicityMode ?? 'Calendario')
  }
  body.set('file', file)
  return body
}

export function fetchAssets(params: AssetListParams): Promise<ApiAssetListResponse> {
  const q = new URLSearchParams()
  if (params.page) q.set('page', String(params.page))
  if (params.limit) q.set('limit', String(params.limit))
  if (params.search) q.set('search', params.search)
  if (params.typeId) q.set('typeId', String(params.typeId))
  if (params.statusId) q.set('statusId', String(params.statusId))
  if (params.locationId) q.set('locationId', String(params.locationId))
  if (params.trashed) q.set('trashed', 'true')
  return request<ApiAssetListResponse>(`/assets?${q.toString()}`)
}

// UX-04: valores actuales de un campo de activo, excluyendo la papelera y, si
// se indica, un activo concreto (el que se está editando).
export function fetchAssetSuggestions(field: ApiAssetSuggestionField, query: string, excludeId?: number): Promise<ApiAssetSuggestionsResponse> {
  const q = new URLSearchParams()
  q.set('field', field)
  if (query.trim() !== '') q.set('q', query)
  if (excludeId !== undefined) q.set('excludeId', String(excludeId))
  return request<ApiAssetSuggestionsResponse>(`/assets/suggestions?${q.toString()}`)
}

export function fetchAsset(id: number): Promise<ApiAsset> {
  return request<ApiAsset>(`/assets/${id}`)
}

export function createAsset(data: AssetWriteInput): Promise<ApiAsset> {
  return request<ApiAsset>('/assets', { method: 'POST', body: JSON.stringify(data) })
}

export function updateAsset(id: number, data: Partial<AssetWriteInput>): Promise<ApiAsset> {
  return request<ApiAsset>(`/assets/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function changeAssetStatus(id: number, statusId: number): Promise<ApiAsset> {
  return request<ApiAsset>(`/assets/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ statusId }),
  })
}

// ITEM-05: el DELETE mueve el activo a la papelera (recuperable 30 días).
export function deleteAsset(id: number): Promise<void> {
  return request<void>(`/assets/${id}`, { method: 'DELETE' })
}

export function restoreAsset(id: number): Promise<ApiAsset> {
  return request<ApiAsset>(`/assets/${id}/restore`, { method: 'POST' })
}

export function purgeAsset(id: number): Promise<void> {
  return request<void>(`/assets/${id}/purge`, { method: 'POST' })
}

export function fetchAssetTypes(): Promise<ApiAssetType[]> {
  return request<ApiAssetType[]>('/asset-types')
}

export function fetchStatuses(): Promise<ApiStatus[]> {
  return request<ApiStatus[]>('/statuses')
}

export function fetchLocations(): Promise<ApiLocationsResponse> {
  return request<ApiLocationsResponse>('/locations')
}

export function fetchLocation(id: number): Promise<ApiLocationDetail> {
  return request<ApiLocationDetail>(`/locations/${id}`)
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

export function fetchUsers(): Promise<ApiUserRef[]> {
  return request<ApiUserRef[]>('/users')
}

export function fetchSession(): Promise<ApiSession> {
  return request<ApiSession>('/session')
}

export function fetchDocuments(params: DocumentListParams = {}): Promise<ApiDocumentListResponse> {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') q.set(key, String(value))
  return request<ApiDocumentListResponse>(`/documents?${q.toString()}`)
}

export function fetchDocumentKpis(): Promise<{ vigente: number; porVencer: number; vencido: number; total: number }> {
  return request('/documents/kpis')
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

export async function fetchDocumentPreview(id: number): Promise<Blob> {
  const response = await fetch(`${API_BASE}/documents/${id}/preview`)
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
