import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  deleteNotification,
  fetchNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '@/lib/api'
import type { ApiNotification } from '@/types'
import { NotificationContext, type NotificationFilter } from './NotificationContext'
import { useProject } from './ProjectContext'

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { projectId } = useProject()

  const [notifications, setNotifications] = useState<ApiNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<NotificationFilter>('all')
  const [isOpen, setIsOpen] = useState(false)
  const latestRequest = useRef(0)

  const reload = useCallback(
    async (sync = true) => {
      if (!projectId) return
      const requestId = ++latestRequest.current
      setLoading(true)
      setError(null)
      try {
        const res = await fetchNotifications(projectId, {
          filter,
          sync,
          limit: 30,
        })
        if (requestId !== latestRequest.current) return
        setNotifications(res.notifications)
        setUnreadCount(res.unreadCount)
        setTotal(res.total)
      } catch {
        if (requestId === latestRequest.current) setError('Error al cargar notificaciones')
      } finally {
        if (requestId === latestRequest.current) setLoading(false)
      }
    },
    [projectId, filter],
  )

  useEffect(() => {
    void reload(true)
  }, [reload])

  const markAsRead = useCallback(
    async (id: number, read = true) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: read ? new Date().toISOString() : null } : n)),
      )
      setUnreadCount((prev) => (read ? Math.max(0, prev - 1) : prev + 1))
      try {
        if (!projectId) return
        await markNotificationAsRead(projectId, id, read)
      } catch {
        void reload(false)
      }
    },
    [projectId, reload],
  )

  const markAllAsRead = useCallback(async () => {
    if (!projectId) return
    // A filter-triggered request may still be in flight. Its stale unread
    // aggregate must not overwrite this explicit user action.
    latestRequest.current += 1
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })))
    setUnreadCount(0)
    try {
      await markAllNotificationsAsRead(projectId)
    } catch {
      void reload(false)
    }
  }, [projectId, reload])

  const dismissNotification = useCallback(
    async (id: number) => {
      const target = notifications.find((n) => n.id === id)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
      if (target && !target.readAt) {
        setUnreadCount((prev) => Math.max(0, prev - 1))
      }
      setTotal((prev) => Math.max(0, prev - 1))
      try {
        if (!projectId) return
        await deleteNotification(projectId, id)
      } catch {
        void reload(false)
      }
    },
    [notifications, projectId, reload],
  )

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        total,
        loading,
        error,
        filter,
        setFilter,
        reload,
        markAsRead,
        markAllAsRead,
        dismissNotification,
        isOpen,
        setIsOpen,
        toggleOpen,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}
