import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkDestructiveGuard } from '../../server/lib/destructiveGuard'
import type { DestructiveGuardInput, DestructiveGuardResult, PathInfoLike } from '../../server/lib/destructiveGuard'

// Workspace sintético: solo cadenas y rutas, nunca se toca el filesystem.
const cwd = path.join(path.parse(process.cwd()).root, 'docucore-ws')
const documentsPath = path.join(cwd, 'test-results', 'e2e-documents')
const floorPlansPath = path.join(cwd, 'test-results', 'e2e-floor-plans')
const isWindows = path.sep === '\\'

// lstat fake por defecto: todos los componentes existen como directorios
// normales (la existencia real la decide el realpath inyectado en cada test).
const fakeDirInfo: PathInfoLike = { isSymbolicLink: () => false, isDirectory: () => true }

function validEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://docucore:docucore@127.0.0.1:5436/docucore?schema=public',
    DOCUCORE_DESTRUCTIVE_TARGET: '127.0.0.1:5436/docucore',
    DOCUMENT_STORAGE_PATH: documentsPath,
    FLOOR_PLAN_STORAGE_PATH: floorPlansPath,
    ...overrides,
  }
}

function guard(env: Record<string, string>, realpath?: (candidate: string) => string, lstat?: (candidate: string) => PathInfoLike): DestructiveGuardResult {
  const input: DestructiveGuardInput = {
    env,
    cwd,
    realpath: realpath ?? ((candidate: string) => candidate),
    lstat: lstat ?? (() => fakeDirInfo),
  }
  return checkDestructiveGuard(input)
}

function message(result: DestructiveGuardResult): string {
  return result.errors.join('\n')
}

describe('guardia destructiva P0-REM-01', () => {
  it('acepta el destino desechable 127.0.0.1:5436/docucore confirmado y aislado', () => {
    const result = guard(validEnv())
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('acepta localhost en la URL con la confirmación canónica', () => {
    const result = guard(validEnv({ DATABASE_URL: 'postgresql://docucore:docucore@localhost:5436/docucore?schema=public' }))
    expect(result.ok).toBe(true)
  })

  // Decisión documentada: NODE_ENV se normaliza con trim().toLowerCase() antes
  // de comparar, así que "TEST" y " test " equivalen a "test" (entorno
  // desechable). La confirmación destructiva, en cambio, se compara literal.
  it('acepta NODE_ENV=test con mayúsculas o espacios (se normaliza con trim().toLowerCase())', () => {
    expect(guard(validEnv({ NODE_ENV: 'TEST' })).ok).toBe(true)
    expect(guard(validEnv({ NODE_ENV: ' test ' })).ok).toBe(true)
  })

  it('rechaza el puerto 5435 aunque la confirmación coincida', () => {
    const result = guard(
      validEnv({
        DATABASE_URL: 'postgresql://docucore:docucore@127.0.0.1:5435/docucore?schema=public',
        DOCUCORE_DESTRUCTIVE_TARGET: '127.0.0.1:5435/docucore',
      }),
    )
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('5435')
    expect(message(result)).toContain('terminantemente prohibido')
  })

  it('rechaza un host remoto', () => {
    const result = guard(validEnv({ DATABASE_URL: 'postgresql://docucore:docucore@db.example.com:5436/docucore?schema=public' }))
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('no es local')
  })

  it('rechaza NODE_ENV=production', () => {
    const result = guard(validEnv({ NODE_ENV: 'production' }))
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('NODE_ENV')
    expect(message(result)).toContain('solo se admiten con NODE_ENV=test')
  })

  it('rechaza NODE_ENV=production con mayúsculas mixtas y espacios', () => {
    const result = guard(validEnv({ NODE_ENV: ' PrOdUcTiOn ' }))
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('NODE_ENV')
    expect(message(result)).toContain('solo se admiten con NODE_ENV=test')
  })

  it('rechaza NODE_ENV=development, staging y prod', () => {
    for (const value of ['development', 'staging', 'prod']) {
      const result = guard(validEnv({ NODE_ENV: value }))
      expect(result.ok).toBe(false)
      expect(message(result)).toContain('solo se admiten con NODE_ENV=test')
    }
  })

  it('rechaza NODE_ENV ausente (denegar por defecto)', () => {
    const env = validEnv()
    delete env.NODE_ENV
    const result = guard(env)
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('NODE_ENV no está definida')
  })

  it('rechaza DATABASE_URL ausente o inválida', () => {
    const missing = validEnv()
    delete missing.DATABASE_URL
    const missingResult = guard(missing)
    expect(missingResult.ok).toBe(false)
    expect(message(missingResult)).toContain('DATABASE_URL no está definida')

    const invalidResult = guard(validEnv({ DATABASE_URL: 'esto-no-es-una-url' }))
    expect(invalidResult.ok).toBe(false)
    expect(message(invalidResult)).toContain('no es una URL PostgreSQL válida')
  })

  it('rechaza un puerto distinto de 5436', () => {
    const result = guard(validEnv({ DATABASE_URL: 'postgresql://docucore:docucore@127.0.0.1:5437/docucore?schema=public' }))
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('solo admiten el puerto 5436')
  })

  it('rechaza una base distinta de "docucore" aunque la confirmación reproduzca el destino', () => {
    const result = guard(
      validEnv({
        DATABASE_URL: 'postgresql://docucore:docucore@127.0.0.1:5436/otra-base?schema=public',
        DOCUCORE_DESTRUCTIVE_TARGET: '127.0.0.1:5436/otra-base',
      }),
    )
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('la base de datos')
    expect(message(result)).toContain('docucore')
  })

  it('rechaza una base distinta de "docucore" aunque la confirmación sea la canónica', () => {
    const result = guard(validEnv({ DATABASE_URL: 'postgresql://docucore:docucore@127.0.0.1:5436/otra-base?schema=public' }))
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('la base de datos')
  })

  it('rechaza un schema distinto de "public" en la URL', () => {
    const result = guard(validEnv({ DATABASE_URL: 'postgresql://docucore:docucore@127.0.0.1:5436/docucore?schema=otra' }))
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('schema')
    expect(message(result)).toContain('"public"')
  })

  it('rechaza un parámetro "schema" duplicado aunque todos los valores sean "public"', () => {
    const result = guard(validEnv({ DATABASE_URL: 'postgresql://docucore:docucore@127.0.0.1:5436/docucore?schema=public&schema=public' }))
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('duplicado')
  })

  it('rechaza un "schema" conflictivo (duplicado con valores distintos)', () => {
    const result = guard(validEnv({ DATABASE_URL: 'postgresql://docucore:docucore@127.0.0.1:5436/docucore?schema=public&schema=otra' }))
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('duplicado')
  })

  it('rechaza "options" con "search_path" aunque el schema sea "public"', () => {
    const result = guard(validEnv({ DATABASE_URL: 'postgresql://docucore:docucore@127.0.0.1:5436/docucore?schema=public&options=-csearch_path%3Dotra' }))
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('search_path')
  })

  it('rechaza "currentSchema" en la URL (también selecciona schema)', () => {
    const result = guard(validEnv({ DATABASE_URL: 'postgresql://docucore:docucore@127.0.0.1:5436/docucore?schema=public&currentSchema=otra' }))
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('currentSchema')
  })

  it('acepta una URL sin parámetro "schema" (el valor por defecto de PostgreSQL es "public")', () => {
    const result = guard(validEnv({ DATABASE_URL: 'postgresql://docucore:docucore@127.0.0.1:5436/docucore' }))
    expect(result.ok).toBe(true)
  })

  it('rechaza la confirmación ausente', () => {
    const env = validEnv()
    delete env.DOCUCORE_DESTRUCTIVE_TARGET
    const result = guard(env)
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('DOCUCORE_DESTRUCTIVE_TARGET no está definida')
  })

  it('rechaza la confirmación distinta del valor canónico', () => {
    const result = guard(validEnv({ DOCUCORE_DESTRUCTIVE_TARGET: '127.0.0.1:5436/otra-base' }))
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('exactamente "127.0.0.1:5436/docucore"')
  })

  it('rechaza la confirmación canónica con espacios (comparación exacta, sin normalizar)', () => {
    const result = guard(validEnv({ DOCUCORE_DESTRUCTIVE_TARGET: ' 127.0.0.1:5436/docucore ' }))
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('exactamente "127.0.0.1:5436/docucore"')
  })

  it('rechaza storages ausentes', () => {
    const env = validEnv()
    delete env.DOCUMENT_STORAGE_PATH
    delete env.FLOOR_PLAN_STORAGE_PATH
    const result = guard(env)
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('DOCUMENT_STORAGE_PATH no está definida')
    expect(message(result)).toContain('FLOOR_PLAN_STORAGE_PATH no está definida')
  })

  it('rechaza un storage fuera de test-results', () => {
    const result = guard(validEnv({ DOCUMENT_STORAGE_PATH: path.join(cwd, 'data', 'documents') }))
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('no queda dentro de')
  })

  it('rechaza un storage en la propia raíz test-results (debe quedar dentro)', () => {
    const result = guard(validEnv({ DOCUMENT_STORAGE_PATH: path.join(cwd, 'test-results') }))
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('no queda dentro de')
  })

  it('rechaza un directorio test-results-evil (hermano de test-results)', () => {
    const result = guard(validEnv({ DOCUMENT_STORAGE_PATH: path.join(cwd, 'test-results-evil', 'e2e-documents') }))
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('no queda dentro de')
  })

  it('rechaza un escape con ".." fuera de test-results', () => {
    const result = guard(validEnv({ DOCUMENT_STORAGE_PATH: path.join(cwd, 'test-results', '..', 'data', 'documents') }))
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('no queda dentro de')
  })

  it('rechaza un enlace simbólico que escapa de test-results', () => {
    const linkPath = path.join(cwd, 'test-results', 'link-documents')
    const outsidePath = path.join(cwd, 'outside-documents')
    const result = guard(
      validEnv({ DOCUMENT_STORAGE_PATH: linkPath }),
      (candidate: string) => (candidate === linkPath ? outsidePath : candidate),
    )
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('enlace simbólico')
  })

  it('rechaza una raíz test-results que sea symlink/junction hacia fuera del workspace', () => {
    const rootLexical = path.join(cwd, 'test-results')
    const outsideRoot = path.join(cwd, '..', 'outside-root')
    const result = guard(
      validEnv(),
      (candidate: string) => (candidate === rootLexical ? outsideRoot : candidate),
    )
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('raíz')
    expect(message(result)).toContain('symlink/junction')
  })

  it('rechaza realpath que falla para todos los ancestros (fail-closed, nunca lexical)', () => {
    const result = guard(validEnv(), () => {
      throw new Error('realpath no disponible')
    })
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('no se pudo resolver la ruta real del workspace')
  })

  it('permite directorios aún inexistentes bajo un ancestro válido', () => {
    const pendingStorage = path.join(cwd, 'test-results', 'e2e-documents', 'nueva-carpeta')
    const realpath = (candidate: string): string => {
      if (candidate === cwd) return cwd
      // Los componentes inexistentes se reportan como realpath ENOENT real.
      throw Object.assign(new Error('ENOENT: no existe'), { code: 'ENOENT' })
    }
    const result = guard(validEnv({ DOCUMENT_STORAGE_PATH: pendingStorage }), realpath)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it.skipIf(!isWindows)('Windows: una raíz test-results real con distinta capitalización se acepta (case-insensitive)', () => {
    const differentlyCasedRoot = path.join(cwd, 'TEST-RESULTS')
    const result = guard(
      validEnv(),
      (candidate: string) => (candidate === path.join(cwd, 'test-results') ? differentlyCasedRoot : candidate),
    )
    expect(result.ok).toBe(true)
  })

  it('rechaza un symlink válido como componente del storage aunque apunte dentro del workspace', () => {
    const linkPath = path.join(cwd, 'test-results', 'link-documents')
    const insideTarget = path.join(cwd, 'test-results', 'real-documents')
    // El realpath resolvería DENTRO del storage (comprobaciones realpath en
    // verde); solo el barrido lstat puede detectar el enlace.
    const realpath = (candidate: string): string => (candidate === linkPath ? insideTarget : candidate)
    const lstat = (candidate: string): PathInfoLike => {
      if (candidate === linkPath) return { isSymbolicLink: () => true, isDirectory: () => false }
      return fakeDirInfo
    }
    const result = guard(validEnv({ DOCUMENT_STORAGE_PATH: linkPath }), realpath, lstat)
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('symlink/junction')
  })

  it('rechaza un symlink/junction intermedio aunque su destino real quede dentro del storage', () => {
    const junction = path.join(cwd, 'test-results', 'junction-dir')
    const junctionTarget = path.join(cwd, 'test-results', 'real-dir')
    const storagePath = path.join(junction, 'e2e-documents')
    // El realpath seguiría el junction hacia un destino dentro de test-results:
    // las comprobaciones realpath pasarían; solo el barrido lstat bloquea.
    const realpath = (candidate: string): string =>
      candidate === junction || candidate.startsWith(`${junction}${path.sep}`) ? candidate.replace(junction, junctionTarget) : candidate
    const lstat = (candidate: string): PathInfoLike => {
      if (candidate === junction) return { isSymbolicLink: () => true, isDirectory: () => false }
      return fakeDirInfo
    }
    const result = guard(validEnv({ DOCUMENT_STORAGE_PATH: storagePath }), realpath, lstat)
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('symlink/junction')
  })

  it('rechaza un symlink/junction roto como componente del storage', () => {
    const brokenLink = path.join(cwd, 'test-results', 'enlace-roto')
    const storageUnderLink = path.join(brokenLink, 'e2e-documents')
    // El realpath del enlace roto y de todo lo que cuelga de él falla con
    // ENOENT (como en el filesystem real); lstat del propio enlace lo reporta
    // como symlink al alcanzarlo en el ascenso.
    const realpath = (candidate: string): string => {
      if (candidate === brokenLink || candidate.startsWith(`${brokenLink}${path.sep}`)) {
        throw Object.assign(new Error('ENOENT: no existe'), { code: 'ENOENT' })
      }
      return candidate
    }
    const lstat = (candidate: string): PathInfoLike => {
      if (candidate === storageUnderLink) throw Object.assign(new Error('ENOENT: no existe'), { code: 'ENOENT' })
      if (candidate === brokenLink) return { isSymbolicLink: () => true, isDirectory: () => false }
      return fakeDirInfo
    }
    const result = guard(validEnv({ DOCUMENT_STORAGE_PATH: storageUnderLink }), realpath, lstat)
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('symlink/junction')
  })

  it('rechaza un error de lstat distinto de ENOENT en el camino (EACCES/EPERM, fail-closed)', () => {
    for (const code of ['EACCES', 'EPERM']) {
      const storagePath = path.join(cwd, 'test-results', 'e2e-documents')
      const lstat = (candidate: string): PathInfoLike => {
        if (candidate === storagePath) throw Object.assign(new Error(`${code}: operación no permitida`), { code })
        return fakeDirInfo
      }
      const result = guard(validEnv(), undefined, lstat)
      expect(result.ok).toBe(false)
      expect(message(result)).toContain('fail-closed')
    }
  })

  it('rechaza un error de realpath distinto de ENOENT (EACCES, fail-closed, sin reconstrucción lexical)', () => {
    const storagePath = path.join(cwd, 'test-results', 'e2e-documents')
    const realpath = (candidate: string): string => {
      if (candidate === storagePath) throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
      return candidate
    }
    const result = guard(validEnv(), realpath)
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('no se pudo resolver la ruta real')
  })

  it('rechaza un archivo como componente existente del camino del storage', () => {
    const fileComponent = path.join(cwd, 'test-results', 'archivo')
    const storagePath = path.join(fileComponent, 'e2e-documents')
    const lstat = (candidate: string): PathInfoLike => {
      if (candidate === fileComponent) return { isSymbolicLink: () => false, isDirectory: () => false }
      return fakeDirInfo
    }
    const result = guard(validEnv({ DOCUMENT_STORAGE_PATH: storagePath }), undefined, lstat)
    expect(result.ok).toBe(false)
    expect(message(result)).toContain('no es un directorio')
  })

  it('nunca expone la contraseña ni la DATABASE_URL completa en los errores', () => {
    const result = guard(
      validEnv({ DATABASE_URL: 'postgresql://docucore:SUPERSECRET@db.example.com:5436/docucore?schema=public' }),
    )
    expect(result.ok).toBe(false)
    expect(message(result)).not.toContain('SUPERSECRET')
    expect(message(result)).not.toContain('postgresql://')
  })
})
