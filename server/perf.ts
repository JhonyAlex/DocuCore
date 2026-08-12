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

async function measure(url: string, runs = 12): Promise<{ p50: number; p95: number; bytes: number }> {
  const timings: number[] = []
  let bytes = 0
  for (let index = 0; index < runs; index += 1) {
    const start = performance.now()
    const response = await fetch(url)
    const body = await response.text()
    if (!response.ok) throw new Error(`${url} returned ${response.status}`)
    timings.push(performance.now() - start)
    bytes = body.length
  }
  return { p50: Number(percentile(timings, 0.5).toFixed(1)), p95: Number(percentile(timings, 0.95).toFixed(1)), bytes }
}

async function main() {
  if (!Number.isSafeInteger(count) || count < 1 || count > 100_000) throw new Error('PERF_RECORDS must be an integer between 1 and 100000')
  const stamp = Date.now()
  const code = `PERF-${stamp}`
  const user = await prisma.user.findFirstOrThrow({ select: { id: true } })
  const status = await prisma.status.findFirstOrThrow({ select: { id: true } })
  const project = await prisma.project.create({ data: { code, name: `Perfil temporal ${stamp}`, description: 'Datos sintéticos eliminados al terminar PERF-01', gradient: 'from-slate-500 to-slate-700' } })
  const [type, location] = await Promise.all([
    prisma.assetType.create({ data: { projectId: project.id, name: `Tipo PERF ${stamp}`, iconKey: 'box', sortOrder: 0 } }),
    prisma.location.create({ data: { projectId: project.id, name: `Ubicación PERF ${stamp}`, label: `Ubicación PERF ${stamp}`, code: `LOC-${stamp}`, surface: '1 m²', responsibleId: user.id } }),
  ])
  try {
    for (let start = 0; start < count; start += batchSize) {
      const size = Math.min(batchSize, count - start)
      await prisma.asset.createMany({ data: Array.from({ length: size }, (_, offset) => {
        const index = start + offset
        return { code: `PERF-A-${stamp}-${index}`, name: `Activo PERF ${String(index).padStart(6, '0')}`, serialNumber: `PERF-S-${stamp}-${index}`, installDate: new Date('2026-01-01'), typeId: type.id, statusId: status.id, locationId: location.id, projectId: project.id, responsibleId: user.id, initials: 'PF' }
      }) })
      await prisma.document.createMany({ data: Array.from({ length: size }, (_, offset) => ({ name: `Documento PERF ${String(start + offset).padStart(6, '0')}`, type: 'Archivo', projectId: project.id })) })
    }
    const server = startServer(0)
    await new Promise<void>((resolve) => server.once('listening', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Performance server did not expose a TCP address')
    const base = `http://127.0.0.1:${address.port}/api`
    const [assets, documents, assetSearch, documentSearch] = await Promise.all([
      measure(`${base}/assets?projectId=${project.id}&limit=20&page=1`),
      measure(`${base}/documents?projectId=${project.id}&limit=20&page=1`),
      measure(`${base}/assets?projectId=${project.id}&limit=20&search=000999`),
      measure(`${base}/documents?projectId=${project.id}&limit=20&search=000999`),
    ])
    console.log(JSON.stringify({ recordsPerEntity: count, assets, documents, assetSearch, documentSearch }, null, 2))
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  } finally {
    await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined)
    await prisma.$disconnect()
  }
}

void main()
