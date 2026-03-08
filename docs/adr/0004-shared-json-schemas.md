# ADR 0004: Shared JSON schemas

## Status
Accepted

## Decision
Use JSON Schema as the canonical contract format for shared project data.

## Scope
- project files
- presets
- sequences
- analysis sidecars
- MIDI mappings

## Consequences
- schemas live under `schemas/`
- TS validators wrap schema validation for desktop apps
- appliance-side consumers must treat schemas as source-of-truth contracts
