import { FieldType, Prisma } from '@prisma/client'
import { z } from 'zod'

export const dynamicFieldTypes = ['TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'SELECT', 'MULTISELECT', 'BOOLEAN'] as const

const optionSchema = z.object({ key: z.string().trim().min(1).max(80).optional(), label: z.string().trim().min(1).max(120) }).strict()

const dynamicFieldDefinitionBaseSchema = z.object({
  fieldName: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  groupName: z.string().trim().min(1).max(80).default('General'),
  fieldType: z.enum(dynamicFieldTypes),
  required: z.boolean().default(false),
  placeholder: z.string().trim().max(160).nullable().optional(),
  unit: z.string().trim().max(30).nullable().optional(),
  minValue: z.number().finite().nullable().optional(),
  maxValue: z.number().finite().nullable().optional(),
  decimalPlaces: z.number().int().min(0).max(6).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  assetTypeIds: z.array(z.number().int().positive()).min(1),
  options: z.array(optionSchema).max(100).default([]),
}).strict()

function validateDefinition(value: Partial<z.infer<typeof dynamicFieldDefinitionBaseSchema>>, ctx: z.RefinementCtx) {
  const selection = value.fieldType === 'SELECT' || value.fieldType === 'MULTISELECT'
  if (selection && value.options?.length === 0) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Selection fields require options' })
  if (value.fieldType && !selection && (value.options?.length ?? 0) > 0) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Only selection fields accept options' })
  if (value.minValue !== null && value.minValue !== undefined && value.maxValue !== null && value.maxValue !== undefined && value.minValue > value.maxValue) ctx.addIssue({ code: 'custom', path: ['maxValue'], message: 'maxValue must be greater than or equal to minValue' })
}

export const dynamicFieldDefinitionSchema = dynamicFieldDefinitionBaseSchema.superRefine(validateDefinition)

export const dynamicFieldDefinitionUpdateSchema = dynamicFieldDefinitionBaseSchema.partial().superRefine(validateDefinition)

export const dynamicFieldValuesSchema = z.object({
  values: z.array(z.object({ definitionId: z.number().int().positive(), value: z.unknown() }).strict()).max(200),
}).strict()

export const completeDynamicDateSchema = z.object({
  performedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict()

export const dateScheduleValueSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  periodicity: z.enum(['Mensual', 'Bimestral', 'Trimestral', 'Cuatrimestral', 'Semestral', 'Anual']).nullable(),
  periodicityMode: z.enum(['Calendario', 'Subida']).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.periodicity && !value.periodicityMode) ctx.addIssue({ code: 'custom', path: ['periodicityMode'], message: 'periodicityMode requires periodicity' })
  if (!value.periodicity && value.periodicityMode) ctx.addIssue({ code: 'custom', path: ['periodicityMode'], message: 'periodicityMode requires periodicity' })
})

export function fieldKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'campo'
}

export const definitionInclude = {
  assetTypes: { include: { assetType: { select: { id: true, name: true } } }, orderBy: { assetTypeId: 'asc' as const } },
  options: { orderBy: { sortOrder: 'asc' as const } },
  _count: { select: { values: true } },
} satisfies Prisma.DynamicFieldDefinitionInclude

export type DefinitionWithRelations = Prisma.DynamicFieldDefinitionGetPayload<{ include: typeof definitionInclude }>

export function serializeDefinition(definition: DefinitionWithRelations) {
  return {
    ...definition,
    assetTypes: definition.assetTypes.map((link) => link.assetType),
    assetTypeIds: definition.assetTypes.map((link) => link.assetTypeId),
    usageCount: definition._count.values,
  }
}

export interface StoredDynamicValue {
  textValue: string | null
  numberValue: number | null
  dateValue: Date | null
  booleanValue: boolean | null
  jsonValue: Prisma.JsonValue | null
}

export function storedValue(type: FieldType, row: StoredDynamicValue): unknown {
  if (type === 'NUMBER') return row.numberValue
  if (type === 'DATE') return row.dateValue?.toISOString().slice(0, 10) ?? null
  if (type === 'BOOLEAN') return row.booleanValue
  if (type === 'MULTISELECT') return row.jsonValue
  return row.textValue
}

export function parseDynamicValue(definition: Pick<DefinitionWithRelations, 'fieldType' | 'required' | 'minValue' | 'maxValue' | 'decimalPlaces' | 'options'>, value: unknown) {
  const empty = value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
  if (empty) {
    if (definition.required) throw Object.assign(new Error('Required dynamic field is empty'), { status: 400 })
    return null
  }

  const base = { textValue: null, numberValue: null, dateValue: null, booleanValue: null, jsonValue: Prisma.JsonNull }
  switch (definition.fieldType) {
    case 'TEXT':
    case 'TEXTAREA': {
      if (typeof value !== 'string' || value.length > (definition.fieldType === 'TEXTAREA' ? 5000 : 500)) throw Object.assign(new Error('Invalid text field value'), { status: 400 })
      return { ...base, textValue: value }
    }
    case 'NUMBER': {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw Object.assign(new Error('Invalid number field value'), { status: 400 })
      if (definition.minValue !== null && value < definition.minValue) throw Object.assign(new Error('Number is below the configured minimum'), { status: 400 })
      if (definition.maxValue !== null && value > definition.maxValue) throw Object.assign(new Error('Number is above the configured maximum'), { status: 400 })
      const places = definition.decimalPlaces ?? 6
      if (Number(value.toFixed(places)) !== value) throw Object.assign(new Error('Number has too many decimal places'), { status: 400 })
      return { ...base, numberValue: value }
    }
    case 'DATE': {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Object.assign(new Error('Invalid date field value'), { status: 400 })
      const date = new Date(`${value}T00:00:00.000Z`)
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw Object.assign(new Error('Invalid date field value'), { status: 400 })
      return { ...base, dateValue: date }
    }
    case 'BOOLEAN':
      if (typeof value !== 'boolean') throw Object.assign(new Error('Invalid boolean field value'), { status: 400 })
      return { ...base, booleanValue: value }
    case 'SELECT': {
      if (typeof value !== 'string' || !definition.options.some((option) => option.isActive && option.key === value)) throw Object.assign(new Error('Invalid selection field value'), { status: 400 })
      return { ...base, textValue: value }
    }
    case 'MULTISELECT': {
      if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string') || value.some((entry) => !definition.options.some((option) => option.isActive && option.key === entry))) throw Object.assign(new Error('Invalid multiple selection field value'), { status: 400 })
      return { ...base, jsonValue: value as Prisma.InputJsonValue }
    }
  }
}
