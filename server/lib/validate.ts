import { z } from 'zod'

export const createItemSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  serialNumber: z.string().min(1),
  serialLabel: z.string().min(1),
  installDate: z.string().min(1),
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
