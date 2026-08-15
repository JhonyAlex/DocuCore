import { ensureTestDatabase } from '../helpers/database'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export default async function globalSetup(): Promise<void> {
  const docDir = path.join(process.cwd(), 'test-results', 'e2e-documents')
  const planDir = path.join(process.cwd(), 'test-results', 'e2e-floor-plans')

  await rm(docDir, { recursive: true, force: true })
  await rm(planDir, { recursive: true, force: true })

  await mkdir(docDir, { recursive: true })
  await mkdir(planDir, { recursive: true })

  await writeFile(path.join(docDir, '.docucore-storage.json'), JSON.stringify({ owner: 'docucore-document-storage', createdAt: new Date().toISOString() }))
  await writeFile(path.join(planDir, '.docucore-storage.json'), JSON.stringify({ owner: 'docucore-floor-plan-storage', createdAt: new Date().toISOString() }))

  await ensureTestDatabase()
}
