# Render Graph

## Purpose

The render graph defines how authored Afterimage compositions become executable
render plans.

It sits between authoring and execution:

- Studio expresses intent.
- Core resolves that intent into a graph.
- The graph compiler lowers the graph into backend-specific plans.
- Pico services execute those plans.

The render graph is not the renderer itself. It is the deterministic planning
layer that keeps behaviour, composition, caching, export, and future realtime
execution aligned.

## Source Documents

This document is constrained by:

- `FOUNDATIONS.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/implementation/core-engine.md`
- `docs/adr/0005-ffmpeg-toolchain-policy.md`
- `docs/peps/PEP-0007-shared-style-and-automation-contracts.md`
- `docs/peps/PEP-0008-render-duration-after-transitions.md`

## Core Rule

The render graph owns render meaning.

FFmpeg commands, realtime draw calls, and worker jobs are backend expressions of
that meaning. They must not become the source of truth.

## Position In The System

The render graph belongs to Afterimage Core.

It owns:

- render planning semantics
- pass boundaries
- layer ordering
- compositing intent
- transition intent
- blend mode intent
- behavioural render pass intent
- cache identity
- deterministic export planning
- backend capability requirements

It does not own:

- Studio UI state
- Electron process boundaries
- child process execution
- FFmpeg binary lookup
- OBS, MIDI, or OSC protocol details
- Darklife archive intelligence
- publishing workflows

Pico services may execute render graph plans. They must not redefine render
graph semantics.

## Current V1 Anchor

The current implementation already has a deterministic FFmpeg compiler path for
preview and export. It can:

- normalize project state before planning
- resolve a sequence and variant
- collect input assets
- compile clip filters
- segment automation at deterministic boundaries
- build mask transitions
- apply standalone overlays
- concatenate video segments
- include music or clip audio
- choose preview or export profiles
- constrain large renders
- finalize chunked exports

The render graph formalizes this planning layer so later work can evolve beyond
single `filter_complex` command generation without changing creative semantics.

## Graph Concepts

### Composition

A composition is the renderable view of a project, sequence, variant, selected
profile, and capture state.

It answers:

- what timeline is being rendered
- which media and archive references are used
- which scenes and behaviours are active
- which output profile is targeted
- which capture or export constraints apply

`docs/architecture/COMPOSITION_MODEL.md` defines the semantic composition
boundary. The render graph consumes a resolved composition and lowers it into
backend-specific render plans without redefining composition meaning.

### Render Graph

A render graph is a directed acyclic plan of render nodes.

Nodes describe operations. Edges describe media, timing, masks, modulation
signals, or intermediate surfaces.

The graph must be serializable, inspectable, and deterministic.

`docs/architecture/MODULATION_MODEL.md` defines modulation meaning. Render graph
nodes may consume resolved modulation, but they must not invent source, target,
mapping, conflict, or capture semantics.

### Node

A node is a single render-planning operation.

Examples:

- media source
- trim
- timebase normalization
- scale
- format conversion
- clip filter stack
- behavioural pass
- overlay pass
- mask pass
- transition pass
- concat
- audio trim
- audio mix
- final encode

Nodes carry intent and parameters. They do not execute.

### Pass

A pass is a planned execution unit.

A pass may compile to:

- one FFmpeg command
- a future realtime render pass
- an intermediate cached file
- a final encode command

Passes are where the graph becomes schedulable work.

### Artifact

An artifact is the output of a pass.

Artifacts may be:

- final exports
- preview files
- intermediate cached video files
- intermediate cached audio files
- thumbnails or waveform images
- manifests

Artifacts must have explicit identity, provenance, and invalidation rules.

### Backend

A backend executes a compiled plan.

Current backend:

- FFmpeg for deterministic offline preview/export

Future backend:

- realtime runtime for low-latency performance and preview

Both backends must consume the same render graph semantics where possible.

`docs/architecture/FFMPEG_COMPILER_BOUNDARY.md` defines the offline compiler
boundary. `docs/architecture/WEBGPU_PREVIEW.md` defines the future realtime
preview boundary.

## Planning Pipeline

The planning pipeline is:

1. Normalize project state.
2. Resolve sequence, variant, scene state, and export profile.
3. Resolve media, archive references, and generated sidecars.
4. Resolve capture state, seeds, modulation, and event timing.
5. Expand clips, layers, behaviours, and transitions into graph nodes.
6. Split the graph into deterministic passes.
7. Assign cache keys and expected artifacts.
8. Compile each pass for the selected backend.
9. Return a serializable render plan.
10. Execute the plan through Pico services or runtime workers.

The output of planning must be stable for the same inputs.

## Deterministic Inputs

A render graph plan must include or reference:

- project ID and version
- normalized project state
- sequence ID
- variant ID
- export or preview profile
- media asset IDs and paths
- analysis sidecar references
- archive contract references
- selected scene state
- modulation lanes
- capture event log where applicable
- deterministic seeds
- output path or artifact target
- toolchain identity where relevant

Ambient runtime state must not affect final export.

## Node Categories

### Source Nodes

Source nodes introduce external material into the graph.

Examples:

- video source
- image source
- audio source
- mask source
- overlay source
- archive-derived source
- generated texture source

Source nodes must preserve stable asset identity and provenance.

### Timing Nodes

Timing nodes shape source time into graph time.

Examples:

- trim
- loop
- hold
- setpts or timebase normalization
- fps normalization
- capture event replay
- music-aligned duration adjustment

Timing nodes must be deterministic. Transition overlap must be accounted for
before validating render duration.

### Transform Nodes

Transform nodes prepare media for composition.

Examples:

- scale
- crop
- pad
- aspect conversion
- pixel format conversion
- colorspace conversion

Transform nodes should be explicit so preview and export cannot silently drift.

### Style Nodes

Style nodes apply authored visual treatment.

Examples from current v1:

- contrast
- brightness
- blur
- bloom-soft
- glitch-bands
- chroma-bleed

Supported style nodes come from shared Core contracts. Unsupported filters are
integrity failures, not best-effort backend behavior.

`docs/architecture/AESTHETIC_INTERPRETATION.md` defines how style, material,
atmosphere, LUT, and final look interpretation relate without reducing visual
identity to filter stacks.

### Behavioural Nodes

Behavioural nodes express world-driven rendering.

Examples:

- entropy pressure
- cohesion recovery
- drift fields
- corrosion fields
- memory residue
- collapse and recovery passes
- scene climate modulation

Behavioural nodes are semantic. The graph compiler lowers them into supported
backend operations.

### Compositing Nodes

Compositing nodes combine visual streams.

Examples:

- layer composite
- blend
- masked merge
- luma texture overlay
- opacity mix
- transition merge

Compositing order must be explicit.

### Audio Nodes

Audio nodes prepare and attach sound.

Examples:

- clip audio trim
- music trim
- audio concat
- audio mix
- final audio encode

Audio timing must follow the same target duration semantics as video.

### Output Nodes

Output nodes define artifact generation.

Examples:

- preview encode
- export encode
- archive master encode
- intermediate cache encode
- manifest write

Output nodes must know whether they are final artifacts or disposable cache.

## Intermediate Pass Strategy

The graph should not always compile to one giant command.

A single command is acceptable when:

- the graph is small
- the backend can execute it reliably
- caching would add complexity without benefit
- preview and export parity is preserved

Intermediate passes should be introduced when:

- graph complexity crosses a configured threshold
- transition or overlay density is high
- long-form output makes one command fragile
- multiple profiles can reuse the same work
- preview can reuse stable clip or section passes
- a future realtime runtime needs equivalent stage boundaries

Intermediate passes may include:

- normalized source pass
- clip body pass
- behavioural layer pass
- transition pass
- scene section pass
- audio bed pass
- final assembly pass
- final encode pass

Pass boundaries are semantic and practical. They should reduce fragility without
changing the rendered result.

## FFmpeg Compilation Boundary

FFmpeg is the deterministic offline execution backend.

The render graph compiler may lower graph passes into:

- FFmpeg input arguments
- filter graphs
- concat lists
- encoder arguments
- expected output artifacts

Product code must not build ad hoc FFmpeg commands.

The FFmpeg compiler must not own:

- project semantics beyond the contracts it consumes
- UI workflows
- hidden cache policy
- nondeterministic export decisions
- Darklife intelligence

The compiler may choose:

- direct single-pass render
- chunked render plus finalize
- intermediate cache reuse
- resource-constrained encoder settings
- backend-specific lowering for supported graph nodes

Every such choice must be deterministic from graph inputs and compiler policy.

`docs/architecture/FFMPEG_COMPILER_BOUNDARY.md` defines compiler ownership,
capability checking, rejection policy, command identity, toolchain identity,
duration accounting, pass evolution, cache provenance, and diagnostics in
detail.

## Cache Strategy

Cache exists to improve responsiveness and reliability. It must not change
meaning.

Cache keys should be derived from:

- normalized project content relevant to the pass
- asset IDs and stable media references
- source trim ranges
- graph node parameters
- modulation and capture inputs
- export or preview profile fields that affect pixels or audio
- compiler version or graph schema version
- backend capability version where necessary

Cache keys must not depend on:

- wall-clock time
- random values without recorded seeds
- UI selection state unrelated to the pass
- worker process identity
- Darklife service availability

Cache artifacts should be:

- explicitly typed
- tied to a pass ID
- safe to delete and rebuild
- scoped to a project or workspace cache directory
- listed in manifests when needed for replay or diagnostics

Final exports are not cache artifacts.

## Deterministic Export Model

Deterministic export requires the same graph inputs to produce the same render
plan and equivalent output.

The export plan must fix:

- project state
- sequence and variant
- profile
- target duration
- transition overlap
- layer order
- blend modes
- behavioural inputs
- seeds
- capture event ordering
- source media references
- cache reuse policy
- backend plan
- toolchain identity where relevant

Preview may differ in resolution, bitrate, and speed-oriented settings. Preview
must not silently become the final artifact.

If a preview graph uses cheaper approximations, the plan must label them as
preview-specific. The default goal is semantic parity between preview and final
export.

## Future Realtime Compatibility

The render graph must remain compatible with a future realtime runtime.

That means the graph should express:

- source streams
- layer order
- timing
- modulation inputs
- behavioural passes
- compositing operations
- output targets

It should avoid expressing render meaning only as FFmpeg filter strings.

Backend-specific lowering is allowed. Backend-specific meaning is not.

Realtime execution may:

- skip expensive offline passes
- lower quality under pressure
- use GPU surfaces instead of files
- maintain rolling state
- prioritize latency over perfect fidelity

Realtime capture/export must still record enough state to replay deterministically
through the offline export backend.

`docs/architecture/WEBGPU_PREVIEW.md` defines WebGPU preview ownership,
capability negotiation, approximation policy, timebase handling, seed handling,
cache boundaries, observability, and device failure semantics in detail.

## Layer Compositing Rules

Layer compositing is ordered and explicit.

Each visual layer should define:

- source or generated input
- local timing
- transform
- style stack
- behavioural modifiers
- opacity or mix
- blend mode
- mask input where present
- output surface

Layer order must be stable after normalization.

Compositing must not depend on object insertion order from unnormalized project
data.

`docs/architecture/SCENE_LAYER_HIERARCHY.md` defines layer identity, scope,
ordering, contribution, and influence before the render graph lowers them into
backend-specific compositing operations.

## Scene Transition Planning

Scene transitions are graph structures, not UI decorations.

A transition plan must define:

- outgoing scene or clip region
- incoming scene or clip region
- overlap duration
- mask source where applicable
- overlay source where applicable
- blend or merge operation
- timing curve where supported
- audio behavior
- contribution to rendered duration

Overlap transitions shorten effective rendered duration unless the sequence is
extended or padded deliberately. Duration checks must use rendered duration, not
raw authored clip duration.

Terminal clips must not carry transitions that require a missing incoming clip.

`docs/architecture/SCENE_LAYER_HIERARCHY.md` defines scene activation, overlap,
and transition meaning. Render graph planning consumes that resolved meaning.

## Blend Mode Planning

Blend modes must be named in Core contracts and lowered by backend compilers.

V1 may remain intentionally narrow.

Initial blend concepts:

- normal
- add-luma
- screen-like
- multiply-like
- masked merge
- opacity mix

If a backend cannot support a blend mode, planning should fail clearly or choose
a documented deterministic fallback. Silent visual drift is not acceptable for
export.

## Behavioural Render Passes

Behavioural render passes translate world state into visual execution.

They may be driven by:

- scene climate
- modulation lanes
- music sync events
- MIDI or OSC gestures
- Universe Entropy Device pressure
- archive-derived behavioural seeds
- capture replay logs

Examples:

- texture corrosion pass
- memory residue pass
- drift field pass
- collapse pressure pass
- atmosphere tint pass
- surveillance scan pass
- analog instability pass

Behavioural passes must expose deterministic parameters at planning time for
offline export. Realtime execution may evolve continuously, but capture must log
the inputs needed for replay.

## Graph Complexity Policy

Render graph planning must account for backend limits.

Complexity signals include:

- rendered segment count
- transition count
- overlay count
- behavioural pass count
- total duration
- output pixel count
- audio and video stream count
- expected filter graph size
- cache hit availability

When complexity is high, the planner may:

- split into intermediate passes
- cap optional visual density during authoring operations
- reuse cached sections
- constrain worker resource usage
- compile chunked exports
- require an explicit diagnostic failure

It must not silently drop authored meaning in final export.

## Plan Shape

A render plan should be serializable and inspectable.

It should contain:

- plan ID
- graph schema version
- project ID
- sequence ID
- variant ID
- target profile
- target duration
- source manifest
- node list
- edge list
- pass list
- artifact list
- cache policy
- backend requirements
- deterministic seed summary
- diagnostics and warnings

Backend command specs belong inside pass compilation results, not as the only
representation of the graph.

## Execution Boundary

Execution belongs to Pico services or runtime workers.

Workers receive:

- a serializable pass or plan
- explicit input artifact paths
- explicit output artifact paths
- cancellation signal through the runtime boundary
- progress reporting contract

Workers return:

- completed artifact metadata
- logs
- warnings
- serializable errors

Workers must not mutate canonical project meaning.

## Diagnostics

Render graph diagnostics should explain:

- missing media
- invalid archive references
- unsupported filter or blend nodes
- unsupported backend capabilities
- unstable or missing seeds
- transition duration problems
- graph complexity risks
- cache invalidation causes
- FFmpeg lowering failures
- preview/export semantic differences

Diagnostics are part of the planning contract, not only worker logs.

## Non-Goals

This document does not introduce:

- new dependencies
- code implementation
- a node-graph authoring UI
- arbitrary user-authored shader graphs
- network render orchestration
- distributed service architecture
- replacement of FFmpeg as the offline backend

The immediate goal is to define how render meaning is planned before execution.
