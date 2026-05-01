# Afterimage Studio Architecture Roadmap

## Milestone 1: Studio Contracts and IPC Foundation

### STUDIO-001
- priority: P0
- status: done
- depends_on: []
- owner_area: studio contracts
- title: Extract Studio DTOs and route maps into `@afterimage/studio-contracts`
- acceptance:
  - Studio DTOs are grouped by project, library, jobs, diagnostics, shell, and transport.
  - `StudioCommandMap`, `StudioQueryMap`, and `StudioEventMap` define the typed boundary.
  - Domain types continue to come from `@afterimage/project-model`.

### STUDIO-002
- priority: P0
- status: done
- depends_on: [STUDIO-001]
- owner_area: studio IPC
- title: Replace ad hoc Electron IPC handlers with a bounded route registry
- acceptance:
  - Main process exposes a single `studio:invoke` IPC handler.
  - Unknown command and query routes are rejected.
  - Existing Studio services remain the implementation behind the registry.

### STUDIO-003
- priority: P0
- status: done
- depends_on: [STUDIO-001, STUDIO-002]
- owner_area: preload security
- title: Expose a narrow preload bridge
- acceptance:
  - `window.afterimage` exposes only `invoke` and `subscribe`.
  - Raw `ipcRenderer` is not exposed to the renderer.
  - Pushed events use `studio:event` with whitelisted event types.

### STUDIO-004
- priority: P0
- status: done
- depends_on: [STUDIO-003]
- owner_area: renderer API
- title: Remove renderer fallback API and adopt a typed Studio client
- acceptance:
  - Browser-only fallback/mock behavior is removed.
  - Renderer call sites use `getStudioClient()` or the typed client wrapper.
  - Project, library, jobs, diagnostics, and shell methods map to typed routes.

## Milestone 2: Service Decomposition

### STUDIO-010
- priority: P1
- status: done
- depends_on: [STUDIO-002]
- owner_area: jobs
- title: Split `job-manager.ts`
- acceptance:
  - Queue orchestration, analysis jobs, preview jobs, export jobs, and library jobs are separate modules.
  - Retry payload handling has focused tests.
  - Public behavior of `jobs.*` routes is unchanged.
- notes:
  - Split job code into `electron/services/jobs/*`; `job-manager.ts` now wires queue, job modules, and retry handling.
  - Preserved existing progress parser exports from `job-manager.ts` for current tests and callers.
  - Added focused retry payload tests in `apps/studio-desktop/tests/job-retry.test.ts`.
  - Successful commands: `pnpm --dir apps/studio-desktop test -- job-manager-progress.test.ts job-retry.test.ts`; `pnpm --dir apps/studio-desktop typecheck`.
  - Remaining risks: behavior is covered by existing tests and typecheck, but export/analysis workflows still rely on external ffmpeg execution for full runtime validation.

### STUDIO-011
- priority: P1
- status: backlog
- depends_on: [STUDIO-002]
- owner_area: library
- title: Split `library-service.ts`
- acceptance:
  - Database access, scanning, import, removal, and analysis planning are separate modules.
  - Library route handlers remain a thin coordination layer.
  - Existing library-service tests are preserved or expanded around the new modules.

## Milestone 3: Renderer Feature Boundaries

### STUDIO-020
- priority: P1
- status: backlog
- depends_on: [STUDIO-004]
- owner_area: renderer
- title: Move renderer views into `features/*`
- acceptance:
  - Current view logic is grouped by feature ownership.
  - Shared UI remains in app-level components.
  - Route/client access stays behind feature-facing hooks.

### STUDIO-021
- priority: P2
- status: backlog
- depends_on: [STUDIO-020]
- owner_area: domain operations
- title: Extract domain operations package
- acceptance:
  - Reusable project editing operations live outside the Studio app.
  - Package tests cover sequence, cut, style, and automation operations.
  - Studio imports domain operations through the package boundary.

## Milestone 4: Workflow and Agent Extraction

### STUDIO-030
- priority: P1
- status: backlog
- depends_on: [STUDIO-010]
- owner_area: workflows
- title: Convert long-running workflows to command -> jobId -> events
- acceptance:
  - Long-running commands return job identifiers promptly.
  - Progress and completion flow through `jobs.updated` events.
  - Renderer no longer depends on long request lifetimes for workflow progress.

### STUDIO-031
- priority: P2
- status: backlog
- depends_on: [STUDIO-010, STUDIO-011, STUDIO-030]
- owner_area: service extraction
- title: Prepare analysis, render, and library agents for worker or service extraction
- acceptance:
  - Agent inputs and outputs are serializable contract types.
  - Worker/service transport assumptions are documented.
  - Current in-process execution remains supported while extraction is staged.
