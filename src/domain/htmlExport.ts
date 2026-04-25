/**
 * Pure string-building HTML exporter. No DOM, no React, no frappe-gantt.
 *
 * Produces a single self-contained HTML document that renders:
 *   - project metadata
 *   - a nested tree of items
 *   - an inline SVG Gantt chart with dependency arrows and weekend shading
 *
 * The only "runtime" the recipient needs is a browser. No JS executes in the file.
 */

import { aggregatedView, projectBounds } from './aggregation'
import { allDaysInRange, isWorkingDay, toDate } from './calendar'
import { flatten, isGroup } from './tree'
import type { ComputedBounds, DependencyType, ISODate, PlanningItem, Project } from './types'

const DAY_WIDTH = 24
const ROW_HEIGHT = 28
const HEADER_HEIGHT = 48
const LABEL_WIDTH = 220
const LEFT_PAD = 8
const TOP_PAD = 6
const BAR_HEIGHT = 16
const MS_PER_DAY = 24 * 60 * 60 * 1000

interface ExportOptions {
  /** Override the "generated at" timestamp. Lets tests produce deterministic output. */
  now?: Date
}

export function exportProjectAsHTML(project: Project, options: ExportOptions = {}): string {
  const now = options.now ?? new Date()
  const items = flatten(project.items)
  const view = aggregatedView(project)
  const bounds = projectBounds(project)

  const body = items.length === 0 || !bounds
    ? renderEmptyBody()
    : renderFullBody(project, items, view, bounds)

  const meta = renderHeader(project, items.length, bounds, now)
  const css = renderCSS()

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(project.name || 'Project')}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style>
</head>
<body>
<div class="container">
${meta}
${body}
<footer>Generated ${escapeHtml(formatDateTime(now))} · schema v${project.schemaVersion} · This is a read-only snapshot.</footer>
</div>
</body>
</html>
`
}

// --- header / summary ---------------------------------------------------------

function renderHeader(
  project: Project,
  itemCount: number,
  bounds: { start: ISODate; end: ISODate } | undefined,
  _now: Date,
): string {
  const rangeText = bounds ? `${bounds.start} → ${bounds.end}` : '—'
  return `
<header>
  <h1>${escapeHtml(project.name || 'Untitled project')}</h1>
  <dl class="summary">
    <div><dt>Items</dt><dd>${itemCount}</dd></div>
    <div><dt>Dependencies</dt><dd>${project.dependencies.length}</dd></div>
    <div><dt>Date range</dt><dd>${escapeHtml(rangeText)}</dd></div>
  </dl>
</header>`
}

function renderEmptyBody(): string {
  return `<section><p class="empty">No items in this project.</p></section>`
}

function renderFullBody(
  project: Project,
  items: PlanningItem[],
  view: Map<string, ComputedBounds>,
  bounds: { start: ISODate; end: ISODate },
): string {
  return `
<section>
  <h2>Items</h2>
  ${renderTree(project.items, view, 0)}
</section>
<section>
  <h2>Gantt</h2>
  <div class="gantt-scroll">
    ${renderGanttSVG(project, items, view, bounds)}
  </div>
</section>`
}

// --- tree --------------------------------------------------------------------

function renderTree(items: PlanningItem[], view: Map<string, ComputedBounds>, depth: number): string {
  if (items.length === 0) return ''
  const rows = items.map((item) => renderTreeItem(item, view, depth)).join('')
  return `<ul class="tree d${depth}">${rows}</ul>`
}

function renderTreeItem(item: PlanningItem, view: Map<string, ComputedBounds>, depth: number): string {
  const b = view.get(item.id)
  const icon = item.type === 'task' ? '📝' : item.type === 'group' ? '📁' : '◆'
  const dateText = b
    ? b.startDate === b.endDate
      ? b.startDate
      : `${b.startDate} → ${b.endDate}`
    : ''
  const estText = b && item.type !== 'milestone' ? ` · ${b.estimationMD}MD` : ''
  const kids = isGroup(item) ? renderTree(item.children, view, depth + 1) : ''
  return `
<li class="item item--${item.type}">
  <span class="item-icon">${icon}</span>
  <span class="item-name">${escapeHtml(item.name || '(unnamed)')}</span>
  <span class="item-meta">${escapeHtml(dateText)}${escapeHtml(estText)}</span>
  ${kids}
</li>`
}

// --- gantt SVG ---------------------------------------------------------------

function renderGanttSVG(
  project: Project,
  items: PlanningItem[],
  view: Map<string, ComputedBounds>,
  bounds: { start: ISODate; end: ISODate },
): string {
  const days = allDaysInRange(bounds.start, bounds.end)
  const width = LABEL_WIDTH + days.length * DAY_WIDTH + LEFT_PAD * 2
  const height = HEADER_HEIGHT + items.length * ROW_HEIGHT + TOP_PAD * 2
  const startMs = toDate(bounds.start).getTime()

  const weekendRects = renderWeekendShading(days, project, items.length)
  const header = renderGanttHeader(days)
  const rows = renderGanttRows(items, view, startMs)
  const arrows = renderDependencyArrows(project, items, view, startMs)

  return `
<svg class="gantt-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="#64748b" />
    </marker>
  </defs>
  <g class="weekend-layer">${weekendRects}</g>
  <g class="header-layer">${header}</g>
  <g class="rows-layer" transform="translate(0, ${HEADER_HEIGHT})">${rows}</g>
  <g class="arrows-layer" transform="translate(0, ${HEADER_HEIGHT})">${arrows}</g>
</svg>`
}

function renderWeekendShading(days: ISODate[], project: Project, rowCount: number): string {
  const totalHeight = HEADER_HEIGHT + rowCount * ROW_HEIGHT + TOP_PAD * 2
  const parts: string[] = []
  for (let i = 0; i < days.length; i++) {
    const iso = days[i]!
    if (isWorkingDay(iso, project.calendar)) continue
    const x = LABEL_WIDTH + i * DAY_WIDTH
    parts.push(`<rect x="${x}" y="0" width="${DAY_WIDTH}" height="${totalHeight}" class="weekend" />`)
  }
  return parts.join('')
}

function renderGanttHeader(days: ISODate[]): string {
  const parts: string[] = []
  let currentMonth = ''
  for (let i = 0; i < days.length; i++) {
    const iso = days[i]!
    const x = LABEL_WIDTH + i * DAY_WIDTH
    const month = iso.slice(0, 7)
    const dayNum = Number(iso.slice(8, 10))
    if (month !== currentMonth) {
      currentMonth = month
      parts.push(
        `<text x="${x + 2}" y="16" class="gantt-month">${escapeHtml(formatMonth(iso))}</text>`,
      )
      parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${HEADER_HEIGHT}" class="month-divider" />`)
    }
    parts.push(`<text x="${x + DAY_WIDTH / 2}" y="36" class="gantt-day">${dayNum}</text>`)
  }
  parts.push(
    `<line x1="0" y1="${HEADER_HEIGHT - 0.5}" x2="${LABEL_WIDTH + days.length * DAY_WIDTH}" y2="${HEADER_HEIGHT - 0.5}" class="axis" />`,
  )
  return parts.join('')
}

function renderGanttRows(
  items: PlanningItem[],
  view: Map<string, ComputedBounds>,
  startMs: number,
): string {
  const parts: string[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    const y = TOP_PAD + i * ROW_HEIGHT
    const b = view.get(item.id)
    parts.push(
      `<text x="${LEFT_PAD}" y="${y + ROW_HEIGHT / 2 + 4}" class="row-label">${escapeHtml(truncate(item.name || '(unnamed)', 30))}</text>`,
    )
    if (!b) continue
    if (item.type === 'milestone') {
      const cx = LABEL_WIDTH + dayOffset(b.startDate, startMs) * DAY_WIDTH + DAY_WIDTH / 2
      const cy = y + ROW_HEIGHT / 2
      const s = 6
      parts.push(
        `<rect class="bar-milestone" x="${cx - s}" y="${cy - s}" width="${s * 2}" height="${s * 2}" transform="rotate(45 ${cx} ${cy})"><title>${escapeHtml(item.name)} — ${b.startDate}</title></rect>`,
      )
    } else {
      const x = LABEL_WIDTH + dayOffset(b.startDate, startMs) * DAY_WIDTH
      const endOffset = dayOffset(b.endDate, startMs)
      const w = Math.max(DAY_WIDTH, (endOffset - dayOffset(b.startDate, startMs) + 1) * DAY_WIDTH)
      const barY = y + (ROW_HEIGHT - BAR_HEIGHT) / 2
      const cls = item.type === 'group' ? 'bar-group' : 'bar-task'
      const hover = item.type === 'group' ? `${b.startDate} → ${b.endDate}` : `${b.startDate} → ${b.endDate} · ${b.estimationMD}MD`
      parts.push(
        `<rect class="${cls}" x="${x}" y="${barY}" width="${w}" height="${BAR_HEIGHT}" rx="3"><title>${escapeHtml(item.name)} — ${escapeHtml(hover)}</title></rect>`,
      )
    }
  }
  return parts.join('')
}

function renderDependencyArrows(
  project: Project,
  items: PlanningItem[],
  view: Map<string, ComputedBounds>,
  startMs: number,
): string {
  const indexById = new Map<string, number>()
  items.forEach((item, i) => indexById.set(item.id, i))
  const parts: string[] = []

  for (const dep of project.dependencies) {
    const pi = indexById.get(dep.predecessorId)
    const si = indexById.get(dep.successorId)
    const pb = view.get(dep.predecessorId)
    const sb = view.get(dep.successorId)
    if (pi === undefined || si === undefined || !pb || !sb) continue

    const py = TOP_PAD + pi * ROW_HEIGHT + ROW_HEIGHT / 2
    const sy = TOP_PAD + si * ROW_HEIGHT + ROW_HEIGHT / 2
    const { px, sx } = anchorXs(dep.type, pb, sb, startMs)

    // L-shaped path
    const midX = sx < px ? sx - 10 : Math.max(px + 10, sx - 10)
    const d = `M ${px} ${py} L ${midX} ${py} L ${midX} ${sy} L ${sx} ${sy}`
    parts.push(`<path class="arrow" d="${d}" marker-end="url(#arrow)" />`)
  }
  return parts.join('')
}

function anchorXs(
  type: DependencyType,
  pb: ComputedBounds,
  sb: ComputedBounds,
  startMs: number,
): { px: number; sx: number } {
  const pStartX = LABEL_WIDTH + dayOffset(pb.startDate, startMs) * DAY_WIDTH
  const pEndX = LABEL_WIDTH + (dayOffset(pb.endDate, startMs) + 1) * DAY_WIDTH
  const sStartX = LABEL_WIDTH + dayOffset(sb.startDate, startMs) * DAY_WIDTH
  const sEndX = LABEL_WIDTH + (dayOffset(sb.endDate, startMs) + 1) * DAY_WIDTH
  switch (type) {
    case 'FS': return { px: pEndX, sx: sStartX }
    case 'SS': return { px: pStartX, sx: sStartX }
    case 'FF': return { px: pEndX, sx: sEndX }
    case 'SF': return { px: pStartX, sx: sEndX }
  }
}

// --- css ---------------------------------------------------------------------

function renderCSS(): string {
  return `
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1f2937; background: #f9fafb; }
.container { max-width: 100%; padding: 24px; }
header { border-bottom: 1px solid #e5e7eb; padding-bottom: 12px; margin-bottom: 20px; }
header h1 { margin: 0 0 8px; font-size: 22px; }
.summary { display: flex; gap: 24px; margin: 0; padding: 0; font-size: 13px; color: #4b5563; }
.summary > div { display: flex; gap: 6px; align-items: baseline; }
.summary dt { font-weight: 600; }
.summary dd { margin: 0; }
h2 { font-size: 15px; font-weight: 600; margin: 20px 0 10px; color: #111827; }
section { margin-bottom: 24px; }
.empty { color: #6b7280; font-style: italic; }

/* tree */
ul.tree { list-style: none; padding-left: 0; margin: 0; }
ul.tree ul.tree { padding-left: 20px; border-left: 1px dashed #d1d5db; margin-left: 8px; }
li.item { padding: 3px 0; font-size: 13px; display: grid; grid-template-columns: 20px 1fr auto; column-gap: 8px; align-items: baseline; }
li.item > ul { grid-column: 1 / -1; }
.item-icon { font-size: 13px; }
.item-name { font-weight: 500; }
.item--group > .item-name { font-weight: 600; }
.item-meta { color: #6b7280; font-size: 12px; font-variant-numeric: tabular-nums; }

/* gantt */
.gantt-scroll { overflow-x: auto; background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px; }
.gantt-svg { display: block; font-family: inherit; }
.gantt-svg .weekend { fill: #f3f4f6; }
.gantt-svg .axis { stroke: #d1d5db; stroke-width: 1; }
.gantt-svg .month-divider { stroke: #e5e7eb; stroke-width: 1; }
.gantt-svg .gantt-month { font-size: 11px; font-weight: 600; fill: #374151; }
.gantt-svg .gantt-day { font-size: 10px; fill: #6b7280; text-anchor: middle; }
.gantt-svg .row-label { font-size: 12px; fill: #1f2937; }
.gantt-svg .bar-task { fill: #3b82f6; }
.gantt-svg .bar-group { fill: #4b5563; }
.gantt-svg .bar-milestone { fill: #f59e0b; stroke: #b45309; stroke-width: 1; }
.gantt-svg .arrow { fill: none; stroke: #64748b; stroke-width: 1.2; opacity: 0.1; }

footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; }

/* print */
@media print {
  @page { size: A4 landscape; margin: 12mm; }
  body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .container { padding: 0; }
  .gantt-scroll { overflow: visible; border: none; padding: 0; page-break-inside: avoid; }
  section { page-break-inside: avoid; }
  footer { position: fixed; bottom: 8mm; left: 12mm; right: 12mm; }
}
`
}

// --- utils -------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function dayOffset(iso: ISODate, startMs: number): number {
  return Math.round((toDate(iso).getTime() - startMs) / MS_PER_DAY)
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatMonth(iso: ISODate): string {
  const m = Number(iso.slice(5, 7))
  const y = iso.slice(0, 4)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

function formatDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
