# ADR 0002: Electron for desktop products

## Status
Accepted

## Decision
Use Electron for Studio Desktop and Live Desktop.

## Why
The desktop products need:

- a rich cross-platform UI shell
- strong packaging support
- predictable browser/runtime behaviour
- clean worker/sidecar process boundaries for FFmpeg

## Consequences
- desktop shells are allowed to diverge in workflow
- Electron is a runtime choice, not the domain-model owner
