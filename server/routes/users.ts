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

  const appBase = (process.env.APP_PUBLIC_URL || "https://app.report-map.online").replace(/\/+$/, "")
  const inviteUrl = `${appBase}/accept-invitation?token=${encodeURIComponent(token)}`
  const inviter = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } })
  void sendWorkspaceInvitationEmail({ to: email, workspaceName: scope.workspace.name, inviterName: inviter?.name ?? "Un administrador", inviteUrl }).catch((err) => console.error("Failed to send invitation email:", err))

  res.status(201).json({
    invitationId: invitation.id,
    email: invitation.email,
    workspaceRole: invitation.workspaceRole,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  })
}))

// ── Accept an invitation (§14). ─────────────────────────────────────────────
const acceptSchema = z.object({ token: z.string().min(1).max(512) }).strict()

router.post('/invitations/accept', asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  const input = acceptSchema.parse(req.body)
  const tokenHash = hashToken(input.token)
  const now = new Date()
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actorId } })

  const result = await prisma.$transaction(async (tx) => {
    // Lock the invitation before reading state so revoke and accept are mutually exclusive.
    const lockedInvitationIds = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "WorkspaceInvitation" WHERE "tokenHash" = ${tokenHash} FOR UPDATE
    `
    if (lockedInvitationIds.length === 0) {
      throw Object.assign(new Error('La invitación no es válida o ha caducado.'), { status: 409, code: 'INVALID_INVITATION' })
    }

    const invitation = await tx.workspaceInvitation.findUnique({
      where: { tokenHash },
      include: { projectRoles: true },
    })
    if (!invitation || invitation.status !== 'PENDING' || invitation.expiresAt <= now) {
      throw Object.assign(new Error('La invitación no es válida o ha caducado.'), { status: 409, code: 'INVALID_INVITATION' })
    }
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw Object.assign(new Error('Esta invitación fue emitida para otra dirección de correo.'), { status: 403, code: 'INVITATION_EMAIL_MISMATCH' })
    }

    const { workspace, counts } = await lockWorkspaceForEntitlement(tx, invitation.workspaceId)
    const existingMember = await tx.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: actorId } },
    })
    if (existingMember?.status === 'ACTIVE') {
      throw Object.assign(new Error('Ya eres miembro de este workspace.'), { status: 409, code: 'ALREADY_MEMBER' })
    }

    const resolution = resolveEntitlement({ billingStatus: workspace.billingStatus, planKey: workspace.planKey, stripePriceId: workspace.stripePriceId, trialEndsAt: workspace.trialEndsAt })
    assertMemberSeatAvailable(resolution.maxActiveMembers, counts.activeMembers)

    const membership = await tx.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: actorId } },
      create: { workspaceId: invitation.workspaceId, userId: actorId, role: invitation.workspaceRole, status: 'ACTIVE' },
      update: { role: invitation.workspaceRole, status: 'ACTIVE' },
    })

    for (const assignment of invitation.projectRoles) {
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: assignment.projectId, userId: actorId } },
        create: { projectId: assignment.projectId, userId: actorId, role: assignment.role },
        update: { role: assignment.role },
      })
    }

    await tx.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: 'ACCEPTED', acceptedAt: now } })
    await tx.user.update({ where: { id: actorId }, data: { activeWorkspaceId: invitation.workspaceId } })
    await tx.auditLog.create({
      data: {
        workspaceId: invitation.workspaceId,
        userId: actorId,
        action: 'Invitación aceptada',
        entityId: `workspace-invitation:${invitation.id}`,
        detail: JSON.stringify({ email: invitation.email, workspaceRole: invitation.workspaceRole }),
        timestamp: now,
      },
    })
    return { membership, workspaceId: invitation.workspaceId }
  })

  res.status(200).json({ workspaceId: result.workspaceId, role: result.membership.role, status: result.membership.status })
}))

// ── Revoke invitation (§14). ────────────────────────────────────────────────
router.delete('/invitations/:invitationId', asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  const scope = await requireWorkspaceAdmin(actorId)
  const { invitationId } = req.params

  await prisma.$transaction(async (tx) => {
    const lockedInvitationIds = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "WorkspaceInvitation" WHERE "id" = ${invitationId} FOR UPDATE
    `
    if (lockedInvitationIds.length === 0) {
      throw Object.assign(new Error('Invitación no encontrada.'), { status: 404 })
    }

    const invitation = await tx.workspaceInvitation.findUnique({ where: { id: invitationId } })
    if (!invitation || invitation.workspaceId !== scope.workspace.id) {
      throw Object.assign(new Error('Invitación no encontrada.'), { status: 404 })
    }
    if (invitation.status !== 'PENDING') {
      throw Object.assign(new Error('Solo se pueden revocar invitaciones pendientes.'), { status: 409 })
    }

    await tx.workspaceInvitation.update({ where: { id: invitationId }, data: { status: 'REVOKED', revokedAt: new Date() } })
    await tx.auditLog.create({
      data: {
        workspaceId: scope.workspace.id,
        userId: actorId,
        action: 'Invitación revocada',
        entityId: `workspace-invitation:${invitationId}`,
        detail: JSON.stringify({ email: invitation.email }),
        timestamp: new Date(),
      },
    })
  })
  res.status(204).end()
}))

// ── Change member role (§13). ───────────────────────────────────────────────
const memberPatchSchema = z.object({ role: roleSchema }).strict()

router.patch('/:userId', asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  const scope = await requireWorkspaceAdmin(actorId)
  const userId = Number(req.params.userId)
  if (!Number.isInteger(userId) || userId <= 0) throw Object.assign(new Error('Identificador de usuario inválido.'), { status: 400 })
  const input = memberPatchSchema.parse(req.body)

  const updated = await prisma.$transaction(async (tx) => {
    // The workspace lock serializes every mutation that can reduce ACTIVE OWNERs.
    await lockWorkspaceForEntitlement(tx, scope.workspace.id)
    const target = await tx.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: scope.workspace.id, userId } },
    })
    if (!target) throw Object.assign(new Error('El usuario no pertenece a este workspace.'), { status: 404, code: 'WORKSPACE_ACCESS_DENIED' })

    if ((input.role === 'OWNER' || target.role === 'OWNER') && scope.membership.role !== 'OWNER') {
      throw Object.assign(new Error('Solo la persona propietaria puede asignar o revocar el rol Propietario.'), { status: 403, code: 'INSUFFICIENT_WORKSPACE_ROLE' })
    }

    if (target.role === 'OWNER' && input.role !== 'OWNER' && target.status === 'ACTIVE') {
      const activeOwners = await tx.workspaceMember.count({
        where: { workspaceId: scope.workspace.id, role: 'OWNER', status: 'ACTIVE' },
      })
      if (activeOwners <= 1) {
        throw Object.assign(new Error('El workspace debe conservar al menos una persona propietaria activa.'), { status: 409, code: 'LAST_ACTIVE_OWNER' })
      }
    }

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

// ── Suspend / unsuspend member (§16, §3). ──────────────────────────────────
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

  if (target.role === 'OWNER' && scope.membership.role !== 'OWNER') {
    throw Object.assign(new Error('Solo la persona propietaria puede suspenderse a sí misma.'), { status: 403, code: 'INSUFFICIENT_WORKSPACE_ROLE' })
  }

  if (target.status === 'PLAN_LOCKED') {
    throw Object.assign(new Error('Este miembro está bloqueado por el límite del plan. Usa la acción de reactivación cuando haya una plaza disponible.'), { status: 409, code: 'MEMBER_PLAN_LOCKED' })
  }

  if (input.suspend) {
    if (target.status === 'SUSPENDED') return res.json({ userId, workspaceStatus: target.status })

    const updated = await prisma.$transaction(async (tx) => {
      await lockWorkspaceForEntitlement(tx, scope.workspace.id)
      const lockedTarget = await tx.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: scope.workspace.id, userId } },
      })
      if (!lockedTarget) throw Object.assign(new Error('El usuario no pertenece a este workspace.'), { status: 404, code: 'WORKSPACE_ACCESS_DENIED' })
      if (lockedTarget.status === 'SUSPENDED') return lockedTarget
      if (lockedTarget.status === 'PLAN_LOCKED') {
        throw Object.assign(new Error('Este miembro está bloqueado por el límite del plan. Usa la acción de reactivación cuando haya una plaza disponible.'), { status: 409, code: 'MEMBER_PLAN_LOCKED' })
      }
      if (lockedTarget.role === 'OWNER') {
        const activeOwners = await tx.workspaceMember.count({
          where: { workspaceId: scope.workspace.id, role: 'OWNER', status: 'ACTIVE' },
        })
        if (activeOwners <= 1) {
          throw Object.assign(new Error('El workspace debe conservar al menos una persona propietaria activa.'), { status: 409, code: 'LAST_ACTIVE_OWNER' })
        }
      }

      const result = await tx.workspaceMember.update({ where: { id: lockedTarget.id }, data: { status: 'SUSPENDED' } })
      await tx.auditLog.create({
        data: {
          workspaceId: scope.workspace.id,
          userId: actorId,
          action: 'Miembro suspendido',
          entityId: `workspace-member:${lockedTarget.id}`,
          detail: JSON.stringify({ targetUserId: userId, workspaceOnly: true }),
          timestamp: new Date(),
        },
      })
      return result
    })
    return res.json({ userId, workspaceStatus: updated.status })
  }

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

// ── Reactivate PLAN_LOCKED member (§4, §7). ────────────────────────────────
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

// ── Remove member (§12). ────────────────────────────────────────────────────
router.delete('/:userId', asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  const scope = await requireWorkspaceAdmin(actorId)
  const userId = Number(req.params.userId)
  if (!Number.isInteger(userId) || userId <= 0) throw Object.assign(new Error('Identificador de usuario inválido.'), { status: 400 })

  await prisma.$transaction(async (tx) => {
    await lockWorkspaceForEntitlement(tx, scope.workspace.id)
    const target = await tx.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: scope.workspace.id, userId } },
    })
    if (!target) throw Object.assign(new Error('El usuario no pertenece a este workspace.'), { status: 404, code: 'WORKSPACE_ACCESS_DENIED' })

    if (target.role === 'OWNER' && scope.membership.role !== 'OWNER') {
      throw Object.assign(new Error('Solo la persona propietaria puede retirar a otra persona propietaria.'), { status: 403, code: 'INSUFFICIENT_WORKSPACE_ROLE' })
    }

    if (target.role === 'OWNER' && target.status === 'ACTIVE') {
      const activeOwners = await tx.workspaceMember.count({
        where: { workspaceId: scope.workspace.id, role: 'OWNER', status: 'ACTIVE' },
      })
      if (activeOwners <= 1) {
        throw Object.assign(new Error('El workspace debe conservar al menos una persona propietaria activa.'), { status: 409, code: 'LAST_ACTIVE_OWNER' })
      }
    }

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

// ── Switch workspace (§15). ────────────────────────────────────────────────
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
