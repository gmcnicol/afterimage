# Deterministic Capture

## Purpose

This document defines deterministic capture semantics for Afterimage v1.

Capture is the bridge between live performance, replay, review, and offline
export. It records a traversal of a composition, not only a rendered video. A
capture must preserve enough normalized intent to replay the same traversal and
to plan a deterministic offline render without depending on ambient UI state,
device state, service availability, wall-clock timing, or backend-local labels.

## Core Rule

Capture owns traversal evidence.

It does not own composition meaning, rendering, controller protocols, archive
intelligence, or Studio UI state. Core defines what a capture records, how event
time and ordering are normalized, how replay resolves against project state,
and what deterministic inputs render graph planning consumes. Studio controls
and reviews capture. Adapters translate external inputs before capture stores
normalized intent. Pico services execute replay and export plans after Core has
resolved them.

## Current V1 Anchor

The existing architecture already describes capture as a first-class boundary:

- `FOUNDATIONS.md`: the captured render is the artifact and deterministic
  export is sacred.
- `docs/architecture/ARCHITECTURE.md`: Core owns what must be captured, replay
  contract, seed handling, timebase semantics, event ordering semantics, render
  graph planning, export profile semantics, and project normalization.
- `docs/architecture/COMPOSITION_MODEL.md`: capture records a traversal of a
  composition and preserves scene changes, performance gestures, modulation
  events, behaviour seeds, entropy injections, timing, archive sidecar
  identities, and render target.
- `docs/architecture/DATA_MODEL.md`: project, sidecar, behaviour, controller,
  cue, and render target contracts must preserve replayable state.
- `docs/architecture/MODULATION_MODEL.md`: capture replay is a modulation
  source and replay must preserve event order, timing, normalized values, and
  seeds.
- `docs/architecture/SCENE_LAYER_HIERARCHY.md`: scene activation, scene
  transitions, layer ordering, layer scope, and layer influence must be stable
  for replay and export.
- `docs/architecture/ENTROPY_INTERACTION.md`: entropy events require stable
  source and target IDs, normalized timing, event order, seeds, accumulation,
  and recovery policies.
- `docs/architecture/UX.md`: the user must know whether they are watching live
  state, captured state, preview render, or final deterministic export.
- `docs/architecture/RENDER_GRAPH.md`: planning consumes capture state, seeds,
  modulation, event timing, render target, and toolchain identity.

This document turns those references into one capture contract.

## Definitions

### Capture Session

A capture session is the bounded recording period for a performed composition
traversal.

It defines:

- capture ID
- source composition ID
- project identity and version
- selected sequence and variant
- start and stop conditions
- authoritative capture timebase
- input sources admitted into the capture
- render target selected at capture time where relevant
- sidecar and toolchain identities needed for later replay

### Capture Log

A capture log is the ordered sequence of normalized events recorded during a
capture session.

The log stores replayable intent. It may include diagnostic raw input, but raw
device messages, UI events, process state, and backend logs are not the replay
contract.

### Capture Event

A capture event is one normalized state change or observation needed for replay.

Events may describe scene activation, transition starts, layer changes,
modulation values, entropy injections, behaviour state changes, controller
gestures after adapter normalization, archive resurfacing, cue alignment,
render target selection, or capture lifecycle changes.

### Captured State

Captured state is the resolved state obtained by applying the capture log to
the captured composition baseline.

Captured state is distinct from live state. Live state may still be evolving,
but captured state is what replay and offline export consume.

### Capture Artifact

A capture artifact is an output produced from a capture.

Artifacts may include preview renders, final exports, manifests, logs,
diagnostics, thumbnails, or later archive inputs. A video file is an artifact of
a captured traversal, not the capture itself.

## Capture Is Not

Capture is not:

- a video recording only
- a screen recording
- a dump of UI component state
- a raw MIDI, OSC, keyboard, or pointer event stream
- a backend command log
- a service-local replay cache
- a substitute for project, composition, archive, or render target contracts

Any data needed for replay must be normalized into Core intent.

## Identity

Capture identity must be stable enough for review, replay, export, diagnostics,
and archive ingestion.

A capture should identify:

- capture ID
- capture schema version
- project ID
- project version or content hash
- composition ID
- sequence ID
- variant ID
- capture session start and end
- capture author or runtime identity where useful
- source workspace or machine identity where useful for diagnostics
- capture log artifact identity
- optional preview artifact identities
- optional final export artifact identities

Generated IDs must not depend on array position, transient UI layout, worker
process identity, or backend-generated labels.

## Session Scope

A capture session must define what it can record before recording begins.

Session scope should include:

- composition baseline
- active sequence and variant
- admitted input adapters
- admitted controller mappings
- admitted audio or sync event sources
- admitted archive sidecars
- admitted behaviour systems
- admitted entropy sources
- admitted render target selection changes
- timebase policy
- seed policy
- failure and partial-capture policy

Inputs outside session scope may still exist in the live runtime, but they must
not affect captured replay unless they are normalized and recorded.

## Timebase

Capture must normalize time.

V1 should distinguish:

- wall-clock time for diagnostics
- capture time from session start
- composition time within the selected sequence or traversal
- source media time
- audio or sync event time
- render output time

Replay and export depend on normalized capture time and composition time, not
wall-clock time. Wall-clock timestamps may be stored for diagnostics, but they
must not be required to reproduce the traversal.

## Event Ordering

Capture event order must be explicit.

Each event should carry:

- event ID
- capture ID
- monotonic event index
- normalized capture timestamp
- composition timestamp where applicable
- source timestamp where applicable
- ordering group where simultaneous events need deterministic ordering
- source ID
- source kind
- target ID
- target kind
- normalized payload

If two events occur at the same normalized time, replay must still know which
one resolves first. Do not depend on JavaScript object order, arrival order from
unmerged async streams, device polling order, or worker scheduling.

## Event Shape

A capture event should answer:

- what happened
- when it happened in capture time
- where it maps in composition time
- which source produced it
- which stable target receives it
- which normalized value, trigger, or state change applies
- which route or mapping produced it where relevant
- which seed applies where relevant
- which project, sidecar, or toolchain identity it depends on
- whether it is replay-critical or diagnostic-only

Events should be serializable and versioned. Unknown replay-critical event types
must fail validation rather than being ignored silently.

## Provenance

Capture provenance explains where replay-critical data came from.

Provenance may include:

- adapter identity
- controller mapping identity
- normalized sync source identity
- archive sidecar identity
- behaviour pack identity
- entropy source identity
- seed derivation path
- project content identity
- toolchain identity

Provenance is not an excuse to replay raw source protocols. It exists so the
system can diagnose why a normalized event is present and whether its
dependencies are still available.

## What Must Be Captured

Capture must record any input that can change replay or export and is not
already fixed by project state, composition state, sidecars, deterministic
derivation, or render target configuration.

### Scene Activation

Capture scene activation when live performance, sync events, archive
recurrence, entropy pressure, or behaviour feedback changes which scenes are
active.

Events should include scene ID, activation kind, activation value, transition
relationship where relevant, normalized time, event order, and source route.

### Scene Transitions

Capture transition starts, interruptions, handoffs, and recovery when they are
performed or generated during traversal.

Events should include outgoing scene ID, incoming scene ID, transition ID or
definition reference, overlap or handoff timing, pressure handoff, entropy
handoff, material persistence, and any seeded transition state.

### Layer Changes

Capture layer changes that affect contribution or influence.

Examples include layer emergence, mix changes, mask participation, archive
resurfacing layer activation, diagnostic layer visibility when it affects
export, and performed layer role changes.

Events must target stable layer IDs, not UI positions or backend node names.

### Modulation Events

Capture modulation inputs that are not fixed by authored lanes or sidecars.

Events should include route ID, source ID, target ID, normalized value, trigger
kind, timestamp, event order, source mapping identity, and seed where relevant.

`docs/architecture/MODULATION_MODEL.md` owns modulation route semantics.

### Entropy Injections

Capture entropy injections, recovery gestures, threshold triggers, and seeded
entropy systems where they affect replay.

Events should include source ID, target ID, scope, normalized value or trigger,
accumulation policy reference, decay or recovery policy reference, event order,
and seed ID or seed value where relevant.

`docs/architecture/ENTROPY_INTERACTION.md` owns entropy semantics.

### Behaviour State Changes

Capture behaviour state changes that are not deterministically derived from the
captured baseline and prior captured events.

Examples include activation, deactivation, threshold crossing, feedback state,
seed selection, reset, collapse, and recovery.

Behaviour events should identify behaviour ID, behaviour type, scope, input
source, output state change, seed identity, and update order.

### Controller Gestures

Capture controller gestures after adapters translate them into normalized Core
intent.

Raw MIDI, OSC, keyboard, pointer, or hardware messages may be stored for
diagnostics, but replay should consume normalized gesture events. Controller
device state at replay time must not affect the captured traversal.

### Audio And Sync Events

Capture normalized audio and sync events when they are generated live or when
their timing is needed to reproduce the traversal.

Events should include sync source ID, kind, normalized time, strength,
confidence where applicable, section or marker reference, and event order.

Offline replay should consume normalized sync events rather than rerunning an
analyzer unless the analyzer output is itself a fixed sidecar input.

### Archive Resurfacing

Capture accepted archive resurfacing when it changes scene, layer, modulation,
entropy, or behaviour state.

Events should include archive metadata file ID, source asset ID, segment ID,
motif ID, atmosphere ID, behavioural seed ID where relevant, confidence where
it affects selection, and provenance.

Darklife may create archive intelligence, but it must not be required during
capture replay or final export.

### Render Target Selection

Capture render target selection when the chosen target affects replay or
export.

Events or session metadata should identify target kind, resolution, frame rate,
duration policy, audio policy, color or pixel format constraints, profile
family, deterministic seed policy, and artifact intent.

Output folder selection can remain Studio workflow state unless it affects a
replayable manifest or export plan.

## Seeds

Capture must preserve seed information for every seeded system whose output
affects replay or export.

Seed data should include:

- seed ID
- numeric seed value
- owner scope
- purpose
- generator identity where relevant
- derivation path where relevant
- reset rule
- relationship to archive seed references where relevant

Seeds must not be generated from wall-clock time, worker process identity,
backend-local random state, or unnormalized insertion order when replay or
export depends on them.

## Replay Resolution

Replay resolves a capture by combining fixed inputs:

- capture log
- capture schema version
- project ID and version or content hash
- normalized project state
- selected composition, sequence, and variant
- archive sidecars and analysis sidecars
- behaviour and entropy seed set
- normalized sync events
- render target
- backend capability policy
- toolchain identity where relevant

Replay must not depend on:

- current UI selection
- canvas position
- panel state
- focused window
- connected controller state
- service availability beyond execution
- Darklife availability
- wall-clock time
- backend-generated labels
- worker process identity

## Live, Captured, Preview, And Final States

Afterimage must distinguish four related states:

- Live state: the current evolving runtime during performance.
- Captured state: replayable traversal state produced from a capture log.
- Preview render: a lower-cost artifact produced from composition or captured
  state for review.
- Final export: the deterministic artifact produced from fixed replay inputs
  and a fixed render plan.

Studio should make those states clear. Preview-specific approximations must be
labeled and must not silently become final export semantics.

## Validation

Capture validation should run before replay and before export planning.

Validation should check:

- missing media assets
- changed project version or content hash
- missing archive sidecars
- changed archive sidecars where identity no longer matches
- missing analysis sidecars
- unknown capture schema version
- unknown replay-critical event type
- unstable event ordering
- missing seeds
- unsupported behaviour or entropy event types
- unsupported render target
- unsupported backend capability
- toolchain identity mismatch where relevant
- clock drift beyond normalized correction policy
- partial capture without explicit recovery policy

Validation failures should be explicit. Silent best-effort replay is not
acceptable for final export.

## Partial Captures

A partial capture is a session that ended without a normal stop event or with
missing replay-critical data.

Partial captures may be:

- recoverable for review
- exportable only with explicit truncation or repair metadata
- diagnostic-only
- invalid for deterministic export

Core should define the status. Studio may provide recovery flows, but it must
not invent missing replay-critical state.

## Clock Drift

Live systems may receive events from multiple clocks.

Capture must normalize those events onto the capture timebase and record enough
provenance to diagnose drift. If drift correction affects replay-critical
timing, the correction policy or corrected timestamp must be recorded.

Offline export must consume normalized timing, not live device clock state.

## Studio Review Boundary

Studio owns capture controls and review affordances.

Studio may expose:

- capture start and stop controls
- capture status
- live versus captured state indication
- event timeline
- scene and layer changes
- modulation and entropy events
- controller gesture summaries
- seed provenance
- missing dependency diagnostics
- preview/export difference warnings
- repair or truncation workflows for partial captures

Studio UI state is not the capture contract. Anything required for replay or
export belongs in project, composition, sidecar, capture, render target, or
toolchain contracts.

## Render Graph Planning

Render graph planning consumes resolved captured state.

Planning may use capture data for:

- scene section timing
- transition timing
- layer activation and mix
- modulation values
- entropy state
- behaviour pass inputs
- seeded field and material passes
- cache keys
- deterministic seed summary
- target duration
- artifact manifests
- backend capability diagnostics

The render graph must not redefine capture semantics. If a capture requires a
target that a backend cannot support for final export, planning should fail
clearly or use a documented deterministic fallback.

## V1 Minimum Shape

The v1 capture model should be able to answer:

- Which composition traversal was captured?
- Which project, sequence, and variant form the baseline?
- Which timebase is authoritative?
- Which events happened and in what deterministic order?
- Which scene, layer, modulation, entropy, behaviour, controller, sync,
  archive, and render target changes affect replay?
- Which seeds are required?
- Which sidecars and toolchain identities are fixed inputs?
- Which state is live, captured, preview, or final export?
- Which validation failures block deterministic export?
- Which render graph capabilities are required?

If a proposed capture feature cannot answer these questions, it is not ready
for runtime implementation.

## Non-Goals

This document does not introduce:

- runtime code
- schema changes
- a capture UI design
- a video recording implementation
- controller protocol implementation
- render worker implementation
- FFmpeg command construction
- archive intelligence generation

The immediate goal is to stabilize capture meaning before implementation.

## Evolution Rule

Add runtime code only after capture meaning is stable enough to preserve across
authoring, performance, replay, review, and export.

Do not add a capture field, UI control, adapter event, behaviour event, render
node, or export option unless it is clear whether the data is authored state,
captured replay state, diagnostic state, or artifact state.
