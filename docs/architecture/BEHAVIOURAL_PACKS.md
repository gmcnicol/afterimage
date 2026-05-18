# Behavioural Aesthetic Packs

## Purpose

Behavioural aesthetic packs combine materials, behaviours, modulation, fields,
and scene archetypes into coherent audiovisual climates.

They are not effect presets. Effects are too small a concept for the role these
packs play.

## Core Rule

An aesthetic pack describes a world tendency.

It may include renderable assets, but its value is the relationship between
materials, fields, behaviours, atmosphere, and modulation.

## Pack Contents

A pack may contain materials, overlays, masks, behaviours, spatial fields,
modulation presets, scene archetypes, transition tendencies, world-state
bindings, archive affinity rules, and render graph hints.

Each component must be optional. A pack should degrade gracefully when a backend
or runtime cannot execute every element.

## Example Structure

```text
packs/
  cursed-toaster/
    pack.json
    behaviours/
    materials/
    fields/
    overlays/
    masks/
    scenes/
    modulation/
    examples/
```

## Pack Manifest

A pack manifest should define ID, name, version, description, aesthetic
vocabulary, required capabilities, optional capabilities, deterministic seed
policy, included systems, compatible render backends, and licensing metadata.

Pack manifests should be portable and inspectable. Binary assets should be
referenced with provenance rather than embedded in project files.

## Cursed Toaster Example

The canonical example is `cursed-toaster`.

It describes a domestic-decay and thermal-failure atmosphere somewhere between
damaged VHS, scorched celluloid, unstable electronics, thermal bloom, smoky
persistence, greasy haze, and breaded film burn.

This is not a single filter.

It is behavioural tendency, material response, atmospheric modulation, field
behaviour, and emotional identity.

## Materials

Materials describe how visual substances respond to state.

Examples include smoke persistence, corrosion stain, thermal bloom, analog
noise, oily reflection, and memory residue.

Materials may respond to modulation, fields, scene pressure, or behaviour
outputs.

## Behaviours

Pack behaviours describe evolution.

Examples include scorch accumulation, signal instability, stain resurfacing,
flicker recovery, haze pooling, and delayed collapse.

Behaviours must express semantic state. Renderers decide how to observe that
state.

## Fields

Fields describe spatial influence.

Examples include convection drift, pressure wells, turbulence pockets, erosion
flow, and memory sink zones.

Fields should affect masks, overlays, particles, materials, and modulation
before directly deforming source footage.

## Modulation Presets

Modulation presets bind world signals to pack components.

Examples:

- entropy raises thermal bloom
- scene pressure increases haze density
- audio onsets trigger signal fracture
- MIDI pressure opens scorch persistence
- recurrence events resurface archive fragments

Mappings should use normalized semantic targets so they can survive backend
changes.

## Scene Archetypes

A pack may include scene archetypes.

Examples for `cursed-toaster`:

- dormant appliance
- kitchen heat death
- smoke memory
- signal collapse
- grease halo

Scene archetypes are starting climates. They are not fixed templates.

## Compatibility

A pack must declare what it needs.

Capability examples include mask compositing, overlay compositing, seeded
noise, field sampling, audio modulation, MIDI modulation, intermediate render
passes, and realtime field visualization.

If a backend lacks a capability, the planner should either lower to a simpler
equivalent or report a clear unsupported feature.

## Future Direction

Packs should compose.

Example:

```text
Cursed Toaster + Whirl Machine
```

Expected result:

- thermal smoke spirals
- grease haze recirculates
- scorch persistence accumulates in pressure wells
- unstable atmospheric convection appears

The result should feel like an evolving audiovisual ecosystem rather than
chained effects.

