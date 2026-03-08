# ADR-0005: FFmpeg Toolchain Policy

## Status

Accepted

## Context

All products depend on FFmpeg-family tools for analysis, rendering, and possibly preview.

Without a shared policy, each app could drift into ad hoc binary acquisition, direct shell-outs, inconsistent logging, and licensing mistakes.

## Decision

The FFmpeg-family toolchain is a Phase 1 core-engine concern.

Required tools:

- `ffmpeg`
- `ffprobe`

Optional tool:

- `ffplay`

All FFmpeg-family execution must go through a shared core toolchain abstraction.

Direct per-app shell-outs are forbidden.

The default binary policy is LGPL-compatible FFmpeg unless a later explicit decision says otherwise.

Versions, provenance, and licensing notes must be recorded.

## Consequences

We get:

- one command execution model
- one acquisition strategy
- one place for portability fixes
- cleaner app boundaries
- lower licensing risk

We accept:

- a little more upfront Phase 1 work
- a stricter boundary around product code
