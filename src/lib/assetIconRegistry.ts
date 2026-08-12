import { DEFAULT_ASSET_ICON_KEY, isAssetIconKey, type AssetIconKey } from '../../shared/assetIconCatalog'

export function resolveAssetIconKey(iconKey: string | null | undefined): AssetIconKey {
  return isAssetIconKey(iconKey) ? iconKey : DEFAULT_ASSET_ICON_KEY
}
