# Scene And Layer Hierarchy

## Purpose

This document defines the Afterimage v1 scene/layer hierarchy.

Scenes are behavioural climates inside a composition. Layers are visual
contribution and influence within those climates. The hierarchy exists to keep
Afterimage from collapsing into either a clip-bin model or an opacity-stack
model.

## Core Rule

Scenes own climate. Layers own contribution.

A scene defines the emotional, behavioural, and atmospheric conditions of a
world region or traversal interval. A layer describes what contributes to that
scene visually or behaviourally. Neither scenes nor layers execute rendering;
the render graph lowers resolved scene/layer meaning into backend plans.

## Ownership Boundaries

Core owns scene and layer meaning.

Studio authors, inspects, and validates that meaning. Studio may provide
timeline controls, stack views, diagnostics, and performance affordances, but
those UI forms do not define runtime semantics.

Render graph compilation consumes resolved scene and layer meaning. It may
lower that meaning into passes, nodes, cache keys, backend blend operations, and
diagnostics, but it must not redefine scene climate, layer contribution, layer
ordering, or activation rules.

Backend services implement compiled plans. They do not own scene or layer
identity.

## Current V1 Anchor

The current repository already has:

- sequences
- variants
- sequence clips
- filter stacks
- stack overrides
- transition metadata
- transition masks and overlays
- automation lanes
- archive metadata sidecars

The v1 scene/layer hierarchy does not replace those contracts. It clarifies how
they evolve into scene climates and layer contribution without forcing runtime
implementation immediately.

## Hierarchy

The v1 hierarchy is:

```text
Composition
  World state
  Scenes
    Scene climate
    Scene activation
    Scene transitions
    Layers
      Source or generated material
      Contribution intent
      Influence intent
      Modulation targets
      Behaviour participation
      Render pass requirements
```

The timeline can schedule scene and layer activity, but it does not own the
meaning of either.

## Scene Definition

A scene is a behavioural climate.

It can define:

- atmosphere
- pressure
- entropy bias
- cohesion
- memory
- volatility
- active motifs
- archive segment affinity
- material tendencies
- active behaviours
- transition tendencies
- capture and replay expectations

A scene may reference media, archive metadata, and aesthetic packs, but those
references serve the climate. A scene is not a folder of clips.

## Scene Identity

A scene should have stable identity independent of temporary UI layout.

Scene identity must be stable enough for:

- authoring
- capture replay
- modulation routing
- archive affinity
- render graph planning
- diagnostics

Do not use array position or canvas position as scene identity.

## Scene Activation

Scene activation describes when and how a scene participates in a composition.

Activation may be driven by:

- timeline regions
- manual performance gestures
- controller mappings
- capture replay
- entropy pressure
- archive recurrence
- audio or sync events

Activation state must be deterministic when replayed or exported. Live
performance can change activation, but capture must record the normalized event
sequence needed for replay.

## Scene Transitions

Scene transitions are climate handoffs, not UI decorations.

A transition may describe:

- outgoing scene
- incoming scene
- overlap duration
- pressure handoff
- entropy handoff
- material persistence
- mask or overlay participation
- audio behaviour
- capture replay events
- render graph requirements

Transitions must account for rendered duration. Overlap can shorten effective
duration unless the composition deliberately extends or pads the traversal.

## Scene Overlap

Scenes may overlap when the world needs simultaneous climates.

Overlap must define:

- ordering or blending policy
- pressure combination
- layer visibility rules
- modulation conflict policy
- archive recurrence handling
- render graph requirements

Implicit overlap is not allowed for deterministic export.

## Layer Definition

A layer describes visual contribution and influence.

Layer types may include:

- footage
- image
- texture
- mask
- transition overlay
- atmospheric overlay
- generated material
- archive resurfacing
- field visualization
- diagnostic output

A layer can contribute pixels, masks, fields, modulation influence, material
state, or diagnostic visibility. It is not merely an opacity row.

## Layer Identity

A layer should have stable identity for:

- ordering
- modulation routing
- capture replay
- diagnostics
- cache identity
- render graph nodes

Layer identity should not depend on render backend labels or UI list position.

## Layer Ordering

Layer ordering is deterministic.

Ordering may consider:

- scene membership
- layer priority
- authored order
- layer role
- blend intent
- mask dependencies
- render pass dependencies

If two layers have the same priority and role, normalization must still produce
a stable order. Do not depend on unnormalized insertion order.

## Layer Scope

Layers may be scoped to:

- composition
- scene
- scene transition
- source clip
- archive segment
- behaviour
- diagnostic surface

Scope defines when the layer participates and what state must be captured.

## Layer Contribution

Layer contribution describes what the layer adds to the world.

Examples:

- primary source footage
- atmospheric haze
- archive memory residue
- corrosion texture
- transition mask
- surveillance scan overlay
- field diagnostic display

Contribution should be described semantically before backend-specific
implementation.

## Layer Influence

Layer influence describes how the layer affects other systems.

Examples:

- mask restricts material spread
- field visualization reveals spatial influence
- archive resurfacing raises memory pressure
- transition overlay affects scene handoff
- diagnostic layer exposes non-rendered state

Influence is part of composition meaning when it affects replay or export.

## Blend And Mask Intent

Blend and mask intent belong to Core contracts.

V1 should remain narrow and explicit:

- normal contribution
- opacity-equivalent mix
- add-luma
- screen-like
- multiply-like
- masked merge

Unsupported blend or mask behaviour should fail clearly or use a documented
deterministic fallback. Silent visual drift is not acceptable for export.

## Modulation Relationship

Scenes and layers can both be modulation targets.

Scene targets include:

- pressure
- cohesion
- entropy bias
- memory
- volatility
- transition tendency

Layer targets include:

- mix
- blend contribution
- mask influence
- emergence
- material response
- diagnostic visibility

`docs/architecture/MODULATION_MODEL.md` defines source, target, mapping,
conflict, and capture semantics. The scene/layer hierarchy defines where those
targets live.

## Archive Relationship

Archive metadata can inform both scenes and layers.

Scene-level archive use may include:

- motif affinity
- atmosphere affinity
- recurrence pressure
- behavioural seed selection

Layer-level archive use may include:

- archive resurfacing
- material texture selection
- overlay selection
- mask selection
- source fragment participation

Darklife creates archive intelligence. Afterimage scene/layer hierarchy decides
how accepted archive references participate in a composition.

## Behaviour Relationship

Behaviours may act on scenes, layers, or both.

Examples:

- scene pressure activates corrosion behaviour
- layer emergence responds to memory pressure
- field behaviour changes mask spread
- material behaviour accumulates on a texture layer
- transition behaviour controls pressure handoff

Behaviours must target stable scene and layer identities when their effects
matter for capture or export.

## Render Graph Boundary

The render graph consumes resolved scene/layer hierarchy.

It may lower hierarchy into:

- source nodes
- layer nodes
- mask nodes
- blend nodes
- transition nodes
- behavioural pass nodes
- scene section passes
- cache keys
- diagnostics

The graph must not redefine scene climate, layer contribution, ordering,
activation, or conflict policy.

## Studio Boundary

Studio authors and inspects scenes and layers.

It may expose:

- scene climate controls
- scene activation
- scene transition controls
- layer stack
- layer role
- blend intent
- mask participation
- archive references
- modulation status
- render cost diagnostics

Studio UI state is not runtime state. Anything required for replay or export
belongs in project, composition, sidecar, capture, or render target contracts.

## Determinism

Deterministic export requires scene/layer resolution to be stable.

Required deterministic inputs include:

- normalized project state
- selected sequence and variant
- scene identities
- scene activation state
- scene transition definitions
- layer identities
- layer order
- layer scopes
- blend and mask intent
- modulation route resolution
- archive metadata references
- capture log events
- render target

Ambient UI selection, canvas position, service availability, and backend label
generation must not affect final export.

## V1 Minimum Shape

The v1 scene/layer hierarchy should be able to answer:

- Which scenes exist in this composition?
- Which scenes are active at a given time or capture event?
- How do scenes transition or overlap?
- Which layers belong to each scene?
- What does each layer contribute?
- What does each layer influence?
- What is the deterministic layer order?
- Which modulation routes target scenes or layers?
- Which archive references participate?
- Which render graph capabilities are required?

If a proposed feature cannot answer these questions, it is not ready for
runtime implementation.

## Evolution Rule

Add runtime code only after scene/layer meaning is stable enough to preserve
across authoring, performance, capture, replay, and export.

Do not create a node graph, timeline feature, layer widget, render pass, or
schema field simply because it is visually convenient. Add it when it preserves
composition meaning.
