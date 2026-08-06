import { resetTestDatabase } from '../helpers/database'

export default async function globalTeardown(): Promise<void> {
  await resetTestDatabase()
}
