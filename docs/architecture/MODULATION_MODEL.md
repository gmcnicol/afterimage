# Modulation Model

## Purpose

This document defines the Afterimage v1 modulation model.

Modulation is how a composition changes over time without turning authoring
into parameter micromanagement. It connects authored automation, controller
gestures, audio analysis, entropy, scene pressure, archive recurrence, random
walks, and capture replay to semantic targets inside a world.

## Core Rule

Modulation owns change intent.

It does not own rendering, controller protocols, archive intelligence, or UI
widgets. Core defines what a modulation signal means, how it is normalized, how
it targets composition state, and what must be recorded for deterministic
replay. Adapters translate external input into modulation intent. Render graph
planning lowers modulation intent into backend-specific plans.

## Current V1 Anchor

The current repository already has a narrow automation contract:

- `AutomationLane`
- `AutomationKeyframe`
- `AutomationSectionValue`
- `AutomationTarget`
- `MidiIntent`
- `MidiMappingFile`
- normalized sync events from audio, beat, MIDI, and manual sources

That contract currently targets supported filter properties and is compiled
deterministically for preview and export. The v1 modulation model extends the
meaning around that anchor without requiring immediate runtime code.

## Modulation Definition

A modulation route connects one or more sources to one target through explicit
mapping rules.

A route answers:

- what signal is being observed
- what semantic target it affects
- how the value is normalized
- how the value is scaled or shaped
- whether smoothing or quantization applies
- which scope owns the route
- which deterministic seed is used where needed
- what must be captured for replay

The route is part of composition meaning. Backend-specific expression is not.

## Sources

### Automation

Automation is authored change over composition time.

Current v1 automation is intentionally simple: keyframes and section values are
resolved deterministically. Continuous animation can come later, but the
contract must remain explicit about sampling and segmentation.

### MIDI And OSC

MIDI and OSC are controller input sources.

Adapters translate device messages into normalized intent. They must not define
world semantics themselves.

Controller inputs may act as:

- set values
- toggles
- triggers
- scaled pressure
- captured gestures

The source protocol detail belongs to adapters. The normalized modulation
intent belongs to Core.

### Audio Analysis

Audio analysis should enter modulation through normalized events and tracks.

Inputs may include:

- audio change events
- beat events
- downbeat events
- sync events
- energy or spectral shifts
- silence boundaries

Downstream modulation should consume normalized sync contracts, not
analyzer-specific raw output.

### Entropy

Entropy is guided pressure, not randomness.

Entropy-driven modulation may affect:

- instability
- cohesion
- drift
- corrosion
- memory pressure
- collapse
- recovery

Random values must be seeded when they affect replay or export.

### Scene Pressure

Scenes are behavioural climates. Scene pressure can modulate world behaviour
within and across scenes.

Examples:

- raising layer emergence as pressure rises
- increasing field strength during transition
- cooling material response during recovery
- biasing archive resurfacing inside a scene

Scene pressure is semantic. It should not be implemented as a hidden UI slider
state.

### Archive Recurrence

Archive recurrence can modulate a composition when accepted archive metadata
links motifs, atmospheres, materials, or behavioural seeds.

Examples:

- recurring motif increases memory resurfacing
- atmosphere similarity biases scene climate
- material tag raises compatible aesthetic pack intensity
- behavioural seed initializes a seeded modulation route

Darklife creates intelligence. Afterimage decides how accepted metadata affects
the world.

### Random Walks

Random walks are controlled drift systems.

They should define:

- seed
- rate
- bounds
- smoothing
- target
- reset behaviour

Random walks must be reproducible when used for deterministic export.

### Capture Replay

Capture replay is a modulation source when recorded performance gestures or
runtime state changes are played back.

Replay must preserve event order, timing, normalized values, and seeds.

## Targets

### Scene Targets

Scene targets include:

- pressure
- entropy bias
- cohesion
- memory
- volatility
- transition tendency

### Layer Targets

Layer targets include:

- mix
- blend contribution
- mask influence
- emergence
- opacity-equivalent contribution
- diagnostic visibility

Layer targets describe contribution and influence, not just opacity.

### Behaviour Targets

Behaviour targets include:

- intensity
- threshold
- rate
- recovery
- persistence
- activation

Behaviours consume modulation as semantic input and produce world-state
changes.

### Field Targets

Field targets include:

- strength
- direction bias
- turbulence
- falloff
- vortex pressure
- convection intensity

Fields should influence masks, overlays, particles, materials, and modulation
before directly deforming source footage.

### Material Targets

Material targets include:

- response intensity
- accumulation
- erosion
- bloom
- stain persistence
- cooling or recovery

Material targets let aesthetic packs respond to the world without becoming a
single effect preset.

### Transition Targets

Transition targets include:

- blend bias
- mask progression
- pressure handoff
- overlap tendency
- emergence of incoming scene
- decay of outgoing scene

Transition modulation must remain deterministic for export.

### Render Pass Targets

Render pass targets are allowed only when they express composition meaning.

Examples:

- behavioural pass intensity
- cacheable field pass seed
- atmosphere tint strength
- preview-only approximation flag

Renderer implementation details such as raw FFmpeg filter strings or shader
uniform names are not Core modulation targets.

## Mapping Rules

Modulation mappings should be explicit.

They may define:

- input range
- output range
- clamp policy
- curve
- smoothing
- quantization
- trigger threshold
- hysteresis
- priority
- blend mode between competing routes

Implicit mapping is a source of nondeterminism and should be avoided.

## Scope

Modulation routes may be scoped to:

- project
- composition
- sequence
- variant
- scene
- layer
- behaviour
- render target
- capture replay

Scope determines where the route is valid and what data must be preserved.

## Conflict Resolution

Multiple routes may target the same value.

Conflict policy must be explicit. Options include:

- last event wins
- weighted sum
- maximum
- minimum
- multiply
- priority stack
- scene-local override
- capture replay override

The policy must be deterministic and inspectable.

## Determinism

Deterministic export requires modulation to resolve the same way for the same
inputs.

Required inputs include:

- normalized project state
- selected composition, sequence, and variant
- modulation route definitions
- keyframes and section values
- normalized sync events
- controller mapping identities
- capture log events
- archive metadata references
- random seeds
- render target

Ambient device state, wall-clock time, service availability, and UI focus must
not affect final export.

## Capture Requirements

Capture must record modulation inputs that are not already fixed by project
state or sidecars.

Capture should include:

- route ID
- source ID
- target ID
- normalized value
- timestamp
- event order
- trigger kind where relevant
- seed where relevant
- source mapping identity

Raw protocol messages may be useful for diagnostics, but replay should depend
on normalized modulation intent.

## Render Graph Boundary

The render graph consumes resolved modulation.

It may lower modulation into:

- segmented filter values
- behavioural pass parameters
- field pass parameters
- transition curves
- layer mix values
- cache keys
- backend capability requirements

The graph must not redefine modulation semantics. If a backend cannot execute a
modulated target, planning should fail clearly or use a documented deterministic
fallback.

## Adapter Boundary

Adapters translate external systems into normalized modulation inputs.

Examples:

- MIDI control change to normalized pressure
- OSC message to scene trigger
- keyboard shortcut to capture event
- OBS event to output-state intent

Adapters must not own target semantics, conflict policy, capture replay rules,
or render lowering.

## Authoring Boundary

Studio authors and inspects modulation.

It may expose:

- modulation routes
- controller bindings
- scene pressure controls
- automation lanes
- capture replay visibility
- diagnostics for unsupported targets

Studio UI must avoid parameter soup. Controls should present meaningful
behavioural language before backend details.

## V1 Minimum Shape

The v1 modulation model should be able to answer:

- What source drives this change?
- What semantic target receives it?
- How is the value normalized and mapped?
- What scope owns the route?
- How do competing routes resolve?
- What must be captured for replay?
- How is deterministic export preserved?
- Which backend capabilities are required?

If a proposed feature cannot answer these questions, it is not ready for
runtime implementation.

## Evolution Rule

Add runtime code only after the modulation meaning is stable enough to preserve
across authoring, performance, capture, replay, and export.

Do not add a controller bridge, render path, schema field, or UI control just
because a signal exists. Add it when it carries composition meaning that must
survive across runtimes.

