import { createElement, type ReactElement } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEntityComments } from '@/hooks/useEntityComments'
import type { ApiComment } from '@/lib/api'

// COM-01: una mutación (create/update/remove) iniciada sobre una entidad no
// debe aplicarse si, mientras la petición estaba en vuelo, el hook pasó a
// otra entidad (projectId/entityType/entityId) o se desmontó. El contrato:
// la mutación devuelve `false` (el panel no actualiza contadores) y el
// estado de la entidad nueva permanece intacto.

type HarnessProps = { projectId: number; entityType: 'asset' | 'document'; entityId: number }
type Deferred = { resolve: (value: unknown) => void; reject: (reason: unknown) => void }

let api: ReturnType<typeof useEntityComments> | undefined
let pendingWrites: Array<{ method: string; url: string; deferred: Deferred }> = []

function Harness(props: HarnessProps) {
  api = useEntityComments(props.projectId, props.entityType, props.entityId)
  return null
}

function okJson(body: unknown): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return { ok: true, status: 200, json: async () => body }
}

function comment(id: number, documentId: number | null, body: string): ApiComment {
  return {
    id,
    projectId: 1,
    authorId: 1,
    assetId: documentId === null ? id : null,
    documentId,
    body,
    createdAt: '2026-09-07T10:00:00.000Z',
    updatedAt: '2026-09-07T10:00:00.000Z',
    edited: false,
    author: { id: 1, name: 'María Fernández', initials: 'MF', color: 'brand' },
    canEdit: true,
    canDelete: true,
  }
}

function installFetchStub() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    if (url.endsWith('/comments') || url.includes('/comments?')) {
      if (method === 'GET') {
        // Primera página (sin cursor) y páginas posteriores: lista vacía.
        return okJson({ data: [], hasMore: false, nextCursor: null })
      }
      // POST: petición controlada que el test resuelve cuando quiere.
      return new Promise((resolve, reject) => {
        pendingWrites.push({ method, url, deferred: { resolve, reject } })
      })
    }
    if (url.includes('/comments/')) {
      // PATCH/DELETE: petición controlada.
      return new Promise((resolve, reject) => {
        pendingWrites.push({ method, url, deferred: { resolve, reject } })
      })
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`)
  }))
}

function renderHarness(props: HarnessProps): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | undefined
  act(() => {
    renderer = TestRenderer.create(createElement(Harness, props) as ReactElement)
  })
  return renderer!
}

function flushMicrotasks(): Promise<void> {
  return act(async () => {})
}

beforeEach(() => {
  api = undefined
  pendingWrites = []
  installFetchStub()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useEntityComments mutation guards', () => {
  it('applies a create when the entity did not change', async () => {
    const renderer = renderHarness({ projectId: 1, entityType: 'document', entityId: 11 })
    await flushMicrotasks()
    let result = false
    act(() => {
      void api!.create('nota de la 11').then((ok) => { result = ok })
    })
    expect(pendingWrites).toHaveLength(1)
    pendingWrites[0]!.deferred.resolve(okJson(comment(101, 11, 'nota de la 11')))
    await flushMicrotasks()
    expect(result).toBe(true)
    expect(api!.comments.map((item) => item.id)).toEqual([101])
    renderer.unmount()
  })

  it('discards a late create after the entity changed', async () => {
    const renderer = renderHarness({ projectId: 1, entityType: 'document', entityId: 11 })
    await flushMicrotasks()

    let result: boolean | null = null
    act(() => {
      void api!.create('nota tardía de la 11').then((ok) => { result = ok })
    })
    expect(pendingWrites).toHaveLength(1)

    // El mismo hook pasa a otro documento mientras el POST está en vuelo.
    act(() => {
      renderer.update(createElement(Harness, { projectId: 1, entityType: 'document', entityId: 22 }) as ReactElement)
    })
    await flushMicrotasks()

    // Llega la respuesta de la entidad anterior: debe descartarse.
    pendingWrites[0]!.deferred.resolve(okJson(comment(101, 11, 'nota tardía de la 11')))
    await flushMicrotasks()
    expect(result).toBe(false)
    expect(api!.comments).toEqual([])
    expect(api!.createError).toBeNull()
    renderer.unmount()
  })

  it('discards a late update after the entity changed', async () => {
    const renderer = renderHarness({ projectId: 1, entityType: 'document', entityId: 11 })
    await flushMicrotasks()

    let updateResult: boolean | null = null
    act(() => {
      void api!.update(55, 'edición tardía').then((ok) => { updateResult = ok })
    })
    expect(pendingWrites).toHaveLength(1)

    act(() => {
      renderer.update(createElement(Harness, { projectId: 1, entityType: 'document', entityId: 22 }) as ReactElement)
    })
    await flushMicrotasks()

    pendingWrites[0]!.deferred.resolve(okJson(comment(55, 11, 'edición tardía')))
    await flushMicrotasks()
    expect(updateResult).toBe(false)
    expect(api!.comments).toEqual([])
    expect(api!.updatingId).toBeNull()
    expect(api!.updateError).toBeNull()
    renderer.unmount()
  })

  it('discards a late delete after the entity changed', async () => {
    const renderer = renderHarness({ projectId: 1, entityType: 'document', entityId: 11 })
    await flushMicrotasks()

    let deleteResult: boolean | null = null
    act(() => {
      void api!.remove(55).then((ok) => { deleteResult = ok })
    })
    expect(pendingWrites).toHaveLength(1)

    act(() => {
      renderer.update(createElement(Harness, { projectId: 1, entityType: 'document', entityId: 22 }) as ReactElement)
    })
    await flushMicrotasks()

    pendingWrites[0]!.deferred.resolve({ ok: true, status: 204, json: async () => undefined })
    await flushMicrotasks()
    expect(deleteResult).toBe(false)
    expect(api!.comments).toEqual([])
    expect(api!.deletingId).toBeNull()
    expect(api!.deleteError).toBeNull()
    renderer.unmount()
  })

  it('resets operation flags when the entity changes so the new entity can act', async () => {
    const renderer = renderHarness({ projectId: 1, entityType: 'asset', entityId: 7 })
    await flushMicrotasks()

    act(() => {
      void api!.create('en vuelo sobre el activo 7')
    })
    expect(api!.creating).toBe(true)
    expect(pendingWrites).toHaveLength(1)

    act(() => {
      renderer.update(createElement(Harness, { projectId: 1, entityType: 'asset', entityId: 8 }) as ReactElement)
    })
    await flushMicrotasks()
    // La nueva entidad puede operar aunque la mutación antigua siga en vuelo.
    expect(api!.creating).toBe(false)

    pendingWrites[0]!.deferred.resolve(okJson(comment(202, 7, 'en vuelo sobre el activo 7')))
    await flushMicrotasks()
    expect(api!.comments).toEqual([])
    renderer.unmount()
  })
})
