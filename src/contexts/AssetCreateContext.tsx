import { createContext, useContext } from 'react'

interface AssetCreateContextValue {
  createRequested: boolean
  requestCreate: () => void
  clearCreateRequest: () => void
}

export const AssetCreateContext = createContext<AssetCreateContextValue | null>(null)

export function useAssetCreateRequest() {
  const context = useContext(AssetCreateContext)
  if (!context) throw new Error('useAssetCreateRequest must be used within AssetCreateProvider')
  return context
}
