/**
 * Reset para pruebas manuales desde cero.
 * Deja CERO activos, documentos, versiones, eventos, planos y ubicaciones, y
 * limpia de forma segura el almacenamiento de documentos y planos. Conserva un proyecto
 * base, un administrador, los tipos de activo y los estados necesarios.
 * Ejecutar: pnpm db:reset:manual-test
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { cleanDocumentStorage } from './lib/documentStorage'
import { cleanFloorPlanStorage } from './lib/floorPlanStorage'
import { hashPassword } from './lib/passwords'

const prisma = new PrismaClient()

async function main(): Promise<void> {
  console.log('🧹 Reset manual-test: vaciando datos dependientes...')

  // Primero el reset de base de datos; el almacenamiento de documentos solo se
  // limpia una vez que la BD ya no referencia ninguna versión.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Notification",
      "AuditLog",
      "FloorPlanMarker",
      "FloorPlanVersion",
      "FloorPlan",
      "Location",
      "DocumentVersion",
      "Document",
      "Event",
      "AssetImage",
      "Asset",
      "DynamicFieldDefinition",
      "ProjectMember",
      "AssetType",
      "Status",
      "Project",
      "WorkspaceMember",
      "Workspace",
      "EmailVerificationToken",
      "PasswordResetToken",
      "ProcessedWebhookEvent",
      "User"
    RESTART IDENTITY CASCADE
  `)

  console.log('  • Workspace (1)')
  await prisma.workspace.create({
    data: {
      name: 'Espacio Principal',
      slug: 'espacio-principal',
      billingStatus: 'ACTIVE',
      planKey: 'PRO',
    },
  })

  console.log('  • Usuarios (2)')
  const developmentPasswordHash = await hashPassword('DocuCore!2026')
  const now = new Date()
  await prisma.user.createMany({
    data: [
      { name: 'María Fernández', email: 'maria@docucore.local', passwordHash: developmentPasswordHash, role: 'Administradora', initials: 'MF', color: 'brand', emailVerifiedAt: now, isPlatformAdmin: true },
      { name: 'J. Ramírez', email: 'jr@docucore.local', passwordHash: developmentPasswordHash, role: 'Técnico', initials: 'JR', color: 'emerald', emailVerifiedAt: now },
    ],
  })

  console.log('  • Workspace members')
  await prisma.workspaceMember.createMany({
    data: [
      { workspaceId: 1, userId: 1, role: 'OWNER' },
      { workspaceId: 1, userId: 2, role: 'ADMIN' },
    ],
  })

  console.log('  • Proyectos base (2)')
  await prisma.project.createMany({
    data: [
      { workspaceId: 1, code: 'PRJ-2026-001', name: 'Planta Industrial Norte', description: 'Proyecto base para validación manual.', status: 'ACTIVE', themeKey: 'blue' },
      { workspaceId: 1, code: 'PRJ-2026-002', name: 'Edificio Corporativo Centro', description: 'Segundo proyecto para pruebas de separación.', status: 'ACTIVE', themeKey: 'emerald' },
    ],
  })

  // Membresías reales: María en ambos proyectos; J. Ramírez solo en el proyecto 1.
  await prisma.projectMember.createMany({
    data: [
      { projectId: 1, userId: 1, role: 'OWNER' },
      { projectId: 1, userId: 2, role: 'EDITOR' },
      { projectId: 2, userId: 1, role: 'OWNER' },
    ],
  })

  console.log('  • Tipos de activo (5 por proyecto)')
  const defaultAssetTypes = [
    { name: 'Máquina', iconKey: 'factory', color: 'brand' },
    { name: 'Extintor', iconKey: 'fire-extinguisher', color: 'red' },
    { name: 'Vehículo', iconKey: 'truck', color: 'purple' },
    { name: 'Servidor', iconKey: 'server', color: 'slate' },
    { name: 'Instrumento', iconKey: 'gauge', color: 'indigo' },
  ]
  await prisma.assetType.createMany({
    data: [1, 2].flatMap((projectId) => defaultAssetTypes.map(({ name, iconKey, color }, sortOrder) => ({ projectId, name, iconKey, color, sortOrder }))),
  })

  console.log('  • Estados (5 por proyecto)')
  const defaultStatuses = [
    { name: 'Activo', color: 'emerald', pulseDot: null },
    { name: 'En revisión', color: 'amber', pulseDot: null },
    { name: 'Fuera de servicio', color: 'red', pulseDot: 'red' },
    { name: 'Vencido', color: 'red', pulseDot: 'red' },
    { name: 'Alerta', color: 'amber', pulseDot: null },
  ]
  await prisma.status.createMany({
    data: [1, 2].flatMap((projectId) =>
      defaultStatuses.map(({ name, color, pulseDot }, sortOrder) => ({
        projectId,
        name,
        color,
        pulseDot,
        sortOrder,
      }))
    ),
  })

  // Tras el reset de BD, limpiar los almacenamientos de forma
  // segura. Si la ruta o el marcador no son válidos, el reset termina con error
  // (nunca se silencia una limpieza que no pudo garantizarse).
  const [documentsRemoved, plansRemoved] = await Promise.all([cleanDocumentStorage(), cleanFloorPlanStorage()])
  console.log(`  • Storage: ${documentsRemoved} documento(s) y ${plansRemoved} plano(s) eliminado(s).`)

  const counts = await Promise.all([
    prisma.asset.count(),
    prisma.document.count(),
    prisma.documentVersion.count(),
    prisma.event.count(),
    prisma.location.count(),
  ])
  console.log(`  • Conteos tras reset: assets=${counts[0]} docs=${counts[1]} versiones=${counts[2]} eventos=${counts[3]} ubicaciones=${counts[4]}`)
  console.log('✅ Reset manual-test completado.')
}

main()
  .catch((err: unknown) => {
    console.error('Reset failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
