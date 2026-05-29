# Field Generators

Field generators are declarative sources for spatial fields. They describe what field data should exist, what inputs it depends on, and what runtime capabilities would be required to produce it. They do not execute shader code, allocate textures, fetch live data, or extend the renderer.

## Contract Split

Afterimage keeps the spatial runtime split into three contracts:

- **Generators** declare field sources such as clip luma, seeded drift, or captured external feeds. A generator manifest has a stable id, kind, inputs, outputs, scope, cost class, determinism mode, capture policy, required capabilities, and cache identity inputs.
- **Behaviours** update or persist field state. Spatial field declarations carry persistence policy, previous-frame access, accumulation or decay policy, replay identity, and storage intent without binding to a GPU implementation.
- **Consumers** sample fields from render or effect contracts. Field samplers attach to scalar filter parameters with sample mode, blend mode, channels, fallback scalar value, and capability diagnostics.

This lets authoring, validation, and planning agree on field intent before any runtime backend exists.

## Why This Is Not A Shader Graph

Field generators are intentionally narrower than a general plugin or shader graph. A manifest identifies a known generator kind and its deterministic inputs; it does not contain arbitrary code, shader source, node evaluation rules, UI extensions, or renderer-specific allocation instructions.

That constraint keeps exports reproducible. Live or network-backed inputs must use a capture policy and cache identity that make replay explicit. If an external input is not captured or baked, the render graph can still represent the requirement and surface diagnostics, but deterministic export must not depend on the live feed.

## Render Planning

The FFmpeg render graph planner represents generator manifests as placeholder nodes. It adds backend requirements, cache identity inputs, and diagnostics such as `field-generator-placeholder`, but it does not execute field generation. Field consumers are represented as `field-consumer` nodes and retain scalar fallback values so existing filter compilation remains backward-compatible.

GPU-backed textures, motion flow generation, and inspector UI can build on these contracts later without changing the authored project model.
