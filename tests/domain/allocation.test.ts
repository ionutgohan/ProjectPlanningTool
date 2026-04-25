import { describe, expect, it } from 'vitest'
import { computeDailyLoad, findOverAllocations } from '@/domain/allocation'
import { DEFAULT_CALENDAR } from '@/domain/calendar'
import type { Project } from '@/domain/types'
import { isoDate } from '@/domain/types'

const baseProject = (): Project => ({
  schemaVersion: 1,
  name: 'p',
  calendar: DEFAULT_CALENDAR,
  items: [],
  dependencies: [],
  resources: [
    { id: 'r1', name: 'Alice', role: 'Eng', capacityPct: 100 },
  ],
})

describe('allocation', () => {
  it('sums load across overlapping tasks', () => {
    const p = baseProject()
    p.items = [
      {
        id: 't1',
        type: 'task',
        name: 't1',
        parentGroupId: null,
        comments: '',
        startDate: isoDate('2026-04-20'),
        estimationMD: 3,
        allocations: [{ resourceId: 'r1', allocationPct: 60 }],
      },
      {
        id: 't2',
        type: 'task',
        name: 't2',
        parentGroupId: null,
        comments: '',
        startDate: isoDate('2026-04-21'),
        estimationMD: 2,
        allocations: [{ resourceId: 'r1', allocationPct: 50 }],
      },
    ]
    const load = computeDailyLoad(p).get('r1')!
    expect(load.get(isoDate('2026-04-20'))).toBe(60)
    expect(load.get(isoDate('2026-04-21'))).toBe(110)
    expect(load.get(isoDate('2026-04-22'))).toBe(110)
  })

  it('exactly at capacity is NOT over-allocated', () => {
    const p = baseProject()
    p.items = [
      {
        id: 't1',
        type: 'task',
        name: 't1',
        parentGroupId: null,
        comments: '',
        startDate: isoDate('2026-04-20'),
        estimationMD: 1,
        allocations: [{ resourceId: 'r1', allocationPct: 100 }],
      },
    ]
    expect(findOverAllocations(p)).toEqual([])
  })

  it('flags overage', () => {
    const p = baseProject()
    p.items = [
      {
        id: 't1',
        type: 'task',
        name: 't1',
        parentGroupId: null,
        comments: '',
        startDate: isoDate('2026-04-20'),
        estimationMD: 1,
        allocations: [{ resourceId: 'r1', allocationPct: 100 }],
      },
      {
        id: 't2',
        type: 'task',
        name: 't2',
        parentGroupId: null,
        comments: '',
        startDate: isoDate('2026-04-20'),
        estimationMD: 1,
        allocations: [{ resourceId: 'r1', allocationPct: 50 }],
      },
    ]
    const over = findOverAllocations(p)
    expect(over).toHaveLength(1)
    expect(over[0]!.loadPct).toBe(150)
  })

  it('skips weekends', () => {
    const p = baseProject()
    p.items = [
      {
        id: 't1',
        type: 'task',
        name: 't1',
        parentGroupId: null,
        comments: '',
        startDate: isoDate('2026-04-17'), // Friday
        estimationMD: 2, // Fri, Mon
        allocations: [{ resourceId: 'r1', allocationPct: 50 }],
      },
    ]
    const load = computeDailyLoad(p).get('r1')!
    expect(load.has(isoDate('2026-04-18'))).toBe(false) // Sat
    expect(load.has(isoDate('2026-04-19'))).toBe(false) // Sun
    expect(load.get(isoDate('2026-04-17'))).toBe(50)
    expect(load.get(isoDate('2026-04-20'))).toBe(50)
  })
})
