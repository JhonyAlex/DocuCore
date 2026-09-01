import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase, projectApiPath } from '../helpers/database'

let server: Server | undefined
let baseUrl: string
let storageDir: string
const createdDocumentIds: number[] = []
const createdAssetIds: number[] = []

const PDF_BYTES = Buffer.from('%PDF-1.4 QA DOMAIN LIFECYCLE BYTES')

async function api(apiPath: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${projectApiPath(apiPath, init)}`, init)
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

async function createTestAsset(code: string, name: string): Promise<number> {
  const response = await api('/api/projects/1/assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      name,
      serialNumber: `SN-${uniqueSuffix()}`,
      typeId: 1,
      statusId: 1,
      locationId: 1,
      projectId: 1,
      responsibleId: 2,
      installDate: '2025-01-01',
      initials: 'QA',
    }),
  })
  if (response.status !== 201) {
    const err = await response.text()
    throw new Error(`createTestAsset failed: ${response.status} - ${err}`)
  }
  const created = (await response.json()) as { id: number }
  createdAssetIds.push(created.id)
  return created.id
}

async function createDocumentWithAssets(input: {
  name: string
  issueDate: string
  expiryDate?: string | null
  assetIds?: number[]
}): Promise<number> {
  const form = new FormData()
  form.set('name', input.name)
  form.set('type', 'Certificado')
  form.set('projectId', '1')
  form.set('issueDate', input.issueDate)
  if (input.expiryDate) form.set('expiryDate', input.expiryDate)
  if (input.assetIds && input.assetIds.length > 0) {
    form.set('assetIds', JSON.stringify(input.assetIds))
  }
  form.append('file', new Blob([new Uint8Array(PDF_BYTES)], { type: 'application/pdf' }), 'cert.pdf')
  const response = await api('/api/documents', { method: 'POST', body: form })
  expect(response.status).toBe(201)
  const created = (await response.json()) as { id: number }
  createdDocumentIds.push(created.id)
  return created.id
}

async function uploadNewVersion(id: number, issueDate: string, expiryDate?: string): Promise<Response> {
  const form = new FormData()
  form.set('issueDate', issueDate)
  if (expiryDate) form.set('expiryDate', expiryDate)
  form.append('file', new Blob([new Uint8Array(PDF_BYTES)], { type: 'application/pdf' }), 'cert-v2.pdf')
  return api(`/api/documents/${id}/versions`, { method: 'POST', body: form })
}

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl
  storageDir = await mkdtemp(path.join(tmpdir(), 'docucore-domain-lifecycle-'))
  process.env.DOCUMENT_STORAGE_PATH = storageDir
  process.env.DOCUCORE_NOW = '2026-09-01T12:00:00.000Z'

  await ensureTestDatabase()
  const { default: app } = await import('../../server/index')
  await new Promise<void>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => {
      const address = instance.address() as AddressInfo
      baseUrl = `http://127.0.0.1:${address.port}`
      resolve()
    })
    server = instance
  })
})

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  if (storageDir) await rm(storageDir, { recursive: true, force: true })
})

describe('Domain Lifecycle: Documents ↔ Assets ↔ Events ↔ Calendar', () => {
  it('Case 1: Expired Document cannot be manually completed and exposes Ver documento action', async () => {
    const assetId = await createTestAsset(`AST-EXP-${uniqueSuffix()}`, 'Activo con doc vencido')
    const docId = await createDocumentWithAssets({
      name: `Certificado Vencido ${uniqueSuffix()}`,
      issueDate: '2025-01-01',
      expiryDate: '2026-08-01', // Vencido relative to 2026-09-01
      assetIds: [assetId],
    })

    // Check Document detail
    const docRes = await api(`/api/documents/${docId}`)
    expect(docRes.status).toBe(200)
    const docData = await docRes.json()
    expect(docData.status).toBe('Vencido')

    // Check Asset derived events
    const assetRes = await api(`/api/assets/${assetId}`)
    expect(assetRes.status).toBe(200)
    const assetData = await assetRes.json()
    const docEvent = assetData.nextEvents.find((e: { id: string }) => e.id === `document:${docId}`)
    expect(docEvent).toBeDefined()
    expect(docEvent.urgency).toBe('red')
    expect(docEvent.source).toBe('document')
    expect(docEvent.isCompletable).toBe(false)
    expect(docEvent.primaryAction).toBe('view_document')

    // Attempt to manually complete the document event -> must be rejected with HTTP 400
    const completeRes = await api(`/api/assets/${assetId}/events/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'document',
        id: docId,
        performedDate: '2026-09-01',
      }),
    })
    expect(completeRes.status).toBe(400)
    const completeErr = await completeRes.json()
    expect(completeErr.error).toContain('Los vencimientos documentales no se completan manualmente')

    // Check Calendar
    const calRes = await api('/api/calendar?from=2026-08-01&to=2026-09-30')
    expect(calRes.status).toBe(200)
    const calData = await calRes.json()
    const calOccurrence = calData.events.find((e: { source: string; sourceId: number }) => e.source === 'document' && e.sourceId === docId)
    expect(calOccurrence).toBeDefined()
    expect(calOccurrence.canComplete).toBe(false)
    expect(calOccurrence.status).toBe('overdue')

    // Ver documento / preview works
    const previewRes = await api(`/api/documents/${docId}/preview`)
    expect(previewRes.status).toBe(200)
    expect(previewRes.headers.get('content-type')).toContain('application/pdf')
  })

  it('Case 2: Uploading v2 with future expiry renews validity, updates asset events and keeps v1 in history', async () => {
    const assetId = await createTestAsset(`AST-RENEW-${uniqueSuffix()}`, 'Activo a renovar')
    const docId = await createDocumentWithAssets({
      name: `Certificado a Renovar ${uniqueSuffix()}`,
      issueDate: '2025-01-01',
      expiryDate: '2026-08-01', // Vencido
      assetIds: [assetId],
    })

    // Upload v2 with future expiry date
    const v2Res = await uploadNewVersion(docId, '2026-09-01', '2027-09-01')
    expect(v2Res.status).toBe(201)
    const v2Data = await v2Res.json()
    expect(v2Data.currentVersion.version).toBe(2)
    expect(v2Data.status).toBe('Vigente')

    // Check document history has both v1 and v2
    const docRes = await api(`/api/documents/${docId}`)
    const docData = await docRes.json()
    expect(docData.versions).toHaveLength(2)
    expect(docData.versions[0].version).toBe(2)
    expect(docData.versions[1].version).toBe(1)

    // Check asset events updated to v2 expiry date
    const assetRes = await api(`/api/assets/${assetId}`)
    const assetData = await assetRes.json()
    const docEvent = assetData.nextEvents.find((e: { id: string }) => e.id === `document:${docId}`)
    expect(docEvent).toBeDefined()
    expect(docEvent.date).toBe('2027-09-01T00:00:00.000Z')
    expect(docEvent.urgency).toBe('slate') // > 30 days away

    // Check calendar updated
    const calRes = await api('/api/calendar?from=2027-09-01&to=2027-09-30')
    const calData = await calRes.json()
    const calOccurrence = calData.events.find((e: { source: string; sourceId: number }) => e.source === 'document' && e.sourceId === docId)
    expect(calOccurrence).toBeDefined()
    expect(calOccurrence.date).toBe('2027-09-01')
    expect(calOccurrence.status).not.toBe('overdue')
  })

  it('Case 3: Multi-asset document updates all 3 assets when v2 is uploaded without duplication', async () => {
    const assetA = await createTestAsset(`AST-M1-${uniqueSuffix()}`, 'Activo Multi 1')
    const assetB = await createTestAsset(`AST-M2-${uniqueSuffix()}`, 'Activo Multi 2')
    const assetC = await createTestAsset(`AST-M3-${uniqueSuffix()}`, 'Activo Multi 3')

    const docId = await createDocumentWithAssets({
      name: `Norma Compartida ${uniqueSuffix()}`,
      issueDate: '2025-01-01',
      expiryDate: '2026-08-15', // Vencido
      assetIds: [assetA, assetB, assetC],
    })

    // Upload single v2
    const v2Res = await uploadNewVersion(docId, '2026-09-01', '2027-03-01')
    expect(v2Res.status).toBe(201)

    // Verify all 3 assets reflect v2 with no duplicate documents
    for (const id of [assetA, assetB, assetC]) {
      const res = await api(`/api/assets/${id}`)
      const data = await res.json()
      const docs = data.documents.filter((d: { id: number }) => d.id === docId)
      expect(docs).toHaveLength(1)
      expect(docs[0].currentVersion.version).toBe(2)
      expect(docs[0].status).toBe('Vigente')

      const events = data.nextEvents.filter((e: { id: string }) => e.id === `document:${docId}`)
      expect(events).toHaveLength(1)
      expect(events[0].date).toBe('2027-03-01T00:00:00.000Z')
    }
  })

  it('Case 4: Document without expiry has Sin vencimiento status and generates no phantom calendar events', async () => {
    const assetId = await createTestAsset(`AST-NOEXP-${uniqueSuffix()}`, 'Activo sin vencimiento')
    const docId = await createDocumentWithAssets({
      name: `Manual de Operaciones ${uniqueSuffix()}`,
      issueDate: '2026-01-01',
      expiryDate: null,
      assetIds: [assetId],
    })

    const docRes = await api(`/api/documents/${docId}`)
    const docData = await docRes.json()
    expect(docData.status).toBe('Sin vencimiento')

    const assetRes = await api(`/api/assets/${assetId}`)
    const assetData = await assetRes.json()
    const docEvent = assetData.nextEvents.find((e: { id: string }) => e.id === `document:${docId}`)
    expect(docEvent).toBeUndefined()

    const calRes = await api('/api/calendar')
    const calData = await calRes.json()
    const calOccurrence = calData.events.find((e: { source: string; sourceId: number }) => e.source === 'document' && e.sourceId === docId)
    expect(calOccurrence).toBeUndefined()
  })

  it('Case 5: Disassociating an asset from document removes alert only from that asset', async () => {
    const asset1 = await createTestAsset(`AST-DIS1-${uniqueSuffix()}`, 'Activo Mantener')
    const asset2 = await createTestAsset(`AST-DIS2-${uniqueSuffix()}`, 'Activo Retirar')

    const docId = await createDocumentWithAssets({
      name: `Certificado Conjunto ${uniqueSuffix()}`,
      issueDate: '2025-01-01',
      expiryDate: '2026-08-20', // Vencido
      assetIds: [asset1, asset2],
    })

    // Disassociate asset2 (keep only asset1)
    const patchRes = await api(`/api/documents/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assetIds: [asset1],
      }),
    })
    expect(patchRes.status).toBe(200)

    // Asset1 still has the event
    const res1 = await api(`/api/assets/${asset1}`)
    const data1 = await res1.json()
    expect(data1.nextEvents.some((e: { id: string }) => e.id === `document:${docId}`)).toBe(true)

    // Asset2 has NO event from this document
    const res2 = await api(`/api/assets/${asset2}`)
    const data2 = await res2.json()
    expect(data2.nextEvents.some((e: { id: string }) => e.id === `document:${docId}`)).toBe(false)
  })

  it('Case 6: Operational manual events CAN still be completed via /events/complete', async () => {
    const assetId = await createTestAsset(`AST-MAN-${uniqueSuffix()}`, 'Activo con evento manual')
    const createEventRes = await api('/api/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `Revisión manual ${uniqueSuffix()}`,
        date: '2026-09-05',
        category: 'review',
        assetId,
        projectId: 1,
      }),
    })
    expect(createEventRes.status).toBe(201)
    const eventData = (await createEventRes.json()) as { id: string; sourceId: number }

    // Complete the event
    const completeRes = await api(`/api/assets/${assetId}/events/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'event',
        id: eventData.sourceId,
        performedDate: '2026-09-05',
      }),
    })
    expect(completeRes.status).toBe(200)

    // Verify it is completed and no longer in nextEvents
    const assetRes = await api(`/api/assets/${assetId}`)
    const assetData = await assetRes.json()
    expect(assetData.nextEvents.some((e: { id: string }) => e.id === `event:${eventData.sourceId}`)).toBe(false)
  })

  it('Case 7: Legacy AssetEventAcknowledgement records for document:* remain inert and do NOT hide active document events', async () => {
    const assetId = await createTestAsset(`AST-LEG-${uniqueSuffix()}`, 'Activo con legacy ack')
    const docId = await createDocumentWithAssets({
      name: `Certificado con Legacy Ack ${uniqueSuffix()}`,
      issueDate: '2025-01-01',
      expiryDate: '2026-08-25', // Vencido
      assetIds: [assetId],
    })

    // Directly insert a legacy acknowledgement in PostgreSQL for this document
    const { default: prisma } = await import('../../server/lib/prisma')
    await prisma.assetEventAcknowledgement.create({
      data: {
        assetId,
        sourceKey: `document:${docId}`,
        completedDate: new Date('2026-08-25T00:00:00.000Z'),
      },
    })

    // Verify the derived event is STILL visible and NOT filtered out
    const assetRes = await api(`/api/assets/${assetId}`)
    const assetData = await assetRes.json()
    const docEvent = assetData.nextEvents.find((e: { id: string }) => e.id === `document:${docId}`)
    expect(docEvent).toBeDefined()
    expect(docEvent.source).toBe('document')
    expect(docEvent.isCompletable).toBe(false)
  })
})

