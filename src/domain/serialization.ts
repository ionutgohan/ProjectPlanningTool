import { detectCycles } from './scheduling'
import { flatten, isGroup } from './tree'
import type { Project } from './types'

export const SCHEMA_VERSION = 1

export type ImportResult =
  | { ok: true; project: Project }
  | { ok: false; error: string }

export function exportProject(project: Project): string {
  return JSON.stringify(project, null, 2)
}

type Migration = (raw: unknown) => unknown
const migrations: Record<number, Migration> = {
  // future: migrations[1] = (raw) => ({ ...raw, schemaVersion: 2, ...newFields })
}

function migrate(raw: { schemaVersion?: number } & Record<string, unknown>): { ok: true; project: Project } | { ok: false; error: string } {
  let current: { schemaVersion?: number } & Record<string, unknown> = raw
  while ((current.schemaVersion ?? 0) < SCHEMA_VERSION) {
    const v = current.schemaVersion ?? 0
    const fn = migrations[v]
    if (!fn) {
      return { ok: false, error: `No migration from schema version ${v} to ${SCHEMA_VERSION}` }
    }
    current = fn(current) as typeof current
  }
  return { ok: true, project: current as unknown as Project }
}

export function importProject(json: string): ImportResult {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` }
  }
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Root must be an object' }
  }
  const obj = raw as Record<string, unknown>

  const version = typeof obj['schemaVersion'] === 'number' ? obj['schemaVersion'] : undefined
  if (version === undefined) return { ok: false, error: 'Missing schemaVersion' }
  if (version > SCHEMA_VERSION) {
    return { ok: false, error: `Schema version ${version} is newer than supported (${SCHEMA_VERSION}). Upgrade the app.` }
  }

  const migrated = migrate(obj as { schemaVersion?: number } & Record<string, unknown>)
  if (!migrated.ok) return migrated
  const project = migrated.project

  // Shape validation
  if (typeof project.name !== 'string') return { ok: false, error: "'name' must be a string" }
  if (!project.calendar || !Array.isArray(project.calendar.workdays)) return { ok: false, error: "Invalid 'calendar'" }
  if (!Array.isArray(project.items)) return { ok: false, error: "'items' must be an array" }
  if (!Array.isArray(project.dependencies)) return { ok: false, error: "'dependencies' must be an array" }
  if (!Array.isArray(project.resources)) return { ok: false, error: "'resources' must be an array" }

  // Duplicate IDs
  const allItems = flatten(project.items)
  const seen = new Set<string>()
  for (const item of allItems) {
    if (seen.has(item.id)) return { ok: false, error: `Duplicate item id: ${item.id}` }
    seen.add(item.id)
  }
  const resourceIds = new Set<string>()
  for (const res of project.resources) {
    if (resourceIds.has(res.id)) return { ok: false, error: `Duplicate resource id: ${res.id}` }
    resourceIds.add(res.id)
  }

  // parentGroupId integrity
  const itemIds = new Set(allItems.map((i) => i.id))
  for (const item of allItems) {
    if (item.parentGroupId !== null && !itemIds.has(item.parentGroupId)) {
      return { ok: false, error: `Item "${item.id}" has unknown parentGroupId "${item.parentGroupId}"` }
    }
    // Verify tree structure matches parentGroupId
    // (Skip deep verification — trust the tree traversal)
  }

  // Dependency integrity
  for (const dep of project.dependencies) {
    if (!itemIds.has(dep.predecessorId)) {
      return { ok: false, error: `Dependency "${dep.id}" has unknown predecessorId "${dep.predecessorId}"` }
    }
    if (!itemIds.has(dep.successorId)) {
      return { ok: false, error: `Dependency "${dep.id}" has unknown successorId "${dep.successorId}"` }
    }
    if (!['FS', 'SS', 'FF', 'SF'].includes(dep.type)) {
      return { ok: false, error: `Dependency "${dep.id}" has invalid type "${dep.type}"` }
    }
  }

  // Allocation integrity
  for (const item of allItems) {
    if (isGroup(item)) continue
    for (const alloc of item.allocations) {
      if (!resourceIds.has(alloc.resourceId)) {
        return { ok: false, error: `Item "${item.id}" allocates unknown resource "${alloc.resourceId}"` }
      }
      if (alloc.allocationPct <= 0 || alloc.allocationPct > 100) {
        return { ok: false, error: `Item "${item.id}" has invalid allocation ${alloc.allocationPct}% — must be (0, 100]` }
      }
    }
  }

  // Cycle check
  const cycles = detectCycles(project.dependencies)
  if (cycles.length > 0) {
    return { ok: false, error: `Dependency cycle detected: ${cycles[0]!.join(' → ')}` }
  }

  return { ok: true, project }
}

export function emptyProject(name = 'Untitled Project'): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    calendar: { workdays: ['mon', 'tue', 'wed', 'thu', 'fri'], holidays: [] },
    items: [],
    dependencies: [],
    resources: [],
  }
}
