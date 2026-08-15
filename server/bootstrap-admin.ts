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
  const now = new Date()
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        email,
        passwordHash: await hashPassword(password),
        role: 'Administradora',
        initials,
        color: 'brand',
        emailVerifiedAt: now,
        isPlatformAdmin: true,
      },
    })
    const workspace = await tx.workspace.create({
      data: {
        name: 'Espacio Principal',
        slug: 'espacio-principal',
        billingStatus: 'ACTIVE',
      },
    })
    await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: 'OWNER',
      },
    })
  })
  console.log(`AUTH bootstrap completed for ${email}. Create the first project from the portfolio after login.`)
}

main().catch((error: unknown) => { console.error('AUTH bootstrap failed:', error); process.exitCode = 1 }).finally(async () => prisma.$disconnect())
