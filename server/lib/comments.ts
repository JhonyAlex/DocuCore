import { z } from 'zod'
import type { ProjectRole } from '@prisma/client'
import prisma from './prisma'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, pageLimit } from './performance'

// COM-01: los comentarios viven fuera del DTO pesado de Asset/Document y se
// consultan por entidad con paginación por cursor (createdAt DESC, id DESC).
// El cursor es opaco para el cliente: codifica la fecha (ISO) y el id de la
// última fila devuelta para seguir sin OFFSET, sin repetir ni perder filas
// aunque se borren comentarios entre páginas (keyset, no posicional).

export const COMMENT_BODY_MAX_LENGTH = 4000
export const COMMENT_FIRST_PAGE_SIZE = 20

export const commentWriteSchema = z.object({
  body: z.string().trim().min(1, 'Comment body must not be empty').max(COMMENT_BODY_MAX_LENGTH, `Comment body must not exceed ${COMMENT_BODY_MAX_LENGTH} characters`),
}).strict()

export type CommentCursor = { createdAt: Date; id: number }

export function encodeCommentCursor(row: { createdAt: Date; id: number }): string {
  return Buffer.from(JSON.stringify({ c: row.createdAt.toISOString(), i: row.id }), 'utf8').toString('base64url')
}

export function parseCommentCursor(value: unknown): CommentCursor | null {
  if (typeof value !== 'string' || value === '') return null
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { c?: unknown; i?: unknown }
    const createdAt = typeof decoded.c === 'string' ? new Date(decoded.c) : null
    const id = typeof decoded.i === 'number' ? decoded.i : Number.NaN
    if (!createdAt || Number.isNaN(createdAt.getTime()) || !Number.isInteger(id) || id <= 0) return null
    return { createdAt, id }
  } catch {
    return null
  }
}

export function commentPageLimit(value: unknown): number {
  return pageLimit(value, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
}

export const commentAuthorSelect = {
  id: true,
  name: true,
  initials: true,
  color: true,
} as const

export type CommentAuthor = { id: number; name: string; initials: string; color: string }

export interface CommentListRow {
  id: number
  projectId: number
  authorId: number
  assetId: number | null
  documentId: number | null
  body: string
  createdAt: Date
  updatedAt: Date
  author: CommentAuthor
}

export interface CommentActorContext {
  actorId: number
  membershipRole: ProjectRole
  supportAccess: boolean
}

function canManageComment(row: Pick<CommentListRow, 'authorId'>, actor: CommentActorContext): boolean {
  // Un VIEWER nunca escribe (lo bloquea la política central), y fuera del
  // autor solo ADMIN/OWNER (o acceso soporte) gestiona comentarios ajenos.
  if (actor.membershipRole === 'VIEWER') return false
  if (row.authorId === actor.actorId) return true
  return actor.membershipRole === 'ADMIN' || actor.membershipRole === 'OWNER' || actor.supportAccess
}

/**
 * Contexto del miembro que actúa, derivado del scope ya resuelto por la
 * política central (`requireProjectScope`): el rol de proyecto nunca se
 * confía a parámetros de la petición.
 */
export function commentActorContext(scope: { membership: { userId: number; role: ProjectRole }; supportAccess: boolean }): CommentActorContext {
  return { actorId: scope.membership.userId, membershipRole: scope.membership.role, supportAccess: scope.supportAccess }
}

/** Regla de gestión por comentario: autor, o ADMIN/OWNER/soporte. */
export function requireCommentManageable(row: Pick<CommentListRow, 'authorId'>, actor: CommentActorContext): void {
  if (!canManageComment(row, actor)) {
    throw Object.assign(new Error('Insufficient permissions to modify this comment'), { status: 403 })
  }
}

export function serializeComment(row: CommentListRow, actor: CommentActorContext) {
  const manage = canManageComment(row, actor)
  return {
    id: row.id,
    projectId: row.projectId,
    authorId: row.authorId,
    assetId: row.assetId,
    documentId: row.documentId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    edited: row.updatedAt.getTime() > row.createdAt.getTime(),
    author: row.author,
    canEdit: manage,
    canDelete: manage,
  }
}

export interface ListCommentPageOptions {
  projectId: number
  assetId?: number
  documentId?: number
  cursor?: CommentCursor | null
  limit: number
}

/** Una página estricta hacia atrás (las más recientes primero). */
export async function listCommentPage(options: ListCommentPageOptions): Promise<{ rows: CommentListRow[]; hasMore: boolean }> {
  const { projectId, assetId, documentId, cursor, limit } = options
  const where = {
    projectId,
    ...(assetId !== undefined ? { assetId } : {}),
    ...(documentId !== undefined ? { documentId } : {}),
    ...(cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {}),
  }
  const rows = await prisma.comment.findMany({
    where,
    include: { author: { select: commentAuthorSelect } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  })
  const hasMore = rows.length > limit
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore }
}
