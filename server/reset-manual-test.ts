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
      "Asset",
      "DynamicFieldDefinition",
      "ProjectMember",
      "AssetType",
      "Status",
      "Project",
      "User"
    RESTART IDENTITY CASCADE
  `)

  console.log('  • Usuarios (2)')
  await prisma.user.createMany({
    data: [
      { name: 'María Fernández', email: 'maria@docucore.local', role: 'Administradora', initials: 'MF', color: 'brand' },
      { name: 'J. Ramírez', email: 'jr@docucore.local', role: 'Técnico', initials: 'JR', color: 'emerald' },
    ],
  })

  console.log('  • Proyectos base (2)')
  await prisma.project.createMany({
    data: [
      { code: 'PRJ-2026-001', name: 'Planta Industrial Norte', description: 'Proyecto base para validación manual.', status: 'ACTIVE', gradient: 'brand-indigo', assetCount: 0, userCount: 2, locationCount: 0 },
      { code: 'PRJ-2026-002', name: 'Edificio Corporativo Centro', description: 'Segundo proyecto para pruebas de separación.', status: 'ACTIVE', gradient: 'emerald-teal', assetCount: 0, userCount: 1, locationCount: 0 },
    ],
  })

  // Membresías reales: María en ambos proyectos; J. Ramírez solo en el proyecto 1.
  await prisma.projectMember.createMany({
    data: [
      { projectId: 1, userId: 1, role: 'Administradora' },
      { projectId: 1, userId: 2, role: 'Técnico' },
      { projectId: 2, userId: 1, role: 'Administradora' },
    ],
  })

  console.log('  • Tipos de activo (5 por proyecto)')
  const defaultAssetTypeNames = ['Máquina', 'Extintor', 'Vehículo', 'Servidor', 'Instrumento']
  await prisma.assetType.createMany({
    data: [1, 2].flatMap((projectId) => defaultAssetTypeNames.map((name, sortOrder) => ({ projectId, name, sortOrder }))),
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
