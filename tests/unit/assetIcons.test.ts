import { describe, expect, it } from 'vitest'
import { resolveAssetIconKey } from '../../src/lib/assetIconRegistry'
import { assetIconDefinitions, DEFAULT_ASSET_ICON_KEY } from '../../shared/assetIconCatalog'

describe('asset icon catalog', () => {
  it('keeps an industrial catalog large enough without becoming an unbounded icon import', () => {
    expect(assetIconDefinitions).toHaveLength(124)
    expect(new Set(assetIconDefinitions.map((icon) => icon.key)).size).toBe(assetIconDefinitions.length)
    expect(new Set(assetIconDefinitions.map((icon) => icon.group)).size).toBeGreaterThanOrEqual(10)
  })

  it('uses the controlled generic icon when a persisted key is unknown', () => {
    expect(resolveAssetIconKey('not-a-docucore-icon')).toBe(DEFAULT_ASSET_ICON_KEY)
    expect(resolveAssetIconKey(null)).toBe(DEFAULT_ASSET_ICON_KEY)
    expect(resolveAssetIconKey('fire-extinguisher')).toBe('fire-extinguisher')
  })
})
