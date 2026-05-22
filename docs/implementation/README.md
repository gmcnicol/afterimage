# Implementation Notes

This directory contains active implementation policy and current shared
implementation notes.

The old phase delivery plan has been archived under `docs/archive/`. Those
files are historical context, not the current source of implementation
guidance.

## Active Documents

- `core-engine.md`: current shared core implementation notes.
- `task-completion-and-learning-capture.md`: completion and learning capture
  policy.
- `templates/pep-note-template.md`: PEP note template.

## Required Habits

Implementation work should capture lessons as work proceeds.

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

## Shared implementation policy

Read `task-completion-and-learning-capture.md` before treating implementation work as done.

PEPs are operational memory about how not to repeat mistakes.
