/**
 * Canonical project-code presentation and persistence format.
 *
 * Codes are human-entered identifiers, so accept natural spacing while making
 * the result predictable for URLs, filters, and uniqueness checks.
 */
export function normalizeProjectCode(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-')
}
