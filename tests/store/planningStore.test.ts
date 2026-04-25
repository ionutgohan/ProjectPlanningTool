import { beforeEach, describe, expect, it } from 'vitest'
import { usePlanningStore } from '@/store/planningStore'
import { findItem } from '@/domain/tree'
import { isoDate, type Project } from '@/domain/types'

function seedProject(): Project {
  return {
    schemaVersion: 1,
    name: 'test',
    calendar: { workdays: ['mon', 'tue', 'wed', 'thu', 'fri'], holidays: [] },
    resources: [{ id: 'r1', name: 'Alice', role: 'Eng', capacityPct: 100 }],
    items: [
      {
        id: 't1',
        type: 'task',
        name: 't1',
        parentGroupId: null,
        comments: '',
        startDate: isoDate('2026-04-20'),
        estimationMD: 2,
        allocations: [],
      },
      {
        id: 't2',
        type: 'task',
        name: 't2',
        parentGroupId: null,
        comments: '',
        startDate: isoDate('2026-04-22'),
        estimationMD: 2,
        allocations: [],
      },
    ],
    dependencies: [{ id: 'd1', predecessorId: 't1', successorId: 't2', type: 'FS' }],
  }
}

describe('planningStore', () => {
  beforeEach(() => {
    usePlanningStore.setState({
      project: seedProject(),
      pendingReschedule: null,
      selectedItemId: null,
      expandedItemIds: new Set(),
      view: 'planning',
      importError: null,
    })
  })

  it('shifting a predecessor forward stages a reschedule proposal', () => {
    usePlanningStore.getState().updateItem('t1', { startDate: isoDate('2026-05-04') } as never)
    const pending = usePlanningStore.getState().pendingReschedule
    expect(pending).not.toBeNull()
    expect(pending!.proposal.changes.map((c) => c.itemId)).toEqual(['t2'])
  })

  it('cancelReschedule restores the snapshot', () => {
    const before = usePlanningStore.getState().project
    usePlanningStore.getState().updateItem('t1', { startDate: isoDate('2026-05-04') } as never)
    expect(usePlanningStore.getState().pendingReschedule).not.toBeNull()
    usePlanningStore.getState().cancelReschedule()
    expect(usePlanningStore.getState().pendingReschedule).toBeNull()
    expect(usePlanningStore.getState().project).toEqual(before)
  })

  it('confirmReschedule applies the cascade', () => {
    usePlanningStore.getState().updateItem('t1', { startDate: isoDate('2026-05-04') } as never)
    usePlanningStore.getState().confirmReschedule()
    const t2 = findItem(usePlanningStore.getState().project.items, 't2')!
    expect(t2.type).toBe('task')
    if (t2.type === 'task') expect(t2.startDate >= '2026-05-06').toBe(true)
    expect(usePlanningStore.getState().pendingReschedule).toBeNull()
  })

  it('addDependency rejects a cycle', () => {
    const res = usePlanningStore.getState().addDependency('t2', 't1', 'FS')
    expect(res.ok).toBe(false)
  })

  it('deleteResource cascades into allocations', () => {
    usePlanningStore.getState().setAllocation('t1', { resourceId: 'r1', allocationPct: 50 })
    usePlanningStore.getState().deleteResource('r1')
    const t1 = findItem(usePlanningStore.getState().project.items, 't1')!
    if (t1.type === 'task') expect(t1.allocations).toEqual([])
  })

  it('importJSON round-trips via exportJSON', () => {
    const json = usePlanningStore.getState().exportJSON()
    usePlanningStore.getState().resetProject()
    const ok = usePlanningStore.getState().importJSON(json)
    expect(ok).toBe(true)
    expect(usePlanningStore.getState().exportJSON()).toBe(json)
  })

  it('importJSON records error for bad input', () => {
    const ok = usePlanningStore.getState().importJSON('{not json')
    expect(ok).toBe(false)
    expect(usePlanningStore.getState().importError).toMatch(/Invalid JSON/)
  })

  it('updateCalendar persists holiday edits', () => {
    usePlanningStore.getState().updateCalendar({
      holidays: [isoDate('2026-12-25'), isoDate('2026-05-01')],
    })
    expect(usePlanningStore.getState().project.calendar.holidays).toEqual([
      '2026-12-25',
      '2026-05-01',
    ])
  })
})
