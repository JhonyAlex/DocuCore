import {
  isStatusColorKey,
  statusBgMap,
  statusColorDefinitions,
  statusColorMap,
  type StatusColorDefinition,
  type StatusColorKey,
} from './statusCatalog'

// Los tipos de activo y los estados comparten una paleta cerrada para que los
// colores persistan como una clave segura y Tailwind pueda generar sus clases.
export type AssetTypeColorKey = StatusColorKey
export type AssetTypeColorDefinition = StatusColorDefinition

export const assetTypeColorDefinitions = statusColorDefinitions
export const DEFAULT_ASSET_TYPE_COLOR_KEY: AssetTypeColorKey = 'cyan'

export function isAssetTypeColorKey(value: unknown): value is AssetTypeColorKey {
  return isStatusColorKey(value)
}

export const assetTypeColorChipMap = statusColorMap
export const assetTypeColorBgMap = statusBgMap
