# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Browser-based project planning tool — lightweight MS Project alternative. Plans tasks, groups, milestones, dependencies, and resource allocations with a live Gantt chart. **No backend**: projects are saved/loaded as JSON files. The build also produces a single self-contained HTML file (`vite-plugin-singlefile`) that runs offline.

## Commands

```bash
npm run dev          # Vite dev server (http://localhost:5173)
npm run build        # tsc -b && vite build (outputs single-file HTML to dist/)
npm run preview      # preview production build
npm run test         # Vitest watch
npm run test:run     # single-pass run
npm run lint         # ESLint
npm run typecheck    # tsc -b --noEmit
```

Run a single test:
```bash
npx vitest run tests/domain/scheduling.test.ts
npx vitest run -t "aggregates group dates"
```

Before committing run: `npm run lint && npm run typecheck && npm run test:run`.

## Architecture

Three-layer separation, enforced by directory:

```
src/domain/   pure TypeScript, zero React/DOM/store imports
src/store/    Zustand store — actions are thin wrappers over domain functions
src/ui/       React components, organized by view
```

**Rule:** `src/domain/` is pure and fully unit-testable. Mutations live only in the Zustand store (`src/store/planningStore.ts`). UI dispatches store actions; it never reaches into domain modules to mutate anything.

Path alias `@/*` → `src/*`.

### Domain modules
- `types.ts` — `Project`, `PlanningItem` (discriminated union of `Task` | `Group` | `Milestone`), `Dependency`, `Resource`. `ISODate` is a branded string.
- `calendar.ts` — working-day math (configurable workdays + holidays).
- `scheduling.ts` — date calc from estimation in working days; dependency resolution.
- `aggregation.ts` — group date / estimation roll-up. **Always computed, never stored** on the group node.
- `allocation.ts` — per-day resource over-allocation detection.
- `tree.ts` — move/reparent/flatten tree operations.
- `serialization.ts` — JSON import/export, schema-version check, referential-integrity validation.
- `standaloneExport.ts` + `embeddedProject.ts` — read-only single-file HTML snapshot of a plan.

### UI structure
- `ui/planning/` — `PlanningView` (left tree + right Gantt, horizontally resizable), `ItemTree`, `ItemEditor`, `RescheduleDialog`.
- `ui/gantt/` — `GanttChart` wraps `frappe-gantt` behind a narrow prop surface. The library is an implementation detail; do not leak its types into the domain.
- `ui/resources/`, `ui/holidays/`, `ui/common/` (TopNav, Dialog, Button, inputs).

Tree and Gantt rows share heights, scroll, and collapse state — they're two views of the same row order.

### Demo fixture
The "Load demo" button calls `loadDemo` in `src/store/planningStore.ts`; the sample `Project` is built by `buildDemoProject()` at the bottom of the same file.

## Key business rules

### Dependency rescheduling — IMPORTANT UX rule
When a predecessor's date change would violate a dependency:
1. Compute the minimal reschedule for all transitively affected successors.
2. Show `RescheduleDialog` listing affected items + proposed new dates.
3. Apply only on confirm. On cancel, revert the predecessor's edit.
4. Detect cycles and reject with a clear error.

Do **not** silently auto-reschedule. Do **not** leave the plan in an inconsistent state.

### Group aggregation
- `start` = min(descendant.start), `end` = max(descendant.end / milestone.date), `estimationMD` = sum (milestones contribute 0). Recompute on every descendant mutation; never cache on the group node.

### Calendar & man-days
- Estimation is in **man-days = working days**. Working days = configured weekdays minus configured holidays.
- Task `endDate` = advance `startDate` by `estimationMD` working days, skipping non-working days.
- Weekends/holidays are visually shaded in the Gantt.

### Moves
Reordering or reparenting carries **all** attributes (dates, estimation, resources, comments, dependencies) with the item. Recompute aggregates for both the source and destination ancestor chains.

### Persistence
- File System Access API on Chromium for native open/save without re-prompting; Firefox/Safari fall back to `<input type="file">` + download. Feature check: `isFileSystemAccessSupported()` in `src/store/lastProjectHandle.ts`.
- Last-opened `FileSystemFileHandle` cached in IndexedDB so projects auto-restore. Permission usually resets per session — TopNav then shows a "Reopen" button so re-request happens inside a user gesture.
- On import, validate schema version + referential integrity (every `parentGroupId`, `predecessorId`, `successorId`, `resourceId` resolves). Reject with specific errors.
- JSON file is the source of truth. Schema changes bump `Project.schemaVersion` and ship a migration in `serialization.ts`.

## Conventions

- TypeScript strict mode, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Indexed access yields `T | undefined` — narrow before use. Optional properties cannot be set to explicit `undefined`; omit the key instead.
- Dates stored as ISO 8601 (`YYYY-MM-DD`) branded strings; convert to `Date` only at the edge.
- `PlanningItem` is a discriminated union (`type: 'task' | 'group' | 'milestone'`) — never a base class.
- IDs: `crypto.randomUUID()`.
- Import via `@/...` rather than long relative paths.
- No default exports except where a framework requires.
- No `any` without a `// why` comment.

## Testing

- `src/domain/` carries the heavy unit coverage (scheduling, aggregation, allocation, calendar, serialization round-trips, tree ops, standalone HTML export).
- Don't mock the domain layer in UI/store tests — use real domain functions against small in-memory fixtures.
- Add a regression test for every bug fix.

## Out of scope (v1)

Don't implement without explicit user request: auth/multi-user/collab, any backend or cloud sync, baselines/critical-path/EVM/cost tracking, MS Project `.mpp`/`.xml` import, PDF export, mobile-optimized UI, i18n.
