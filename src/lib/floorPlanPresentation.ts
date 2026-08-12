import type { ApiAssetEvent, ApiFloorPlanAsset } from '@/lib/api'

const TYPE_COLORS = ['#3a64ff', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b']

export type FloorPlanLod = 'dot' | 'code' | 'detail'
export type FloorPlanAlert = 'overdue' | 'soon' | 'normal'

export function floorPlanTypeColor(typeId: number): string {
  return TYPE_COLORS[Math.abs(typeId) % TYPE_COLORS.length]
}

export function floorPlanAlert(asset: ApiFloorPlanAsset): FloorPlanAlert {
  const urgency = asset.nextEvents[0]?.urgency
  return urgency === 'red' ? 'overdue' : urgency === 'amber' ? 'soon' : 'normal'
}

export function floorPlanEventOrigin(source: ApiAssetEvent['source']): string {
  if (source === 'document') return 'Documento'
  if (source === 'dynamic-date') return 'Fecha dinámica'
  if (source === 'preventive') return 'Preventivo'
  return 'Evento'
}

export function lodForZoom(zoom: number): FloorPlanLod {
  if (zoom < 1.35) return 'dot'
  if (zoom < 2.4) return 'code'
  return 'detail'
}

export function filterFloorPlanAssets(assets: ApiFloorPlanAsset[], filters: { search: string; typeIds: Set<number>; statusIds: Set<number>; alert: FloorPlanAlert | 'all' }) {
  const needle = filters.search.trim().toLocaleLowerCase('es')
  return assets.filter((asset) =>
    (!needle || `${asset.code} ${asset.name}`.toLocaleLowerCase('es').includes(needle))
    && (filters.typeIds.size === 0 || filters.typeIds.has(asset.type.id))
    && (filters.statusIds.size === 0 || filters.statusIds.has(asset.status.id))
    && (filters.alert === 'all' || floorPlanAlert(asset) === filters.alert),
  )
}
