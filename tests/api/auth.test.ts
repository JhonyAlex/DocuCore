import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase } from '../helpers/database'

let server: Server | undefined
let baseUrl = ''
const raw = (path: string, init: RequestInit = {}) => fetch(`${baseUrl}${path}`, init)
const unauthenticated = { headers: new Headers({ 'x-docucore-test-unauthenticated': 'true' }) }

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl
  await ensureTestDatabase()
  const { default: app } = await import('../../server/index')
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => { baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`; resolve() }) })
})
afterAll(async () => { await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve())) })

describe('AUTH-01 authentication', () => {
  it('authenticates valid credentials with an HTTP-only cookie and rejects generic invalid attempts', async () => {
    const valid = await raw('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'MARIA@DOCUCORE.LOCAL', password: 'DocuCore!2026' }) })
    expect(valid.status).toBe(200)
    expect(valid.headers.get('set-cookie')).toContain('HttpOnly')
    expect(valid.headers.get('set-cookie')).toContain('SameSite=Lax')
    expect(await valid.json()).toMatchObject({ user: { email: 'maria@docucore.local' } })
    for (const password of ['incorrecta-larga', 'otra-incorrecta']) {
      const response = await raw('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: password === 'otra-incorrecta' ? 'noexiste@docucore.local' : 'maria@docucore.local', password }) })
      expect(response.status).toBe(401)
      expect(await response.json()).toMatchObject({ error: 'Correo o contraseña incorrectos.' })
    }
  })

  it('does not authenticate inactive users and validates login input', async () => {
    const inactive = await raw('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'inactive@docucore.local', password: 'DocuCore!2026' }) })
    expect(inactive.status).toBe(401)
    expect((await raw('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'wrong', password: 'x' }) })).status).toBe(400)
  })

  it('persists, revokes and rejects missing sessions', async () => {
    const login = await raw('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'maria@docucore.local', password: 'DocuCore!2026' }) })
    const cookie = login.headers.get('set-cookie')!.split(';')[0]
    expect((await raw('/api/auth/session', { headers: { cookie } })).status).toBe(200)
    expect((await raw('/api/projects/1/assets?limit=1', unauthenticated)).status).toBe(401)
    expect((await raw('/api/auth/logout', { method: 'POST', headers: { cookie } })).status).toBe(204)
    expect((await raw('/api/auth/session', { headers: { cookie, 'x-docucore-test-unauthenticated': 'true' } })).status).toBe(401)
  })

  it('changes the password without invalidating the current session and revokes the others', async () => {
    const credentials = { email: 'maria@docucore.local', password: 'DocuCore!2026' }
    const [first, second] = await Promise.all([
      raw('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials) }),
      raw('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials) }),
    ])
    const currentCookie = first.headers.get('set-cookie')!.split(';')[0]
    const revokedCookie = second.headers.get('set-cookie')!.split(';')[0]
    const replacement = 'CambioSeguro!2026'
    const change = await raw('/api/auth/password', {
      method: 'POST',
      headers: { cookie: currentCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: credentials.password, newPassword: replacement, confirmPassword: replacement }),
    })
    expect(change.status).toBe(204)
    expect((await raw('/api/auth/session', { headers: { cookie: currentCookie } })).status).toBe(200)
    expect((await raw('/api/auth/session', { headers: { cookie: revokedCookie, 'x-docucore-test-unauthenticated': 'true' } })).status).toBe(401)

    const restore = await raw('/api/auth/password', {
      method: 'POST',
      headers: { cookie: currentCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: replacement, newPassword: credentials.password, confirmPassword: credentials.password }),
    })
    expect(restore.status).toBe(204)
  })

  it('allows a project manager to create an inactive account and blocks editors from user administration', async () => {
    const suffix = Date.now()
    const created = await raw('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 1, name: 'Cuenta pendiente', email: `pending-${suffix}@docucore.local`, password: 'CuentaInicial!2026', initials: 'CP', color: 'brand', isActive: false, role: 'VIEWER' }),
    })
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ isActive: false, projectRole: 'VIEWER' })
    const editor = await raw('/api/users?projectId=1', { headers: { 'x-docucore-test-actor-id': '2' } })
    expect(editor.status).toBe(403)
  })
})
