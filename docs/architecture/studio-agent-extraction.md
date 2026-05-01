# Studio Agent Extraction

Afterimage Studio still runs analysis, render, and library work in the Electron main process. The next extraction step is to move those agents to workers or services without changing renderer IPC routes.

## Contract Boundary

Agent inputs and outputs are exported from `@afterimage/studio-contracts` in `src/agents.ts`.

- Analysis uses `AnalysisAgentInput` and returns `AnalysisAgentOutput`.
- Preview rendering uses `PreviewRenderAgentInput` and returns `PreviewRenderAgentOutput`.
- Export rendering queues one `ExportRenderAgentInput` per profile and returns `ExportRenderAgentOutput`.
- Library scans use `LibraryScanAgentInput` and return `LibraryScanAgentOutput`.
- Library media analysis uses `LibraryAnalysisAgentInput` and returns `LibraryAnalysisAgentOutput`.

These contracts must stay structured-clone and JSON compatible: plain objects, arrays, strings, numbers, booleans, and nullable or omitted fields only. Do not add callbacks, class instances, `AbortSignal`, database handles, Electron objects, streams, buffers, or open file descriptors to contract types.

## Transport Assumptions

The in-process queue owns cancellation and progress reporting today. A worker or service transport should preserve the same shape:

- The main process sends one serializable agent input.
- The agent emits progress messages as `{ message: string, progress: number }`.
- The main process owns `DesktopJob` state, logs, cancellation state, and `jobs.updated` events.
- The agent returns one serializable agent output or throws a serializable error message.

Filesystem paths are passed as strings. Agents may read and write those paths, but they should not require inherited process-local state beyond configured ffmpeg tools and the paths in the input.

## Staged In-Process Adapter

Current jobs remain in-process. The Studio job modules now assign route payloads to agent input contracts before executing the existing functions, so a later transport adapter can replace only the `run(signal, report)` body while keeping route handlers, retry payloads, job state, and renderer behavior unchanged.
