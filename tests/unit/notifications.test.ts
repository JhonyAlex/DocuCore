import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const listNotificationsQuerySchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  filter: z.enum(['all', 'unread', 'critical']).default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sync: z.enum(['true', 'false']).transform((v) => v === 'true').optional().default('true'),
})

const patchReadSchema = z.object({
  read: z.boolean().optional().default(true),
})

describe('notification validation schemas', () => {
  it('parses default query parameters correctly', () => {
    const parsed = listNotificationsQuerySchema.parse({})
    expect(parsed).toEqual({
      filter: 'all',
      limit: 20,
      sync: true,
    })
  })

  it('parses custom filter and limit within bounds', () => {
    const parsed = listNotificationsQuerySchema.parse({
      projectId: '2',
      filter: 'unread',
      limit: '10',
      sync: 'false',
    })
    expect(parsed).toEqual({
      projectId: 2,
      filter: 'unread',
      limit: 10,
      sync: false,
    })
  })

  it('rejects invalid filter or out-of-range limit', () => {
    expect(() => listNotificationsQuerySchema.parse({ filter: 'invalid' })).toThrow()
    expect(() => listNotificationsQuerySchema.parse({ limit: '0' })).toThrow()
    expect(() => listNotificationsQuerySchema.parse({ limit: '100' })).toThrow()
  })

  it('parses patch read body with defaults', () => {
    expect(patchReadSchema.parse({})).toEqual({ read: true })
    expect(patchReadSchema.parse({ read: false })).toEqual({ read: false })
  })
})
