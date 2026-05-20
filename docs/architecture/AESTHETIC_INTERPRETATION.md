# Aesthetic Interpretation And LUT Pipeline

## Purpose

This document defines how aesthetic identity and look interpretation work in
Afterimage v1.

Afterimage visual identity should emerge primarily from world behaviour:
materials, atmosphere, compositing, overlays, modulation, entropy, behavioural
systems, and archive memory. LUTs and color transforms are final
interpretation layers. They are not the whole look.

## Core Rule

Look interpretation is downstream from behaviour.

The world becomes visually specific before final color interpretation. A LUT
may translate, corrupt, print, cool, warm, or constrain the resulting image,
but it must not replace material behaviour, scene climate, layer contribution,
modulation, entropy, or behavioural render passes.

## Render Flow

The intended semantic flow is:

```text
Source
-> Material passes
-> Behavioural passes
-> Compositing
-> Atmosphere passes
-> Look interpretation
-> Output encoding
```

Backends may combine steps for execution, but the semantic order should remain
inspectable.

## Current V1 Anchor

The current repository already has:

- supported clip filters
- filter stacks
- preset filters
- automation lanes
- render profiles
- FFmpeg preview/export command planning
- behavioural aesthetic pack doctrine
- scene/layer hierarchy
- entropy and modulation semantics
- render graph behavioural pass concepts

This document defines where those concepts meet final interpretation.

## Identity Sources

Visual identity should primarily emerge from:

- source material selection
- archive provenance and recurrence
- scene climate
- layer contribution and influence
- material behaviour
- atmosphere
- overlays and masks
- spatial fields
- modulation
- entropy
- transition behaviour
- aesthetic pack tendencies

Final color interpretation should reinforce that identity rather than fake it.

## Material Behaviour Layer

Material behaviour describes how visual substances respond to world state.

Examples:

- corrosion
- bloom
- haze
- thermal drift
- analog instability
- residue
- chroma bleed
- persistence
- erosion
- stain accumulation
- memory burn

Material passes may consume scene pressure, entropy, modulation, spatial
fields, archive seeds, or capture replay events. They produce visual state that
look interpretation observes.

## Behavioural Pass Layer

Behavioural passes translate world state into visual execution.

Examples:

- memory residue pass
- collapse pressure pass
- drift field pass
- corrosion field pass
- signal instability pass
- surveillance scan pass
- archive resurfacing pass

Behavioural passes should expose deterministic parameters for offline export
and clear approximation labels for preview.

## Atmosphere Layer

Atmosphere is the scene's environmental and emotional pressure.

Examples:

- pressure
- density
- fog
- warmth
- surveillance coldness
- sodium-vapour mood
- claustrophobic darkness
- damp haze
- heat shimmer
- underwater murk

Atmosphere may affect overlays, material response, field strength, modulation
targets, and final interpretation bias. It is not a free-form tag bag.

## Compositing Layer

Compositing creates visual relationships before final interpretation.

Compositing owns:

- layer ordering
- blend intent
- mask participation
- transition overlays
- archive resurfacing layers
- diagnostic layers where relevant
- scene overlap contribution

Look interpretation should consume the composited result. It should not hide
incorrect layer ordering or unsupported blend semantics.

## Look Interpretation Layer

Look interpretation translates the already-formed world into an output viewing
condition.

Examples:

- LUTs
- color transforms
- curves
- halation
- grain
- CRT phosphor interpretation
- VHS interpretation
- film transfer interpretation
- monochrome collapse
- print bath bias
- corrupted surveillance display

LUTs should behave like transfer processes, print interpretation, corrupted
viewing conditions, or chemical baths. They should not behave like generic
social-media filters pasted onto arbitrary footage.

## LUT Boundary

A LUT is allowed when it has explicit meaning.

A LUT should define:

- ID
- name
- version
- purpose
- intended input color state
- output color state
- strength or mix policy
- placement in the interpretation stage
- supported backends
- preview approximation policy
- provenance and licensing

A LUT must not carry hidden composition semantics. If a LUT is standing in for
material behaviour or atmosphere, the missing behaviour or atmosphere contract
should be documented instead.

## Aesthetic Packs

Aesthetic packs describe reusable world tendencies.

They may include:

- LUTs
- overlays
- atmosphere defaults
- material behaviours
- behavioural biases
- blend tendencies
- transition tendencies
- texture libraries
- typography
- modulation defaults
- archive affinity rules
- preview/export capability requirements

`docs/architecture/BEHAVIOURAL_PACKS.md` defines behavioural aesthetic pack
doctrine. This document narrows how packs participate in the render pipeline
and look interpretation.

## Pack Acceptance

Accepting an aesthetic pack into a composition should resolve explicit intent:

- which pack version participates
- which materials are enabled
- which atmosphere defaults apply
- which behaviours or fields are active
- which modulation routes are added or suggested
- which LUTs or interpretation transforms are selected
- which render graph capabilities are required
- which preview approximations are allowed
- which assets and licenses are referenced

Pack selection is composition meaning. Backend-specific effect chains are not.

## Modulation And Entropy

Modulation and entropy may affect aesthetic interpretation, but they must remain
semantic.

Examples:

- entropy raises analog instability before the LUT stage
- scene pressure increases haze density
- capture replay drives monochrome collapse
- archive recurrence introduces memory residue
- audio sync opens halation strength
- recovery cools material bloom

If modulation targets a final interpretation parameter, the route, mapping,
conflict rule, capture policy, and seed requirements must remain visible
through `docs/architecture/MODULATION_MODEL.md`.

## Determinism

Final export must be deterministic.

Required inputs include:

- normalized project state
- selected composition, sequence, and variant
- scene and layer state
- material and atmosphere parameters
- aesthetic pack version
- LUT identity and version
- modulation and entropy inputs
- capture log where relevant
- deterministic seeds
- render target
- backend capability policy
- toolchain identity where relevant

Ambient UI state, unversioned LUT files, current display calibration, service
availability, and backend-local labels must not affect final export.

## Preview And Export

Preview may approximate interpretation.

Examples:

- lower precision LUT sampling
- cheaper grain
- simplified halation
- disabled expensive material accumulation
- reduced overlay density
- approximate CRT or VHS display behaviour

Approximation must be disclosed. Final export remains the trust boundary for
deterministic artifacts.

## Render Graph Lowering

The render graph may lower aesthetic interpretation into:

- material pass nodes
- behavioural pass nodes
- atmosphere pass nodes
- compositing nodes
- LUT or color transform nodes
- grain or halation nodes
- output color and pixel format nodes
- cache keys
- backend capability requirements
- preview/export diagnostics

The graph should keep final interpretation distinct from earlier material and
behaviour stages even if a backend combines them into one command or shader
pipeline.

## FFmpeg Boundary

The FFmpeg compiler may lower supported interpretation nodes into deterministic
filters, pass plans, or encode settings.

It must not decide aesthetic meaning from FFmpeg filter availability. If a
required material, atmosphere, LUT, or output transform is unsupported, planning
should fail clearly or use a documented deterministic fallback.

## WebGPU Boundary

WebGPU preview may lower supported interpretation nodes into GPU pipelines,
textures, samplers, shaders, or presentation transforms.

Preview must report unsupported features and approximations. It should not be
treated as authoritative color proof unless a node declares an explicit parity
contract.

## Diagnostics

Diagnostics should explain:

- missing LUT or texture asset
- unversioned interpretation asset
- unsupported material pass
- unsupported atmosphere pass
- unsupported blend or mask needed by look
- preview-only approximation
- export backend incompatibility
- color or pixel format mismatch
- missing seed
- cache invalidation cause
- licensing or provenance gap

Diagnostics should speak in composition concepts first and backend details
second.

## Non-Goals

This document does not introduce:

- runtime code
- schema changes
- LUT file format implementation
- color science policy
- shader implementation
- a visual design system
- automatic style transfer
- generic filter marketplace semantics

## V1 Minimum Shape

An aesthetic interpretation feature should be able to answer:

- Which part of identity comes from behaviour, material, atmosphere, or final
  interpretation?
- Which stage owns the operation?
- Which assets and versions are referenced?
- Which modulation or entropy routes affect it?
- Which seeds are required?
- Which backend capabilities are required?
- Which preview approximations are allowed?
- How does final export remain deterministic?
- How is the result diagnosed when unsupported?

If it cannot answer these questions, it is not ready for implementation.
