/**
 * Shared layout constants between the Gantt and the item tree so rows in both
 * panes line up pixel-for-pixel.
 *
 * GANTT_ROW_HEIGHT = bar_height + padding (matches the Gantt options below).
 * GANTT_HEADER_HEIGHT mirrors frappe-gantt's `header_height` option.
 */
export const GANTT_BAR_HEIGHT = 18
export const GANTT_BAR_PADDING = 14
export const GANTT_ROW_HEIGHT = GANTT_BAR_HEIGHT + GANTT_BAR_PADDING // 32
export const GANTT_HEADER_HEIGHT = 50
