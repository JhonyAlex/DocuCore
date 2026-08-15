import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase, projectApiPath } from '../helpers/database'

let server: Server | undefined
let baseUrl = ''
const prisma = new PrismaClient()

function api(path: string, init: RequestInit = {}) { return fetch(`${baseUrl}${projectApiPath(path, init)}`, init) }

describe('PERF-01 bounded data contracts', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DOCUCORE_NOW = '2026-07-15T00:00:00.000Z'
    await ensureTestDatabase()
    const { default: app } = await import('../../server/index')
    await new Promise<void>((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => { server = instance; baseUrl = `http://127.0.0.1:${(instance.address() as AddressInfo).port}`; resolve() })
    })
  }, 120_000)

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()))
    await prisma.$disconnect()
  })

  it('pages documents in the database and validates the maximum request size', async () => {
    const response = await api('/api/documents?projectId=1&limit=20&page=1&status=Vigente')
    expect(response.status).toBe(200)
    const body = await response.json() as { data: Array<Record<string, unknown>>; total: number; totalPages: number }
    expect(body.data.length).toBeLessThanOrEqual(20)
    expect(body.total).toBeGreaterThan(body.data.length)
    expect(body.totalPages).toBeGreaterThan(1)
    expect(body.data.every((row) => row.status === 'Vigente' && !('versions' in row))).toBe(true)
    expect((await api('/api/documents?limit=101')).status).toBe(400)
  })

  it('keeps asset rows light and location detail as a bounded preview', async () => {
    const assets = await (await api('/api/assets?projectId=1&limit=20')).json() as { data: Array<Record<string, unknown>> }
    expect(assets.data).toHaveLength(20)
    expect(assets.data.every((row) => !('documents' in row) && !('dynamicFields' in row) && !('preventivePlans' in row))).toBe(true)
    const locations = await (await api('/api/locations')).json() as { locations: Array<{ id: number }> }
    const locationId = locations.locations[0]!.id
    const detail = await (await api(`/api/locations/${locationId}`)).json() as { assets: unknown[] }
    expect(detail.assets.length).toBeLessThanOrEqual(3)
    const page = await (await api(`/api/locations/${locationId}/assets?limit=2&page=1`)).json() as { data: unknown[] }
    expect(page.data.length).toBeLessThanOrEqual(2)
  })

  it('limits abusive calendar ranges and plan asset discovery', async () => {
    expect((await api('/api/calendar?projectId=1&from=2026-01-01&to=2026-05-01')).status).toBe(400)
    const plans = await (await api('/api/floor-plans?projectId=1')).json() as { data: Array<{ id: number }> }
    const planId = plans.data[0]!.id
    const assets = await (await api(`/api/floor-plans/${planId}/assets?limit=100`)).json() as { data: unknown[] }
    expect(assets.data.length).toBeLessThanOrEqual(50)
  })

  it('does not materialize thousands of completed occurrences or preventive executions in an asset list row', async () => {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
    const created = await api('/api/assets', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: `PERF-HISTORY-${stamp}`, name: `Activo con historial ${stamp}`, serialNumber: `PERF-SN-${stamp}`, installDate: '2026-01-01', typeId: 1, statusId: 1, locationId: 1, projectId: 1, responsibleId: 1, initials: 'PH' }),
    })
    expect(created.status).toBe(201)
    const asset = await created.json() as { id: number }
    let definitionId: number | null = null
    try {
      const definition = await prisma.dynamicFieldDefinition.create({ data: { projectId: 1, key: `perf_history_${stamp}`, fieldName: 'Próxima inspección PERF', groupName: 'PERF', fieldType: 'DATE' } })
      definitionId = definition.id
      await prisma.assetDynamicFieldValue.create({ data: { assetId: asset.id, definitionId: definition.id, dateValue: new Date('2026-07-20') } })
      const schedule = await prisma.assetDateSchedule.create({ data: { assetId: asset.id, definitionId: definition.id, isActive: true } })
      const assignment = await prisma.assetPreventivePlan.create({ data: { assetId: asset.id, name: 'Preventivo PERF', periodicity: 'Anual', periodicityMode: 'Calendario', isActive: true } })
      const completedDateOccurrences = Array.from({ length: 1_500 }, (_, index) => ({ scheduleId: schedule.id, scheduledDate: new Date(`2020-01-${String(index % 28 + 1).padStart(2, '0')}`), completedAt: new Date('2020-02-01'), completedDate: new Date('2020-02-01') }))
      const completedPreventives = Array.from({ length: 1_500 }, (_, index) => ({ planId: assignment.id, scheduledDate: new Date(`2020-03-${String(index % 28 + 1).padStart(2, '0')}`), completedAt: new Date('2020-04-01'), completedDate: new Date('2020-04-01') }))
      await prisma.assetDateOccurrence.createMany({ data: completedDateOccurrences })
      await prisma.preventiveExecution.createMany({ data: completedPreventives })
      await prisma.assetDateOccurrence.create({ data: { scheduleId: schedule.id, scheduledDate: new Date('2026-07-20') } })
      await prisma.preventiveExecution.create({ data: { planId: assignment.id, scheduledDate: new Date('2026-07-22') } })

      const response = await api(`/api/assets?projectId=1&search=${encodeURIComponent(`PERF-HISTORY-${stamp}`)}&limit=20`)
      expect(response.status).toBe(200)
      const bodyText = await response.text()
      const body = JSON.parse(bodyText) as { data: Array<Record<string, unknown>> }
      expect(body.data).toHaveLength(1)
      expect(body.data[0]?.nextEvents).toHaveLength(1)
      expect(body.data[0]).not.toHaveProperty('dateSchedules')
      expect(body.data[0]).not.toHaveProperty('preventivePlans')
      expect(bodyText.length).toBeLessThan(5_000)
    } finally {
      await prisma.asset.delete({ where: { id: asset.id } }).catch(() => undefined)
      if (definitionId !== null) await prisma.dynamicFieldDefinition.delete({ where: { id: definitionId } }).catch(() => undefined)
    }
  })
})
