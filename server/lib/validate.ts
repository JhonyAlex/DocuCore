import { z } from 'zod'

const isoDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in YYYY-MM-DD format')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  }, 'Invalid calendar date')

export const createAssetSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  serialNumber: z.string().min(1),
  installDate: isoDateSchema,
  typeId: z.number().int().positive(),
  statusId: z.number().int().positive(),
  locationId: z.number().int().positive(),
  projectId: z.number().int().positive(),
  responsibleId: z.number().int().positive(),
  initials: z.string().min(1),
  dynamicFields: z.record(z.unknown()).optional(),
}).strict()

export const updateAssetSchema = createAssetSchema.partial()

export const changeStatusSchema = z.object({
  statusId: z.number().int().positive(),
})

export const createLocationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(160).optional(),
  code: z.string().trim().min(1).max(40),
  surface: z.string().trim().min(1).max(60),
  parentId: z.number().int().positive().nullable(),
  responsibleId: z.number().int().positive(),
  projectId: z.number().int().positive(),
}).strict()

export const updateLocationSchema = createLocationSchema.partial()

const optionalPositiveId = z.preprocess((value) => value === '' || value === undefined ? undefined : Number(value), z.number().int().positive().optional())
const nullableOptionalPositiveId = z.preprocess((value) => value === 'null' || value === null ? null : value === '' || value === undefined ? undefined : Number(value), z.number().int().positive().nullable().optional())
const optionalDateSchema = z.preprocess((value) => value === '' || value === undefined ? undefined : value, isoDateSchema.optional())
const nullableOptionalDateSchema = z.preprocess((value) => value === '' ? null : value, isoDateSchema.nullable().optional())

// assetIds viaja como string JSON en FormData (multipart) y como array en JSON.
function parseAssetIds(value: unknown): unknown {
  if (value === undefined || value === '') return undefined
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed
    } catch {
      return value
    }
  }
  return value
}

const optionalAssetIds = z.preprocess(parseAssetIds, z.array(z.number().int().positive()).max(20).optional())
const nullableOptionalAssetIds = z.preprocess((value) => {
  if (value === null || value === '') return null
  const parsed = parseAssetIds(value)
  if (Array.isArray(parsed) && parsed.length === 0) return null
  return parsed
}, z.array(z.number().int().positive()).max(20).nullable().optional())

// DOC-03: periodicidad y modo viajan como strings en FormData (multipart) o
// JSON; '' equivale a no enviado y null (solo update, JSON) quita la regla.
const optionalPeriodicity = z.preprocess((value) => value === '' || value === undefined ? undefined : value, z.enum(['Mensual', 'Bimestral', 'Trimestral', 'Cuatrimestral', 'Semestral', 'Anual']).optional())
const optionalPeriodicityMode = z.preprocess((value) => value === '' || value === undefined ? undefined : value, z.enum(['Calendario', 'Subida']).optional())
const nullableOptionalPeriodicity = optionalPeriodicity.nullable()
const nullableOptionalPeriodicityMode = optionalPeriodicityMode.nullable()

export const createDocumentMetadataSchema = z.object({
  name: z.string().trim().min(1).max(160),
  type: z.string().trim().min(1).max(80),
  projectId: z.preprocess((value) => Number(value), z.number().int().positive()),
  assetIds: optionalAssetIds,
  issueDate: isoDateSchema,
  expiryDate: optionalDateSchema,
  periodicity: optionalPeriodicity,
  periodicityMode: optionalPeriodicityMode,
}).strict().refine((value) => !value.periodicityMode || value.periodicity !== undefined, {
  message: 'periodicityMode requires periodicity',
  path: ['periodicityMode'],
})

// Fechas de una versión nueva (POST /documents/:id/versions): el resto de
// metadatos del documento no se reescribe al subir una versión.
export const documentVersionMetadataSchema = z.object({
  issueDate: isoDateSchema,
  expiryDate: optionalDateSchema,
}).strict()

export const updateDocumentMetadataSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  type: z.string().trim().min(1).max(80).optional(),
  projectId: z.preprocess((value) => value === undefined ? undefined : Number(value), z.number().int().positive().optional()),
  assetIds: nullableOptionalAssetIds,
  issueDate: optionalDateSchema,
  expiryDate: nullableOptionalDateSchema,
  periodicity: nullableOptionalPeriodicity,
  periodicityMode: nullableOptionalPeriodicityMode,
}).strict()

export const documentListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1).optional(),
  status: z.enum(['Vigente', 'Por vencer', 'Vencido']).optional(),
  projectId: optionalPositiveId,
  assetId: nullableOptionalPositiveId,
  page: z.preprocess((value) => value === undefined ? 1 : Number(value), z.number().int().positive()),
  limit: z.preprocess((value) => value === undefined ? 10 : Number(value), z.number().int().positive().max(100)),
}).strict()

export type CreateAssetInput = z.infer<typeof createAssetSchema>
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>
export type CreateLocationInput = z.infer<typeof createLocationSchema>
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>
