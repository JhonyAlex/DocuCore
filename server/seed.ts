import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { StorageMarkerError, cleanDocumentStorage } from './lib/documentStorage'
import { storeDocumentBuffer } from './lib/documentStorage'

const prisma = new PrismaClient()

function isoFromEu(date: string, time?: string): Date {
  const [dd, mm, yyyy] = date.split('/').map(Number)
  if (time) {
    const [hh, min] = time.split(':').map(Number)
    return new Date(Date.UTC(yyyy, mm - 1, dd, hh, min))
  }
  return new Date(Date.UTC(yyyy, mm - 1, dd))
}

const PROJECT_CODE = 'PRJ-2026-001'

// Árbol visible del prototipo. Los hijos cuyo nombre NO comienza por el nombre
// Modelo jerárquico real: todas las ubicaciones son administrables y visibles
// al expandir su rama. `label` es el campo de presentación que muestra la tabla
// de Activos (texto largo del prototipo); el árbol muestra `name`. Así no se
// duplican ubicaciones ocultas.
interface LocationSeed {
  code: string
  name: string
  label: string
  parentCode: string | null
  responsibleEmail: string
  surface: string
  projectCode?: string
}

const locationsData: LocationSeed[] = [
  // Ramas de nivel 1 del prototipo
  { code: 'PIN-NP-01', name: 'Nave Principal', label: 'Nave Principal', parentCode: null, responsibleEmail: 'jr@docucore.local', surface: '2.200 m²' },
  { code: 'PIN-AO-04', name: 'Anexo Oficinas', label: 'Anexo Oficinas', parentCode: null, responsibleEmail: 'maria@docucore.local', surface: '480 m²' },
  { code: 'PIN-EX-05', name: 'Almacén exterior', label: 'Almacén exterior', parentCode: null, responsibleEmail: 'jr@docucore.local', surface: '1.200 m²' },
  // Hojas y subramas visibles bajo Nave Principal
  { code: 'PIN-NA-01A', name: 'Planta 1 · Nave A', label: 'Planta 1 · Nave A', parentCode: 'PIN-NP-01', responsibleEmail: 'jr@docucore.local', surface: '840 m²' },
  { code: 'PIN-NB-01B', name: 'Planta 1 · Nave B', label: 'Planta 1 · Nave B', parentCode: 'PIN-NP-01', responsibleEmail: 'jr@docucore.local', surface: '760 m²' },
  { code: 'PIN-NB-P3', name: 'Pasillo 3', label: 'Planta 1 · Nave B · Pasillo 3', parentCode: 'PIN-NB-01B', responsibleEmail: 'jr@docucore.local', surface: '90 m²' },
  { code: 'PIN-SC-02', name: 'Sala compresores', label: 'Planta 1 · Sala compresores', parentCode: 'PIN-NP-01', responsibleEmail: 'agomez@docucore.local', surface: '120 m²' },
  { code: 'PIN-LB-03', name: 'Laboratorio', label: 'Planta 1 · Laboratorio', parentCode: 'PIN-NP-01', responsibleEmail: 'ltorres@docucore.local', surface: '60 m²' },
  { code: 'CPD-R3-24', name: 'CPD · Rack 3 · U24', label: 'CPD · Rack 3 · U24', parentCode: 'PIN-AO-04', responsibleEmail: 'pmartin@docucore.local', surface: '200 m²' },
  { code: 'PIN-EX-04', name: 'Parking exterior', label: 'Parking exterior', parentCode: 'PIN-EX-05', responsibleEmail: 'jr@docucore.local', surface: '1.200 m²' },
  // Proyecto secundario para pruebas de separación entre proyectos
  { code: 'ECC-PL1', name: 'Planta 1 Centro', label: 'Planta 1 Centro', parentCode: null, responsibleEmail: 'pmartin@docucore.local', surface: '300 m²', projectCode: 'PRJ-2026-002' },
]

// Conteos objetivo del árbol (subrama): Nave A 42, Nave B 31, SC 8, LB 17,
// Anexo 32, Almacén 12 (total 142). Los ítems canónicos fijan parte del conteo;
// el resto se completa con relleno. BH-04 y BSC-11 quedan en Nave A.
const generatedBuckets: Array<{ locationCode: string; count: number }> = [
  { locationCode: 'PIN-NA-01A', count: 39 }, // + CNC-05, BH-04, BSC-11 = 42
  { locationCode: 'PIN-NB-01B', count: 30 }, // + EXT-A12 (en Pasillo 3) = 31
  { locationCode: 'PIN-SC-02', count: 7 }, // + CP-02 = 8
  { locationCode: 'PIN-LB-03', count: 16 }, // + MG-203 = 17
  { locationCode: 'PIN-AO-04', count: 31 }, // + SRV-03 (en CPD) = 32
  { locationCode: 'PIN-EX-05', count: 11 }, // + VH-014 (en Parking) = 12
]

async function main(): Promise<void> {
  console.log('🌱 Seeding DocuCore database...')

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

  // Tras vaciar la BD, limpiar ficheros huérfanos del storage. Solo se omite un
  // marcador ausente (entorno nuevo, aún sin provisionar); un marcador corrupto
  // o de otro propietario detiene el seed para no escribir sobre un storage que
  // no es de DocuCore.
  try {
    const removed = await cleanDocumentStorage()
    if (removed > 0) console.log(`  • Storage: ${removed} fichero(s) huérfano(s) eliminado(s).`)
  } catch (error) {
    if (error instanceof StorageMarkerError && error.code === 'MISSING_MARKER') {
      // Sin marcador previo: nada que limpiar.
    } else {
      throw error
    }
  }

  console.log('  • Users (5)')
  await prisma.user.createMany({
    data: [
      { name: 'María Fernández', email: 'maria@docucore.local', role: 'Administradora', initials: 'MF', color: 'brand' },
      { name: 'J. Ramírez', email: 'jr@docucore.local', role: 'Técnico', initials: 'JR', color: 'emerald' },
      { name: 'A. Gómez', email: 'agomez@docucore.local', role: 'Técnico', initials: 'AG', color: 'amber' },
      { name: 'L. Torres', email: 'ltorres@docucore.local', role: 'Laboratorio', initials: 'LT', color: 'brand' },
      { name: 'P. Martín', email: 'pmartin@docucore.local', role: 'Sistemas', initials: 'PM', color: 'indigo' },
    ],
  })

  console.log('  • Projects (5)')
  await prisma.project.createMany({
    data: [
      { code: PROJECT_CODE, name: 'Planta Industrial Norte', description: 'Planta de producción con 3 naves, 142 activos inventariados y 6 usuarios asociados.', status: 'ACTIVE', gradient: 'brand-indigo', assetCount: 142, userCount: 6, locationCount: locationsData.length },
      { code: 'PRJ-2026-002', name: 'Edificio Corporativo Centro', description: 'Oficinas centrales · 5 plantas · Gestión de contratos y servicios.', status: 'ACTIVE', gradient: 'emerald-teal', assetCount: 87, userCount: 4, locationCount: 1 },
      { code: 'PRJ-2026-003', name: 'Almacén Logístico Sur', description: 'Gestión de inventario, vehículos y extintores.', status: 'ACTIVE', gradient: 'amber-orange', assetCount: 213, userCount: 9, locationCount: 15 },
      { code: 'PRJ-2026-004', name: 'Cliente: Hospitales San Rafael', description: 'Gestión documental y calibraciones para equipo médico.', status: 'ACTIVE', gradient: 'purple-pink', assetCount: 58, userCount: 3, locationCount: 6 },
      { code: 'PRJ-2025-018', name: 'Auditoría ISO 9001 · 2025', description: 'Proyecto documental cerrado tras certificación.', status: 'ARCHIVED', gradient: 'slate', assetCount: 0, userCount: 2, locationCount: 0, docCount: 34 },
    ],
  })

  console.log('  • Project members')
  await prisma.projectMember.createMany({
    data: [
      { projectId: 1, userId: 1, role: 'Administradora' },
      { projectId: 1, userId: 2, role: 'Técnico' },
      { projectId: 1, userId: 3, role: 'Técnico' },
      { projectId: 1, userId: 4, role: 'Laboratorio' },
      { projectId: 1, userId: 5, role: 'Sistemas' },
      { projectId: 2, userId: 5, role: 'Sistemas' },
      { projectId: 2, userId: 1, role: 'Administradora' },
    ],
  })

  console.log('  • Item types (5)')
  await prisma.itemType.createMany({
    data: [
      { name: 'Máquina' },
      { name: 'Extintor' },
      { name: 'Vehículo' },
      { name: 'Servidor' },
      { name: 'Instrumento' },
    ],
  })

  console.log('  • Statuses (5)')
  await prisma.status.createMany({
    data: [
      { name: 'Activo', pulseDot: null },
      { name: 'En revisión', pulseDot: null },
      { name: 'Fuera de servicio', pulseDot: 'red' },
      { name: 'Vencido', pulseDot: 'red' },
      { name: 'Alerta', pulseDot: null },
    ],
  })

  console.log(`  • Locations (${locationsData.length})`)
  for (const location of locationsData) {
    await prisma.location.create({
      data: {
        code: location.code,
        name: location.name,
        label: location.label,
        surface: location.surface,
        parent: location.parentCode ? { connect: { code: location.parentCode } } : undefined,
        responsible: { connect: { email: location.responsibleEmail } },
        project: { connect: { code: location.projectCode ?? PROJECT_CODE } },
      },
    })
  }

  console.log('  • Items (142)')
  // Los seis canónicos conservan el orden (ids 1-6) y sus ubicaciones de ficha
  // para que la tabla de Activos coincida con el HTML de referencia. BH-04 y
  // BSC-11 se intercalan después para el detalle de Planta 1 · Nave A, por lo
  // que el relleno de Nave A comienza en id 9.
  const itemsData: Array<{
    code: string
    name: string
    serialNumber: string
    installDate: string
    typeName: string
    statusName: string
    locationCode: string
    responsibleEmail: string
    initials: string
  }> = [
    { code: 'CNC-05', name: 'Torno CNC Haas ST-20', serialNumber: 'HA20-2024-8821', installDate: '04/02/2024', typeName: 'Máquina', statusName: 'Activo', locationCode: 'PIN-NA-01A', responsibleEmail: 'jr@docucore.local', initials: 'CN' },
    { code: 'CP-02', name: 'Compresor Atlas Copco GA37', serialNumber: 'AC-37-2021-04', installDate: '12/03/2021', typeName: 'Máquina', statusName: 'Fuera de servicio', locationCode: 'PIN-SC-02', responsibleEmail: 'agomez@docucore.local', initials: 'CP' },
    { code: 'MG-203', name: 'Manómetro digital WIKA CPH6600', serialNumber: 'WK-2023-05412', installDate: '19/07/2023', typeName: 'Instrumento', statusName: 'En revisión', locationCode: 'PIN-LB-03', responsibleEmail: 'ltorres@docucore.local', initials: 'MG' },
    { code: 'EXT-A12', name: 'Extintor CO2 5kg', serialNumber: 'EXT-2024-A12', installDate: '24/07/2024', typeName: 'Extintor', statusName: 'Activo', locationCode: 'PIN-NB-P3', responsibleEmail: 'jr@docucore.local', initials: 'EX' },
    { code: 'SRV-03', name: 'Servidor Dell PowerEdge R750', serialNumber: 'DELL-R750-2023-003', installDate: '15/06/2023', typeName: 'Servidor', statusName: 'Alerta', locationCode: 'CPD-R3-24', responsibleEmail: 'pmartin@docucore.local', initials: 'SV' },
    { code: 'VH-014', name: 'Furgoneta Renault Master', serialNumber: '4521 LKM', installDate: '10/01/2021', typeName: 'Vehículo', statusName: 'Vencido', locationCode: 'PIN-EX-04', responsibleEmail: 'jr@docucore.local', initials: 'VH' },
    { code: 'BH-04', name: 'Bomba hidráulica', serialNumber: 'BH-2026-004', installDate: '15/07/2026', typeName: 'Máquina', statusName: 'Activo', locationCode: 'PIN-NA-01A', responsibleEmail: 'jr@docucore.local', initials: 'BH' },
    { code: 'BSC-11', name: 'Báscula industrial', serialNumber: 'BSC-2025-011', installDate: '10/09/2025', typeName: 'Instrumento', statusName: 'En revisión', locationCode: 'PIN-NA-01A', responsibleEmail: 'ltorres@docucore.local', initials: 'BA' },
  ]
  for (const it of itemsData) {
    await prisma.item.create({
      data: {
        code: it.code,
        name: it.name,
        serialNumber: it.serialNumber,
        installDate: isoFromEu(it.installDate),
        initials: it.initials,
        type: { connect: { name: it.typeName } },
        status: { connect: { name: it.statusName } },
        location: { connect: { code: it.locationCode } },
        project: { connect: { code: PROJECT_CODE } },
        responsible: { connect: { email: it.responsibleEmail } },
      },
    })
  }

  const [machineType, activeStatus, responsible] = await Promise.all([
    prisma.itemType.findUniqueOrThrow({ where: { name: 'Máquina' }, select: { id: true } }),
    prisma.status.findUniqueOrThrow({ where: { name: 'Activo' }, select: { id: true } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'jr@docucore.local' }, select: { id: true } }),
  ])

  // Relleno determinista: completa los conteos visibles del árbol sin alterar
  // los seis canónicos de la tabla ni los tres activos del detalle de Nave A.
  let sequence = 0
  for (const bucket of generatedBuckets) {
    const location = await prisma.location.findUniqueOrThrow({ where: { code: bucket.locationCode }, select: { id: true, projectId: true } })
    await prisma.item.createMany({
      data: Array.from({ length: bucket.count }, () => {
        sequence += 1
        const label = String(sequence).padStart(3, '0')
        return {
          code: `AST-${label}`,
          name: `Activo industrial ${label}`,
          serialNumber: `AST-SN-${label}`,
          installDate: new Date(Date.UTC(2025, sequence % 12, (sequence % 28) + 1)),
          typeId: machineType.id,
          statusId: activeStatus.id,
          locationId: location.id,
          projectId: location.projectId,
          responsibleId: responsible.id,
          initials: 'AI',
        }
      }),
    })
  }

  console.log('  • Related events (4) + document versions (207 logical documents)')
  const eventData = [
    { itemCode: 'CNC-05', title: 'Mant. preventivo', date: '05/08/2026', type: 'Recurrente cada 3 meses' },
    { itemCode: 'CP-02', title: 'Revisión urgente', date: '12/07/2026', type: 'Mantenimiento correctivo' },
    { itemCode: 'EXT-A12', title: 'Revisión anual', date: '24/07/2026', type: 'Inspección reglamentaria' },
    { itemCode: 'SRV-03', title: 'Revisión firmware', date: '12/08/2026', type: 'Mantenimiento de sistemas' },
  ]
  for (const event of eventData) {
    const item = await prisma.item.findUniqueOrThrow({ where: { code: event.itemCode }, select: { id: true, projectId: true } })
    await prisma.event.create({
      data: {
        title: event.title,
        date: isoFromEu(event.date),
        type: event.type,
        projectId: item.projectId,
        itemId: item.id,
      },
    })
  }

  const documentData = [
    { itemCode: 'VH-014', name: 'Certificado ITV 2025', eventTitle: 'ITV', type: 'Certificado', issueDate: '14/07/2025', expiryDate: '13/07/2026', fileName: 'certificado-itv-2025.pdf', content: 'ITV 2025', sizeBytes: 2_400_000 },
    { itemCode: 'MG-203', name: 'Certificado calibración WIKA', eventTitle: 'Calibración anual', type: 'Calibración', issueDate: '19/07/2025', expiryDate: '19/07/2026', fileName: 'calibracion-wika.pdf', content: 'CALIBRACION WIKA', sizeBytes: 1_100_000 },
    { itemCode: 'CNC-05', name: 'Manual técnico Haas ST-20', type: 'Manual', issueDate: '02/03/2024', expiryDate: null, fileName: 'manual-haas-st20.pdf', content: 'MANUAL HAAS ST-20', sizeBytes: 4_800_000, previous: { issueDate: '02/03/2023', expiryDate: null, fileName: 'manual-haas-st20-v2.pdf', content: 'MANUAL HAAS V2' } },
    { itemCode: 'EXT-A12', name: 'Acta revisión extintor A12', eventTitle: 'Revisión anual', type: 'Acta', issueDate: '24/07/2025', expiryDate: '24/07/2026', fileName: 'acta-extintor-a12.pdf', content: 'ACTA EXTINTOR A12', sizeBytes: 840_000 },
    { itemCode: 'CP-02', name: 'Contrato servicio Limpiezas Veloz', type: 'Contrato', issueDate: '12/08/2025', expiryDate: '12/08/2026', fileName: 'contrato-limpiezas.pdf', content: 'CONTRATO LIMPIEZAS', sizeBytes: 620_000 },
  ]
  for (const [index, document] of documentData.entries()) {
    const logicalDocument = await prisma.document.create({
      data: {
        name: document.name,
        eventTitle: document.eventTitle,
        type: document.type,
        createdAt: new Date(Date.UTC(2026, 6, 14, 11, 2, 10 - index)),
        updatedAt: new Date(Date.UTC(2026, 6, 14, 11, 2, 10 - index)),
        project: { connect: { code: PROJECT_CODE } },
        items: { create: [{ item: { connect: { code: document.itemCode } } }] },
      },
    })
    if (document.previous) {
      const storageKey = await storeDocumentBuffer(Buffer.from(document.previous.content), 'application/pdf')
      await prisma.documentVersion.create({ data: { documentId: logicalDocument.id, version: 1, originalName: document.previous.fileName, storageKey, mimeType: 'application/pdf', sizeBytes: Buffer.byteLength(document.previous.content), issueDate: isoFromEu(document.previous.issueDate), expiryDate: document.previous.expiryDate ? isoFromEu(document.previous.expiryDate) : null, uploadedAt: isoFromEu('14/07/2026', '11:01') } })
    }
    const content = Buffer.alloc(document.sizeBytes, document.content)
    const storageKey = await storeDocumentBuffer(content, 'application/pdf')
    await prisma.documentVersion.create({ data: { documentId: logicalDocument.id, version: document.previous ? 2 : 1, originalName: document.fileName, storageKey, mimeType: 'application/pdf', sizeBytes: content.length, issueDate: isoFromEu(document.issueDate), expiryDate: document.expiryDate ? isoFromEu(document.expiryDate) : null, uploadedAt: isoFromEu('14/07/2026', '11:02') } })
  }

  const expiryGroups = [
    { count: 183, expiryDate: null },
    { count: 15, expiryDate: '20/07/2026' },
    { count: 4, expiryDate: '10/07/2026' },
  ]
  for (const group of expiryGroups) {
    for (let index = 0; index < group.count; index += 1) {
      const document = await prisma.document.create({ data: { name: `Documento canónico ${group.expiryDate ?? 'vigente'} ${index + 1}`, type: 'Archivo', createdAt: isoFromEu('01/01/2025'), updatedAt: isoFromEu('01/01/2025'), project: { connect: { code: PROJECT_CODE } } } })
      const content = `CANONICAL-${group.expiryDate ?? 'CURRENT'}-${index + 1}`
      const storageKey = await storeDocumentBuffer(Buffer.from(content), 'application/pdf')
      await prisma.documentVersion.create({ data: { documentId: document.id, version: 1, originalName: `canonico-${document.id}.pdf`, storageKey, mimeType: 'application/pdf', sizeBytes: Buffer.byteLength(content), issueDate: isoFromEu('01/01/2026'), expiryDate: group.expiryDate ? isoFromEu(group.expiryDate) : null, uploadedAt: isoFromEu('14/07/2026', '11:02') } })
    }
  }

  console.log('  • Floor plan + markers (6)')
  const floorPlan = await prisma.floorPlan.create({
    data: {
      name: 'Plano Planta 1 · Nave A',
      location: { connect: { code: 'PIN-NA-01A' } },
      imageUrl: '/plano.svg',
      version: 'v1',
      uploadedAt: new Date(),
      markers: {
        create: [
          { code: 'CNC-05', label: 'Torno Haas', left: 18, top: 32, pinColor: 'brand-600', dotColor: 'emerald-400', item: { connect: { code: 'CNC-05' } } },
          { code: 'CP-02', label: 'Compresor ⚠', left: 42, top: 50, pinColor: 'red-600', dotColor: 'white', animate: true, item: { connect: { code: 'CP-02' } } },
          { code: 'MG-203', label: 'Manómetro', left: 72, top: 28, pinColor: 'amber-500', dotColor: 'white', item: { connect: { code: 'MG-203' } } },
          { code: 'EXT-A12', label: '', left: 28, top: 72, pinColor: 'red-500', dotColor: 'white', item: { connect: { code: 'EXT-A12' } } },
          { code: 'EXT-B04', label: '', left: 55, top: 78, pinColor: 'red-500', dotColor: 'white' },
          { code: 'SRV-03', label: 'CPD', left: 85, top: 62, pinColor: 'slate-700', dotColor: 'amber-400', item: { connect: { code: 'SRV-03' } } },
        ],
      },
    },
  })
  console.log(`    floorPlan #${floorPlan.id} created`)

  console.log('  • Audit logs (5)')
  const auditData: Array<{ email: string; action: string; entityId: string; detail: string; timestamp: string }> = [
    { email: 'jr@docucore.local', action: 'Completó evento', entityId: 'EXT-A12', detail: 'Revisión anual completada · próxima 15/07/2027', timestamp: '15/07/2026 10:32' },
    { email: 'maria@docucore.local', action: 'Creación', entityId: 'BH-04', detail: 'Nuevo ítem "Bomba hidráulica BH-04" creado', timestamp: '15/07/2026 09:15' },
    { email: 'agomez@docucore.local', action: 'Cambio estado', entityId: 'CP-02', detail: 'Activo → Fuera de servicio · motivo: avería motor', timestamp: '14/07/2026 16:48' },
    { email: 'ltorres@docucore.local', action: 'Documento añadido', entityId: 'CNC-05', detail: 'Manual técnico v3.2 · 4.8 MB', timestamp: '14/07/2026 11:02' },
    { email: 'ltorres@docucore.local', action: 'Movimiento', entityId: 'MG-203', detail: 'Planta 1 · Nave B → Almacén B', timestamp: '13/07/2026 14:21' },
  ]
  for (const a of auditData) {
    await prisma.auditLog.create({
      data: {
        user: { connect: { email: a.email } },
        action: a.action,
        entityId: a.entityId,
        detail: a.detail,
        timestamp: isoFromEu(a.timestamp.split(' ')[0], a.timestamp.split(' ')[1]),
      },
    })
  }

  console.log('✅ Seed complete.')
}

main()
  .catch((err: unknown) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
