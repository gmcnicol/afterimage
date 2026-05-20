# UX Model

## Purpose

This document defines the primary interaction model for Afterimage.

Afterimage should feel like an audiovisual instrument and observatory, not a
traditional non-linear editor. Users compose worlds, steer behaviours, perform
state changes, and capture the resulting traversal.

## Interaction Principles

- Control, but not too controlled.
- Macro gestures over parameter micromanagement.
- Behavioural steering over exact frame editing.
- Scenes are climates.
- Performance and emergence are first-class.
- Deterministic replay remains visible and trustworthy.

`docs/architecture/STUDIO_UX_INTERACTION_SYSTEM.md` defines the durable v1 UX
laws, primitive control library, Penpot component contract, workspace
wireframes, and review criteria that extend these principles.

## Primary Workflows

The core workflows are gathering archive material, shaping a world, defining
scenes and climates, connecting behaviours and modulation, rehearsing
performance gestures, capturing a traversal, reviewing the capture, and
exporting deterministic artifacts.

The UI should keep the user near the world. Panels, inspectors, and lists exist
to support the world surface, not replace it.

## Composition Workflow

Composition begins by creating a world from sources, archive fragments,
materials, and behavioural intent.

The user should be able to add source material, group material into scenes,
define layer contribution and influence, connect motifs and atmosphere
metadata, assign aesthetic packs, set initial world pressure, and preview
deterministic render intent.

The composition surface should favor spatial relationship, influence, and
atmosphere over timeline bookkeeping.

## Scene Workflow

A scene is edited as a climate.

Scene controls should expose atmosphere, energy, instability, density, memory,
erosion, transition behaviour, active motifs, active materials, and active
behavioural systems.

Scenes may contain clip references, but the user should feel they are tuning a
condition rather than filling a bin.

## Performance Workflow

Performance is a focused mode.

It should prioritize full-canvas output, macro controls, controller feedback,
scene changes, entropy steering, capture state, and clear recovery from
overload or failure.

Performance mode should hide authoring clutter. It should reveal only the
controls needed to steer the world and understand current state.

## Capture And Export Workflow

Capture records performance gestures, scene changes, modulation changes,
behaviour seeds, and relevant runtime state.

Export resolves the capture log, project state, archive sidecars, render
target, toolchain identity, and render graph plan.

The user should always know whether they are watching a live state, captured
state, preview render, or final deterministic export.

## Behavioural Interaction

Behavioural controls should use meaningful language such as pressure, cohesion,
drift, memory, instability, density, corrosion, bloom, and recovery.

Avoid exposing backend mechanics as primary controls. FFmpeg filters, shader
uniforms, and worker commands are implementation details.

## Controller Interaction

Controllers map to intents, not widgets.

Good mappings include scene pressure, entropy injection, transition bias, layer
emergence, field strength, material intensity, capture trigger, and world
recovery.

Controller feedback should make state legible without requiring the user to
look away from the world.

## Canvas Strategy

The canvas is an authoring surface.

It may show scene zones, layer relationships, archive fragments, modulation
routes, behavioural influence fields, capture points, and render boundaries.

It must not become arbitrary node spaghetti. The canvas expresses intent and
relationships. The engine owns execution.

## Timeline Strategy

The timeline is a support surface, not the product metaphor.

It should show sequence duration, source placement, transitions, capture
events, music cues, scene changes, and export range.

It should not encourage frame-by-frame micromanagement as the default creative
mode.

## Layer Stack Interaction

The layer stack should expose contribution and influence.

Each layer should make clear its source, role, blend intent, mask or field
participation, scene membership, modulation status, and render pass cost.

Layer controls should stay compact and scannable. Deep tuning belongs in the
inspector.

## Inspector System

The inspector reveals detail progressively.

It should support semantic fields first, advanced backend details second,
validation warnings, deterministic export implications, controller binding
status, and archive provenance.

The inspector should avoid parameter soup. Related controls should be grouped
around the user goal they serve.

## Empty, Loading, And Failure States

Empty states should create work directly: import archive material, create a
scene, add a behaviour, bind a controller, or start capture.

Loading states should say what kind of work is happening: probing media,
analyzing audio, planning render graph, rendering preview, or exporting a final
artifact.

Failure states should include recovery action and preserve authored intent.
