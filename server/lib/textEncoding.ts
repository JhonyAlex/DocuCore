/**
 * Repairs the usual UTF-8-as-Latin-1/Windows-1252 corruption without
 * touching correctly encoded Unicode. This is deliberately limited to the
 * known mojibake prefixes (Â, Ã and â) so ordinary Spanish text is preserved.
 */
const WINDOWS_1252_BYTES: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87,
  'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
}

// A multipart filename encoded in UTF-8 but decoded as Latin-1/Windows-1252
// always starts with one of these sequences. The expression intentionally
// stops before normal text so a mixed string can be repaired piece by piece.
const MOJIBAKE_SEQUENCE = /(?:Â[\u0080-\u00ff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]{1,2}|Ã[\u0080-\u00ff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]{1,2}|â[\u0080-\u00ff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]{2,4})/g
const SPACE_ENTITY = /&#(?:x0*(?:9|a|d|20|a0)|0*(?:9|10|13|32|160));/gi

function byteForWindows1252(character: string): number | null {
  const direct = character.charCodeAt(0)
  if (direct <= 0xff) return direct
  return WINDOWS_1252_BYTES[character] ?? null
}

function decodeMojibakeSequence(value: string): string {
  const bytes: number[] = []
  for (const character of value) {
    const byte = byteForWindows1252(character)
    if (byte === null) return value
    bytes.push(byte)
  }
  const decoded = Buffer.from(bytes).toString('utf8')
  return decoded.includes('\ufffd') ? value : decoded
}

/**
 * Makes inherited display text readable and removes numeric whitespace
 * entities commonly produced by legacy importers. It is idempotent.
 */
export function repairTextEncoding(value: string): string {
  let repaired = value.replace(SPACE_ENTITY, (entity) => {
    const hexadecimal = /^&#x([0-9a-f]+);$/i.exec(entity)
    const decimal = /^&#([0-9]+);$/.exec(entity)
    const codePoint = Number.parseInt(hexadecimal?.[1] ?? decimal?.[1] ?? '20', hexadecimal ? 16 : 10)
    return String.fromCodePoint(codePoint)
  })

  // A second pass covers data that was misdecoded more than once (for example
  // "ÃƒÂ±" instead of "ñ"). There is a hard cap to keep the operation bounded.
  for (let pass = 0; pass < 2; pass += 1) {
    const next = repaired.replace(MOJIBAKE_SEQUENCE, decodeMojibakeSequence)
    if (next === repaired) break
    repaired = next
  }
  return repaired.normalize('NFC')
}

/** File names do not need meaningful surrounding whitespace. */
export function normalizeFileName(value: string): string {
  return repairTextEncoding(value).trim() || 'archivo'
}

/** Recursively repairs API payload text while preserving arrays and primitives. */
export function normalizeTextPayload<T>(value: T): T {
  if (typeof value === 'string') return repairTextEncoding(value) as T
  if (Array.isArray(value)) return value.map((item) => normalizeTextPayload(item)) as T
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeTextPayload(item)])) as T
  }
  return value
}
