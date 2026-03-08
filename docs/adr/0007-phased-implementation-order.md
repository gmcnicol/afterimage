# ADR 0007: Phased Implementation Order

## Status
Accepted

## Context
Afterimage consists of a shared engine plus multiple runtimes with different operational requirements.

## Decision
Implementation order is fixed as:
1. Core Engine
2. Studio Desktop
3. Live Desktop
4. Live Appliance

## Consequences
- lower-level shared contracts are proven first
- desktop authoring is validated before live performance
- headless appliance work is delayed until the live runtime model is understood
