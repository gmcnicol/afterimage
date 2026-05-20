# Entropy Interaction

## Purpose

This document defines the Afterimage v1 entropy interaction model.

Entropy is guided pressure inside a composition. It lets a world feel unstable,
alive, corrosive, drifting, recursive, or close to collapse without turning the
runtime into uncontrolled randomness. Entropy may drive emergence, but every
entropy path that affects replay or export must be explicit, inspectable, and
reproducible.

## Core Rule

Entropy owns pressure semantics.

It does not own rendering, UI widgets, controller protocols, backend filter
parameters, or archive intelligence. Core defines what entropy means, where it
can enter the world, how it accumulates and recovers, how it combines with
modulation, and what must be captured for deterministic replay. Studio exposes
and inspects entropy. Adapters translate external signals into entropy intent.
Render graph planning consumes resolved entropy state.

## Current V1 Anchor

The existing architecture already names entropy as part of the world model:

- `FOUNDATIONS.md`: performance steers entropy, cohesion, memory, corrosion,
  drift, collapse, and recovery.
- `docs/architecture/ARCHITECTURE.md`: the Universe Entropy Device belongs to
  Core and produces normalized modulation signals, world-state pressure
  changes, behavioural system inputs, render graph intent changes, and capture
  log entries.
- `docs/architecture/COMPOSITION_MODEL.md`: worlds accumulate pressure,
  instability, recovery, and delayed consequence.
- `docs/architecture/MODULATION_MODEL.md`: entropy is both a modulation source
  and a semantic influence on targets.
- `docs/architecture/SCENE_LAYER_HIERARCHY.md`: scenes and layers can expose
  entropy bias, volatility, transition tendency, and material response.
- `docs/architecture/BEHAVIOURAL_SPATIAL_SYSTEMS.md`: spatial systems may carry
  seeded turbulence, pressure wells, fields, and entropy migration.
- `docs/architecture/DATA_MODEL.md`: scenes, behaviours, modulation routes,
  captures, and seeds must serialize enough intent for replay and export.
- `docs/architecture/RENDER_GRAPH.md`: behavioural render passes consume
  resolved world state and must expose deterministic parameters for offline
  export.

This document tightens those references into one v1 interaction contract.

## Definition

Entropy is a normalized semantic pressure field over the composition.

It can describe:

- instability
- volatility
- drift
- corrosion
- memory pressure
- cohesion loss
- collapse tendency
- recovery pressure
- delayed consequence

Entropy is not:

- raw `Math.random()`
- a hidden effect parameter
- a shader uniform exposed directly to Studio
- a global chaos slider with backend-defined meaning
- a substitute for modulation routes
- a service-owned runtime state

Entropy exists to let authored intent, performance, archive recurrence, seeded
systems, and behaviour feedback perturb a world while preserving replayable
meaning.

## Vocabulary Boundaries

### Entropy

Entropy is the semantic pressure that makes a world less settled.

It may increase instability, loosen cohesion, bias scene activation, raise
material corrosion, intensify field turbulence, or bring archive memory closer
to the surface.

### Randomness

Randomness is a value generation method.

Randomness can support entropy only when it is seeded, scoped, and recorded
where replay or export depends on it. Unseeded randomness must not affect
composition meaning, capture replay, render graph planning, or final export.

### Instability

Instability is the visible or behavioural tendency to change under pressure.

It can be caused by entropy, but it can also come from scene climate,
modulation, controller input, audio events, or behaviour state.

### Pressure

Pressure is accumulated force in a world, scene, layer, field, material, or
behaviour.

Entropy can raise or redirect pressure. Pressure can also exist without high
entropy when a scene is intense but controlled.

### Volatility

Volatility is sensitivity to input.

A highly volatile target reacts strongly to small changes. Entropy may raise
volatility, but volatility is not itself entropy.

### Drift

Drift is slow directional change.

Drift can be authored, modulated, seeded, or produced by spatial systems.
Entropy may amplify drift, reverse it, or make it less cohesive.

### Collapse

Collapse is a thresholded loss of structure.

Collapse may affect scene activation, layer emergence, material coherence,
field shape, or transition stability. Collapse must be modeled as a semantic
state change, not an accidental backend failure.

### Recovery

Recovery is the return toward coherence.

Recovery may cool materials, settle fields, reduce volatility, restore scene
cohesion, or clear accumulated pressure. Recovery rules are as important as
injection rules because deterministic replay must know how entropy dissipates.

## Ownership

### Core

Core owns:

- entropy vocabulary and target semantics
- entropy state shape
- injection, accumulation, decay, clamping, recovery, and conflict rules
- seed ownership
- deterministic replay requirements
- capture event requirements
- relationships to modulation, scenes, layers, behaviours, fields, materials,
  transitions, and render graph planning

Core may emit normalized entropy events, resolved entropy state, modulation
signals, behavioural inputs, and render graph intent. It must not execute
FFmpeg, talk to MIDI devices directly, or depend on Studio UI state.

### Studio

Studio owns:

- authoring entropy intent
- performance controls that inject or recover entropy
- inspection of current and captured entropy state
- validation warnings for unstable seeds, unsupported targets, or ambiguous
  replay rules
- readable diagnostics for preview/export differences

Studio must expose meaningful behavioural language before backend detail. It
must not define new entropy semantics inside components, panels, or widgets.

### Adapters

Adapters translate external signals into normalized entropy or modulation
intent.

Examples:

- MIDI pressure control to entropy injection
- OSC gesture to recovery pulse
- audio sync event to scene-local volatility
- keyboard shortcut to collapse trigger
- archive recurrence event to memory pressure

Adapters must preserve source identity where capture needs replay, but they do
not own target semantics.

### Render Graph

Render graph planning consumes resolved entropy state.

It may lower entropy into behavioural pass parameters, field passes, material
passes, scene transition plans, cache keys, backend requirements, and
diagnostics. It must not redefine entropy meaning. Unsupported entropy targets
must fail clearly or use a documented deterministic fallback.

`docs/architecture/RENDER_GRAPH.md` defines render planning and backend lowering
boundaries.

## Sources

Entropy can enter a composition from explicit, scoped sources.

### Authored State

Authored entropy defines initial conditions, scene bias, target sensitivity,
recovery rules, and safe bounds.

Authored entropy should be stored in project, composition, or sidecar contracts
only when it affects replay or export. Temporary editor selection must not
become authored entropy.

### Performance Gesture

Performance gestures inject, release, redirect, or recover entropy during a
traversal.

Gesture examples:

- raise world instability
- push a scene toward collapse
- recover cohesion
- pull archive memory forward
- increase field turbulence
- cool material corrosion

Capture must record normalized gesture intent, not merely device-specific raw
messages.

### Controller Input

Controller input reaches entropy through adapters and modulation routes.

Controller state may drive continuous pressure, trigger events, toggles, or
thresholded collapse. Ambient controller position at export time must not
change a captured traversal unless that state was part of the captured event
stream.

### Audio And Sync Events

Audio analysis and sync events may inject entropy when normalized cues imply
pressure changes.

Examples:

- downbeat raises scene pressure
- silence boundary triggers recovery
- energy spike increases volatility
- section change biases transition instability

Entropy consumers should depend on normalized sync events, not analyzer-private
output.

### Archive Recurrence

Archive recurrence can increase memory pressure, motif resurfacing, or
behavioural seed activation.

Darklife may produce archive intelligence and behavioural seed candidates.
Afterimage Core decides how accepted archive references influence entropy.
Darklife must not be online during capture replay or final export.

### Seeded Random Walk

A seeded random walk is controlled drift.

It must define:

- seed
- scope
- rate
- bounds
- smoothing
- reset behaviour
- target
- capture requirements

Random walks are allowed only when their output is reproducible for the same
inputs.

### Behaviour Feedback

Behaviours may feed entropy back into the world.

Examples:

- corrosion raises local memory pressure
- field turbulence increases layer volatility
- repeated scene activation increases delayed consequence
- recovery behaviour lowers collapse tendency

Feedback loops must define update order, bounds, and capture or seed
requirements. Hidden feedback is nondeterministic architecture.

## Targets

Entropy targets are semantic world locations.

### World

World entropy affects the whole composition traversal.

World targets include global instability, cohesion loss, recovery pressure,
memory pressure, drift bias, and collapse threshold.

World entropy should be used sparingly because it can influence many downstream
systems. Capture and diagnostics must make global effects visible.

### Scene

Scene entropy affects behavioural climate.

Scene targets include activation bias, entropy bias, volatility, pressure,
cohesion, transition tendency, memory resurfacing, and recovery speed.

`docs/architecture/SCENE_LAYER_HIERARCHY.md` defines scene identity,
activation, overlap, and transition ownership.

### Layer

Layer entropy affects contribution and influence.

Layer targets include emergence, mix, material response, mask influence,
diagnostic visibility, archive resurfacing, corrosion tendency, and persistence.

Entropy must target stable layer identity, not UI list position or backend
node labels.

### Behaviour

Behaviour entropy affects state evolution.

Behaviour targets include intensity, threshold, persistence, recovery,
activation, rate, and feedback sensitivity. Behaviours consume entropy as
semantic input and produce world-state changes.

### Field

Field entropy affects spatial influence.

Field targets include turbulence, directional instability, pressure wells,
falloff, diffusion, convection intensity, and entropy migration.

Field entropy should remain reproducible through seeded systems and explicit
state updates.

### Material

Material entropy affects aesthetic response.

Material targets include corrosion, bloom, stain persistence, accumulation,
erosion, cooling, recovery, and response intensity.

Material response belongs to composition and behavioural pack meaning, not raw
renderer implementation.

### Transition

Transition entropy affects climate handoff.

Transition targets include pressure handoff, overlap tendency, mask
instability, incoming scene emergence, outgoing scene decay, material
persistence, and recovery after transition.

Transition entropy must preserve deterministic rendered duration and explicit
overlap rules.

### Render Pass

Render pass entropy targets are allowed only when they express composition
meaning.

Examples:

- behavioural pass intensity
- seeded field pass
- atmosphere instability pass
- cacheable material corrosion pass

Renderer-specific details such as shader uniform names, FFmpeg filter strings,
or worker-local random state are not Core entropy targets.

## State Model

An entropy state entry should answer:

- which scope owns it
- which source produced it
- which target receives it
- what normalized value or event kind applies
- which accumulation rule applies
- which decay and recovery rules apply
- which clamp or threshold applies
- which seed applies where randomness is involved
- whether capture must record it
- whether render graph planning consumes it

Entropy state may be continuous, evented, or thresholded. The state shape should
be serializable when it affects replay or export.

## Injection Rules

Entropy injection is an explicit state change.

An injection must define:

- source ID
- target ID
- scope
- normalized amount or event kind
- timestamp or composition time
- event order
- mapping route where applicable
- seed where applicable
- accumulation policy
- capture policy

Injection must not depend on wall-clock timing, UI focus, backend availability,
or unrecorded controller state when replay or export depends on it.

## Accumulation

Accumulation defines how entropy persists.

Allowed policies include:

- replace
- additive
- weighted additive
- maximum
- minimum
- exponential accumulation
- threshold counter
- priority stack
- scene-local override

Every policy must be deterministic and inspectable. Implicit additive pressure
across unrelated routes is not allowed.

## Decay And Recovery

Decay reduces entropy over time or events.

Recovery is an authored or performed move toward coherence. Recovery may be
automatic, gesture-driven, scene-driven, behaviour-driven, or transition-driven.

Decay and recovery rules should define:

- rate
- curve
- target baseline
- lower and upper bounds
- interaction with active injections
- interaction with scene transitions
- capture requirements

Recovery is not deletion. Captured replay must be able to reproduce how the
world returned toward coherence.

## Clamping And Thresholds

Entropy must define safe bounds.

Clamps prevent impossible state. Thresholds trigger semantic changes such as
collapse, recovery phase, scene activation, material bloom, or diagnostic
warning.

Thresholded behaviour must specify:

- threshold value
- hysteresis where needed
- trigger edge
- cooldown or reset rule
- captured event or deterministic derivation

## Conflict Resolution

Multiple entropy sources may target the same state.

Conflict policy must be explicit. Valid policies include:

- source priority
- scene-local override
- capture replay override
- weighted blend
- maximum pressure
- minimum recovery
- last normalized event wins
- authored hard clamp

Capture replay has priority when replaying a captured traversal. Live ambient
input must not override a capture unless the user starts a new capture or
explicitly performs over it in a documented mode.

## Relationship To Modulation

Entropy and modulation are related but not identical.

Entropy is semantic pressure. Modulation is the routed change mechanism that
connects sources to targets. Entropy can be:

- a modulation source
- a modulation target influence
- an input to behaviour state
- an output of behaviour feedback
- a render graph planning input after resolution

Entropy must not become a hidden parallel parameter system. If entropy changes
a target over time, the route, mapping, conflict rule, seed, and capture policy
must be visible through the same architectural expectations described in
`docs/architecture/MODULATION_MODEL.md`.

## Seed Ownership

Core owns seed semantics.

A seed should have:

- stable seed ID or derivation path
- numeric seed value
- owner scope
- purpose
- generator identity where relevant
- reset rule
- capture requirement
- relationship to archive seed references where relevant

Seeds may originate from authored composition state, accepted archive metadata,
captured replay, or deterministic derivation. Seeds must not originate from
wall-clock time, process IDs, array insertion order, or backend-local random
state when replay or export depends on them.

## Capture Requirements

Capture must record entropy inputs that are not already fixed by project state,
composition state, sidecars, or deterministic derivation.

Capture entries should include:

- event ID
- composition ID
- capture ID
- source ID
- source kind
- target ID
- target kind
- scope
- normalized value or event kind
- timestamp in capture time
- composition time where different
- event order
- route ID where entropy entered through modulation
- mapping identity where adapter input is involved
- accumulation policy
- decay or recovery policy reference
- seed ID and seed value where relevant
- threshold trigger state where relevant

Raw device messages may be stored for diagnostics, but replay should depend on
normalized entropy intent.

## Deterministic Replay And Export

The same normalized project, composition, archive sidecars, capture log,
render target, seed set, and toolchain identity should resolve the same entropy
state and render plan.

Deterministic replay requires:

- stable source and target IDs
- stable route and mapping definitions
- explicit event order
- normalized timing
- seeded random systems
- deterministic feedback update order
- explicit accumulation and recovery policies
- fixed render target
- fixed backend capability policy

Ambient runtime state must not affect final export. Live performance may be
unstable while it is happening, but the captured traversal must be replayable.

## Studio Inspection Boundary

Studio should make entropy legible without designing the whole UI inside Core.

Studio may expose:

- world entropy level
- scene entropy bias
- active injections
- recovery state
- seed provenance
- capture status
- target impact
- unsupported backend diagnostics
- preview/export difference warnings

Studio should not expose entropy primarily as raw backend controls. The user
should see behavioural meaning before implementation mechanics.

## Render Graph Lowering

Render graph planning consumes resolved entropy after Core semantics are known.

It may lower entropy into:

- behavioural pass nodes
- field pass nodes
- material pass nodes
- transition nodes
- layer mix or emergence values
- cache keys
- deterministic seed summaries
- backend capability requirements
- diagnostics

Planning must fail clearly when a backend cannot support an entropy-driven
target required for final export. Preview-specific approximations must be
labeled as preview-specific.

## V1 Minimum Shape

The v1 entropy model should be able to answer:

- What does this entropy source mean?
- Which stable target receives it?
- Which scope owns the state?
- How is the value normalized?
- How does it accumulate?
- How does it decay or recover?
- What clamps or thresholds apply?
- Which seed is used?
- What must capture record?
- How does replay resolve the same result?
- What render graph capability consumes it?

If a proposed entropy feature cannot answer these questions, it is not ready
for runtime implementation.

## Non-Goals

This document does not introduce:

- runtime code
- schema changes
- a UI design
- an effect stack
- a randomizer implementation
- a realtime renderer
- FFmpeg command construction
- arbitrary user-authored shader logic

The immediate goal is to stabilize entropy meaning before implementation.

## Evolution Rule

Add runtime code only after entropy meaning is stable enough to preserve across
authoring, performance, capture, replay, and export.

Do not add a UI control, controller bridge, schema field, behaviour pack,
render node, or backend parameter merely because instability looks useful. Add
it when the entropy source, target, accumulation, recovery, seed, capture, and
render planning contracts are explicit.
