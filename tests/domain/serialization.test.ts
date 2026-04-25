import { describe, expect, it } from 'vitest'
import { emptyProject, exportProject, importProject, SCHEMA_VERSION } from '@/domain/serialization'
import type { Project } from '@/domain/types'
import { isoDate } from '@/domain/types'

const richProject = (): Project => ({
  schemaVersion: SCHEMA_VERSION,
  name: 'demo',
  calendar: { workdays: ['mon', 'tue', 'wed', 'thu', 'fri'], holidays: [] },
  resources: [{ id: 'r1', name: 'Alice', role: 'Eng', capacityPct: 100 }],
  items: [
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
          allocations: [{ resourceId: 'r1', allocationPct: 50 }],
        },
      ],
    },
  ],
  dependencies: [],
})

describe('serialization', () => {
  it('round-trips a project', () => {
    const p = richProject()
    const json = exportProject(p)
    const result = importProject(json)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(exportProject(result.project)).toBe(json)
    }
  })

  it('round-trips empty project', () => {
    const json = exportProject(emptyProject('x'))
    expect(importProject(json).ok).toBe(true)
  })

  it('rejects invalid JSON', () => {
    expect(importProject('{not json').ok).toBe(false)
  })

  it('rejects newer schemaVersion', () => {
    const p = { ...richProject(), schemaVersion: SCHEMA_VERSION + 1 }
    const r = importProject(JSON.stringify(p))
    expect(r.ok).toBe(false)
  })

  it('rejects missing schemaVersion', () => {
    const obj = { ...richProject() } as Partial<Project>
    delete obj.schemaVersion
    const r = importProject(JSON.stringify(obj))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/schemaVersion/)
  })

  it('rejects dangling resourceId in allocation', () => {
    const p = richProject()
    const task = (p.items[0] as any).children[0]
    task.allocations = [{ resourceId: 'ghost', allocationPct: 50 }]
    const r = importProject(JSON.stringify(p))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/unknown resource/)
  })

  it('rejects duplicate item ID', () => {
    const p = richProject()
    ;(p.items[0] as any).children.push({
      id: 't1', // duplicate
      type: 'task',
      name: 'dup',
      parentGroupId: 'g1',
      comments: '',
      startDate: isoDate('2026-04-20'),
      estimationMD: 1,
      allocations: [],
    })
    const r = importProject(JSON.stringify(p))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Duplicate item/)
  })

  it('rejects dependency with unknown endpoint', () => {
    const p = richProject()
    p.dependencies = [{ id: 'd', predecessorId: 't1', successorId: 'nope', type: 'FS' }]
    const r = importProject(JSON.stringify(p))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/successorId/)
  })

  it('rejects cycle', () => {
    const p = richProject()
    p.dependencies = [
      { id: 'd1', predecessorId: 't1', successorId: 't1', type: 'FS' },
    ]
    const r = importProject(JSON.stringify(p))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/cycle/i)
  })
})
