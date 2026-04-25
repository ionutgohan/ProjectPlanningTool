import type { Group, PlanningItem } from './types'

export function isGroup(item: PlanningItem): item is Group {
  return item.type === 'group'
}

export function flatten(items: PlanningItem[]): PlanningItem[] {
  const out: PlanningItem[] = []
  const walk = (list: PlanningItem[]): void => {
    for (const item of list) {
      out.push(item)
      if (isGroup(item)) walk(item.children)
    }
  }
  walk(items)
  return out
}

export function findItem(items: PlanningItem[], id: string): PlanningItem | undefined {
  for (const item of items) {
    if (item.id === id) return item
    if (isGroup(item)) {
      const found = findItem(item.children, id)
      if (found) return found
    }
  }
  return undefined
}

export function findParent(items: PlanningItem[], id: string): Group | null {
  for (const item of items) {
    if (isGroup(item)) {
      if (item.children.some((c) => c.id === id)) return item
      const deeper = findParent(item.children, id)
      if (deeper) return deeper
    }
  }
  return null
}

export function ancestorChain(items: PlanningItem[], id: string): string[] {
  const chain: string[] = []
  let parent = findParent(items, id)
  while (parent) {
    chain.push(parent.id)
    parent = findParent(items, parent.id)
  }
  return chain
}

function mapItems(items: PlanningItem[], fn: (item: PlanningItem) => PlanningItem | null): PlanningItem[] {
  const out: PlanningItem[] = []
  for (const item of items) {
    let next: PlanningItem | null = item
    if (isGroup(item)) {
      next = { ...item, children: mapItems(item.children, fn) }
    }
    next = fn(next!)
    if (next !== null) out.push(next)
  }
  return out
}

/**
 * Remove an item from the tree (by id) and return the detached item + new tree.
 * Returns null if not found.
 */
export function detachItem(items: PlanningItem[], id: string): { tree: PlanningItem[]; detached: PlanningItem } | null {
  let detached: PlanningItem | null = null
  const tree = mapItems(items, (item) => {
    if (item.id === id) {
      detached = item
      return null
    }
    return item
  })
  if (!detached) return null
  return { tree, detached }
}

/**
 * Insert `item` into `items` under `newParentId` (null = top level) at `index`.
 * Updates item.parentGroupId. All other attributes preserved.
 */
export function insertItem(
  items: PlanningItem[],
  item: PlanningItem,
  newParentId: string | null,
  index: number,
): PlanningItem[] {
  const updated: PlanningItem = { ...item, parentGroupId: newParentId }

  if (newParentId === null) {
    const next = [...items]
    const safeIndex = Math.max(0, Math.min(index, next.length))
    next.splice(safeIndex, 0, updated)
    return next
  }

  return mapItems(items, (it) => {
    if (it.id === newParentId && isGroup(it)) {
      const kids = [...it.children]
      const safeIndex = Math.max(0, Math.min(index, kids.length))
      kids.splice(safeIndex, 0, updated)
      return { ...it, children: kids }
    }
    return it
  })
}

export function moveItem(
  items: PlanningItem[],
  id: string,
  newParentId: string | null,
  index: number,
): PlanningItem[] {
  const detached = detachItem(items, id)
  if (!detached) return items
  // Prevent moving a group into its own subtree.
  if (newParentId !== null && isGroup(detached.detached)) {
    const subtreeIds = new Set(flatten([detached.detached]).map((i) => i.id))
    if (subtreeIds.has(newParentId)) return items
  }
  return insertItem(detached.tree, detached.detached, newParentId, index)
}

export function replaceItem(items: PlanningItem[], id: string, replacement: PlanningItem): PlanningItem[] {
  return mapItems(items, (it) => (it.id === id ? replacement : it))
}

export function removeItem(items: PlanningItem[], id: string): PlanningItem[] {
  return mapItems(items, (it) => (it.id === id ? null : it))
}
