import { Router } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { authenticatedUserId, clearSessionCookie, createSession, publicUser, requireAuth, revokeSessionFromRequest, type AuthenticatedRequest } from '../lib/auth'
import { hashPassword, passwordIsValid, verifyPassword } from '../lib/passwords'

const router = Router()
const attempts = new Map<string, { count: number; until: number }>()
const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(256) }).strict()

function attemptKey(value: string, ip: string | undefined) { return `${value.toLowerCase()}|${ip ?? 'unknown'}` }
function blocked(key: string): boolean { const entry = attempts.get(key); return Boolean(entry && entry.until > Date.now() && entry.count >= 10) }
function failed(key: string): void { const previous = attempts.get(key); const now = Date.now(); attempts.set(key, { count: previous && previous.until > now ? previous.count + 1 : 1, until: now + 15 * 60 * 1000 }) }

router.post('/login', asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body)
  const email = input.email.toLowerCase()
  const key = attemptKey(email, req.ip)
  if (blocked(key)) return res.status(429).json({ error: 'Demasiados intentos. Inténtalo de nuevo más tarde.' })
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.isActive || !passwordIsValid(input.password) || !(await verifyPassword(input.password, user.passwordHash))) {
    failed(key)
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' })
  }
  attempts.delete(key)
  await createSession(user.id, res)
  res.set('Cache-Control', 'no-store').json({ user: publicUser(user) })
}))

router.post('/logout', asyncHandler(async (req, res) => {
  await revokeSessionFromRequest(req)
  clearSessionCookie(res)
  res.status(204).end()
}))

router.get('/session', (req, res) => {
  const auth = (req as AuthenticatedRequest).auth
  if (!auth) return res.status(401).json({ error: 'Authentication required' })
  res.set('Cache-Control', 'no-store').json({ user: publicUser(auth.user) })
})

router.post('/password', requireAuth, asyncHandler(async (req, res) => {
  const input = z.object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(12).max(256), confirmPassword: z.string().min(1).max(256) }).strict().parse(req.body)
  if (input.newPassword !== input.confirmPassword || !passwordIsValid(input.newPassword)) return res.status(400).json({ error: 'La nueva contraseña no cumple los requisitos.' })
  const userId = authenticatedUserId(req)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) return res.status(401).json({ error: 'La contraseña actual no es correcta.' })
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(input.newPassword) } })
    await tx.authSession.deleteMany({ where: { userId, id: { not: (req as AuthenticatedRequest).auth!.sessionId } } })
  })
  res.status(204).end()
}))

export default router
