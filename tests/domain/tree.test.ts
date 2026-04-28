import { describe, expect, it } from 'vitest'
import { ancestorChain, findItem, findParent, flatten, moveItem, removeItem, replaceItem, visibleItems } from '@/domain/tree'
import type { PlanningItem } from '@/domain/types'
import { isoDate } from '@/domain/types'

const mkTask = (id: string, parent: string | null): PlanningItem => ({
  id,
  type: 'task',
  name: id,
  parentGroupId: parent,
  comments: `c-${id}`,
  startDate: isoDate('2026-04-20'),
  estimationMD: 2,
  allocations: [{ resourceId: 'r1', allocationPct: 50 }],
})

const fixture = (): PlanningItem[] => [
  {
    id: 'g1',
    type: 'group',
    name: 'g1',
    parentGroupId: null,
    comments: '',
    children: [mkTask('t1', 'g1'), mkTask('t2', 'g1')],
  },
  {
    id: 'g2',
    type: 'group',
    name: 'g2',
    parentGroupId: null,
    comments: '',
    children: [mkTask('t3', 'g2')],
  },
]

describe('tree ops', () => {
  it('flatten yields every node', () => {
    expect(flatten(fixture()).map((i) => i.id)).toEqual(['g1', 't1', 't2', 'g2', 't3'])
  })

  it('findItem finds deep', () => {
    expect(findItem(fixture(), 't3')?.id).toBe('t3')
  })

  it('findParent returns correct parent group', () => {
    expect(findParent(fixture(), 't3')?.id).toBe('g2')
    expect(findParent(fixture(), 'g1')).toBeNull()
  })

  it('ancestorChain returns full ancestry', () => {
    const tree: PlanningItem[] = [
      {
        id: 'g1',
        type: 'group',
        name: 'g1',
        parentGroupId: null,
        comments: '',
        children: [
          {
            id: 'g2',
            type: 'group',
            name: 'g2',
            parentGroupId: 'g1',
            comments: '',
            children: [mkTask('t', 'g2')],
          },
        ],
      },
    ]
    expect(ancestorChain(tree, 't')).toEqual(['g2', 'g1'])
  })

  it('moveItem preserves all attributes', () => {
    const next = moveItem(fixture(), 't1', 'g2', 0)
    const moved = findItem(next, 't1')!
    expect(moved.parentGroupId).toBe('g2')
    expect(moved.comments).toBe('c-t1')
    if (moved.type === 'task') {
      expect(moved.allocations).toEqual([{ resourceId: 'r1', allocationPct: 50 }])
    }
    expect(findParent(next, 't1')?.id).toBe('g2')
  })

  it('moveItem to top level', () => {
    const next = moveItem(fixture(), 't1', null, 0)
    expect(next[0]!.id).toBe('t1')
    expect(findItem(next, 't1')!.parentGroupId).toBeNull()
  })

  it('moveItem refuses to move group into its own subtree', () => {
    const tree: PlanningItem[] = [
      {
        id: 'g1',
        type: 'group',
        name: 'g1',
        parentGroupId: null,
        comments: '',
        children: [
          {
            id: 'g2',
            type: 'group',
            name: 'g2',
            parentGroupId: 'g1',
            comments: '',
            children: [],
          },
        ],
      },
    ]
    const next = moveItem(tree, 'g1', 'g2', 0)
    expect(next).toEqual(tree)
  })

  it('replaceItem swaps by id', () => {
    const next = replaceItem(fixture(), 't1', { ...mkTask('t1', 'g1'), name: 'renamed' })
    expect(findItem(next, 't1')!.name).toBe('renamed')
  })

  it('removeItem deletes node', () => {
    const next = removeItem(fixture(), 't1')
    expect(findItem(next, 't1')).toBeUndefined()
  })

  describe('visibleItems', () => {
    it('matches flatten when nothing is collapsed', () => {
      const items = fixture()
      expect(visibleItems(items, new Set()).map((i) => i.id)).toEqual(flatten(items).map((i) => i.id))
    })

    it('hides children of a collapsed group but keeps the group itself', () => {
      const items = fixture()
      const ids = visibleItems(items, new Set(['g1'])).map((i) => i.id)
      expect(ids).toEqual(['g1', 'g2', 't3'])
    })

    it('hides nested descendants when an ancestor is collapsed', () => {
      const items: PlanningItem[] = [
        {
          id: 'g1',
          type: 'group',
          name: 'g1',
          parentGroupId: null,
          comments: '',
          children: [
            {
              id: 'g2',
              type: 'group',
              name: 'g2',
              parentGroupId: 'g1',
              comments: '',
              children: [mkTask('t', 'g2')],
            },
          ],
        },
      ]
      // Collapsing g1 hides g2 *and* t inside it.
      expect(visibleItems(items, new Set(['g1'])).map((i) => i.id)).toEqual(['g1'])
      // Collapsing only g2 keeps g2 visible but hides t.
      expect(visibleItems(items, new Set(['g2'])).map((i) => i.id)).toEqual(['g1', 'g2'])
    })
  })
})
