# Implementation Plan

This directory contains the delivery plan for Afterimage.

The product family is to be implemented in this order:

1. Core Engine
2. Studio Desktop (offline authoring and high-quality export)
3. Live Desktop (streaming / projector / performance)
4. Live Appliance (headless Raspberry Pi 5 target)

This order is mandatory unless an ADR explicitly changes it.

## Why this order

- The shared engine is the foundation for every runtime.
- Studio mode is the safest place to prove the project model, FFmpeg compiler, preset model, and render workflow.
- Live Desktop can then reuse proven assets, presets, sequencing, and modulation primitives.
- The headless appliance should only be built after the live runtime, control model, and failure modes are known.

## Required habits during implementation

Every phase must capture lessons as work proceeds.

Use the shared policy in `task-completion-and-learning-capture.md` as the source of truth for:

- when a task is complete
- when to create or update a PEP note
- what kinds of lessons must be recorded
- the required fallback when there were no new learnings

Use the template in `docs/implementation/templates/pep-note-template.md`.

## Naming

Use this format:

`PEP-0NNN-short-kebab-title.md`

Examples:

- `PEP-0001-ffmpeg-binary-provenance.md`
- `PEP-0002-electron-worker-boundaries.md`
- `PEP-0003-live-preview-drop-frame-recovery.md`

## Fast creation

Use:

```bash
python3 scripts/new_pep_note.py "ffmpeg binary provenance"
```

## Phase files

- `phase-000-overview.md`
- `phase-001-core-engine.md`
- `phase-002-studio-desktop-offline.md`
- `phase-003-live-desktop-streaming.md`
- `phase-004-live-appliance-headless.md`

## Shared implementation policy

Read `task-completion-and-learning-capture.md` before treating implementation work as done.

Phase documents are build instructions.
PEPs are operational memory about how not to repeat mistakes.
