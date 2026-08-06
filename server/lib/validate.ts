import { z } from 'zod'

const isoDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in YYYY-MM-DD format')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  }, 'Invalid calendar date')

export const createItemSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  serialNumber: z.string().min(1),
  serialLabel: z.string().min(1),
  installDate: isoDateSchema,
  typeId: z.number().int().positive(),
  statusId: z.number().int().positive(),
  location: z.string().min(1),
  projectId: z.number().int().positive(),
  responsibleId: z.number().int().positive(),
  initials: z.string().min(1),
  dynamicFields: z.record(z.unknown()).optional(),
}).strict()

export const updateItemSchema = createItemSchema.partial()

export const changeStatusSchema = z.object({
  statusId: z.number().int().positive(),
})

const optionalPositiveId = z.preprocess((value) => value === '' || value === undefined ? undefined : Number(value), z.number().int().positive().optional())
const nullableOptionalPositiveId = z.preprocess((value) => value === 'null' || value === null ? null : value === '' || value === undefined ? undefined : Number(value), z.number().int().positive().nullable().optional())
const optionalDateSchema = z.preprocess((value) => value === '' || value === undefined ? undefined : value, isoDateSchema.optional())

export const createDocumentMetadataSchema = z.object({
  name: z.string().trim().min(1).max(160),
  type: z.string().trim().min(1).max(80),
  projectId: z.preprocess((value) => Number(value), z.number().int().positive()),
  itemId: optionalPositiveId,
  issueDate: isoDateSchema,
  expiryDate: optionalDateSchema,
}).strict()

export const updateDocumentMetadataSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  type: z.string().trim().min(1).max(80).optional(),
  projectId: z.preprocess((value) => value === undefined ? undefined : Number(value), z.number().int().positive().optional()),
  itemId: z.preprocess((value) => value === null || value === '' ? null : Number(value), z.number().int().positive().nullable().optional()),
}).strict()

export const documentListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1).optional(),
  status: z.enum(['Vigente', 'Por vencer', 'Vencido']).optional(),
  projectId: optionalPositiveId,
  itemId: nullableOptionalPositiveId,
  page: z.preprocess((value) => value === undefined ? 1 : Number(value), z.number().int().positive()),
  limit: z.preprocess((value) => value === undefined ? 10 : Number(value), z.number().int().positive().max(100)),
}).strict()

export type CreateItemInput = z.infer<typeof createItemSchema>
export type UpdateItemInput = z.infer<typeof updateItemSchema>
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>
