export interface NormalizedPoint {
  x: number
  y: number
}

export function clampNormalized(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function normalizeImagePoint(x: number, y: number, width: number, height: number): NormalizedPoint {
  if (width <= 0 || height <= 0) return { x: 0, y: 0 }
  return { x: clampNormalized(x / width), y: clampNormalized(y / height) }
}

export function denormalizeImagePoint(point: NormalizedPoint, width: number, height: number): { x: number; y: number } {
  return { x: clampNormalized(point.x) * width, y: clampNormalized(point.y) * height }
}
