import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
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

// Error de prevalidación READ-ONLY: la estructura del almacenamiento haría
// fallar cleanFloorPlanStorage() (p. ej. un directorio con nombre de clave
// gestionada). Se lanza antes de cualquier mutación de BD.
export class FloorPlanPrevalidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FloorPlanPrevalidationError'
  }
}

// Opciones de prevalidación READ-ONLY. `allowProvisionable` distingue las dos
// operaciones destructivas: el reset exige un almacenamiento ya gestionado
// (marcador válido), mientras que el seed admite además un storage inexistente
// o vacío sin marcador, únicamente si la provisión posterior (mkdir +
// marcador) podrá completarse de forma segura.
export interface FloorPlanStoragePrevalidationOptions {
  allowProvisionable: boolean
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
  // El marcador debe ser un archivo NORMAL (P0-REM-01, P1 #4): un
  // symlink/junction —válido o roto— o un directorio no es un marcador de
  // DocuCore y se bloquea antes de confiar en su contenido. Solo la ausencia
  // real (ENOENT) es provisionable; el resto de errores de lstat
  // (EACCES/EPERM/I/O) se propagan (fail-closed).
  try {
    const markerLstat = await lstat(path.join(root, MARKER))
    if (markerLstat.isSymbolicLink() || !markerLstat.isFile()) {
      throw new FloorPlanStorageError('INVALID_MARKER', 'Invalid floor plan storage path: DocuCore marker is not a regular file (symlink/junction or directory)')
    }
  } catch (error) {
    if (error instanceof FloorPlanStorageError) throw error
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    throw new FloorPlanStorageError('MISSING_MARKER', 'Invalid floor plan storage path: missing DocuCore marker')
  }
  let raw: string
  try {
    raw = await readFile(path.join(root, MARKER), 'utf8')
  } catch (error) {
    // Carrera posterior al lstat: solo la ausencia real del marcador (ENOENT)
    // es provisionable. Un fallo de permisos (EACCES/EPERM) o de I/O no puede
    // tratarse como «sin marcador»: se propaga y bloquea (fail-closed).
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    throw new FloorPlanStorageError('MISSING_MARKER', 'Invalid floor plan storage path: missing DocuCore marker')
  }
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

/**
 * Prevalidación READ-ONLY del almacenamiento de planos para operaciones
 * destructivas: verifica el marcador (o, con `allowProvisionable`, que el
 * storage puede provisionarse de forma segura) y que los objetos gestionados
 * que cleanFloorPlanStorage() puede tocar son objetos NORMALES —archivos
 * regulares o directorios, sin symlinks/junctions (válidos o rotos): original
 * (UUID+ext), `*.dzi` o UUID pelado deben ser archivos (un directorio con esos
 * nombres haría fallar su `rm` sin `recursive`), y los directorios `*_files`
 * cuyo compañero `.dzi`/UUID pelado está presente deben ser directorios
 * normales (se eliminan con `rm` recursivo). Los `*_files` huérfanos y
 * cualquier otra entrada no gestionada se ignoran, igual que hará la limpieza.
 * No escribe ni borra nada: se invoca antes de mutar la BD. No garantiza
 * atomicidad BD/filesystem frente a carreras o fallos I/O posteriores al
 * precheck (TOCTOU).
 *
 * - `{ allowProvisionable: false }` (reset): el marcador válido es
 *   obligatorio; un storage inexistente o sin marcador se rechaza.
 * - `{ allowProvisionable: true }` (seed): un storage inexistente o vacío sin
 *   marcador se admite si la provisión posterior (mkdir recursivo + marcador)
 *   podrá completarse de forma segura; un directorio no vacío sin marcador, un
 *   marcador corrupto o de otro propietario, o una entrada gestionada con
 *   estructura incompatible se rechazan igualmente antes de mutar la BD.
 */
export async function prevalidateFloorPlanStorage({ allowProvisionable }: FloorPlanStoragePrevalidationOptions): Promise<string> {
  let base: string
  try {
    base = await assertMarker()
  } catch (error) {
    if (!(error instanceof FloorPlanStorageError) || error.code !== 'MISSING_MARKER') throw error
    if (!allowProvisionable) {
      throw new FloorPlanStorageError('MISSING_MARKER', 'Invalid floor plan storage path: missing DocuCore marker (prevalidación estricta: el reset exige un marcador válido)')
    }
    await prevalidateProvisionableFloorPlanStorage()
    return floorPlanStoragePath()
  }
  const entries = await readdir(base)
  // Presencia de compañeros DZI para decidir si un `*_files` será eliminado
  // por la limpieza: esta solo borra `_files` cuyo `.dzi` (o UUID pelado)
  // está presente en la misma lista; un `*_files` huérfano se ignora, igual
  // que hace cleanFloorPlanStorage() (decisión documentada, P0-REM-01 P1 #4).
  const entrySet = new Set(entries)
  for (const entry of entries) {
    if (entry === MARKER) continue
    const isOriginal = ORIGINAL_KEY.test(entry)
    const isDzi = entry.endsWith('.dzi') && DZI_KEY.test(entry.slice(0, -4))
    const isBareUuid = DZI_KEY.test(entry)
    const filesKey = entry.endsWith('_files') ? entry.slice(0, -'_files'.length) : null
    const isManagedFiles = filesKey !== null && DZI_KEY.test(filesKey)
    if (!isOriginal && !isDzi && !isBareUuid && !isManagedFiles) continue
    if (isManagedFiles && !entrySet.has(`${filesKey}.dzi`) && !entrySet.has(filesKey)) continue
    let entryLstat
    try {
      // lstat no sigue el componente final: un symlink/junction (válido o
      // roto) se reporta como enlace, no como el objeto al que apunta
      // (P0-REM-01, P1 #4). Las entradas no gestionadas se ignoran sin
      // inspección, igual que hará la limpieza.
      entryLstat = await lstat(path.join(base, entry))
    } catch {
      throw new FloorPlanPrevalidationError(`La entrada "${entry}" parece una clave de plano gestionada pero no se puede inspeccionar; la limpieza posterior no está garantizada.`)
    }
    if (entryLstat.isSymbolicLink()) {
      throw new FloorPlanPrevalidationError(`La entrada "${entry}" parece una clave de plano gestionada pero es un symlink/junction; cleanFloorPlanStorage() no podría eliminarla de forma segura.`)
    }
    if (isManagedFiles) {
      if (!entryLstat.isDirectory()) {
        throw new FloorPlanPrevalidationError(`La entrada "${entry}" parece un directorio de teselas gestionado pero no es un directorio; cleanFloorPlanStorage() no podría eliminarlo de forma segura.`)
      }
      continue
    }
    if (!entryLstat.isFile()) {
      throw new FloorPlanPrevalidationError(`La entrada "${entry}" parece una clave de plano gestionada pero no es un archivo; cleanFloorPlanStorage() no podría eliminarla.`)
    }
  }
  return base
}

// Comprobación READ-ONLY de que la provisión del marcador (mkdir recursivo +
// readdir vacío + writeFile) podrá completarse sin conflicto estructural
// previsible: la base no existe y su ancestro existente más cercano es un
// directorio NORMAL (un archivo en el camino haría fallar el `mkdir`
// posterior; un symlink/junction —válido o roto— haría que la provisión
// atravesara un enlace, prohibido por P0-REM-01), o existe y es un directorio
// vacío. Los componentes se inspeccionan con lstat, que NO sigue el componente
// final: un enlace roto se detecta al alcanzar el propio enlace, y en Windows
// los junction/reparse point se reportan como symlink. Un error de lstat
// distinto de ENOENT (EACCES/EPERM/I/O) se propaga: nunca se trata como
// inexistencia. No crea ni escribe nada.
async function prevalidateProvisionableFloorPlanStorage(): Promise<void> {
  const root = assertSafeRoot()
  let current = root
  for (;;) {
    try {
      const currentLstat = await lstat(current)
      if (currentLstat.isSymbolicLink()) {
        throw new FloorPlanStorageError('NOT_EMPTY', 'Invalid floor plan storage path: not provisionable (an existing component of the path is a symlink/junction)')
      }
      if (!currentLstat.isDirectory()) {
        throw new FloorPlanStorageError('NOT_EMPTY', 'Invalid floor plan storage path: not provisionable (an existing ancestor is not a directory)')
      }
      const entries = await readdir(current)
      if (current === root && entries.length > 0) {
        throw new FloorPlanStorageError('NOT_EMPTY', 'Invalid floor plan storage path: directory is not empty (no DocuCore marker)')
      }
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = path.dirname(current)
      if (parent === current) {
        // Ni la base ni ningún ancestro existen hasta la raíz: el mkdir
        // recursivo podrá crear la cadena completa (permisos aparte, no
        // previsibles de forma read-only).
        return
      }
      current = parent
    }
  }
}
