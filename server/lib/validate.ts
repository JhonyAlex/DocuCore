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
  nextEventLabel: z.string().min(1),
  nextEventDate: z.string().min(1),
  nextEventUrgency: z.enum(['amber', 'red', 'slate']),
  dynamicFields: z.record(z.unknown()).optional(),
})

export const updateItemSchema = createItemSchema.partial()

export const changeStatusSchema = z.object({
  statusId: z.number().int().positive(),
})

export type CreateItemInput = z.infer<typeof createItemSchema>
export type UpdateItemInput = z.infer<typeof updateItemSchema>
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>
