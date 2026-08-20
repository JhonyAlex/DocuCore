import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { authenticatedUserId, hashToken } from '../lib/auth'
import { getUserPrimaryWorkspace, resolveWorkspaceScope } from '../lib/workspaceScope'
import {
  assertMemberSeatAvailable,
  lockWorkspaceForEntitlement,
  reactivateMemberTransactional,
  resolveEntitlement,
} from '../lib/entitlements'
import { sendWorkspaceInvitationEmail } from '../lib/email'

const router = Router()

const roleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER'])
const listSchema = z.object({ search: z.string().trim().max(100).optional(), projectId: z.coerce.number().int().positive().optional() }).strict()

function workspaceAdminError(): Error & { status: number; code: string } {
  return Object.assign(new Error('Solo los administradores o propietarios de la cuenta pueden gestionar el equipo.'), { status: 403, code: 'WORKSPACE_ACCESS_DENIED' })
}

async function requireWorkspaceAdmin(actorId: number) {
  const scope = await getUserPrimaryWorkspace(actorId)
  if (scope.membership.role !== 'OWNER' && scope.membership.role !== 'ADMIN') throw workspaceAdminError()
  return scope
}

const userSelect = { id: true, name: true, email: true, initials: true, color: true, isActive: true, role: true, createdAt: true, updatedAt: true } as const

// ── List members: ONLY members of the actor's workspace (§1.4). ────────────
router.get('/', asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  const query = listSchema.parse(req.query)
  const scope = await getUserPrimaryWorkspace(actorId)

  const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: scope.workspace.id, userId: actorId } }, select: { role: true } })
  const canSeeAll = membership?.role === 'OWNER' || membership?.role === 'ADMIN'

  // Non-admins also only reach this endpoint to bootstrap their own list; the
  // full directory stays admin-only to prevent cross-workspace enumeration.
  if (!canSeeAll) throw workspaceAdminError()

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: scope.workspace.id, ...(query.search ? { user: { OR: [{ name: { contains: query.search, mode: 'insensitive' as const } }, { email: { contains: query.search, mode: 'insensitive' as const } }] } } : {}) },
    orderBy: { id: 'asc' },
    include: {
      user: { select: userSelect },
      workspace: true,
    },
  })

  res.json(members.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
    initials: m.user.initials,
    color: m.user.color,
    isActive: m.user.isActive,
    role: m.role,
    workspaceStatus: m.status,
    createdAt: m.user.createdAt.toISOString(),
  })))
}))

// ── Invite a user without setting their password (§14). ────────────────────
const inviteSchema = z.object({
  email: z.string().trim().email().max(254),
  workspaceRole: roleSchema.default('MEMBER'),
  projectAssignments: z.array(z.object({ projectId: z.number().int().positive(), role: z.enum(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER']) })).max(100).default([]),
}).strict()

router.post('/invitations', asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  const scope = await requireWorkspaceAdmin(actorId)
  const input = inviteSchema.parse(req.body)
  const email = input.email.toLowerCase()

  // Only the OWNER may grant the OWNER workspace role via invitation (an ADMIN
  // could otherwise invite an accomplice as OWNER and take over the workspace).
  if (input.workspaceRole === 'OWNER' && scope.membership.role !== 'OWNER') {
    throw Object.assign(new Error('Solo la persona propietaria puede invitar con rol Propietario.'), { status: 403, code: 'INSUFFICIENT_WORKSPACE_ROLE' })
  }

  // Verify assigned projects belong to this workspace.
  if (input.projectAssignments.length) {
    const projectIds = input.projectAssignments.map((p) => p.projectId)
    const count = await prisma.project.count({ where: { id: { in: projectIds }, workspaceId: scope.workspace.id } })
    if (count !== projectIds.length) throw Object.assign(new Error('Uno o más proyectos no pertenecen a este workspace.'), { status: 400, code: 'WORKSPACE_ACCESS_DENIED' })
  }

  const existing = await prisma.workspaceInvitation.findFirst({ where: { workspaceId: scope.workspace.id, email, status: 'PENDING' } })
  if (existing && existing.expiresAt > new Date()) {
    return res.status(409).json({ error: 'Ya existe una invitación pendiente para este correo.', code: 'INVITATION_PENDING' })
  }

  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const invitation = await prisma.$transaction(async (tx) => {
    const created = await tx.workspaceInvitation.create({
      data: {
        id: `inv_${Date.now()}_${randomBytes(4).toString('hex')}`,
        workspaceId: scope.workspace.id,
        email,
        workspaceRole: input.workspaceRole,
        tokenHash,
        invitedById: actorId,
        expiresAt,
        status: 'PENDING',
      },
    })
    if (input.projectAssignments.length) {
      await tx.workspaceInvitationProjectRole.createMany({
        data: input.projectAssignments.map((a) => ({ invitationId: created.id, projectId: a.projectId, role: a.role })),
      })
    }
    await tx.auditLog.create({
      data: {
        workspaceId: scope.workspace.id,
        userId: actorId,
        action: 'Invitación enviada',
        entityId: `workspace-invitation:${created.id}`,
        detail: JSON.stringify({ email, workspaceRole: input.workspaceRole, assignments: input.projectAssignments.length }),
        timestamp: new Date(),
      },
    })
    return created
  })

  // Deliver the invitation: the invitee uses the single-use link to sign in (or
  // register) and accept — the admin never sets another person's password (§14).
  // The token travels ONLY in this one-time link; it is stored hashed server-side.
  const appBase = (process.env.APP_PUBLIC_URL || "https://app.report-map.online").replace(/\/+$/, "")
  const inviteUrl = `${appBase}/accept-invitation?token=${encodeURIComponent(token)}`
  const inviter = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } })
  void sendWorkspaceInvitationEmail({ to: email, workspaceName: scope.workspace.name, inviterName: inviter?.name ?? "Un administrador", inviteUrl }).catch((err) => console.error("Failed to send invitation email:", err))

  res.status(201).json({
    invitationId: invitation.id,
    email: invitation.email,
    workspaceRole: invitation.workspaceRole,
    expiresAt: invitation.expiresAt.toISOString(),
    inviteUrl,
    // The plaintext token is returned exactly once; it is only ever stored hashed.
    inviteToken: token,
  })
}))

// ── Accept an invitation (single-use, expiring) (§14). ──────────────────────
const acceptSchema = z.object({ token: z.string().min(1).max(512) }).strict()

router.post('/invitations/accept', asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  const input = acceptSchema.parse(req.body)
  const tokenHash = hashToken(input.token)
  const now = new Date()

  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { email: true } })
  if (!actor) throw Object.assign(new Error('Not found'), { status: 404 })

  // Single-use acceptance is enforced atomically: the UPDATE only transitions
  // a still-PENDING invite, so a concurrent double-accept loses at this step
  // instead of both racing the read-then-act check outside the transaction.
  const claim = await prisma.$transaction(async (tx) => {
    const invitation = await tx.workspaceInvitation.findUnique({ where: { tokenHash }, include: { projectRoles: true } })
    if (!invitation || invitation.status !== 'PENDING' || invitation.expiresAt <= now) return null
    if (actor.email.toLowerCase() !== invitation.email.toLowerCase()) throw Object.assign(new Error('Esta invitación pertenece a otro correo electrónico.'), { status: 403, code: 'INVITATION_EMAIL_MISMATCH' })

    const outcome = await tx.workspaceInvitation.updateMany({
      where: { id: invitation.id, status: 'PENDING' },
      data: { status: 'ACCEPTED', acceptedAt: now },
    })
    if (outcome.count === 0) return null // someone else accepted it first

    // Add workspace membership if missing (never create a duplicate User). A
    // SUSPENDED membership is not usable for acceptance: suspended members must
    // not silently regain admin-revoked access by consuming a pending invite.
    // A PLAN_LOCKED membership must not silently regain access either: it waits
    // for an OWNER/ADMIN to reactivate it when a seat is available (§7).
    const existingMember = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: actorId } } })
    if (existingMember && existingMember.status === 'SUSPENDED') {
      throw Object.assign(new Error('Tu membresía en este workspace está suspendida; contacta a la administración.'), { status: 403, code: 'WORKSPACE_SUSPENDED' })
    }
    if (existingMember && existingMember.status === 'PLAN_LOCKED') {
      throw Object.assign(new Error('Tu plaza en este workspace está bloqueada por el límite del plan. Solicita a la administración que la reactive.'), { status: 409, code: 'MEMBER_PLAN_LOCKED' })
    }
    if (!existingMember) {
      // Acceptance that creates a NEW ACTIVE membership consumes a seat. The
      // workspace row is locked FOR UPDATE so two concurrent acceptances for the
      // last seat cannot both succeed (§8): exactly one ends ACTIVE.
      const { workspace, counts } = await lockWorkspaceForEntitlement(tx, invitation.workspaceId)
      const resolution = resolveEntitlement({ billingStatus: workspace.billingStatus, planKey: workspace.planKey, stripePriceId: workspace.stripePriceId, trialEndsAt: workspace.trialEndsAt })
      assertMemberSeatAvailable(resolution.maxActiveMembers, counts.activeMembers)
      await tx.workspaceMember.create({ data: { workspaceId: invitation.workspaceId, userId: actorId, role: invitation.workspaceRole } })
    }
    // Apply the selected project assignments.
    for (const assignment of invitation.projectRoles) {
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: assignment.projectId, userId: actorId } },
        create: { projectId: assignment.projectId, userId: actorId, role: assignment.role },
        update: { role: assignment.role },
      })
    }
    await tx.auditLog.create({
      data: {
        workspaceId: invitation.workspaceId,
        userId: actorId,
        action: 'Invitación aceptada',
        entityId: `workspace-invitation:${invitation.id}`,
        detail: JSON.stringify({ email: actor.email }),
        timestamp: now,
      },
    })
    return { workspaceId: invitation.workspaceId }
  })

  if (!claim) {
    return res.status(400).json({ error: 'La invitación no es válida, ha expirado o ya fue usada.', code: 'INVITATION_INVALID' })
  }

  res.json({ accepted: true, workspaceId: claim.workspaceId })
}))

// ── Change a workspace member's role (§13). ─────────────────────────────────
const memberPatchSchema = z.object({ role: roleSchema }).strict()

router.patch('/:userId', asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  await requireWorkspaceAdmin(actorId)
  const userId = Number(req.params.userId)
  if (!Number.isInteger(userId) || userId <= 0) throw Object.assign(new Error('Identificador de usuario inválido.'), { status: 400 })

  const scope = await getUserPrimaryWorkspace(actorId)
  const input = memberPatchSchema.parse(req.body)

  const target = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: scope.workspace.id, userId } } })
  if (!target) throw Object.assign(new Error('El usuario no pertenece a este workspace.'), { status: 404, code: 'WORKSPACE_ACCESS_DENIED' })

  // OWNER is the only role that can grant or revoke the OWNER role (authz:
  // otherwise an ADMIN could promote themselves and take over the workspace).
  if ((input.role === 'OWNER' || target.role === 'OWNER') && scope.membership.role !== 'OWNER') {
    throw Object.assign(new Error('Solo la persona propietaria puede asignar o revocar el rol Propietario.'), { status: 403, code: 'INSUFFICIENT_WORKSPACE_ROLE' })
  }

  // Never leave a workspace without an OWNER.
  if (target.role === 'OWNER' && input.role !== 'OWNER') {
    const owners = await prisma.workspaceMember.count({ where: { workspaceId: scope.workspace.id, role: 'OWNER' } })
    if (owners <= 1) throw Object.assign(new Error('El workspace debe conservar al menos una persona propietaria.'), { status: 409, code: 'LAST_OWNER' })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.workspaceMember.update({ where: { id: target.id }, data: { role: input.role } })
    await tx.auditLog.create({
      data: {
        workspaceId: scope.workspace.id,
        userId: actorId,
        action: 'Rol de workspace actualizado',
        entityId: `workspace-member:${target.id}`,
        detail: JSON.stringify({ targetUserId: userId, role: input.role }),
        timestamp: new Date(),
      },
    })
    return result
  })

  res.json({ userId, role: updated.role })
}))

// ── Suspend / unsuspend a member ONLY within this workspace (§16, §3). ──────
// SUSPENDED is a manual, administrative state: an upgrade never reactivates it.
// Re-activating a SUSPENDED member back to ACTIVE consumes a seat and is gated
// by the central capacity guard. PLAN_LOCKED is managed only by the plan engine
// and the dedicated reactivate endpoint below.
const suspendSchema = z.object({ suspend: z.boolean() }).strict()

router.patch('/:userId/status', asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  await requireWorkspaceAdmin(actorId)
  const userId = Number(req.params.userId)
  if (!Number.isInteger(userId) || userId <= 0) throw Object.assign(new Error('Identificador de usuario inválido.'), { status: 400 })
  const scope = await getUserPrimaryWorkspace(actorId)
  const input = suspendSchema.parse(req.body)

  const target = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: scope.workspace.id, userId } } })
  if (!target) throw Object.assign(new Error('El usuario no pertenece a este workspace.'), { status: 404, code: 'WORKSPACE_ACCESS_DENIED' })

  // A workspace ADMIN cannot suspend the OWNER (lockout/takeover prevention).
  if (target.role === 'OWNER' && scope.membership.role !== 'OWNER') {
    throw Object.assign(new Error('Solo la persona propietaria puede suspenderse a sí misma.'), { status: 403, code: 'INSUFFICIENT_WORKSPACE_ROLE' })
  }

  // PLAN_LOCKED is never set or cleared through the manual suspend toggle.
  if (target.status === 'PLAN_LOCKED') {
    throw Object.assign(new Error('Este miembro está bloqueado por el límite del plan. Usa la acción de reactivación cuando haya una plaza disponible.'), { status: 409, code: 'MEMBER_PLAN_LOCKED' })
  }

  if (input.suspend) {
    if (target.status === 'SUSPENDED') return res.json({ userId, workspaceStatus: target.status })

    // Suspension is per-workspace: the global identity (User.isActive) is untouched.
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.workspaceMember.update({ where: { id: target.id }, data: { status: 'SUSPENDED' } })
      await tx.auditLog.create({
        data: {
          workspaceId: scope.workspace.id,
          userId: actorId,
          action: 'Miembro suspendido',
          entityId: `workspace-member:${target.id}`,
          detail: JSON.stringify({ targetUserId: userId, workspaceOnly: true }),
          timestamp: new Date(),
        },
      })
      return result
    })
    return res.json({ userId, workspaceStatus: updated.status })
  }

  // Unsuspend: re-activation consumes a seat, so it goes through the capacity
  // guard. Already-ACTIVE members are a no-op.
  if (target.status === 'ACTIVE') return res.json({ userId, workspaceStatus: target.status })

  const updated = await prisma.$transaction(async (tx) => {
    const { workspace, counts } = await lockWorkspaceForEntitlement(tx, scope.workspace.id)
    const resolution = resolveEntitlement({ billingStatus: workspace.billingStatus, planKey: workspace.planKey, stripePriceId: workspace.stripePriceId, trialEndsAt: workspace.trialEndsAt })
    assertMemberSeatAvailable(resolution.maxActiveMembers, counts.activeMembers)
    const result = await tx.workspaceMember.update({ where: { id: target.id }, data: { status: 'ACTIVE' } })
    await tx.auditLog.create({
      data: {
        workspaceId: scope.workspace.id,
        userId: actorId,
        action: 'Miembro reactivado',
        entityId: `workspace-member:${target.id}`,
        detail: JSON.stringify({ targetUserId: userId, workspaceOnly: true }),
        timestamp: new Date(),
      },
    })
    return result
  })

  res.json({ userId, workspaceStatus: updated.status })
}))

// ── Reactivate a PLAN_LOCKED member when a seat is available (§4, §7). ───────
router.post('/:userId/reactivate', asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  await requireWorkspaceAdmin(actorId)
  const userId = Number(req.params.userId)
  if (!Number.isInteger(userId) || userId <= 0) throw Object.assign(new Error('Identificador de usuario inválido.'), { status: 400 })
  const scope = await getUserPrimaryWorkspace(actorId)

  const target = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: scope.workspace.id, userId } } })
  if (!target) throw Object.assign(new Error('El usuario no pertenece a este workspace.'), { status: 404, code: 'WORKSPACE_ACCESS_DENIED' })

  if (target.status !== 'PLAN_LOCKED') {
    throw Object.assign(new Error('Este miembro no está bloqueado por límite de plan.'), { status: 409, code: 'MEMBER_PLAN_LOCKED' })
  }

  const result = await prisma.$transaction(async (tx) => {
    return reactivateMemberTransactional(tx, { workspaceId: scope.workspace.id, actorId, memberId: target.id })
  })

  res.json({ userId, workspaceStatus: result.status })
}))

// ── Remove a member from the workspace (never deletes the global identity). ──
router.delete('/:userId', asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  await requireWorkspaceAdmin(actorId)
  const userId = Number(req.params.userId)
  if (!Number.isInteger(userId) || userId <= 0) throw Object.assign(new Error('Identificador de usuario inválido.'), { status: 400 })
  const scope = await getUserPrimaryWorkspace(actorId)

  const target = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: scope.workspace.id, userId } } })
  if (!target) throw Object.assign(new Error('El usuario no pertenece a este workspace.'), { status: 404, code: 'WORKSPACE_ACCESS_DENIED' })

  // Only the OWNER can remove an OWNER (an ADMIN must not have the power to
  // strip the owner and take over the workspace).
  if (target.role === 'OWNER' && scope.membership.role !== 'OWNER') {
    throw Object.assign(new Error('Solo la persona propietaria puede retirar a otra persona propietaria.'), { status: 403, code: 'INSUFFICIENT_WORKSPACE_ROLE' })
  }

  if (target.role === 'OWNER') {
    const owners = await prisma.workspaceMember.count({ where: { workspaceId: scope.workspace.id, role: 'OWNER' } })
    if (owners <= 1) throw Object.assign(new Error('El workspace debe conservar al menos una persona propietaria.'), { status: 409, code: 'LAST_OWNER' })
  }

  await prisma.$transaction(async (tx) => {
    // Revoke the member's project memberships in this workspace transactionally,
    // but NEVER delete the global User.
    const projectIds = await tx.project.findMany({ where: { workspaceId: scope.workspace.id }, select: { id: true } })
    await tx.projectMember.deleteMany({ where: { userId, projectId: { in: projectIds.map((p) => p.id) } } })
    await tx.workspaceMember.delete({ where: { id: target.id } })
    await tx.auditLog.create({
      data: {
        workspaceId: scope.workspace.id,
        userId: actorId,
        action: 'Miembro retirado del workspace',
        entityId: `workspace-member:${target.id}`,
        detail: JSON.stringify({ targetUserId: userId }),
        timestamp: new Date(),
      },
    })
  })

  res.status(204).end()
}))

// ── The active workspace context (§15): switch without leaking data. ─────────
const switchSchema = z.object({ workspaceId: z.number().int().positive() }).strict()

router.post('/switch-workspace', asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  const input = switchSchema.parse(req.body)
  await resolveWorkspaceScope(input.workspaceId, actorId)

  await prisma.user.update({
    where: { id: actorId },
    data: { activeWorkspaceId: input.workspaceId },
  })

  res.json({ activeWorkspaceId: input.workspaceId })
}))

export default router
