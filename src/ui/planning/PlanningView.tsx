import { useRef } from 'react'
import { usePlanningStore } from '@/store/planningStore'
import { GanttChart } from '@/ui/gantt/GanttChart'
import { ItemTreeBody, ItemTreeToolbar } from './ItemTree'
import { RescheduleDialog } from './RescheduleDialog'

export function PlanningView() {
  const project = usePlanningStore((s) => s.project)
  const setSelectedItem = usePlanningStore((s) => s.setSelectedItem)
  const toggleExpanded = usePlanningStore((s) => s.toggleExpanded)
  const scrollerRef = useRef<HTMLDivElement>(null)

  /**
   * Clears the selection when the click didn't land on a planning item.
   * Skip interactive controls (toolbar buttons, inputs, etc.) so they don't
   * accidentally drop the selection that the `+ Task/Group/Milestone` actions
   * rely on. ItemEditor stops propagation itself, so its inner clicks never
   * reach here.
   */
  const handleBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('[data-item-id]')) return
    if (target.closest('.bar-wrapper[data-id]')) return
    if (target.closest('button, input, textarea, select, label, a')) return
    setSelectedItem(null)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" onClick={handleBackgroundClick}>
      <div ref={scrollerRef} className="flex-1 overflow-y-auto">
        <div className="flex min-h-full items-stretch">
          <div className="w-[40%] min-w-[320px] border-r flex-shrink-0 flex flex-col">
            <div className="sticky top-0 z-20">
              <ItemTreeToolbar />
            </div>
            <ItemTreeBody />
          </div>
          <div className="flex-1 min-w-0">
            <GanttChart
              project={project}
              scrollContainerRef={scrollerRef}
              onItemClick={(id) => setSelectedItem(id)}
              onItemDoubleClick={(id) => {
                setSelectedItem(id)
                toggleExpanded(id)
              }}
            />
          </div>
        </div>
      </div>
      <RescheduleDialog />
    </div>
  )
}
