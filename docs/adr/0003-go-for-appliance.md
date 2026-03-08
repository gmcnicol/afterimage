# ADR 0003: Go for the live appliance

## Status
Accepted

## Decision
Use Go for the Raspberry Pi live appliance runtime.

## Why
The appliance target is operational software, not a desktop shell.
It must be small, reliable, and capable of supervising FFmpeg and device IO.

## Consequences
- the appliance is not a UI port of the desktop products
- configuration and runtime health belong inside the Go service
