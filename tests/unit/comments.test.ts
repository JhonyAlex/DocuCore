import { describe, expect, it } from 'vitest'
import { splitCommentUrls } from '@/lib/comments'
import { formatExactDateTime, formatRelativeTime } from '@/lib/time'

// COM-01: helpers puros del panel de comentarios (detección de URLs y fechas
// relativas/exactas), sin dependencias DOM.

describe('splitCommentUrls', () => {
  it('keeps plain text without urls untouched', () => {
    expect(splitCommentUrls('Solo texto sin enlaces')).toEqual([{ type: 'text', value: 'Solo texto sin enlaces' }])
    expect(splitCommentUrls('')).toEqual([])
  })

  it('detects a single http(s) url and leaves it as its own segment', () => {
    const segments = splitCommentUrls('Ver https://ejemplo.com/plano?v=2 en el navegador')
    expect(segments).toEqual([
      { type: 'text', value: 'Ver ' },
      { type: 'url', value: 'https://ejemplo.com/plano?v=2' },
      { type: 'text', value: ' en el navegador' },
    ])
  })

  it('strips trailing sentence punctuation from the url and keeps it as text', () => {
    const segments = splitCommentUrls('Mira http://a.com/x, por favor.')
    expect(segments).toEqual([
      { type: 'text', value: 'Mira ' },
      { type: 'url', value: 'http://a.com/x' },
      { type: 'text', value: ', por favor.' },
    ])
  })

  it('handles urls inside parentheses and multiple urls in one comment', () => {
    const segments = splitCommentUrls('(https://a.com/1) y https://b.com/2')
    expect(segments).toEqual([
      { type: 'text', value: '(' },
      { type: 'url', value: 'https://a.com/1' },
      { type: 'text', value: ') y ' },
      { type: 'url', value: 'https://b.com/2' },
    ])
  })

  it('never strips content of a url and never alters plain text (round trip)', () => {
    const cases = [
      'Revisar https://docs.example.org/guia completa',
      'Sin enlaces, solo texto con puntuación: ¿ok?',
      'ftp://no-es-http.com y http://si.es/a, y https://si.es/b.',
      'Multi\nlínea con https://x.com/y\nfinal',
    ]
    for (const body of cases) {
      const joined = splitCommentUrls(body).map((segment) => segment.value).join('')
      expect(joined).toBe(body)
    }
  })

  it('does not treat www or ftp urls as links', () => {
    const segments = splitCommentUrls('www.ejemplo.com no es enlace, ftp://x tampoco')
    expect(segments.every((segment) => segment.type === 'text')).toBe(true)
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-09-07T12:00:00.000Z')

  it('uses Spanish relative labels by distance', () => {
    expect(formatRelativeTime('2026-09-07T11:59:40.000Z', now)).toBe('Ahora mismo')
    expect(formatRelativeTime('2026-09-07T11:55:00.000Z', now)).toBe('Hace 5 min')
    expect(formatRelativeTime('2026-09-07T09:00:00.000Z', now)).toBe('Hace 3 h')
    expect(formatRelativeTime('2026-09-06T00:00:00.000Z', now)).toBe('Ayer')
    expect(formatRelativeTime('2026-09-01T12:00:00.000Z', now)).toBe('Hace 6 días')
  })

  it('falls back to a short date beyond a week and tolerates invalid input', () => {
    expect(formatRelativeTime('2026-08-01T12:00:00.000Z', now)).toBe('01/08')
    expect(formatRelativeTime('no-es-fecha', now)).toBe('')
  })
})

describe('formatExactDateTime', () => {
  it('formats dd/mm/yyyy hh:mm in UTC', () => {
    expect(formatExactDateTime('2026-09-07T14:05:00.000Z')).toBe('07/09/2026 14:05')
    expect(formatExactDateTime('invalida')).toBe('')
  })
})
