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
  if (message.includes('409')) return messages.conflict ?? messages.fallback
  if (message.includes('404')) return messages.notFound ?? messages.fallback
  if (message.includes('400') || message.includes('422')) return messages.validation ?? messages.fallback
  return messages.fallback
}
