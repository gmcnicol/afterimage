# Pico Services And Runtime Boundaries

## Purpose

This document defines the boundary between Afterimage Core, Pico services,
adapters, and Darklife.

The goal is to prevent the system from becoming a big ball of mud while also
avoiding unnecessary distributed architecture.

## Boundary Rule

If it defines meaning, it belongs in Core.

If it performs work, it may be a Pico service.

If it adapts external systems, it may be an adapter.

If it performs archive intelligence or publishing, it likely belongs in
Darklife.

## Core Runtime Owns

Core owns world state, behavioural systems, modulation, scenes, project model,
render graph planning, capture semantics, archive contracts, and deterministic
replay semantics.

Core emits plans, state transitions, intents, and contracts. It does not own
long-running tool execution.

## Pico Service Candidates

Pico services are small local workers.

Candidates include FFmpeg worker, media probe worker, thumbnail worker,
waveform worker, MIDI bridge, OSC bridge, OBS bridge, render worker, and archive
import worker.

Pico services may be in-process at first. Extraction should happen only when it
improves failure isolation, responsiveness, or platform integration.

## Pico Service Rules

A Pico service must accept serializable inputs, emit serializable outputs,
report progress, support cancellation where useful, preserve job identity, fail
clearly, be restartable where practical, and avoid owning creative semantics.

A Pico service must not reinterpret scene meaning, mutate project state without
a core command, invent archive metadata semantics, hide deterministic render
choices, or couple UI state to execution state.

## Adapter Responsibilities

Adapters translate between Afterimage contracts and external systems.

Examples include MIDI message to controller intent, OSC packet to controller
intent, OBS event to output state, FFmpeg result to job artifact, and
filesystem event to import candidate.

Adapters should stay narrow. They are allowed to know external protocol
details. They are not allowed to own world behaviour.

## Darklife Ownership

Darklife owns archive intelligence and publishing adaptation.

It owns cut detection, scene segmentation, computer vision tagging, motif
extraction, atmosphere classification, recurrence detection, publishing
pipeline, reels generation, and livestream harvesting.

Afterimage consumes Darklife outputs through archive contracts.

## Queue Model

Restart-safe queues are preferred for long-running local work.

Queued work should include job ID, command type, input payload, project or
artifact reference, created time, status, progress, cancellation state, and
output or failure details.

Jobs should be replayable where possible and diagnosable when not.

## In-Process First

The project should favor in-process runtime semantics until extraction is
justified.

Reasons to extract include blocking work that harms UI responsiveness, platform
APIs that require a separate process, crash isolation, independent restart, and
hardware integration that needs a stable bridge.

Reasons not to extract include conceptual neatness alone, duplicated core
state, distributed orchestration, and hidden deterministic state.

## Constraints

- Avoid enterprise microservice architecture.
- Avoid distributed orchestration complexity.
- Favor restartable local workers.
- Favor restart-safe queues.
- Keep runtime semantics in-process where possible.
- Keep the core model portable.

