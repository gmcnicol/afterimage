# Field Generators

Field generators are declarative sources for spatial fields. They describe what field data should exist, what inputs it depends on, and what runtime capabilities are required to produce it. They do not execute renderer code, fetch live data directly, or extend the renderer.

Studio presents those fields through an artist-facing behavioural vocabulary. The vocabulary is a UX layer over the existing Core contracts; it does not rename schema fields, project-model types, runtime reports, generator ids, or export diagnostics.

## Behavioural Vocabulary

The primary language for authoring and inspection is cinematic, atmospheric, tactile, and musical:

- **Drift**: directional movement and slow displacement.
- **Pressure**: push, pull, compression, or held force in the scene.
- **Corrosion**: brightness or texture eating into the image.
- **Instability**: unsettled, volatile, or noisy behaviour.
- **Memory**: accumulated state carried forward from earlier frames.
- **Contamination**: foreign influence leaking into an area.
- **Migration**: gradual relocation of a pattern or influence.
- **Viscosity**: resistance, thickness, or drag.
- **Turbulence**: active movement and disturbed motion.

Studio surfaces these words first in the Observatory field inspector and behaviour map. Raw field ids, generator ids, frame ids, storage mode, profile fit, dimensions, cost class, and diagnostics remain available in detail rows and backend detail blocks for debugging.

## Contract Split

Afterimage keeps the spatial runtime split into three contracts:

- **Generators** declare field sources such as clip luma, seeded drift, or captured external feeds. A generator manifest has a stable id, kind, inputs, outputs, scope, cost class, determinism mode, capture policy, required capabilities, and cache identity inputs.
- **Behaviours** update or persist field state. Spatial field declarations carry persistence policy, previous-frame access, accumulation or decay policy, replay identity, and storage intent without binding to a GPU implementation.
- **Consumers** sample fields from render or effect contracts. Field samplers attach to scalar filter parameters with sample mode, blend mode, channels, fallback scalar value, and capability diagnostics.

This lets authoring, validation, and planning agree on field intent before any runtime backend exists.

The contract language remains precise and low-level:

- **Generator id** identifies the field source manifest.
- **Storage mode** records the planned runtime backing store or fallback.
- **Frame id** records current and previous-frame identities.
- **Profile fit** records whether a runtime profile fits, degrades, or exceeds budgets.
- **Diagnostics** record planner and capability notes.

These terms are contract and runtime terms. They should not be the primary Studio control language unless the user has opened a diagnostic detail surface.

## Why This Is Not A Shader Graph

Field generators are intentionally narrower than a general plugin or renderer graph. A manifest identifies a known generator kind and its deterministic inputs; it does not contain arbitrary code, renderer source, node evaluation rules, UI extensions, or renderer-specific allocation instructions.

That constraint keeps exports reproducible. Live or network-backed inputs must use a capture policy and cache identity that make replay explicit. If an external input is not captured or baked, the render graph can still represent the requirement and surface diagnostics, but deterministic export must not depend on the live feed.

## Render Planning

The FFmpeg render graph planner represents generator manifests as placeholder nodes. It adds backend requirements, cache identity inputs, and diagnostics such as `field-generator-placeholder`, but it does not execute field generation. Field consumers are represented as `field-consumer` nodes and retain scalar fallback values so existing filter compilation remains backward-compatible.

Runtime field planning, motion and drift inspection, and the Studio Observatory field inspector now build on these contracts without changing the authored project model. Runtime reports can show planned storage, current and previous frame identities, profile fit, and diagnostics while the primary field controls use behavioural labels such as Field, Motion, Drift, and Balance.

Renderer-backed field execution and higher-quality motion extraction can continue to evolve behind the same contracts. Any future schema change should be additive and should preserve existing project, planner, and export semantics.
