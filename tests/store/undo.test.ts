import { beforeEach, describe, expect, it } from 'vitest'
import { usePlanningStore } from '@/store/planningStore'
import { findItem } from '@/domain/tree'
import { isoDate, type Project } from '@/domain/types'

function seedProject(): Project {
  return {
    schemaVersion: 2,
    name: 'seed',
    calendar: { workdays: ['mon', 'tue', 'wed', 'thu', 'fri'], holidays: [] },
    resources: [],
    collapsedGroupIds: [],
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

describe('undo', () => {
  beforeEach(() => {
    usePlanningStore.setState({
      project: seedProject(),
      past: [],
      pendingReschedule: null,
      autoAcceptReschedule: false,
      selectedItemId: null,
      expandedItemIds: new Set(),
      editorRowHeights: new Map(),
      view: 'planning',
      importError: null,
    })
  })

  it('reverts the most recent edit', () => {
    const store = usePlanningStore.getState()
    store.setProjectName('changed')
    expect(usePlanningStore.getState().project.name).toBe('changed')
    expect(usePlanningStore.getState().past.length).toBe(1)

    usePlanningStore.getState().undo()
    expect(usePlanningStore.getState().project.name).toBe('seed')
    expect(usePlanningStore.getState().past.length).toBe(0)
  })

  it('is a no-op when history is empty', () => {
    const before = usePlanningStore.getState().project
    usePlanningStore.getState().undo()
    expect(usePlanningStore.getState().project).toBe(before)
    expect(usePlanningStore.getState().past.length).toBe(0)
  })

  it('caps history at 5 entries (drops oldest)', () => {
    const { setProjectName } = usePlanningStore.getState()
    for (let i = 1; i <= 6; i++) setProjectName(`name-${i}`)
    expect(usePlanningStore.getState().project.name).toBe('name-6')
    expect(usePlanningStore.getState().past.length).toBe(5)

    // 5 undos walk back through name-5..name-1; the original 'seed' has been dropped.
    const expected = ['name-5', 'name-4', 'name-3', 'name-2', 'name-1']
    for (const name of expected) {
      usePlanningStore.getState().undo()
      expect(usePlanningStore.getState().project.name).toBe(name)
    }
    expect(usePlanningStore.getState().past.length).toBe(0)

    // Sixth undo is a no-op; we've lost the ability to recover the seed name.
    usePlanningStore.getState().undo()
    expect(usePlanningStore.getState().project.name).toBe('name-1')
  })

  it('clears history on importJSON / loadProject / loadDemo / resetProject', () => {
    const { setProjectName, loadProject, resetProject, loadDemo, importJSON } = usePlanningStore.getState()

    setProjectName('a')
    setProjectName('b')
    expect(usePlanningStore.getState().past.length).toBe(2)

    loadProject(seedProject())
    expect(usePlanningStore.getState().past.length).toBe(0)

    setProjectName('c')
    resetProject()
    expect(usePlanningStore.getState().past.length).toBe(0)

    loadDemo()
    setProjectName('d')
    expect(usePlanningStore.getState().past.length).toBe(1)
    loadDemo()
    expect(usePlanningStore.getState().past.length).toBe(0)

    setProjectName('e')
    const json = usePlanningStore.getState().exportJSON()
    importJSON(json)
    expect(usePlanningStore.getState().past.length).toBe(0)
  })

  it('captures one history entry per addItem and reverts the insert', () => {
    const { addItem } = usePlanningStore.getState()
    addItem({
      id: 't3',
      type: 'task',
      name: 't3',
      parentGroupId: null,
      comments: '',
      startDate: isoDate('2026-04-30'),
      estimationMD: 1,
      allocations: [],
    })
    expect(findItem(usePlanningStore.getState().project.items, 't3')).toBeTruthy()

    usePlanningStore.getState().undo()
    expect(findItem(usePlanningStore.getState().project.items, 't3')).toBeUndefined()
  })

  it('after a confirmed reschedule cascade, undo reverts seed and cascade together', () => {
    // Auto-accept the cascade so the test doesn't need to drive the dialog.
    usePlanningStore.setState({ autoAcceptReschedule: true })

    const before = usePlanningStore.getState().project

    // Push t1's start by 5 working days; FS dependency forces t2 to follow.
    usePlanningStore.getState().updateItem('t1', { startDate: isoDate('2026-04-27') })

    const after = usePlanningStore.getState().project
    const t1After = findItem(after.items, 't1')
    const t2After = findItem(after.items, 't2')
    expect(t1After && t1After.type === 'task' && t1After.startDate).toBe('2026-04-27')
    // t2 was at 2026-04-22 and must be moved past t1's new end (5 working days from 04-27 → 05-04).
    expect(t2After && t2After.type === 'task' && t2After.startDate).not.toBe('2026-04-22')

    expect(usePlanningStore.getState().past.length).toBe(1)
    usePlanningStore.getState().undo()

    const reverted = usePlanningStore.getState().project
    const t1Reverted = findItem(reverted.items, 't1')
    const t2Reverted = findItem(reverted.items, 't2')
    expect(t1Reverted && t1Reverted.type === 'task' && t1Reverted.startDate).toBe('2026-04-20')
    expect(t2Reverted && t2Reverted.type === 'task' && t2Reverted.startDate).toBe('2026-04-22')
    expect(reverted).toEqual(before)
  })

  it('cancelReschedule pops the history entry the seed edit pushed', () => {
    // Staged (non-auto) reschedule: updateItem pushes history, applyWithReschedule
    // stages the proposal, the user then cancels.
    usePlanningStore.setState({ autoAcceptReschedule: false })

    usePlanningStore.getState().updateItem('t1', { startDate: isoDate('2026-04-27') })
    expect(usePlanningStore.getState().pendingReschedule).not.toBeNull()
    expect(usePlanningStore.getState().past.length).toBe(1)

    usePlanningStore.getState().cancelReschedule()
    expect(usePlanningStore.getState().pendingReschedule).toBeNull()
    // History entry that mirrored the now-reverted edit is gone.
    expect(usePlanningStore.getState().past.length).toBe(0)
    const t1 = findItem(usePlanningStore.getState().project.items, 't1')
    expect(t1 && t1.type === 'task' && t1.startDate).toBe('2026-04-20')
  })
})
