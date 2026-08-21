import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { ProjectRole, ProjectStatus, Workspace, WorkspaceRole } from '@prisma/client'
import prisma from './prisma'
import { authenticatedUserId } from './auth'
import { evaluateWorkspaceEntitlement, assertWorkspaceWriteAllowed, getUserPrimaryWorkspace } from './workspaceScope'

export function actorIdFromRequest(req: Request): number {
  return authenticatedUserId(req)
}

export const projectCapabilities = {
  OPERATE: ['OWNER', 'ADMIN', 'EDITOR'],
  MANAGE_PROJECT: ['OWNER', 'ADMIN'],
  MANAGE_MEMBERS: ['OWNER', 'ADMIN'],
  MANAGE_CONFIGURATION: ['OWNER', 'ADMIN'],
} as const satisfies Record<string, readonly ProjectRole[]>

export type ProjectCapability = keyof typeof projectCapabilities

export interface ProjectScope {
  projectId: number
  project: { id: number; workspaceId: number; code: string; name: string; status: ProjectStatus; themeKey: string; workspace: Workspace }
  membership: { id: number; userId: number; role: ProjectRole }
  workspaceMembership?: { id: number; userId: number; role: WorkspaceRole }
  supportAccess: boolean
}

declare module 'express' {
  interface Request {
    projectScope?: ProjectScope
  }
}

function scopeError(message: string, status: number, code?: string, extra?: Record<string, unknown>): Error & { status: number; code?: string } {
  return Object.assign(new Error(message), { status, code, ...extra })
}

export function parseProjectId(value: unknown): number {
  const numeric = typeof value === 'string' || typeof value === 'number' ? Number(value) : Number.NaN
  if (!Number.isInteger(numeric) || numeric <= 0) throw scopeError('Invalid project id', 400)
  return numeric
}

/** Canonical operational routes always supply :projectId. */
export function projectIdFromRequest(req: Request): number {
  const pathValue = req.params.projectId
  const queryValue = typeof req.query.projectId === 'string' ? req.query.projectId : undefined
  if (pathValue === undefined) throw scopeError('Project id is required in the route', 400)
  if (queryValue !== undefined && parseProjectId(pathValue) !== parseProjectId(queryValue)) {
    throw scopeError('Project id does not match route scope', 400)
  }
  return parseProjectId(pathValue)
}

export async function resolveProjectScope(projectId: number, actorId: number): Promise<ProjectScope> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, workspaceId: true, code: true, name: true, status: true, themeKey: true, workspace: true },
  })
  if (!project) throw scopeError('Project not found', 404)

  const user = await prisma.user.findUnique({
    where: { id: actorId },
    select: { id: true, isPlatformAdmin: true },
  })
  const workspaceScope = await getUserPrimaryWorkspace(actorId)
  if (workspaceScope.workspaceId !== project.workspaceId) {
    throw scopeError('Workspace access denied', 403)
  }

  const [membership, workspaceMembership] = await Promise.all([
    prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: actorId } },
      select: { id: true, userId: true, role: true },
    }),
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: project.workspaceId, userId: actorId } },
      select: { id: true, userId: true, role: true, status: true },
    }),
  ])

  // A SUSPENDED workspace membership revokes access to every project of that
  // workspace: suspension is the workspace-level enforcement boundary (§16).
  if (workspaceMembership && workspaceMembership.status !== 'ACTIVE') {
    throw scopeError('Workspace access denied', 403)
  }

  if (!membership) {
    if (user?.isPlatformAdmin && workspaceScope.supportAccess) {
      return {
        projectId,
        project,
        // Explicit support access is administrative but never impersonates an OWNER.
        membership: { id: 0, userId: actorId, role: 'ADMIN' },
        supportAccess: true,
      }
    }
    throw scopeError('Project access denied', 403)
  }

  if (!workspaceMembership && !user?.isPlatformAdmin) {
    throw scopeError('Workspace access denied', 403)
  }

  return { projectId, project, membership, workspaceMembership: workspaceMembership ?? undefined, supportAccess: false }
}

export function requireProjectScope(options: { write?: boolean; capability?: ProjectCapability } = {}): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scope = await resolveProjectScope(projectIdFromRequest(req), actorIdFromRequest(req))
      if (options.capability) requireProjectCapability(scope, options.capability)

      if (options.write) {
        const entitlement = evaluateWorkspaceEntitlement(scope.project.workspace)
        if (!entitlement.isEntitledToWrite) {
          return res.status(402).json({
            error: 'La suscripción o período de prueba de tu cuenta no permite operaciones de escritura.',
            code: entitlement.reason,
            billingStatus: scope.project.workspace.billingStatus,
            trialEndsAt: scope.project.workspace.trialEndsAt?.toISOString(),
          })
        }
        if (scope.project.status === 'ARCHIVED') throw scopeError('Archived projects are read-only', 409)
        await assertWorkspaceWriteAllowed(scope.project.workspaceId)
      }

      req.projectScope = scope
      next()
    } catch (error) {
      next(error)
    }
  }
}

export function requireProjectWriteScope(): RequestHandler {
  return requireProjectScope({ write: true })
}

export function requireProjectRole(scope: ProjectScope, allowed: readonly ProjectRole[]): void {
  if (!allowed.includes(scope.membership.role)) throw scopeError('Insufficient project role', 403)
}

/** Central policy boundary for every project-scoped capability. */
export function requireProjectCapability(scope: ProjectScope, capability: ProjectCapability): void {
  requireProjectRole(scope, projectCapabilities[capability])
}

export function scopedProjectId(req: Request): number {
  if (!req.projectScope) throw scopeError('Project scope middleware is required', 500)
  return req.projectScope.projectId
}

export async function requireAssetInProject(assetId: number, projectId: number, options: { includeDeleted?: boolean } = {}): Promise<{ id: number; projectId: number; locationId: number }> {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, projectId, deletedAt: options.includeDeleted ? undefined : null },
    select: { id: true, projectId: true, locationId: true },
  })
  if (!asset) throw scopeError('Asset not found in project', 404)
  return asset
}

export async function requireLocationInProject(locationId: number, projectId: number): Promise<{ id: number; projectId: number }> {
  const location = await prisma.location.findFirst({ where: { id: locationId, projectId }, select: { id: true, projectId: true } })
  if (!location) throw scopeError('Location not found in project', 404)
  return location
}

export async function requireDocumentInProject(documentId: number, projectId: number): Promise<{ id: number; projectId: number }> {
  const document = await prisma.document.findFirst({ where: { id: documentId, projectId }, select: { id: true, projectId: true } })
  if (!document) throw scopeError('Document not found in project', 404)
  return document
}

export async function requireFloorPlanInProject(floorPlanId: number, projectId: number): Promise<{ id: number; projectId: number }> {
  const plan = await prisma.floorPlan.findFirst({ where: { id: floorPlanId, projectId }, select: { id: true, projectId: true } })
  if (!plan) throw scopeError('Floor plan not found in project', 404)
  return plan
}

export async function requireMemberInProject(userId: number, projectId: number): Promise<void> {
  const membership = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { id: true } })
  if (!membership) throw scopeError('Responsible user must be a project member', 400)
}
