import { createContext, useContext } from 'react'
import type { ApiNotification } from '@/types'

export type NotificationFilter = 'all' | 'unread' | 'critical'

export interface NotificationContextValue {
  notifications: ApiNotification[]
  unreadCount: number
  total: number
  loading: boolean
  error: string | null
  filter: NotificationFilter
  setFilter: (filter: NotificationFilter) => void
  reload: (sync?: boolean) => Promise<void>
  markAsRead: (id: number, read?: boolean) => Promise<void>
  markAllAsRead: () => Promise<void>
  dismissNotification: (id: number) => Promise<void>
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  toggleOpen: () => void
}

export const NotificationContext = createContext<NotificationContextValue | null>(null)

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) throw new Error('useNotifications must be used within NotificationProvider')
  return context
}
