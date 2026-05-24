# Product Notes

Afterimage is a behavioural audiovisual instrument with three product surfaces
around a shared core.

## Runtime Concepts

- **Studio** is for offline authoring, analysis, sequencing, music sync, filter
  design, and deterministic export.
- **Live Desktop** is for low-latency performance, clip banks, reactive inputs,
  MIDI control, projector output, recording, and streaming.
- **Live Appliance** is for headless boot-to-broadcast playback, supervision,
  remote control, output readiness, and health signalling.
- **Afterimage Core** owns runtime-neutral meaning: project data, presets,
  modulation, render planning, media metadata, MIDI mappings, and shared
  contracts.

## Product Documents

- `archive-space.md`: Studio Archive Space sidecar review and acceptance
  workflow.
- `performance-space.md`: Studio Performance Space rehearsal, steering,
  preview, and capture replay workflow.
- `scene-detection.md`: offline-first scene analysis model.
- `midi.md`: shared MIDI abstraction for authoring and performance.
- `presets.md`: preset families and data ownership.
- `outputs.md`: rendered, live, streaming, and recording output classes.

## Related Architecture

- `../architecture/overview.md`
- `../architecture/studio-mode.md`
- `../architecture/live-desktop-mode.md`
- `../architecture/live-appliance-mode.md`
- `../architecture/ARCHITECTURE.md`
