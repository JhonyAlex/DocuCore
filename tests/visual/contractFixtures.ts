import type { Page } from '@playwright/test'
import { activityFeed, alertItems, auditLogs, chartBars, dashboardKpis, upcomingExpirations } from '../../src/data/mock'

const location = (id: number, name: string, parentId: number | null, assetCount: number, childCount: number, code: string) => ({
  id, name, label: name, parentId, assetCount, childCount, code, surface: '840 m²', responsibleId: 2,
  responsible: { id: 2, name: 'J. Ramírez', initials: 'JR', color: 'emerald' }, hasFloorPlan: id === 2,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', projectId: 1,
})

const locations = [
  location(1, 'Planta 1', null, 0, 4, 'PIN-01'),
  location(2, 'Planta 1 · Nave A', 1, 42, 0, 'PIN-NA-01A'),
  location(3, 'Planta 1 · Nave B', 1, 31, 0, 'PIN-NB-01B'),
  location(4, 'Sala compresores', 1, 12, 0, 'PIN-SC-02'),
  location(5, 'Laboratorio', 1, 11, 0, 'PIN-LB-03'),
  location(6, 'Anexo Oficinas', null, 32, 0, 'PIN-AO-04'),
  location(7, 'Almacén exterior', null, 12, 0, 'PIN-EX-05'),
]

const locationAssets = [
  { id: 1, code: 'CNC-05', name: 'Torno CNC Haas ST-20', installDate: '2024-02-04T00:00:00.000Z', initials: 'CN', type: { id: 1, name: 'Máquina', iconKey: 'machine', color: 'brand' }, status: { id: 1, name: 'Activo', color: 'emerald', pulseDot: null } },
  { id: 2, code: 'BH-04', name: 'Bomba hidráulica', installDate: '2026-07-15T00:00:00.000Z', initials: 'BH', type: { id: 1, name: 'Máquina', iconKey: 'machine', color: 'brand' }, status: { id: 1, name: 'Activo', color: 'emerald', pulseDot: null } },
  { id: 3, code: 'MG-203', name: 'Manómetro WIKA', installDate: '2025-09-10T00:00:00.000Z', initials: 'MG', type: { id: 3, name: 'Instrumento', iconKey: 'instrument', color: 'indigo' }, status: { id: 3, name: 'En revisión', color: 'amber', pulseDot: null } },
]

const dashboardFixture = {
  project: { id: 1, code: 'PRJ-2026-001', name: 'Planta Industrial Norte' },
  referenceDate: '2026-07-15T00:00:00.000Z',
  kpis: dashboardKpis,
  upcomingExpirations: upcomingExpirations.map((item) => ({ ...item, targetType: 'calendar', targetId: undefined })),
  criticalAlerts: alertItems.map((item) => ({ ...item, targetType: 'assets-filter', targetId: undefined })),
  criticalAlertCount: 6,
  chartBars,
  activityFeed,
}

const colorByInitials: Record<string, string> = { JR: 'emerald', MF: 'brand', AG: 'amber', LT: 'indigo' }
const historyFixture = {
  data: auditLogs.map((entry) => ({
    id: entry.id,
    timestamp: `${entry.timestamp.slice(6, 10)}-${entry.timestamp.slice(3, 5)}-${entry.timestamp.slice(0, 2)}T${entry.timestamp.slice(11)}:00.000Z`,
    action: entry.action,
    entityId: entry.entityId,
    detail: entry.detail,
    user: { id: entry.id, name: entry.userName, initials: entry.userInitials, color: colorByInitials[entry.userInitials] },
  })),
  total: auditLogs.length,
  page: 1,
  totalPages: 1,
  limit: 20,
  availableActions: ['Cambio estado', 'Completó evento', 'Creación', 'Documento añadido', 'Movimiento'],
}

/** Test-only fixed inputs for the three views still governed by the protected HTML. */
export async function installProtectedVisualFixtures(page: Page, target: 'dashboard' | 'locations' | 'history'): Promise<void> {
  if (target === 'dashboard') {
    await page.route(/\/api\/projects\/1\/dashboard(?:\?.*)?$/, (route) => route.fulfill({ json: dashboardFixture }))
    return
  }
  if (target === 'history') {
    await page.route(/\/api\/projects\/1\/history(?:\?.*)?$/, (route) => route.fulfill({ json: historyFixture }))
    return
  }
  await page.route(/\/api\/projects\/1\/locations\/bootstrap$/, (route) => route.fulfill({ json: {
    locations,
    tree: [],
    list: locations,
    project: { id: 1, code: 'PRJ-2026-001', name: 'Planta Industrial Norte' },
    selectedId: 2,
    openBranchIds: [1],
  } }))
  await page.route(/\/api\/projects\/1\/locations\/2$/, (route) => route.fulfill({ json: {
    ...locations[1],
    project: { id: 1, code: 'PRJ-2026-001', name: 'Planta Industrial Norte' },
    parent: { id: 1, name: 'Planta 1' },
    ancestors: [{ id: 1, name: 'Planta 1' }],
    assets: locationAssets,
    previewAssets: locationAssets,
    previewAssetCount: locationAssets.length,
  } }))
}
