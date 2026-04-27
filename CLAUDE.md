# CLAUDE.md

Guidance for Claude Code working on this repository. Keep this file up to date as the project evolves.

---

## 1. Project Overview

A **web-based project planning tool** (think: lightweight MS Project) for small-to-medium engineering projects (up to ~50 engineers). Runs entirely in the browser. Plans are saved and loaded as JSON files — no backend, no database, no accounts.

The user plans work by creating **tasks**, **groups**, and **milestones**, wiring them together with **dependencies**, and assigning **resources**. A live Gantt chart reflects every change.

### Core use cases
- Plan a project of ~50–500 items with nested structure.
- Assign multiple engineers across tasks with % allocation.
- Detect resource over-allocation.
- Export / import the whole plan as a JSON file for sharing / version control.

---

## 2. Tech Stack

**Recommended — use unless there's a strong reason to deviate:**

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript (strict mode)** | Domain has tight invariants; types catch bugs early. |
| Framework | **React 18** | Mature ecosystem, best Gantt library coverage. |
| Build tool | **Vite** | Fast HMR, minimal config. |
| State | **Zustand** | Simpler than Redux; fine for single-user app. |
| Styling | **TailwindCSS** | Consistent design tokens, no CSS file sprawl. |
| Gantt | **frappe-gantt** (start here) | MIT-licensed, lightweight. Wrap it so we can swap later. |
| Dates | **date-fns** | Tree-shakeable, immutable, no timezone headaches. |
| Testing | **Vitest** + **React Testing Library** | Unit + component. |
| Linting | **ESLint** + **Prettier** | Standard. |
| Drag & drop | **@dnd-kit/core** + **@dnd-kit/sortable** | Tree reorder + reparent in the Planning view. |

**Non-goals for stack:** no Next.js, no SSR, no backend, no auth, no state-management framework heavier than Zustand.

---

## 3. Commands

```bash
npm install          # install deps
npm run dev          # start Vite dev server (http://localhost:5173)
npm run build        # production build
npm run preview      # preview production build
npm run test         # run Vitest in watch mode
npm run test:run     # single-pass test run (CI)
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```

Run a single test:
```bash
npx vitest run tests/domain/scheduling.test.ts      # one file
npx vitest run -t "aggregates group dates"          # by test name
```

Before committing: run `npm run lint && npm run typecheck && npm run test:run`.

---

## 4. Project Structure

```
src/
  domain/             # Pure business logic, zero React/DOM imports
    types.ts          # PlanningItem, Dependency, Resource, Project
    calendar.ts       # Working-days math, holidays
    scheduling.ts     # Date calc from estimation, dependency resolution
    aggregation.ts    # Group date/estimation roll-up
    allocation.ts     # Resource over-allocation detection
    tree.ts           # Tree operations (move, reparent, flatten)
    serialization.ts  # JSON import/export + schema validation
    htmlExport.ts     # Standalone HTML export of the plan
  store/
    planningStore.ts  # Zustand store, selectors, actions
    lastProjectHandle.ts # IndexedDB-backed File System Access handle persistence
  types/              # Ambient .d.ts (e.g. File System Access API)
  ui/
    planning/         # Planning view (tree + Gantt)
    resources/        # Resources view
    holidays/         # Calendar / holidays editor
    gantt/            # Gantt wrapper component
    common/           # Buttons, dialogs, inputs
  App.tsx
  main.tsx
tests/
  domain/             # Heavy unit coverage here
  store/              # Store-level tests
```

Path alias: `@/*` → `src/*` (configured in `tsconfig.json`).

**Rule:** `src/domain/` must not import from React, the store, or any UI code. It is pure TypeScript and fully unit-testable.

**Demo fixture:** the "Load demo" button invokes `loadDemo` in `src/store/planningStore.ts`; the sample `Project` is built by `buildDemoProject()` at the bottom of the same file.

---

## 5. Domain Model

### 5.1 Planning items

All items share `id`, `name`, `parentGroupId` (null for top-level), `dependencies[]`, `comments`.

**Task**
```ts
{ type: 'task', startDate, estimationMD, endDate /*computed*/, allocations: ResourceAllocation[] }
```

**Group** — can be nested to any depth.
```ts
{ type: 'group', startDate /*computed*/, endDate /*computed*/, estimationMD /*computed*/, children: PlanningItem[] }
```

**Milestone** — zero-duration, single point in time. May live inside a group or at the top level.
```ts
{ type: 'milestone', date, allocations: ResourceAllocation[] }
```

### 5.2 Dependencies

```ts
type DependencyType = 'FS' | 'SS' | 'FF' | 'SF'
interface Dependency { id: string; predecessorId: string; successorId: string; type: DependencyType }
```

- **FS** (finish-to-start): successor.start ≥ predecessor.end
- **SS** (start-to-start): successor.start ≥ predecessor.start
- **FF** (finish-to-finish): successor.end ≥ predecessor.end
- **SF** (start-to-finish): successor.end ≥ predecessor.start

Dependencies can target any item type (task, group, milestone).

### 5.3 Resources

```ts
interface Resource { id: string; name: string; role: string; capacityPct: number /* 0–100+ */ }
interface ResourceAllocation { resourceId: string; allocationPct: number /* 0–100 */ }
```

A single resource can be allocated to many tasks; an over-allocation exists when, on any working day, the sum of their allocations across active tasks exceeds `capacityPct`.

### 5.4 Project (root, serialized to JSON)

```ts
interface Project {
  schemaVersion: number   // bump on breaking changes
  name: string
  calendar: { workdays: Weekday[]; holidays: ISODate[] } // configurable
  items: PlanningItem[]   // tree
  dependencies: Dependency[]
  resources: Resource[]
}
```

---

## 6. Business Rules (read carefully — these are the tricky parts)

### 6.1 Calendar & man-days
- Estimation is in **man-days**, interpreted as **working days**.
- Working days are the user-configured weekdays minus user-configured holidays.
- `endDate` for a task = advance `startDate` by `estimationMD` working days, skipping non-working days.
- Weekends/holidays are visually shaded in the Gantt.

### 6.2 Group aggregation (computed, never stored)
- `group.startDate` = min(child.startDate) across all descendants
- `group.endDate` = max(child.endDate / milestone.date) across all descendants
- `group.estimationMD` = sum(descendant.estimationMD) — milestones contribute 0
- Recompute on every mutation of a descendant.

### 6.3 Moving items
- Items can be reordered up/down and reparented across groups.
- **All attributes** (dates, estimation, resources, comments, dependencies) travel with the item.
- After a move, recompute aggregates for **both** the source and destination group ancestor chains.

### 6.4 Dependency rescheduling — IMPORTANT UX RULE
When a predecessor's date changes and would violate a dependency:
1. Compute the minimal reschedule for all transitively affected successors.
2. **Show a confirmation dialog** listing the affected items and proposed new dates.
3. Apply only on user confirmation. On cancel, revert the predecessor's edit.
4. Detect dependency cycles and reject the edit with a clear error.

Do **not** silently auto-reschedule. Do **not** leave the plan in an inconsistent state.

### 6.5 Resource over-allocation
- Computed daily across the project horizon.
- Flagged (but not blocked) in the Resources view, with per-day drill-down.
- Per-task allocation % is validated to be 0 < x ≤ 100.

### 6.6 Persistence
- No autosave to a server — there isn't one.
- User actions: **Import JSON**, **Export JSON**, **Save** (write back to the opened file), **Export HTML** (read-only single-file snapshot).
- Uses the **File System Access API** (Chromium) when available for native open/save without re-prompting. Firefox/Safari fall back to `<input type="file">` + download. `isFileSystemAccessSupported()` in `src/store/lastProjectHandle.ts` is the feature check.
- The last-opened `FileSystemFileHandle` is cached in IndexedDB so the project auto-restores on next launch. Permission typically resets each session — when it does, TopNav shows a "Reopen" button so the re-request happens inside a user gesture.
- On import, validate against the schema (version check, referential integrity: every `parentGroupId`, `predecessorId`, `successorId`, `resourceId` must resolve). Reject with specific error messages.
- Consider autosaving to `localStorage` as a recovery convenience **only** — JSON file is the source of truth.

---

## 7. UI / UX

### 7.1 Layout
- Top nav: **Planning** | **Resources** | project name | Import | Export
- Landing page = Planning view.

### 7.2 Planning view
- Left: collapsible tree of items (task / group / milestone icons).
- Right: Gantt chart, live-updating.
- Each item row shows name + key dates collapsed. **Single-click selects** the item (highlight only). **Double-click** toggles the inline editor with all attributes (start date, estimation, resource allocations, comments, dependencies). Same pattern on Gantt bars.
- Drag-handles for reordering; reparenting via drag into a group row.
- Dependency editing via a dedicated panel in the expanded row (not drag-drop on the Gantt in v1 — keep it simple).

### 7.3 Resources view
- Table of resources (name, role, capacity %).
- Row expands to show: tasks assigned, allocation %, date range, and a small per-day heatmap highlighting over-allocated days in red.

### 7.4 Gantt
- Wrap `frappe-gantt` in a `<GanttChart />` component with a narrow prop surface (`items`, `dependencies`, `onItemClick`). All business logic stays in the domain layer.
- The library is an implementation detail; do not leak its types into the domain.

---

## 8. Coding Conventions

- TypeScript strict mode on, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` also enabled. Array/record access yields `T | undefined` — narrow before use. Optional properties cannot be set to an explicit `undefined`; omit the key instead.
- Import from `@/...` rather than long relative paths.
- No `any` without a `// why` comment.
- Prefer pure functions in `src/domain/`. Mutations live only in the Zustand store.
- Use **discriminated unions** for `PlanningItem` (`type: 'task' | 'group' | 'milestone'`); never a base class.
- Dates: store as **ISO 8601 date strings** (`YYYY-MM-DD`) in the model; convert to `Date` at the edge.
- IDs: `crypto.randomUUID()`.
- No default exports except where a framework requires it.
- Component files: PascalCase. Hook files: `useSomething.ts`. Pure modules: camelCase.

---

## 9. Testing

- `src/domain/` must have **high unit coverage** — scheduling, aggregation, dependency resolution, calendar math, serialization round-trips.
- Component tests cover: expanding/editing an item, drag-to-reparent, dependency warning dialog, import/export round-trip.
- Add a regression test for every bug fix.
- Do not mock the domain layer in UI tests — use real domain functions against small in-memory fixtures.

---

## 10. Out of Scope (v1)

Do **not** implement any of the following without explicit user request:

- Authentication, multi-user, real-time collaboration.
- Any backend, database, or cloud sync.
- Baselines, critical path highlighting, earned-value metrics, cost tracking.
- Import from MS Project `.mpp` / `.xml` (JSON only).
- PDF export and printing. (A read-only **HTML export** exists via `src/domain/htmlExport.ts` and is in scope.)
- Mobile-optimized UI (desktop-first).
- i18n / l10n — English only for v1.

---

## 11. When in doubt

- **Pure domain logic first, UI second.** If a feature requires new domain logic, land that (with tests) in a separate commit from the UI wiring.
- **Aggregates are always computed, never stored.** Don't cache `group.startDate` on the group node.
- **JSON schema is a contract.** Any change to `Project` shape bumps `schemaVersion` and ships with a migration.
- Ask the user before introducing a new runtime dependency.
