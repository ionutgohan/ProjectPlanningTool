export type ISODate = string & { readonly __iso: unique symbol }

export const isoDate = (s: string): ISODate => s as ISODate

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface Calendar {
  workdays: Weekday[]
  holidays: ISODate[]
}

export interface ResourceAllocation {
  resourceId: string
  allocationPct: number
}

export interface Resource {
  id: string
  name: string
  role: string
  capacityPct: number
}

interface ItemBase {
  id: string
  name: string
  parentGroupId: string | null
  comments: string
}

export interface Task extends ItemBase {
  type: 'task'
  startDate: ISODate
  estimationMD: number
  allocations: ResourceAllocation[]
}

export interface Group extends ItemBase {
  type: 'group'
  children: PlanningItem[]
}

export interface Milestone extends ItemBase {
  type: 'milestone'
  date: ISODate
  allocations: ResourceAllocation[]
}

export type PlanningItem = Task | Group | Milestone

export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF'

export interface Dependency {
  id: string
  predecessorId: string
  successorId: string
  type: DependencyType
}

export interface Project {
  schemaVersion: number
  name: string
  calendar: Calendar
  items: PlanningItem[]
  dependencies: Dependency[]
  resources: Resource[]
  /** Ids of groups whose children are hidden in the tree and Gantt. */
  collapsedGroupIds: string[]
}

export interface ComputedBounds {
  startDate: ISODate
  endDate: ISODate
  estimationMD: number
}
