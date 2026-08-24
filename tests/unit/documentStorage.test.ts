import { mkdtemp, readdir, writeFile, mkdir, rm, stat, readFile, lstat } from 'node:fs/promises'
import type { PathLike, Stats } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  StorageMarkerError,
  StoragePrevalidationError,
  assertValidStorage,
  cleanDocumentStorage,
  prevalidateDocumentStorage,
  storageMarkerPath,
  storeDocumentBuffer,
} from '../../server/lib/documentStorage'

// Envuelve writeFile, rm, readFile y lstat para poder simular fallos de
// escritura, borrado, lectura del marcador e inspección de componentes sin
// alterar el resto de operaciones de fs del módulo bajo prueba.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, writeFile: vi.fn(actual.writeFile), rm: vi.fn(actual.rm), readFile: vi.fn(actual.readFile), lstat: vi.fn(actual.lstat) }
})

// Owner canónico del marcador (interno del módulo, no exportado) y shapes de
// lstat para simular enlaces/objetos sin tocar el filesystem real.
const DOC_MARKER_OWNER = 'docucore-document-storage'
const fileInfo = { isSymbolicLink: () => false, isFile: () => true, isDirectory: () => false } as unknown as Stats
const symlinkInfo = { isSymbolicLink: () => true, isFile: () => false, isDirectory: () => false } as unknown as Stats
const dirInfo = { isSymbolicLink: () => false, isFile: () => false, isDirectory: () => true } as unknown as Stats

async function writeValidMarker(): Promise<void> {
  await writeFile(storageMarkerPath(), JSON.stringify({ owner: DOC_MARKER_OWNER, createdAt: new Date().toISOString() }), 'utf8')
}

const original = process.env.DOCUMENT_STORAGE_PATH

async function useTempStorage(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'docucore-storage-'))
  process.env.DOCUMENT_STORAGE_PATH = dir
  return dir
}

afterEach(() => {
  if (original === undefined) delete process.env.DOCUMENT_STORAGE_PATH
  else process.env.DOCUMENT_STORAGE_PATH = original
})

describe('documentStorage', () => {
  it('provisiona el marcador propio al almacenar el primer fichero', async () => {
    const dir = await useTempStorage()
    await storeDocumentBuffer(Buffer.from('hola'), 'text/plain')
    const entries = await readdir(dir)
    expect(entries).toContain(path.basename(storageMarkerPath()))
  })

  it('limpia claves gestionadas pero conserva el marcador', async () => {
    const dir = await useTempStorage()
    await storeDocumentBuffer(Buffer.from('a'), 'text/plain')
    await storeDocumentBuffer(Buffer.from('b'), 'text/plain')
    const removed = await cleanDocumentStorage()
    expect(removed).toBe(2)
    const entries = await readdir(dir)
    expect(entries).toEqual([path.basename(storageMarkerPath())])
  })

  it('rechaza la limpieza si falta el marcador (ruta no gestionada)', async () => {
    await useTempStorage()
    // Directorio sin marcador: no es un almacenamiento de DocuCore.
    await expect(cleanDocumentStorage()).rejects.toThrow()
    await expect(assertValidStorage()).rejects.toThrow()
  })

  it('rechaza la limpieza con una ruta mal configurada (raíz del sistema)', async () => {
    process.env.DOCUMENT_STORAGE_PATH = path.sep
    await expect(cleanDocumentStorage()).rejects.toThrow()
    await expect(assertValidStorage()).rejects.toThrow()
  })

  it('no borra ficheros ajenos al patrón de claves de almacenamiento', async () => {
    const dir = await useTempStorage()
    await storeDocumentBuffer(Buffer.from('a'), 'text/plain')
    await mkdir(path.join(dir, 'carpeta-ajena'), { recursive: true })
    await writeFile(path.join(dir, 'nota.txt'), 'no es una clave uuid')
    const removed = await cleanDocumentStorage()
    // Solo la clave gestionada se elimina; la nota .txt no supera el patrón uuid.
    expect(removed).toBe(1)
    const entries = await readdir(dir)
    expect(entries).toContain('nota.txt')
    await rm(path.join(dir, 'carpeta-ajena'), { recursive: true, force: true })
  })

  it('trata un marcador corrupto como error bloqueante sin borrar nada', async () => {
    const dir = await useTempStorage()
    await mkdir(dir, { recursive: true })
    await writeFile(storageMarkerPath(), '{no es json', 'utf8')
    await writeFile(path.join(dir, 'f81f42c8-0000-4000-8000-000000000000.pdf'), 'contenido', 'utf8')

    await expect(storeDocumentBuffer(Buffer.from('nuevo'), 'text/plain')).rejects.toBeInstanceOf(StorageMarkerError)
    await expect(assertValidStorage()).rejects.toMatchObject({ code: 'INVALID_MARKER' })
    await expect(cleanDocumentStorage()).rejects.toMatchObject({ code: 'INVALID_MARKER' })
    // La limpieza falló antes de tocar nada: el fichero sigue ahí.
    const entries = await readdir(dir)
    expect(entries).toContain('f81f42c8-0000-4000-8000-000000000000.pdf')
  })

  it('trata un marcador de otro propietario como error bloqueante', async () => {
    const dir = await useTempStorage()
    await mkdir(dir, { recursive: true })
    await writeFile(storageMarkerPath(), JSON.stringify({ owner: 'otra-aplicacion' }), 'utf8')
    await writeFile(path.join(dir, 'a81f42c8-0000-4000-8000-000000000000.txt'), 'ajeno', 'utf8')

    await expect(storeDocumentBuffer(Buffer.from('nuevo'), 'text/plain')).rejects.toBeInstanceOf(StorageMarkerError)
    await expect(assertValidStorage()).rejects.toMatchObject({ code: 'INVALID_MARKER' })
    await expect(cleanDocumentStorage()).rejects.toMatchObject({ code: 'INVALID_MARKER' })
    const entries = await readdir(dir)
    expect(entries).toContain('a81f42c8-0000-4000-8000-000000000000.txt')
  })

  it('no provisiona sobre un directorio no vacío sin marcador', async () => {
    const dir = await useTempStorage()
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'legado.txt'), 'contenido previo', 'utf8')

    await expect(storeDocumentBuffer(Buffer.from('nuevo'), 'text/plain')).rejects.toMatchObject({ code: 'NOT_EMPTY' })
    // Ni siquiera se creó el marcador: el directorio no es nuestro.
    const entries = await readdir(dir)
    expect(entries).toEqual(['legado.txt'])
  })

  it('no oculta los errores de writeFile al provisionar el marcador', async () => {
    const dir = await useTempStorage()
    await mkdir(dir, { recursive: true })
    vi.mocked(writeFile).mockRejectedValueOnce(new Error('ENOSPC: disk full'))

    try {
      await expect(storeDocumentBuffer(Buffer.from('nuevo'), 'text/plain')).rejects.toThrow('ENOSPC: disk full')
    } finally {
      vi.mocked(writeFile).mockClear()
    }
  })

  it('propaga los fallos de rm al limpiar el almacenamiento (EACCES/EBUSY)', async () => {
    const dir = await useTempStorage()
    await storeDocumentBuffer(Buffer.from('a'), 'text/plain')
    const busy = Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' })
    vi.mocked(rm).mockRejectedValueOnce(busy)

    try {
      // El fallo de rm no se silencia: la limpieza termina con error.
      await expect(cleanDocumentStorage()).rejects.toThrow('EBUSY: resource busy or locked')
      // Y la clave gestionada sigue presente (limpieza parcial no garantizada).
      const entries = await readdir(dir)
      expect(entries.filter((entry) => entry !== '.docucore-storage.json')).toHaveLength(1)
    } finally {
      vi.mocked(rm).mockClear()
    }
  })

  it('prevalida un almacenamiento válido sin borrar nada (READ-ONLY)', async () => {
    const dir = await useTempStorage()
    await storeDocumentBuffer(Buffer.from('a'), 'text/plain')
    await storeDocumentBuffer(Buffer.from('b'), 'text/plain')
    const base = await prevalidateDocumentStorage({ allowProvisionable: false })
    expect(base).toBe(dir)
    // La prevalidación no eliminó ninguna clave.
    expect((await readdir(dir)).filter((entry) => entry !== '.docucore-storage.json')).toHaveLength(2)
  })

  it('prevalida e ignora entradas no gestionadas, igual que la limpieza', async () => {
    const dir = await useTempStorage()
    await storeDocumentBuffer(Buffer.from('a'), 'text/plain')
    await mkdir(path.join(dir, 'carpeta-ajena'), { recursive: true })
    await writeFile(path.join(dir, 'nota.txt'), 'no es una clave uuid')
    await expect(prevalidateDocumentStorage({ allowProvisionable: false })).resolves.toBe(dir)
    // Todo sigue en su sitio: la prevalidación no borró nada.
    expect(await readdir(dir)).toEqual(expect.arrayContaining(['nota.txt', 'carpeta-ajena']))
    await rm(path.join(dir, 'carpeta-ajena'), { recursive: true, force: true })
  })

  it('rechaza en prevalidación un directorio con nombre de clave gestionada', async () => {
    const dir = await useTempStorage()
    await storeDocumentBuffer(Buffer.from('a'), 'text/plain')
    const managedEntry = path.join(dir, 'f81f42c8-0000-4000-8000-000000000000.pdf')
    await mkdir(managedEntry, { recursive: true })
    await writeFile(path.join(managedEntry, 'contenido-interno.txt'), 'no vacío', 'utf8')

    // El directorio con nombre de clave gestionada haría fallar la limpieza
    // (rm sin recursive): la prevalidación lo rechaza sin tocar nada.
    await expect(prevalidateDocumentStorage({ allowProvisionable: false })).rejects.toBeInstanceOf(StoragePrevalidationError)
    expect(await readdir(managedEntry)).toEqual(['contenido-interno.txt'])
    await rm(managedEntry, { recursive: true, force: true })
  })

  it('rechaza en prevalidación un marcador corrupto sin repararlo ni borrar nada', async () => {
    const dir = await useTempStorage()
    await mkdir(dir, { recursive: true })
    await writeFile(storageMarkerPath(), '{no es json', 'utf8')
    await writeFile(path.join(dir, 'f81f42c8-0000-4000-8000-000000000000.pdf'), 'contenido', 'utf8')

    await expect(prevalidateDocumentStorage({ allowProvisionable: false })).rejects.toMatchObject({ code: 'INVALID_MARKER' })
    // El marcador sigue corrupto (no se reprovisionó) y el fichero sigue ahí.
    expect(await readdir(dir)).toEqual(expect.arrayContaining(['f81f42c8-0000-4000-8000-000000000000.pdf']))
    await expect(assertValidStorage()).rejects.toMatchObject({ code: 'INVALID_MARKER' })
  })

  it('admite un storage inexistente con allowProvisionable (seed) sin crear nada (READ-ONLY)', async () => {
    const dir = await useTempStorage()
    await rm(dir, { recursive: true, force: true })
    const base = await prevalidateDocumentStorage({ allowProvisionable: true })
    expect(base).toBe(dir)
    // READ-ONLY: la ruta sigue sin existir; la prevalidación no creó el
    // directorio ni el marcador.
    await expect(stat(dir)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('admite un directorio vacío sin marcador con allowProvisionable (seed)', async () => {
    const dir = await useTempStorage()
    await expect(prevalidateDocumentStorage({ allowProvisionable: true })).resolves.toBe(dir)
    // READ-ONLY: el marcador no se provisionó durante la prevalidación.
    expect(await readdir(dir)).toEqual([])
  })

  it('rechaza un directorio no vacío sin marcador incluso con allowProvisionable (seed)', async () => {
    const dir = await useTempStorage()
    await writeFile(path.join(dir, 'legado.txt'), 'contenido previo', 'utf8')

    await expect(prevalidateDocumentStorage({ allowProvisionable: true })).rejects.toMatchObject({ code: 'NOT_EMPTY' })
    // Nada se tocó: el fichero sigue y no se creó ningún marcador.
    expect(await readdir(dir)).toEqual(['legado.txt'])
  })

  it('rechaza un storage inexistente no provisionable con allowProvisionable (ancestro archivo)', async () => {
    const dir = await useTempStorage()
    const blocker = path.join(dir, 'bloqueo')
    await writeFile(blocker, 'soy un archivo, no un directorio', 'utf8')
    process.env.DOCUMENT_STORAGE_PATH = path.join(blocker, 'storage-inexistente')

    // El mkdir recursivo posterior fallaría tras el TRUNCATE; la prevalidación
    // lo detecta sin escribir nada. Linux puede devolver ENOTDIR al inspeccionar
    // el marcador antes de que el ascenso normalice el caso como NOT_EMPTY.
    const error = await prevalidateDocumentStorage({ allowProvisionable: true }).catch((caught: unknown) => caught)
    expect(['NOT_EMPTY', 'ENOTDIR']).toContain((error as NodeJS.ErrnoException).code)
  })

  it('rechaza un storage vacío sin marcador en modo estricto (reset)', async () => {
    const dir = await useTempStorage()
    // El reset no acepta un storage sin marcador solo porque esté vacío.
    await expect(prevalidateDocumentStorage({ allowProvisionable: false })).rejects.toMatchObject({ code: 'MISSING_MARKER' })
    expect(await readdir(dir)).toEqual([])
  })

  it('rechaza un marcador de otro propietario con allowProvisionable (seed)', async () => {
    const dir = await useTempStorage()
    await writeFile(storageMarkerPath(), JSON.stringify({ owner: 'otra-aplicacion' }), 'utf8')
    await writeFile(path.join(dir, 'a81f42c8-0000-4000-8000-000000000000.txt'), 'ajeno', 'utf8')

    await expect(prevalidateDocumentStorage({ allowProvisionable: true })).rejects.toMatchObject({ code: 'INVALID_MARKER' })
    // Nada se tocó: ni el marcador ni el fichero ajeno.
    expect(await readdir(dir)).toEqual(expect.arrayContaining(['a81f42c8-0000-4000-8000-000000000000.txt']))
  })

  it('trata solo el ENOENT del marcador como ausencia (seed provisionable)', async () => {
    const dir = await useTempStorage()
    // Directorio vacío sin marcador: readFile(marker) falla con ENOENT real.
    await expect(assertValidStorage()).rejects.toMatchObject({ code: 'MISSING_MARKER' })
    await expect(prevalidateDocumentStorage({ allowProvisionable: true })).resolves.toBe(dir)
  })

  it('rechaza la lectura del marcador con EACCES (fail-closed: no es ausencia)', async () => {
    await useTempStorage()
    await writeValidMarker()
    const eacces = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    vi.mocked(readFile).mockRejectedValueOnce(eacces)
    try {
      // Ni siquiera en modo seed: un marcador ilegible no es un storage nuevo.
      const error = await prevalidateDocumentStorage({ allowProvisionable: true }).catch((e: unknown) => e)
      expect(error).toMatchObject({ code: 'EACCES' })
      expect(error).not.toBeInstanceOf(StorageMarkerError)
    } finally {
      vi.mocked(readFile).mockClear()
    }
  })

  it('rechaza la lectura del marcador con EPERM (fail-closed: no es ausencia)', async () => {
    await useTempStorage()
    await writeValidMarker()
    const eperm = Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })
    vi.mocked(readFile).mockRejectedValueOnce(eperm)
    try {
      const error = await prevalidateDocumentStorage({ allowProvisionable: false }).catch((e: unknown) => e)
      expect(error).toMatchObject({ code: 'EPERM' })
      expect(error).not.toBeInstanceOf(StorageMarkerError)
    } finally {
      vi.mocked(readFile).mockClear()
    }
  })

  it('rechaza un error de lstat distinto de ENOENT (fail-closed)', async () => {
    const dir = await useTempStorage()
    await rm(dir, { recursive: true, force: true })
    const eacces = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    vi.mocked(lstat).mockRejectedValueOnce(eacces)
    try {
      await expect(prevalidateDocumentStorage({ allowProvisionable: true })).rejects.toMatchObject({ code: 'EACCES' })
    } finally {
      vi.mocked(lstat).mockClear()
    }
  })

  it('rechaza un symlink/junction como ancestro existente al evaluar la provisionabilidad', async () => {
    const dir = await useTempStorage()
    const linkComponent = path.join(dir, 'enlace')
    process.env.DOCUMENT_STORAGE_PATH = path.join(linkComponent, 'storage-inexistente')
    const enoent = Object.assign(new Error('ENOENT: no existe'), { code: 'ENOENT' })
    // Secuencia de lstat: marcador (ENOENT), base (ENOENT) y ancestro enlace
    // (symlink): el ascenso alcanza el enlace y lo bloquea.
    vi.mocked(lstat).mockRejectedValueOnce(enoent).mockRejectedValueOnce(enoent).mockResolvedValueOnce(symlinkInfo)
    try {
      const error = await prevalidateDocumentStorage({ allowProvisionable: true }).catch((e: unknown) => e)
      expect(error).toMatchObject({ code: 'NOT_EMPTY' })
      expect((error as Error).message).toContain('symlink/junction')
    } finally {
      vi.mocked(lstat).mockClear()
    }
  })

  it('rechaza un symlink roto como componente (no lo confunde con ruta inexistente)', async () => {
    const dir = await useTempStorage()
    const brokenLink = path.join(dir, 'enlace-roto')
    process.env.DOCUMENT_STORAGE_PATH = path.join(brokenLink, 'storage-inexistente')
    const enoent = Object.assign(new Error('ENOENT: no existe'), { code: 'ENOENT' })
    // Secuencia de lstat: marcador (ENOENT), base (ENOENT) y ancestro enlace
    // (symlink): un symlink roto se reporta como enlace sin seguir el destino.
    vi.mocked(lstat).mockRejectedValueOnce(enoent).mockRejectedValueOnce(enoent).mockResolvedValueOnce(symlinkInfo)
    try {
      const error = await prevalidateDocumentStorage({ allowProvisionable: true }).catch((e: unknown) => e)
      expect(error).toMatchObject({ code: 'NOT_EMPTY' })
      expect((error as Error).message).toContain('symlink/junction')
    } finally {
      vi.mocked(lstat).mockClear()
    }
  })

  it('acepta un marcador que es un archivo normal (PASS)', async () => {
    const dir = await useTempStorage()
    await writeValidMarker()
    await expect(assertValidStorage()).resolves.toBe(dir)
    await expect(prevalidateDocumentStorage({ allowProvisionable: false })).resolves.toBe(dir)
  })

  it('rechaza un marcador que es un symlink/junction (válido o roto)', async () => {
    await useTempStorage()
    vi.mocked(lstat).mockImplementation(() => Promise.resolve(symlinkInfo))
    try {
      const error = await assertValidStorage().catch((e: unknown) => e)
      expect(error).toMatchObject({ code: 'INVALID_MARKER' })
      expect((error as Error).message).toContain('symlink/junction')
      // Ni siquiera en modo seed: un marcador enlazado no es un storage nuevo.
      const seedError = await prevalidateDocumentStorage({ allowProvisionable: true }).catch((e: unknown) => e)
      expect(seedError).toMatchObject({ code: 'INVALID_MARKER' })
    } finally {
      vi.mocked(lstat).mockRestore()
    }
  })

  it('rechaza un marcador que es un directorio', async () => {
    await useTempStorage()
    vi.mocked(lstat).mockImplementation(() => Promise.resolve(dirInfo))
    try {
      const error = await assertValidStorage().catch((e: unknown) => e)
      expect(error).toMatchObject({ code: 'INVALID_MARKER' })
      expect((error as Error).message).toContain('not a regular file')
    } finally {
      vi.mocked(lstat).mockRestore()
    }
  })

  it('rechaza un error de lstat del marcador distinto de ENOENT (EACCES/EPERM, fail-closed)', async () => {
    await useTempStorage()
    await writeValidMarker()
    for (const code of ['EACCES', 'EPERM']) {
      const err = Object.assign(new Error(`${code}: operación no permitida`), { code })
      vi.mocked(lstat).mockRejectedValueOnce(err)
      const error = await assertValidStorage().catch((e: unknown) => e)
      expect(error).toMatchObject({ code })
      expect(error).not.toBeInstanceOf(StorageMarkerError)
      vi.mocked(lstat).mockClear()
    }
  })

  it('rechaza en prevalidación una clave gestionada que es un symlink/junction', async () => {
    const dir = await useTempStorage()
    await writeValidMarker()
    const managedPdf = 'f81f42c8-0000-4000-8000-000000000000.pdf'
    await writeFile(path.join(dir, managedPdf), 'contenido', 'utf8')
    vi.mocked(lstat).mockImplementation((p: PathLike) => Promise.resolve(path.basename(String(p)) === managedPdf ? symlinkInfo : fileInfo))
    try {
      const error = await prevalidateDocumentStorage({ allowProvisionable: false }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(StoragePrevalidationError)
      expect((error as Error).message).toContain('symlink/junction')
    } finally {
      vi.mocked(lstat).mockRestore()
    }
  })

  it('rechaza en prevalidación una clave gestionada que es un symlink roto', async () => {
    const dir = await useTempStorage()
    await writeValidMarker()
    const managedPdf = 'f81f42c8-0000-4000-8000-000000000000.pdf'
    await writeFile(path.join(dir, managedPdf), 'contenido', 'utf8')
    // lstat no sigue el destino: un symlink roto se reporta exactamente igual
    // que uno válido (enlace), así que el mock es el mismo — lo que cambió es
    // que `stat` (que seguía el enlace y producía ENOENT para uno roto) ya no
    // se usa para decidir el tipo.
    vi.mocked(lstat).mockImplementation((p: PathLike) => Promise.resolve(path.basename(String(p)) === managedPdf ? symlinkInfo : fileInfo))
    try {
      const error = await prevalidateDocumentStorage({ allowProvisionable: false }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(StoragePrevalidationError)
      expect((error as Error).message).toContain('symlink/junction')
    } finally {
      vi.mocked(lstat).mockRestore()
    }
  })

  it('acepta en prevalidación una clave gestionada que es un archivo normal (PASS)', async () => {
    const dir = await useTempStorage()
    await writeValidMarker()
    await writeFile(path.join(dir, 'f81f42c8-0000-4000-8000-000000000000.pdf'), 'contenido', 'utf8')
    await expect(prevalidateDocumentStorage({ allowProvisionable: false })).resolves.toBe(dir)
    // READ-ONLY: el fichero gestionado sigue ahí.
    expect(await readdir(dir)).toContain('f81f42c8-0000-4000-8000-000000000000.pdf')
  })

  it('no inspecciona las entradas no gestionadas (se ignoran, igual que la limpieza)', async () => {
    const dir = await useTempStorage()
    await writeValidMarker()
    await writeFile(path.join(dir, 'nota.txt'), 'no es una clave uuid', 'utf8')
    vi.mocked(lstat).mockClear()
    await expect(prevalidateDocumentStorage({ allowProvisionable: false })).resolves.toBe(dir)
    // Solo el marcador pasa por lstat; la entrada no gestionada nunca se inspecciona.
    expect(vi.mocked(lstat).mock.calls).toHaveLength(1)
  })
})
