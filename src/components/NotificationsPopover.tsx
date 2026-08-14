import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications, type NotificationFilter } from '@/contexts/NotificationContext'
import type { ApiNotification } from '@/types'

function getCategoryIcon(notification: ApiNotification) {
  if (notification.urgency === 'critical' || notification.category === 'status') {
    return (
      <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
    )
  }

  if (notification.category === 'maintenance') {
    return (
      <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      </div>
    )
  }

  if (notification.category === 'expiry') {
    return (
      <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </div>
    )
  }

  return (
    <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    </div>
  )
}

function formatRelativeTime(dateIso: string): string {
  const d = new Date(dateIso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 1) return 'Ahora mismo'
  if (diffMinutes < 60) return `Hace ${diffMinutes} min`
  if (diffHours < 24) return `Hace ${diffHours} h`
  if (diffDays === 1) return 'Ayer'
  if (diffDays < 7) return `Hace ${diffDays} días`

  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${day}/${month}`
}

export default function NotificationsPopover() {
  const {
    notifications,
    unreadCount,
    total,
    loading,
    error,
    filter,
    setFilter,
    markAsRead,
    markAllAsRead,
    dismissNotification,
    isOpen,
    setIsOpen,
  } = useNotifications()

  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)

  // Cierre por click exterior y tecla Escape
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setIsOpen(false)
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, setIsOpen])

  if (!isOpen) return null

  const handleNotificationClick = (item: ApiNotification) => {
    void markAsRead(item.id, true)
    setIsOpen(false)

    if (item.targetType === 'asset' && item.targetId) {
      void navigate(`/assets?assetId=${item.targetId}`)
    } else if (item.targetType === 'document') {
      void navigate('/docs')
    } else if (item.targetType === 'calendar') {
      void navigate(`/calendar?view=month&date=${item.targetId || ''}`)
    }
  }

  const handleTabChange = (nextFilter: NotificationFilter) => {
    setFilter(nextFilter)
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Panel de notificaciones"
      className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden fade-in flex flex-col"
      style={{ maxHeight: 'calc(100vh - 5rem)' }}
    >
      {/* Cabecera */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">Notificaciones</h3>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 text-[11px] font-medium rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
              {unreadCount} {unreadCount === 1 ? 'nueva' : 'nuevas'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllAsRead()}
              className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 font-medium px-2 py-1 rounded hover:bg-brand-50 dark:hover:bg-brand-900/30 transition"
              title="Marcar todas como leídas"
            >
              Marcar leídas
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Cerrar panel"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Pestañas de filtro */}
      <div className="px-3 pt-2 pb-1 flex items-center gap-1 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
        <button
          type="button"
          onClick={() => handleTabChange('all')}
          className={`px-2.5 py-1 text-xs font-medium rounded-lg transition ${
            filter === 'all'
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Todas {total > 0 && `(${total})`}
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('unread')}
          className={`px-2.5 py-1 text-xs font-medium rounded-lg transition flex items-center gap-1 ${
            filter === 'unread'
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          No leídas {unreadCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('critical')}
          className={`px-2.5 py-1 text-xs font-medium rounded-lg transition ${
            filter === 'critical'
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Críticas
        </button>
      </div>

      {/* Lista de notificaciones */}
      <div className="overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 flex-1 max-h-96 scrollbar-thin">
        {loading && notifications.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Cargando notificaciones…</div>
        ) : error ? (
          <div className="p-6 text-center text-xs text-red-500">{error}</div>
        ) : notifications.length === 0 ? (
          <div className="py-10 px-4 text-center">
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-2.5">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No hay notificaciones</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {filter === 'unread' ? 'Has leído todas las notificaciones.' : 'Todo se encuentra al día.'}
            </p>
          </div>
        ) : (
          notifications.map((item) => {
            const isUnread = !item.readAt
            return (
              <div
                key={item.id}
                onClick={() => handleNotificationClick(item)}
                className={`p-3.5 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition relative group ${
                  isUnread ? 'bg-brand-50/20 dark:bg-brand-900/10' : ''
                }`}
              >
                {getCategoryIcon(item)}

                <div className="flex-1 min-w-0 pr-6">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-semibold truncate ${
                        isUnread ? 'text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {item.title}
                    </span>
                    {isUnread && (
                      <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0" title="No leída" />
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                    {item.message}
                  </p>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 inline-block">
                    {formatRelativeTime(item.createdAt)}
                  </span>
                </div>

                {/* Acciones flotantes por elemento */}
                <div className="absolute right-2 top-2.5 opacity-0 group-hover:opacity-100 transition flex items-center gap-1 bg-white/90 dark:bg-slate-900/90 rounded px-1 py-0.5 shadow-sm">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void markAsRead(item.id, isUnread)
                    }}
                    className="p-1 text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 rounded"
                    title={isUnread ? 'Marcar como leída' : 'Marcar como no leída'}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void dismissNotification(item.id)
                    }}
                    className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded"
                    title="Descartar"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Pie con accesos directos */}
      <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => {
            setIsOpen(false)
            void navigate('/calendar')
          }}
          className="text-brand-600 dark:text-brand-400 hover:underline font-medium flex items-center gap-1"
        >
          <span>Calendario</span>
          <span>→</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false)
            void navigate('/history')
          }}
          className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          Ver historial
        </button>
      </div>
    </div>
  )
}
