import Gantt, { type GanttTaskInput } from 'frappe-gantt'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { aggregatedView } from '@/domain/aggregation'
import { diffWorkingDays, isWorkingDay, toISO } from '@/domain/calendar'
import { findItem, visibleItems } from '@/domain/tree'
import { isoDate, type Project } from '@/domain/types'
import { usePlanningStore } from '@/store/planningStore'
import { GANTT_BAR_HEIGHT, GANTT_BAR_PADDING, GANTT_HEADER_HEIGHT, GANTT_ROW_HEIGHT } from './constants'

interface GanttChartProps {
  project: Project
  /**
   * The vertical scroll container that owns vertical scrolling for both the
   * Gantt and the item tree. The Gantt's pinned date row is translated against
   * this element's scrollTop so it stays at the visible top during scroll.
   */
  scrollContainerRef?: RefObject<HTMLDivElement | null>
  /**
   * Calendar zoom level, 0–100. 0 = ~3 months visible across the gantt
   * viewport; 100 = ~2 weeks visible. Drives `column_width` based on the
   * measured width of the gantt panel.
   */
  zoomPct?: number
  onItemClick?: (id: string) => void
  onItemDoubleClick?: (id: string) => void
}

const ZOOM_MAX_DAYS = 90 // visible at zoomPct=0
const ZOOM_MIN_DAYS = 14 // visible at zoomPct=100
const COLUMN_WIDTH_FLOOR = 6
// When the visible span reaches this many days the calendar header switches
// from per-day to per-week (ISO calendar week numbers).
const WEEK_MODE_DAY_THRESHOLD = 21

type GanttViewMode = 'Day' | 'Week'

interface ZoomLayout {
  viewMode: GanttViewMode
  columnWidth: number
}

function computeZoomLayout(zoomPct: number, panelWidth: number): ZoomLayout {
  const t = Math.min(1, Math.max(0, zoomPct / 100))
  const days = ZOOM_MAX_DAYS - (ZOOM_MAX_DAYS - ZOOM_MIN_DAYS) * t
  if (panelWidth <= 0) {
    return { viewMode: 'Day', columnWidth: 38 }
  }
  if (days >= WEEK_MODE_DAY_THRESHOLD) {
    const weeks = days / 7
    return { viewMode: 'Week', columnWidth: Math.max(COLUMN_WIDTH_FLOOR, panelWidth / weeks) }
  }
  return { viewMode: 'Day', columnWidth: Math.max(COLUMN_WIDTH_FLOOR, panelWidth / days) }
}

/**
 * ISO 8601 week number (1–53). Week 1 is the week containing the first
 * Thursday of the year; Monday-based.
 */
function isoWeekNumber(d: Date): number {
  const u = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = u.getUTCDay() || 7
  u.setUTCDate(u.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(u.getUTCFullYear(), 0, 1)
  return Math.ceil(((u.getTime() - yearStart) / 86400000 + 1) / 7)
}

const SPACER_PREFIX = '__spacer_'
const isSpacerId = (id: string) => id.startsWith(SPACER_PREFIX)

/**
 * Build the Gantt task list. Walks the item tree honoring `collapsedGroupIds`
 * and, for each item whose inline editor is currently open, appends N spacer
 * tasks so the Gantt grid leaves a vertical gap matching the editor's height
 * on the tree side. Spacer tasks have hidden bars (see `.spacer-row` in
 * index.css).
 */
function toGanttTasks(project: Project, expandedItemIds: ReadonlySet<string>, editorRowHeights: ReadonlyMap<string, number>): GanttTaskInput[] {
  const view = aggregatedView(project)
  const depsBySucc = new Map<string, string[]>()
  for (const d of project.dependencies) {
    if (!depsBySucc.has(d.successorId)) depsBySucc.set(d.successorId, [])
    depsBySucc.get(d.successorId)!.push(d.predecessorId)
  }
  const collapsed = new Set(project.collapsedGroupIds)
  // Pick any valid date to use as a placeholder anchor for items that have no
  // computable bounds (e.g. an empty group). The bar is hidden by CSS, so the
  // exact value doesn't matter — frappe-gantt only needs *something* parseable.
  const fallbackDate = view.values().next().value?.startDate ?? '2020-01-01'
  const tasks: GanttTaskInput[] = []
  for (const item of visibleItems(project.items, collapsed)) {
    const b = view.get(item.id)
    if (!b) {
      // Reserve a row in the Gantt so subsequent items stay aligned with the
      // tree. The bar itself is invisible (`spacer-row`).
      tasks.push({
        id: `${SPACER_PREFIX}empty_${item.id}`,
        name: '',
        start: fallbackDate,
        end: fallbackDate,
        progress: 0,
        dependencies: '',
        custom_class: 'spacer-row',
      })
      continue
    }
    const preds = depsBySucc.get(item.id) ?? []
    const custom =
      item.type === 'milestone' ? 'gantt-milestone' :
      item.type === 'group' ? 'gantt-group' : 'gantt-task'
    tasks.push({
      id: item.id,
      name: item.name || '(unnamed)',
      start: b.startDate,
      end: b.endDate,
      progress: 0,
      dependencies: preds.join(','),
      custom_class: custom,
    })
    if (expandedItemIds.has(item.id)) {
      const editorHeight = editorRowHeights.get(item.id) ?? 0
      const spacerRows = Math.max(0, Math.round(editorHeight / GANTT_ROW_HEIGHT))
      for (let i = 0; i < spacerRows; i++) {
        tasks.push({
          id: `${SPACER_PREFIX}${item.id}_${i}`,
          name: '',
          start: b.startDate,
          end: b.startDate,
          progress: 0,
          dependencies: '',
          custom_class: 'spacer-row',
        })
      }
    }
  }
  return tasks
}

export function GanttChart({ project, scrollContainerRef, zoomPct = 0, onItemClick, onItemDoubleClick }: GanttChartProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const ganttRef = useRef<Gantt | null>(null)
  const clickRef = useRef(onItemClick)
  clickRef.current = onItemClick
  const dblClickRef = useRef(onItemDoubleClick)
  dblClickRef.current = onItemDoubleClick
  const selectedItemId = usePlanningStore((s) => s.selectedItemId)
  const hoveredItemId = usePlanningStore((s) => s.hoveredItemId)
  const setHoveredItem = usePlanningStore((s) => s.setHoveredItem)
  const expandedItemIds = usePlanningStore((s) => s.expandedItemIds)
  const editorRowHeights = usePlanningStore((s) => s.editorRowHeights)
  // Width of the visible gantt viewport (the wrapper element). Drives the
  // column_width calculation alongside `zoomPct`. Tracked via ResizeObserver
  // so the calendar stays correctly fitted when the split handle is dragged
  // or the window is resized.
  const [panelWidth, setPanelWidth] = useState(0)
  // Live refs so the patched `update_view_scale` (installed once at
  // construction) always reads the latest values without needing to be
  // re-bound across renders.
  const columnWidthRef = useRef(38)
  const viewModeRef = useRef<GanttViewMode>('Day')
  // The id of the bar the user pressed down on. Used to ignore the cascaded
  // date_change events that frappe-gantt emits for dependent bars it shifted
  // along — only the bar actually grabbed by the user should push an edit.
  const draggedIdRef = useRef<string | null>(null)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    setPanelWidth(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      const e = entries[0]
      if (!e) return
      setPanelWidth(e.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { viewMode, columnWidth } = computeZoomLayout(zoomPct, panelWidth)
  columnWidthRef.current = columnWidth
  viewModeRef.current = viewMode

  useEffect(() => {
    if (!hostRef.current) return
    const tasks = toGanttTasks(project, expandedItemIds, editorRowHeights)
    if (tasks.length === 0) {
      hostRef.current.innerHTML = ''
      ganttRef.current = null
      return
    }
    if (!ganttRef.current) {
      ganttRef.current = new Gantt(hostRef.current, tasks, {
        view_mode: viewMode,
        bar_height: GANTT_BAR_HEIGHT,
        padding: GANTT_BAR_PADDING,
        header_height: GANTT_HEADER_HEIGHT,
        column_width: columnWidth,
        on_click: (t) => {
          if (isSpacerId(t.id)) return
          clickRef.current?.(t.id)
        },
        on_date_change: (task, start, end) => {
          if (isSpacerId(task.id)) return
          handleBarDateChange(task.id, start, end, draggedIdRef.current, ganttRef.current)
        },
      })
      // frappe-gantt's built-in get_snap_position rounds asymmetrically: JS `%`
      // on a negative dx yields a negative rem that's always < column_width/2,
      // so dragging the right handle left always snaps *toward zero shrink*
      // (needing a full extra column of drag to advance one snap step). This
      // makes shrinking from N MD to 1 MD land on 2 MD unless the user drags
      // well past the 1-column mark. Replace with a symmetric nearest-column
      // snap; safe because we only ever use view_mode: 'Day'.
      ;(ganttRef.current as unknown as { get_snap_position(dx: number): number }).get_snap_position =
        function (dx: number) {
          const col = (this as unknown as { options: { column_width: number } }).options.column_width
          return Math.round(dx / col) * col
        }
      // frappe-gantt's `update_view_scale` resets `column_width` and `step`
      // to hardcoded defaults on every refresh (see
      // node_modules/frappe-gantt/src/index.js `update_view_scale`). Override
      // it so our zoom-driven values for the active view mode survive
      // subsequent refresh() calls.
      ;(ganttRef.current as unknown as {
        update_view_scale(mode: string): void
        options: { step: number; column_width: number; view_mode: string }
      }).update_view_scale = function (mode: string) {
        const m = (mode as GanttViewMode) || viewModeRef.current
        this.options.view_mode = m
        this.options.step = m === 'Week' ? 24 * 7 : 24
        this.options.column_width = columnWidthRef.current
      }
      // The frappe-gantt constructor runs `change_view_mode` internally before
      // we get a chance to patch `update_view_scale`, so the initial render
      // uses the hardcoded default column_width. Refresh once now so the
      // patched scale takes effect on this first render.
      ganttRef.current.refresh(tasks)
    } else {
      ganttRef.current.options.view_mode = viewMode
      ganttRef.current.refresh(tasks)
    }
    syncSvgWidth(hostRef.current)
    reshapeMilestones(hostRef.current)
    // Always clear stale calendar overlays from the previous render — view-mode
    // changes can drop entire categories, so wipe before rebuilding.
    hostRef.current
      .querySelectorAll('svg .non-working-overlay, svg .month-divider, svg .week-divider, svg .week-holiday-marker')
      .forEach((n) => n.remove())
    if (viewMode === 'Day') {
      shadeNonWorkingDays(hostRef.current, project, ganttRef.current)
    } else {
      rewriteWeekHeaders(hostRef.current, ganttRef.current)
    }
    drawCalendarSeparators(hostRef.current, project, ganttRef.current, viewMode)
    pinHeader(hostRef.current, scrollContainerRef?.current ?? hostRef.current.parentElement)
  }, [project, expandedItemIds, editorRowHeights, scrollContainerRef, columnWidth, viewMode])

  // Keep the date header visually fixed when the user scrolls vertically. The
  // header pieces (`.grid-header` rect + `.upper-text` / `.lower-text` date
  // labels) live inside the SVG, so plain CSS `position: sticky` doesn't
  // apply — instead we move them into a top-most `<g class="sticky-header">`
  // (see pinHeader) and translate it on scroll. The vertical scroller is the
  // outer PlanningView container, not the gantt-host, so the listener attaches
  // to the ref provided by the parent.
  useEffect(() => {
    const scroller = scrollContainerRef?.current ?? hostRef.current?.parentElement
    if (!scroller) return
    const onScroll = () => {
      const sticky = hostRef.current?.querySelector('svg .sticky-header')
      if (sticky) sticky.setAttribute('transform', `translate(0 ${scroller.scrollTop})`)
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [scrollContainerRef])

  // Re-apply arrow highlighting when either the hovered or click-selected item
  // changes. Hover wins when present, falling back to the sticky selection.
  useEffect(() => {
    if (!hostRef.current) return
    highlightSelectedArrows(hostRef.current, hoveredItemId ?? selectedItemId)
  }, [project, hoveredItemId, selectedItemId])

  // Delegated hover on the bar layer: frappe-gantt stamps `data-id` on every
  // <g class="bar-wrapper">. We track enter/leave via pointer events on the
  // host and walk to the nearest ancestor with data-id. The same listener
  // captures pointerdown so we know which bar the user grabbed for a drag —
  // on_date_change fires for every cascaded bar, not just the grabbed one.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const findBarId = (target: EventTarget | null): string | null => {
      if (!(target instanceof Element)) return null
      const wrapper = target.closest('.bar-wrapper[data-id]')
      return wrapper ? wrapper.getAttribute('data-id') : null
    }
    const onOver = (e: PointerEvent) => {
      const id = findBarId(e.target)
      if (id && !isSpacerId(id)) setHoveredItem(id)
    }
    const onOut = (e: PointerEvent) => {
      // Only clear when leaving the bar (entering an unrelated element).
      const from = findBarId(e.target)
      const to = findBarId(e.relatedTarget)
      if (from && from !== to) setHoveredItem(null)
    }
    const onDown = (e: PointerEvent) => {
      draggedIdRef.current = findBarId(e.target)
    }
    const onDblClick = (e: MouseEvent) => {
      const id = findBarId(e.target)
      if (id && !isSpacerId(id)) dblClickRef.current?.(id)
    }
    host.addEventListener('pointerover', onOver)
    host.addEventListener('pointerout', onOut)
    host.addEventListener('pointerdown', onDown)
    host.addEventListener('dblclick', onDblClick)
    return () => {
      host.removeEventListener('pointerover', onOver)
      host.removeEventListener('pointerout', onOut)
      host.removeEventListener('pointerdown', onDown)
      host.removeEventListener('dblclick', onDblClick)
    }
  }, [setHoveredItem])

  return (
    <div ref={wrapperRef} className="gantt-host overflow-x-auto">
      <div ref={hostRef} />
    </div>
  )
}

/**
 * Snap a Date to the nearest midnight and return it as an ISO date.
 *
 * frappe-gantt places bars at an x-offset computed from
 * `date_utils.diff(task_start, gantt_start, 'hour')` (see
 * node_modules/frappe-gantt/src/bar.js `compute_x`). That `diff` takes
 * `Math.floor(milliseconds / 3_600_000)`, so if a DST transition falls
 * between `gantt_start` and the task, the hour count is short by 1, which
 * makes the stored `x` fractional. On drag release, `compute_start_end_date`
 * inverts that math and hands back a start time of 23:00 the previous day
 * (or 01:00 the same day, depending on DST direction). `toISO` then formats
 * that as the wrong calendar date, which `diffWorkingDays` interprets as
 * +1 MD.
 *
 * Bars always live on whole-day column boundaries, so the right answer is to
 * round the fractional time to the nearest midnight. Hour ≥ 12 rounds up,
 * else down — this handles DST drift in either direction.
 */
function snapDateToNearestDay(d: Date): ReturnType<typeof toISO> {
  const snapped = new Date(d)
  if (snapped.getHours() >= 12) {
    snapped.setDate(snapped.getDate() + 1)
  }
  snapped.setHours(0, 0, 0, 0)
  return toISO(snapped)
}

/**
 * Translate a frappe-gantt drag/resize event into a domain-level edit.
 *
 * frappe-gantt emits `date_change` for every bar it shifted — including the
 * dependents it auto-moved to satisfy the predecessor's new dates. We only
 * want to persist the edit on the bar the user actually grabbed (identified
 * by `draggedId`), otherwise the cascaded events fight our own reschedule
 * logic. The dependent movements are recomputed authoritatively by
 * `applyWithReschedule` in the store once the grabbed task's update lands.
 *
 * Non-task items (groups, milestones) aren't user-editable via the Gantt:
 * groups are aggregated, milestones are zero-duration with a separate edit
 * flow. When the user drags one, we snap the bar back to the authoritative
 * project state via `refresh()`.
 */
function handleBarDateChange(
  taskId: string,
  start: Date,
  end: Date,
  draggedId: string | null,
  gantt: Gantt | null,
): void {
  if (draggedId !== null && draggedId !== taskId) return
  const state = usePlanningStore.getState()
  const item = findItem(state.project.items, taskId)
  if (!item) return
  const snapTasks = () => toGanttTasks(state.project, state.expandedItemIds, state.editorRowHeights)
  if (item.type !== 'task') {
    // Snap back. refresh() is synchronous; queueing avoids recursing inside
    // frappe-gantt's mouseup handler which is still finishing up.
    if (gantt) queueMicrotask(() => gantt.refresh(snapTasks()))
    return
  }
  const newStartISO = snapDateToNearestDay(start)
  const newEndISO = toISO(end)
  const estimationMD = Math.max(1, diffWorkingDays(newStartISO, newEndISO, state.project.calendar))
  if (newStartISO === item.startDate && estimationMD === item.estimationMD) {
    // The drag was a semantic no-op — e.g. the user dragged the right edge
    // across weekend columns, which all collapse to the same working-day
    // count. frappe-gantt has already moved the bar to the drop position, so
    // without a refresh it stays visually displaced from the canonical state.
    // Snap it back.
    if (gantt) queueMicrotask(() => gantt.refresh(snapTasks()))
    return
  }
  state.updateItem(taskId, { startDate: newStartISO, estimationMD })
}

/**
 * In Week view mode, frappe-gantt renders the lower header text as the
 * day-of-month of each week's first day (e.g. "5" or "5 Jan"). When the user
 * has zoomed out enough to see calendar weeks, replace those labels with the
 * ISO 8601 week number ("W18") so the header reads as a calendar-week ruler.
 *
 * `gantt.dates` is the ordered array of column anchor dates that frappe-gantt
 * computes during `setup_dates`; the rendered `.lower-text` elements are
 * created in the same order, so index-aligning the two is reliable.
 */
function rewriteWeekHeaders(host: HTMLElement, gantt: Gantt | null) {
  if (!gantt) return
  const dates = (gantt as unknown as { dates?: Date[] }).dates
  if (!dates || dates.length === 0) return
  const lowers = host.querySelectorAll<SVGTextElement>('svg .lower-text')
  lowers.forEach((el, i) => {
    const d = dates[i]
    if (!d) return
    el.textContent = `W${isoWeekNumber(d)}`
  })
}

/**
 * Dim all dependency arrows by default; fully highlight the ones connected to
 * the currently selected item (either as predecessor or successor). The arrow
 * paths live inside `<g class="arrow">` and carry `data-from` / `data-to`
 * attributes set by frappe-gantt — see node_modules/frappe-gantt/src/arrow.js.
 */
function highlightSelectedArrows(host: HTMLElement, selectedId: string | null) {
  const arrows = host.querySelectorAll<SVGPathElement>('svg .arrow path')
  arrows.forEach((path) => {
    const from = path.getAttribute('data-from')
    const to = path.getAttribute('data-to')
    const connected = selectedId !== null && (from === selectedId || to === selectedId)
    path.classList.toggle('arrow-highlighted', connected)
  })
}

/**
 * frappe-gantt's `set_width()` only grows the SVG (see node_modules/frappe-gantt
 * /src/index.js line ~617: `if (cur_width < actual_width) { ... }`). When the
 * project shrinks — e.g. after a task estimation decrease contracts the project
 * end — the SVG keeps its old larger width, leaving trailing empty columns that
 * make the timeline look wrong. Sync the SVG width to the actual grid content
 * width after every refresh so both grow and shrink reliably.
 */
/**
 * Resize milestone bars to a square the size of the bar height, centred on the
 * milestone's date column. The CSS then rotates each square 45° to render an
 * equal-sided rhombus. Without this, the underlying rect inherits the current
 * column width, so the rotated diamond stretches into a parallelogram as the
 * user zooms.
 */
function reshapeMilestones(host: HTMLElement) {
  const wrappers = host.querySelectorAll<SVGGElement>('.bar-wrapper.gantt-milestone')
  const size = GANTT_BAR_HEIGHT
  wrappers.forEach((w) => {
    const bar = w.querySelector<SVGRectElement>('.bar')
    if (!bar) return
    const x = Number(bar.getAttribute('x') ?? 0)
    const width = Number(bar.getAttribute('width') ?? 0)
    const centerX = x + width / 2
    bar.setAttribute('x', String(centerX - size / 2))
    bar.setAttribute('width', String(size))
    bar.setAttribute('height', String(size))
  })
}

function syncSvgWidth(host: HTMLElement) {
  const svg = host.querySelector<SVGSVGElement>('svg')
  if (!svg) return
  const gridRow = svg.querySelector<SVGRectElement>('.grid .grid-row')
  if (!gridRow) return
  const gridWidth = Number(gridRow.getAttribute('width') ?? 0)
  if (!gridWidth) return
  svg.setAttribute('width', String(gridWidth))
}

/**
 * Move the date header into a top-most `<g class="sticky-header">` so it can be
 * translated on scroll to stay visually fixed at the top of the viewport.
 *
 * SVG draw order = DOM order. Appending the sticky group as the SVG's last
 * child ensures the header rect and date labels paint on top of bars, arrows,
 * and the non-working-day overlays when the chart is scrolled down.
 *
 * Called after every render (`refresh()` recreates these elements), so we
 * always re-collect them. The scroll handler reads the current `.sticky-header`
 * from the DOM each time, so the post-refresh element is picked up
 * transparently.
 */
function pinHeader(host: HTMLElement, scroller: HTMLElement | null) {
  const svg = host.querySelector('svg')
  if (!svg) return
  // Drop any leftover sticky group from a prior render (refresh() recreates
  // the underlying nodes, so the previous wrapper would be empty).
  svg.querySelectorAll('.sticky-header').forEach((n) => n.remove())

  const headerRect = svg.querySelector('.grid-header')
  const dateTexts = svg.querySelectorAll('.upper-text, .lower-text')
  if (!headerRect && dateTexts.length === 0) return

  const ns = 'http://www.w3.org/2000/svg'
  const sticky = document.createElementNS(ns, 'g')
  sticky.setAttribute('class', 'sticky-header')
  if (headerRect) sticky.appendChild(headerRect)
  dateTexts.forEach((el) => sticky.appendChild(el))
  svg.appendChild(sticky)

  // Re-apply the current scroll offset so the header stays pinned across
  // re-renders (refresh resets transform).
  if (scroller && scroller.scrollTop > 0) {
    sticky.setAttribute('transform', `translate(0 ${scroller.scrollTop})`)
  }
}

/**
 * Geometry shared by all column-aligned overlays (shading, dividers, markers).
 *
 * - `firstTickX` / `columnWidth`: derived from the first two `.tick` elements
 *   frappe-gantt renders. Each tick's x lives in either an `x1` attribute (line)
 *   or the `M <x>` token of a `path d=`.
 * - `ganttStart`: the chart's internal start date (frappe-gantt pads ahead of
 *   the first task, so this is not the project's min date).
 * - `totalCols`: number of date columns in the grid.
 * - `bodyY` / `bodyH`: vertical band of the chart body, excluding the header.
 */
interface ColumnGeometry {
  firstTickX: number
  columnWidth: number
  ganttStart: Date
  totalCols: number
  bodyY: number
  bodyH: number
  headerH: number
}

function readColumnGeometry(svg: SVGSVGElement, gantt: Gantt | null): ColumnGeometry | null {
  const ticks = svg.querySelectorAll<SVGGraphicsElement>('.tick')
  if (ticks.length < 2) return null
  const tickX = (el: Element): number => {
    const x1 = el.getAttribute('x1')
    if (x1 != null) return Number(x1)
    const d = el.getAttribute('d') ?? ''
    const m = d.match(/M\s*(-?\d+(?:\.\d+)?)/)
    return m ? Number(m[1]) : 0
  }
  const firstTickX = tickX(ticks[0]!)
  const columnWidth = tickX(ticks[1]!) - firstTickX
  if (columnWidth <= 0) return null
  const ganttStart = (gantt as unknown as { gantt_start?: Date } | null)?.gantt_start
  if (!ganttStart) return null

  const bg = svg.querySelector<SVGRectElement>('.grid-background')
  const header = svg.querySelector<SVGRectElement>('.grid-header')
  const headerH = header ? Number(header.getAttribute('height') ?? 0) : 0
  const bgY = bg ? Number(bg.getAttribute('y') ?? 0) : 0
  const fallbackH = Number(svg.querySelector<SVGGElement>('.grid')?.getAttribute('data-height') ?? 0) ||
    Number(svg.getAttribute('height') ?? 0)
  const bgH = bg ? Number(bg.getAttribute('height') ?? fallbackH) : fallbackH
  const bodyY = bgY + headerH
  const bodyH = Math.max(0, bgH - headerH)

  return { firstTickX, columnWidth, ganttStart, totalCols: ticks.length, bodyY, bodyH, headerH }
}

function columnDate(geom: ColumnGeometry, i: number, daysPerColumn = 1): Date {
  const startMs = new Date(
    geom.ganttStart.getFullYear(),
    geom.ganttStart.getMonth(),
    geom.ganttStart.getDate(),
  ).getTime()
  return new Date(startMs + i * daysPerColumn * 24 * 60 * 60 * 1000)
}

function localISO(d: Date) {
  return isoDate(
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  )
}

function shadeNonWorkingDays(host: HTMLElement, project: Project, gantt: Gantt | null) {
  // Vertical tint rects aligned with day columns, derived from `isWorkingDay`.
  const svg = host.querySelector('svg')
  if (!svg) return
  const geom = readColumnGeometry(svg, gantt)
  if (!geom) return

  const ns = 'http://www.w3.org/2000/svg'
  const gridEl = svg.querySelector('.grid')
  // Insert overlays after the grid-header rect so the header's white fill
  // doesn't paint over them; tick lines and bars still render on top because
  // they appear later in the DOM.
  const anchor = gridEl?.querySelector('.grid-header')?.nextSibling ?? null
  for (let i = 0; i < geom.totalCols; i++) {
    const d = columnDate(geom, i)
    const iso = localISO(d)
    if (isWorkingDay(iso, project.calendar)) continue
    const isHoliday = project.calendar.holidays.includes(iso)
    const rect = document.createElementNS(ns, 'rect')
    rect.setAttribute('class', 'non-working-overlay')
    rect.setAttribute('x', String(geom.firstTickX + i * geom.columnWidth))
    rect.setAttribute('y', String(geom.bodyY))
    rect.setAttribute('width', String(geom.columnWidth))
    rect.setAttribute('height', String(geom.bodyH))
    // Holidays → light red (red-100); weekends/other non-workdays → slate-100.
    rect.setAttribute('fill', isHoliday ? '#fee2e2' : '#f1f5f9')
    rect.setAttribute('pointer-events', 'none')
    if (gridEl) gridEl.insertBefore(rect, anchor)
  }
}

/**
 * Draw vertical separators that give the calendar a visual hierarchy:
 *
 * - Solid month dividers in both Day and Week mode (column whose anchor falls
 *   on the 1st of a month, or whose 7-day span crosses the 1st in Week mode).
 * - Dashed week dividers on Mondays in Day mode (skipped where a month
 *   divider already lands on that column).
 * - In Week mode, a thin red bar under the week label for any week whose
 *   7-day span includes a configured holiday.
 */
function drawCalendarSeparators(
  host: HTMLElement,
  project: Project,
  gantt: Gantt | null,
  viewMode: GanttViewMode,
) {
  const svg = host.querySelector('svg')
  if (!svg) return
  const geom = readColumnGeometry(svg, gantt)
  if (!geom) return

  const ns = 'http://www.w3.org/2000/svg'
  const gridEl = svg.querySelector('.grid')
  if (!gridEl) return
  const anchor = gridEl.querySelector('.grid-header')?.nextSibling ?? null

  const yTop = geom.bodyY
  const yBottom = geom.bodyY + geom.bodyH
  const daysPerColumn = viewMode === 'Week' ? 7 : 1

  for (let i = 0; i < geom.totalCols; i++) {
    const d = columnDate(geom, i, daysPerColumn)
    const x = geom.firstTickX + i * geom.columnWidth

    let isMonthBoundary = false
    if (viewMode === 'Day') {
      isMonthBoundary = d.getDate() === 1
    } else {
      // Week column: a month boundary lands inside [d, d+6] but is not the start.
      for (let j = 0; j < 7; j++) {
        const cd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + j)
        if (cd.getDate() === 1) { isMonthBoundary = true; break }
      }
    }

    if (isMonthBoundary) {
      const line = document.createElementNS(ns, 'line')
      line.setAttribute('class', 'month-divider')
      line.setAttribute('x1', String(x))
      line.setAttribute('x2', String(x))
      line.setAttribute('y1', String(yTop))
      line.setAttribute('y2', String(yBottom))
      line.setAttribute('pointer-events', 'none')
      gridEl.insertBefore(line, anchor)
    } else if (viewMode === 'Day' && d.getDay() === 1) {
      const line = document.createElementNS(ns, 'line')
      line.setAttribute('class', 'week-divider')
      line.setAttribute('x1', String(x))
      line.setAttribute('x2', String(x))
      line.setAttribute('y1', String(yTop))
      line.setAttribute('y2', String(yBottom))
      line.setAttribute('pointer-events', 'none')
      gridEl.insertBefore(line, anchor)
    }

    if (viewMode === 'Week' && project.calendar.holidays.length > 0) {
      let hasHoliday = false
      for (let j = 0; j < 7; j++) {
        const cd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + j)
        if (project.calendar.holidays.includes(localISO(cd))) { hasHoliday = true; break }
      }
      if (hasHoliday) {
        const marker = document.createElementNS(ns, 'rect')
        marker.setAttribute('class', 'week-holiday-marker')
        marker.setAttribute('x', String(x))
        marker.setAttribute('y', String(geom.bodyY - 3))
        marker.setAttribute('width', String(geom.columnWidth))
        marker.setAttribute('height', '3')
        marker.setAttribute('fill', '#dc2626')
        marker.setAttribute('pointer-events', 'none')
        gridEl.insertBefore(marker, anchor)
      }
    }
  }
}
