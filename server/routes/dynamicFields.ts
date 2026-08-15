import { Router } from 'express'
import prisma from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { definitionInclude, dynamicFieldDefinitionSchema, dynamicFieldDefinitionUpdateSchema, fieldKey, serializeDefinition } from '../lib/dynamicFields'
import { actorIdFromRequest, scopedProjectId } from '../lib/projectScope'

const router: Router = Router({ mergeParams: true })

async function uniqueKey(projectId: number, name: string, excludeId?: number): Promise<string> {
  const base = fieldKey(name)
  let candidate = base
  let suffix = 2
  while (await prisma.dynamicFieldDefinition.findFirst({ where: { projectId, key: candidate, id: excludeId ? { not: excludeId } : undefined }, select: { id: true } })) candidate = `${base}-${suffix++}`
  return candidate
}

router.get('/', asyncHandler(async (req, res) => {
  const projectId = scopedProjectId(req)
  const assetTypeId = req.query.assetTypeId ? Number(req.query.assetTypeId) : null
  const includeInactive = req.query.includeInactive === 'true'
  const definitions = await prisma.dynamicFieldDefinition.findMany({
    where: { projectId, isActive: includeInactive ? undefined : true, assetTypes: assetTypeId ? { some: { assetTypeId } } : undefined },
    include: definitionInclude,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  })
  res.json(definitions.map(serializeDefinition))
}))

router.post('/', asyncHandler(async (req, res) => {
  const projectId = scopedProjectId(req)
  const input = dynamicFieldDefinitionSchema.parse(req.body)
  const types = await prisma.assetType.count({ where: { id: { in: input.assetTypeIds }, projectId, isActive: true } })
  if (types !== new Set(input.assetTypeIds).size) return res.status(400).json({ error: 'Unknown asset type' })
  const key = await uniqueKey(projectId, input.fieldName)
  const created = await prisma.$transaction(async (tx) => {
    const definition = await tx.dynamicFieldDefinition.create({
      data: {
        projectId, key, fieldName: input.fieldName, description: input.description ?? null, groupName: input.groupName,
        fieldType: input.fieldType, required: input.required, placeholder: input.placeholder ?? null, unit: input.unit ?? null,
        minValue: input.minValue ?? null, maxValue: input.maxValue ?? null, decimalPlaces: input.decimalPlaces ?? null,
        sortOrder: input.sortOrder ?? 0, isActive: input.isActive ?? true,
        assetTypes: { create: [...new Set(input.assetTypeIds)].map((assetTypeId) => ({ assetTypeId })) },
        options: { create: input.options.map((option, index) => ({ key: option.key ?? `${fieldKey(option.label)}-${index + 1}`, label: option.label, sortOrder: index })) },
      },
      include: definitionInclude,
    })
    await tx.auditLog.create({ data: { projectId, userId: actorIdFromRequest(req), action: 'Creación', entityId: `dynamic-field:${definition.id}`, detail: `Campo dinámico "${definition.fieldName}" creado`, timestamp: new Date() } })
    return definition
  })
  res.status(201).json(serializeDefinition(created))
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const projectId = scopedProjectId(req)
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })
  const input = dynamicFieldDefinitionUpdateSchema.parse(req.body)
  const before = await prisma.dynamicFieldDefinition.findFirst({ where: { id, projectId }, include: definitionInclude })
  if (!before) return res.status(404).json({ error: 'Not found' })
  if (input.assetTypeIds) {
    const types = await prisma.assetType.count({ where: { id: { in: input.assetTypeIds }, projectId, isActive: true } })
    if (types !== new Set(input.assetTypeIds).size) return res.status(400).json({ error: 'Unknown asset type' })
  }
  if (input.fieldType && input.fieldType !== before.fieldType && before._count.values > 0) return res.status(409).json({ error: 'A field with values cannot change type' })
  const updated = await prisma.$transaction(async (tx) => {
    if (input.assetTypeIds) {
      await tx.dynamicFieldDefinitionAssetType.deleteMany({ where: { definitionId: id } })
      await tx.dynamicFieldDefinitionAssetType.createMany({ data: [...new Set(input.assetTypeIds)].map((assetTypeId) => ({ definitionId: id, assetTypeId })) })
    }
    if (input.options) {
      const retainedKeys = new Set(input.options.map((option, index) => option.key ?? `${fieldKey(option.label)}-${index + 1}`))
      const values = await tx.assetDynamicFieldValue.findMany({ where: { definitionId: id }, select: { textValue: true, jsonValue: true } })
      const usedKeys = new Set(values.flatMap((value) => [value.textValue, ...(Array.isArray(value.jsonValue) ? value.jsonValue : [])]).filter((value): value is string => typeof value === 'string'))
      if ([...usedKeys].some((key) => !retainedKeys.has(key))) throw Object.assign(new Error('An option in use cannot be removed'), { status: 409 })
      await tx.dynamicFieldOption.deleteMany({ where: { definitionId: id } })
      await tx.dynamicFieldOption.createMany({ data: input.options.map((option, index) => ({ definitionId: id, key: option.key ?? `${fieldKey(option.label)}-${index + 1}`, label: option.label, sortOrder: index })) })
    }
    const { assetTypeIds: _types, options: _options, ...data } = input
    const definition = await tx.dynamicFieldDefinition.update({
      where: { id },
      data: {
        ...data,
        description: input.description === undefined ? undefined : input.description,
        placeholder: input.placeholder === undefined ? undefined : input.placeholder,
        unit: input.unit === undefined ? undefined : input.unit,
      },
      include: definitionInclude,
    })
    await tx.auditLog.create({ data: { projectId, userId: actorIdFromRequest(req), action: 'Actualización', entityId: `dynamic-field:${id}`, detail: `Campo dinámico "${definition.fieldName}" actualizado`, timestamp: new Date() } })
    return definition
  })
  res.json(serializeDefinition(updated))
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  const projectId = scopedProjectId(req)
  const id = Number(req.params.id)
  const definition = await prisma.dynamicFieldDefinition.findFirst({ where: { id, projectId } })
  if (!definition) return res.status(404).json({ error: 'Not found' })
  await prisma.$transaction([
    prisma.dynamicFieldDefinition.update({ where: { id }, data: { isActive: false } }),
    prisma.auditLog.create({ data: { projectId, userId: actorIdFromRequest(req), action: 'Archivo', entityId: `dynamic-field:${id}`, detail: `Campo dinámico "${definition.fieldName}" archivado`, timestamp: new Date() } }),
  ])
  res.status(204).end()
}))

export default router
