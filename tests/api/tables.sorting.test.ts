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
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

describe('table sorting API (assets and documents)', () => {
  it('sorts assets by code in ascending and descending order', async () => {
    const resAsc = await fetch(`${baseUrl}/api/projects/1/assets?sortBy=code&sortOrder=asc&limit=10`)
    expect(resAsc.status).toBe(200)
    const dataAsc = (await resAsc.json()) as { data: Array<{ code: string }> }
    expect(dataAsc.data.length).toBeGreaterThan(1)
    const codesAsc = dataAsc.data.map((a) => a.code)
    for (let i = 1; i < codesAsc.length; i++) {
      expect(codesAsc[i].localeCompare(codesAsc[i - 1])).toBeGreaterThanOrEqual(0)
    }

    const resDesc = await fetch(`${baseUrl}/api/projects/1/assets?sortBy=code&sortOrder=desc&limit=10`)
    expect(resDesc.status).toBe(200)
    const dataDesc = (await resDesc.json()) as { data: Array<{ code: string }> }
    expect(dataDesc.data.length).toBeGreaterThan(1)
    const codesDesc = dataDesc.data.map((a) => a.code)
    for (let i = 1; i < codesDesc.length; i++) {
      expect(codesDesc[i].localeCompare(codesDesc[i - 1])).toBeLessThanOrEqual(0)
    }
  })

  it('sorts assets by name ascending and descending', async () => {
    const resAsc = await fetch(`${baseUrl}/api/projects/1/assets?sortBy=name&sortOrder=asc&limit=10`)
    expect(resAsc.status).toBe(200)
    const dataAsc = (await resAsc.json()) as { data: Array<{ name: string }> }
    expect(dataAsc.data.length).toBeGreaterThan(1)
    const namesAsc = dataAsc.data.map((a) => a.name.toLowerCase())
    for (let i = 1; i < namesAsc.length; i++) {
      expect(namesAsc[i].localeCompare(namesAsc[i - 1])).toBeGreaterThanOrEqual(0)
    }
  })

  it('sorts assets by type, location, status, responsible, and nextEvent without errors', async () => {
    const fields = ['type', 'location', 'status', 'responsible', 'nextEvent', 'installDate']
    for (const field of fields) {
      const res = await fetch(`${baseUrl}/api/projects/1/assets?sortBy=${field}&sortOrder=asc&limit=5`)
      expect(res.status).toBe(200)
      const data = (await res.json()) as { data: unknown[]; total: number }
      expect(data.data).toBeDefined()
      expect(Array.isArray(data.data)).toBe(true)
    }
  })

  it('sorts documents by name ascending and descending', async () => {
    const resAsc = await fetch(`${baseUrl}/api/projects/1/documents?sortBy=name&sortOrder=asc&limit=10`)
    expect(resAsc.status).toBe(200)
    const dataAsc = (await resAsc.json()) as { data: Array<{ name: string }> }
    if (dataAsc.data.length > 1) {
      const namesAsc = dataAsc.data.map((d) => d.name.toLowerCase())
      for (let i = 1; i < namesAsc.length; i++) {
        expect(namesAsc[i].localeCompare(namesAsc[i - 1])).toBeGreaterThanOrEqual(0)
      }
    }

    const resDesc = await fetch(`${baseUrl}/api/projects/1/documents?sortBy=name&sortOrder=desc&limit=10`)
    expect(resDesc.status).toBe(200)
    const dataDesc = (await resDesc.json()) as { data: Array<{ name: string }> }
    if (dataDesc.data.length > 1) {
      const namesDesc = dataDesc.data.map((d) => d.name.toLowerCase())
      for (let i = 1; i < namesDesc.length; i++) {
        expect(namesDesc[i].localeCompare(namesDesc[i - 1])).toBeLessThanOrEqual(0)
      }
    }
  })

  it('sorts documents by version, issueDate, expiryDate, periodicity, and assets without errors', async () => {
    const fields = ['version', 'issueDate', 'expiryDate', 'periodicity', 'status', 'assets', 'type']
    for (const field of fields) {
      const res = await fetch(`${baseUrl}/api/projects/1/documents?sortBy=${field}&sortOrder=asc&limit=5`)
      expect(res.status).toBe(200)
      const data = (await res.json()) as { data: unknown[]; total: number }
      expect(data.data).toBeDefined()
      expect(Array.isArray(data.data)).toBe(true)
    }
  })

  it('handles invalid sorting parameters safely', async () => {
    const resAsset = await fetch(`${baseUrl}/api/projects/1/assets?sortBy=invalidField&sortOrder=malicious`)
    expect(resAsset.status).toBe(200)
    const dataAsset = (await resAsset.json()) as { data: unknown[] }
    expect(Array.isArray(dataAsset.data)).toBe(true)

    const resDoc = await fetch(`${baseUrl}/api/projects/1/documents?sortBy=invalidField`)
    expect(resDoc.status).toBe(400) // documentListQuerySchema uses strict validation
  })
})
