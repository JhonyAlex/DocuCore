import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ApiComment } from '@/lib/api'
import { responsibleColorMap } from '@/lib/assetMappers'
import { formatExactDateTime, formatRelativeTime } from '@/lib/time'
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

function CommentAvatar({ comment, size = 'sm' }: { comment: ApiComment; size?: 'md' | 'sm' }) {
  const classes = size === 'md' ? 'w-7 h-7 text-xs' : 'w-6 h-6 text-[10px]'
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
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null)
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

  useEffect(() => {
    if (!menuOpen) {
      setMenuPos(null)
      return
    }
    const updatePosition = () => {
      const anchor = menuButtonRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const width = 144
      const padding = 8
      setMenuPos({
        top: rect.bottom + 4,
        left: Math.min(window.innerWidth - width - padding, Math.max(padding, rect.right - width)),
        width,
      })
    }
    updatePosition()
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    const onScroll = () => setMenuOpen(false)
    window.addEventListener('keydown', onEscape)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onEscape)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [menuOpen])

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
    <li className="flex items-start gap-2 group">
      <CommentAvatar comment={comment} size="sm" />
      <div className="min-w-0 flex-1 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 p-2.5">
        <div className="flex items-start justify-between gap-1.5">
          <div className="flex flex-wrap items-baseline gap-x-1.5 min-w-0">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{comment.author.name}</span>
            <time dateTime={comment.createdAt} title={formatExactDateTime(comment.createdAt)} className="text-[10px] text-slate-400 dark:text-slate-500">
              {formatRelativeTime(comment.createdAt)}
            </time>
            {comment.edited && (
              <span title={`Editado ${formatExactDateTime(comment.updatedAt)}`} className="text-[10px] italic text-slate-400 dark:text-slate-500">
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
                className="p-0.5 -m-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 dark:hover:text-slate-200 dark:hover:bg-slate-700 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="5" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="12" cy="19" r="1.6" />
                </svg>
              </button>
              {menuOpen && menuPos && createPortal(
                <>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Cerrar menú de acciones"
                    onClick={() => setMenuOpen(false)}
                    className="fixed inset-0 z-[70] cursor-default"
                  />
                  <div
                    role="menu"
                    aria-label="Acciones del comentario"
                    style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
                    className="fixed z-[75] rounded-lg border border-slate-200 bg-white p-1 text-left shadow-lg dark:border-slate-700 dark:bg-slate-900 fade-in"
                  >
                    {comment.canEdit && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={beginEdit}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                        Editar
                      </button>
                    )}
                    {comment.canDelete && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={requestDelete}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        Eliminar
                      </button>
                    )}
                  </div>
                </>,
                document.body,
              )}
            </div>
          )}
        </div>

        {editing ? (
          <div className="mt-1.5">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={4000}
              rows={2}
              aria-label="Editar comentario"
              className="w-full resize-y rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/60 scrollbar-thin"
            />
            {updateError && <p role="alert" className="mt-1 text-[11px] text-red-600 dark:text-red-400">{updateError}</p>}
            <div className="mt-1.5 flex items-center justify-end gap-1.5">
              <button type="button" onClick={cancelEdit} disabled={updating} className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] disabled:opacity-40">Cancelar</button>
              <button type="button" onClick={save} disabled={!trimmedDraft || updating} className="px-2.5 py-1 rounded bg-brand-600 hover:bg-brand-700 text-white text-[11px] font-medium disabled:opacity-40">
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
