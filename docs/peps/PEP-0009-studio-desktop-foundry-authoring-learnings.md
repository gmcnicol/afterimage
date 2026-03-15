# PEP-0009: Studio Desktop Foundry Authoring Learnings

## Status
Draft

## Summary
This session confirmed that the Studio workflow gets dramatically better when foundry outputs are treated as explicit authored assets, sequence building is bounded by music duration, and rebuilds generate spaced variation instead of repeating the same deterministic cut list.

## Context
We integrated curated foundry masks and overlays into Studio, built random mask and overlay assignment, added sequence build modes, tightened preview and export behavior, and iterated on the desktop authoring workflow while using real project media.

## Problem
Several assumptions turned out wrong. Treating overlays like transition assets confused the model and the UI. Chroma-aware overlay blending tinted previews pink. Sequence builds could poison themselves by saving short duration targets back into the variant, which then produced static holds and overhanging clip lists. Deterministic rebuilds looked like no-ops because the current sequence often regenerated identically.

## Decision
Keep foundry outputs asset-backed and split by explicit roles: masks drive reveal, overlays are independent clip layers. Clamp built sequences to the music duration, and make rebuilds advance through a seeded blue-noise style sampler so each rebuild meaningfully mutates the current sequence without bunching favorites together.

## Pitfall to Avoid
Do not let renderer, builder, and UI semantics drift apart. If the engine trims to music, the sequence list must also stop at music. If an action says rebuild, it must visibly mutate the current sequence. If overlays are luma textures, never blend them into chroma planes.

## Success to Continue
Curating foundry outputs first, then wiring them into the app as explicit masks and overlays, worked extremely well. Real user review with fast iteration exposed the right problems quickly: viewer instability, pink chroma contamination, short self-poisoning builds, misleading labels, and deterministic rebuilds that felt dead.

## Action
Keep pushing the same workflow: curate assets outside the app, treat masks and overlays as different things, prefer explicit sequence semantics in the UI, and add controls that make the builder and exporter operate on the selected sequence in a way that is obvious from the interface.
