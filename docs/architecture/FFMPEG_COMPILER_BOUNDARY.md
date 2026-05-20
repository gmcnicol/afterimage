# FFmpeg Compiler Boundary

## Purpose

This document defines the Afterimage v1 FFmpeg compiler boundary.

FFmpeg is the deterministic offline execution backend for analysis, preview,
and export. The compiler lowers resolved render graph plans into executable
FFmpeg command plans. It does not own composition, scene, layer, modulation,
entropy, capture, archive, or UI semantics.

## Core Rule

FFmpeg syntax is not architecture.

The render graph owns render meaning. FFmpeg commands are backend expressions
of that meaning. Future compiler refactors may split commands into passes,
change cache strategy, or improve resource constraints, but they must not
change composition semantics.

## Current V1 Anchor

The current implementation in `packages/ffmpeg-compiler` already provides:

- tool resolution for `ffmpeg`, `ffprobe`, and optional `ffplay`
- LGPL-only provenance notes
- deterministic command specs
- media analysis plans
- thumbnail and waveform plans
- audio change analysis plans
- preview and export plans
- project normalization before planning
- sequence and variant resolution
- supported filter lowering
- automation segmentation
- mask transition lowering
- transition overlay handling
- concat and finalization plans
- profile-specific encode arguments
- constrained command settings for larger renders

This document describes the boundary those implementation anchors should
continue to respect.

## Source Documents

This boundary is constrained by:

- `docs/architecture/RENDER_GRAPH.md`
- `docs/architecture/COMPOSITION_MODEL.md`
- `docs/architecture/SCENE_LAYER_HIERARCHY.md`
- `docs/architecture/MODULATION_MODEL.md`
- `docs/architecture/ENTROPY_INTERACTION.md`
- `docs/architecture/DETERMINISTIC_CAPTURE.md`
- `docs/adr/0005-ffmpeg-toolchain-policy.md`
- `docs/peps/PEP-0007-shared-style-and-automation-contracts.md`
- `docs/peps/PEP-0008-render-duration-after-transitions.md`

## Ownership

### Render Graph Owns

The render graph owns:

- node identity
- pass boundaries
- source, timing, transform, style, behavioural, compositing, audio, and output
  intent
- layer ordering
- blend and mask meaning
- transition meaning
- modulation and capture inputs after Core resolution
- backend capability requirements
- deterministic cache and artifact identity

### FFmpeg Compiler Owns

The compiler owns:

- conversion from supported graph passes to FFmpeg command specs
- FFmpeg input argument planning
- filter graph construction
- concat list planning
- encoder argument planning
- expected output declarations
- command labels
- supported backend capability checks
- backend-specific deterministic fallback selection where documented
- command-level diagnostics

### Pico Services Own

Pico services own:

- process execution
- cancellation
- progress reporting
- retryable failure handling
- writing files to approved locations
- returning logs, warnings, artifacts, and serializable errors

The compiler describes work. Services execute work.

## Outside The Compiler

The compiler must not own:

- composition meaning
- scene identity or climate
- layer identity or contribution
- modulation source, target, mapping, or conflict policy
- entropy semantics
- capture replay semantics
- archive intelligence
- Studio UI workflows
- output folder UX
- hidden cache mutation
- tool acquisition policy beyond consuming resolved toolchain identity
- nondeterministic export choices

If the compiler lacks information to lower a feature, the missing contract
belongs upstream.

## Command Planning Boundary

Command planning may lower:

- source normalization
- trim and timing
- frame rate normalization
- scale, aspect, pixel format, and colorspace operations
- supported clip filters
- segmented automation values
- overlays
- masks
- transitions
- audio trim and mix
- concat operations
- final encode profiles
- manifests and expected artifacts

Command planning must preserve the graph's semantic identity. It may not
silently reorder layers, reinterpret blend meaning, drop transition duration,
ignore capture events, or invent fallback style.

## Capability Checking

The compiler should report whether a graph pass is supported before execution.

Capability checks should cover:

- source media availability
- required codecs and containers
- pixel formats
- supported filters
- supported blend and mask concepts
- transition requirements
- audio handling
- capture replay requirements
- behavioural pass requirements
- field and material pass requirements
- tool availability
- toolchain version or provenance where relevant
- graph complexity limits

Unsupported final export semantics should fail clearly. Preview-only
approximations must be labeled and must not become final export behaviour.

## Rejection Policy

Reject instead of silently approximating when:

- source media is missing
- a render-critical sidecar is missing
- a filter or style node is unsupported
- a blend or mask cannot be represented
- transition duration cannot be accounted for
- capture replay event types are unsupported
- deterministic seeds are missing
- graph complexity exceeds backend policy
- toolchain identity is missing where required
- requested codec, container, or pixel format is unsupported

The failure should identify the Core concept that could not be lowered, not
only the FFmpeg syntax that failed.

## Deterministic Command Identity

Command identity should be derived from fixed inputs:

- graph schema version
- pass ID
- project ID and version
- sequence and variant IDs
- source asset IDs and stable paths
- source time ranges
- filter and style parameters
- modulation and capture inputs
- deterministic seeds
- profile fields affecting pixels or audio
- compiler version
- toolchain identity where relevant

Command identity must not depend on wall-clock time, worker process identity,
temporary labels, unnormalized object order, or service availability.

## Toolchain Identity

The FFmpeg-family toolchain is a Core/compiler concern plus a Pico execution
concern.

Toolchain metadata should include:

- resolved binary path or acquisition identity
- version line
- license and provenance notes
- required tool availability
- optional tool availability
- platform where relevant

ADR 0005 requires FFmpeg-family execution to go through a shared abstraction
and records an LGPL-compatible default policy unless a later explicit decision
changes it.

## Duration And Transition Accounting

The compiler must respect rendered duration.

Transition overlap can shorten effective duration unless the composition
explicitly pads or extends the traversal. Duration checks must use rendered
duration rather than raw clip duration.

Terminal clips must not emit transitions that require a missing incoming clip.
Mask transitions must have the required mask source. Audio duration must follow
the same target duration semantics as video.

## Pass Evolution

The compiler may evolve from monolithic `filter_complex` generation toward
pass-based planning.

Valid pass boundaries include:

- source normalization pass
- clip body pass
- mask pass
- transition pass
- behavioural pass
- scene section pass
- audio bed pass
- final assembly pass
- final encode pass

Pass boundaries should reduce fragility, improve cache reuse, or align with
future realtime stages. They must not change the rendered meaning.

## Cache And Artifact Provenance

Compiler-produced artifacts should have explicit provenance.

Provenance should include:

- pass ID
- input asset IDs
- graph node IDs
- command identity
- profile identity
- capture log identity where relevant
- seed summary
- compiler version
- toolchain identity
- output artifact path
- disposable cache versus final artifact status

Cache may improve reliability and responsiveness. It must not become hidden
project state.

## Diagnostics

Compiler diagnostics should explain:

- unsupported graph node
- unsupported filter
- unsupported blend or mask
- missing source or sidecar
- duration mismatch
- transition overlap problem
- missing seed
- capture replay incompatibility
- graph complexity risk
- cache invalidation reason
- toolchain failure
- FFmpeg stderr summary
- preview/export semantic difference

Diagnostics must be serializable so Studio and Capture Space can present them.

## Non-Goals

This document does not introduce:

- runtime refactors
- new FFmpeg commands
- schema changes
- orchestration changes
- distributed rendering
- a replacement for the render graph
- new licensing policy

## V1 Minimum Shape

An FFmpeg compiler change should be able to answer:

- Which render graph pass is being lowered?
- Which Core semantics are required?
- Which FFmpeg capabilities are required?
- Which inputs affect command identity?
- Which artifacts are expected?
- Which failures reject planning?
- Which approximations are preview-only?
- Which toolchain identity is recorded?
- How is rendered duration preserved?
- How does the change avoid making FFmpeg syntax the source of truth?

If it cannot answer these questions, it is not ready for implementation.
