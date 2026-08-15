import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { ProjectRole, ProjectStatus } from '@prisma/client'
import prisma from './prisma'
import { authenticatedUserId } from './auth'

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
  project: { id: number; code: string; name: string; status: ProjectStatus; themeKey: string }
  membership: { id: number; userId: number; role: ProjectRole }
}

declare module 'express' {
  interface Request {
    projectScope?: ProjectScope
  }
}

function scopeError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status })
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
    select: { id: true, code: true, name: true, status: true, themeKey: true },
  })
  if (!project) throw scopeError('Project not found', 404)

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: actorId } },
    select: { id: true, userId: true, role: true },
  })
  if (!membership) throw scopeError('Project access denied', 403)
  return { projectId, project, membership }
}

export function requireProjectScope(options: { write?: boolean; capability?: ProjectCapability } = {}): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const scope = await resolveProjectScope(projectIdFromRequest(req), actorIdFromRequest(req))
      if (options.capability) requireProjectCapability(scope, options.capability)
      if (options.write && scope.project.status === 'ARCHIVED') throw scopeError('Archived projects are read-only', 409)
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
