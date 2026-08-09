import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import app from '../../server/index'

let server: Server
let baseUrl: string

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo
      baseUrl = `http://127.0.0.1:${address.port}`
      resolve()
    })
  })
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
})

describe('items API validation', () => {
  it('keeps health available without requiring a database query', async () => {
    const response = await fetch(`${baseUrl}/api/health`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'ok' })
  })

  it('rejects malformed item payloads through the real router and Zod error middleware', async () => {
    const response = await fetch(`${baseUrl}/api/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '', statusId: 0 }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Validation error',
      details: expect.any(Array),
    })
  })

  it('rejects an invalid item id before accessing Prisma', async () => {
    const response = await fetch(`${baseUrl}/api/items/not-a-number`)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid id' })
  })

  it('rejects an invalid calendar date instead of returning an internal error', async () => {
    const response = await fetch(`${baseUrl}/api/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: 'QA-BAD-DATE',
        name: 'Fecha inválida QA',
        serialNumber: 'QA-BAD',
        installDate: '2026-02-30',
        typeId: 1,
        statusId: 1,
        locationId: 1,
        projectId: 1,
        responsibleId: 1,
        initials: 'QA',
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Validation error',
      details: expect.arrayContaining([expect.objectContaining({ path: ['installDate'] })]),
    })
  })

  it('rejects manually supplied upcoming-event fields', async () => {
    const response = await fetch(`${baseUrl}/api/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nextEventLabel: 'Dato manual no permitido' }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Validation error',
      details: expect.arrayContaining([expect.objectContaining({ code: 'unrecognized_keys' })]),
    })
  })
})
