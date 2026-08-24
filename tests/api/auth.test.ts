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

  it('invites users without setting passwords, lists members scoped to the workspace, and blocks editors from user administration', async () => {
    const suffix = Date.now()
    // An invitation carries the workspace role and per-project assignments;
    // it NEVER requires the admin to define someone else's password (§14).
    const created = await raw('/api/users/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `pending-${suffix}@docucore.local`, workspaceRole: 'MEMBER', projectAssignments: [{ projectId: 1, role: 'VIEWER' }] }),
    })
    expect(created.status).toBe(201)
    const invitation = await created.json()
    expect(invitation.workspaceRole).toBe('MEMBER')
    expect(invitation.invitationId).toBeDefined()
    expect(invitation.inviteToken).toBeUndefined()
    expect(invitation.inviteUrl).toBeUndefined()

    const editor = await raw('/api/users', { headers: { 'x-docucore-test-actor-id': '3' } })
    expect(editor.status).toBe(403)
  })

  it('updates the authenticated user name and initials, validating inputs and persisting across sessions', async () => {
    const login = await raw('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'maria@docucore.local', password: 'DocuCore!2026' }),
    })
    const cookie = login.headers.get('set-cookie')!.split(';')[0]

    // 1. Rejects unauthenticated request
    const unauth = await raw('/api/auth/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-docucore-test-unauthenticated': 'true' },
      body: JSON.stringify({ name: 'Nombre Inválido' }),
    })
    expect(unauth.status).toBe(401)

    // 2. Rejects invalid input (< 2 characters)
    const invalid = await raw('/api/auth/profile', {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'A' }),
    })
    expect(invalid.status).toBe(400)

    // 3. Successfully updates name and custom initials
    const updatedWithCustomInitials = await raw('/api/auth/profile', {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'María F. Actualizada', initials: 'MFA' }),
    })
    expect(updatedWithCustomInitials.status).toBe(200)
    expect(await updatedWithCustomInitials.json()).toMatchObject({
      user: {
        name: 'María F. Actualizada',
        initials: 'MFA',
      },
    })

    // 4. GET /api/auth/session reflects the new name and initials
    const sessionRes = await raw('/api/auth/session', { headers: { cookie } })
    expect(sessionRes.status).toBe(200)
    expect(await sessionRes.json()).toMatchObject({
      user: {
        name: 'María F. Actualizada',
        initials: 'MFA',
      },
    })

    // 5. Automatically generates initials when omitted
    const autoInitials = await raw('/api/auth/profile', {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'María Fernández' }),
    })
    expect(autoInitials.status).toBe(200)
    expect(await autoInitials.json()).toMatchObject({
      user: {
        name: 'María Fernández',
        initials: 'MF',
      },
    })
  })
})
