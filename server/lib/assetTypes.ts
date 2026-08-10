import { z } from 'zod'

const assetTypeName = z.string().trim().min(1).max(80)

export const assetTypeCreateSchema = z.object({
  name: assetTypeName,
  sortOrder: z.number().int().min(0).optional(),
}).strict()

export const assetTypeUpdateSchema = z.object({
  name: assetTypeName.optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' })

export function projectIdOf(value: string | undefined): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw Object.assign(new Error('Invalid project id'), { status: 400 })
  return id
}
