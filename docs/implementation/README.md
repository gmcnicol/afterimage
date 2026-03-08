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

Create short PEP-style notes in `docs/peps/` for:

- important learnings
- repeated pitfalls
- bugs caused by wrong assumptions
- successes worth preserving
- implementation patterns to continue
- patterns to avoid

These notes must be:

- short
- specific
- written in plain English
- committed alongside or immediately after the related change

Use the template in `docs/implementation/templates/pep-note-template.md`.

## Required cadence for learning notes

Create a note when any of the following happens:

- a bug costs more than 30 minutes to diagnose
- a design assumption turns out wrong
- an FFmpeg command or graph behaves unexpectedly
- a cross-platform issue appears
- a latency or stability issue is discovered
- a workflow or coding pattern works especially well
- a lesson would prevent future rework

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

## Codex Learning Capture Requirement

Codex owns the engineering-memory process for this repository.

At the end of every meaningful task, Codex must do exactly one of the following:

1. create a new short PEP
2. update an existing short PEP
3. record that there were no new learnings

This is mandatory for all implementation phases.

A "meaningful task" includes any work that discovers or confirms:

- a pitfall to avoid
- a success pattern worth repeating
- a portability issue
- a packaging or runtime constraint
- a design rule that should become permanent
- a false start that should not be retried
- a performance characteristic that affects future design

PEPs are operational memory. They must stay short, concrete, and biased toward rules.

Preferred principle:

- one learning per PEP
- one rule per PEP
- no essays
- no vague retrospectives

Phase documents must be treated as build instructions.
PEPs must be treated as "how not to be stupid next time".

