import { createHash, randomBytes } from 'node:crypto'
import type { Request, RequestHandler, Response } from 'express'
import prisma from './prisma'

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'docucore_session'
const SESSION_DAYS = Number(process.env.SESSION_TTL_DAYS || '14')
const SESSION_MAX_AGE_MS = Math.max(1, SESSION_DAYS) * 24 * 60 * 60 * 1000

export type AuthUser = { id: number; name: string; email: string; role: string; initials: string; color: string; isActive: boolean }
export type AuthenticatedRequest = Request & { auth?: { user: AuthUser; sessionId: string } }

function authError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status })
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

function cookieValue(req: Request, name: string): string | null {
  const encoded = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1)
  if (!encoded) return null
  try { return decodeURIComponent(encoded) } catch { return null }
}

function cookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: SESSION_MAX_AGE_MS }
}

export function publicUser(user: AuthUser) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, initials: user.initials, color: user.color }
}

export async function createSession(userId: number, res: Response): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  await prisma.authSession.create({ data: { id: hashToken(token), userId, createdAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_MAX_AGE_MS) } })
  res.cookie(COOKIE_NAME, token, cookieOptions())
}

export async function revokeSessionFromRequest(req: Request): Promise<void> {
  const token = cookieValue(req, COOKIE_NAME)
  if (token) await prisma.authSession.deleteMany({ where: { id: hashToken(token) } })
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' })
}

export const optionalAuth: RequestHandler = async (req, _res, next) => {
  try {
    // Explicit test authentication keeps existing domain tests focused on their
    // resource contract. It is unavailable outside NODE_ENV=test and never has
    // a fallback identity.
    const deliberatelyUnauthenticated = process.env.NODE_ENV === 'test' && req.get('x-docucore-test-unauthenticated') === 'true'
    const testActorId = process.env.NODE_ENV === 'test' && !deliberatelyUnauthenticated ? Number(req.get('x-docucore-test-actor-id')) : Number.NaN
    const token = cookieValue(req, COOKIE_NAME)
    const persistedSession = token ? await prisma.authSession.findUnique({ where: { id: hashToken(token) }, include: { user: true } }) : null
    const session = persistedSession ?? (Number.isInteger(testActorId) && testActorId > 0
      ? { id: `test:${testActorId}`, user: await prisma.user.findUnique({ where: { id: testActorId } }), expiresAt: new Date(Date.now() + 1), lastSeenAt: new Date() }
      : null)
    if (!session || !session.user || !session.user.isActive || session.expiresAt <= new Date()) {
      if (persistedSession?.id) await prisma.authSession.deleteMany({ where: { id: persistedSession.id } })
      return next()
    }
    ;(req as AuthenticatedRequest).auth = { sessionId: session.id, user: session.user }
    if (!session.id.startsWith('test:') && Date.now() - session.lastSeenAt.getTime() > 60 * 60 * 1000) {
      void prisma.authSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined)
    }
    next()
  } catch (error) { next(error) }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!(req as AuthenticatedRequest).auth) return next(authError('Authentication required', 401))
  next()
}

export function authenticatedUserId(req: Request): number {
  const auth = (req as AuthenticatedRequest).auth
  if (!auth) throw authError('Authentication required', 401)
  return auth.user.id
}
