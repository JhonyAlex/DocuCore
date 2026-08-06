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
  eventCount: number
  type?: { id: number; name: string }
  status?: { id: number; name: string; pulseDot: string | null }
  responsible?: ApiUserRef
  dynamicFields?: Record<string, unknown>
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
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${body || res.statusText}`)
  }
  return res.json() as Promise<T>
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
