const API_BASE = '/api'

export interface ApiItemType {
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

export interface ApiItemEvent {
  id: string
  title: string
  date: string
  daysUntil: number
  urgency: 'amber' | 'red' | 'slate'
  source: 'event' | 'document' | 'dynamic-field'
  sourceLabel: string
}

export interface ItemWriteInput {
  code: string
  name: string
  serialNumber: string
  serialLabel: string
  installDate: string
  typeId: number
  statusId: number
  location: string
  projectId: number
  responsibleId: number
  initials: string
  dynamicFields?: Record<string, unknown>
}

export interface ApiItem {
  id: number
  code: string
  name: string
  serialNumber: string
  serialLabel: string
  installDate: string
  typeId: number
  statusId: number
  location: string
  projectId: number
  responsibleId: number
  initials: string
  nextEvents: ApiItemEvent[]
  documentCount: number
  documents?: ApiItemDocument[]
  eventCount: number
  type?: { id: number; name: string }
  status?: { id: number; name: string; pulseDot: string | null }
  responsible?: ApiUserRef
  dynamicFields?: Record<string, unknown>
}

export interface ApiItemDocument {
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
  itemId: number | null
  projectId: number
  item: { id: number; code: string; name: string } | null
  project: { id: number; code: string; name: string }
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
  itemId?: number
}

export interface DocumentMetadataInput {
  name: string
  type: string
  projectId: number
  itemId?: number | null
  issueDate: string
  expiryDate?: string | null
}

export interface ApiItemListResponse {
  data: ApiItem[]
  total: number
  page: number
  totalPages: number
}

export interface ItemListParams {
  page?: number
  limit?: number
  search?: string
  typeId?: number
  statusId?: number
  location?: string
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
  return res.json() as Promise<T>
}

function documentFormData(input: DocumentMetadataInput, file: File): FormData {
  const body = new FormData()
  body.set('name', input.name)
  body.set('type', input.type)
  body.set('projectId', String(input.projectId))
  if (input.itemId) body.set('itemId', String(input.itemId))
  body.set('issueDate', input.issueDate)
  if (input.expiryDate) body.set('expiryDate', input.expiryDate)
  body.set('file', file)
  return body
}

export function fetchItems(params: ItemListParams): Promise<ApiItemListResponse> {
  const q = new URLSearchParams()
  if (params.page) q.set('page', String(params.page))
  if (params.limit) q.set('limit', String(params.limit))
  if (params.search) q.set('search', params.search)
  if (params.typeId) q.set('typeId', String(params.typeId))
  if (params.statusId) q.set('statusId', String(params.statusId))
  if (params.location) q.set('location', params.location)
  return request<ApiItemListResponse>(`/items?${q.toString()}`)
}

export function fetchItem(id: number): Promise<ApiItem> {
  return request<ApiItem>(`/items/${id}`)
}

export function createItem(data: ItemWriteInput): Promise<ApiItem> {
  return request<ApiItem>('/items', { method: 'POST', body: JSON.stringify(data) })
}

export function updateItem(id: number, data: Partial<ItemWriteInput>): Promise<ApiItem> {
  return request<ApiItem>(`/items/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function changeItemStatus(id: number, statusId: number): Promise<ApiItem> {
  return request<ApiItem>(`/items/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ statusId }),
  })
}

export function fetchItemTypes(): Promise<ApiItemType[]> {
  return request<ApiItemType[]>('/item-types')
}

export function fetchStatuses(): Promise<ApiStatus[]> {
  return request<ApiStatus[]>('/statuses')
}

export function fetchLocations(): Promise<string[]> {
  return request<string[]>('/locations')
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

export function updateDocument(id: number, input: Partial<Pick<DocumentMetadataInput, 'name' | 'type' | 'projectId' | 'itemId'>>): Promise<ApiDocument> {
  return request(`/documents/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
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
