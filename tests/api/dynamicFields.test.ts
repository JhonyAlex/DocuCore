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
  let secondTaskId: number
  let planTemplateId: number
  let universalPlanId: number
  let assignedPlanId: number

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

  it('keeps the canonical seed free of the retired dynamic maintenance duplicate', async () => {
    const assets = await api('/api/assets?search=CNC-05&limit=10')
    expect(assets.status).toBe(200)
    const payload = await assets.json() as { data: Array<{ id: number; dynamicFields: Array<{ fieldName: string }> }> }
    const cnc = payload.data.find((asset) => asset.id > 0)
    expect(cnc?.dynamicFields.some((field) => field.fieldName === 'Próximo mantenimiento')).toBe(false)
    const history = await api(`/api/assets/${cnc?.id}/events`)
    expect(await history.json()).not.toEqual(expect.arrayContaining([expect.objectContaining({ source: 'event', title: 'Mant. preventivo' })]))
  })

  it('rejects the retired hasPreventive write contract', async () => {
    const response = await api(`/api/assets/${assetId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hasPreventive: true }),
    })
    expect(response.status).toBe(400)
  })

  it('accepts dynamic characteristics only through the unified asset PUT contract', async () => {
    const response = await api(`/api/assets/${assetId}/dynamic-fields`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ values: [] }),
    })
    expect(response.status).toBe(404)
  })

  it('keeps legitimate dynamic dates and their recurrence working', async () => {
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

    const updateResponse = await api(`/api/assets/${assetId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dynamicFields: [{
          definitionId,
          value: { date: '2026-09-15', periodicity: 'Trimestral', periodicityMode: 'Calendario' },
        }],
      }),
    })
    expect(updateResponse.status).toBe(200)
    const asset = await updateResponse.json() as { dynamicFields: Array<{ definitionId: number; value: unknown }>; nextEvents: Array<{ source: string; date: string }> }
    expect(asset.dynamicFields).toEqual(expect.arrayContaining([expect.objectContaining({ definitionId, value: '2026-09-15' })]))
    expect(asset.nextEvents).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'dynamic-date', date: '2026-09-15T00:00:00.000Z' })]))

    const complete = await api(`/api/assets/${assetId}/dynamic-fields/${definitionId}/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ performedDate: '2026-09-20' }) })
    expect(complete.status).toBe(200)
    const completed = await complete.json() as { dynamicFields: Array<{ definitionId: number; dateSchedule: { date: string } }>; nextEvents: Array<{ source: string; date: string }> }
    expect(completed.dynamicFields).toEqual(expect.arrayContaining([expect.objectContaining({ definitionId, dateSchedule: expect.objectContaining({ date: '2026-12-15' }) })]))
    expect(completed.nextEvents).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'dynamic-date', date: '2026-12-15T00:00:00.000Z' })]))
    const history = await api(`/api/assets/${assetId}/events`)
    expect(await history.json()).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'dynamic-date', completedAt: expect.any(String) })]))
  })

  it('protects the type of definitions that already have values', async () => {
    const response = await api(`/api/projects/1/dynamic-fields/${definitionId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fieldType: 'TEXT' }) })
    expect(response.status).toBe(409)
  })

  it('rejects creating preventive plans without tasks', async () => {
    const response = await api('/api/projects/1/preventive-plans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Plan vacio', periodicity: 'Mensual', periodicityMode: 'Calendario', taskIds: [] }),
    })
    expect(response.status).toBe(400)
  })

  it('completes all pending preventive tasks in one operation and keeps execution completion separate', async () => {
    const taskResponse = await api('/api/projects/1/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: `QA-TASK-${Date.now()}`, name: 'Verificar resguardo de seguridad' }) })
    expect(taskResponse.status).toBe(201)
    taskId = (await taskResponse.json() as { id: number }).id

    const secondTaskResponse = await api('/api/projects/1/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: `QA-TASK-SECOND-${Date.now()}`, name: 'Comprobar resguardo y señalización' }) })
    expect(secondTaskResponse.status).toBe(201)
    secondTaskId = (await secondTaskResponse.json() as { id: number }).id

    const planTemplateResponse = await api('/api/projects/1/preventive-plans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Plan QA ${Date.now()}`, description: 'Plan de prueba', periodicity: 'Mensual', periodicityMode: 'Calendario', taskIds: [taskId, secondTaskId], assetTypeIds: [1] }) })
    expect(planTemplateResponse.status).toBe(201)
    planTemplateId = (await planTemplateResponse.json() as { id: number }).id

    const universalResponse = await api('/api/projects/1/preventive-plans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Plan Universal ${Date.now()}`, periodicity: 'Trimestral', periodicityMode: 'Calendario', taskIds: [taskId], assetTypeIds: [] }) })
    expect(universalResponse.status).toBe(201)
    universalPlanId = (await universalResponse.json() as { id: number }).id

    const planResponse = await api(`/api/assets/${assetId}/preventives`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ planId: planTemplateId, scheduledDate: '2026-10-01' }) })
    expect(planResponse.status).toBe(201)
    const planAsset = await planResponse.json() as { preventivePlans: Array<{ id: number; executions: Array<{ id: number; tasks: Array<{ id: number; completedAt: string | null }> }> }> }
    assignedPlanId = planAsset.preventivePlans[0].id
    const execution = planAsset.preventivePlans[0].executions[0]

    // Duplicate assignment check (409)
    const dupResponse = await api(`/api/assets/${assetId}/preventives`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ planId: planTemplateId, scheduledDate: '2026-10-01' }) })
    expect(dupResponse.status).toBe(409)

    // A task can be completed individually; the bulk endpoint touches only the
    // remaining pending task in one transactional request.
    const taskCompletion = await api(`/api/assets/${assetId}/preventives/executions/${execution.id}/tasks/${execution.tasks[0].id}/complete`, { method: 'POST' })
    expect(taskCompletion.status).toBe(200)
    const completeAll = await api(`/api/assets/${assetId}/preventives/executions/${execution.id}/tasks/complete`, { method: 'POST' })
    expect(completeAll.status).toBe(200)
    const afterBulk = await completeAll.json() as { preventivePlans: Array<{ executions: Array<{ id: number; tasks: Array<{ completedAt: string | null }> }> }> }
    const completedExecution = afterBulk.preventivePlans.flatMap((plan) => plan.executions).find((candidate) => candidate.id === execution.id)
    expect(completedExecution?.tasks.every((task) => task.completedAt !== null)).toBe(true)
    const completion = await api(`/api/assets/${assetId}/events/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: 'preventive', id: execution.id, performedDate: '2026-10-02' }) })
    expect(completion.status).toBe(200)
    const history = await api(`/api/assets/${assetId}/events`)
    expect(await history.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'preventive', id: execution.id, completedAt: expect.any(String), progress: { completed: 2, total: 2 } }),
      expect.objectContaining({ source: 'preventive', date: '2026-11-01T00:00:00.000Z', completedAt: null }),
    ]))
  })

  it('updates execution scheduled date via PATCH endpoint', async () => {
    const patchRes = await api(`/api/assets/${assetId}/preventives/${assignedPlanId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scheduledDate: '2026-11-15' }),
    })
    expect(patchRes.status).toBe(200)
    const updated = await patchRes.json() as { nextEvents: Array<{ source: string; date: string }> }
    expect(updated.nextEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'preventive', date: '2026-11-15T00:00:00.000Z' }),
    ]))
  })

  it('enforces asset type compatibility on assignment and asset update', async () => {
    const incompatiblePlan = await api('/api/projects/1/preventive-plans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: `Plan Exclusivo Tipo 2`, periodicity: 'Anual', periodicityMode: 'Calendario', taskIds: [taskId], assetTypeIds: [2] }),
    })
    const incompatibleId = (await incompatiblePlan.json() as { id: number }).id

    // Asset (typeId=1) should reject assignment of type 2 template
    const assignRes = await api(`/api/assets/${assetId}/preventives`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ planId: incompatibleId, scheduledDate: '2026-12-01' }) })
    expect(assignRes.status).toBe(400)

    // Universal plan (assetTypeIds=[]) can be assigned to any type
    const univAssignRes = await api(`/api/assets/${assetId}/preventives`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ planId: universalPlanId, scheduledDate: '2026-12-01' }) })
    expect(univAssignRes.status).toBe(201)

    // Changing asset type to type 2 should be rejected because active plan is tied to type 1
    const updateTypeRes = await api(`/api/assets/${assetId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ typeId: 2 }) })
    expect(updateTypeRes.status).toBe(400)
  })

  it('unassigns a preventive plan and excludes its pending execution while keeping completed history', async () => {
    // Unassign universal plan first
    const activePlansRes = await api(`/api/assets/${assetId}`)
    const activeAsset = await activePlansRes.json() as { preventivePlans: Array<{ id: number; planId: number }> }
    const univAssigned = activeAsset.preventivePlans.find((p) => p.planId === universalPlanId)!
    await api(`/api/assets/${assetId}/preventives/${univAssigned.id}`, { method: 'DELETE' })

    // Unassign initial plan
    const unassignRes = await api(`/api/assets/${assetId}/preventives/${assignedPlanId}`, { method: 'DELETE' })
    expect(unassignRes.status).toBe(200)
    const unassignedAsset = await unassignRes.json() as { nextEvents: Array<{ source: string }> }
    expect(unassignedAsset.nextEvents.some((e) => e.source === 'preventive')).toBe(false)

    // Completed execution remains in history, uncompleted pending execution does not
    const historyRes = await api(`/api/assets/${assetId}/events`)
    const history = await historyRes.json() as Array<{ source: string; completedAt: string | null }>
    expect(history.some((h) => h.source === 'preventive' && h.completedAt !== null)).toBe(true)
    expect(history.some((h) => h.source === 'preventive' && h.completedAt === null)).toBe(false)
  })
})
