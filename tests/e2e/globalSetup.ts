import { ensureTestDatabase } from '../helpers/database'

export default async function globalSetup(): Promise<void> {
  await ensureTestDatabase()
}
