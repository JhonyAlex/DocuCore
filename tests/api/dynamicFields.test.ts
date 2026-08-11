import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase } from '../helpers/database'

let server: Server | undefined
let baseUrl: string

function api(path: string, options: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, options)
}

describe('dynamic fields API', () => {
  let assetId: number
  let definitionId: number
  let taskId: number
  let planTemplateId: number

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl
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

    const assetResponse = await api('/api/assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: `QA-DYN-${Date.now()}`,
        name: 'Torno test dinámico',
        serialNumber: `SN-DYN-${Date.now()}`,
        installDate: '2025-01-01',
        typeId: 1,
        statusId: 1,
        locationId: 1,
        projectId: 1,
        responsibleId: 1,
        initials: 'TD',
      }),
    })
    assetId = (await assetResponse.json() as { id: number }).id
  }, 120_000)

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()))
    }
  })

  it('rejects dynamic field definitions assigned to invalid asset types', async () => {
    const response = await api('/api/projects/1/dynamic-fields', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fieldName: 'Presión hidrostática',
        groupName: 'Verificaciones',
        fieldType: 'NUMBER',
        required: true,
        assetTypeIds: [999],
        options: [],
      }),
    })
    expect(response.status).toBe(400)
  })

  it('creates date field definitions and calculates scheduled occurrences', async () => {
    const definitionResponse = await api('/api/projects/1/dynamic-fields', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fieldName: `Verificación estanqueidad ${Date.now()}`,
        groupName: 'Pruebas',
        fieldType: 'DATE',
        required: false,
        assetTypeIds: [1],
        options: [],
      }),
    })
    expect(definitionResponse.status).toBe(201)
    definitionId = (await definitionResponse.json() as { id: number }).id

    const updateResponse = await api(`/api/assets/${assetId}/dynamic-fields`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        values: [{
          definitionId,
          value: { date: '2026-09-15', periodicity: 'Trimestral', periodicityMode: 'Calendario' },
        }],
      }),
    })
    expect(updateResponse.status).toBe(200)
    const asset = await updateResponse.json() as { dynamicFields: Array<{ definitionId: number; value: unknown }>; nextEvents: Array<{ source: string; date: string }> }
    expect(asset.dynamicFields).toEqual(expect.arrayContaining([expect.objectContaining({ definitionId, value: '2026-09-15' })]))
    expect(asset.nextEvents).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'dynamic-field', date: '2026-09-15T00:00:00.000Z' })]))

    const complete = await api(`/api/assets/${assetId}/dynamic-fields/${definitionId}/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ performedDate: '2026-09-20' }) })
    expect(complete.status).toBe(200)
    const completed = await complete.json() as { dynamicFields: Array<{ definitionId: number; dateSchedule: { date: string } }>; nextEvents: Array<{ source: string; date: string }> }
    expect(completed.dynamicFields).toEqual(expect.arrayContaining([expect.objectContaining({ definitionId, dateSchedule: expect.objectContaining({ date: '2026-12-15' }) })]))
    expect(completed.nextEvents).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'dynamic-field', date: '2026-12-15T00:00:00.000Z' })]))
    const history = await api(`/api/assets/${assetId}/events`)
    expect(await history.json()).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'dynamic-date', completedAt: expect.any(String) })]))
  })

  it('protects the type of definitions that already have values', async () => {
    const response = await api(`/api/projects/1/dynamic-fields/${definitionId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fieldType: 'TEXT' }) })
    expect(response.status).toBe(409)
  })

  it('snapshots preventive tasks from standalone templates, completes an execution and creates the next one', async () => {
    const taskResponse = await api('/api/projects/1/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: `QA-TASK-${Date.now()}`, name: 'Verificar resguardo de seguridad' }) })
    expect(taskResponse.status).toBe(201)
    taskId = (await taskResponse.json() as { id: number }).id

    const planTemplateResponse = await api('/api/projects/1/preventive-plans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Plan QA ${Date.now()}`, description: 'Plan de prueba', periodicity: 'Mensual', periodicityMode: 'Calendario', taskIds: [taskId], assetTypeIds: [1] }) })
    expect(planTemplateResponse.status).toBe(201)
    planTemplateId = (await planTemplateResponse.json() as { id: number }).id

    const planResponse = await api(`/api/assets/${assetId}/preventives`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ planId: planTemplateId, scheduledDate: '2026-10-01' }) })
    expect(planResponse.status).toBe(201)
    const planAsset = await planResponse.json() as { preventivePlans: Array<{ executions: Array<{ id: number; tasks: Array<{ id: number }> }> }> }
    const execution = planAsset.preventivePlans[0].executions[0]
    const taskCompletion = await api(`/api/assets/${assetId}/preventives/executions/${execution.id}/tasks/${execution.tasks[0].id}/complete`, { method: 'POST' })
    expect(taskCompletion.status).toBe(200)
    const completion = await api(`/api/assets/${assetId}/events/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: 'preventive', id: execution.id, performedDate: '2026-10-02' }) })
    expect(completion.status).toBe(200)
    const history = await api(`/api/assets/${assetId}/events`)
    expect(await history.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'preventive', id: execution.id, completedAt: expect.any(String), progress: { completed: 1, total: 1 } }),
      expect.objectContaining({ source: 'preventive', date: '2026-11-01T00:00:00.000Z', completedAt: null }),
    ]))
  })
})
