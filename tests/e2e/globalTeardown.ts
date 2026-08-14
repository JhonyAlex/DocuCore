import { resetTestDatabase } from '../helpers/database'
import { rm } from 'node:fs/promises'

export default async function globalTeardown(): Promise<void> {
  await rm(`${process.cwd()}/test-results/e2e-documents`, { recursive: true, force: true })
  await rm(`${process.cwd()}/test-results/e2e-floor-plans`, { recursive: true, force: true })
  await resetTestDatabase()
}
