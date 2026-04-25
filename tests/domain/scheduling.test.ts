import { describe, expect, it } from 'vitest'
import { DEFAULT_CALENDAR } from '@/domain/calendar'
import {
  computeCascade,
  computeTaskEndDate,
  detectCycles,
  minSuccessorStart,
  violatesDependency,
} from '@/domain/scheduling'
import type { Dependency, Task } from '@/domain/types'
import { isoDate } from '@/domain/types'

const task = (id: string, start: string, md: number): Task => ({
  id,
  type: 'task',
  name: id,
  parentGroupId: null,
  comments: '',
  startDate: isoDate(start),
  estimationMD: md,
  allocations: [],
})

describe('computeTaskEndDate', () => {
  it('1 MD task: end = start', () => {
    expect(computeTaskEndDate(task('t', '2026-04-20', 1), DEFAULT_CALENDAR)).toBe('2026-04-20')
  })

  it('5 MD Mon-start: end Fri', () => {
    expect(computeTaskEndDate(task('t', '2026-04-20', 5), DEFAULT_CALENDAR)).toBe('2026-04-24')
  })

  it('6 MD Mon-start: end next Mon', () => {
    expect(computeTaskEndDate(task('t', '2026-04-20', 6), DEFAULT_CALENDAR)).toBe('2026-04-27')
  })
})

describe('violatesDependency', () => {
  const pred = { startDate: isoDate('2026-04-20'), endDate: isoDate('2026-04-24') }

  it('FS satisfied when successor starts after pred ends', () => {
    const succ = { startDate: isoDate('2026-04-27'), endDate: isoDate('2026-04-28') }
    expect(violatesDependency({ id: 'd', type: 'FS', predecessorId: 'p', successorId: 's' }, pred, succ)).toBe(false)
  })

  it('FS violated when successor starts on same day as pred end', () => {
    const succ = { startDate: isoDate('2026-04-24'), endDate: isoDate('2026-04-25') }
    expect(violatesDependency({ id: 'd', type: 'FS', predecessorId: 'p', successorId: 's' }, pred, succ)).toBe(true)
  })

  it('SS satisfied', () => {
    const succ = { startDate: isoDate('2026-04-20'), endDate: isoDate('2026-04-21') }
    expect(violatesDependency({ id: 'd', type: 'SS', predecessorId: 'p', successorId: 's' }, pred, succ)).toBe(false)
  })

  it('SS violated', () => {
    const succ = { startDate: isoDate('2026-04-17'), endDate: isoDate('2026-04-20') }
    expect(violatesDependency({ id: 'd', type: 'SS', predecessorId: 'p', successorId: 's' }, pred, succ)).toBe(true)
  })

  it('FF satisfied', () => {
    const succ = { startDate: isoDate('2026-04-21'), endDate: isoDate('2026-04-27') }
    expect(violatesDependency({ id: 'd', type: 'FF', predecessorId: 'p', successorId: 's' }, pred, succ)).toBe(false)
  })

  it('FF violated', () => {
    const succ = { startDate: isoDate('2026-04-20'), endDate: isoDate('2026-04-22') }
    expect(violatesDependency({ id: 'd', type: 'FF', predecessorId: 'p', successorId: 's' }, pred, succ)).toBe(true)
  })

  it('SF satisfied', () => {
    const succ = { startDate: isoDate('2026-04-17'), endDate: isoDate('2026-04-20') }
    expect(violatesDependency({ id: 'd', type: 'SF', predecessorId: 'p', successorId: 's' }, pred, succ)).toBe(false)
  })

  it('SF violated', () => {
    const succ = { startDate: isoDate('2026-04-15'), endDate: isoDate('2026-04-17') }
    expect(violatesDependency({ id: 'd', type: 'SF', predecessorId: 'p', successorId: 's' }, pred, succ)).toBe(true)
  })
})

describe('detectCycles', () => {
  it('no cycle in linear chain', () => {
    const deps: Dependency[] = [
      { id: '1', predecessorId: 'a', successorId: 'b', type: 'FS' },
      { id: '2', predecessorId: 'b', successorId: 'c', type: 'FS' },
    ]
    expect(detectCycles(deps)).toEqual([])
  })

  it('detects 2-node cycle', () => {
    const deps: Dependency[] = [
      { id: '1', predecessorId: 'a', successorId: 'b', type: 'FS' },
      { id: '2', predecessorId: 'b', successorId: 'a', type: 'FS' },
    ]
    expect(detectCycles(deps).length).toBeGreaterThan(0)
  })

  it('detects self-loop', () => {
    const deps: Dependency[] = [{ id: '1', predecessorId: 'a', successorId: 'a', type: 'FS' }]
    expect(detectCycles(deps).length).toBeGreaterThan(0)
  })

  it('diamond is not a cycle', () => {
    const deps: Dependency[] = [
      { id: '1', predecessorId: 'a', successorId: 'b', type: 'FS' },
      { id: '2', predecessorId: 'a', successorId: 'c', type: 'FS' },
      { id: '3', predecessorId: 'b', successorId: 'd', type: 'FS' },
      { id: '4', predecessorId: 'c', successorId: 'd', type: 'FS' },
    ]
    expect(detectCycles(deps)).toEqual([])
  })
})

describe('minSuccessorStart', () => {
  const pred = { startDate: isoDate('2026-04-20'), endDate: isoDate('2026-04-24') } // Mon..Fri

  it('FS: next working day after pred end', () => {
    const s = minSuccessorStart(pred, { id: 'd', type: 'FS', predecessorId: 'p', successorId: 's' }, 3, DEFAULT_CALENDAR)
    expect(s).toBe('2026-04-27')
  })

  it('SS: same as pred start', () => {
    const s = minSuccessorStart(pred, { id: 'd', type: 'SS', predecessorId: 'p', successorId: 's' }, 3, DEFAULT_CALENDAR)
    expect(s).toBe('2026-04-20')
  })

  it('FF: 3-day successor ends at Fri, starts Wed', () => {
    const s = minSuccessorStart(pred, { id: 'd', type: 'FF', predecessorId: 'p', successorId: 's' }, 3, DEFAULT_CALENDAR)
    expect(s).toBe('2026-04-22')
  })
})

describe('computeCascade', () => {
  it('shifts successor when predecessor moves forward', () => {
    const deps: Dependency[] = [{ id: 'd', predecessorId: 'a', successorId: 'b', type: 'FS' }]
    const original = new Map([
      ['a', { startDate: isoDate('2026-04-20'), endDate: isoDate('2026-04-22') }],
      ['b', { startDate: isoDate('2026-04-23'), endDate: isoDate('2026-04-24') }],
    ])
    const proposed = new Map([
      ['a', { startDate: isoDate('2026-04-27'), endDate: isoDate('2026-04-29') }], // pushed
      ['b', { startDate: isoDate('2026-04-23'), endDate: isoDate('2026-04-24') }],
    ])
    const durations = new Map([['a', 3], ['b', 2]])
    const { changes } = computeCascade(proposed, original, deps, durations, DEFAULT_CALENDAR)
    expect(changes).toHaveLength(1)
    expect(changes[0]!.itemId).toBe('b')
    expect(changes[0]!.newStart).toBe('2026-04-30')
  })

  it('no changes when predecessor moves earlier (no violation)', () => {
    const deps: Dependency[] = [{ id: 'd', predecessorId: 'a', successorId: 'b', type: 'FS' }]
    const original = new Map([
      ['a', { startDate: isoDate('2026-04-20'), endDate: isoDate('2026-04-22') }],
      ['b', { startDate: isoDate('2026-04-23'), endDate: isoDate('2026-04-24') }],
    ])
    const proposed = new Map([
      ['a', { startDate: isoDate('2026-04-13'), endDate: isoDate('2026-04-15') }],
      ['b', { startDate: isoDate('2026-04-23'), endDate: isoDate('2026-04-24') }],
    ])
    const durations = new Map([['a', 3], ['b', 2]])
    const { changes } = computeCascade(proposed, original, deps, durations, DEFAULT_CALENDAR)
    expect(changes).toHaveLength(0)
  })

  it('transitively cascades through a chain', () => {
    const deps: Dependency[] = [
      { id: 'd1', predecessorId: 'a', successorId: 'b', type: 'FS' },
      { id: 'd2', predecessorId: 'b', successorId: 'c', type: 'FS' },
    ]
    const original = new Map([
      ['a', { startDate: isoDate('2026-04-20'), endDate: isoDate('2026-04-20') }],
      ['b', { startDate: isoDate('2026-04-21'), endDate: isoDate('2026-04-21') }],
      ['c', { startDate: isoDate('2026-04-22'), endDate: isoDate('2026-04-22') }],
    ])
    const proposed = new Map([
      ['a', { startDate: isoDate('2026-04-27'), endDate: isoDate('2026-04-27') }],
      ['b', { startDate: isoDate('2026-04-21'), endDate: isoDate('2026-04-21') }],
      ['c', { startDate: isoDate('2026-04-22'), endDate: isoDate('2026-04-22') }],
    ])
    const durations = new Map([['a', 1], ['b', 1], ['c', 1]])
    const { changes } = computeCascade(proposed, original, deps, durations, DEFAULT_CALENDAR)
    expect(changes.map((c) => c.itemId).sort()).toEqual(['b', 'c'])
  })
})
