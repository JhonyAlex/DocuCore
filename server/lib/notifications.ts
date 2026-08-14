import { Prisma, type PrismaClient } from '@prisma/client'
import { assetEventClock } from './assetEvents'

export type NotificationCategory = 'expiry' | 'maintenance' | 'status' | 'system'
export type NotificationUrgency = 'critical' | 'warning' | 'info'
export type NotificationTargetType = 'asset' | 'document' | 'calendar' | 'url'

export interface NotificationItem {
  id: number
  projectId: number
  userId: number | null
  title: string
  message: string
  category: NotificationCategory
  urgency: NotificationUrgency
  targetType: NotificationTargetType | null
  targetId: string | null
  readAt: Date | null
  sourceKey: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ListNotificationsParams {
  projectId: number
  filter?: 'all' | 'unread' | 'critical'
  limit?: number
}

export interface NotificationsResult {
  notifications: NotificationItem[]
  unreadCount: number
  total: number
}

/**
 * Prisma's PostgreSQL upsert is normally atomic.  Two simultaneous refreshes
 * can nevertheless race while they both try to insert the same new source
 * key, producing P2002 for one request.  A bell refresh must be idempotent,
 * so the losing request simply updates the record the other one created.
 */
async function upsertGeneratedNotification(
  db: PrismaClient | Prisma.TransactionClient,
  sourceKey: string,
  data: Omit<Prisma.NotificationUncheckedCreateInput, 'sourceKey'>,
): Promise<void> {
  try {
    await db.notification.upsert({
      where: { sourceKey },
      create: { ...data, sourceKey },
      update: {
        title: data.title,
        message: data.message,
        category: data.category,
        urgency: data.urgency,
        targetType: data.targetType,
        targetId: data.targetId,
      },
    })
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
    await db.notification.update({
      where: { sourceKey },
      data: {
        title: data.title,
        message: data.message,
        category: data.category,
        urgency: data.urgency,
        targetType: data.targetType,
        targetId: data.targetId,
      },
    })
  }
}

function formatDateDisplay(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const year = d.getUTCFullYear()
  return `${day}/${month}/${year}`
}

/**
 * Sincroniza notificaciones del proyecto basadas en el estado real del sistema:
 * - Documentos vencidos o próximos a vencer (30 días)
 * - Mantenimientos preventivos atrasados o próximos (14 días)
 * - Activos fuera de servicio o en alerta
 * - Eventos de calendario pendientes
 */
export async function syncProjectNotifications(
  db: PrismaClient | Prisma.TransactionClient,
  projectId: number,
): Promise<void> {
  const now = assetEventClock()
  const in30Days = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 30))
  const in14Days = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 14))

  // 1. Activos fuera de servicio o alerta
  const criticalAssets = await db.asset.findMany({
    where: {
      projectId,
      deletedAt: null,
      status: { name: { in: ['Fuera de servicio', 'Alerta'] } },
    },
    select: {
      id: true,
      code: true,
      name: true,
      statusId: true,
      status: { select: { name: true } },
      location: { select: { label: true, name: true } },
      responsible: { select: { name: true } },
    },
    take: 20,
  })

  for (const asset of criticalAssets) {
    const isOutOfService = asset.status.name === 'Fuera de servicio'
    const title = isOutOfService
      ? `${asset.name} fuera de servicio`
      : `Activo ${asset.code} en alerta`
    const message = `Ubicación: ${asset.location.label || asset.location.name} · Responsable: ${asset.responsible.name}`
    const sourceKey = `asset-status:${asset.id}:${asset.statusId}`

    await upsertGeneratedNotification(db, sourceKey, {
      projectId,
      title,
      message,
      category: 'status',
      urgency: 'critical',
      targetType: 'asset',
      targetId: String(asset.id),
    })
  }

  // 2. Documentos vencidos o por vencer
  const documentsWithExpiry = await db.document.findMany({
    where: {
      projectId,
      OR: [
        { eventTitle: { not: null } },
        { assets: { some: { asset: { deletedAt: null } } } },
      ],
      versions: {
        some: {
          expiryDate: { lte: in30Days },
        },
      },
    },
    include: {
      versions: { orderBy: { version: 'desc' }, take: 1 },
      assets: {
        where: { asset: { deletedAt: null } },
        include: { asset: { select: { id: true, code: true, name: true } } },
        take: 5,
      },
    },
    take: 30,
  })

  for (const doc of documentsWithExpiry) {
    const latestVersion = doc.versions[0]
    if (!latestVersion?.expiryDate) continue
    const expDate = latestVersion.expiryDate
    const isExpired = expDate < now
    const dateStr = formatDateDisplay(expDate)
    const docTitle = doc.eventTitle ?? doc.name
    const assetRef = doc.assets[0]?.asset

    const title = isExpired
      ? `${docTitle} vencido`
      : `${docTitle} próximo a vencer`
    const message = isExpired
      ? `${assetRef ? `Activo: ${assetRef.code} · ` : ''}Venció el ${dateStr} (${doc.type})`
      : `${assetRef ? `Activo: ${assetRef.code} · ` : ''}Vence el ${dateStr} (${doc.type})`
    const sourceKey = isExpired
      ? `doc-expiry:${doc.id}:${latestVersion.version}:${expDate.toISOString().slice(0, 10)}`
      : `doc-upcoming:${doc.id}:${latestVersion.version}:${expDate.toISOString().slice(0, 10)}`

    await upsertGeneratedNotification(db, sourceKey, {
      projectId,
      title,
      message,
      category: 'expiry',
      urgency: isExpired ? 'critical' : 'warning',
      targetType: assetRef ? 'asset' : 'document',
      targetId: assetRef ? String(assetRef.id) : String(doc.id),
    })
  }

  // 3. Mantenimientos preventivos pendientes/atrasados
  const preventiveExecutions = await db.preventiveExecution.findMany({
    where: {
      completedAt: null,
      scheduledDate: { lte: in14Days },
      plan: {
        isActive: true,
        asset: { projectId, deletedAt: null },
      },
    },
    include: {
      plan: {
        include: {
          asset: { select: { id: true, code: true, name: true } },
        },
      },
    },
    take: 20,
  })

  for (const exec of preventiveExecutions) {
    const isOverdue = exec.scheduledDate < now
    const dateStr = formatDateDisplay(exec.scheduledDate)
    const asset = exec.plan.asset
    const title = isOverdue
      ? `Mantenimiento atrasado · ${exec.plan.name}`
      : `Mantenimiento próximo · ${exec.plan.name}`
    const message = `Activo: ${asset.code} · ${isOverdue ? 'Debió realizarse el' : 'Previsto para el'} ${dateStr}`
    const sourceKey = `preventive:${exec.id}:${exec.scheduledDate.toISOString().slice(0, 10)}`

    await upsertGeneratedNotification(db, sourceKey, {
      projectId,
      title,
      message,
      category: 'maintenance',
      urgency: isOverdue ? 'critical' : 'warning',
      targetType: 'asset',
      targetId: String(asset.id),
    })
  }

  // 4. Eventos pendientes atrasados
  const pendingEvents = await db.event.findMany({
    where: {
      projectId,
      completedAt: null,
      date: { lte: in14Days },
    },
    include: {
      asset: { select: { id: true, code: true } },
    },
    take: 20,
  })

  for (const evt of pendingEvents) {
    const isOverdue = evt.date < now
    const dateStr = formatDateDisplay(evt.date)
    const title = isOverdue
      ? `Evento atrasado · ${evt.title}`
      : `Evento próximo · ${evt.title}`
    const message = `${evt.asset ? `Activo: ${evt.asset.code} · ` : ''}Tipo: ${evt.type} · ${dateStr}`
    const sourceKey = `event:${evt.id}:${evt.date.toISOString().slice(0, 10)}`

    await upsertGeneratedNotification(db, sourceKey, {
      projectId,
      title,
      message,
      category: 'system',
      urgency: isOverdue ? 'critical' : 'info',
      targetType: evt.asset ? 'asset' : 'calendar',
      targetId: evt.asset ? String(evt.asset.id) : evt.date.toISOString().slice(0, 10),
    })
  }
}

/**
 * Consulta la lista de notificaciones de un proyecto con soporte para filtros y conteo no leídas.
 */
export async function listNotifications(
  db: PrismaClient | Prisma.TransactionClient,
  params: ListNotificationsParams,
): Promise<NotificationsResult> {
  const { projectId, filter = 'all', limit = 20 } = params

  const whereClause: Prisma.NotificationWhereInput = { projectId }

  if (filter === 'unread') {
    whereClause.readAt = null
  } else if (filter === 'critical') {
    whereClause.urgency = 'critical'
  }

  const [notifications, unreadCount, total] = await Promise.all([
    db.notification.findMany({
      where: whereClause,
      orderBy: [
        { readAt: 'asc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: Math.min(limit, 50),
    }),
    db.notification.count({
      where: { projectId, readAt: null },
    }),
    db.notification.count({
      where: whereClause,
    }),
  ])

  return {
    notifications: notifications as NotificationItem[],
    unreadCount,
    total,
  }
}

/**
 * Marca una notificación individual como leída o no leída.
 */
export async function setNotificationReadStatus(
  db: PrismaClient | Prisma.TransactionClient,
  id: number,
  read: boolean,
): Promise<NotificationItem> {
  const notification = await db.notification.update({
    where: { id },
    data: {
      readAt: read ? new Date() : null,
    },
  })
  return notification as NotificationItem
}

/**
 * Marca todas las notificaciones de un proyecto como leídas.
 */
export async function markAllNotificationsAsRead(
  db: PrismaClient | Prisma.TransactionClient,
  projectId: number,
): Promise<number> {
  const result = await db.notification.updateMany({
    where: { projectId, readAt: null },
    data: { readAt: new Date() },
  })
  return result.count
}

/**
 * Elimina una notificación por su ID.
 */
export async function deleteNotificationById(
  db: PrismaClient | Prisma.TransactionClient,
  id: number,
): Promise<void> {
  await db.notification.delete({
    where: { id },
  })
}
