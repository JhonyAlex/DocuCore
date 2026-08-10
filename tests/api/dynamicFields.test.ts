import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase } from '../helpers/database'

let server: Server | undefined
let baseUrl: string
let definitionId = 0
let preventiveDefinitionId = 0
let taskId = 0
let assetId = 0

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, init)
}

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl
  await ensureTestDatabase()
  const { default: app } = await import('../../server/index')
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => { baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`; resolve() })
  })
})

afterAll(async () => {
  if (assetId) {
    await api(`/api/assets/${assetId}`, { method: 'DELETE' }).catch(() => undefined)
    await api(`/api/assets/${assetId}/purge`, { method: 'POST' }).catch(() => undefined)
  }
  if (definitionId) await api(`/api/projects/1/dynamic-fields/${definitionId}`, { method: 'DELETE' }).catch(() => undefined)
  if (preventiveDefinitionId) await api(`/api/projects/1/dynamic-fields/${preventiveDefinitionId}`, { method: 'DELETE' }).catch(() => undefined)
  if (taskId) await api(`/api/projects/1/tasks/${taskId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ isActive: false }) }).catch(() => undefined)
  await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()))
})

describe('dynamic fields API', () => {
  it('creates a project-scoped date characteristic without recurrence', async () => {
    const response = await api('/api/projects/1/dynamic-fields', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fieldName: `QA próxima revisión ${Date.now()}`, groupName: 'QA', fieldType: 'DATE', required: true, assetTypeIds: [1], options: [] }),
    })
    expect(response.status).toBe(201)
    const definition = await response.json() as { id: number; assetTypeIds: number[] }
    definitionId = definition.id
    expect(definition.assetTypeIds).toEqual([1])

    const otherProject = await api('/api/projects/2/dynamic-fields?includeInactive=true')
    expect((await otherProject.json() as Array<{ id: number }>).some((field) => field.id === definitionId)).toBe(false)
  })

  it('stores recurrence on the asset, retains the completed occurrence and advances it', async () => {
    const create = await api('/api/assets', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: `QA-DYN-${Date.now()}`, name: 'Activo dinámico QA', serialNumber: `QA-DYN-SN-${Date.now()}`, installDate: '2026-08-10', typeId: 1, statusId: 1, locationId: 1, projectId: 1, responsibleId: 1, initials: 'QD', dynamicFields: [{ definitionId, value: { date: '2026-09-15', periodicity: 'Trimestral', periodicityMode: 'Calendario' } }] }),
    })
    expect(create.status).toBe(201)
    const asset = await create.json() as { id: number; dynamicFields: Array<{ definitionId: number; value: string; dateSchedule: { periodicity: string; occurrenceId: number } }>; nextEvents: Array<{ source: string; title: string; date: string }> }
    assetId = asset.id
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

  it('snapshots preventive tasks, completes an execution and creates the next one', async () => {
    const taskResponse = await api('/api/projects/1/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: `QA-TASK-${Date.now()}`, name: 'Verificar resguardo de seguridad' }) })
    expect(taskResponse.status).toBe(201)
    taskId = (await taskResponse.json() as { id: number }).id
    const definitionResponse = await api('/api/projects/1/dynamic-fields', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fieldName: `QA preventivo ${Date.now()}`, groupName: 'QA', fieldType: 'PREVENTIVE', required: false, assetTypeIds: [1], options: [], taskIds: [taskId] }) })
    expect(definitionResponse.status).toBe(201)
    preventiveDefinitionId = (await definitionResponse.json() as { id: number }).id
    const planResponse = await api(`/api/assets/${assetId}/preventives`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ definitionId: preventiveDefinitionId, name: 'Inspección de seguridad QA', scheduledDate: '2026-10-01', periodicity: 'Mensual', periodicityMode: 'Calendario' }) })
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
