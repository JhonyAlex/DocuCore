import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase } from '../helpers/database'
import prisma from '../../server/lib/prisma'

// COM-01: comentarios de activos y documentos.
// Contratos verificados aquí: alta en ambas entidades, listado paginado por
// cursor sin duplicados ni pérdidas, edición/borrado solo del autor o de
// ADMIN/OWNER, lectura para VIEWER, aislamiento cross-project y validación
// de cuerpo. Los comentarios viven fuera del DTO de Asset/Document.

let server: Server | undefined
let baseUrl = ''
let storageDir: string
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

// Roles sembrados por proyecto: p1 (OWNER u1, EDITOR u2/u3/u5, VIEWER u4),
// p2 (OWNER u1, EDITOR u2, ADMIN u5), p3 (VIEWER u2) y p5 (solo OWNER u1).
const OWNER = 1
const EDITOR_A = 2
const EDITOR_B = 3
const VIEWER = 4
const P2_ADMIN = 5

function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (!headers.has('x-docucore-test-actor-id')) headers.set('x-docucore-test-actor-id', String(OWNER))
  return fetch(`${baseUrl}${path}`, { ...init, headers })
}
function apiAs(actorId: number, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('x-docucore-test-actor-id', String(actorId))
  return fetch(`${baseUrl}${path}`, { ...init, headers })
}
function json(actorId: number, path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown): Promise<Response> {
  const headers = new Headers({ 'content-type': 'application/json' })
  headers.set('x-docucore-test-actor-id', String(actorId))
  return api(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}
const scoped = (projectId: number, path: string) => `/api/projects/${projectId}${path}`
const commentPath = (projectId: number, entity: 'asset' | 'document', entityId: number) =>
  scoped(projectId, `/${entity === 'asset' ? 'assets' : 'documents'}/${entityId}/comments`)

type CommentDto = {
  id: number
  projectId: number
  authorId: number
  assetId: number | null
  documentId: number | null
  body: string
  createdAt: string
  updatedAt: string
  edited: boolean
  canEdit: boolean
  canDelete: boolean
  author: { id: number; name: string; initials: string; color: string }
}

async function createAsset(projectId: number, actorId: number, code: string): Promise<number> {
  const [typesResponse, statusesResponse, locationsResponse] = await Promise.all([
    apiAs(actorId, scoped(projectId, '/asset-types')),
    apiAs(actorId, scoped(projectId, '/statuses')),
    apiAs(actorId, scoped(projectId, '/locations?limit=20')),
  ])
  const types = (await typesResponse.json()) as Array<{ id: number }>
  const statuses = (await statusesResponse.json()) as Array<{ id: number }>
  const locationsPayload = (await locationsResponse.json()) as { locations: Array<{ id: number }> }
  const response = await apiAs(actorId, scoped(projectId, '/assets'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code, name: `Activo comentarios ${code}`, serialNumber: `SN-COM-${code}`,
      installDate: '2026-08-01', typeId: types[0].id, statusId: statuses[0].id,
      locationId: locationsPayload.locations[0].id, responsibleId: actorId, initials: 'QA', projectId,
    }),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as { id: number }).id
}

const PDF_BYTES = Buffer.from('%PDF-1.4 COM QA BYTES')
const createdDocumentIds: number[] = []

async function createDocument(projectId: number, actorId: number, name: string): Promise<number> {
  const form = new FormData()
  form.set('name', name)
  form.set('type', 'Manual')
  form.set('projectId', String(projectId))
  form.set('issueDate', '2026-08-01')
  form.append('file', new Blob([new Uint8Array(PDF_BYTES)], { type: 'application/pdf' }), 'comentario.pdf')
  const response = await apiAs(actorId, scoped(projectId, '/documents'), { method: 'POST', body: form })
  expect(response.status).toBe(201)
  const created = (await response.json()) as { id: number }
  createdDocumentIds.push(created.id)
  return created.id
}

async function createComment(actorId: number, projectId: number, entity: 'asset' | 'document', entityId: number, body: string): Promise<CommentDto> {
  const response = await json(actorId, commentPath(projectId, entity, entityId), 'POST', { body })
  expect(response.status).toBe(201)
  return (await response.json()) as CommentDto
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl
  storageDir = await mkdtemp(path.join(tmpdir(), 'docucore-comments-'))
  process.env.DOCUMENT_STORAGE_PATH = storageDir
  await ensureTestDatabase()
  const { default: app } = await import('../../server/index')
  await new Promise<void>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${(instance.address() as AddressInfo).port}`
      resolve()
    })
    server = instance
  })
}, 120_000)

afterAll(async () => {
  for (const id of createdDocumentIds) {
    await api(`/api/documents/${id}`, { method: 'DELETE' }).catch(() => undefined)
  }
  await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()))
  await rm(storageDir, { recursive: true, force: true })
})

describe('COM-01 comments on assets', () => {
  let assetId: number
  let commentId: number

  beforeAll(async () => {
    assetId = await createAsset(1, OWNER, `C-AS-${suffix}`)
  })

  it('creates a multiline comment on an asset with author and metadata', async () => {
    const created = await createComment(EDITOR_A, 1, 'asset', assetId, '  Revisar la presión antes del turno \n segundo párrafo  ')
    expect(created.authorId).toBe(EDITOR_A)
    expect(created.assetId).toBe(assetId)
    expect(created.documentId).toBeNull()
    expect(created.body).toBe('Revisar la presión antes del turno \n segundo párrafo')
    expect(created.edited).toBe(false)
    expect(created.canEdit).toBe(true)
    expect(created.canDelete).toBe(true)
    expect(created.author).toMatchObject({ id: EDITOR_A })
    expect(created.author.initials).toBeTruthy()
    expect(created.author.color).toBeTruthy()
    commentId = created.id

    const audit = await prisma.auditLog.findFirst({ where: { entityId: `comment:${commentId}`, projectId: 1 }, orderBy: { id: 'desc' } })
    expect(audit?.action).toBe('Comentario añadido')
    expect(audit?.detail).toContain('activo')
    // COM-01: la auditoría no duplica el texto del comentario.
    expect(audit?.detail).not.toContain('presión')
  })

  it('rejects empty, blank and oversized bodies on create', async () => {
    expect((await json(EDITOR_A, commentPath(1, 'asset', assetId), 'POST', { body: '' })).status).toBe(400)
    expect((await json(EDITOR_A, commentPath(1, 'asset', assetId), 'POST', { body: '   ' })).status).toBe(400)
    expect((await json(EDITOR_A, commentPath(1, 'asset', assetId), 'POST', {})).status).toBe(400)
    expect((await json(EDITOR_A, commentPath(1, 'asset', assetId), 'POST', { body: 'x'.repeat(4001) })).status).toBe(400)
    expect((await json(EDITOR_A, commentPath(1, 'asset', assetId), 'POST', { body: 42 })).status).toBe(400)
  })

  it('lists newest first and paginates by cursor without duplicating or losing comments', async () => {
    const target = await createAsset(1, OWNER, `C-PG-${suffix}`)
    const total = 27
    for (let index = 1; index <= total; index += 1) {
      await createComment(EDITOR_A, 1, 'asset', target, `Página ${index} de ${total}`)
    }
    const seen: number[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const response = await apiAs(EDITOR_A, `${commentPath(1, 'asset', target)}?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
      expect(response.status).toBe(200)
      const page = (await response.json()) as { data: CommentDto[]; hasMore: boolean; nextCursor: string | null }
      pages += 1
      for (const comment of page.data) {
        // Más recientes primero y sin repeticiones entre páginas.
        expect(seen).not.toContain(comment.id)
        seen.push(comment.id)
        expect(comment.documentId).toBeNull()
      }
      cursor = page.nextCursor
      expect(page.hasMore).toBe(Boolean(cursor))
    } while (cursor !== null)
    expect(pages).toBe(3)
    expect(seen).toHaveLength(total)
    expect([...seen]).toEqual([...seen].sort((a, b) => b - a))

    const invalid = await apiAs(EDITOR_A, `${commentPath(1, 'asset', target)}?cursor=no-es-un-cursor`)
    expect(invalid.status).toBe(400)
  })

  it('lets the author edit and delete their own comment', async () => {
    const created = await createComment(EDITOR_A, 1, 'asset', assetId, 'Texto original del autor')
    await sleep(5)
    const updatedResponse = await json(EDITOR_A, scoped(1, `/comments/${created.id}`), 'PATCH', { body: 'Texto corregido por el autor' })
    expect(updatedResponse.status).toBe(200)
    const updated = (await updatedResponse.json()) as CommentDto
    expect(updated.body).toBe('Texto corregido por el autor')
    expect(updated.edited).toBe(true)
    expect(updated.updatedAt > created.updatedAt).toBe(true)

    const audit = await prisma.auditLog.findFirst({ where: { entityId: `comment:${updated.id}`, action: 'Comentario editado' } })
    expect(audit?.detail).toContain('activo')
    expect(audit?.detail).not.toContain('corregido')

    expect((await json(EDITOR_A, scoped(1, `/comments/${created.id}`), 'DELETE')).status).toBe(204)
    const list = (await (await apiAs(EDITOR_A, commentPath(1, 'asset', assetId))).json()) as { data: CommentDto[] }
    expect(list.data.find((comment) => comment.id === created.id)).toBeUndefined()
  })

  it('keeps comment edit/delete restricted to author or ADMIN/OWNER', async () => {
    const created = await createComment(EDITOR_A, 1, 'asset', assetId, 'Comentario ajeno para el editor B')

    // EDITOR_B no es el autor: no puede editarlo ni borrarlo.
    expect((await json(EDITOR_B, scoped(1, `/comments/${created.id}`), 'PATCH', { body: 'Intento ajeno' })).status).toBe(403)
    expect((await json(EDITOR_B, scoped(1, `/comments/${created.id}`), 'DELETE')).status).toBe(403)

    // El OWNER sí gestiona comentarios ajenos (editar y eliminar).
    expect((await json(OWNER, scoped(1, `/comments/${created.id}`), 'PATCH', { body: 'Editado por el OWNER' })).status).toBe(200)
    expect((await json(OWNER, scoped(1, `/comments/${created.id}`), 'DELETE')).status).toBe(204)
    expect((await json(OWNER, scoped(1, `/comments/${created.id}`), 'PATCH', { body: 'Fantasma' })).status).toBe(404)
  })

  it('grants ADMIN management over comments of other users', async () => {
    const projectTwoAsset = await createAsset(2, OWNER, `C-P2-${suffix}`)
    const created = await createComment(EDITOR_A, 2, 'asset', projectTwoAsset, 'Comentario del editor en el proyecto 2')

    // EDITOR_A (proyecto 2) no es ADMIN: tampoco gestiona el comentario ajeno.
    expect((await json(EDITOR_B, scoped(2, `/comments/${created.id}`), 'DELETE')).status).toBe(403)

    // El ADMIN del proyecto 2 puede eliminar comentarios de otro miembro.
    const listBefore = (await (await apiAs(P2_ADMIN, commentPath(2, 'asset', projectTwoAsset))).json()) as { data: CommentDto[] }
    expect(listBefore.data[0]?.canDelete).toBe(true)
    expect((await json(P2_ADMIN, scoped(2, `/comments/${created.id}`), 'DELETE')).status).toBe(204)
  })

  it('exposes capability flags per viewer in list responses', async () => {
    const created = await createComment(EDITOR_A, 1, 'asset', assetId, 'Comentario visible con flags')
    const asEditor = (await (await apiAs(EDITOR_B, commentPath(1, 'asset', assetId))).json()) as { data: CommentDto[] }
    const forEditor = asEditor.data.find((comment) => comment.id === created.id)
    expect(forEditor?.canEdit).toBe(false)
    expect(forEditor?.canDelete).toBe(false)
    const asOwner = (await (await apiAs(OWNER, commentPath(1, 'asset', assetId))).json()) as { data: CommentDto[] }
    const forOwner = asOwner.data.find((comment) => comment.id === created.id)
    expect(forOwner?.canEdit).toBe(true)
    expect(forOwner?.canDelete).toBe(true)
  })

  it('allows VIEWER to read but never to write', async () => {
    const list = await apiAs(VIEWER, commentPath(1, 'asset', assetId))
    expect(list.status).toBe(200)
    const payload = (await list.json()) as { data: CommentDto[] }
    for (const comment of payload.data) {
      expect(comment.canEdit).toBe(false)
      expect(comment.canDelete).toBe(false)
    }
    expect((await json(VIEWER, commentPath(1, 'asset', assetId), 'POST', { body: 'Intento de viewer' })).status).toBe(403)
  })

  it('fails cross-project access with manipulated ids', async () => {
    // Comentario del proyecto 1 manipulado a través del scope del proyecto 2
    // (el actor es miembro de ambos, pero el comentario no pertenece al p2).
    const projectTwoAsset = await createAsset(2, OWNER, `C-XP-${suffix}`)
    const created = await createComment(EDITOR_A, 1, 'asset', assetId, 'Comentario del proyecto 1')
    expect((await json(EDITOR_A, scoped(2, `/comments/${created.id}`), 'PATCH', { body: 'X' })).status).toBe(404)
    expect((await json(EDITOR_A, scoped(2, `/comments/${created.id}`), 'DELETE')).status).toBe(404)
    expect((await apiAs(EDITOR_A, commentPath(2, 'asset', assetId))).status).toBe(404)
    expect((await json(EDITOR_A, commentPath(2, 'asset', projectTwoAsset), 'POST', { body: 'En p2' })).status).toBe(201)

    // Un miembro del p1 sin pertenencia al p2 recibe 403 en el propio scope.
    expect((await apiAs(EDITOR_B, commentPath(2, 'asset', projectTwoAsset))).status).toBe(403)
    // Un no-miembro tampoco alcanza los comentarios del proyecto 1.
    expect((await json(EDITOR_B, scoped(1, `/comments/${created.id}`), 'DELETE')).status).toBe(403)
  })

  it('hides comments while the asset is in the trash and restores them with it', async () => {
    const target = await createAsset(1, OWNER, `C-TR-${suffix}`)
    const created = await createComment(EDITOR_A, 1, 'asset', target, 'Comentario que sobrevive a la papelera')

    expect((await api(scoped(1, `/assets/${target}`), { method: 'DELETE' })).status).toBe(204)
    expect((await apiAs(EDITOR_A, commentPath(1, 'asset', target))).status).toBe(404)
    expect((await json(EDITOR_A, commentPath(1, 'asset', target), 'POST', { body: 'A un activo en papelera' })).status).toBe(404)

    expect((await api(scoped(1, `/assets/${target}/restore`), { method: 'POST' })).status).toBe(200)
    const restored = (await (await apiAs(EDITOR_A, commentPath(1, 'asset', target))).json()) as { data: CommentDto[] }
    expect(restored.data.some((comment) => comment.id === created.id)).toBe(true)

    expect((await api(scoped(1, `/assets/${target}`), { method: 'DELETE' })).status).toBe(204)
    expect((await api(scoped(1, `/assets/${target}/purge`), { method: 'POST' })).status).toBe(204)
    const remaining = await prisma.comment.count({ where: { id: created.id } })
    expect(remaining).toBe(0)
  })
})

describe('COM-01 comments on documents', () => {
  it('creates, counts and lists document comments independently from asset comments', async () => {
    const documentId = await createDocument(1, OWNER, `COM-DOC-${suffix}`)
    for (let index = 1; index <= 22; index += 1) {
      await createComment(EDITOR_A, 1, 'document', documentId, `Nota documental ${index}`)
    }

    // El contador ligero es exacto aunque haya más comentarios que la primera página.
    const countResponse = await apiAs(EDITOR_A, scoped(1, `/documents/${documentId}/comments/count`))
    expect(countResponse.status).toBe(200)
    expect(((await countResponse.json()) as { count: number }).count).toBe(22)

    const firstPage = (await (await apiAs(EDITOR_A, commentPath(1, 'document', documentId))).json()) as { data: CommentDto[]; nextCursor: string | null; hasMore: boolean }
    expect(firstPage.data).toHaveLength(20)
    expect(firstPage.hasMore).toBe(true)
    for (const comment of firstPage.data) {
      expect(comment.assetId).toBeNull()
      expect(comment.documentId).toBe(documentId)
    }

    const secondPage = (await (await apiAs(EDITOR_A, `${commentPath(1, 'document', documentId)}?cursor=${encodeURIComponent(firstPage.nextCursor!)}`)).json()) as { data: CommentDto[]; hasMore: boolean }
    expect(secondPage.data).toHaveLength(2)
    expect(secondPage.hasMore).toBe(false)
    const ids = [...firstPage.data.map((comment) => comment.id), ...secondPage.data.map((comment) => comment.id)]
    expect(new Set(ids).size).toBe(22)

    // Los comentarios de un activo no aparecen en la lista del documento y viceversa.
    const assetTarget = await createAsset(1, OWNER, `C-ISO-${suffix}`)
    await createComment(EDITOR_A, 1, 'asset', assetTarget, 'Solo del activo')
    const documentOnly = (await (await apiAs(EDITOR_A, commentPath(1, 'document', documentId))).json()) as { data: CommentDto[] }
    expect(documentOnly.data.some((comment) => comment.body === 'Solo del activo')).toBe(false)
    const assetOnly = (await (await apiAs(EDITOR_A, commentPath(1, 'asset', assetTarget))).json()) as { data: CommentDto[] }
    expect(assetOnly.data.some((comment) => comment.body === 'Nota documental 1')).toBe(false)
  })

  it('validates empty bodies and guards count for missing documents', async () => {
    expect((await json(EDITOR_A, commentPath(1, 'document', 999_999), 'POST', { body: 'x' })).status).toBe(404)
    expect((await apiAs(EDITOR_A, scoped(1, '/documents/999999/comments/count'))).status).toBe(404)
    expect((await apiAs(EDITOR_A, scoped(1, '/documents/999999/comments'))).status).toBe(404)
    expect((await json(EDITOR_A, scoped(1, '/comments/999999'), 'PATCH', { body: 'x' })).status).toBe(404)
    expect((await json(EDITOR_A, scoped(1, '/comments/999999'), 'DELETE')).status).toBe(404)
    expect((await json(EDITOR_A, scoped(1, '/comments/abc'), 'DELETE')).status).toBe(400)
  })

  it('requires EDITOR+ to create document comments', async () => {
    const documentId = await createDocument(2, OWNER, `COM-DOC2-${suffix}`)
    const projectOneDocument = await createDocument(1, OWNER, `COM-DOC1-${suffix}`)
    // VIEWER del proyecto 1 lee pero no escribe.
    expect((await json(VIEWER, commentPath(1, 'document', projectOneDocument), 'POST', { body: 'viewer' })).status).toBe(403)
    // Un miembro del proyecto 1 sin acceso al proyecto 2 no crea en él.
    expect((await json(EDITOR_B, commentPath(2, 'document', documentId), 'POST', { body: 'cross' })).status).toBe(403)
    expect((await json(EDITOR_A, commentPath(2, 'document', documentId), 'POST', { body: 'En el p2' })).status).toBe(201)
  })
})

// COM-01: el invariante `assetId XOR documentId` está garantizado también en
// PostgreSQL (CHECK num_nonnulls(...) = 1 de la migración), no solo por la
// API. Estos casos escriben directamente contra la BD para comprobar que el
// motor rechaza los estados inválidos.
describe('COM-01 database XOR constraint', () => {
  let xorAssetId: number
  let xorDocumentId: number

  beforeAll(async () => {
    xorAssetId = await createAsset(1, OWNER, `C-XOR-${suffix}`)
    xorDocumentId = await createDocument(1, OWNER, `COM-XOR-${suffix}`)
  })

  afterAll(async () => {
    await api(scoped(1, `/documents/${xorDocumentId}`), { method: 'DELETE' }).catch(() => undefined)
  })

  it('accepts a comment attached to exactly one asset', async () => {
    const created = await prisma.comment.create({
      data: { projectId: 1, authorId: OWNER, assetId: xorAssetId, body: 'xor asset ok' },
    })
    expect(created.assetId).toBe(xorAssetId)
    expect(created.documentId).toBeNull()
    await prisma.comment.delete({ where: { id: created.id } })
  })

  it('accepts a comment attached to exactly one document', async () => {
    const created = await prisma.comment.create({
      data: { projectId: 1, authorId: OWNER, documentId: xorDocumentId, body: 'xor document ok' },
    })
    expect(created.documentId).toBe(xorDocumentId)
    expect(created.assetId).toBeNull()
    await prisma.comment.delete({ where: { id: created.id } })
  })

  it('rejects a comment without any host entity (both null)', async () => {
    await expect(prisma.comment.create({
      data: { projectId: 1, authorId: OWNER, body: 'sin anfitrión' },
    })).rejects.toThrow()
    const total = await prisma.comment.count({ where: { body: 'sin anfitrión' } })
    expect(total).toBe(0)

    // La causa es el CHECK de la migración (23514), no una validación ajena.
    const cause = await prisma.$executeRaw`INSERT INTO "Comment" ("projectId","authorId","body","createdAt","updatedAt") VALUES (1, 1, 'sin anfitrión raw', NOW(), NOW())`
      .catch((error: unknown) => error)
    const known = cause as { code?: string; meta?: { code?: string; message?: string } }
    expect(known?.code).toBe('P2010')
    expect(known?.meta?.code).toBe('23514')
    expect(known?.meta?.message ?? '').toContain('Comment_host_xor_check')
  })

  it('rejects a comment attached to both an asset and a document', async () => {
    await expect(prisma.comment.create({
      data: { projectId: 1, authorId: OWNER, assetId: xorAssetId, documentId: xorDocumentId, body: 'doble anfitrión' },
    })).rejects.toThrow()
    const total = await prisma.comment.count({ where: { body: 'doble anfitrión' } })
    expect(total).toBe(0)

    const cause = await prisma.$executeRaw`INSERT INTO "Comment" ("projectId","authorId","assetId","documentId","body","createdAt","updatedAt") VALUES (1, 1, ${xorAssetId}, ${xorDocumentId}, 'doble anfitrión raw', NOW(), NOW())`
      .catch((error: unknown) => error)
    const known = cause as { code?: string; meta?: { code?: string; message?: string } }
    expect(known?.code).toBe('P2010')
    expect(known?.meta?.code).toBe('23514')
    expect(known?.meta?.message ?? '').toContain('Comment_host_xor_check')
  })
})
