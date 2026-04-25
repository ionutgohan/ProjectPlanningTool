import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CALENDAR,
  addWorkingDays,
  diffWorkingDays,
  isWorkingDay,
  workingDaysInRange,
} from '@/domain/calendar'
import { isoDate } from '@/domain/types'

describe('calendar', () => {
  it('identifies weekends as non-working by default', () => {
    expect(isWorkingDay(isoDate('2026-04-18'), DEFAULT_CALENDAR)).toBe(false) // Saturday
    expect(isWorkingDay(isoDate('2026-04-19'), DEFAULT_CALENDAR)).toBe(false) // Sunday
    expect(isWorkingDay(isoDate('2026-04-20'), DEFAULT_CALENDAR)).toBe(true)  // Monday
  })

  it('respects configured holidays', () => {
    const cal = { ...DEFAULT_CALENDAR, holidays: [isoDate('2026-04-20')] }
    expect(isWorkingDay(isoDate('2026-04-20'), cal)).toBe(false)
  })

  it('addWorkingDays skips weekends', () => {
    // Friday 2026-04-17 + 1 working day = Monday 2026-04-20
    expect(addWorkingDays(isoDate('2026-04-17'), 1, DEFAULT_CALENDAR)).toBe('2026-04-20')
  })

  it('addWorkingDays with 0 returns same day when working', () => {
    expect(addWorkingDays(isoDate('2026-04-20'), 0, DEFAULT_CALENDAR)).toBe('2026-04-20')
  })

  it('addWorkingDays from non-working day snaps forward first', () => {
    expect(addWorkingDays(isoDate('2026-04-18'), 0, DEFAULT_CALENDAR)).toBe('2026-04-20')
  })

  it('addWorkingDays across month boundary', () => {
    // Mon 2026-04-27 + 5 working days -> Mon 2026-05-04
    expect(addWorkingDays(isoDate('2026-04-27'), 5, DEFAULT_CALENDAR)).toBe('2026-05-04')
  })

  it('addWorkingDays across year boundary and holiday', () => {
    const cal = { ...DEFAULT_CALENDAR, holidays: [isoDate('2026-12-25'), isoDate('2027-01-01')] }
    // Mon 2026-12-21 + 10 wd — skip holidays and weekends
    const result = addWorkingDays(isoDate('2026-12-21'), 10, cal)
    expect(result).toBe('2027-01-06')
  })

  it('diffWorkingDays inclusive count', () => {
    // Mon..Fri = 5 working days
    expect(diffWorkingDays(isoDate('2026-04-20'), isoDate('2026-04-24'), DEFAULT_CALENDAR)).toBe(5)
  })

  it('diffWorkingDays skips weekend span', () => {
    expect(diffWorkingDays(isoDate('2026-04-17'), isoDate('2026-04-20'), DEFAULT_CALENDAR)).toBe(2)
  })

  it('workingDaysInRange lists only working days', () => {
    const days = workingDaysInRange(isoDate('2026-04-17'), isoDate('2026-04-21'), DEFAULT_CALENDAR)
    expect(days).toEqual(['2026-04-17', '2026-04-20', '2026-04-21'])
  })
})
