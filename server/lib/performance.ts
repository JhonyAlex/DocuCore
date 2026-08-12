/** Shared server-side limits for every data surface that can grow with a project. */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
export const DEFAULT_AUTOCOMPLETE_SIZE = 20
export const MAX_AUTOCOMPLETE_SIZE = 50
export const DEFAULT_MARKER_PAGE_SIZE = 250
export const MAX_MARKER_PAGE_SIZE = 500
export const LOCATION_PREVIEW_SIZE = 3
export const MAX_CALENDAR_RANGE_DAYS = 93
export const MAX_CALENDAR_EVENTS = 500

export function pageLimit(value: unknown, fallback = DEFAULT_PAGE_SIZE, maximum = MAX_PAGE_SIZE): number {
  const parsed = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(maximum, Math.floor(parsed)) : fallback
}
