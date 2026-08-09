import { describe, expect, it } from 'vitest'
import { allSelectedIds, someSelectedIds, toggleAllIds, toggleId } from '@/hooks/useSelection'

describe('useSelection pure logic', () => {
  describe('toggleId', () => {
    it('adds an id when not present', () => {
      const next = toggleId(new Set<number>(), 1)
      expect(next.has(1)).toBe(true)
      expect(next.size).toBe(1)
    })

    it('removes an id when already present', () => {
      const next = toggleId(new Set([1, 2]), 1)
      expect(next.has(1)).toBe(false)
      expect(next.size).toBe(1)
    })

    it('does not mutate the original set', () => {
      const prev = new Set([1])
      toggleId(prev, 2)
      expect(prev.has(2)).toBe(false)
    })
  })

  describe('toggleAllIds', () => {
    it('selects all when none are selected', () => {
      const next = toggleAllIds(new Set<number>(), [1, 2, 3])
      expect(next.size).toBe(3)
      expect(allSelectedIds(next, [1, 2, 3])).toBe(true)
    })

    it('deselects all when every id is selected', () => {
      const next = toggleAllIds(new Set([1, 2, 3]), [1, 2, 3])
      expect(next.size).toBe(0)
    })

    it('adds missing ids when some are already selected', () => {
      const next = toggleAllIds(new Set([1]), [1, 2, 3])
      expect(next.size).toBe(3)
    })

    it('handles empty ids array gracefully', () => {
      const next = toggleAllIds(new Set([1, 2]), [])
      expect(next.size).toBe(2)
    })

    it('does not mutate the original set', () => {
      const prev = new Set([1])
      toggleAllIds(prev, [1, 2, 3])
      expect(prev.size).toBe(1)
    })
  })

  describe('allSelectedIds', () => {
    it('returns true when all ids are in the set', () => {
      expect(allSelectedIds(new Set([1, 2, 3]), [1, 2, 3])).toBe(true)
    })

    it('returns false when some ids are missing', () => {
      expect(allSelectedIds(new Set([1, 2]), [1, 2, 3])).toBe(false)
    })

    it('returns false for empty ids', () => {
      expect(allSelectedIds(new Set([1]), [])).toBe(false)
    })
  })

  describe('someSelectedIds', () => {
    it('returns false when nothing is selected', () => {
      expect(someSelectedIds(new Set<number>(), [1, 2, 3])).toBe(false)
    })

    it('returns true when a subset is selected (indeterminate)', () => {
      expect(someSelectedIds(new Set([1]), [1, 2, 3])).toBe(true)
    })

    it('returns false when all are selected', () => {
      expect(someSelectedIds(new Set([1, 2, 3]), [1, 2, 3])).toBe(false)
    })
  })
})
