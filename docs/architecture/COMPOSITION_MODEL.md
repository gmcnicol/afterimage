# Composition Model

## Purpose

This document defines the Afterimage v1 composition model.

A composition is the bounded world intent that can be authored, performed,
captured, replayed, and rendered. It is not merely a timeline, clip bin, scene
folder, render preset, or UI canvas. It is the semantic assembly point where
project assets, scenes, layers, modulation, archive references, capture state,
and render targets become one coherent world traversal.

## Core Rule

The composition owns meaning.

Render graphs, FFmpeg commands, realtime draw calls, workers, and exported
files are downstream expressions of that meaning. Studio may author a
composition. Pico services may execute plans derived from it. Darklife may feed
it archive intelligence. None of those surfaces replaces the composition as the
runtime intent boundary.

## Relationship To Existing Models

The current repository already has:

- project files
- assets
- cut candidates
- sequences
- variants
- filter stacks
- automation lanes
- MIDI mappings
- export selections
- analysis sidecars
- archive metadata sidecars

The v1 composition model does not discard those contracts. It clarifies how
they resolve into a performable world.

## Composition Definition

A composition resolves:

- project identity and version
- selected sequence and variant
- active world state
- active scene set
- layer stack
- timeline and cue state
- modulation graph
- behavioural systems
- archive references
- aesthetic pack selections
- capture state
- render target
- deterministic seeds

The same composition intent should be understandable by Studio Desktop, future
live runtimes, capture replay, and offline export.

## Composition Is Not

A composition is not:

- an arbitrary node graph
- a Premiere-style timeline
- a render job
- a folder of clips
- a UI layout snapshot
- a Pico service payload
- a Darklife motif graph

Those systems may reference or observe a composition, but they do not define
it.

## World Boundary

The world is the stateful runtime interpretation of a composition.

The composition defines the world's initial and authored intent:

- which scenes exist
- which materials participate
- which archive fragments can surface
- which behaviours are active
- which modulation routes are legal
- which performance gestures can influence state
- which capture and replay rules apply

The world accumulates memory, pressure, instability, recovery, and delayed
consequence while the composition is performed or replayed.

## Scene Boundary

Scenes are behavioural climates inside a composition.

A scene can contribute:

- atmosphere
- pressure
- entropy bias
- memory bias
- active motifs
- active archive segments
- material tendencies
- active behaviours
- transition tendencies

Scenes may overlap, blend, or hand off, but they must remain deterministic when
resolved for export.

`docs/architecture/SCENE_LAYER_HIERARCHY.md` defines scene activation,
transition, overlap, and ownership rules in detail.

## Layer Boundary

Layers describe visual contribution and influence.

A layer can represent:

- source footage
- texture
- generated material
- archive resurfacing
- mask
- atmospheric overlay
- field visualization
- diagnostic output

Layer ordering, blend intent, mask participation, modulation targets, and
render pass requirements belong to the composition. Backend-specific
implementation belongs to render graph compilation.

`docs/architecture/SCENE_LAYER_HIERARCHY.md` defines layer identity, ordering,
scope, contribution, influence, and render graph lowering in detail.

## Timeline Boundary

The timeline provides temporal order and synchronization.

It owns:

- clip placement
- source ranges
- transition overlap
- markers
- sections
- cue placement
- music alignment
- capture replay timing

The timeline does not own the whole composition. It is one axis of the world,
not the product metaphor.

## Modulation Boundary

Modulation is how the composition changes without requiring parameter
micromanagement.

Composition-level modulation resolves:

- sources
- targets
- scaling
- smoothing
- quantization
- deterministic seeds
- capture replay handling

Modulation sources may include automation, MIDI, OSC, entropy, scene pressure,
audio analysis, archive recurrence, random walks, and performance capture.

Modulation targets may include layer mix, scene pressure, behaviour intensity,
material response, field strength, transition bias, and render pass controls.

`docs/architecture/MODULATION_MODEL.md` defines modulation sources, targets,
mapping, conflict policy, capture requirements, and render graph lowering in
detail.

## Archive Boundary

Archive references are memory inputs to the composition.

They can provide:

- segment references
- motif candidates
- atmosphere tags
- material tags
- motion tags
- behavioural seeds
- recurrence links
- provenance

Darklife owns the intelligence that creates archive metadata. The composition
owns how accepted archive references participate in a world.

The composition must reference archive metadata by stable IDs, not by generated
array position or hidden service state.

## Behaviour Boundary

Behaviours describe how composition state evolves.

They may affect:

- world pressure
- scene activation
- layer emergence
- material evolution
- spatial fields
- transition behaviour
- memory resurfacing

Behaviours produce semantic state changes. Renderers observe those changes.
Pico services do not define behaviour meaning.

## Capture Boundary

Capture records a traversal of a composition.

Capture should preserve:

- starting composition identity
- project version
- selected sequence and variant
- scene changes
- performance gestures
- modulation events
- behaviour seeds
- entropy injections
- timing and ordering
- relevant archive sidecar identities
- render target used for replay or export

Capture is not a video file alone. The video file is an artifact of a captured
composition traversal.

## Render Boundary

The render graph consumes a resolved composition.

It lowers composition meaning into:

- source nodes
- timing nodes
- layer nodes
- modulation nodes
- behavioural pass nodes
- transition nodes
- cacheable passes
- final encode plans

The render graph can reject unsupported composition features for a backend, but
it must not silently reinterpret composition meaning.

## Authoring Boundary

Studio authors composition intent.

Studio may expose:

- world canvas
- scene controls
- layer stack
- archive browser
- modulation routes
- controller bindings
- capture controls
- render target selection

Studio UI state must not become hidden runtime state. Anything required for
replay or export belongs in composition, project, sidecar, capture, or render
target contracts.

## Determinism

A resolved composition must be deterministic when used for export.

Required deterministic inputs include:

- normalized project
- selected sequence and variant
- archive metadata sidecars
- analysis sidecars
- capture log where applicable
- explicit seeds
- render target
- toolchain identity where relevant

Live performance may feel emergent. Export must remain reproducible.

## V1 Minimum Shape

The v1 composition model should be able to answer:

- What world is being traversed?
- Which scenes and layers participate?
- Which source media and archive fragments are referenced?
- Which modulation routes may affect the world?
- Which behaviours may evolve the world?
- Which timeline and cues provide timing?
- Which capture log, if any, is being replayed?
- Which render target is requested?
- Which backend capabilities are required?

If the model cannot answer one of these questions, the missing concept should
be documented before implementation.

## Evolution Rule

New runtime infrastructure should only be added when this document exposes a
real missing boundary.

Do not introduce a service, worker, graph system, schema field, or UI surface
just because the concept exists. Add it when a composition needs to preserve
meaning across authoring, performance, capture, replay, or export.
