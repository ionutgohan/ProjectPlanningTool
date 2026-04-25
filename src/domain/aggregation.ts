import { diffWorkingDays } from './calendar'
import { computeTaskEndDate } from './scheduling'
import { flatten } from './tree'
import type { Calendar, ComputedBounds, ISODate, PlanningItem, Project } from './types'

/**
 * Compute startDate/endDate/estimationMD for every item, bottom-up.
 * Task: from stored fields. Milestone: date, 0 MD. Group: aggregated from descendants.
 */
export function aggregatedView(project: Project): Map<string, ComputedBounds> {
  const result = new Map<string, ComputedBounds>()
  const calendar = project.calendar

  const walk = (item: PlanningItem): ComputedBounds | undefined => {
    let computed: ComputedBounds | undefined

    if (item.type === 'task') {
      computed = {
        startDate: item.startDate,
        endDate: computeTaskEndDate(item, calendar),
        estimationMD: Math.max(1, item.estimationMD),
      }
    } else if (item.type === 'milestone') {
      computed = {
        startDate: item.date,
        endDate: item.date,
        estimationMD: 0,
      }
    } else {
      let start: ISODate | undefined
      let end: ISODate | undefined
      let sum = 0
      for (const child of item.children) {
        const c = walk(child)
        if (!c) continue
        if (!start || c.startDate < start) start = c.startDate
        if (!end || c.endDate > end) end = c.endDate
        sum += c.estimationMD
      }
      if (start && end) {
        computed = { startDate: start, endDate: end, estimationMD: sum }
      }
    }

    if (computed) result.set(item.id, computed)
    return computed
  }

  for (const item of project.items) walk(item)
  return result
}

export function projectBounds(project: Project): { start: ISODate; end: ISODate } | undefined {
  const view = aggregatedView(project)
  let start: ISODate | undefined
  let end: ISODate | undefined
  for (const item of flatten(project.items)) {
    const b = view.get(item.id)
    if (!b) continue
    if (!start || b.startDate < start) start = b.startDate
    if (!end || b.endDate > end) end = b.endDate
  }
  if (!start || !end) return undefined
  return { start, end }
}

export function computeDurationsWD(project: Project, view: Map<string, ComputedBounds>, calendar: Calendar): Map<string, number> {
  // Returns working-day duration per item (1 for milestones, >=1 for tasks, span for groups).
  const result = new Map<string, number>()
  for (const item of flatten(project.items)) {
    const b = view.get(item.id)
    if (!b) continue
    if (item.type === 'task') result.set(item.id, Math.max(1, item.estimationMD))
    else if (item.type === 'milestone') result.set(item.id, 1)
    else {
      result.set(item.id, Math.max(1, diffWorkingDays(b.startDate, b.endDate, calendar)))
    }
  }
  return result
}
