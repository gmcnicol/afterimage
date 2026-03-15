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
- bounded remote media ingest for user-supplied URLs as a desktop convenience feature, only if it does not compromise live runtime stability

## Explicit non-goals
- headless unattended appliance behaviour
- boot-time auto-start on Pi
- offline-first sequence authoring features beyond what is needed to reuse assets
- in-app remote media search, browsing, or recommendation workflows

## Deliverables
- working live mode desktop shell
- MIDI device mapping and persistence
- live preset switching
- output routing for projector and/or stream
- recording path
- performance-safe session model
- if remote ingest is included in this phase, a pinned external-tool adapter with explicit rights confirmation and normal local import handoff

## Key questions to answer
- what latency is acceptable for preview and output
- how output routing behaves when devices disappear
- how presets switch safely under load
- which controls are required on first launch for actual gig use
- which runtime faults must degrade gracefully instead of failing hard
- whether remote ingest can stay operationally isolated enough from playback and streaming to ship in the live desktop product

## Exit criteria
- operator can load a session and perform without the app freezing under expected load
- projector/fullscreen output works
- at least one streaming path works
- at least one recording path works
- MIDI mappings survive restart and reload
- live faults and recoveries are documented in PEP notes
- if remote ingest ships in this phase, it only accepts explicit user URLs, downloads into the normal ingest path, and does not weaken live-session reliability expectations

## Learning capture focus
Prefer notes about:
- dropped-frame recovery
- input device instability
- FFmpeg live graph surprises
- controls that are too slow, confusing, or fragile
- external tool drift and rights-confirmation UX if remote ingest is attempted
