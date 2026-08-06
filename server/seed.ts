import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

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

async function main(): Promise<void> {
  console.log('🌱 Seeding DocuCore database...')

  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.floorPlanMarker.deleteMany(),
    prisma.floorPlan.deleteMany(),
    prisma.location.deleteMany(),
    prisma.document.deleteMany(),
    prisma.event.deleteMany(),
    prisma.item.deleteMany(),
    prisma.dynamicFieldDefinition.deleteMany(),
    prisma.projectMember.deleteMany(),
    prisma.itemType.deleteMany(),
    prisma.status.deleteMany(),
    prisma.project.deleteMany(),
    prisma.user.deleteMany(),
  ])

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
      { code: 'PRJ-2026-001', name: 'Planta Industrial Norte', description: 'Planta de producción con 3 naves, 142 activos inventariados y 6 usuarios asociados.', status: 'ACTIVE', gradient: 'brand-indigo', assetCount: 142, userCount: 6, locationCount: 8 },
      { code: 'PRJ-2026-002', name: 'Edificio Corporativo Centro', description: 'Oficinas centrales · 5 plantas · Gestión de contratos y servicios.', status: 'ACTIVE', gradient: 'emerald-teal', assetCount: 87, userCount: 4, locationCount: 12 },
      { code: 'PRJ-2026-003', name: 'Almacén Logístico Sur', description: 'Gestión de inventario, vehículos y extintores.', status: 'ACTIVE', gradient: 'amber-orange', assetCount: 213, userCount: 9, locationCount: 15 },
      { code: 'PRJ-2026-004', name: 'Cliente: Hospitales San Rafael', description: 'Gestión documental y calibraciones para equipo médico.', status: 'ACTIVE', gradient: 'purple-pink', assetCount: 58, userCount: 3, locationCount: 6 },
      { code: 'PRJ-2025-018', name: 'Auditoría ISO 9001 · 2025', description: 'Proyecto documental cerrado tras certificación.', status: 'ARCHIVED', gradient: 'slate', assetCount: 0, userCount: 2, locationCount: 0, docCount: 34 },
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

  console.log('  • Locations (5)')
  const locationsData = [
    { name: 'Planta 1 · Nave A', parent: 'Planta Industrial Norte → Nave Principal', responsible: 'J. Ramírez', assetCount: 42, surface: '840 m²', code: 'PIN-NA-01A' },
    { name: 'Planta 1 · Sala compresores', parent: 'Planta Industrial Norte → Sala técnica', responsible: 'A. Gómez', assetCount: 6, surface: '120 m²', code: 'PIN-SC-02' },
    { name: 'Planta 1 · Laboratorio', parent: 'Planta Industrial Norte → Laboratorio', responsible: 'L. Torres', assetCount: 18, surface: '60 m²', code: 'PIN-LB-03' },
    { name: 'CPD · Rack 3 · U24', parent: 'Centro de procesamiento de datos', responsible: 'P. Martín', assetCount: 24, surface: '200 m²', code: 'CPD-R3-24' },
    { name: 'Parking exterior', parent: 'Planta Industrial Norte → Exterior', responsible: 'J. Ramírez', assetCount: 9, surface: '1200 m²', code: 'PIN-EX-04' },
  ]
  for (const loc of locationsData) {
    await prisma.location.create({
      data: {
        name: loc.name,
        parent: loc.parent,
        responsible: loc.responsible,
        assetCount: loc.assetCount,
        surface: loc.surface,
        code: loc.code,
        project: { connect: { code: PROJECT_CODE } },
      },
    })
  }

  console.log('  • Items (6)')
  const itemsData: Array<{
    code: string
    name: string
    serialNumber: string
    serialLabel: string
    installDate: string
    typeName: string
    statusName: string
    location: string
    responsibleEmail: string
    initials: string
    nextEventLabel: string
    nextEventDate: string
    nextEventUrgency: string
  }> = [
    { code: 'CNC-05', name: 'Torno CNC Haas ST-20', serialNumber: 'HA20-2024-8821', serialLabel: 'SN: HA20-2024-8821', installDate: '04/02/2024', typeName: 'Máquina', statusName: 'Activo', location: 'Planta 1 · Nave A', responsibleEmail: 'jr@docucore.local', initials: 'CN', nextEventLabel: 'Mant. preventivo', nextEventDate: '05/08/2026 · 21d', nextEventUrgency: 'amber' },
    { code: 'CP-02', name: 'Compresor Atlas Copco GA37', serialNumber: 'AC-37-2021-04', serialLabel: 'SN: AC-37-2021-04', installDate: '12/03/2021', typeName: 'Máquina', statusName: 'Fuera de servicio', location: 'Planta 1 · Sala compresores', responsibleEmail: 'agomez@docucore.local', initials: 'CP', nextEventLabel: 'Revisión urgente', nextEventDate: 'Atrasado · 3d', nextEventUrgency: 'red' },
    { code: 'MG-203', name: 'Manómetro digital WIKA CPH6600', serialNumber: 'WK-2023-05412', serialLabel: 'SN: WK-2023-05412', installDate: '19/07/2023', typeName: 'Instrumento', statusName: 'En revisión', location: 'Planta 1 · Laboratorio', responsibleEmail: 'ltorres@docucore.local', initials: 'MG', nextEventLabel: 'Calibración anual', nextEventDate: '19/07/2026 · 4d', nextEventUrgency: 'amber' },
    { code: 'EXT-A12', name: 'Extintor CO2 5kg', serialNumber: 'EXT-2024-A12', serialLabel: 'Lote: EXT-2024-A12', installDate: '24/07/2024', typeName: 'Extintor', statusName: 'Activo', location: 'Planta 1 · Nave B · Pasillo 3', responsibleEmail: 'jr@docucore.local', initials: 'EX', nextEventLabel: 'Revisión anual', nextEventDate: '24/07/2026 · 9d', nextEventUrgency: 'amber' },
    { code: 'SRV-03', name: 'Servidor Dell PowerEdge R750', serialNumber: 'DELL-R750-2023-003', serialLabel: 'SN: DELL-R750-2023-003', installDate: '15/06/2023', typeName: 'Servidor', statusName: 'Alerta', location: 'CPD · Rack 3 · U24', responsibleEmail: 'pmartin@docucore.local', initials: 'SV', nextEventLabel: 'Revisión firmware', nextEventDate: '12/08/2026 · 28d', nextEventUrgency: 'slate' },
    { code: 'VH-014', name: 'Furgoneta Renault Master', serialNumber: '4521 LKM', serialLabel: 'Mat: 4521 LKM', installDate: '10/01/2021', typeName: 'Vehículo', statusName: 'Vencido', location: 'Parking exterior', responsibleEmail: 'jr@docucore.local', initials: 'VH', nextEventLabel: 'ITV', nextEventDate: 'Vencido hace 2d', nextEventUrgency: 'red' },
  ]
  for (const it of itemsData) {
    await prisma.item.create({
      data: {
        code: it.code,
        name: it.name,
        serialNumber: it.serialNumber,
        serialLabel: it.serialLabel,
        installDate: isoFromEu(it.installDate),
        location: it.location,
        initials: it.initials,
        nextEventLabel: it.nextEventLabel,
        nextEventDate: it.nextEventDate,
        nextEventUrgency: it.nextEventUrgency,
        type: { connect: { name: it.typeName } },
        status: { connect: { name: it.statusName } },
        project: { connect: { code: PROJECT_CODE } },
        responsible: { connect: { email: it.responsibleEmail } },
      },
    })
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
