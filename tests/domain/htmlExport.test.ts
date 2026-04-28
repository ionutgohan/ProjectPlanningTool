import { describe, expect, it } from 'vitest'
import { DEFAULT_CALENDAR } from '@/domain/calendar'
import { exportProjectAsHTML } from '@/domain/htmlExport'
import { emptyProject } from '@/domain/serialization'
import type { Project } from '@/domain/types'
import { isoDate } from '@/domain/types'

const fixedDate = new Date('2026-04-19T10:00:00Z')

const demo = (): Project => ({
  schemaVersion: 2,
  name: 'Demo',
  calendar: DEFAULT_CALENDAR,
  resources: [{ id: 'r1', name: 'Alice', role: 'Eng', capacityPct: 100 }],
  items: [
    {
      id: 'g1',
      type: 'group',
      name: 'Phase 1',
      parentGroupId: null,
      comments: '',
      children: [
        {
          id: 't1',
          type: 'task',
          name: 'Wireframes',
          parentGroupId: 'g1',
          comments: '',
          startDate: isoDate('2026-04-20'),
          estimationMD: 3,
          allocations: [],
        },
        {
          id: 't2',
          type: 'task',
          name: 'Implementation',
          parentGroupId: 'g1',
          comments: '',
          startDate: isoDate('2026-04-27'),
          estimationMD: 5,
          allocations: [],
        },
      ],
    },
    {
      id: 'm1',
      type: 'milestone',
      name: 'Beta',
      parentGroupId: null,
      comments: '',
      date: isoDate('2026-05-05'),
      allocations: [],
    },
  ],
  dependencies: [{ id: 'd1', predecessorId: 't1', successorId: 't2', type: 'FS' }],
  collapsedGroupIds: [],
})

describe('exportProjectAsHTML', () => {
  it('produces a full HTML document', () => {
    const html = exportProjectAsHTML(demo(), { now: fixedDate })
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<title>Demo</title>')
    expect(html).toContain('</html>')
  })

  it('renders the project name and item count', () => {
    const html = exportProjectAsHTML(demo(), { now: fixedDate })
    expect(html).toContain('>Demo<')
    expect(html).toContain('>4<') // 1 group + 2 tasks + 1 milestone flattened
  })

  it('renders SVG Gantt with task and milestone shapes', () => {
    const html = exportProjectAsHTML(demo(), { now: fixedDate })
    expect(html).toContain('class="gantt-svg"')
    expect(html).toContain('bar-task')
    expect(html).toContain('bar-group')
    expect(html).toContain('bar-milestone')
  })

  it('includes dependency arrow marker and at least one path', () => {
    const html = exportProjectAsHTML(demo(), { now: fixedDate })
    expect(html).toContain('marker id="arrow"')
    expect(html).toContain('class="arrow"')
  })

  it('renders weekend shading rects', () => {
    const html = exportProjectAsHTML(demo(), { now: fixedDate })
    expect(html).toContain('class="weekend"')
  })

  it('escapes HTML in item names', () => {
    const p = demo()
    p.items[0]!.name = '<script>alert(1)</script>'
    const html = exportProjectAsHTML(p, { now: fixedDate })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('is deterministic for identical input', () => {
    const a = exportProjectAsHTML(demo(), { now: fixedDate })
    const b = exportProjectAsHTML(demo(), { now: fixedDate })
    expect(a).toBe(b)
  })

  it('handles an empty project', () => {
    const html = exportProjectAsHTML(emptyProject('Blank'), { now: fixedDate })
    expect(html).toContain('No items in this project.')
    expect(html).not.toContain('<svg')
  })

  it('includes print CSS for A4 landscape', () => {
    const html = exportProjectAsHTML(demo(), { now: fixedDate })
    expect(html).toContain('@media print')
    expect(html).toContain('A4 landscape')
  })

  it('has no <script> tags anywhere', () => {
    const html = exportProjectAsHTML(demo(), { now: fixedDate })
    expect(/<script/i.test(html)).toBe(false)
  })
})
