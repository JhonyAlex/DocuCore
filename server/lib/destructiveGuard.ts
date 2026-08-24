import { lstatSync, realpathSync } from 'node:fs'
import path from 'node:path'

/**
 * Guardia dura P0-REM-01 para operaciones destructivas de BD/storage
 * (server/seed.ts y server/reset-manual-test.ts).
 *
 * Deniega por defecto: solo autoriza el entorno desechable de pruebas con el
 * contrato canónico exacto:
 *  - NODE_ENV normalizada (trim().toLowerCase()) exactamente "test";
 *  - DATABASE_URL local (127.0.0.1 o localhost), puerto exactamente 5436,
 *    base exactamente "docucore" y schema efectivo "public" (parámetro
 *    "schema" exactamente "public" o ausente —el valor por defecto de
 *    PostgreSQL—; se bloquean schemas distintos, parámetros "schema"
 *    duplicados, "currentSchema" y "options" con "search_path", que podrían
 *    seleccionar otro schema);
 *  - DOCUCORE_DESTRUCTIVE_TARGET exactamente "127.0.0.1:5436/docucore" (valor
 *    canónico fijo, nunca derivado de la URL: una base distinta de "docucore"
 *    queda bloqueada aunque la confirmación reproduzca el destino de la URL);
 *  - DOCUMENT_STORAGE_PATH y FLOOR_PLAN_STORAGE_PATH explícitas y realmente
 *    dentro de <workspace>\test-results\ (comprobación lexical y de ruta
 *    real): la raíz efectiva de test-results debe corresponder a la ruta real
 *    del workspace, de modo que un test-results entero que sea symlink/junction
 *    hacia fuera queda bloqueado, igual que cualquier subdirectorio gestionado
 *    que escape por enlace; si realpath no puede resolver de forma fiable, se
 *    bloquea (fail-closed) — nunca se cae silenciosamente a una comprobación
 *    lexical considerada segura.
 *
 * El puerto 5435 (BD persistente de pruebas manuales) se rechaza de forma
 * absoluta, incluso con confirmación presente. Los errores indican qué
 * condición falta pero nunca imprimen contraseñas ni la DATABASE_URL completa.
 *
 * Fail-closed de rutas (P0-REM-01, corrección P1 #3): los storages destructivos
 * no atraviesan enlaces. Además de resolver las rutas con realpath, la guardia
 * inspecciona los componentes EXISTENTES del camino con lstat (que no sigue el
 * componente final): cualquier symlink/junction —válido o roto, incluso
 * apuntando dentro del workspace— bloquea la operación, y un error de
 * lstat/realpath distinto de ENOENT (EACCES/EPERM/I/O) también (fail-closed).
 * En Windows los junction/reparse point se reportan como symlink en lstat, así
 * que la misma comprobación cubre ambos. Solo el ENOENT de un componente
 * realmente inexistente se tolera, y únicamente para anexar los segmentos
 * pendientes tras resolver el ancestro real.
 *
 * Módulo puro y comprobable: recibe el entorno, el workspace y un resolutor
 * de rutas reales (realpath inyectable en los tests, sin tocar el filesystem).
 */

export const ALLOWED_DB_HOSTS = ['127.0.0.1', 'localhost']
export const ALLOWED_DB_PORT = '5436'
export const ALLOWED_DB_DATABASE = 'docucore'
export const ALLOWED_DB_SCHEMA = 'public'
export const FORBIDDEN_DB_PORT = '5435'
export const DESTRUCTIVE_TARGET_VAR = 'DOCUCORE_DESTRUCTIVE_TARGET'
export const CANONICAL_DESTRUCTIVE_TARGET = '127.0.0.1:5436/docucore'
export const TEST_RESULTS_DIR = 'test-results'
export const STORAGE_PATH_VARS = ['DOCUMENT_STORAGE_PATH', 'FLOOR_PLAN_STORAGE_PATH'] as const

export interface ParsedDbTarget {
  host: string
  port: string
  database: string
  /** Valores del parámetro "schema" (vacío si no se especifica; >1 = duplicado). */
  schemas: string[]
  /** Parámetro "options" si existe (puede transportar search_path). */
  options: string | null
  /** Parámetro "currentSchema" si existe (Prisma lo usa para elegir schema). */
  currentSchema: string | null
}

/** Resultado mínimo de lstat para la guardia (Stats real o fake de test). */
export interface PathInfoLike {
  isSymbolicLink(): boolean
  isDirectory(): boolean
}

export interface DestructiveGuardInput {
  env: Record<string, string | undefined>
  cwd: string
  /** Resolución de la ruta real; en los tests se inyecta un fake sin filesystem. */
  realpath?: (candidate: string) => string
  /** Inspección sin seguir enlaces (lstat); en los tests se inyecta un fake. */
  lstat?: (candidate: string) => PathInfoLike
}

export interface DestructiveGuardResult {
  ok: boolean
  errors: string[]
}

export function parseDatabaseUrl(raw: string | undefined): ParsedDbTarget | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') return null
    const host = url.hostname
    const port = url.port
    const database = url.pathname.replace(/^\/+/, '')
    if (!host || !port || !database) return null
    return {
      host,
      port,
      database,
      schemas: url.searchParams.getAll('schema'),
      options: url.searchParams.get('options'),
      currentSchema: url.searchParams.get('currentSchema'),
    }
  } catch {
    return null
  }
}

export function testResultsRoot(cwd: string): string {
  return path.resolve(cwd, TEST_RESULTS_DIR)
}

const isWindows = path.sep === '\\'

function pathKey(candidate: string): string {
  return isWindows ? candidate.toLowerCase() : candidate
}

function isWithin(root: string, candidate: string): boolean {
  const keyRoot = pathKey(root)
  const keyCandidate = pathKey(candidate)
  return keyCandidate === keyRoot || keyCandidate.startsWith(`${keyRoot}${path.sep}`)
}

// Intento de realpath con contrato fail-closed: solo el ENOENT (componente
// realmente inexistente) se tolera y permite ascender; EACCES/EPERM o cualquier
// otro error —incluso sin código— bloquean (no se reconstruye lexicalmente
// sobre un ancestro que no se pudo verificar).
function tryResolveReal(candidate: string, realpath: (p: string) => string): { ok: boolean; path?: string; blocked?: boolean } {
  try {
    return { ok: true, path: realpath(candidate) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ok: false }
    return { ok: false, blocked: true }
  }
}

// Ruta real de un directorio que puede no existir aún: resuelve el ancestro
// existente más cercano y anexa los segmentos pendientes únicamente después de
// haber validado el ancestro real (los segmentos inexistentes no pueden
// contener enlaces porque no existen). Devuelve null si ningún ancestro es
// resoluble o si realpath falla con un error distinto de ENOENT: el llamador
// debe BLOQUEAR (fail-closed), nunca caer a una comprobación lexical
// considerada segura.
function resolveRealPathOrNull(candidate: string, realpath: (p: string) => string): string | null {
  const direct = tryResolveReal(candidate, realpath)
  if (direct.ok) return direct.path ?? null
  if (direct.blocked) return null
  const pending: string[] = []
  let current = candidate
  for (;;) {
    const parent = path.dirname(current)
    if (parent === current) return null
    pending.unshift(path.basename(current))
    current = parent
    const next = tryResolveReal(current, realpath)
    if (next.ok) return path.join(next.path as string, ...pending)
    if (next.blocked) return null
  }
}

// Inspecciona los componentes EXISTENTES del camino de un storage (desde el
// candidato hasta `stopAt`, inclusive) con lstat, que NO sigue el componente
// final: cualquier symlink/junction —válido o roto, incluso apuntando dentro
// del workspace; en Windows los junction/reparse point se reportan como
// symlink— bloquea la ruta. Un componente existente que no sea un directorio
// (p. ej. un archivo) también bloquea, y un error de lstat distinto de ENOENT
// (EACCES/EPERM/I/O) se propaga como bloqueo (fail-closed): solo el ENOENT de
// un componente realmente inexistente se tolera y permite ascender. Devuelve
// null si no hay enlaces, no-directorios ni errores.
function findLinkInExistingComponents(candidate: string, stopAt: string, lstat: (p: string) => PathInfoLike): string | null {
  let current = candidate
  for (;;) {
    try {
      const info = lstat(current)
      if (info.isSymbolicLink()) {
        return `un componente existente del camino es un symlink/junction ("${current}"); los storages destructivos no atraviesan enlaces, ni siquiera rotos o que apunten dentro del workspace`
      }
      if (!info.isDirectory()) {
        return `un componente existente del camino no es un directorio ("${current}")`
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        return `no se pudo inspeccionar un componente del camino ("${current}"); error de permisos/I/O, operación bloqueada (fail-closed)`
      }
    }
    if (current === stopAt) return null
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

export function checkDestructiveGuard(input: DestructiveGuardInput): DestructiveGuardResult {
  const { env, cwd } = input
  const realpath = input.realpath ?? realpathSync
  const lstat: (candidate: string) => PathInfoLike = input.lstat ?? ((candidate: string) => lstatSync(candidate))
  const errors: string[] = []

  // 1. Entorno desechable explícito: NODE_ENV se normaliza (trim + minúsculas)
  //    y debe ser exactamente "test". La ausencia también deniega.
  const nodeEnv = (env.NODE_ENV ?? '').trim().toLowerCase()
  if (!nodeEnv) {
    errors.push('NODE_ENV no está definida; seed/reset exigen NODE_ENV=test (entorno desechable).')
  } else if (nodeEnv !== 'test') {
    errors.push(`NODE_ENV="${nodeEnv}": seed/reset solo se admiten con NODE_ENV=test (entorno desechable).`)
  }

  // 2. DATABASE_URL presente, válida, local y exactamente 127.0.0.1:5436/docucore
  //    con schema efectivo "public". La confirmación canónica no incluye el
  //    schema, así que la URL se valida por sí sola: un schema distinto, un
  //    "schema" duplicado, "currentSchema" u "options" con "search_path"
  //    quedarían bloqueados aunque la confirmación coincida.
  const target = parseDatabaseUrl(env.DATABASE_URL)
  if (!target) {
    errors.push('DATABASE_URL no está definida o no es una URL PostgreSQL válida.')
  } else {
    if (!ALLOWED_DB_HOSTS.includes(target.host.toLowerCase())) {
      errors.push(`DATABASE_URL: el host "${target.host}" no es local; solo se admiten 127.0.0.1 y localhost.`)
    }
    if (target.port === FORBIDDEN_DB_PORT) {
      errors.push(
        `DATABASE_URL: el puerto 5435 (BD persistente de pruebas manuales) está terminantemente prohibido para seed/reset, incluso con ${DESTRUCTIVE_TARGET_VAR} presente.`,
      )
    } else if (target.port !== ALLOWED_DB_PORT) {
      errors.push(`DATABASE_URL: el puerto "${target.port}" no está permitido; seed/reset solo admiten el puerto ${ALLOWED_DB_PORT}.`)
    }
    if (target.database !== ALLOWED_DB_DATABASE) {
      errors.push(`DATABASE_URL: la base de datos "${target.database}" no está permitida; seed/reset solo admiten la base "${ALLOWED_DB_DATABASE}".`)
    }
    if (target.schemas.length > 1) {
      errors.push('DATABASE_URL: el parámetro "schema" está duplicado; seed/reset exigen exactamente "schema=public".')
    } else if (target.schemas.length === 1 && target.schemas[0] !== ALLOWED_DB_SCHEMA) {
      errors.push(`DATABASE_URL: el schema "${target.schemas[0]}" no está permitido; seed/reset exigen el schema "${ALLOWED_DB_SCHEMA}".`)
    }
    if (target.options !== null && /search_path/i.test(target.options)) {
      errors.push('DATABASE_URL: el parámetro "options" con "search_path" puede seleccionar otro schema; no está permitido.')
    }
    if (target.currentSchema !== null) {
      errors.push('DATABASE_URL: el parámetro "currentSchema" selecciona otro schema; no está permitido.')
    }
  }

  // 3. Confirmación destructiva: debe ser exactamente el valor canónico fijo,
  //    nunca derivado de DATABASE_URL (una base distinta de "docucore" queda
  //    bloqueada aunque la confirmación reproduzca el destino de la URL).
  const providedTarget = env[DESTRUCTIVE_TARGET_VAR]
  if (!providedTarget) {
    errors.push(`${DESTRUCTIVE_TARGET_VAR} no está definida; seed/reset exigen confirmación explícita del destino.`)
  } else if (providedTarget !== CANONICAL_DESTRUCTIVE_TARGET) {
    errors.push(`${DESTRUCTIVE_TARGET_VAR} debe ser exactamente "${CANONICAL_DESTRUCTIVE_TARGET}".`)
  }

  // 4. Storages explícitos, realmente dentro de <workspace>\test-results\,
  //    sin escapes ".." ni enlaces simbólicos. La raíz efectiva de
  //    test-results debe corresponder a la ruta real del workspace: un
  //    test-results entero que sea symlink/junction hacia fuera se bloquea
  //    igual que cualquier subdirectorio gestionado que escape por enlace.
  //    Además, se inspeccionan los componentes EXISTENTES del camino con lstat
  //    (P1 #3): cualquier symlink/junction —válido o roto, incluso apuntando
  //    dentro del workspace— bloquea, y un error de lstat distinto de ENOENT
  //    (EACCES/EPERM/I/O) también (fail-closed). Si realpath no puede resolver
  //    un componente de forma fiable, se bloquea (fail-closed).
  const rootLexical = testResultsRoot(cwd)
  const realWorkspace = resolveRealPathOrNull(cwd, realpath)
  for (const varName of STORAGE_PATH_VARS) {
    const raw = env[varName]
    if (!raw) {
      errors.push(`${varName} no está definida; seed/reset exigen rutas explícitas bajo <workspace>${path.sep}${TEST_RESULTS_DIR}.`)
      continue
    }
    const resolved = path.resolve(cwd, raw)
    if (!isWithin(rootLexical, resolved) || pathKey(resolved) === pathKey(rootLexical)) {
      errors.push(`${varName}: la ruta no queda dentro de <workspace>${path.sep}${TEST_RESULTS_DIR} (sin escapes "..").`)
      continue
    }
    const linkError = findLinkInExistingComponents(resolved, cwd, lstat)
    if (linkError) {
      errors.push(`${varName}: ${linkError}.`)
      continue
    }
    if (!realWorkspace) {
      errors.push(`${varName}: no se pudo resolver la ruta real del workspace; operación bloqueada (fail-closed).`)
      continue
    }
    const realRoot = resolveRealPathOrNull(rootLexical, realpath)
    if (!realRoot || pathKey(realRoot) !== pathKey(path.join(realWorkspace, TEST_RESULTS_DIR))) {
      errors.push(`${varName}: la raíz <workspace>${path.sep}${TEST_RESULTS_DIR} no corresponde a la ruta real esperada (posible symlink/junction que escapa del workspace).`)
      continue
    }
    const realTarget = resolveRealPathOrNull(resolved, realpath)
    if (!realTarget) {
      errors.push(`${varName}: no se pudo resolver la ruta real del storage; operación bloqueada (fail-closed).`)
      continue
    }
    if (!isWithin(realRoot, realTarget)) {
      errors.push(`${varName}: la ruta real resuelve fuera de <workspace>${path.sep}${TEST_RESULTS_DIR} (posible enlace simbólico).`)
    }
  }

  return { ok: errors.length === 0, errors }
}
