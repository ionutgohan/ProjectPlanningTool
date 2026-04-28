import { create } from 'zustand'
import { aggregatedView, computeDurationsWD } from '@/domain/aggregation'
import { findOverAllocations } from '@/domain/allocation'
import {
  computeCascade,
  detectCycles,
  type ItemBounds,
  type RescheduleChange,
  type RescheduleProposal,
} from '@/domain/scheduling'
import { exportProjectAsHTML } from '@/domain/htmlExport'
import { emptyProject, exportProject, importProject } from '@/domain/serialization'
import { findItem, flatten, insertItem, moveItem as moveItemInTree, removeItem, replaceItem } from '@/domain/tree'
import type {
  Calendar,
  Dependency,
  DependencyType,
  ISODate,
  PlanningItem,
  Project,
  Resource,
  ResourceAllocation,
} from '@/domain/types'

export type View = 'planning' | 'resources' | 'holidays'

export interface PendingReschedule {
  proposal: RescheduleProposal
  /** The seed edit, already applied to `project`. */
  seedItemId: string
  /** Original project snapshot before the seed edit, used to revert on cancel. */
  snapshot: Project
}

interface PlanningState {
  project: Project
  view: View
  selectedItemId: string | null
  /** Transient hover state — set while the pointer is over an item in the tree
   *  or Gantt. Used solely for dependency-arrow highlighting; it never opens
   *  editors or mutates real selection. */
  hoveredItemId: string | null
  expandedItemIds: Set<string>
  /**
   * Per-item editor wrapper height in pixels (rounded up to a multiple of the
   * Gantt row height). Populated by ItemTree's ResizeObserver and consumed by
   * GanttChart to insert matching spacer rows. Ephemeral — never persisted.
   */
  editorRowHeights: Map<string, number>
  pendingReschedule: PendingReschedule | null
  autoAcceptReschedule: boolean
  importError: string | null
  /** Name of the remembered file when auto-restore on startup needs a user gesture. */
  resumeFileName: string | null
  /**
   * Handle of the file the project was loaded from, if any. Populated on
   * successful import via the File System Access API (and on auto-restore).
   * Used by the "Save" button to write back without a prompt. Non-serialized.
   */
  currentFileHandle: FileSystemFileHandle | null

  setView: (v: View) => void
  setAutoAcceptReschedule: (value: boolean) => void
  setResumeFileName: (name: string | null) => void
  setCurrentFileHandle: (handle: FileSystemFileHandle | null) => void
  setProjectName: (name: string) => void
  setSelectedItem: (id: string | null) => void
  setHoveredItem: (id: string | null) => void
  toggleExpanded: (id: string) => void
  setExpanded: (id: string, value: boolean) => void
  toggleGroupCollapsed: (id: string) => void
  setGroupCollapsed: (id: string, value: boolean) => void
  setEditorRowHeight: (id: string, heightPx: number) => void
  clearEditorRowHeight: (id: string) => void

  addItem: (item: PlanningItem, index?: number) => void
  updateItem: (id: string, patch: Partial<PlanningItem>) => void
  deleteItem: (id: string) => void
  moveItem: (id: string, newParentId: string | null, index: number) => void

  addDependency: (predecessorId: string, successorId: string, type: DependencyType) => { ok: boolean; error?: string }
  removeDependency: (depId: string) => void

  addResource: (resource: Resource) => void
  updateResource: (id: string, patch: Partial<Resource>) => void
  deleteResource: (id: string) => void
  setAllocation: (itemId: string, allocation: ResourceAllocation) => void
  removeAllocation: (itemId: string, resourceId: string) => void

  updateCalendar: (patch: Partial<Calendar>) => void

  confirmReschedule: () => void
  cancelReschedule: () => void

  importJSON: (text: string) => boolean
  exportJSON: () => string
  exportHTML: () => string
  loadDemo: () => void
  resetProject: () => void
}

function uuid(): string {
  return crypto.randomUUID()
}

/** Snapshot bounds map before any edit. */
function snapshotBounds(project: Project): Map<string, ItemBounds> {
  const view = aggregatedView(project)
  const map = new Map<string, ItemBounds>()
  for (const [id, b] of view) map.set(id, { startDate: b.startDate, endDate: b.endDate })
  return map
}

/**
 * Apply a patch and, if a dependency would be violated, stage a reschedule proposal.
 * The edit is applied optimistically; the snapshot lets us roll back on cancel.
 */
function applyWithReschedule(
  prevProject: Project,
  nextProject: Project,
  seedItemId: string,
  set: (partial: Partial<PlanningState>) => void,
  get: () => PlanningState,
): void {
  const originalBounds = snapshotBounds(prevProject)
  const proposedBounds = snapshotBounds(nextProject)
  const durations = computeDurationsWD(nextProject, aggregatedView(nextProject), nextProject.calendar)
  const proposal = computeCascade(
    proposedBounds,
    originalBounds,
    nextProject.dependencies,
    durations,
    nextProject.calendar,
  )

  if (proposal.changes.length === 0) {
    set({ project: nextProject })
    return
  }

  if (get().autoAcceptReschedule) {
    let items = nextProject.items
    for (const change of proposal.changes) {
      items = applyBoundsChange(items, change)
    }
    set({ project: { ...nextProject, items }, pendingReschedule: null })
    return
  }

  set({
    project: nextProject,
    pendingReschedule: {
      proposal,
      seedItemId,
      snapshot: prevProject,
    },
  })
}

export const usePlanningStore = create<PlanningState>((set, get) => ({
  project: emptyProject(),
  view: 'planning',
  selectedItemId: null,
  hoveredItemId: null,
  expandedItemIds: new Set<string>(),
  editorRowHeights: new Map<string, number>(),
  pendingReschedule: null,
  autoAcceptReschedule: false,
  importError: null,
  resumeFileName: null,
  currentFileHandle: null,

  setView: (view) => set({ view }),
  setAutoAcceptReschedule: (value) => set({ autoAcceptReschedule: value }),
  setResumeFileName: (name) => set({ resumeFileName: name }),
  setCurrentFileHandle: (handle) => set({ currentFileHandle: handle }),
  setProjectName: (name) => set((s) => ({ project: { ...s.project, name } })),
  setSelectedItem: (id) => set({ selectedItemId: id }),
  setHoveredItem: (id) => set({ hoveredItemId: id }),
  toggleExpanded: (id) =>
    set((s) => {
      const next = new Set(s.expandedItemIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { expandedItemIds: next }
    }),
  setExpanded: (id, value) =>
    set((s) => {
      const next = new Set(s.expandedItemIds)
      if (value) next.add(id)
      else next.delete(id)
      return { expandedItemIds: next }
    }),
  toggleGroupCollapsed: (id) =>
    set((s) => {
      const set_ = new Set(s.project.collapsedGroupIds)
      if (set_.has(id)) set_.delete(id)
      else set_.add(id)
      return { project: { ...s.project, collapsedGroupIds: Array.from(set_) } }
    }),
  setGroupCollapsed: (id, value) =>
    set((s) => {
      const set_ = new Set(s.project.collapsedGroupIds)
      if (value) set_.add(id)
      else set_.delete(id)
      return { project: { ...s.project, collapsedGroupIds: Array.from(set_) } }
    }),
  setEditorRowHeight: (id, heightPx) =>
    set((s) => {
      if (s.editorRowHeights.get(id) === heightPx) return s
      const next = new Map(s.editorRowHeights)
      next.set(id, heightPx)
      return { editorRowHeights: next }
    }),
  clearEditorRowHeight: (id) =>
    set((s) => {
      if (!s.editorRowHeights.has(id)) return s
      const next = new Map(s.editorRowHeights)
      next.delete(id)
      return { editorRowHeights: next }
    }),

  addItem: (item, index) =>
    set((s) => {
      const items = insertItem(s.project.items, item, item.parentGroupId, index ?? Number.MAX_SAFE_INTEGER)
      return { project: { ...s.project, items } }
    }),

  updateItem: (id, patch) => {
    const prev = get().project
    const existing = findItem(prev.items, id)
    if (!existing) return
    const merged = { ...existing, ...patch } as PlanningItem
    const nextProject = { ...prev, items: replaceItem(prev.items, id, merged) }
    applyWithReschedule(prev, nextProject, id, set, get)
  },

  deleteItem: (id) =>
    set((s) => {
      const items = removeItem(s.project.items, id)
      // Also drop dependencies that referenced it.
      const deps = s.project.dependencies.filter((d) => d.predecessorId !== id && d.successorId !== id)
      return { project: { ...s.project, items, dependencies: deps } }
    }),

  moveItem: (id, newParentId, index) => {
    const prev = get().project
    const items = moveItemInTree(prev.items, id, newParentId, index)
    const nextProject = { ...prev, items }
    applyWithReschedule(prev, nextProject, id, set, get)
  },

  addDependency: (predecessorId, successorId, type) => {
    const prev = get().project
    if (predecessorId === successorId) return { ok: false, error: 'An item cannot depend on itself' }
    const dep: Dependency = { id: uuid(), predecessorId, successorId, type }
    const candidateDeps = [...prev.dependencies, dep]
    const cycles = detectCycles(candidateDeps)
    if (cycles.length > 0) {
      return { ok: false, error: `This would create a cycle: ${cycles[0]!.join(' → ')}` }
    }
    const nextProject = { ...prev, dependencies: candidateDeps }
    applyWithReschedule(prev, nextProject, successorId, set, get)
    return { ok: true }
  },

  removeDependency: (depId) =>
    set((s) => ({
      project: { ...s.project, dependencies: s.project.dependencies.filter((d) => d.id !== depId) },
    })),

  addResource: (resource) =>
    set((s) => ({ project: { ...s.project, resources: [...s.project.resources, resource] } })),

  updateResource: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        resources: s.project.resources.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      },
    })),

  deleteResource: (id) =>
    set((s) => {
      const items = flatten(s.project.items)
      let nextItems = s.project.items
      for (const item of items) {
        if (item.type === 'group') continue
        const hasAlloc = item.allocations.some((a) => a.resourceId === id)
        if (!hasAlloc) continue
        const updated = { ...item, allocations: item.allocations.filter((a) => a.resourceId !== id) }
        nextItems = replaceItem(nextItems, item.id, updated)
      }
      return {
        project: {
          ...s.project,
          items: nextItems,
          resources: s.project.resources.filter((r) => r.id !== id),
        },
      }
    }),

  setAllocation: (itemId, allocation) =>
    set((s) => {
      const existing = findItem(s.project.items, itemId)
      if (!existing || existing.type === 'group') return s
      const existingAllocs = existing.allocations.filter((a) => a.resourceId !== allocation.resourceId)
      const updated = { ...existing, allocations: [...existingAllocs, allocation] }
      return { project: { ...s.project, items: replaceItem(s.project.items, itemId, updated) } }
    }),

  removeAllocation: (itemId, resourceId) =>
    set((s) => {
      const existing = findItem(s.project.items, itemId)
      if (!existing || existing.type === 'group') return s
      const updated = { ...existing, allocations: existing.allocations.filter((a) => a.resourceId !== resourceId) }
      return { project: { ...s.project, items: replaceItem(s.project.items, itemId, updated) } }
    }),

  updateCalendar: (patch) =>
    set((s) => ({ project: { ...s.project, calendar: { ...s.project.calendar, ...patch } } })),

  confirmReschedule: () =>
    set((s) => {
      const pending = s.pendingReschedule
      if (!pending) return s
      let items = s.project.items
      for (const change of pending.proposal.changes) {
        items = applyBoundsChange(items, change)
      }
      return { project: { ...s.project, items }, pendingReschedule: null }
    }),

  cancelReschedule: () =>
    set((s) => {
      const pending = s.pendingReschedule
      if (!pending) return s
      return { project: pending.snapshot, pendingReschedule: null }
    }),

  importJSON: (text) => {
    const result = importProject(text)
    if (!result.ok) {
      set({ importError: result.error })
      return false
    }
    set({ project: result.project, importError: null, pendingReschedule: null, selectedItemId: null, expandedItemIds: new Set(), editorRowHeights: new Map() })
    return true
  },

  exportJSON: () => exportProject(get().project),

  exportHTML: () => exportProjectAsHTML(get().project),

  loadDemo: () => set({ project: buildDemoProject(), pendingReschedule: null, selectedItemId: null, expandedItemIds: new Set(), editorRowHeights: new Map() }),

  resetProject: () => set({ project: emptyProject(), pendingReschedule: null, selectedItemId: null, expandedItemIds: new Set(), editorRowHeights: new Map() }),
}))

function applyBoundsChange(items: PlanningItem[], change: RescheduleChange): PlanningItem[] {
  const target = findItem(items, change.itemId)
  if (!target) return items
  if (target.type === 'task') {
    return replaceItem(items, target.id, { ...target, startDate: change.newStart })
  }
  if (target.type === 'milestone') {
    return replaceItem(items, target.id, { ...target, date: change.newStart })
  }
  return items
}

// --- helpers for selectors ---

export function selectAggregatedView(state: PlanningState) {
  return aggregatedView(state.project)
}

export function selectOverAllocations(state: PlanningState) {
  return findOverAllocations(state.project)
}

export function selectFlatItems(state: PlanningState) {
  return flatten(state.project.items)
}

// --- demo project ---

function buildDemoProject(): Project {
  const r1 = { id: uuid(), name: 'Alice', role: 'Backend', capacityPct: 100 }
  const r2 = { id: uuid(), name: 'Bob', role: 'Frontend', capacityPct: 100 }
  const g1 = uuid()
  const g2 = uuid()
  const t1 = uuid()
  const t2 = uuid()
  const t3 = uuid()
  const m1 = uuid()
  const start: ISODate = '2026-04-20' as ISODate
  return {
    schemaVersion: 2,
    name: 'Demo project',
    collapsedGroupIds: [],
    calendar: { workdays: ['mon', 'tue', 'wed', 'thu', 'fri'], holidays: [] },
    resources: [r1, r2],
    items: [
      {
        id: g1,
        type: 'group',
        name: 'Design phase',
        parentGroupId: null,
        comments: '',
        children: [
          {
            id: t1,
            type: 'task',
            name: 'Wireframes',
            parentGroupId: g1,
            comments: '',
            startDate: start,
            estimationMD: 3,
            allocations: [{ resourceId: r2.id, allocationPct: 80 }],
          },
          {
            id: t2,
            type: 'task',
            name: 'API spec',
            parentGroupId: g1,
            comments: '',
            startDate: start,
            estimationMD: 4,
            allocations: [{ resourceId: r1.id, allocationPct: 60 }],
          },
        ],
      },
      {
        id: g2,
        type: 'group',
        name: 'Build',
        parentGroupId: null,
        comments: '',
        children: [
          {
            id: t3,
            type: 'task',
            name: 'Implementation',
            parentGroupId: g2,
            comments: '',
            startDate: '2026-04-27' as ISODate,
            estimationMD: 10,
            allocations: [
              { resourceId: r1.id, allocationPct: 80 },
              { resourceId: r2.id, allocationPct: 80 },
            ],
          },
          {
            id: m1,
            type: 'milestone',
            name: 'Beta release',
            parentGroupId: g2,
            comments: '',
            date: '2026-05-11' as ISODate,
            allocations: [],
          },
        ],
      },
    ],
    dependencies: [
      { id: uuid(), predecessorId: t1, successorId: t3, type: 'FS' },
      { id: uuid(), predecessorId: t2, successorId: t3, type: 'FS' },
      { id: uuid(), predecessorId: t3, successorId: m1, type: 'FS' },
    ],
  }
}
