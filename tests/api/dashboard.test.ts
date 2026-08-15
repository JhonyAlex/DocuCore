import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase, projectApiPath } from '../helpers/database'

let server: Server | undefined
let baseUrl: string

function api(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${projectApiPath(path, init)}`, init)
}

describe('dashboard API', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DOCUCORE_NOW = '2026-07-15T00:00:00.000Z'
    await ensureTestDatabase()
    const { default: app } = await import('../../server/index')
    await new Promise<void>((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${(instance.address() as AddressInfo).port}`
        server = instance
        resolve()
      })
    })
  }, 120_000)

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()))
  })

  it('returns real dashboard data with KPIs, upcoming expirations, critical alerts, chart and activity', async () => {
    const response = await api('/api/dashboard?projectId=1')
    expect(response.status).toBe(200)
    const body = await response.json() as {
      project: { id: number; code: string; name: string }
      kpis: Array<{ id: string; label: string; value: string; chipText: string }>
      upcomingExpirations: Array<{ id: string; title: string; subtitle: string; chipText: string }>
      criticalAlerts: Array<{ id: string; title: string; subtitle: string; targetType: string; targetId: number }>
      chartBars: Array<{ month: string; vencimientos: number; completados: number; incidencias: number; vencimientosCount: number; completadosCount: number; incidenciasCount: number; isCurrent?: boolean }>
      activityFeed: Array<{ id: number; time: string; text: string; detail: string; dotColorClass: string }>
    }

    expect(body.project.code).toBe('PRJ-2026-001')
    expect(body.kpis).toHaveLength(4)

    // Check KPIs values
    const [totalAssetsKpi, docsKpi, eventsKpi, incidentsKpi] = body.kpis
    expect(totalAssetsKpi.label).toBe('Activos totales')
    expect(Number(totalAssetsKpi.value)).toBeGreaterThanOrEqual(140)

    expect(docsKpi.label).toBe('Documentos por vencer')
    expect(Number(docsKpi.value)).toBeGreaterThan(0)

    expect(eventsKpi.label).toBe('Eventos próximos')
    expect(Number(eventsKpi.value)).toBeGreaterThan(0)

    expect(incidentsKpi.label).toBe('Incidencias abiertas')
    expect(Number(incidentsKpi.value)).toBeGreaterThan(0)

    // Vencimientos y alertas se derivan de las relaciones vigentes del seed,
    // sin depender de tarjetas de ejemplo ni de un orden fijo.
    expect(body.upcomingExpirations.length).toBeGreaterThan(0)
    expect(body.upcomingExpirations.every((item) => item.title.length > 0 && item.chipText.length > 0)).toBe(true)

    expect(body.criticalAlerts.length).toBeGreaterThan(0)
    expect(body.criticalAlerts.every((item) => item.targetType === 'asset' && item.targetId > 0)).toBe(true)

    // Check Chart bars
    expect(body.chartBars.length).toBe(7)
    expect(body.chartBars[6].isCurrent).toBe(true)
    expect(body.chartBars.every((bar) => Number.isFinite(bar.vencimientosCount) && Number.isFinite(bar.completadosCount) && Number.isFinite(bar.incidenciasCount))).toBe(true)

    // Check Activity feed
    expect(body.activityFeed.length).toBeGreaterThanOrEqual(5)
    expect(body.activityFeed[0].time).toMatch(/Hoy|Ayer|\d{2}\/\d{2}/)
    expect(body.activityFeed.every((item) => item.text.length > 0 && item.detail.length > 0)).toBe(true)
  })

  it('supports range parameter for 7d, 30d, year', async () => {
    const res7d = await api('/api/dashboard?projectId=1&range=7d')
    expect(res7d.status).toBe(200)
    const body7d = await res7d.json() as { kpis: Array<{ footer?: string }> }
    expect(body7d.kpis[1].footer).toContain('7 días')

    const resYear = await api('/api/dashboard?projectId=1&range=year')
    expect(resYear.status).toBe(200)
  })

  it('serves a CSV export file with attachment headers', async () => {
    const response = await api('/api/dashboard/export?projectId=1')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(response.headers.get('content-disposition')).toContain('attachment; filename="dashboard-PRJ-2026-001')

    const csvText = await response.text()
    expect(csvText).toContain('DocuCore - Reporte Ejecutivo de Panel General')
    expect(csvText).toContain('Planta Industrial Norte')
    expect(csvText).toContain('Activos totales')
    expect(csvText).toContain('PRÓXIMOS VENCIMIENTOS')
    expect(csvText).toContain('ALERTAS CRÍTICAS')
  })
})
