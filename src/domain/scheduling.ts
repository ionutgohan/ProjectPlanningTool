import { addDays, subDays } from 'date-fns'
import { addWorkingDays, diffWorkingDays, isWorkingDay, toDate, toISO } from './calendar'
import type { Calendar, Dependency, ISODate, PlanningItem, Task } from './types'

/**
 * End date of a task = start + (estimationMD - 1) working days.
 * estimationMD = 1 means start and end on the same day.
 */
export function computeTaskEndDate(task: Task, calendar: Calendar): ISODate {
  const md = Math.max(1, task.estimationMD)
  return addWorkingDays(task.startDate, md - 1, calendar)
}

export interface ItemBounds {
  startDate: ISODate
  endDate: ISODate
}

export function itemBounds(
  item: PlanningItem,
  calendar: Calendar,
  boundsOf: (id: string) => ItemBounds | undefined,
): ItemBounds | undefined {
  switch (item.type) {
    case 'task':
      return { startDate: item.startDate, endDate: computeTaskEndDate(item, calendar) }
    case 'milestone':
      return { startDate: item.date, endDate: item.date }
    case 'group': {
      let start: ISODate | undefined
      let end: ISODate | undefined
      for (const child of item.children) {
        const b = boundsOf(child.id)
        if (!b) continue
        if (!start || b.startDate < start) start = b.startDate
        if (!end || b.endDate > end) end = b.endDate
      }
      if (!start || !end) return undefined
      return { startDate: start, endDate: end }
    }
  }
}

export function detectCycles(dependencies: Dependency[]): string[][] {
  const graph = new Map<string, string[]>()
  for (const dep of dependencies) {
    if (!graph.has(dep.predecessorId)) graph.set(dep.predecessorId, [])
    graph.get(dep.predecessorId)!.push(dep.successorId)
  }

  const cycles: string[][] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []

  const dfs = (node: string): void => {
    if (visiting.has(node)) {
      const cycleStart = stack.indexOf(node)
      if (cycleStart >= 0) cycles.push(stack.slice(cycleStart).concat(node))
      return
    }
    if (visited.has(node)) return
    visiting.add(node)
    stack.push(node)
    for (const next of graph.get(node) ?? []) dfs(next)
    stack.pop()
    visiting.delete(node)
    visited.add(node)
  }

  for (const node of graph.keys()) if (!visited.has(node)) dfs(node)
  return cycles
}

function walkBackWorkingDays(end: ISODate, workingDaysBack: number, calendar: Calendar): ISODate {
  if (workingDaysBack <= 0) return end
  let cursor = toDate(end)
  let remaining = workingDaysBack
  while (remaining > 0) {
    cursor = subDays(cursor, 1)
    if (isWorkingDay(toISO(cursor), calendar)) remaining--
  }
  return toISO(cursor)
}

/**
 * Minimum start date the successor must have to satisfy `dep`,
 * given the predecessor's bounds and the successor's duration in working days.
 */
export function minSuccessorStart(
  predBounds: ItemBounds,
  dep: Dependency,
  succDurationWD: number,
  calendar: Calendar,
): ISODate {
  const dur = Math.max(1, succDurationWD)
  switch (dep.type) {
    case 'FS':
      return addWorkingDays(predBounds.endDate, 1, calendar)
    case 'SS':
      return predBounds.startDate
    case 'FF':
      // successor.end >= predecessor.end; snap start back by (dur-1) working days from pred.end
      return walkBackWorkingDays(predBounds.endDate, dur - 1, calendar)
    case 'SF':
      // successor.end >= predecessor.start; snap start back by (dur-1) working days from pred.start
      return walkBackWorkingDays(predBounds.startDate, dur - 1, calendar)
  }
}

export function violatesDependency(
  dep: Dependency,
  predBounds: ItemBounds,
  succBounds: ItemBounds,
): boolean {
  switch (dep.type) {
    case 'FS':
      // successor.start >= predecessor.end + 1 working day
      return succBounds.startDate <= predBounds.endDate
    case 'SS':
      return succBounds.startDate < predBounds.startDate
    case 'FF':
      return succBounds.endDate < predBounds.endDate
    case 'SF':
      return succBounds.endDate < predBounds.startDate
  }
}

export interface RescheduleChange {
  itemId: string
  oldStart: ISODate
  newStart: ISODate
  oldEnd: ISODate
  newEnd: ISODate
}

export interface RescheduleProposal {
  changes: RescheduleChange[]
}

/**
 * Given proposed bounds for the seed edit and the original bounds for every item,
 * relax successors until no dependency is violated. Returns the minimal set of changes.
 *
 * Pre-req: dependency graph must be acyclic (check with detectCycles first).
 */
export function computeCascade(
  proposedBounds: Map<string, ItemBounds>,
  originalBounds: Map<string, ItemBounds>,
  dependencies: Dependency[],
  durationsWD: Map<string, number>,
  calendar: Calendar,
): RescheduleProposal {
  const bounds = new Map(proposedBounds)
  const changes = new Map<string, RescheduleChange>()

  // Iterative relaxation; DAG guarantees termination.
  let progressed = true
  let iterations = 0
  const maxIterations = dependencies.length * 4 + 10

  while (progressed && iterations++ < maxIterations) {
    progressed = false
    for (const dep of dependencies) {
      const pred = bounds.get(dep.predecessorId)
      const succ = bounds.get(dep.successorId)
      if (!pred || !succ) continue
      if (!violatesDependency(dep, pred, succ)) continue

      const dur = durationsWD.get(dep.successorId) ?? 1
      const newStart = minSuccessorStart(pred, dep, dur, calendar)
      const newEnd = dur <= 1 ? newStart : addWorkingDays(newStart, dur - 1, calendar)
      const newBounds: ItemBounds = { startDate: newStart, endDate: newEnd }
      bounds.set(dep.successorId, newBounds)

      const orig = originalBounds.get(dep.successorId)
      if (orig) {
        changes.set(dep.successorId, {
          itemId: dep.successorId,
          oldStart: orig.startDate,
          newStart: newBounds.startDate,
          oldEnd: orig.endDate,
          newEnd: newBounds.endDate,
        })
      }
      progressed = true
    }
  }

  return { changes: Array.from(changes.values()) }
}

export function durationWorkingDays(
  item: PlanningItem,
  calendar: Calendar,
  boundsOf: (id: string) => ItemBounds | undefined,
): number {
  if (item.type === 'task') return Math.max(1, item.estimationMD)
  if (item.type === 'milestone') return 1
  const b = boundsOf(item.id)
  if (!b) return 1
  return Math.max(1, diffWorkingDays(b.startDate, b.endDate, calendar))
}

// Re-export addDays so scheduling callers don't need direct date-fns imports.
export { addDays }
