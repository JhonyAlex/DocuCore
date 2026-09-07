// COM-01: helpers puros de los comentarios (detección segura de URLs).
// El cuerpo se renderiza siempre como texto (`whitespace-pre-wrap`): solo las
// URLs http/https detectadas se convierten en enlaces con rel/noreferrer;
// nunca se interpreta HTML arbitrario enviado por el usuario.

export type CommentSegment = { type: 'text'; value: string } | { type: 'url'; value: string }

const COMMENT_URL_PATTERN = /https?:\/\/[^\s<>"']+/gi
const URL_TRAILING_PUNCTUATION = /[.,;:!?…)]+$/g

/**
 * Divide el cuerpo en segmentos de texto y URLs http/https. La puntuación que
 * cierra una frase ("Mira https://x.com/a, por favor") se deja fuera del
 * enlace y se conserva como texto.
 */
export function splitCommentUrls(body: string): CommentSegment[] {
  const segments: CommentSegment[] = []
  let lastIndex = 0
  for (const match of body.matchAll(COMMENT_URL_PATTERN)) {
    const start = match.index ?? 0
    if (start > lastIndex) segments.push({ type: 'text', value: body.slice(lastIndex, start) })
    const rawUrl = match[0]
    const withoutPunctuation = rawUrl.replace(URL_TRAILING_PUNCTUATION, '')
    segments.push({ type: 'url', value: withoutPunctuation })
    lastIndex = start + withoutPunctuation.length
  }
  if (lastIndex < body.length) segments.push({ type: 'text', value: body.slice(lastIndex) })
  return segments
}
