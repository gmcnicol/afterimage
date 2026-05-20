# Afterimage Architecture

## Purpose

This document defines the subsystem boundaries for Afterimage.

It exists to keep the project aligned with `FOUNDATIONS.md`: Afterimage is a
behavioural audiovisual composition and performance instrument, not a
traditional video editor, generic media manager, or distributed service
platform.

The central rule is:

> If it defines meaning, it belongs in Afterimage Core.
> If it performs work, it may be a Pico service.
> If it adapts external systems, it may be an adapter.
> If it performs archive intelligence or publishing, it belongs in Darklife.

The renderer is downstream from behaviour. The canvas expresses intent. The
runtime performs it. The captured render is the artifact.

## Source Documents

This architecture is constrained by:

- `FOUNDATIONS.md`
- `README.md`
- `docs/architecture/overview.md`
- `docs/architecture/studio-mode.md`
- `docs/architecture/live-desktop-mode.md`
- `docs/architecture/live-appliance-mode.md`
- `docs/implementation/core-engine.md`
- `docs/adr/0004-shared-json-schemas.md`
- `docs/adr/0005-ffmpeg-toolchain-policy.md`
- `docs/architecture/studio-agent-extraction.md`

## System Shape

Afterimage is a shared-core, multi-runtime system.

The product surfaces are:

- Afterimage Studio, currently represented by Studio Desktop
- Live Desktop
- Live Appliance

The stable center is Afterimage Core.

Pico services are small local workers around the core. They execute expensive,
blocking, platform-specific, or failure-prone work without owning creative
meaning.

Darklife is a neighboring archive intelligence and publishing system. It can
feed Afterimage with archive metadata, motifs, atmospheres, and behavioural
seeds. It must not become the Afterimage runtime.

## Boundary Rule

The first design question for any capability is: does this define meaning, do
work, adapt a system, or enrich the archive?

### Meaning Belongs In Core

Meaning includes:

- world state
- scene semantics
- behavioural systems
- modulation semantics
- entropy semantics
- archive reference semantics
- capture and replay semantics
- render graph intent
- deterministic export intent

Meaning must be portable across Studio, live runtimes, capture, export, and
future execution backends.

### Work Belongs In Pico Services

Work includes:

- media probing
- FFmpeg execution
- thumbnails
- waveform extraction
- preview rendering
- final render execution
- external bridge IO
- long-running local jobs

Pico services are allowed to fail, restart, retry, and report progress. They
are not allowed to decide what a world, scene, motif, capture, or export means.

### External System Adaptation Belongs In Adapters

Adapters translate between Afterimage contracts and external systems.

Examples:

- MIDI
- OSC
- OBS
- FFmpeg command execution
- filesystem import/export
- appliance health endpoints

Adapters must be narrow. They should not accumulate business logic or creative
rules.

### Archive Intelligence Belongs In Darklife

Archive intelligence includes:

- cut detection
- scene segmentation
- computer vision tagging
- motif extraction
- atmosphere classification
- recurrence detection
- archive enrichment
- publishing adaptation
- reels and campaign generation
- livestream harvesting

Afterimage may consume Darklife outputs through archive contracts. Afterimage
must not absorb Darklife's intelligence pipeline.

## Ownership Matrix

| Capability | Owner | Notes |
| --- | --- | --- |
| Project model | Core | Canonical authoring and runtime contract. |
| Scene model | Core | Scenes are behavioural climates, not clip bins. |
| World state engine | Core | Owns state, memory, pressure, instability, and recovery. |
| Behavioural systems | Core | Define how worlds evolve. |
| Modulation engine | Core | First-class source of world, scene, field, material, and transition change. |
| Universe Entropy Device | Core | Semantic pressure source for guided emergence. |
| Render graph planning | Core | Defines render intent; does not execute tools directly. |
| Capture semantics | Core | Defines what is recorded and how replay/export remains reproducible. |
| Archive contracts | Core | Defines how archive metadata is referenced and trusted. |
| Studio workspace | Studio | Authoring surface and workflow orchestration. |
| Canvas authoring | Studio | Canvas expresses relationships and intent only. |
| Desktop shell and IPC | Studio | Runtime-specific process boundary. |
| Job queue UI | Studio | Presents work; does not redefine work semantics. |
| FFmpeg worker | Pico service | Executes plans from Core or Studio orchestration. |
| Media probe worker | Pico service | Produces structured metadata for contracts. |
| Thumbnail worker | Pico service | Produces derived visual assets. |
| Waveform worker | Pico service | Produces derived audio summaries. |
| Render worker | Pico service | Executes preview/export work from render plans. |
| MIDI bridge | Pico service or adapter | Translates controller events into core intents. |
| OSC bridge | Pico service or adapter | Translates external messages into core intents. |
| OBS bridge | Pico service or adapter | Translates output and stream control events. |
| Cut detection intelligence | Darklife | Afterimage may run simple analysis jobs, but archival intelligence belongs to Darklife. |
| Motif extraction | Darklife | Feeds archive contracts and behavioural seeds. |
| Atmosphere classification | Darklife | Feeds archive contracts and world affinity. |
| Publishing pipeline | Darklife | Outside Afterimage runtime. |
| Reels generation | Darklife | Publishing adaptation, not core composition. |

## Afterimage Studio Boundary

Afterimage Studio is the authoring product.

It owns:

- project open/save flows
- media import workflows
- authoring workspace layout
- scene and sequence authoring views
- filter and preset editing views
- music sync authoring views
- export profile selection UI
- diagnostics surfaces
- local job orchestration
- user-visible recovery paths

It must depend on Core for:

- project model
- schema validation
- scene semantics
- sequence semantics
- preset and filter definitions
- MIDI mapping semantics
- render graph planning
- export profile semantics
- deterministic replay and export rules

It may call Pico services for:

- analysis execution
- thumbnail generation
- waveform generation
- preview rendering
- final export execution
- media probing

It must not own:

- behavioural runtime meaning
- archive intelligence
- external publishing logic
- toolchain-specific command construction outside shared compiler boundaries
- runtime semantics hidden in UI state

The Studio canvas is an authoring surface. It is not the runtime. It may express
relationships, pressure, scene composition, modulation routes, and archive
references, but execution belongs to Core and its runtime adapters.

## Afterimage Core Boundary

Afterimage Core is the semantic engine.

It owns:

- canonical project model
- scene model
- sequence model
- preset and filter definitions
- modulation model
- world state model
- behavioural system contracts
- Universe Entropy Device semantics
- render graph planning
- capture semantics
- archive contracts
- deterministic replay rules
- validation and integrity rules

Core may be implemented as shared packages and schema contracts. It should stay
portable and runtime-neutral.

Core must be deterministic where determinism is required:

- project normalization
- contract validation
- render plan generation
- export profile resolution
- capture replay
- archive reference resolution

Core must not own:

- Electron windows
- React components
- platform dialogs
- filesystem watchers tied to one runtime
- process supervision
- FFmpeg child-process execution
- OBS, MIDI, OSC, or appliance protocol details
- Darklife archive intelligence
- publishing workflows

Core may describe work, but does not perform long-running work directly. It
emits plans, contracts, intents, and state transitions.

## Universe Entropy Device Boundary

The Universe Entropy Device is the core mechanism for injecting guided pressure
into a world.

It is not a randomizer. It is not a UI widget. It is not a media effect.

It owns the semantics of:

- entropy
- cohesion
- instability
- drift
- corrosion
- memory pressure
- collapse
- recovery
- delayed consequence

It accepts input from:

- Studio-authored intent
- performance gestures
- MIDI or OSC adapters
- scene transitions
- music sync events
- archive-derived behavioural seeds
- deterministic capture replay

It produces:

- normalized modulation signals
- world-state pressure changes
- behavioural system inputs
- render graph intent changes
- capture log entries when required for replay

It must remain in Core because it defines meaning. Pico services may process
signals or execute resulting work, but they must not define entropy semantics.

`docs/architecture/ENTROPY_INTERACTION.md` defines entropy sources, targets,
accumulation, recovery, seed ownership, capture requirements, and render graph
lowering in detail.

## Pico Services Boundary

Pico services are small, restartable, local workers.

They exist to keep Afterimage responsive and failure-tolerant without turning
the project into enterprise microservices.

Pico services should be:

- local by default
- restartable
- queue-driven where useful
- progress-reporting
- cancellation-aware
- structured-clone or JSON compatible at their boundaries
- replaceable without changing Core semantics

Pico services may own:

- process execution
- tool invocation
- long-running media operations
- cached derived assets
- bridge lifecycle
- retries and progress events
- local worker health

Pico services must not own:

- project semantics
- scene semantics
- archive meaning
- creative policy
- hidden mutation of canonical project state
- cross-service distributed orchestration

Candidate Pico services:

- FFmpeg worker
- media probe worker
- thumbnail worker
- waveform worker
- preview render worker
- export render worker
- MIDI bridge
- OSC bridge
- OBS bridge

These are candidates, not a mandate to split every job immediately. In-process
execution is acceptable when it preserves the same explicit contract boundary.

## Darklife Interop Boundary

Darklife is the archive intelligence and mythology system around Afterimage.

Darklife remembers. Afterimage dreams.

Darklife owns:

- archive ingestion intelligence
- cut detection
- scene segmentation
- CV tagging
- motif extraction
- atmosphere classification
- material tagging
- recurrence detection
- archive enrichment
- publishing adaptation
- reels, shorts, teasers, and campaign generation
- livestream harvesting

Afterimage owns:

- world performance
- behavioural composition
- use of archive references inside scenes
- use of motif and atmosphere metadata as creative inputs
- deterministic capture and export of Afterimage worlds

Interop happens through archive contracts, not shared hidden state.

Darklife may provide:

- clip segmentation metadata
- motif candidates
- atmosphere tags
- material tags
- motion tags
- behavioural seeds
- archive lineage
- recurrence markers
- provenance metadata
- deterministic media references

Afterimage may return:

- captured renders
- performance logs
- selected motifs
- generated world states
- export manifests
- archive lineage references

Darklife must not call directly into Afterimage internals. Afterimage must not
depend on Darklife to perform a live show, open a project, or replay a capture.

## Archive Contracts

Archive contracts define how archive intelligence enters Afterimage.

They are not a generic digital asset manager. They describe a memory reservoir
that can influence worlds.

Archive contracts should express:

- stable IDs
- source provenance
- deterministic media references
- clip segmentation
- motif candidates
- atmospheres
- textures
- materials
- motion qualities
- behavioural seeds
- emotional descriptors
- world affinity
- archive lineage
- recurrence
- confidence and review state where needed

Core owns the contract shape and validation rules. Darklife owns the
intelligence that populates those contracts. Studio owns the authoring UI that
lets a user accept, reject, browse, and apply those contracts.

Archive contract data must be:

- schema-validatable
- portable between runtimes
- deterministic enough for replay and export
- explicit about provenance
- explicit about generated versus authored fields

Archive contracts must not:

- embed opaque service state
- require Darklife to be online during capture or export
- hide nondeterministic decisions inside export
- turn Studio into a generic media management product

## Deterministic Capture And Export

Deterministic capture and export are sacred.

Realtime performance may be unstable and emergent. Captured export must remain
reproducible.

Core owns:

- what must be captured
- the replay contract
- seed handling
- timebase semantics
- event ordering semantics
- render graph planning
- export profile semantics
- project normalization used for replay

Studio owns:

- capture controls
- export UI
- profile selection
- output folder selection
- job presentation
- diagnostics and recovery flows

Pico services own:

- execution of preview and export plans
- FFmpeg process execution
- progress reporting
- cancellation
- retryable failure handling
- writing derived files to approved locations

Darklife may consume finished captures after the fact, but it must not be in the
critical path for deterministic export.

A reproducible capture/export requires:

- canonical project state
- referenced sidecars and archive contracts
- deterministic seeds
- normalized input events
- ordered modulation and performance events
- fixed export profile
- fixed render graph plan
- recorded toolchain identity where relevant
- explicit media references and provenance

Preview output may be lower fidelity. It must not silently become the final
artifact.

`docs/architecture/DETERMINISTIC_CAPTURE.md` defines capture identity, session
scope, event log shape, timebase normalization, replay resolution, validation,
Studio review boundaries, and render graph planning implications in detail.

## Runtime Separation

Studio and live runtimes share intent models, not workflows.

Studio prioritizes:

- analysis
- authoring
- review
- iteration
- high-quality export
- diagnostics

Live Desktop prioritizes:

- low-latency preview
- clip banks
- performance mappings
- reactive modulation
- stream and record routing
- recovery safety

Live Appliance prioritizes:

- boot-to-broadcast behavior
- supervision
- health signaling
- remote control
- predictable outputs
- minimal operator burden

All runtimes may use Core contracts. None may redefine Core semantics locally.

## FFmpeg Boundary

FFmpeg remains the deterministic offline render/export backend.

The FFmpeg-family toolchain is a Core/compiler concern plus a Pico execution
concern:

- Core and shared compiler packages create command plans.
- Pico services or runtime workers execute those plans.
- Product code must not shell out to `ffmpeg` or `ffprobe` directly.

Versions, provenance, and licensing notes must be recorded according to the
toolchain policy.

## Data Flow

The preferred flow is:

1. Studio authors project intent.
2. Core validates and normalizes contracts.
3. Core plans world, scene, modulation, capture, and render intent.
4. Pico services execute bounded work.
5. Studio presents progress, diagnostics, and results.
6. Captures and exports are written as reproducible artifacts.
7. Darklife may later ingest captures and produce archive intelligence.
8. Afterimage may later consume Darklife archive contracts as world inputs.

The forbidden flow is:

1. UI invents hidden semantics.
2. Worker mutates project meaning.
3. Adapter accumulates creative rules.
4. Darklife becomes required for replay.
5. Export depends on ambient service state.

## Dependency Direction

Allowed dependency direction:

- Studio depends on Core contracts and calls Pico service boundaries.
- Live runtimes depend on Core contracts and call Pico service boundaries.
- Pico services depend on explicit input contracts.
- Adapters depend on external APIs and translate into Core intents.
- Darklife exchanges archive contracts with Afterimage.

Forbidden dependency direction:

- Core depending on Studio UI.
- Core depending on Darklife runtime availability.
- Core depending on OBS, MIDI, OSC, Electron, or platform-specific UI APIs.
- Pico services redefining Core contracts.
- Adapters writing undocumented project mutations.
- Studio bypassing shared compilers for FFmpeg.

## Design Checks

Before adding a subsystem, answer:

- Does it define meaning? Put it in Core.
- Does it perform long-running or fragile work? Make it a Pico service or keep
  it behind the same service-shaped boundary.
- Does it speak to an external system? Make it an adapter.
- Does it classify, remember, enrich, or publish archive material? Put it in
  Darklife.
- Does export depend on it? Make the dependency deterministic, recorded, and
  replayable.
- Does it only exist for authoring ergonomics? Keep it in Studio.

## Non-Goals

This architecture does not introduce:

- new dependencies
- new services
- code implementation
- network orchestration
- arbitrary node-graph editing
- generic DAM/media-management scope
- per-app FFmpeg shell-outs
- runtime semantics hidden inside UI state

The current goal is clear boundaries, not premature infrastructure.
