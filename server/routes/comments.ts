import { Router, type Request, type Response } from 'express'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { actorIdFromRequest, scopedProjectId } from '../lib/projectScope'
import {
  commentActorContext,
  commentAuthorSelect,
  commentWriteSchema,
  requireCommentManageable,
  serializeComment,
} from '../lib/comments'

// COM-01: gestión de un comentario concreto dentro del proyecto resuelto por
// la política central (operationalScope). El id del comentario nunca escapa
// del proyecto: la búsqueda filtra por projectId, de modo que un id de otro
// proyecto responde 404 en lugar de filtrar o mutar.
const router: Router = Router({ mergeParams: true })

function parseCommentId(value: string | undefined): number | null {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function commentHostLabel(row: { asset?: { code: string } | null; document?: { name: string } | null }): string {
  if (row.asset) return `activo "${row.asset.code}"`
  if (row.document) return `documento "${row.document.name}"`
  return 'comentario huérfano'
}

const commentWithHostInclude = {
  author: { select: commentAuthorSelect },
  asset: { select: { code: true } },
  document: { select: { name: true } },
} as const

router.patch('/:commentId', asyncHandler(async (req: Request, res: Response) => {
  const commentId = parseCommentId(req.params.commentId)
  if (commentId === null) {
    res.status(400).json({ error: 'Invalid comment id' })
    return
  }
  const input = commentWriteSchema.parse(req.body)
  const projectId = scopedProjectId(req)
  const existing = await prisma.comment.findFirst({
    where: { id: commentId, projectId },
    include: commentWithHostInclude,
  })
  if (!existing) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const actor = commentActorContext(req.projectScope!)
  requireCommentManageable(existing, actor)
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.comment.update({
      where: { id: existing.id },
      data: { body: input.body },
      include: { author: { select: commentAuthorSelect } },
    })
    await tx.auditLog.create({
      data: {
        projectId,
        userId: actor.actorId,
        // El texto editado no se duplica en la auditoría.
        action: 'Comentario editado',
        entityId: `comment:${row.id}`,
        detail: `Comentario en ${commentHostLabel(existing)}`,
        timestamp: new Date(),
      },
    })
    return row
  })
  res.json(serializeComment(updated, actor))
}))

router.delete('/:commentId', asyncHandler(async (req: Request, res: Response) => {
  const commentId = parseCommentId(req.params.commentId)
  if (commentId === null) {
    res.status(400).json({ error: 'Invalid comment id' })
    return
  }
  const projectId = scopedProjectId(req)
  const existing = await prisma.comment.findFirst({
    where: { id: commentId, projectId },
    include: commentWithHostInclude,
  })
  if (!existing) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const actor = commentActorContext(req.projectScope!)
  requireCommentManageable(existing, actor)
  await prisma.$transaction([
    prisma.comment.deleteMany({ where: { id: existing.id, projectId } }),
    prisma.auditLog.create({
      data: {
        projectId,
        userId: actorIdFromRequest(req),
        action: 'Comentario eliminado',
        entityId: `comment:${existing.id}`,
        detail: `Comentario en ${commentHostLabel(existing)}`,
        timestamp: new Date(),
      },
    }),
  ])
  res.status(204).end()
}))

export default router
