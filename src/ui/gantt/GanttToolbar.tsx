import { Button } from '@/ui/common/Button'
import { GANTT_HEADER_HEIGHT } from './constants'

interface GanttToolbarProps {
  zoomPct: number
  onZoomChange: (pct: number) => void
}

export function GanttToolbar({ zoomPct, onZoomChange }: GanttToolbarProps) {
  return (
    <div
      className="border-b px-2 flex items-center gap-2 bg-white box-border"
      style={{ height: GANTT_HEADER_HEIGHT }}
    >
      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            aria-label="Undo"
            title="Undo"
            className="rounded-full !px-0 w-8 h-8 justify-center text-base leading-none"
          >
            ↶
          </Button>
          <Button
            variant="secondary"
            size="sm"
            aria-label="Redo"
            title="Redo"
            className="rounded-full !px-0 w-8 h-8 justify-center text-base leading-none"
          >
            ↷
          </Button>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-700 select-none">
          <span className="text-xs text-gray-500">3 mo</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={zoomPct}
            onChange={(e) => onZoomChange(Number(e.target.value))}
            className="w-40 cursor-pointer"
            title="Zoom calendar"
            aria-label="Zoom calendar"
          />
          <span className="text-xs text-gray-500">2 wk</span>
        </div>
      </div>
    </div>
  )
}
