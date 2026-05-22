> Historical note: this document is archived for context and is not active
> implementation guidance. Start with `../architecture/README.md`,
> `../product/README.md`, and `../implementation/README.md` for current docs.

# Phase 002: Studio Desktop (Offline)

## Status
Completed

## Objective
Build the desktop authoring product for offline media analysis, sequencing, filter design, and high-quality export.

## Scope
- Electron shell
- project open/save
- media import
- scene analysis UI
- cut candidate review
- sequence builder
- music track support
- filter stack editing
- preset browsing
- export profiles for long-form and short-form output

## Explicit non-goals
- live streaming reliability work
- projector-safe runtime behaviour
- headless boot behaviour
- Pi deployment

## Deliverables
- working Electron desktop shell with typed preload IPC and panel-based authoring workspace
- offline analysis workflow with background jobs, analysis sidecars, and cut generation
- sequence editing workflow with variants, markers, sections, style stacks, and automation lanes
- export workflow with preview cache and deterministic multi-profile export planning
- project persistence with Phase 1 to Phase 2 migration support
- presets usable from the shared library and authorable filter stacks in UI
- render queue and diagnostics views using the shared engine boundary

## Key questions to answer
- use a stable one-window panel workspace with keyboard-first navigation
- ship Landscape Master, Portrait Short-Form, Square Social, and Archive Master profiles
- keep preview responsive through cached low-resolution FFmpeg preview renders
- treat MIDI authoring as deterministic offline intent capture and keep recorded MIDI behind a feature flag

## Exit criteria
- user can import footage and optional music
- user can run scene detection and inspect cut candidates
- user can build a sequence and apply presets or filter stacks
- user can export at least one HQ master and one social output format
- a saved project can be reopened and rendered consistently
- important UX or render lessons are recorded in PEP notes

## Implementation Notes
- Shared project data now uses the Phase 2 hybrid authoring shape with migration support from the Phase 1 project format.
- Studio Desktop owns project orchestration, file dialogs, job management, diagnostics, and typed preload IPC, while FFmpeg planning and analysis parsing remain in shared packages.
- The renderer uses separate Zustand stores for project session, UI state, jobs, and diagnostics, and virtualizes the media and cut browsers.
- Preview fidelity is intentionally lower than export fidelity and is labeled explicitly in the UI.

## Deferred Follow-On
- Remote media ingest from user-supplied URLs is intentionally deferred beyond Phase 002.
- If added later, it should be implemented as a bounded import adapter that downloads into the normal project ingest area and then reuses the existing analysis pipeline.
- Any such feature must require explicit rights confirmation, avoid in-app search or browsing, and rely on a pinned external downloader tool rather than ad hoc scraping logic.

## Learning capture focus
Prefer notes about:
- desktop process boundaries
- preview vs final render differences
- export profile mistakes
- UI patterns that are clearly working or failing
