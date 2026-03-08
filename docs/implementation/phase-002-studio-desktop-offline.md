# Phase 002: Studio Desktop (Offline)

## Status
Planned

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
- working desktop app shell
- offline analysis workflow
- sequence editing workflow
- export workflow
- project persistence
- presets usable from UI
- render queue or render action using the shared engine

## Key questions to answer
- which UI model best exposes cut mining and sequencing
- which export presets are mandatory first
- how to keep offline preview responsive without corrupting render determinism
- what parts of MIDI authoring are useful before live work begins

## Exit criteria
- user can import footage and optional music
- user can run scene detection and inspect cut candidates
- user can build a sequence and apply presets or filter stacks
- user can export at least one HQ master and one social output format
- a saved project can be reopened and rendered consistently
- important UX or render lessons are recorded in PEP notes

## Learning capture focus
Prefer notes about:
- desktop process boundaries
- preview vs final render differences
- export profile mistakes
- UI patterns that are clearly working or failing
