/**
 * Reset para pruebas manuales desde cero.
 * Deja CERO activos, documentos, versiones, eventos, planos y ubicaciones, y
 * limpia de forma segura el almacenamiento de documentos. Conserva un proyecto
 * base, un administrador, los tipos de ítem y los estados necesarios.
 * Ejecutar: pnpm db:reset:manual-test
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { cleanDocumentStorage } from './lib/documentStorage'

const prisma = new PrismaClient()

async function main(): Promise<void> {
  console.log('🧹 Reset manual-test: vaciando datos dependientes...')

  // Primero el reset de base de datos; el almacenamiento de documentos solo se
  // limpia una vez que la BD ya no referencia ninguna versión.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog",
      "FloorPlanMarker",
      "FloorPlan",
      "Location",
      "DocumentVersion",
      "Document",
      "Event",
      "Item",
      "DynamicFieldDefinition",
      "ProjectMember",
      "ItemType",
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

  console.log('  • Tipos de ítem (5)')
  await prisma.itemType.createMany({
    data: [
      { name: 'Máquina' },
      { name: 'Extintor' },
      { name: 'Vehículo' },
      { name: 'Servidor' },
      { name: 'Instrumento' },
    ],
  })

  console.log('  • Estados (5)')
  await prisma.status.createMany({
    data: [
      { name: 'Activo', pulseDot: null },
      { name: 'En revisión', pulseDot: null },
      { name: 'Fuera de servicio', pulseDot: 'red' },
      { name: 'Vencido', pulseDot: 'red' },
      { name: 'Alerta', pulseDot: null },
    ],
  })

  // Tras el reset de BD, limpiar el almacenamiento de documentos de forma
  // segura. Si la ruta o el marcador no son válidos, el reset termina con error
  // (nunca se silencia una limpieza que no pudo garantizarse).
  const removed = await cleanDocumentStorage()
  console.log(`  • Storage: ${removed} fichero(s) eliminado(s).`)

  const counts = await Promise.all([
    prisma.item.count(),
    prisma.document.count(),
    prisma.documentVersion.count(),
    prisma.event.count(),
    prisma.location.count(),
  ])
  console.log(`  • Conteos tras reset: items=${counts[0]} docs=${counts[1]} versiones=${counts[2]} eventos=${counts[3]} ubicaciones=${counts[4]}`)
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
