import { usePlanningStore } from '@/store/planningStore'
import { GanttChart } from '@/ui/gantt/GanttChart'
import { ItemTree } from './ItemTree'
import { RescheduleDialog } from './RescheduleDialog'

export function PlanningView() {
  const project = usePlanningStore((s) => s.project)
  const setSelectedItem = usePlanningStore((s) => s.setSelectedItem)
  const toggleExpanded = usePlanningStore((s) => s.toggleExpanded)

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
    <div className="flex-1 flex overflow-hidden" onClick={handleBackgroundClick}>
      <div className="w-[40%] min-w-[320px] border-r flex flex-col">
        <ItemTree />
      </div>
      <div className="flex-1 overflow-hidden">
        <GanttChart
          project={project}
          onItemClick={(id) => setSelectedItem(id)}
          onItemDoubleClick={(id) => {
            setSelectedItem(id)
            toggleExpanded(id)
          }}
        />
      </div>
      <RescheduleDialog />
    </div>
  )
}
