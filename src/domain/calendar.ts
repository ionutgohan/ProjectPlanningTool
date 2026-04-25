import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { Calendar, ISODate, Weekday } from './types'
import { isoDate } from './types'

const WEEKDAY_NAMES: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export const DEFAULT_CALENDAR: Calendar = {
  workdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  holidays: [],
}

export function toDate(iso: ISODate): Date {
  return parseISO(iso)
}

export function toISO(date: Date): ISODate {
  return isoDate(format(date, 'yyyy-MM-dd'))
}

export function isWorkingDay(iso: ISODate, calendar: Calendar): boolean {
  const d = toDate(iso)
  const weekday = WEEKDAY_NAMES[d.getDay()]!
  if (!calendar.workdays.includes(weekday)) return false
  if (calendar.holidays.includes(iso)) return false
  return true
}

/**
 * Advance `start` by `days` *working* days. Day 0 = start itself if it's a working day.
 * If start is non-working, advances to the first working day before counting.
 */
export function addWorkingDays(start: ISODate, days: number, calendar: Calendar): ISODate {
  if (days < 0) throw new Error('addWorkingDays: days must be >= 0')
  let current = toDate(start)
  let currentIso = toISO(current)

  while (!isWorkingDay(currentIso, calendar)) {
    current = addDays(current, 1)
    currentIso = toISO(current)
  }

  let remaining = days
  while (remaining > 0) {
    current = addDays(current, 1)
    currentIso = toISO(current)
    if (isWorkingDay(currentIso, calendar)) remaining--
  }
  return currentIso
}

export function diffWorkingDays(start: ISODate, end: ISODate, calendar: Calendar): number {
  const rawDiff = differenceInCalendarDays(toDate(end), toDate(start))
  if (rawDiff < 0) return -diffWorkingDays(end, start, calendar)
  let count = 0
  let cursor = toDate(start)
  for (let i = 0; i <= rawDiff; i++) {
    if (isWorkingDay(toISO(cursor), calendar)) count++
    cursor = addDays(cursor, 1)
  }
  return count
}

export function workingDaysInRange(start: ISODate, end: ISODate, calendar: Calendar): ISODate[] {
  const result: ISODate[] = []
  const endDate = toDate(end)
  let cursor = toDate(start)
  while (cursor.getTime() <= endDate.getTime()) {
    const iso = toISO(cursor)
    if (isWorkingDay(iso, calendar)) result.push(iso)
    cursor = addDays(cursor, 1)
  }
  return result
}

export function allDaysInRange(start: ISODate, end: ISODate): ISODate[] {
  const result: ISODate[] = []
  const endDate = toDate(end)
  let cursor = toDate(start)
  while (cursor.getTime() <= endDate.getTime()) {
    result.push(toISO(cursor))
    cursor = addDays(cursor, 1)
  }
  return result
}

export function minISO(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b
}

export function maxISO(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b
}
