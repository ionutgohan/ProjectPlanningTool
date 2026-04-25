import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { aggregatedView, projectBounds } from '@/domain/aggregation'
import { computeDailyLoad } from '@/domain/allocation'
import { allDaysInRange, isWorkingDay } from '@/domain/calendar'
import { flatten } from '@/domain/tree'
import { isoDate, type Resource } from '@/domain/types'
import { usePlanningStore } from '@/store/planningStore'
import { Button } from '@/ui/common/Button'
import { NumberInput, TextInput } from '@/ui/common/inputs'

export function ResourcesView() {
  const project = usePlanningStore((s) => s.project)
  const addResource = usePlanningStore((s) => s.addResource)
  const updateResource = usePlanningStore((s) => s.updateResource)
  const deleteResource = usePlanningStore((s) => s.deleteResource)

  const loads = useMemo(() => computeDailyLoad(project), [project])
  const pb = projectBounds(project)
  const view = aggregatedView(project)
  const days = pb ? allDaysInRange(pb.start, pb.end) : []

  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-lg font-semibold">Resources</h2>
        <Button
          size="sm"
          onClick={() =>
            addResource({ id: crypto.randomUUID(), name: 'New resource', role: '', capacityPct: 100 })
          }
        >
          + Add resource
        </Button>
      </div>
      {project.resources.length === 0 && (
        <div className="text-sm text-gray-500 italic">No resources yet.</div>
      )}
      <div className="grid gap-2">
        {project.resources.map((r) => {
          const dayMap = loads.get(r.id) ?? new Map()
          let peak = 0
          let overDays = 0
          for (const [, load] of dayMap) {
            if (load > peak) peak = load
            if (load > r.capacityPct) overDays++
          }
          const isExpanded = expandedId === r.id

          const assigned = flatten(project.items).filter((item) => {
            if (item.type === 'group') return false
            return item.allocations.some((a) => a.resourceId === r.id)
          })

          return (
            <div key={r.id} className="border rounded bg-white">
              <div
                className="grid grid-cols-[1fr_1fr_8rem_8rem_8rem_6rem] gap-2 items-center px-3 py-2 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : r.id)}
              >
                <ResourceField
                  value={r.name}
                  onCommit={(v) => updateResource(r.id, { name: v })}
                  placeholder="Name"
                />
                <ResourceField
                  value={r.role}
                  onCommit={(v) => updateResource(r.id, { role: v })}
                  placeholder="Role"
                />
                <div className="flex items-center gap-1">
                  <NumberInput
                    min={0}
                    max={200}
                    value={r.capacityPct}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      updateResource(r.id, { capacityPct: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                  <span className="text-xs text-gray-500">% cap</span>
                </div>
                <div className={clsx('text-sm', peak > r.capacityPct ? 'text-red-700 font-semibold' : 'text-gray-700')}>
                  Peak {peak}%
                </div>
                <div className={clsx('text-sm', overDays > 0 ? 'text-red-700 font-semibold' : 'text-gray-600')}>
                  {overDays} overbooked day{overDays === 1 ? '' : 's'}
                </div>
                <div className="text-right">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      const activeAllocs = assigned.length
                      const ok = activeAllocs === 0 || confirm(`Resource is allocated to ${activeAllocs} item(s). Remove anyway?`)
                      if (ok) deleteResource(r.id)
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>
              {isExpanded && (
                <div className="border-t bg-gray-50 p-3">
                  <div className="mb-3">
                    <h4 className="text-sm font-semibold mb-1">Assigned items</h4>
                    {assigned.length === 0 ? (
                      <div className="text-xs text-gray-500 italic">None</div>
                    ) : (
                      <div className="grid gap-1 text-sm">
                        {assigned.map((item) => {
                          const alloc = (item.type === 'task' || item.type === 'milestone')
                            ? item.allocations.find((a) => a.resourceId === r.id)
                            : undefined
                          const b = view.get(item.id)
                          return (
                            <div key={item.id} className="flex items-center gap-2">
                              <span className="font-medium">{item.name}</span>
                              <span className="text-xs text-gray-500">
                                {b ? `${b.startDate}${b.startDate !== b.endDate ? ` → ${b.endDate}` : ''}` : ''}
                              </span>
                              <span className="text-xs text-gray-700 ml-auto">{alloc?.allocationPct}%</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  {days.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-1">Daily load</h4>
                      <DailyHeatmap
                        days={days}
                        dayMap={dayMap}
                        capacityPct={r.capacityPct}
                        calendar={project.calendar}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ResourceField({
  value,
  onCommit,
  placeholder,
}: {
  value: string
  onCommit: (v: string) => void
  placeholder: string
}) {
  return (
    <TextInput
      value={value}
      placeholder={placeholder}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onCommit(e.target.value)}
    />
  )
}

function DailyHeatmap({
  days,
  dayMap,
  capacityPct,
  calendar,
}: {
  days: ReturnType<typeof allDaysInRange>
  dayMap: Map<string, number>
  capacityPct: Resource['capacityPct']
  calendar: { workdays: string[]; holidays: string[] }
}) {
  return (
    <div className="flex flex-wrap gap-0.5">
      {days.map((d) => {
        const load = dayMap.get(d) ?? 0
        const working = isWorkingDay(isoDate(d), calendar as never)
        const isOver = load > capacityPct
        const ratio = capacityPct > 0 ? Math.min(1, load / capacityPct) : 0
        const bg = !working
          ? '#e5e7eb'
          : isOver
            ? '#dc2626'
            : `rgba(37, 99, 235, ${0.15 + ratio * 0.6})`
        return (
          <div
            key={d}
            className="w-3 h-6 rounded-sm"
            style={{ backgroundColor: bg }}
            title={`${d}${working ? '' : ' (non-working)'} · load ${load}% / cap ${capacityPct}%`}
          />
        )
      })}
    </div>
  )
}
