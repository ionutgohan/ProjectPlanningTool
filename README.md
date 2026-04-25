# Planning Tool

A browser-based project planning tool — lightweight MS Project alternative. Plan tasks, groups, milestones, dependencies, and resource allocations, with a live Gantt chart. No backend: projects are saved and loaded as JSON files.

See [CLAUDE.md](./CLAUDE.md) for the full feature spec and architecture.

## Stack

- React 18 + TypeScript (strict)
- Vite
- Zustand
- TailwindCSS
- frappe-gantt
- date-fns
- Vitest + Testing Library
- @dnd-kit for tree drag-and-drop

## Commands

```bash
npm install          # install deps
npm run dev          # start Vite dev server (localhost:5173)
npm run build        # production build
npm run preview      # preview production build
npm run test         # Vitest in watch mode
npm run test:run     # single-pass test run
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```

Before committing: `npm run lint && npm run typecheck && npm run test:run`.

## Using the app

1. Open the dev server and click **Load demo** to explore.
2. Planning view: left tree + right Gantt.
   - `+ Task / + Group / + Milestone` buttons create top-level items.
   - Click a row to expand its inline editor. Drag the `⋮⋮` handle to reorder/reparent.
   - Editing a predecessor's date that would violate a dependency pops a confirm dialog.
3. Resources view: manage people, see per-day load heatmap, red cells mark over-allocation.
4. **Export** downloads the plan as JSON. **Import** loads one.

## Architecture

- `src/domain/` — pure TS, zero React imports. Scheduling, aggregation, allocation, serialization.
- `src/store/` — Zustand; actions are thin wrappers over domain functions.
- `src/ui/` — React components, organized by view.
- `tests/domain/` — high-coverage unit tests on the domain layer.

The JSON schema lives on `Project.schemaVersion`. Bumping it requires adding a migration in `src/domain/serialization.ts`.
