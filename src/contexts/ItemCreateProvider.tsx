import { useState } from 'react'
import type { ReactNode } from 'react'
import { ItemCreateContext } from '@/contexts/ItemCreateContext'

export function ItemCreateProvider({ children }: { children: ReactNode }) {
  const [createRequested, setCreateRequested] = useState(false)

  return (
    <ItemCreateContext.Provider value={{ createRequested, requestCreate: () => setCreateRequested(true), clearCreateRequest: () => setCreateRequested(false) }}>
      {children}
    </ItemCreateContext.Provider>
  )
}
