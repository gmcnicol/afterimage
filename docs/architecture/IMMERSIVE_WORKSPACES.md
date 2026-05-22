# Immersive Workspaces

## Purpose

Afterimage should be organized around immersive creative workspaces rather than
a permanently visible workstation dashboard.

The product should feel like an instrument, observatory, world console, and
behavioural climate system.

It should not feel like a traditional non-linear editor, parameter dashboard,
graph spaghetti editor, or enterprise asset manager.

## Workspace Set

The primary workspaces are:

- Archive Space
- World Space
- Performance Space
- Observatory Space
- Capture Space

They are modes of attention, not isolated products.

`docs/architecture/STUDIO_UX_INTERACTION_SYSTEM.md` defines the v1 wireframes,
primitive controls, shared states, and cross-space navigation rules for these
workspaces.

## Archive Space

Archive Space is for discovering and selecting memory.

It supports motif exploration, atmosphere browsing, archive archaeology,
emotional tagging, texture discovery, provenance inspection, and recurrence
review.

The archive should feel like a memory reservoir, not a file browser.

## World Space

World Space is for composing the behavioural system.

It supports scene and world composition, layer contribution, behavioural
systems, spatial influence systems, material reservoirs, modulation
relationships, and aesthetic pack assignment.

This is the main authoring surface for scenes as climates.

## Performance Space

Performance Space is for steering.

It supports fullscreen or output-focused display, macro controls, entropy
steering, MIDI and OSC interaction, scene switching, live capture, and immediate
recovery controls.

Performance Space should hide authoring noise and prioritize state legibility.

## Observatory Space

Observatory Space makes the world understandable.

It supports world telemetry, entropy visibility, behavioural diagnostics,
modulation visibility, render graph warnings, atmospheric state visibility, and
archive recurrence signals.

Observatory Space should reveal why the world behaves as it does without
turning the main experience into a debug dashboard.

## Capture Space

Capture Space manages artifacts.

It supports deterministic replay, export management, capture history, render
review, artifact provenance, failed export recovery, and comparison between
live, preview, and final output.

Capture Space should make trust explicit. Users need to know what can be
reproduced.

## UX Laws

- Make the next action obvious.
- Keep interaction responsive; debounce noisy input and run expensive work
  asynchronously.
- Macro over micro.
- Progressive revelation.
- Atmosphere-first interaction.
- Emotional coherence.
- Avoid workstation fatigue.
- Avoid parameter soup.
- Avoid timeline-editor thinking.

## Navigation

Navigation should preserve context.

Switching spaces should keep selected project, selected world, selected scene,
capture state, active output target, and relevant selection where meaningful.

The user should never feel they are leaving the world to operate a different
application.
