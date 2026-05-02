import { useEffect, useRef, useState } from 'react'
import { usePlanningStore } from '@/store/planningStore'
import { GanttChart } from '@/ui/gantt/GanttChart'
import { GanttToolbar } from '@/ui/gantt/GanttToolbar'
import { GANTT_HEADER_HEIGHT } from '@/ui/gantt/constants'
import { ItemTreeBody, ItemTreeToolbar } from './ItemTree'
import { RescheduleDialog } from './RescheduleDialog'

const SPLIT_STORAGE_KEY = 'planning.splitPct'
const MIN_PCT = 15
const MAX_PCT = 85
const DEFAULT_PCT = 40

const ZOOM_STORAGE_KEY = 'planning.ganttZoomPct'
const DEFAULT_ZOOM = 0

function loadInitialSplit(): number {
  if (typeof window === 'undefined') return DEFAULT_PCT
  const raw = window.localStorage.getItem(SPLIT_STORAGE_KEY)
  const parsed = raw ? Number(raw) : NaN
  if (!Number.isFinite(parsed)) return DEFAULT_PCT
  return Math.min(MAX_PCT, Math.max(MIN_PCT, parsed))
}

function loadInitialZoom(): number {
  if (typeof window === 'undefined') return DEFAULT_ZOOM
  const raw = window.localStorage.getItem(ZOOM_STORAGE_KEY)
  const parsed = raw ? Number(raw) : NaN
  if (!Number.isFinite(parsed)) return DEFAULT_ZOOM
  return Math.min(100, Math.max(0, parsed))
}

export function PlanningView() {
  const project = usePlanningStore((s) => s.project)
  const setSelectedItem = usePlanningStore((s) => s.setSelectedItem)
  const toggleExpanded = usePlanningStore((s) => s.toggleExpanded)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const [splitPct, setSplitPct] = useState<number>(loadInitialSplit)
  const [isDragging, setIsDragging] = useState(false)
  const [zoomPct, setZoomPct] = useState<number>(loadInitialZoom)

  useEffect(() => {
    window.localStorage.setItem(SPLIT_STORAGE_KEY, String(splitPct))
  }, [splitPct])

  useEffect(() => {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, String(zoomPct))
  }, [zoomPct])

  useEffect(() => {
    if (!isDragging) return
    const handleMove = (e: MouseEvent) => {
      const container = splitContainerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      if (rect.width <= 0) return
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      setSplitPct(Math.min(MAX_PCT, Math.max(MIN_PCT, pct)))
    }
    const handleUp = () => setIsDragging(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    const prevCursor = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevSelect
    }
  }, [isDragging])

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
    if (target.closest('[data-split-handle]')) return
    if (target.closest('[data-tree-header-spacer]')) return
    setSelectedItem(null)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" onClick={handleBackgroundClick}>
      <div ref={scrollerRef} className="flex-1 overflow-y-auto">
        <div ref={splitContainerRef} className="flex min-h-full items-stretch">
          <div
            className="flex-shrink-0 flex flex-col"
            style={{ width: `${splitPct}%`, minWidth: 240 }}
          >
            <div className="sticky top-0 z-20">
              <ItemTreeToolbar />
            </div>
            <div
              data-tree-header-spacer
              aria-hidden
              className="sticky z-10 bg-white border-b border-slate-200"
              style={{ top: GANTT_HEADER_HEIGHT, height: GANTT_HEADER_HEIGHT }}
            />
            <ItemTreeBody />
          </div>
          <div
            data-split-handle
            role="separator"
            aria-orientation="vertical"
            onMouseDown={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDoubleClick={() => setSplitPct(DEFAULT_PCT)}
            className={`flex-shrink-0 w-1 cursor-col-resize bg-slate-200 hover:bg-blue-400 transition-colors ${
              isDragging ? 'bg-blue-500' : ''
            }`}
            title="Drag to resize · Double-click to reset"
          />
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="sticky top-0 z-20">
              <GanttToolbar zoomPct={zoomPct} onZoomChange={setZoomPct} />
            </div>
            <GanttChart
              project={project}
              scrollContainerRef={scrollerRef}
              zoomPct={zoomPct}
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
