import { mkdtemp, readdir, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  StorageMarkerError,
  assertValidStorage,
  cleanDocumentStorage,
  storageMarkerPath,
  storeDocumentBuffer,
} from '../../server/lib/documentStorage'

// Envuelve writeFile y rm para poder simular fallos de escritura y de borrado
// sin alterar el resto de operaciones de fs del módulo bajo prueba.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, writeFile: vi.fn(actual.writeFile), rm: vi.fn(actual.rm) }
})

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
})
