import type { ReactNode } from 'react'
import { splitCommentUrls } from '@/lib/comments'

// COM-01: renderiza el cuerpo de un comentario como texto plano multilínea.
// Las URLs http/https se convierten en enlaces seguros (nueva pestaña,
// rel="noopener noreferrer"); cualquier otra cosa viaja como texto escapado
// por React: nunca se renderiza HTML arbitrario enviado por el usuario.
export default function CommentText({ body, id }: { body: string; id?: string }) {
  const segments = splitCommentUrls(body)
  const content: ReactNode[] = segments.map((segment, index) => (
    segment.type === 'url' ? (
      <a
        key={`${id ?? 'comment'}-${index}`}
        href={segment.value}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        className="text-brand-600 dark:text-brand-400 hover:underline break-all"
      >
        {segment.value}
      </a>
    ) : (
      <span key={`${id ?? 'comment'}-${index}`}>{segment.value}</span>
    )
  ))
  return <p className="whitespace-pre-wrap break-words text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{content}</p>
}
