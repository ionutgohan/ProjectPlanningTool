import { flatten } from '@/domain/tree'
import { usePlanningStore } from '@/store/planningStore'
import { Button } from '@/ui/common/Button'
import { Dialog } from '@/ui/common/Dialog'

export function RescheduleDialog() {
  const pending = usePlanningStore((s) => s.pendingReschedule)
  const confirm = usePlanningStore((s) => s.confirmReschedule)
  const cancel = usePlanningStore((s) => s.cancelReschedule)
  const project = usePlanningStore((s) => s.project)

  const itemsById = new Map(flatten(project.items).map((i) => [i.id, i]))

  return (
    <Dialog
      open={pending !== null}
      onClose={cancel}
      title="Dependencies require rescheduling"
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={cancel}>Cancel edit</Button>
          <Button variant="primary" onClick={confirm}>Apply reschedule</Button>
        </>
      }
    >
      <p className="text-sm text-gray-600 mb-4">
        Your edit would violate dependencies. The following items must shift to remain consistent.
        Applying will move these items; cancelling will revert your edit.
      </p>
      <div className="border rounded divide-y">
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 px-3 py-2 text-xs font-semibold bg-gray-50">
          <span>Item</span>
          <span>Old dates</span>
          <span>New dates</span>
        </div>
        {pending?.proposal.changes.map((c) => (
          <div key={c.itemId} className="grid grid-cols-[1fr_1fr_1fr] gap-2 px-3 py-2 text-sm">
            <span className="font-medium">{itemsById.get(c.itemId)?.name ?? c.itemId}</span>
            <span className="text-gray-600 tabular-nums">
              {c.oldStart}
              {c.oldStart !== c.oldEnd && ` → ${c.oldEnd}`}
            </span>
            <span className="text-blue-700 tabular-nums font-medium">
              {c.newStart}
              {c.newStart !== c.newEnd && ` → ${c.newEnd}`}
            </span>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
