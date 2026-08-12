import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { StorageMarkerError, cleanDocumentStorage, storeDocumentBuffer } from './lib/documentStorage'
import { FloorPlanStorageError, cleanFloorPlanStorage, storeFloorPlanBuffer } from './lib/floorPlanStorage'
import { fieldKey } from './lib/dynamicFields'
import { createSeedPdfBuffer } from './lib/seedPdf'

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
  { code: 'PIN-NP-01', name: 'Nave Principal', label: 'Nave Principal', parentCode: null, responsibleEmail: 'jr@docucore.local', surface: '2.200 m²' },
  { code: 'PIN-AO-04', name: 'Anexo Oficinas', label: 'Anexo Oficinas', parentCode: null, responsibleEmail: 'maria@docucore.local', surface: '480 m²' },
  { code: 'PIN-EX-05', name: 'Almacén exterior', label: 'Almacén exterior', parentCode: null, responsibleEmail: 'jr@docucore.local', surface: '1.200 m²' },
  { code: 'PIN-NA-01A', name: 'Planta 1 · Nave A', label: 'Planta 1 · Nave A', parentCode: 'PIN-NP-01', responsibleEmail: 'jr@docucore.local', surface: '840 m²' },
  { code: 'PIN-NB-01B', name: 'Planta 1 · Nave B', label: 'Planta 1 · Nave B', parentCode: 'PIN-NP-01', responsibleEmail: 'jr@docucore.local', surface: '760 m²' },
  { code: 'PIN-NB-P3', name: 'Pasillo 3', label: 'Planta 1 · Nave B · Pasillo 3', parentCode: 'PIN-NB-01B', responsibleEmail: 'jr@docucore.local', surface: '90 m²' },
  { code: 'PIN-SC-02', name: 'Sala compresores', label: 'Planta 1 · Sala compresores', parentCode: 'PIN-NP-01', responsibleEmail: 'agomez@docucore.local', surface: '120 m²' },
  { code: 'PIN-LB-03', name: 'Laboratorio', label: 'Planta 1 · Laboratorio', parentCode: 'PIN-NP-01', responsibleEmail: 'ltorres@docucore.local', surface: '60 m²' },
  { code: 'CPD-R3-24', name: 'CPD · Rack 3 · U24', label: 'CPD · Rack 3 · U24', parentCode: 'PIN-AO-04', responsibleEmail: 'pmartin@docucore.local', surface: '200 m²' },
  { code: 'PIN-EX-04', name: 'Parking exterior', label: 'Parking exterior', parentCode: 'PIN-EX-05', responsibleEmail: 'jr@docucore.local', surface: '1.200 m²' },
  { code: 'ECC-PL1', name: 'Planta 1 Centro', label: 'Planta 1 Centro', parentCode: null, responsibleEmail: 'pmartin@docucore.local', surface: '300 m²', projectCode: 'PRJ-2026-002' },
]

const generatedBuckets: Array<{ locationCode: string; count: number }> = [
  { locationCode: 'PIN-NA-01A', count: 39 },
  { locationCode: 'PIN-NB-01B', count: 30 },
  { locationCode: 'PIN-SC-02', count: 7 },
  { locationCode: 'PIN-LB-03', count: 16 },
  { locationCode: 'PIN-AO-04', count: 31 },
  { locationCode: 'PIN-EX-05', count: 11 },
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
      "PreventiveExecutionTask",
      "PreventiveExecution",
      "AssetPreventivePlan",
      "PreventivePlanAssetType",
      "PreventivePlanTask",
      "PreventivePlan",
      "Task",
      "Asset",
      "DynamicFieldDefinition",
      "ProjectMember",
      "AssetType",
      "Status",
      "Project",
      "User"
    RESTART IDENTITY CASCADE
  `)

  try {
    const removed = await cleanDocumentStorage()
    if (removed > 0) console.log(`  • Storage: ${removed} fichero(s) huérfano(s) eliminado(s).`)
  } catch (error) {
    if (error instanceof StorageMarkerError && error.code === 'MISSING_MARKER') {
      // Sin marcador previo
    } else {
      throw error
    }
  }

  try {
    const removed = await cleanFloorPlanStorage()
    if (removed > 0) console.log(`  • Storage de planos: ${removed} fichero(s) huérfano(s) eliminado(s).`)
  } catch (error) {
    if (!(error instanceof FloorPlanStorageError) || error.code !== 'MISSING_MARKER') throw error
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

  console.log('  • Asset types (5 por proyecto)')
  const defaultAssetTypes = [
    { name: 'Máquina', iconKey: 'factory' },
    { name: 'Extintor', iconKey: 'fire-extinguisher' },
    { name: 'Vehículo', iconKey: 'truck' },
    { name: 'Servidor', iconKey: 'server' },
    { name: 'Instrumento', iconKey: 'gauge' },
  ]
  await prisma.assetType.createMany({
    data: [1, 2, 3, 4, 5].flatMap((projectId) => defaultAssetTypes.map(({ name, iconKey }, sortOrder) => ({ projectId, name, iconKey, sortOrder }))),
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

  console.log('  • Assets (142)')
  const assetsData: Array<{
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
  for (const asset of assetsData) {
    await prisma.asset.create({
      data: {
        code: asset.code,
        name: asset.name,
        serialNumber: asset.serialNumber,
        installDate: isoFromEu(asset.installDate),
        initials: asset.initials,
        type: { connect: { projectId_name: { projectId: 1, name: asset.typeName } } },
        status: { connect: { name: asset.statusName } },
        location: { connect: { code: asset.locationCode } },
        project: { connect: { code: PROJECT_CODE } },
        responsible: { connect: { email: asset.responsibleEmail } },
      },
    })
  }

  const [machineType, activeStatus, responsible] = await Promise.all([
    prisma.assetType.findUniqueOrThrow({ where: { projectId_name: { projectId: 1, name: 'Máquina' } }, select: { id: true } }),
    prisma.status.findUniqueOrThrow({ where: { name: 'Activo' }, select: { id: true } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'jr@docucore.local' }, select: { id: true } }),
  ])

  let sequence = 0
  for (const bucket of generatedBuckets) {
    const location = await prisma.location.findUniqueOrThrow({ where: { code: bucket.locationCode }, select: { id: true, projectId: true } })
    await prisma.asset.createMany({
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

  console.log('  • Catalog Tasks (5)')
  const taskSeeds = [
    { code: 'TSK-01', name: 'Comprobar nivel de aceite y filtros' },
    { code: 'TSK-02', name: 'Verificar presión del circuito hidráulico' },
    { code: 'TSK-03', name: 'Inspeccionar resguardos y paradas de emergencia' },
    { code: 'TSK-04', name: 'Comprobación de puesta a tierra y aislamiento' },
    { code: 'TSK-05', name: 'Limpieza y lubricación de guías' },
  ]
  const createdTasks = []
  for (const seed of taskSeeds) {
    const task = await prisma.task.create({
      data: { projectId: 1, code: seed.code, name: seed.name, isActive: true },
    })
    createdTasks.push(task)
  }

  console.log('  • Preventive Plan Templates (3)')
  const plan1 = await prisma.preventivePlan.create({
    data: {
      projectId: 1,
      name: 'Mantenimiento preventivo trimestral',
      description: 'Revisión periódica de presión, filtros y paradas de emergencia.',
      periodicity: 'Trimestral',
      periodicityMode: 'Calendario',
      isActive: true,
      tasks: {
        create: [
          { taskId: createdTasks[0].id, sortOrder: 0 },
          { taskId: createdTasks[1].id, sortOrder: 1 },
          { taskId: createdTasks[2].id, sortOrder: 2 },
        ],
      },
      assetTypes: {
        create: [{ assetTypeId: machineType.id }],
      },
    },
    include: { tasks: { include: { task: true } } },
  })

  await prisma.preventivePlan.create({
    data: {
      projectId: 1,
      name: 'Inspección Mensual de Seguridad',
      description: 'Comprobación general de paradas de emergencia y tierras.',
      periodicity: 'Mensual',
      periodicityMode: 'Calendario',
      isActive: true,
      tasks: {
        create: [
          { taskId: createdTasks[2].id, sortOrder: 0 },
          { taskId: createdTasks[3].id, sortOrder: 1 },
        ],
      },
      assetTypes: {
        create: [{ assetTypeId: machineType.id }],
      },
    },
  })

  await prisma.preventivePlan.create({
    data: {
      projectId: 1,
      name: 'Revisión Semestral Maquinaria',
      description: 'Limpieza profunda, lubricación y filtros.',
      periodicity: 'Semestral',
      periodicityMode: 'Subida',
      isActive: true,
      tasks: {
        create: [
          { taskId: createdTasks[0].id, sortOrder: 0 },
          { taskId: createdTasks[4].id, sortOrder: 1 },
        ],
      },
      assetTypes: {
        create: [{ assetTypeId: machineType.id }],
      },
    },
  })

  console.log('  • Asset Preventive Assignment (CNC-05)')
  const cncAsset = await prisma.asset.findUniqueOrThrow({ where: { code: 'CNC-05' } })
  const assignedPlan = await prisma.assetPreventivePlan.create({
    data: {
      assetId: cncAsset.id,
      planId: plan1.id,
      name: plan1.name,
      periodicity: plan1.periodicity,
      periodicityMode: plan1.periodicityMode,
      isActive: true,
    },
  })
  const initialExecution = await prisma.preventiveExecution.create({
    data: {
      planId: assignedPlan.id,
      scheduledDate: new Date('2026-08-05T00:00:00.000Z'),
    },
  })
  await prisma.preventiveExecutionTask.createMany({
    data: plan1.tasks.map((link) => ({
      executionId: initialExecution.id,
      taskId: link.taskId,
      code: link.task.code,
      name: link.task.name,
      sortOrder: link.sortOrder,
    })),
  })

  console.log('  • Dynamic fields (24)')
  const dynamicSeeds: Array<{
    typeName: string
    name: string
    fieldType: 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'DATE' | 'SELECT' | 'BOOLEAN'
    group: string
    required?: boolean
    unit?: string
    options?: string[]
  }> = [
    { typeName: 'Máquina', name: 'Fabricante', fieldType: 'TEXT', group: 'Identificación' },
    { typeName: 'Máquina', name: 'Modelo', fieldType: 'TEXT', group: 'Identificación' },
    { typeName: 'Máquina', name: 'Potencia', fieldType: 'NUMBER', group: 'Especificaciones', unit: 'kW' },
    { typeName: 'Máquina', name: 'Tensión', fieldType: 'NUMBER', group: 'Especificaciones', unit: 'V' },
    { typeName: 'Máquina', name: 'Zona ATEX', fieldType: 'BOOLEAN', group: 'Seguridad' },
    { typeName: 'Máquina', name: 'Criticidad', fieldType: 'SELECT', group: 'Seguridad', options: ['Baja', 'Media', 'Alta', 'Crítica'] },
    { typeName: 'Máquina', name: 'Observaciones técnicas', fieldType: 'TEXTAREA', group: 'General' },
    { typeName: 'Instrumento', name: 'Marca', fieldType: 'TEXT', group: 'Identificación' },
    { typeName: 'Instrumento', name: 'Rango de medida', fieldType: 'TEXT', group: 'Metrología' },
    { typeName: 'Instrumento', name: 'Precisión', fieldType: 'NUMBER', group: 'Metrología', unit: '%' },
    { typeName: 'Instrumento', name: 'Próxima calibración', fieldType: 'DATE', group: 'Metrología' },
    { typeName: 'Instrumento', name: 'Laboratorio habitual', fieldType: 'SELECT', group: 'Metrología', options: ['Interno', 'ENAC externo', 'Fabricante'] },
    { typeName: 'Extintor', name: 'Agente extintor', fieldType: 'SELECT', group: 'Especificaciones', options: ['CO2', 'Polvo ABC', 'Agua', 'Espuma'] },
    { typeName: 'Extintor', name: 'Capacidad', fieldType: 'NUMBER', group: 'Especificaciones', unit: 'kg' },
    { typeName: 'Extintor', name: 'Próxima revisión', fieldType: 'DATE', group: 'Mantenimiento' },
    { typeName: 'Extintor', name: 'Fecha de retimbrado', fieldType: 'DATE', group: 'Mantenimiento' },
    { typeName: 'Vehículo', name: 'Matrícula', fieldType: 'TEXT', group: 'Identificación', required: true },
    { typeName: 'Vehículo', name: 'Kilometraje', fieldType: 'NUMBER', group: 'Uso', unit: 'km' },
    { typeName: 'Vehículo', name: 'Combustible', fieldType: 'SELECT', group: 'Especificaciones', options: ['Diésel', 'Gasolina', 'Eléctrico', 'Híbrido'] },
    { typeName: 'Vehículo', name: 'Próxima ITV', fieldType: 'DATE', group: 'Mantenimiento' },
    { typeName: 'Servidor', name: 'Sistema operativo', fieldType: 'TEXT', group: 'Sistema' },
    { typeName: 'Servidor', name: 'Dirección IP', fieldType: 'TEXT', group: 'Red' },
    { typeName: 'Servidor', name: 'Próximo backup verificado', fieldType: 'DATE', group: 'Continuidad' },
  ]
  const project = await prisma.project.findUniqueOrThrow({ where: { code: PROJECT_CODE }, select: { id: true } })
  for (const [index, definition] of dynamicSeeds.entries()) {
    const assetType = await prisma.assetType.findUniqueOrThrow({ where: { projectId_name: { projectId: project.id, name: definition.typeName } }, select: { id: true } })
    await prisma.dynamicFieldDefinition.create({
      data: {
        projectId: project.id,
        key: `${fieldKey(definition.name)}-${index + 1}`,
        fieldName: definition.name,
        fieldType: definition.fieldType,
        groupName: definition.group,
        required: definition.required ?? false,
        unit: definition.unit,
        sortOrder: index,
        assetTypes: { create: { assetTypeId: assetType.id } },
        options: { create: (definition.options ?? []).map((label, optionIndex) => ({ key: `${fieldKey(label)}-${optionIndex + 1}`, label, sortOrder: optionIndex })) },
      },
    })
  }
  const cnc = await prisma.asset.findUniqueOrThrow({ where: { code: 'CNC-05' }, select: { id: true } })
  const cncValues = [
    { name: 'Fabricante', textValue: 'Haas Automation' },
    { name: 'Modelo', textValue: 'ST-20' },
    { name: 'Potencia', numberValue: 14.9 },
    { name: 'Tensión', numberValue: 400 },
    { name: 'Zona ATEX', booleanValue: false },
  ]
  for (const value of cncValues) {
    const definition = await prisma.dynamicFieldDefinition.findFirstOrThrow({ where: { projectId: project.id, fieldName: value.name }, select: { id: true } })
    await prisma.assetDynamicFieldValue.create({ data: { assetId: cnc.id, definitionId: definition.id, textValue: 'textValue' in value ? value.textValue : undefined, numberValue: 'numberValue' in value ? value.numberValue : undefined, booleanValue: 'booleanValue' in value ? value.booleanValue : undefined } })
  }

  console.log('  • Related events (3) + document versions (207 logical documents)')
  const eventData = [
    { assetCode: 'CP-02', title: 'Revisión urgente', date: '12/07/2026', type: 'Mantenimiento correctivo' },
    { assetCode: 'EXT-A12', title: 'Revisión anual', date: '24/07/2026', type: 'Inspección reglamentaria' },
    { assetCode: 'SRV-03', title: 'Revisión firmware', date: '12/08/2026', type: 'Mantenimiento de sistemas' },
  ]
  for (const event of eventData) {
    const asset = await prisma.asset.findUniqueOrThrow({ where: { code: event.assetCode }, select: { id: true, projectId: true } })
    await prisma.event.create({
      data: {
        title: event.title,
        date: isoFromEu(event.date),
        type: event.type,
        projectId: asset.projectId,
        assetId: asset.id,
      },
    })
  }

  const documentData = [
    { assetCode: 'VH-014', name: 'Certificado ITV 2025', eventTitle: 'ITV', type: 'Certificado', issueDate: '14/07/2025', expiryDate: '13/07/2026', periodicity: 'Anual', periodicityMode: 'Calendario', fileName: 'certificado-itv-2025.pdf', content: 'ITV 2025', sizeBytes: 2_400_000 },
    { assetCode: 'MG-203', name: 'Certificado calibración WIKA', eventTitle: 'Calibración anual', type: 'Calibración', issueDate: '19/07/2025', expiryDate: '19/07/2026', periodicity: 'Anual', periodicityMode: 'Calendario', fileName: 'calibracion-wika.pdf', content: 'CALIBRACION WIKA', sizeBytes: 1_100_000 },
    { assetCode: 'CNC-05', name: 'Manual técnico Haas ST-20', type: 'Manual', issueDate: '02/03/2024', expiryDate: null, periodicity: null, periodicityMode: null, fileName: 'manual-haas-st20.pdf', content: 'MANUAL HAAS ST-20', sizeBytes: 4_800_000, previous: { issueDate: '02/03/2023', expiryDate: null, fileName: 'manual-haas-st20-v2.pdf', content: 'MANUAL HAAS V2' } },
    { assetCode: 'EXT-A12', name: 'Acta revisión extintor A12', eventTitle: 'Revisión anual', type: 'Acta', issueDate: '24/07/2025', expiryDate: '24/07/2026', periodicity: 'Anual', periodicityMode: 'Calendario', fileName: 'acta-extintor-a12.pdf', content: 'ACTA EXTINTOR A12', sizeBytes: 840_000 },
    { assetCode: 'CP-02', name: 'Contrato servicio Limpiezas Veloz', type: 'Contrato', issueDate: '12/08/2025', expiryDate: '12/08/2026', periodicity: 'Anual', periodicityMode: 'Subida', fileName: 'contrato-limpiezas.pdf', content: 'CONTRATO LIMPIEZAS', sizeBytes: 620_000 },
  ]
  for (const [index, document] of documentData.entries()) {
    const logicalDocument = await prisma.document.create({
      data: {
        name: document.name,
        eventTitle: document.eventTitle,
        type: document.type,
        periodicity: document.periodicity,
        periodicityMode: document.periodicityMode,
        createdAt: new Date(Date.UTC(2026, 6, 14, 11, 2, 10 - index)),
        updatedAt: new Date(Date.UTC(2026, 6, 14, 11, 2, 10 - index)),
        project: { connect: { code: PROJECT_CODE } },
        assets: { create: [{ asset: { connect: { code: document.assetCode } } }] },
      },
    })
    if (document.previous) {
      const previousContent = createSeedPdfBuffer(document.previous.content)
      const storageKey = await storeDocumentBuffer(previousContent, 'application/pdf')
      await prisma.documentVersion.create({ data: { documentId: logicalDocument.id, version: 1, originalName: document.previous.fileName, storageKey, mimeType: 'application/pdf', sizeBytes: previousContent.length, issueDate: isoFromEu(document.previous.issueDate), expiryDate: document.previous.expiryDate ? isoFromEu(document.previous.expiryDate) : null, uploadedAt: isoFromEu('14/07/2026', '11:01') } })
    }
    const content = createSeedPdfBuffer(document.content, document.sizeBytes)
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
      const content = createSeedPdfBuffer(`CANONICAL-${group.expiryDate ?? 'CURRENT'}-${index + 1}`)
      const storageKey = await storeDocumentBuffer(content, 'application/pdf')
      await prisma.documentVersion.create({ data: { documentId: document.id, version: 1, originalName: `canonico-${document.id}.pdf`, storageKey, mimeType: 'application/pdf', sizeBytes: content.length, issueDate: isoFromEu('01/01/2026'), expiryDate: group.expiryDate ? isoFromEu(group.expiryDate) : null, uploadedAt: isoFromEu('14/07/2026', '11:02') } })
    }
  }

  console.log('  • Floor plan versionado + marcadores')
  const floorPlan = await prisma.floorPlan.create({
    data: {
      name: 'Plano Planta 1 · Nave A',
      project: { connect: { code: PROJECT_CODE } },
      location: { connect: { code: 'PIN-NA-01A' } },
    },
  })
  const floorPlanBytes = await readFile(path.join(process.cwd(), 'public', 'floor-plan.png'))
  const storedFloorPlan = await storeFloorPlanBuffer(floorPlanBytes, 'image/png')
  await prisma.floorPlanVersion.create({
    data: { floorPlanId: floorPlan.id, version: 1, originalName: 'plano-planta-1-nave-a.png', mimeType: 'image/png', sizeBytes: floorPlanBytes.length, ...storedFloorPlan },
  })
  const directAssets = await prisma.asset.findMany({
    where: { location: { code: 'PIN-NA-01A' }, deletedAt: null },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: 5,
  })
  await prisma.floorPlanMarker.createMany({
    data: directAssets.map((asset, index) => ({ floorPlanId: floorPlan.id, assetId: asset.id, x: [0.18, 0.42, 0.72, 0.28, 0.55][index], y: [0.32, 0.5, 0.28, 0.72, 0.78][index] })),
  })
  console.log(`    floorPlan #${floorPlan.id} created`)

  console.log('  • Audit logs (5)')
  const auditData: Array<{ email: string; action: string; entityId: string; detail: string; timestamp: string }> = [
    { email: 'jr@docucore.local', action: 'Completó evento', entityId: 'EXT-A12', detail: 'Revisión anual completada · próxima 15/07/2027', timestamp: '15/07/2026 10:32' },
    { email: 'maria@docucore.local', action: 'Creación', entityId: 'BH-04', detail: 'Nuevo activo "Bomba hidráulica BH-04" creado', timestamp: '15/07/2026 09:15' },
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
