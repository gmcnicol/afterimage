# ADR 0001: Monorepo

## Status
Accepted

## Decision
Use a single monorepo for Studio Desktop, Live Desktop, and Live Appliance.

## Why
The products share:

- project/session contracts
- filter and preset schema
- FFmpeg command compilation
- MIDI mapping schema
- media analysis metadata

Splitting these too early would create contract drift and duplicate logic.

## Consequences
- shared packages live under `packages/`
- canonical schemas live under `schemas/`
- product runtimes live under `apps/`
