import { z } from 'zod'
import { isStatusColorKey } from '../../shared/statusCatalog'

const statusName = z.string().trim().min(1).max(80)
const statusColor = z.string().refine(isStatusColorKey, 'Unknown status color')
const pulseDot = z.enum(['red', 'amber', 'emerald', 'brand', 'indigo', 'purple', 'cyan', 'slate']).nullable().optional()

export const statusCreateSchema = z.object({
  name: statusName,
  color: statusColor.optional(),
  pulseDot: pulseDot,
  sortOrder: z.number().int().min(0).optional(),
}).strict()

export const statusUpdateSchema = z.object({
  name: statusName.optional(),
  color: statusColor.optional(),
  pulseDot: pulseDot,
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' })

export function projectIdOf(value: string | undefined): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw Object.assign(new Error('Invalid project id'), { status: 400 })
  return id
}
