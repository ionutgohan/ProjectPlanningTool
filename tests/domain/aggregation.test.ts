import { describe, expect, it } from 'vitest'
import { aggregatedView } from '@/domain/aggregation'
import { DEFAULT_CALENDAR } from '@/domain/calendar'
import type { Project } from '@/domain/types'
import { isoDate } from '@/domain/types'

const project = (items: Project['items']): Project => ({
  schemaVersion: 1,
  name: 'p',
  calendar: DEFAULT_CALENDAR,
  items,
  dependencies: [],
  resources: [],
})

describe('aggregatedView', () => {
  it('computes task end from estimation', () => {
    const view = aggregatedView(
      project([
        {
          id: 't',
          type: 'task',
          name: 't',
          parentGroupId: null,
          comments: '',
          startDate: isoDate('2026-04-20'),
          estimationMD: 5,
          allocations: [],
        },
      ]),
    )
    expect(view.get('t')).toEqual({
      startDate: '2026-04-20',
      endDate: '2026-04-24',
      estimationMD: 5,
    })
  })

  it('milestone has 0 estimationMD and same start/end', () => {
    const view = aggregatedView(
      project([
        {
          id: 'm',
          type: 'milestone',
          name: 'm',
          parentGroupId: null,
          comments: '',
          date: isoDate('2026-05-01'),
          allocations: [],
        },
      ]),
    )
    expect(view.get('m')).toEqual({
      startDate: '2026-05-01',
      endDate: '2026-05-01',
      estimationMD: 0,
    })
  })

  it('group aggregates from children including nested group', () => {
    const view = aggregatedView(
      project([
        {
          id: 'g1',
          type: 'group',
          name: 'g1',
          parentGroupId: null,
          comments: '',
          children: [
            {
              id: 't1',
              type: 'task',
              name: 't1',
              parentGroupId: 'g1',
              comments: '',
              startDate: isoDate('2026-04-20'),
              estimationMD: 3,
              allocations: [],
            },
            {
              id: 'g2',
              type: 'group',
              name: 'g2',
              parentGroupId: 'g1',
              comments: '',
              children: [
                {
                  id: 't2',
                  type: 'task',
                  name: 't2',
                  parentGroupId: 'g2',
                  comments: '',
                  startDate: isoDate('2026-04-27'),
                  estimationMD: 2,
                  allocations: [],
                },
                {
                  id: 'm',
                  type: 'milestone',
                  name: 'm',
                  parentGroupId: 'g2',
                  comments: '',
                  date: isoDate('2026-05-04'),
                  allocations: [],
                },
              ],
            },
          ],
        },
      ]),
    )
    expect(view.get('g1')).toEqual({
      startDate: '2026-04-20',
      endDate: '2026-05-04',
      estimationMD: 5, // t1=3 + t2=2 + milestone=0
    })
    expect(view.get('g2')).toEqual({
      startDate: '2026-04-27',
      endDate: '2026-05-04',
      estimationMD: 2,
    })
  })
})
