import { useMemo, useState } from 'react'
import { Button } from '@/ui/common/Button'
import { DateInput, Label, NumberInput, Select, TextArea, TextInput } from '@/ui/common/inputs'
import { usePlanningStore } from '@/store/planningStore'
import type { DependencyType, PlanningItem, ResourceAllocation } from '@/domain/types'
import { flatten } from '@/domain/tree'

interface ItemEditorProps {
  item: PlanningItem
}

const DEP_TYPE_LABELS: Record<DependencyType, string> = {
  FS: 'Finish → Start',
  SS: 'Start → Start',
  FF: 'Finish → Finish',
  SF: 'Start → Finish',
}

export function ItemEditor({ item }: ItemEditorProps) {
  const updateItem = usePlanningStore((s) => s.updateItem)
  const deleteItem = usePlanningStore((s) => s.deleteItem)
  const resources = usePlanningStore((s) => s.project.resources)
  const project = usePlanningStore((s) => s.project)
  const addDependency = usePlanningStore((s) => s.addDependency)
  const removeDependency = usePlanningStore((s) => s.removeDependency)
  const setAllocation = usePlanningStore((s) => s.setAllocation)
  const removeAllocation = usePlanningStore((s) => s.removeAllocation)

  const allItems = useMemo(() => flatten(project.items).filter((i) => i.id !== item.id), [project.items, item.id])
  const depsIn = project.dependencies.filter((d) => d.successorId === item.id)
  const depsOut = project.dependencies.filter((d) => d.predecessorId === item.id)

  const itemsById = useMemo(() => new Map(flatten(project.items).map((i) => [i.id, i])), [project.items])

  return (
    <div className="bg-gray-50 border-l-4 border-blue-500 p-4 grid gap-4" onClick={(e) => e.stopPropagation()}>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Name</Label>
          <TextInput
            value={item.name}
            onChange={(e) => updateItem(item.id, { name: e.target.value })}
            className="w-full"
          />
        </div>

        {item.type === 'task' && (
          <>
            <div>
              <Label>Start date</Label>
              <DateInput
                value={item.startDate}
                onChange={(e) => updateItem(item.id, { startDate: e.target.value as PlanningItem['id'] & string as never })}
              />
            </div>
            <div>
              <Label>Estimation (man-days)</Label>
              <NumberInput
                min={1}
                value={item.estimationMD}
                onChange={(e) => updateItem(item.id, { estimationMD: Math.max(1, Number(e.target.value) || 1) })}
              />
            </div>
          </>
        )}

        {item.type === 'milestone' && (
          <div>
            <Label>Date</Label>
            <DateInput
              value={item.date}
              onChange={(e) => updateItem(item.id, { date: e.target.value as never })}
            />
          </div>
        )}
      </div>

      {(item.type === 'task' || item.type === 'milestone') && (
        <div>
          <Label>Resource allocations</Label>
          <div className="grid gap-2">
            {item.allocations.map((a) => {
              const res = resources.find((r) => r.id === a.resourceId)
              return (
                <div key={a.resourceId} className="flex items-center gap-2">
                  <span className="text-sm w-40 truncate">{res?.name ?? '(unknown)'}</span>
                  <NumberInput
                    min={1}
                    max={100}
                    value={a.allocationPct}
                    onChange={(e) =>
                      setAllocation(item.id, {
                        resourceId: a.resourceId,
                        allocationPct: Math.max(1, Math.min(100, Number(e.target.value) || 1)),
                      })
                    }
                  />
                  <span className="text-xs text-gray-500">%</span>
                  <Button variant="ghost" size="sm" onClick={() => removeAllocation(item.id, a.resourceId)}>
                    Remove
                  </Button>
                </div>
              )
            })}
            <AddAllocation
              onAdd={(alloc) => setAllocation(item.id, alloc)}
              existing={new Set(item.allocations.map((a) => a.resourceId))}
              resources={resources}
            />
          </div>
        </div>
      )}

      <div>
        <Label>Dependencies (this item follows)</Label>
        <div className="grid gap-1 mb-2">
          {depsIn.length === 0 && <div className="text-xs text-gray-500 italic">No predecessors</div>}
          {depsIn.map((d) => (
            <div key={d.id} className="flex items-center gap-2 text-sm">
              <span className="font-medium">{itemsById.get(d.predecessorId)?.name ?? d.predecessorId}</span>
              <span className="text-xs text-gray-500">({DEP_TYPE_LABELS[d.type]})</span>
              <Button variant="ghost" size="sm" onClick={() => removeDependency(d.id)}>Remove</Button>
            </div>
          ))}
        </div>
        <AddDependency
          side="predecessor"
          onAdd={(predId, type) => {
            const res = addDependency(predId, item.id, type)
            if (!res.ok) alert(res.error)
          }}
          candidates={allItems}
        />
      </div>

      <div>
        <Label>Successors (items that follow this)</Label>
        <div className="grid gap-1 mb-2">
          {depsOut.length === 0 && <div className="text-xs text-gray-500 italic">No successors</div>}
          {depsOut.map((d) => (
            <div key={d.id} className="flex items-center gap-2 text-sm">
              <span className="font-medium">{itemsById.get(d.successorId)?.name ?? d.successorId}</span>
              <span className="text-xs text-gray-500">({DEP_TYPE_LABELS[d.type]})</span>
              <Button variant="ghost" size="sm" onClick={() => removeDependency(d.id)}>Remove</Button>
            </div>
          ))}
        </div>
        <AddDependency
          side="successor"
          onAdd={(succId, type) => {
            const res = addDependency(item.id, succId, type)
            if (!res.ok) alert(res.error)
          }}
          candidates={allItems}
        />
      </div>

      <div>
        <Label>Comments</Label>
        <TextArea
          rows={3}
          value={item.comments}
          onChange={(e) => updateItem(item.id, { comments: e.target.value })}
          className="w-full"
        />
      </div>

      <div className="flex justify-end">
        <Button variant="danger" size="sm" onClick={() => {
          if (confirm(`Delete "${item.name}"?`)) deleteItem(item.id)
        }}>Delete item</Button>
      </div>
    </div>
  )
}

function AddAllocation({
  onAdd,
  existing,
  resources,
}: {
  onAdd: (a: ResourceAllocation) => void
  existing: Set<string>
  resources: ReturnType<typeof usePlanningStore.getState>['project']['resources']
}) {
  const available = resources.filter((r) => !existing.has(r.id))
  if (available.length === 0) return <div className="text-xs text-gray-500 italic">All resources assigned</div>
  return (
    <div className="flex items-center gap-2">
      <Select
        defaultValue=""
        onChange={(e) => {
          if (!e.target.value) return
          onAdd({ resourceId: e.target.value, allocationPct: 100 })
          e.target.value = ''
        }}
      >
        <option value="">+ Add resource…</option>
        {available.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name} ({r.role})
          </option>
        ))}
      </Select>
    </div>
  )
}

function AddDependency({
  side,
  onAdd,
  candidates,
}: {
  side: 'predecessor' | 'successor'
  onAdd: (otherId: string, type: DependencyType) => void
  candidates: PlanningItem[]
}) {
  const [otherId, setOtherId] = useState('')
  const [type, setType] = useState<DependencyType>('FS')
  const itemPlaceholder = side === 'predecessor' ? 'Select predecessor…' : 'Select successor…'
  const buttonLabel = side === 'predecessor' ? 'Add predecessor' : 'Add successor'

  const handleAdd = () => {
    if (!otherId) return
    onAdd(otherId, type)
    setOtherId('')
    setType('FS')
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={otherId} onChange={(e) => setOtherId(e.target.value)}>
        <option value="">{itemPlaceholder}</option>
        {candidates.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </Select>
      <Select value={type} onChange={(e) => setType(e.target.value as DependencyType)}>
        {(Object.keys(DEP_TYPE_LABELS) as DependencyType[]).map((t) => (
          <option key={t} value={t}>
            {DEP_TYPE_LABELS[t]}
          </option>
        ))}
      </Select>
      <Button variant="secondary" size="sm" onClick={handleAdd} disabled={!otherId}>
        {buttonLabel}
      </Button>
    </div>
  )
}
