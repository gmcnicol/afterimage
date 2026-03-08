# Phase 001: Core Engine

## Status
Planned

## Objective
Build the shared engine and contracts that all products depend on.

## Scope
- project/session model
- preset model
- sequence model
- analysis model
- MIDI mapping model
- JSON schemas and validators
- FFmpeg command compiler
- media analysis primitives
- preset loading and validation
- deterministic render-plan generation
- fixture projects and test media

## Explicit non-goals
- polished desktop UI
- live streaming UX
- Raspberry Pi appliance runtime
- projector or Twitch specific output flows

## Deliverables
- stable schemas in `schemas/`
- shared packages compiling and tested
- FFmpeg analysis command builder
- FFmpeg render command builder
- reference fixture project
- command snapshots for analysis and render paths
- licensing/provenance hooks for FFmpeg handling

## Key questions to answer
- how the canonical project file is structured
- what is shared between offline and live paths
- where runtime-specific config begins
- how filter, modulation, and preset definitions stay portable
- how deterministic replay is guaranteed

## Exit criteria
- a project file can be parsed, validated, and compiled into an FFmpeg analysis plan
- a project file can be compiled into an FFmpeg render plan
- preset definitions validate cleanly
- MIDI mappings validate cleanly
- the shared engine has test coverage over core serialization and command generation
- at least two PEP notes exist if any important lessons were discovered

## Learning capture focus
Prefer notes about:
- schema mistakes
- over-coupling between products
- FFmpeg command-generation surprises
- command portability problems across OS targets
