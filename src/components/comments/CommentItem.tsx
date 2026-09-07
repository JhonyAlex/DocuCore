import { useEffect, useRef, useState } from 'react'
import type { ApiComment } from '@/lib/api'
import { responsibleColorMap } from '@/lib/assetMappers'
import { formatExactDateTime, formatRelativeTime } from '@/lib/time'
import PortalListbox from '@/components/PortalListbox'
import ConfirmDialog from '@/components/ConfirmDialog'
import CommentText from '@/components/comments/CommentText'

// COM-01: una entrada de comentario. Avatar de iniciales, nombre, tiempo
// relativo (con fecha exacta en el tooltip), indicador «Editado», edición
// inline y menú ⋯ con confirmación destructiva (ConfirmDialog, misma capa
// que el resto del proyecto).

interface CommentItemProps {
  comment: ApiComment
  readOnly?: boolean
  updating?: boolean
  updateError?: string | null
  deleting?: boolean
  deleteError?: string | null
  onSave: (commentId: number, body: string) => Promise<boolean>
  onDelete: (commentId: number) => Promise<unknown>
  onDismissErrors: () => void
}

function CommentAvatar({ comment, size = 'md' }: { comment: ApiComment; size?: 'md' | 'sm' }) {
  const classes = size === 'md' ? 'w-8 h-8 text-xs' : 'w-6 h-6 text-[10px]'
  return (
    <span className={`${classes} shrink-0 rounded-full ${responsibleColorMap[comment.author.color] ?? 'bg-brand-500'} text-white font-medium flex items-center justify-center select-none`} aria-hidden="true">
      {comment.author.initials}
    </span>
  )
}

export default function CommentItem({ comment, readOnly = false, updating = false, updateError = null, deleting = false, deleteError = null, onSave, onDelete, onDismissErrors }: CommentItemProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const canManage = !readOnly && (comment.canEdit || comment.canDelete)
  const trimmedDraft = draft.trim()

  useEffect(() => {
    if (!editing) return
    textareaRef.current?.focus()
    textareaRef.current?.setSelectionRange(comment.body.length, comment.body.length)
  }, [editing, comment.body.length])

  const beginEdit = () => {
    setMenuOpen(false)
    setDraft(comment.body)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    onDismissErrors()
  }

  const save = async () => {
    if (trimmedDraft === comment.body) {
      setEditing(false)
      return
    }
    if (!trimmedDraft) return
    const ok = await onSave(comment.id, trimmedDraft)
    if (ok) setEditing(false)
  }

  const requestDelete = () => {
    setMenuOpen(false)
    setConfirmOpen(true)
  }

  return (
    <li className="flex items-start gap-2.5 group">
      <CommentAvatar comment={comment} />
      <div className="min-w-0 flex-1 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-x-1.5 min-w-0">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{comment.author.name}</span>
            <time dateTime={comment.createdAt} title={formatExactDateTime(comment.createdAt)} className="text-xs text-slate-400 dark:text-slate-500">
              {formatRelativeTime(comment.createdAt)}
            </time>
            {comment.edited && (
              <span title={`Editado ${formatExactDateTime(comment.updatedAt)}`} className="text-xs italic text-slate-400 dark:text-slate-500">
                · Editado
              </span>
            )}
          </div>
          {canManage && (
            <div className="relative shrink-0">
              <button
                ref={menuButtonRef}
                type="button"
                aria-label={`Acciones del comentario de ${comment.author.name}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
                className="p-1 -m-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 dark:hover:text-slate-200 dark:hover:bg-slate-700 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="5" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="12" cy="19" r="1.6" />
                </svg>
              </button>
              {menuOpen && (
                <PortalListbox anchorRef={menuButtonRef} onClose={() => setMenuOpen(false)}>
                  <ul role="menu" aria-label="Acciones del comentario" className="w-40 overflow-hidden rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg fade-in py-1">
                    {comment.canEdit && (
                      <li role="menuitem">
                        <button type="button" onClick={beginEdit} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                          <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                          Editar
                        </button>
                      </li>
                    )}
                    {comment.canDelete && (
                      <li role="menuitem">
                        <button type="button" onClick={requestDelete} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                          Eliminar
                        </button>
                      </li>
                    )}
                  </ul>
                </PortalListbox>
              )}
            </div>
          )}
        </div>

        {editing ? (
          <div className="mt-2">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={4000}
              rows={3}
              aria-label="Editar comentario"
              className="w-full resize-y rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/60 scrollbar-thin"
            />
            {updateError && <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{updateError}</p>}
            <div className="mt-2 flex items-center justify-end gap-2">
              <button type="button" onClick={cancelEdit} disabled={updating} className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs disabled:opacity-40">Cancelar</button>
              <button type="button" onClick={save} disabled={!trimmedDraft || updating} className="px-3 py-1.5 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium disabled:opacity-40">
                {updating ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-1">
            <CommentText body={comment.body} id={`comment-${comment.id}`} />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Eliminar comentario"
        message={`¿Eliminar el comentario de ${comment.author.name}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        busy={deleting}
        busyLabel="Eliminando…"
        error={deleteError}
        onConfirm={() => void onDelete(comment.id)}
        onCancel={() => { setConfirmOpen(false); onDismissErrors() }}
        variant="danger"
      />
    </li>
  )
}
