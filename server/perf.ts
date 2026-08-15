import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { startServer } from './index'

const prisma = new PrismaClient()
const count = Number(process.env.PERF_RECORDS ?? '10000')
const batchSize = 1000

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0
}

async function measure(url: string, sessionCookie: string, runs = 12): Promise<{ p50: number; p95: number; bytes: number }> {
  const timings: number[] = []
  let bytes = 0
  for (let index = 0; index < runs; index += 1) {
    const start = performance.now()
    const response = await fetch(url, { headers: { cookie: sessionCookie } })
    const body = await response.text()
    if (!response.ok) throw new Error(`${url} returned ${response.status}`)
    timings.push(performance.now() - start)
    bytes = body.length
  }
  return { p50: Number(percentile(timings, 0.5).toFixed(1)), p95: Number(percentile(timings, 0.95).toFixed(1)), bytes }
}

async function createManyBatched<T>(total: number, create: (start: number, size: number) => Promise<T>): Promise<void> {
  for (let start = 0; start < total; start += batchSize) await create(start, Math.min(batchSize, total - start))
}

async function main() {
  if (!Number.isSafeInteger(count) || count < 1 || count > 100_000) throw new Error('PERF_RECORDS must be an integer between 1 and 100000')
  const stamp = Date.now()
  const code = `PERF-${stamp}`
  const user = await prisma.user.findFirstOrThrow({ select: { id: true, email: true } })
  const project = await prisma.project.create({ data: { code, name: `Perfil temporal ${stamp}`, description: 'Datos sintéticos eliminados al terminar PERF-01', themeKey: 'slate' } })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: user.id, role: 'OWNER' } })
  const status = await prisma.status.create({ data: { projectId: project.id, name: `Activo PERF ${stamp}`, color: 'emerald', sortOrder: 0 } })
  const type = await prisma.assetType.create({ data: { projectId: project.id, name: `Tipo PERF ${stamp}`, iconKey: 'box', sortOrder: 0 } })
  const root = await prisma.location.create({ data: { projectId: project.id, name: `Raíz PERF ${stamp}`, label: `Raíz PERF ${stamp}`, code: `LOC-${stamp}`, surface: '1 m²', responsibleId: user.id } })
  let leaf = root
  let planId: number | null = null
  try {
    // Deep path plus a wide branch exercise the progressive tree and recursive
    // subtrees while keeping all results bounded by their own endpoint limits.
    for (let depth = 0; depth < 12; depth += 1) {
      leaf = await prisma.location.create({ data: { projectId: project.id, name: `Profundidad ${depth}`, label: `Profundidad ${depth}`, code: `LOC-${stamp}-${depth}`, surface: '1 m²', parentId: leaf.id, responsibleId: user.id } })
    }
    await prisma.location.createMany({ data: Array.from({ length: 100 }, (_, index) => ({ projectId: project.id, name: `Rama ${index}`, label: `Rama ${index}`, code: `LOC-${stamp}-W-${index}`, surface: '1 m²', parentId: root.id, responsibleId: user.id })) })
    await createManyBatched(count, (start, size) => prisma.asset.createMany({ data: Array.from({ length: size }, (_, offset) => {
      const index = start + offset
      return { code: `PERF-A-${stamp}-${index}`, name: `Activo PERF ${String(index).padStart(6, '0')}`, serialNumber: `PERF-S-${stamp}-${index}`, installDate: new Date('2026-01-01'), typeId: type.id, statusId: status.id, locationId: leaf.id, projectId: project.id, responsibleId: user.id, initials: 'PF' }
    }) }))
    await createManyBatched(count, (start, size) => prisma.document.createMany({ data: Array.from({ length: size }, (_, offset) => ({ name: `Documento PERF ${String(start + offset).padStart(6, '0')}`, type: 'Archivo', projectId: project.id })) }))
    const sampleAssets = await prisma.asset.findMany({ where: { projectId: project.id }, orderBy: { id: 'asc' }, take: Math.min(500, count), select: { id: true } })
    planId = (await prisma.floorPlan.create({ data: { name: `Plano PERF ${stamp}`, projectId: project.id, locationId: root.id } })).id
    await prisma.floorPlanMarker.createMany({ data: sampleAssets.map((asset, index) => ({ floorPlanId: planId!, assetId: asset.id, x: (index % 20) / 20, y: Math.floor(index / 20) / 25 })) })
    await prisma.event.createMany({ data: sampleAssets.map((asset, index) => ({ projectId: project.id, assetId: asset.id, title: `Calendario denso ${index}`, type: 'maintenance', date: new Date(Date.UTC(2026, 6, index % 28 + 1)) })) })

    // A deliberately large completed history validates that list-next-event
    // probes remain independent from the amount of past work on an asset.
    const historyAsset = sampleAssets[0]
    if (historyAsset) {
      const definition = await prisma.dynamicFieldDefinition.create({ data: { projectId: project.id, key: `perf_history_${stamp}`, fieldName: 'Inspección PERF', groupName: 'PERF', fieldType: 'DATE' } })
      await prisma.assetDynamicFieldValue.create({ data: { assetId: historyAsset.id, definitionId: definition.id, dateValue: new Date('2026-07-20') } })
      const schedule = await prisma.assetDateSchedule.create({ data: { assetId: historyAsset.id, definitionId: definition.id } })
      const assignment = await prisma.assetPreventivePlan.create({ data: { assetId: historyAsset.id, name: 'Preventivo PERF', periodicity: 'Anual', periodicityMode: 'Calendario' } })
      await prisma.assetDateOccurrence.createMany({ data: Array.from({ length: 2_000 }, (_, index) => ({ scheduleId: schedule.id, scheduledDate: new Date(`2020-01-${String(index % 28 + 1).padStart(2, '0')}`), completedAt: new Date('2020-02-01'), completedDate: new Date('2020-02-01') })) })
      await prisma.preventiveExecution.createMany({ data: Array.from({ length: 2_000 }, (_, index) => ({ planId: assignment.id, scheduledDate: new Date(`2020-03-${String(index % 28 + 1).padStart(2, '0')}`), completedAt: new Date('2020-04-01'), completedDate: new Date('2020-04-01') })) })
      await prisma.assetDateOccurrence.create({ data: { scheduleId: schedule.id, scheduledDate: new Date('2026-07-20') } })
      await prisma.preventiveExecution.create({ data: { planId: assignment.id, scheduledDate: new Date('2026-07-21') } })
    }

    const server = startServer(0)
    await new Promise<void>((resolve) => server.once('listening', resolve))
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Performance server did not expose a TCP address')
      const base = `http://127.0.0.1:${address.port}/api/projects/${project.id}`
      const login = await fetch(`http://127.0.0.1:${address.port}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: user.email, password: 'DocuCore!2026' }),
      })
      const sessionCookie = login.headers.get('set-cookie')?.split(';')[0]
      if (!login.ok || !sessionCookie) throw new Error(`Performance authentication failed (${login.status})`)
      const [assets, documents, assetSearch, documentSearch, treeBootstrap, subtreeAssets, planAssets, planFacets, markers, calendarDense, historyAssetList] = await Promise.all([
        measure(`${base}/assets?limit=20&page=1`, sessionCookie),
        measure(`${base}/documents?limit=20&page=1`, sessionCookie),
        measure(`${base}/assets?limit=20&search=000999`, sessionCookie),
        measure(`${base}/documents?limit=20&search=000999`, sessionCookie),
        measure(`${base}/locations/bootstrap`, sessionCookie),
        measure(`${base}/assets?locationId=${root.id}&limit=20`, sessionCookie),
        measure(`${base}/floor-plans/${planId}/assets?limit=20&search=Activo`, sessionCookie),
        measure(`${base}/floor-plans/${planId}/facets`, sessionCookie),
        measure(`${base}/floor-plans/${planId}`, sessionCookie),
        measure(`${base}/calendar?from=2026-07-01&to=2026-07-31&limit=500`, sessionCookie),
        measure(`${base}/assets?search=PERF-A-${stamp}-0&limit=20`, sessionCookie),
      ])
      console.log(JSON.stringify({ recordsPerEntity: count, historyRecordsPerSource: 2_000, assets, documents, assetSearch, documentSearch, treeBootstrap, subtreeAssets, planAssets, planFacets, markers, calendarDense, historyAssetList }, null, 2))
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  } finally {
    // The synthetic project owns every generated relation, including marker
    // chunks, event density and history; one cascade removes it after profiling.
    await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined)
    await prisma.$disconnect()
  }
}

void main()
