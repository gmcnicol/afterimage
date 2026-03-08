# Phase 003: Live Desktop (Streaming / Projector)

## Status
Planned

## Objective
Build the desktop performance product for low-latency visual playback, control, and streaming/recording.

## Scope
- live clip banks
- preset switching
- MIDI performance mapping
- reactive modulation inputs
- local fullscreen output
- streaming outputs
- simultaneous recording where practical
- failure-safe state handling
- performance-focused session loading

## Explicit non-goals
- headless unattended appliance behaviour
- boot-time auto-start on Pi
- offline-first sequence authoring features beyond what is needed to reuse assets

## Deliverables
- working live mode desktop shell
- MIDI device mapping and persistence
- live preset switching
- output routing for projector and/or stream
- recording path
- performance-safe session model

## Key questions to answer
- what latency is acceptable for preview and output
- how output routing behaves when devices disappear
- how presets switch safely under load
- which controls are required on first launch for actual gig use
- which runtime faults must degrade gracefully instead of failing hard

## Exit criteria
- operator can load a session and perform without the app freezing under expected load
- projector/fullscreen output works
- at least one streaming path works
- at least one recording path works
- MIDI mappings survive restart and reload
- live faults and recoveries are documented in PEP notes

## Learning capture focus
Prefer notes about:
- dropped-frame recovery
- input device instability
- FFmpeg live graph surprises
- controls that are too slow, confusing, or fragile
