import { z } from 'zod'
import { isDocumentIconKey } from '../../shared/documentIconCatalog'

const documentTypeName = z.string().trim().min(1).max(80)
const documentIconKey = z.string().refine(isDocumentIconKey, 'Unknown document icon')

export const documentTypeCreateSchema = z.object({
  name: documentTypeName,
  iconKey: documentIconKey.optional(),
  sortOrder: z.number().int().min(0).optional(),
}).strict()

export const documentTypeUpdateSchema = z.object({
  name: documentTypeName.optional(),
  iconKey: documentIconKey.optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' })

export function projectIdOf(value: string | undefined): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw Object.assign(new Error('Invalid project id'), { status: 400 })
  return id
}
