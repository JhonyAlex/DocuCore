import { useContext, useEffect, useState } from 'react'
import type { ApiCommentEntityType } from '@/lib/api'
import { SessionContext } from '@/contexts/SessionContext'
import { responsibleColorMap } from '@/lib/assetMappers'
import { useEntityComments } from '@/hooks/useEntityComments'
import CommentItem from '@/components/comments/CommentItem'

// COM-01: panel de comentarios reutilizable para activos y documentos.
//
// <EntityCommentsPanel entityType="asset" entityId={asset.id} … />
// <EntityCommentsPanel entityType="document" entityId={document.id} … />
//
// Estados: loading, error (+ reintentar), vacío, cargando anteriores,
// creando, editando y eliminando. La escritura se oculta con `readOnly`
// (archivado/plan) o `canComment={false}` (VIEWER); el servidor decide en
// cada comentario si su autor —o un ADMIN/OWNER— puede editarlo/eliminarlo
// (`canEdit`/`canDelete` del DTO), así la UI nunca adivina permisos.

interface EntityCommentsPanelProps {
  projectId: number
  entityType: ApiCommentEntityType
  entityId: number
  readOnly?: boolean
  canComment?: boolean
  count?: number | null
  onClose?: () => void
  onCountChange?: (delta: number) => void
  className?: string
}

function LoadingComments() {
  return (
    <div className="space-y-3" aria-label="Cargando comentarios" role="status">
      {[0, 1].map((row) => (
        <div key={row} className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse shrink-0" />
          <div className="flex-1 space-y-2 rounded-lg bg-slate-100 dark:bg-slate-800/60 p-3 animate-pulse">
            <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-3 w-5/6 rounded bg-slate-200 dark:bg-slate-700" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function EntityCommentsPanel({
  projectId,
  entityType,
  entityId,
  readOnly = false,
  canComment = true,
  count = null,
  onClose,
  onCountChange,
  className = '',
}: EntityCommentsPanelProps) {
  const sessionContext = useContext(SessionContext)
  const user = sessionContext?.user ?? null
  const [draft, setDraft] = useState('')
  const trimmedDraft = draft.trim()
  const canWrite = canComment && !readOnly
  const commentsApi = useEntityComments(projectId, entityType, entityId)
  const { comments, hasMore } = commentsApi

  // Reiniciar el borrador al cambiar de entidad o proyecto para garantizar
  // que un texto sin publicar nunca se arrastre a otra entidad.
  useEffect(() => {
    setDraft('')
  }, [projectId, entityType, entityId])

  const submit = async () => {
    if (!trimmedDraft || commentsApi.creating) return
    const ok = await commentsApi.create(trimmedDraft)
    if (ok) {
      setDraft('')
      onCountChange?.(1)
    }
  }

  const remove = async (commentId: number) => {
    const ok = await commentsApi.remove(commentId)
    if (ok) onCountChange?.(-1)
  }

  return (
    <section aria-label="Comentarios" className={`flex min-h-0 flex-col ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
        <h4 className="font-medium text-sm flex items-center gap-2">
          Comentarios
          {count !== null && count > 0 && (
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5">{count}</span>
          )}
        </h4>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Cerrar comentarios" className="p-1.5 -m-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin pr-1 -mr-1">
        {commentsApi.loading ? (
          <LoadingComments />
        ) : commentsApi.error ? (
          <div role="alert" className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
            <p>{commentsApi.error}</p>
            <button type="button" onClick={() => void commentsApi.reload()} className="mt-2 text-xs font-medium text-red-700 dark:text-red-300 underline underline-offset-2">
              Reintentar
            </button>
          </div>
        ) : comments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-500 dark:text-slate-400">
            {canWrite ? 'Sin comentarios todavía. Añade una nota con información útil para el equipo.' : 'Sin comentarios todavía.'}
          </p>
        ) : (
          <>
            <ul className="space-y-3">
              {comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  readOnly={readOnly}
                  updating={commentsApi.updatingId === comment.id}
                  updateError={commentsApi.updateError}
                  deleting={commentsApi.deletingId === comment.id}
                  deleteError={commentsApi.deleteError}
                  onSave={(commentId, body) => commentsApi.update(commentId, body)}
                  onDelete={remove}
                  onDismissErrors={commentsApi.resetActionErrors}
                />
              ))}
            </ul>
            {hasMore && (
              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={() => void commentsApi.loadOlder()}
                  disabled={commentsApi.loadingOlder}
                  className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  {commentsApi.loadingOlder ? 'Cargando anteriores…' : 'Cargar comentarios anteriores'}
                </button>
                {commentsApi.loadMoreError && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{commentsApi.loadMoreError}</p>}
              </div>
            )}
          </>
        )}
      </div>

      {canWrite && (
        <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 pt-3 mt-3">
          <div className="flex items-start gap-2.5">
            {user ? (
              <span className={`w-8 h-8 shrink-0 rounded-full ${responsibleColorMap[user.color] ?? 'bg-brand-500'} text-white text-xs font-medium flex items-center justify-center select-none`} aria-hidden="true">
                {user.initials}
              </span>
            ) : (
              <span className="w-8 h-8 shrink-0 rounded-full bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault()
                    submit()
                  }
                }}
                maxLength={4000}
                rows={2}
                placeholder="Añade un comentario…"
                aria-label="Nuevo comentario"
                className="w-full resize-none rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/60 scrollbar-thin"
              />
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate">Ctrl + Enter para enviar</span>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!trimmedDraft || commentsApi.creating}
                  className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium disabled:opacity-40 transition-colors"
                >
                  {commentsApi.creating ? 'Publicando…' : 'Comentar'}
                </button>
              </div>
              {commentsApi.createError && <p role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">{commentsApi.createError}</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
