import { mkdtemp, readdir, writeFile, mkdir, rm, stat, readFile, lstat } from 'node:fs/promises'
import type { PathLike, Stats } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FloorPlanPrevalidationError, FloorPlanStorageError, prevalidateFloorPlanStorage } from '../../server/lib/floorPlanStorage'

// Envuelve readFile y lstat para poder simular fallos de lectura del marcador
// y de inspección de componentes sin alterar el resto de fs del módulo.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, readFile: vi.fn(actual.readFile), lstat: vi.fn(actual.lstat) }
})

// El marcador canónico del storage de planos (owner interno del módulo, no
// exportado): el test lo escribe para construir un almacenamiento válido.
const MARKER = '.docucore-storage.json'
const OWNER = 'docucore-floor-plan-storage'
// Claves gestionadas con UUID v4/variant válidos para los patrones del módulo.
const ORIGINAL_NAME = 'f81f42c8-0000-4000-8000-000000000000.png'
const DZI_NAME = 'f81f42c8-0000-4000-8000-000000000001.dzi'
const DZI_FILES_DIR = 'f81f42c8-0000-4000-8000-000000000001_files'
const BARE_UUID_NAME = 'f81f42c8-0000-4000-8000-000000000002'
// Shapes de lstat para simular enlaces/objetos sin tocar el filesystem real.
const fileInfo = { isSymbolicLink: () => false, isFile: () => true, isDirectory: () => false } as unknown as Stats
const symlinkInfo = { isSymbolicLink: () => true, isFile: () => false, isDirectory: () => false } as unknown as Stats
const dirInfo = { isSymbolicLink: () => false, isFile: () => false, isDirectory: () => true } as unknown as Stats

const original = process.env.FLOOR_PLAN_STORAGE_PATH

async function useTempFloorStorage(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'docucore-floor-storage-'))
  process.env.FLOOR_PLAN_STORAGE_PATH = dir
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, MARKER), JSON.stringify({ owner: OWNER, createdAt: new Date().toISOString() }), 'utf8')
  return dir
}

// Directorio existente y vacío SIN marcador (casos de provisionabilidad).
async function useEmptyFloorStorage(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'docucore-floor-storage-'))
  process.env.FLOOR_PLAN_STORAGE_PATH = dir
  return dir
}

afterEach(() => {
  if (original === undefined) delete process.env.FLOOR_PLAN_STORAGE_PATH
  else process.env.FLOOR_PLAN_STORAGE_PATH = original
})

describe('floorPlanStorage prevalidation', () => {
  it('prevalida un almacenamiento válido sin borrar nada (READ-ONLY)', async () => {
    const dir = await useTempFloorStorage()
    await writeFile(path.join(dir, ORIGINAL_NAME), 'original', 'utf8')
    await writeFile(path.join(dir, DZI_NAME), 'dzi', 'utf8')
    await mkdir(path.join(dir, DZI_FILES_DIR), { recursive: true })

    await expect(prevalidateFloorPlanStorage({ allowProvisionable: false })).resolves.toBe(dir)
    // La prevalidación no eliminó ninguna entrada gestionada.
    expect(await readdir(dir)).toEqual(expect.arrayContaining([ORIGINAL_NAME, DZI_NAME, DZI_FILES_DIR]))
  })

  it('prevalida e ignora entradas no gestionadas, igual que la limpieza', async () => {
    const dir = await useTempFloorStorage()
    await writeFile(path.join(dir, ORIGINAL_NAME), 'original', 'utf8')
    await writeFile(path.join(dir, 'nota.txt'), 'ajena', 'utf8')
    await mkdir(path.join(dir, 'carpeta-ajena'), { recursive: true })

    await expect(prevalidateFloorPlanStorage({ allowProvisionable: false })).resolves.toBe(dir)
    expect(await readdir(dir)).toEqual(expect.arrayContaining(['nota.txt', 'carpeta-ajena']))
    await rm(path.join(dir, 'carpeta-ajena'), { recursive: true, force: true })
  })

  it('rechaza en prevalidación un directorio con nombre de clave original gestionada', async () => {
    const dir = await useTempFloorStorage()
    const managedEntry = path.join(dir, ORIGINAL_NAME)
    await mkdir(managedEntry, { recursive: true })
    await writeFile(path.join(managedEntry, 'contenido-interno.txt'), 'no vacío', 'utf8')

    await expect(prevalidateFloorPlanStorage({ allowProvisionable: false })).rejects.toBeInstanceOf(FloorPlanPrevalidationError)
    expect(await readdir(managedEntry)).toEqual(['contenido-interno.txt'])
    await rm(managedEntry, { recursive: true, force: true })
  })

  it('rechaza en prevalidación un directorio con nombre de clave .dzi gestionada', async () => {
    const dir = await useTempFloorStorage()
    const managedEntry = path.join(dir, DZI_NAME)
    await mkdir(managedEntry, { recursive: true })

    await expect(prevalidateFloorPlanStorage({ allowProvisionable: false })).rejects.toBeInstanceOf(FloorPlanPrevalidationError)
    expect(await readdir(dir)).toContain(DZI_NAME)
    await rm(managedEntry, { recursive: true, force: true })
  })

  it('rechaza en prevalidación un directorio con UUID pelado (lo borraría la limpieza)', async () => {
    const dir = await useTempFloorStorage()
    const managedEntry = path.join(dir, BARE_UUID_NAME)
    await mkdir(managedEntry, { recursive: true })

    await expect(prevalidateFloorPlanStorage({ allowProvisionable: false })).rejects.toBeInstanceOf(FloorPlanPrevalidationError)
    expect(await readdir(dir)).toContain(BARE_UUID_NAME)
    await rm(managedEntry, { recursive: true, force: true })
  })

  it('rechaza en prevalidación un marcador corrupto sin repararlo ni borrar nada', async () => {
    const dir = await useTempFloorStorage()
    await writeFile(path.join(dir, MARKER), '{no es json', 'utf8')
    await writeFile(path.join(dir, ORIGINAL_NAME), 'original', 'utf8')

    await expect(prevalidateFloorPlanStorage({ allowProvisionable: false })).rejects.toMatchObject({ code: 'INVALID_MARKER' })
    // El marcador sigue corrupto (no se reprovisionó) y el original sigue ahí.
    expect(await readdir(dir)).toEqual(expect.arrayContaining([ORIGINAL_NAME]))
    await expect(prevalidateFloorPlanStorage({ allowProvisionable: false })).rejects.toMatchObject({ code: 'INVALID_MARKER' })
  })

  it('admite un storage inexistente con allowProvisionable (seed) sin crear nada (READ-ONLY)', async () => {
    const dir = await useTempFloorStorage()
    await rm(dir, { recursive: true, force: true })
    const base = await prevalidateFloorPlanStorage({ allowProvisionable: true })
    expect(base).toBe(dir)
    // READ-ONLY: la ruta sigue sin existir; la prevalidación no creó nada.
    await expect(stat(dir)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('admite un directorio vacío sin marcador con allowProvisionable (seed)', async () => {
    const dir = await useEmptyFloorStorage()
    await expect(prevalidateFloorPlanStorage({ allowProvisionable: true })).resolves.toBe(dir)
    // READ-ONLY: el marcador no se provisionó durante la prevalidación.
    expect(await readdir(dir)).toEqual([])
  })

  it('rechaza un directorio no vacío sin marcador incluso con allowProvisionable (seed)', async () => {
    const dir = await useEmptyFloorStorage()
    await writeFile(path.join(dir, 'legado.txt'), 'contenido previo', 'utf8')

    await expect(prevalidateFloorPlanStorage({ allowProvisionable: true })).rejects.toMatchObject({ code: 'NOT_EMPTY' })
    // Nada se tocó: el fichero sigue y no se creó ningún marcador.
    expect(await readdir(dir)).toEqual(['legado.txt'])
  })

  it('rechaza un storage inexistente no provisionable con allowProvisionable (ancestro archivo)', async () => {
    const dir = await useTempFloorStorage()
    const blocker = path.join(dir, 'bloqueo')
    await writeFile(blocker, 'soy un archivo, no un directorio', 'utf8')
    process.env.FLOOR_PLAN_STORAGE_PATH = path.join(blocker, 'storage-inexistente')

    // El mkdir recursivo posterior fallaría tras el TRUNCATE; la prevalidación
    // lo detecta sin escribir nada. Linux puede devolver ENOTDIR al inspeccionar
    // el marcador antes de que el ascenso normalice el caso como NOT_EMPTY.
    const error = await prevalidateFloorPlanStorage({ allowProvisionable: true }).catch((caught: unknown) => caught)
    expect(['NOT_EMPTY', 'ENOTDIR']).toContain((error as NodeJS.ErrnoException).code)
  })

  it('rechaza un storage vacío sin marcador en modo estricto (reset)', async () => {
    const dir = await useEmptyFloorStorage()
    // El reset no acepta un storage sin marcador solo porque esté vacío.
    await expect(prevalidateFloorPlanStorage({ allowProvisionable: false })).rejects.toMatchObject({ code: 'MISSING_MARKER' })
    expect(await readdir(dir)).toEqual([])
  })

  it('rechaza un marcador de otro propietario con allowProvisionable (seed)', async () => {
    const dir = await useEmptyFloorStorage()
    await writeFile(path.join(dir, MARKER), JSON.stringify({ owner: 'otra-aplicacion' }), 'utf8')
    await writeFile(path.join(dir, ORIGINAL_NAME), 'ajeno', 'utf8')

    await expect(prevalidateFloorPlanStorage({ allowProvisionable: true })).rejects.toMatchObject({ code: 'INVALID_MARKER' })
    // Nada se tocó: ni el marcador ni el fichero ajeno.
    expect(await readdir(dir)).toEqual(expect.arrayContaining([ORIGINAL_NAME]))
  })

  it('rechaza la lectura del marcador con EACCES (fail-closed: no lo trata como ausencia)', async () => {
    await useTempFloorStorage()
    const eacces = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    vi.mocked(readFile).mockRejectedValueOnce(eacces)
    try {
      // Ni siquiera en modo seed: un marcador ilegible no es un storage nuevo.
      const error = await prevalidateFloorPlanStorage({ allowProvisionable: true }).catch((e: unknown) => e)
      expect(error).toMatchObject({ code: 'EACCES' })
      expect(error).not.toBeInstanceOf(FloorPlanStorageError)
    } finally {
      vi.mocked(readFile).mockClear()
    }
  })

  it('rechaza la lectura del marcador con EPERM (fail-closed: no lo trata como ausencia)', async () => {
    await useTempFloorStorage()
    const eperm = Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })
    vi.mocked(readFile).mockRejectedValueOnce(eperm)
    try {
      const error = await prevalidateFloorPlanStorage({ allowProvisionable: false }).catch((e: unknown) => e)
      expect(error).toMatchObject({ code: 'EPERM' })
      expect(error).not.toBeInstanceOf(FloorPlanStorageError)
    } finally {
      vi.mocked(readFile).mockClear()
    }
  })

  it('rechaza un error de lstat distinto de ENOENT (fail-closed)', async () => {
    const dir = await useEmptyFloorStorage()
    await rm(dir, { recursive: true, force: true })
    const eacces = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    vi.mocked(lstat).mockRejectedValueOnce(eacces)
    try {
      await expect(prevalidateFloorPlanStorage({ allowProvisionable: true })).rejects.toMatchObject({ code: 'EACCES' })
    } finally {
      vi.mocked(lstat).mockClear()
    }
  })

  it('rechaza un symlink/junction como ancestro existente al evaluar la provisionabilidad', async () => {
    const dir = await useEmptyFloorStorage()
    const linkComponent = path.join(dir, 'enlace')
    process.env.FLOOR_PLAN_STORAGE_PATH = path.join(linkComponent, 'storage-inexistente')
    const enoent = Object.assign(new Error('ENOENT: no existe'), { code: 'ENOENT' })
    // Secuencia de lstat: marcador (ENOENT), base (ENOENT) y ancestro enlace
    // (symlink): el ascenso alcanza el enlace y lo bloquea.
    vi.mocked(lstat).mockRejectedValueOnce(enoent).mockRejectedValueOnce(enoent).mockResolvedValueOnce(symlinkInfo)
    try {
      const error = await prevalidateFloorPlanStorage({ allowProvisionable: true }).catch((e: unknown) => e)
      expect(error).toMatchObject({ code: 'NOT_EMPTY' })
      expect((error as Error).message).toContain('symlink/junction')
    } finally {
      vi.mocked(lstat).mockClear()
    }
  })

  it('rechaza un symlink roto como componente (no lo confunde con ruta inexistente)', async () => {
    const dir = await useEmptyFloorStorage()
    const brokenLink = path.join(dir, 'enlace-roto')
    process.env.FLOOR_PLAN_STORAGE_PATH = path.join(brokenLink, 'storage-inexistente')
    const enoent = Object.assign(new Error('ENOENT: no existe'), { code: 'ENOENT' })
    // Secuencia de lstat: marcador (ENOENT), base (ENOENT) y ancestro enlace
    // (symlink): un symlink roto se reporta como enlace sin seguir el destino.
    vi.mocked(lstat).mockRejectedValueOnce(enoent).mockRejectedValueOnce(enoent).mockResolvedValueOnce(symlinkInfo)
    try {
      const error = await prevalidateFloorPlanStorage({ allowProvisionable: true }).catch((e: unknown) => e)
      expect(error).toMatchObject({ code: 'NOT_EMPTY' })
      expect((error as Error).message).toContain('symlink/junction')
    } finally {
      vi.mocked(lstat).mockClear()
    }
  })

  it('acepta un marcador que es un archivo normal (PASS)', async () => {
    const dir = await useTempFloorStorage()
    await expect(prevalidateFloorPlanStorage({ allowProvisionable: false })).resolves.toBe(dir)
  })

  it('rechaza un marcador que es un symlink/junction (válido o roto)', async () => {
    await useTempFloorStorage()
    vi.mocked(lstat).mockImplementation(() => Promise.resolve(symlinkInfo))
    try {
      const error = await prevalidateFloorPlanStorage({ allowProvisionable: false }).catch((e: unknown) => e)
      expect(error).toMatchObject({ code: 'INVALID_MARKER' })
      expect((error as Error).message).toContain('symlink/junction')
      // Ni siquiera en modo seed: un marcador enlazado no es un storage nuevo.
      const seedError = await prevalidateFloorPlanStorage({ allowProvisionable: true }).catch((e: unknown) => e)
      expect(seedError).toMatchObject({ code: 'INVALID_MARKER' })
    } finally {
      vi.mocked(lstat).mockRestore()
    }
  })

  it('rechaza un marcador que es un directorio', async () => {
    await useTempFloorStorage()
    vi.mocked(lstat).mockImplementation(() => Promise.resolve(dirInfo))
    try {
      const error = await prevalidateFloorPlanStorage({ allowProvisionable: false }).catch((e: unknown) => e)
      expect(error).toMatchObject({ code: 'INVALID_MARKER' })
      expect((error as Error).message).toContain('not a regular file')
    } finally {
      vi.mocked(lstat).mockRestore()
    }
  })

  it('rechaza un error de lstat del marcador distinto de ENOENT (EACCES/EPERM, fail-closed)', async () => {
    await useTempFloorStorage()
    for (const code of ['EACCES', 'EPERM']) {
      const err = Object.assign(new Error(`${code}: operación no permitida`), { code })
      vi.mocked(lstat).mockRejectedValueOnce(err)
      const error = await prevalidateFloorPlanStorage({ allowProvisionable: false }).catch((e: unknown) => e)
      expect(error).toMatchObject({ code })
      expect(error).not.toBeInstanceOf(FloorPlanStorageError)
      vi.mocked(lstat).mockClear()
    }
  })

  it('rechaza en prevalidación un original que es un symlink/junction', async () => {
    const dir = await useTempFloorStorage()
    await writeFile(path.join(dir, ORIGINAL_NAME), 'original', 'utf8')
    vi.mocked(lstat).mockImplementation((p: PathLike) => Promise.resolve(path.basename(String(p)) === ORIGINAL_NAME ? symlinkInfo : fileInfo))
    try {
      const error = await prevalidateFloorPlanStorage({ allowProvisionable: false }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(FloorPlanPrevalidationError)
      expect((error as Error).message).toContain('symlink/junction')
    } finally {
      vi.mocked(lstat).mockRestore()
    }
  })

  it('rechaza en prevalidación un original que es un symlink roto', async () => {
    const dir = await useTempFloorStorage()
    await writeFile(path.join(dir, ORIGINAL_NAME), 'original', 'utf8')
    // lstat no sigue el destino: un symlink roto se reporta exactamente igual
    // que uno válido (enlace), así que el mock es el mismo — lo que cambió es
    // que `stat` (que seguía el enlace y producía ENOENT para uno roto) ya no
    // se usa para decidir el tipo.
    vi.mocked(lstat).mockImplementation((p: PathLike) => Promise.resolve(path.basename(String(p)) === ORIGINAL_NAME ? symlinkInfo : fileInfo))
    try {
      const error = await prevalidateFloorPlanStorage({ allowProvisionable: false }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(FloorPlanPrevalidationError)
      expect((error as Error).message).toContain('symlink/junction')
    } finally {
      vi.mocked(lstat).mockRestore()
    }
  })

  it('rechaza en prevalidación un .dzi que es un symlink/junction', async () => {
    const dir = await useTempFloorStorage()
    await writeFile(path.join(dir, DZI_NAME), 'dzi', 'utf8')
    vi.mocked(lstat).mockImplementation((p: PathLike) => Promise.resolve(path.basename(String(p)) === DZI_NAME ? symlinkInfo : fileInfo))
    try {
      const error = await prevalidateFloorPlanStorage({ allowProvisionable: false }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(FloorPlanPrevalidationError)
      expect((error as Error).message).toContain('symlink/junction')
    } finally {
      vi.mocked(lstat).mockRestore()
    }
  })

  it('rechaza en prevalidación un _files gestionado que es un symlink/junction', async () => {
    const dir = await useTempFloorStorage()
    await writeFile(path.join(dir, DZI_NAME), 'dzi', 'utf8')
    await mkdir(path.join(dir, DZI_FILES_DIR), { recursive: true })
    vi.mocked(lstat).mockImplementation((p: PathLike) => {
      const name = path.basename(String(p))
      if (name === DZI_FILES_DIR) return Promise.resolve(symlinkInfo)
      return Promise.resolve(fileInfo)
    })
    try {
      const error = await prevalidateFloorPlanStorage({ allowProvisionable: false }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(FloorPlanPrevalidationError)
      expect((error as Error).message).toContain('symlink/junction')
    } finally {
      vi.mocked(lstat).mockRestore()
    }
  })

  it('rechaza en prevalidación un _files gestionado que no es un directorio', async () => {
    const dir = await useTempFloorStorage()
    await writeFile(path.join(dir, DZI_NAME), 'dzi', 'utf8')
    await mkdir(path.join(dir, DZI_FILES_DIR), { recursive: true })
    vi.mocked(lstat).mockImplementation(() => Promise.resolve(fileInfo))
    try {
      const error = await prevalidateFloorPlanStorage({ allowProvisionable: false }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(FloorPlanPrevalidationError)
      expect((error as Error).message).toContain('no es un directorio')
    } finally {
      vi.mocked(lstat).mockRestore()
    }
  })

  it('acepta en prevalidación un _files gestionado que es un directorio normal (PASS)', async () => {
    const dir = await useTempFloorStorage()
    await writeFile(path.join(dir, DZI_NAME), 'dzi', 'utf8')
    await mkdir(path.join(dir, DZI_FILES_DIR), { recursive: true })
    await expect(prevalidateFloorPlanStorage({ allowProvisionable: false })).resolves.toBe(dir)
    expect(await readdir(dir)).toEqual(expect.arrayContaining([DZI_NAME, DZI_FILES_DIR]))
  })

  it('ignora un _files huérfano (sin compañero .dzi) sin inspeccionarlo', async () => {
    const dir = await useTempFloorStorage()
    await mkdir(path.join(dir, DZI_FILES_DIR), { recursive: true })
    vi.mocked(lstat).mockClear()
    await expect(prevalidateFloorPlanStorage({ allowProvisionable: false })).resolves.toBe(dir)
    // Solo el marcador pasa por lstat: el _files huérfano no se inspecciona
    // porque la limpieza no lo elimina (no tiene compañero .dzi/UUID pelado).
    expect(vi.mocked(lstat).mock.calls).toHaveLength(1)
  })

  it('no inspecciona las entradas no gestionadas (se ignoran, igual que la limpieza)', async () => {
    const dir = await useTempFloorStorage()
    await writeFile(path.join(dir, 'nota.txt'), 'ajena', 'utf8')
    vi.mocked(lstat).mockClear()
    await expect(prevalidateFloorPlanStorage({ allowProvisionable: false })).resolves.toBe(dir)
    // Solo el marcador pasa por lstat; la entrada no gestionada nunca se inspecciona.
    expect(vi.mocked(lstat).mock.calls).toHaveLength(1)
  })
})
