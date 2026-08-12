import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'

export const MAX_FLOOR_PLAN_SIZE_BYTES = 50 * 1024 * 1024
export const ALLOWED_FLOOR_PLAN_MIME_TYPES = new Map<string, string>([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
])

const MARKER = '.docucore-storage.json'
const OWNER = 'docucore-floor-plan-storage'
const ORIGINAL_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|jpeg|webp)$/i
const DZI_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TILE = /^\d+_\d+\.(?:jpeg|jpg|png|webp)$/i

export class FloorPlanStorageError extends Error {
  constructor(public readonly code: 'MISSING_MARKER' | 'INVALID_MARKER' | 'NOT_EMPTY', message: string) {
    super(message)
    this.name = 'FloorPlanStorageError'
  }
}

export interface StoredFloorPlan {
  storageKey: string
  dziKey: string
  width: number
  height: number
}

export function floorPlanStoragePath(): string {
  return path.resolve(process.env.FLOOR_PLAN_STORAGE_PATH ?? path.join(process.cwd(), 'data', 'floor-plans'))
}

function assertSafeRoot(): string {
  const root = floorPlanStoragePath()
  if (!root || root === path.resolve(root, '..') || root === path.parse(root).root) throw new Error('Invalid floor plan storage path')
  return root
}

async function assertMarker(): Promise<string> {
  const root = assertSafeRoot()
  let raw: string
  try { raw = await readFile(path.join(root, MARKER), 'utf8') } catch { throw new FloorPlanStorageError('MISSING_MARKER', 'Invalid floor plan storage path: missing DocuCore marker') }
  try {
    if ((JSON.parse(raw) as { owner?: unknown }).owner !== OWNER) throw new Error('owner')
  } catch { throw new FloorPlanStorageError('INVALID_MARKER', 'Invalid floor plan storage path: invalid DocuCore marker') }
  return root
}

async function ensureMarker(): Promise<void> {
  const root = assertSafeRoot()
  await mkdir(root, { recursive: true })
  if ((await readdir(root)).length > 0) throw new FloorPlanStorageError('NOT_EMPTY', 'Invalid floor plan storage path: directory is not empty (no DocuCore marker)')
  try {
    await writeFile(path.join(root, MARKER), `${JSON.stringify({ owner: OWNER, createdAt: new Date().toISOString() }, null, 2)}\n`, { flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    await assertMarker()
  }
}

async function root(): Promise<string> {
  try { return await assertMarker() } catch (error) {
    if (!(error instanceof FloorPlanStorageError) || error.code !== 'MISSING_MARKER') throw error
    await ensureMarker()
    return assertMarker()
  }
}

function originalPath(base: string, key: string): string {
  if (path.basename(key) !== key || !ORIGINAL_KEY.test(key)) throw new Error('Invalid floor plan storage key')
  return path.join(base, key)
}

function dziPath(base: string, key: string): string {
  if (!DZI_KEY.test(key)) throw new Error('Invalid floor plan DZI key')
  return path.join(base, `${key}.dzi`)
}

function dziOutputBase(base: string, key: string): string {
  if (!DZI_KEY.test(key)) throw new Error('Invalid floor plan DZI key')
  return path.join(base, key)
}

export async function storeFloorPlanBuffer(buffer: Buffer, mimeType: string): Promise<StoredFloorPlan> {
  const extension = ALLOWED_FLOOR_PLAN_MIME_TYPES.get(mimeType)
  if (!extension) throw new Error('Unsupported floor plan type')
  if (buffer.length <= 0 || buffer.length > MAX_FLOOR_PLAN_SIZE_BYTES) throw new Error('Invalid floor plan size')
  const base = await root()
  const storageKey = `${randomUUID()}${extension}`
  const dziKey = randomUUID()
  try {
    const image = sharp(buffer, { failOn: 'error' }).rotate()
    const metadata = await image.metadata()
    if (!metadata.width || !metadata.height) throw new Error('Invalid floor plan image')
    await writeFile(originalPath(base, storageKey), buffer, { flag: 'wx' })
    await image.jpeg({ quality: 85 }).tile({ size: 256, overlap: 1, layout: 'dz', container: 'fs' }).toFile(dziOutputBase(base, dziKey))
    return { storageKey, dziKey, width: metadata.width, height: metadata.height }
  } catch (error) {
    await removeFloorPlanFiles({ storageKey, dziKey }).catch(() => undefined)
    if (error instanceof Error && error.message === 'Invalid floor plan image') throw error
    throw new Error('Invalid floor plan image')
  }
}

export async function storeFloorPlan(file: Express.Multer.File): Promise<StoredFloorPlan> {
  return storeFloorPlanBuffer(file.buffer, file.mimetype)
}

export async function readFloorPlanOriginal(storageKey: string): Promise<Buffer> { return readFile(originalPath(await root(), storageKey)) }

export async function readFloorPlanDzi(dziKey: string): Promise<string> { return readFile(dziPath(await root(), dziKey), 'utf8') }

export async function readFloorPlanTile(dziKey: string, level: string, fileName: string): Promise<Buffer> {
  if (!/^\d+$/.test(level) || !TILE.test(fileName) || path.basename(fileName) !== fileName) throw new Error('Invalid floor plan tile')
  const base = await root()
  if (!DZI_KEY.test(dziKey)) throw new Error('Invalid floor plan DZI key')
  return readFile(path.join(base, `${dziKey}_files`, level, fileName))
}

export async function removeFloorPlanFiles(keys: Pick<StoredFloorPlan, 'storageKey' | 'dziKey'>): Promise<void> {
  const base = await root()
  await Promise.all([
    rm(originalPath(base, keys.storageKey), { force: true }),
    rm(dziPath(base, keys.dziKey), { force: true }),
    rm(path.join(base, `${keys.dziKey}_files`), { recursive: true, force: true }),
  ])
}

export async function cleanFloorPlanStorage(): Promise<number> {
  const base = await assertMarker()
  const entries = await readdir(base)
  const keys = entries.filter((entry) => ORIGINAL_KEY.test(entry))
  await Promise.all(keys.map((key) => rm(originalPath(base, key), { force: true })))
  await Promise.all(entries.filter((entry) => DZI_KEY.test(entry.replace(/\.dzi$/, ''))).map((entry) => {
    const key = entry.replace(/\.dzi$/, '')
    return Promise.all([rm(path.join(base, entry), { force: true }), rm(path.join(base, `${key}_files`), { recursive: true, force: true })])
  }))
  return keys.length
}
