import { describe, expect, it } from 'vitest'
import { useTableDragScroll } from '@/hooks/useTableDragScroll'

describe('useTableDragScroll hook', () => {
  it('is a function exported by @/hooks/useTableDragScroll', () => {
    expect(typeof useTableDragScroll).toBe('function')
  })
})
