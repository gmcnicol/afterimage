# PEP-0007: Shared Style and Automation Contracts

## Status
Accepted

## Context
Studio previously stored style and automation data, but the authoring surface, validation rules, and FFmpeg compiler were not using the same contract. That produced three failure modes:

- unsupported filter types could be authored and saved
- automation lanes could target properties the compiler did not execute
- preview and export could drift because automation was sampled at a single midpoint instead of being compiled across time

The result was a system that looked editable but was not trustworthy.

## Decision
Style and automation are now governed by one shared filter-definition contract in `@afterimage/project-model`.

The contract defines:

- the supported v1 filter set
- the supported parameter set for each filter
- default values and valid ranges
- the automation properties that can legally target each filter

The current supported v1 filter set is:

- `contrast`
- `brightness`
- `blur`
- `bloom-soft`
- `glitch-bands`
- `chroma-bleed`

Every filter supports `mix` plus its declared numeric parameters. Unsupported filter types and unsupported automation targets are integrity/schema failures, not best-effort runtime behavior.

Preview and export now share the same compiler path. For v1 automation execution, the render compiler uses deterministic piecewise clip segmentation at automation keyframe boundaries, then applies constant filter values per segment. This is intentionally simpler than animated FFmpeg expressions and is easier to reason about, test, and keep consistent.

## Consequences

### Positive
- Studio authoring can be constrained to what the compiler really supports.
- Invalid style/automation state is surfaced during validation and diagnostics.
- Preview/export parity is materially better because both use the same segmented render compilation.
- Presets, store ops, and the compiler all read from the same definition source.

### Negative
- The supported filter set is intentionally narrow in v1.
- Automation is piecewise constant per segment, not continuously animated.
- Adding a new renderable filter now requires touching the shared contract, tests, and compiler mapping deliberately.

## Follow-up
- Add richer diagnostics surfaces in Studio for style/automation-specific failures.
- Extend the contract for beat-driven and MIDI-driven automation once those execution semantics are intentionally implemented.
- Consider moving the filter-definition registry into its own shared package if more runtimes need it.
