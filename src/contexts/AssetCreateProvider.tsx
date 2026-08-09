import { useState } from 'react'
import type { ReactNode } from 'react'
import { AssetCreateContext } from '@/contexts/AssetCreateContext'

export function AssetCreateProvider({ children }: { children: ReactNode }) {
  const [createRequested, setCreateRequested] = useState(false)

  return (
    <AssetCreateContext.Provider value={{ createRequested, requestCreate: () => setCreateRequested(true), clearCreateRequest: () => setCreateRequested(false) }}>
      {children}
    </AssetCreateContext.Provider>
  )
}
