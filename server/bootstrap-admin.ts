import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { hashPassword, passwordIsValid } from './lib/passwords'

const prisma = new PrismaClient()

async function main(): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD
  if (!email || !password) {
    console.log('AUTH bootstrap skipped: BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are not both configured.')
    return
  }
  if (!passwordIsValid(password)) throw new Error('BOOTSTRAP_ADMIN_PASSWORD must have at least 12 characters.')
  if (await prisma.user.count() > 0) {
    console.log('AUTH bootstrap skipped: at least one user already exists.')
    return
  }
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Administrador inicial'
  const initials = process.env.BOOTSTRAP_ADMIN_INITIALS?.trim() || 'AI'
  await prisma.user.create({ data: { name, email, passwordHash: await hashPassword(password), role: 'Administradora', initials, color: 'brand' } })
  console.log(`AUTH bootstrap completed for ${email}. Create the first project from the portfolio after login.`)
}

main().catch((error: unknown) => { console.error('AUTH bootstrap failed:', error); process.exitCode = 1 }).finally(async () => prisma.$disconnect())
