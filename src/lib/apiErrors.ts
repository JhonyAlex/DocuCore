export interface UserWriteErrorMessages {
  conflict?: string
  notFound?: string
  validation?: string
  fallback: string
}

// El cliente API lanza errores con el código HTTP embebido en el mensaje
// (`API 409: ...`); esto los traduce a mensajes de usuario en español.
export function toUserWriteError(writeError: unknown, messages: UserWriteErrorMessages): string {
  const message = writeError instanceof Error ? writeError.message : ''
  const status = typeof writeError === 'object' && writeError !== null && 'status' in writeError && typeof writeError.status === 'number' ? writeError.status : null
  if (status === 409 || message.includes('409')) return messages.conflict ?? messages.fallback
  if (status === 404 || message.includes('404')) return messages.notFound ?? messages.fallback
  if (status === 400 || status === 422 || message.includes('400') || message.includes('422')) return messages.validation ?? messages.fallback
  return messages.fallback
}
