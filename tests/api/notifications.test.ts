import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase } from '../helpers/database'

let server: Server | undefined
let baseUrl: string

function api(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, init)
}

describe('notifications API', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DOCUCORE_NOW = '2026-07-15T00:00:00.000Z'
    await ensureTestDatabase()
    const { default: app } = await import('../../server/index')
    await new Promise<void>((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${(instance.address() as AddressInfo).port}`
        server = instance
        resolve()
      })
    })
  }, 120_000)

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => server?.close((error) => (error ? reject(error) : resolve())))
    }
  })

  it('GET /api/notifications returns synced notifications with unread count', async () => {
    const res = await api('/api/notifications?projectId=1')
    expect(res.status).toBe(200)

    const data = await res.json() as {
      notifications: Array<{
        id: number
        title: string
        message: string
        category: string
        urgency: string
        readAt: string | null
      }>
      unreadCount: number
      total: number
    }

    expect(data.notifications.length).toBeGreaterThan(0)
    expect(data.unreadCount).toBeGreaterThan(0)
    expect(data.total).toBeGreaterThanOrEqual(data.notifications.length)

    // Verify key notifications are present
    const titles = data.notifications.map((n) => n.title)
    const hasOutOfServiceOrExpiry = titles.some((t) =>
      t.includes('fuera de servicio') || t.includes('vencido') || t.includes('alerta') || t.includes('próximo'),
    )
    expect(hasOutOfServiceOrExpiry).toBe(true)
  })

  it('PATCH /api/notifications/:id/read marks notification as read and unread', async () => {
    const listRes = await api('/api/notifications?projectId=1')
    const listData = await listRes.json() as {
      notifications: Array<{ id: number; readAt: string | null }>
    }

    const first = listData.notifications[0]
    expect(first).toBeDefined()

    // Mark as read
    const patchRes = await api(`/api/notifications/${first.id}/read`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: true }),
    })
    expect(patchRes.status).toBe(200)
    const patched = await patchRes.json() as { id: number; readAt: string | null }
    expect(patched.readAt).not.toBeNull()

    // Mark as unread
    const unreadRes = await api(`/api/notifications/${first.id}/read`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: false }),
    })
    expect(unreadRes.status).toBe(200)
    const unreadPatched = await unreadRes.json() as { id: number; readAt: string | null }
    expect(unreadPatched.readAt).toBeNull()
  })

  it('POST /api/notifications/read-all marks all notifications for project as read', async () => {
    const res = await api('/api/notifications/read-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 1 }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as { success: boolean; count: number }
    expect(data.success).toBe(true)

    // Check that unread count is now 0
    const listRes = await api('/api/notifications?projectId=1&sync=false')
    const listData = await listRes.json() as { unreadCount: number }
    expect(listData.unreadCount).toBe(0)
  })

  it('filters notifications by critical and unread', async () => {
    const critRes = await api('/api/notifications?projectId=1&filter=critical')
    expect(critRes.status).toBe(200)
    const critData = await critRes.json() as {
      notifications: Array<{ urgency: string }>
    }
    for (const n of critData.notifications) {
      expect(n.urgency).toBe('critical')
    }
  })

  it('DELETE /api/notifications/:id deletes notification', async () => {
    const listRes = await api('/api/notifications?projectId=1')
    const listData = await listRes.json() as {
      notifications: Array<{ id: number }>
    }

    const itemToDelete = listData.notifications[listData.notifications.length - 1]
    const delRes = await api(`/api/notifications/${itemToDelete.id}`, { method: 'DELETE' })
    expect(delRes.status).toBe(204)

    // Verify it is gone
    const verifyRes = await api(`/api/notifications/${itemToDelete.id}/read`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: true }),
    })
    expect(verifyRes.status).toBe(404)
  })
})
