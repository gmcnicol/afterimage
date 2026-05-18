# Data Model

## Purpose

This document defines the canonical shared project model for Afterimage.

The data model is the contract between authoring, behavioural runtime,
deterministic export, live performance, and archive intelligence. Runtime
surfaces may present different workflows, but they must not invent competing
meanings for scenes, layers, modulation, behaviours, or captures.

## Canonical Rule

The project file stores stable authoring intent.

Generated analysis, archive intelligence, previews, thumbnails, waveforms, and
render outputs are referenced as sidecars or artifacts. They do not become the
source of truth for the world.

## Current Anchor

The current `@afterimage/project-model` package defines the phase 1 project
shape:

- assets
- presets
- analysis references
- cut candidates
- bins
- sequences
- variants
- filter stacks
- automation lanes
- MIDI mappings
- export selections

The v2 model remains valid. This document defines the direction for the core
architecture that grows around it.

## Asset Model

An asset is an addressable source or generated material reference.

Assets describe stable identity, media type, role, project-relative path,
optional absolute path, duration, dimensions, audio availability, import
status, analysis status, human labels, tags, and notes.

Assets do not describe scene meaning by themselves. A clip of a hallway is only
a file until it is placed into a sequence, referenced by a scene, connected to
archive metadata, or used by a behaviour.

## Archive References

Archive intelligence belongs outside the core project file but must be
referenced deterministically.

Archive references should include archive metadata file ID, source asset ID,
segment ID, motif IDs, atmosphere IDs, behaviour seed IDs, provenance, generator
identity, and confidence where the value is inferred.

The project should store only the references needed to reproduce an authored
world or export. Large intelligence graphs stay in archive sidecars.

## Composition Model

A composition is the renderable and performable interpretation of project
state.

It resolves selected sequence, selected variant, active scenes, layer stack,
modulation graph, behaviour systems, render target, capture state, and
deterministic seeds.

A composition is not just a timeline. It is a world snapshot with enough
semantic information to plan rendering and replay performance.

`docs/architecture/COMPOSITION_MODEL.md` defines this boundary in detail. This
document owns the underlying project and sidecar data concepts; the composition
model owns how those concepts resolve into one traversable world.

## Timeline Model

The timeline provides temporal order, duration, and synchronization.

It owns clip start and duration, source start and cut references, markers,
sections, music alignment, transition overlap, and render duration accounting.

The timeline does not own every animation value. Fine-grained value change
belongs to modulation lanes, behaviours, controller gestures, and capture logs.

## Layer Model

Layers represent visual contribution and influence, not merely opacity.

A layer should describe source or generated material, scene membership, blend
intent, mask intent, material response, modulation targets, behavioural
participation, priority, ordering, and render pass requirements.

Layer types may include footage, texture, mask, field visualization,
atmospheric overlay, generated material, archive resurfacing, and diagnostic
layers.

Layer ordering must be deterministic for export. Performance surfaces may
change active layer weights, but capture logs must make those changes
replayable.

## Scene Model

Scenes are behavioural climates, not clip bins.

A scene describes atmosphere, pressure, entropy, cohesion, memory, volatility,
material tendencies, active behaviours, active modulation sources, and
transition tendencies.

Scenes may reference clips, motifs, archive segments, and materials, but those
references serve the climate. A scene is not simply a folder of assets.

Scene state should be serializable so offline export and live runtime share the
same intent.

## Modulation Model

Modulation is first-class.

Modulation sources include automation, entropy, MIDI, OSC, audio analysis,
scene pressure, random walk systems, archive recurrence, and capture replay.

Modulation targets include filter parameters, layer mix, scene pressure,
behaviour intensity, field strength, material response, transition bias, and
render pass controls.

Modulation lanes should describe normalized intent. Backend-specific parameter
mapping belongs in render graph compilation or runtime adapters.

`docs/architecture/MODULATION_MODEL.md` defines the broader v1 modulation
semantics. This document owns the underlying data concepts; the modulation
model owns how change intent is normalized, targeted, captured, and lowered.

## Behaviour Model

Behaviours describe how a world evolves over time.

A behaviour should define stable ID, type, input state, output state changes,
modulation inputs, deterministic seed, intensity, affected scene or layer
scope, and capture and replay rules.

Behaviours do not execute FFmpeg, draw frames, or talk to controllers directly.
They produce semantic state transitions that renderers observe.

## Controller Mapping Model

Controller mappings translate physical or external gestures into core intents.

Mappings should preserve source device and control identity, normalized value
range, binding mode, target semantic path, quantization or smoothing, and
capture replay identity.

Current MIDI mappings are the first version of this boundary. OSC, keyboard,
touch, and custom hardware should follow the same intent mapping rule.

## Render Target Model

Render targets describe intended output, not execution details.

They should include target kind, resolution, frame rate, duration policy, audio
policy, color and pixel format constraints, codec or profile family,
deterministic seed policy, and artifact location.

The FFmpeg compiler lowers render targets into executable commands. The core
model owns the target meaning.

## Cue Import Model

Cues are external or derived timing signals.

Cue sources include manual markers, music beats, downbeats, audio energy
changes, MIDI gestures, imported cue sheets, and performance capture logs.

Cues must normalize into stable sync events with source, kind, time, strength,
confidence, and optional label. Render and behaviour systems should consume
those normalized cues rather than parsing source formats directly.

## Determinism Requirements

The same normalized project, archive sidecars, capture log, export profile, and
toolchain identity must produce the same render plan.

Deterministic fields include IDs, ordering, timeline timing, scene activation,
modulation lane values, behaviour seeds, archive references, and render target
settings.

Ambient runtime state must not affect final export.

## Versioning

Project version changes require TypeScript type changes, JSON schema changes,
migration support, validation tests, fixture updates, and architecture
documentation updates.

Behavioural runtime concepts may incubate in sidecars or feature flags before
they become required project fields.
