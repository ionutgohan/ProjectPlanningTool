declare module 'frappe-gantt' {
  export interface GanttTaskInput {
    id: string
    name: string
    start: string
    end: string
    progress?: number
    dependencies?: string
    custom_class?: string
  }

  export interface GanttOptions {
    header_height?: number
    column_width?: number
    step?: number
    view_modes?: string[]
    bar_height?: number
    bar_corner_radius?: number
    arrow_curve?: number
    padding?: number
    view_mode?: string
    date_format?: string
    language?: string
    popup_trigger?: string
    on_click?: (task: GanttTaskInput) => void
    on_date_change?: (task: GanttTaskInput, start: Date, end: Date) => void
    on_progress_change?: (task: GanttTaskInput, progress: number) => void
    on_view_change?: (mode: string) => void
    custom_popup_html?: (task: GanttTaskInput) => string
  }

  export default class Gantt {
    constructor(wrapper: string | HTMLElement | SVGElement, tasks: GanttTaskInput[], options?: GanttOptions)
    refresh(tasks: GanttTaskInput[]): void
    change_view_mode(mode: string): void
    options: GanttOptions & { column_width: number; step: number }
  }
}
