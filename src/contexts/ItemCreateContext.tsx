import { createContext, useContext } from 'react'

interface ItemCreateContextValue {
  createRequested: boolean
  requestCreate: () => void
  clearCreateRequest: () => void
}

export const ItemCreateContext = createContext<ItemCreateContextValue | null>(null)

export function useItemCreateRequest() {
  const context = useContext(ItemCreateContext)
  if (!context) throw new Error('useItemCreateRequest must be used within ItemCreateProvider')
  return context
}
