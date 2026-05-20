# WebGPU Preview Boundary

## Purpose

This document defines the Afterimage v1 WebGPU preview boundary.

WebGPU preview is a future realtime backend for low-latency performance,
authoring feedback, and interactive review. It is not the canonical renderer.
It consumes resolved composition and render graph meaning, reports what it can
execute, and discloses approximations when it cannot match deterministic export
semantics.

## Core Rule

WebGPU previews are downstream from Core.

Core resolves composition, scene, layer, modulation, entropy, capture, and
render graph semantics. WebGPU compilation may translate that resolved meaning
into GPU resources, pipelines, command buffers, and presentation surfaces. It
must not invent scene climate, layer contribution, modulation meaning, entropy
behaviour, capture replay policy, or export semantics.

## Current V1 Anchor

The current repository does not implement a WebGPU runtime. The v1 anchor is
architectural:

- `docs/architecture/RENDER_GRAPH.md`: FFmpeg is the current deterministic
  offline backend; a future realtime runtime must consume the same render graph
  semantics where possible.
- `docs/architecture/COMPOSITION_MODEL.md`: renderers observe world meaning and
  do not define it.
- `docs/architecture/SCENE_LAYER_HIERARCHY.md`: scene climate, layer
  contribution, layer ordering, masks, and blends are Core contracts.
- `docs/architecture/MODULATION_MODEL.md`: modulation sources, targets,
  mapping, conflict, and capture handling are defined before backend lowering.
- `docs/architecture/ENTROPY_INTERACTION.md`: entropy is semantic pressure and
  must remain replayable where it affects capture or export.
- `docs/architecture/DETERMINISTIC_CAPTURE.md`: captured state is distinct from
  live state, preview render, and final export.
- WebGPU itself requires explicit adapter and device negotiation, feature and
  limit checks, validation/error handling, command submission, presentation
  surfaces, and device-loss recovery.

This document defines how those pieces should meet later.

## Ownership

### Core

Core owns:

- resolved composition state
- scene and layer semantics
- modulation and entropy resolution
- capture replay state
- render graph nodes, passes, and backend requirements
- deterministic seeds and timebase
- preview/export semantic difference policy

### WebGPU Compiler

A future WebGPU compiler owns:

- translating eligible render graph passes into GPU preview plans
- adapter feature and limit requirements
- resource layout and pipeline planning
- shader or WGSL module selection where needed
- texture, buffer, sampler, bind group, and render target planning
- command encoder and submission plan shape
- capability diagnostics
- approximation labels

It does not own composition meaning.

### GPU Execution Layer

The GPU execution layer owns:

- device creation from a negotiated adapter
- canvas or offscreen surface configuration
- resource upload and lifecycle
- command buffer submission
- presentation timing
- validation and device-loss reporting
- disposal and recovery

It must not mutate canonical project or capture state.

### Studio

Studio owns:

- preview controls
- preview state presentation
- approximation warnings
- render cost visibility
- unsupported feature diagnostics
- capture trust indicators

Studio must make clear when the user is looking at live preview, captured
state, preview render, or final export.

## Boundary Pipeline

The intended pipeline is:

```text
Project and sidecars
-> Composition resolution
-> Capture and modulation replay resolution
-> Render graph planning
-> WebGPU capability check
-> WebGPU preview plan
-> GPU execution
-> Preview surface and diagnostics
```

The WebGPU compiler starts after render graph planning. If it needs new
semantic data, that need belongs upstream in Core contracts.

## Capability Negotiation

WebGPU preview must be capability-driven.

Capability negotiation should consider:

- WebGPU availability
- adapter identity where exposed for diagnostics
- required features
- optional features
- required limits
- texture formats
- presentation format
- maximum texture dimensions
- bind group and storage limits
- shader module support
- timestamp or profiling support where available
- device-loss status

Preview planning should produce a capability report before execution. Missing
required capabilities should reject the preview plan. Missing optional
capabilities may select a documented approximation.

## V1 Previewable Concepts

V1 preview may support only a subset of the render graph.

Likely previewable concepts:

- source texture presentation
- deterministic layer ordering
- opacity-equivalent mix
- simple masks
- simple blends with explicit contracts
- timeline playback and frame stepping
- resolved modulation values
- scene activation diagnostics
- simple field visualization
- atmosphere tint or overlay approximation
- preview-only render cost telemetry

Every previewed concept must retain Core meaning. Backend convenience must not
change authoring semantics.

## Explicit Degradation

Some concepts may need to degrade in preview:

- expensive behavioural passes
- high-density overlays
- field simulation detail
- material accumulation
- complex masks
- unsupported blend modes
- LUT or color transform precision
- final encode color constraints
- long capture replay sections

Degradation must be explicit. Studio and Capture Space should be able to show
whether the preview is semantically equivalent, approximated, partially
unsupported, or invalid for trust decisions.

## Rejection Policy

Preview planning should reject when an unsupported feature would mislead the
user.

Reject examples:

- unsupported scene activation semantics
- unsupported layer ordering dependency
- missing deterministic seed for replayed state
- unsupported capture event type
- missing archive-derived source texture
- unsupported required blend or mask
- device capability below required limits
- device lost without recovery

Preview may be lower fidelity. It must not silently lie about composition
meaning.

## Parity With FFmpeg Export

The parity goal is semantic parity, not default pixel-perfect equivalence.

WebGPU preview and FFmpeg export should agree on:

- composition identity
- selected sequence and variant
- scene activation
- layer order
- timing and frame stepping
- modulation and entropy resolution
- deterministic seeds
- capture replay events
- unsupported feature diagnostics
- render target intent where relevant

Pixel-perfect parity is required only when a render graph node declares an
explicit parity contract. Otherwise, preview may use documented approximations
for speed while final export remains deterministic through the offline backend.

## Timebase And Frame Stepping

WebGPU preview must accept an explicit timebase.

Preview modes may include:

- live time
- timeline playback time
- captured replay time
- stepped frame time
- scrubbed composition time

Frame stepping must be deterministic for the same resolved inputs. Live time
may be unstable, but capture replay and export review must use normalized
capture or composition time from Core.

## Seeds And Replay

Seeded systems must use Core-owned seeds.

WebGPU execution must not generate replay-critical random values from browser
state, device state, process state, wall-clock time, or GPU-local behaviour.
If a preview approximation uses non-replayable noise, that output must be
marked preview-only and excluded from deterministic export trust.

## Cache And Artifact Boundary

WebGPU preview surfaces are not final artifacts.

Preview may create:

- transient GPU textures
- generated preview textures
- temporary field buffers
- debug captures
- shader compilation caches
- preview thumbnails
- preview manifests

Only explicit manifests or exported files become artifacts. GPU resources and
browser/device caches must not become canonical project state.

Cache identity should include:

- render graph schema version
- node or pass identity
- source asset identity
- capture or modulation input identity
- seed identity
- backend capability version
- shader or pipeline version where relevant

## Observability

WebGPU preview should report:

- active adapter/device capability summary
- unsupported features
- approximation warnings
- render cost and frame timing
- dropped or skipped optional passes
- device loss
- validation errors
- preview/export semantic differences
- capture trust state

Diagnostics belong to the planning and runtime boundary, not only console logs.

## Error Handling

WebGPU errors must surface as diagnostics.

The runtime should distinguish:

- WebGPU unavailable
- no suitable adapter
- missing required features
- missing required limits
- validation failure
- out-of-memory failure
- device loss
- presentation surface failure
- shader or pipeline compilation failure
- unsupported render graph node

Recoverable device loss may request a new adapter/device and rebuild transient
resources. It must not mutate project, composition, or capture meaning.

## Non-Goals

This document does not introduce:

- runtime code
- shader code
- a WebGPU renderer implementation
- a UI design
- a replacement for FFmpeg final export
- arbitrary user-authored shader graphs
- distributed rendering

## V1 Minimum Shape

A future WebGPU preview feature should be able to answer:

- Which render graph nodes does it consume?
- Which capabilities does it require?
- Which capabilities are optional?
- Which features degrade and how are they labeled?
- Which timebase is authoritative?
- Which seeds are used?
- How does capture replay step frames?
- How are device errors reported?
- How does Studio show preview trust?
- How does final export remain deterministic?

If it cannot answer these questions, it is not ready for implementation.
