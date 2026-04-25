import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { aggregatedView } from '@/domain/aggregation'
import { findItem, isGroup } from '@/domain/tree'
import type { PlanningItem, Resource, ResourceAllocation } from '@/domain/types'
import { usePlanningStore } from '@/store/planningStore'
import { Button } from '@/ui/common/Button'
import { ItemEditor } from './ItemEditor'

export function ItemTree() {
  const project = usePlanningStore((s) => s.project)
  const moveItem = usePlanningStore((s) => s.moveItem)
  const addItem = usePlanningStore((s) => s.addItem)
  const selectedItemId = usePlanningStore((s) => s.selectedItemId)
  const autoAcceptReschedule = usePlanningStore((s) => s.autoAcceptReschedule)
  const setAutoAcceptReschedule = usePlanningStore((s) => s.setAutoAcceptReschedule)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const view = aggregatedView(project)

  /**
   * New items are inserted relative to the current selection:
   *   - group selected  → appended inside that group
   *   - other selected  → sibling immediately after it, at the same level
   *   - nothing selected→ end of top level
   */
  const handleAdd = (factory: (parentId: string | null) => PlanningItem) => {
    const selected = selectedItemId ? findItem(project.items, selectedItemId) : undefined
    if (!selected) {
      addItem(factory(null))
      return
    }
    if (isGroup(selected)) {
      addItem(factory(selected.id))
      return
    }
    const parentId = selected.parentGroupId
    const parent = parentId ? findItem(project.items, parentId) : undefined
    const siblings = parent && isGroup(parent) ? parent.children : project.items
    const idx = siblings.findIndex((i) => i.id === selected.id)
    addItem(factory(parentId), idx + 1)
  }

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over || !e.active) return
    const activeId = String(e.active.id)
    const overData = e.over.data.current as DropTargetData | undefined
    if (!overData) return

    if (overData.kind === 'into-group') {
      moveItem(activeId, overData.groupId, Number.MAX_SAFE_INTEGER)
    } else if (overData.kind === 'top-level') {
      moveItem(activeId, null, Number.MAX_SAFE_INTEGER)
    } else if (overData.kind === 'before' || overData.kind === 'after') {
      const parent = overData.parentId ?? null
      const siblings = parent === null ? project.items : findGroupChildren(project.items, parent)
      const targetIndex = siblings.findIndex((i) => i.id === overData.targetId)
      const insertIndex = overData.kind === 'before' ? targetIndex : targetIndex + 1
      moveItem(activeId, parent, insertIndex)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b p-2 flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={() => handleAdd(newTask)}>+ Task</Button>
        <Button size="sm" onClick={() => handleAdd(newGroup)}>+ Group</Button>
        <Button size="sm" onClick={() => handleAdd(newMilestone)}>+ Milestone</Button>
        <label
          className="flex items-center gap-1.5 text-sm text-gray-700 ml-auto cursor-pointer select-none"
          title="When checked, dependency cascades apply without showing the confirmation dialog."
        >
          <input
            type="checkbox"
            checked={autoAcceptReschedule}
            onChange={(e) => setAutoAcceptReschedule(e.target.checked)}
          />
          Auto-reschedule
        </label>
      </div>
      <div className="overflow-auto flex-1">
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <TopLevelDropZone />
          {project.items.map((item) => (
            <TreeNode key={item.id} item={item} depth={0} view={view} />
          ))}
          {project.items.length === 0 && (
            <div className="p-6 text-center text-gray-500 text-sm">
              No items yet. Create your first task or group above.
            </div>
          )}
        </DndContext>
      </div>
    </div>
  )
}

function findGroupChildren(items: PlanningItem[], groupId: string): PlanningItem[] {
  for (const i of items) {
    if (i.id === groupId && i.type === 'group') return i.children
    if (i.type === 'group') {
      const deep = findGroupChildren(i.children, groupId)
      if (deep.length > 0 || i.children.some((c) => c.id === groupId)) return deep
    }
  }
  return []
}

type DropTargetData =
  | { kind: 'before'; targetId: string; parentId: string | null }
  | { kind: 'after'; targetId: string; parentId: string | null }
  | { kind: 'into-group'; groupId: string }
  | { kind: 'top-level' }

interface TreeNodeProps {
  item: PlanningItem
  depth: number
  view: ReturnType<typeof aggregatedView>
}

function TreeNode({ item, depth, view }: TreeNodeProps) {
  const selectedId = usePlanningStore((s) => s.selectedItemId)
  const setSelected = usePlanningStore((s) => s.setSelectedItem)
  const expanded = usePlanningStore((s) => s.expandedItemIds.has(item.id))
  const toggleExpanded = usePlanningStore((s) => s.toggleExpanded)

  const [childrenOpen, setChildrenOpen] = useState(true)
  const bounds = view.get(item.id)

  const isSelected = selectedId === item.id
  const parentId = item.parentGroupId

  return (
    <>
      <DropIndicator data={{ kind: 'before', targetId: item.id, parentId }} />
      <Row
        item={item}
        depth={depth}
        isSelected={isSelected}
        bounds={bounds}
        onRowClick={() => setSelected(item.id)}
        onRowDoubleClick={() => {
          setSelected(item.id)
          toggleExpanded(item.id)
        }}
        onChildToggle={item.type === 'group' ? () => setChildrenOpen((v) => !v) : undefined}
        childrenOpen={childrenOpen}
      />
      {expanded && <ItemEditor item={item} />}
      {item.type === 'group' && childrenOpen && (
        <div>
          {item.children.map((child) => (
            <TreeNode key={child.id} item={child} depth={depth + 1} view={view} />
          ))}
          <GroupInnerDropZone groupId={item.id} depth={depth + 1} />
        </div>
      )}
      <DropIndicator data={{ kind: 'after', targetId: item.id, parentId }} />
    </>
  )
}

interface RowProps {
  item: PlanningItem
  depth: number
  isSelected: boolean
  bounds: { startDate: string; endDate: string; estimationMD: number } | undefined
  onRowClick: () => void
  onRowDoubleClick: () => void
  onChildToggle: (() => void) | undefined
  childrenOpen: boolean
}

function Row({ item, depth, isSelected, bounds, onRowClick, onRowDoubleClick, onChildToggle, childrenOpen }: RowProps) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: item.id })
  const dropTarget: DropTargetData | null = item.type === 'group' ? { kind: 'into-group', groupId: item.id } : null
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `into-${item.id}`,
    ...(dropTarget ? { data: dropTarget } : {}),
    disabled: !dropTarget,
  })
  const setHoveredItem = usePlanningStore((s) => s.setHoveredItem)
  const resources = usePlanningStore((s) => s.project.resources)

  const hoverTimer = useRef<number | null>(null)
  const [previewAnchor, setPreviewAnchor] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => () => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current)
  }, [])

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    setHoveredItem(item.id)
    const rect = e.currentTarget.getBoundingClientRect()
    const anchor = { x: rect.right + 8, y: rect.top }
    hoverTimer.current = window.setTimeout(() => setPreviewAnchor(anchor), 1000)
  }
  const handleMouseLeave = () => {
    setHoveredItem(null)
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
    setPreviewAnchor(null)
  }

  const allocations = item.type === 'group' ? [] : item.allocations

  const icon = item.type === 'task' ? '📝' : item.type === 'group' ? '📁' : '◆'

  return (
    <div
      ref={(el) => {
        setDragRef(el)
        setDropRef(el)
      }}
      data-item-id={item.id}
      className={clsx(
        'flex items-center gap-2 px-2 py-1 border-b hover:bg-blue-50 cursor-pointer text-sm select-none',
        isSelected && 'bg-blue-100',
        isDragging && 'opacity-50',
        isOver && 'bg-green-100 ring-2 ring-green-400',
      )}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      onClick={onRowClick}
      onDoubleClick={onRowDoubleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span {...attributes} {...listeners} className="cursor-grab text-gray-400" onClick={(e) => e.stopPropagation()}>⋮⋮</span>
      {onChildToggle ? (
        <button
          className="w-4 text-gray-500"
          onClick={(e) => {
            e.stopPropagation()
            onChildToggle()
          }}
        >
          {childrenOpen ? '▾' : '▸'}
        </button>
      ) : (
        <span className="w-4" />
      )}
      <span>{icon}</span>
      <span className="font-medium truncate flex-1">{item.name || '(unnamed)'}</span>
      {bounds && (
        <span className="text-xs text-gray-500 tabular-nums">
          {bounds.startDate}
          {bounds.startDate !== bounds.endDate && ` → ${bounds.endDate}`}
          {item.type !== 'milestone' && ` · ${bounds.estimationMD}MD`}
        </span>
      )}
      {previewAnchor && (
        <HoverPreview
          anchor={previewAnchor}
          allocations={allocations}
          comments={item.comments}
          resources={resources}
        />
      )}
    </div>
  )
}

interface HoverPreviewProps {
  anchor: { x: number; y: number }
  allocations: ResourceAllocation[]
  comments: string
  resources: Resource[]
}

function HoverPreview({ anchor, allocations, comments, resources }: HoverPreviewProps) {
  const lines = allocations.map((a) => {
    const r = resources.find((r) => r.id === a.resourceId)
    const name = r?.name ?? '(unknown)'
    return `${name} (${a.allocationPct}%)`
  })
  return (
    <div
      className="fixed z-50 pointer-events-none bg-white border border-gray-300 rounded shadow-lg p-2 text-xs text-gray-800 max-w-xs"
      style={{ left: anchor.x, top: anchor.y }}
      role="tooltip"
      data-testid="item-hover-preview"
    >
      <div className="mb-1">
        <span className="font-semibold text-gray-600">Resources: </span>
        {lines.length === 0 ? <span className="italic text-gray-500">N/A</span> : <span>{lines.join(', ')}</span>}
      </div>
      <div>
        <span className="font-semibold text-gray-600">Comments: </span>
        <span className="whitespace-pre-wrap">{comments}</span>
      </div>
    </div>
  )
}

function DropIndicator({ data }: { data: DropTargetData }) {
  const id = JSON.stringify(data)
  const { setNodeRef, isOver } = useDroppable({ id, data })
  return (
    <div ref={setNodeRef} className={clsx('h-1', isOver && 'bg-green-500')} />
  )
}

function TopLevelDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: 'top-level', data: { kind: 'top-level' } satisfies DropTargetData })
  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'h-2',
        isOver && 'bg-green-300',
      )}
    />
  )
}

function GroupInnerDropZone({ groupId, depth }: { groupId: string; depth: number }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `innergroup-${groupId}`,
    data: { kind: 'into-group', groupId } satisfies DropTargetData,
  })
  return (
    <div
      ref={setNodeRef}
      className={clsx('h-2 mx-2 rounded', isOver && 'bg-green-300')}
      style={{ marginLeft: `${depth * 16 + 8}px` }}
    />
  )
}

// --- item factories ---

function newTask(parentGroupId: string | null): PlanningItem {
  const today = new Date().toISOString().slice(0, 10)
  return {
    id: crypto.randomUUID(),
    type: 'task',
    name: 'New task',
    parentGroupId,
    comments: '',
    startDate: today as never,
    estimationMD: 1,
    allocations: [],
  }
}

function newGroup(parentGroupId: string | null): PlanningItem {
  return {
    id: crypto.randomUUID(),
    type: 'group',
    name: 'New group',
    parentGroupId,
    comments: '',
    children: [],
  }
}

function newMilestone(parentGroupId: string | null): PlanningItem {
  const today = new Date().toISOString().slice(0, 10)
  return {
    id: crypto.randomUUID(),
    type: 'milestone',
    name: 'New milestone',
    parentGroupId,
    comments: '',
    date: today as never,
    allocations: [],
  }
}
