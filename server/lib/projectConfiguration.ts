import type { Prisma } from '@prisma/client'

type Transaction = Prisma.TransactionClient

export async function createMinimalProjectConfiguration(tx: Transaction, projectId: number): Promise<void> {
  await tx.status.createMany({
    data: [
      { projectId, name: 'Activo', color: 'emerald', pulseDot: null, sortOrder: 0 },
      { projectId, name: 'Fuera de servicio', color: 'red', pulseDot: 'red', sortOrder: 1 },
    ],
  })
  await tx.assetType.create({ data: { projectId, name: 'General', iconKey: 'package', sortOrder: 0 } })
  await tx.documentType.create({ data: { projectId, name: 'General', iconKey: 'file-text', sortOrder: 0 } })
}

/** Replaces only configuration in a project already verified as operationally empty. */
export async function clearProjectConfiguration(tx: Transaction, projectId: number): Promise<void> {
  await tx.preventivePlan.deleteMany({ where: { projectId } })
  await tx.dynamicFieldDefinition.deleteMany({ where: { projectId } })
  await tx.status.deleteMany({ where: { projectId } })
  await tx.task.deleteMany({ where: { projectId } })
  await tx.assetType.deleteMany({ where: { projectId } })
  await tx.documentType.deleteMany({ where: { projectId } })
}

/** Copies catalog configuration only. Operational rows are intentionally absent. */
export async function copyProjectConfiguration(tx: Transaction, sourceProjectId: number, targetProjectId: number): Promise<void> {
  const [statuses, assetTypes, documentTypes, definitions, tasks, plans] = await Promise.all([
    tx.status.findMany({ where: { projectId: sourceProjectId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    tx.assetType.findMany({ where: { projectId: sourceProjectId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    tx.documentType.findMany({ where: { projectId: sourceProjectId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    tx.dynamicFieldDefinition.findMany({
      where: { projectId: sourceProjectId },
      include: { options: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }, assetTypes: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    }),
    tx.task.findMany({ where: { projectId: sourceProjectId }, orderBy: [{ code: 'asc' }, { id: 'asc' }] }),
    tx.preventivePlan.findMany({
      where: { projectId: sourceProjectId },
      include: { tasks: { orderBy: [{ sortOrder: 'asc' }, { taskId: 'asc' }] }, assetTypes: true },
      orderBy: [{ id: 'asc' }],
    }),
  ])

  if (statuses.length) {
    await tx.status.createMany({ data: statuses.map(({ id: _id, projectId: _projectId, createdAt: _createdAt, updatedAt: _updatedAt, ...row }) => ({ ...row, projectId: targetProjectId })) })
  }

  if (documentTypes.length) {
    await tx.documentType.createMany({ data: documentTypes.map(({ id: _id, projectId: _projectId, createdAt: _createdAt, updatedAt: _updatedAt, ...row }) => ({ ...row, projectId: targetProjectId })) })
  }

  const typeIds = new Map<number, number>()
  for (const source of assetTypes) {
    const target = await tx.assetType.create({
      data: {
        projectId: targetProjectId,
        name: source.name,
        iconKey: source.iconKey,
        sortOrder: source.sortOrder,
        isActive: source.isActive,
      },
      select: { id: true },
    })
    typeIds.set(source.id, target.id)
  }

  for (const source of definitions) {
    const target = await tx.dynamicFieldDefinition.create({
      data: {
        projectId: targetProjectId,
        key: source.key,
        fieldName: source.fieldName,
        description: source.description,
        groupName: source.groupName,
        fieldType: source.fieldType,
        required: source.required,
        placeholder: source.placeholder,
        unit: source.unit,
        minValue: source.minValue,
        maxValue: source.maxValue,
        decimalPlaces: source.decimalPlaces,
        defaultValue: source.defaultValue ?? undefined,
        sortOrder: source.sortOrder,
        isActive: source.isActive,
      },
      select: { id: true },
    })
    if (source.options.length) {
      await tx.dynamicFieldOption.createMany({
        data: source.options.map((option) => ({ key: option.key, label: option.label, sortOrder: option.sortOrder, isActive: option.isActive, definitionId: target.id })),
      })
    }
    const links = source.assetTypes.flatMap((link) => {
      const assetTypeId = typeIds.get(link.assetTypeId)
      return assetTypeId ? [{ definitionId: target.id, assetTypeId }] : []
    })
    if (links.length) await tx.dynamicFieldDefinitionAssetType.createMany({ data: links })
  }

  const taskIds = new Map<number, number>()
  for (const source of tasks) {
    const target = await tx.task.create({
      data: { projectId: targetProjectId, code: source.code, name: source.name, isActive: source.isActive },
      select: { id: true },
    })
    taskIds.set(source.id, target.id)
  }

  for (const source of plans) {
    const target = await tx.preventivePlan.create({
      data: {
        projectId: targetProjectId,
        name: source.name,
        description: source.description,
        periodicity: source.periodicity,
        periodicityMode: source.periodicityMode,
        isActive: source.isActive,
      },
      select: { id: true },
    })
    const taskLinks = source.tasks.flatMap((link) => {
      const taskId = taskIds.get(link.taskId)
      return taskId ? [{ planId: target.id, taskId, sortOrder: link.sortOrder }] : []
    })
    const typeLinks = source.assetTypes.flatMap((link) => {
      const assetTypeId = typeIds.get(link.assetTypeId)
      return assetTypeId ? [{ planId: target.id, assetTypeId }] : []
    })
    if (taskLinks.length) await tx.preventivePlanTask.createMany({ data: taskLinks })
    if (typeLinks.length) await tx.preventivePlanAssetType.createMany({ data: typeLinks })
  }
}
