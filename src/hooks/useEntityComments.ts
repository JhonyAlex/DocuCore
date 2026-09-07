import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createEntityComment,
  deleteComment,
  fetchEntityComments,
  updateComment,
  type ApiComment,
  type ApiCommentEntityType,
} from '@/lib/api'

// COM-01: estado de los comentarios de una entidad (activo/documento).
// - Carga inicial solo al montar con la entidad visible (lazy).
// - Secuencia de peticiones: al cambiar rápido de activo/documento se
//   descartan las respuestas obsoletas del recurso anterior.
// - «Cargar anteriores» usa el cursor opaco del servidor (createdAt DESC,
//   id DESC), sin OFFSET: no repite ni pierde filas entre páginas.
// - Las mutaciones (create/update/remove) capturan la GENERACIÓN de la
//   entidad al iniciarse y, antes de tocar estado, errores o devolver éxito,
//   comprueban que la entidad no cambió mientras la petición estaba en vuelo:
//   un componente que reutiliza el hook (p. ej. el modal de documento que
//   pasa de un documento a otro sin desmontarse) nunca aplica la respuesta de
//   la entidad anterior sobre la lista de la nueva. La generación se invalida
//   al cambiar projectId/entityType/entityId y al desmontar.
// - Crear/editar/eliminar actualizan la lista en memoria; nunca se refresca
//   el DTO pesado de la entidad por una operación de comentarios.

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback
}

export function useEntityComments(projectId: number, entityType: ApiCommentEntityType, entityId: number) {
  const [comments, setComments] = useState<ApiComment[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const sequenceRef = useRef(0)
  const entityGenerationRef = useRef(0)

  const loadFirstPage = useCallback(async () => {
    const requestId = ++sequenceRef.current
    setLoading(true)
    setError(null)
    setLoadMoreError(null)
    setComments([])
    setNextCursor(null)
    setHasMore(false)
    try {
      const page = await fetchEntityComments(projectId, { entityType, entityId })
      if (requestId !== sequenceRef.current) return
      setComments(page.data)
      setNextCursor(page.nextCursor)
      setHasMore(page.hasMore)
    } catch (reason) {
      if (requestId !== sequenceRef.current) return
      setError(errorMessage(reason, 'No se pudieron cargar los comentarios.'))
    } finally {
      if (requestId === sequenceRef.current) setLoading(false)
    }
  }, [entityId, entityType, projectId])

  useEffect(() => {
    // Nueva entidad (o montaje): las mutaciones en vuelo de la anterior quedan
    // huérfanas y se descartan; sus flags de ocupación se reinician aquí para
    // que la nueva entidad pueda operar de inmediato.
    entityGenerationRef.current += 1
    setCreating(false)
    setUpdatingId(null)
    setDeletingId(null)
    setCreateError(null)
    setUpdateError(null)
    setDeleteError(null)
    void loadFirstPage()
    return () => {
      // Invalida respuestas y mutaciones en vuelo al desmontar o cambiar.
      sequenceRef.current += 1
      entityGenerationRef.current += 1
    }
  }, [loadFirstPage])

  const loadOlder = useCallback(async () => {
    if (!nextCursor || loadingOlder) return
    const requestId = ++sequenceRef.current
    setLoadingOlder(true)
    setLoadMoreError(null)
    try {
      const page = await fetchEntityComments(projectId, { entityType, entityId, cursor: nextCursor })
      if (requestId !== sequenceRef.current) return
      setComments((current) => {
        const known = new Set(current.map((comment) => comment.id))
        return [...current, ...page.data.filter((comment) => !known.has(comment.id))]
      })
      setNextCursor(page.nextCursor)
      setHasMore(page.hasMore)
    } catch (reason) {
      if (requestId !== sequenceRef.current) return
      setLoadMoreError(errorMessage(reason, 'No se pudieron cargar los comentarios anteriores.'))
    } finally {
      if (requestId === sequenceRef.current) setLoadingOlder(false)
    }
  }, [entityId, entityType, loadingOlder, nextCursor, projectId])

  const create = useCallback(async (body: string): Promise<boolean> => {
    if (creating) return false
    const generation = entityGenerationRef.current
    setCreating(true)
    setCreateError(null)
    try {
      const created = await createEntityComment(projectId, { entityType, entityId, body })
      if (generation !== entityGenerationRef.current) return false
      setComments((current) => [created, ...current])
      return true
    } catch (reason) {
      if (generation === entityGenerationRef.current) {
        setCreateError(errorMessage(reason, 'No se pudo publicar el comentario.'))
      }
      return false
    } finally {
      if (generation === entityGenerationRef.current) setCreating(false)
    }
  }, [creating, entityId, entityType, projectId])

  const update = useCallback(async (commentId: number, body: string): Promise<boolean> => {
    if (updatingId !== null) return false
    const generation = entityGenerationRef.current
    setUpdatingId(commentId)
    setUpdateError(null)
    try {
      const updated = await updateComment(projectId, commentId, body)
      if (generation !== entityGenerationRef.current) return false
      setComments((current) => current.map((comment) => (comment.id === commentId ? updated : comment)))
      return true
    } catch (reason) {
      if (generation === entityGenerationRef.current) {
        setUpdateError(errorMessage(reason, 'No se pudo guardar el comentario.'))
      }
      return false
    } finally {
      if (generation === entityGenerationRef.current) setUpdatingId(null)
    }
  }, [projectId, updatingId])

  const remove = useCallback(async (commentId: number): Promise<boolean> => {
    if (deletingId !== null) return false
    const generation = entityGenerationRef.current
    setDeletingId(commentId)
    setDeleteError(null)
    try {
      await deleteComment(projectId, commentId)
      if (generation !== entityGenerationRef.current) return false
      setComments((current) => current.filter((comment) => comment.id !== commentId))
      return true
    } catch (reason) {
      if (generation === entityGenerationRef.current) {
        setDeleteError(errorMessage(reason, 'No se pudo eliminar el comentario.'))
      }
      return false
    } finally {
      if (generation === entityGenerationRef.current) setDeletingId(null)
    }
  }, [deletingId, projectId])

  const resetActionErrors = useCallback(() => {
    setCreateError(null)
    setUpdateError(null)
    setDeleteError(null)
  }, [])

  return {
    comments,
    nextCursor,
    hasMore,
    loading,
    error,
    loadingOlder,
    loadMoreError,
    creating,
    createError,
    updatingId,
    updateError,
    deletingId,
    deleteError,
    reload: loadFirstPage,
    loadOlder,
    create,
    update,
    remove,
    resetActionErrors,
  }
}
