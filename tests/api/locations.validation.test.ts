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

describe('locations API validation', () => {
  it('rejects malformed location payloads through the real router and Zod error middleware', async () => {
    const response = await fetch(`${baseUrl}/api/locations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', responsibleId: 0 }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Validation error',
      details: expect.any(Array),
    })
  })

  it('rejects an invalid location id before accessing Prisma', async () => {
    const response = await fetch(`${baseUrl}/api/locations/not-a-number`)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid id' })
  })

  it('rejects manually supplied derived fields on create', async () => {
    const response = await fetch(`${baseUrl}/api/locations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemCount: 99, name: 'Dato manual no permitido' }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Validation error',
      details: expect.arrayContaining([expect.objectContaining({ code: 'unrecognized_keys' })]),
    })
  })
})
