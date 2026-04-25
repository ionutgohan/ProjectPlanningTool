import { aggregatedView } from './aggregation'
import { isWorkingDay, workingDaysInRange } from './calendar'
import { flatten } from './tree'
import type { ISODate, Project } from './types'

export interface DailyLoad {
  resourceId: string
  date: ISODate
  loadPct: number
  capacityPct: number
}

/**
 * For each resource, compute total allocation % on each working day in which any
 * assigned task/milestone is active.
 */
export function computeDailyLoad(project: Project): Map<string, Map<ISODate, number>> {
  const view = aggregatedView(project)
  const byResource = new Map<string, Map<ISODate, number>>()

  for (const item of flatten(project.items)) {
    if (item.type === 'group') continue
    const bounds = view.get(item.id)
    if (!bounds) continue
    const days =
      item.type === 'milestone'
        ? isWorkingDay(item.date, project.calendar)
          ? [item.date]
          : []
        : workingDaysInRange(bounds.startDate, bounds.endDate, project.calendar)

    for (const alloc of item.allocations) {
      let map = byResource.get(alloc.resourceId)
      if (!map) {
        map = new Map()
        byResource.set(alloc.resourceId, map)
      }
      for (const day of days) {
        map.set(day, (map.get(day) ?? 0) + alloc.allocationPct)
      }
    }
  }

  return byResource
}

export function findOverAllocations(project: Project): DailyLoad[] {
  const loads = computeDailyLoad(project)
  const out: DailyLoad[] = []
  const byId = new Map(project.resources.map((r) => [r.id, r]))
  for (const [resourceId, dayMap] of loads) {
    const res = byId.get(resourceId)
    if (!res) continue
    for (const [date, loadPct] of dayMap) {
      if (loadPct > res.capacityPct) {
        out.push({ resourceId, date, loadPct, capacityPct: res.capacityPct })
      }
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
