# Studio UX Interaction System

## Purpose

This document defines the Afterimage v1 Studio UX interaction system.

It turns the existing workspace doctrine into durable UX laws, primitive
control contracts, Penpot-ready component specifications, and wireframe-level
layouts for Archive Space, World Space, Performance Space, Observatory Space,
and Capture Space.

This is a product architecture document. It does not implement React UI or
runtime behavior.

## Core Rule

Studio exposes world meaning. It does not define runtime meaning.

Every control, state, warning, workspace, and wireframe must map back to Core
contracts: composition, scene/layer hierarchy, modulation, entropy, archive,
capture, render graph, and backend capability semantics. UI state may help the
user inspect and perform. UI state must not become hidden composition state.

## Non-Negotiable UX Rules

### Make The Next Action Obvious

Every Studio space must make it really obvious what the user can or should do
next.

At any moment, the interface should expose:

- current workspace and mode
- current world, scene, capture, or artifact state
- one dominant valid primary action
- relevant secondary actions
- what happens after the primary action
- why any expected action is unavailable

If users need to infer the next step from layout, hidden logs, disabled buttons,
or institutional knowledge, the screen is not ready for implementation.

### Keep Interaction Responsive

Studio must feel responsive even when media, render planning, archive sidecars,
diagnostics, preview generation, and export work are busy.

UI interactions should update immediately where they affect local selection,
focus, navigation, toggles, disclosure, command intent, or temporary control
state. Expensive work should be asynchronous and report progress through jobs,
workers, Pico services, cached planning, or staged preview updates.

High-frequency interaction paths must be debounced, throttled, coalesced, or
scheduled as appropriate:

- search and filter inputs
- sliders and macro controls
- scrubbers and timeline movement
- controller or MIDI input
- preview invalidation
- diagnostics refresh
- resize and layout recalculation

The UI should show pending, running, complete, failed, canceled, and retryable
states when work leaves the immediate interaction path. The user should never
mistake background work for a frozen app.

## Current V1 Anchor

The current repository already defines:

- `FOUNDATIONS.md`: Afterimage is a behavioural audiovisual instrument, not a
  traditional editor.
- `docs/architecture/UX.md`: interaction principles, workflows, canvas,
  timeline, inspector, and failure-state doctrine.
- `docs/architecture/IMMERSIVE_WORKSPACES.md`: Archive, World, Performance,
  Observatory, and Capture spaces.
- `docs/architecture/COMPOSITION_MODEL.md`: composition owns meaning.
- `docs/architecture/SCENE_LAYER_HIERARCHY.md`: scenes are climates; layers are
  contribution and influence.
- `docs/architecture/MODULATION_MODEL.md`: controller and modulation routes map
  to semantic targets.
- `docs/architecture/DETERMINISTIC_CAPTURE.md`: users must distinguish live,
  captured, preview, and final export states.
- `docs/architecture/ARCHIVE_MOTIF_SYSTEM.md`: archive browsing becomes
  composition meaning only through explicit acceptance.

## UX Laws

### 1. Make The Next Action Obvious

Each space should make the primary next step unmistakable.

Rationale: Afterimage is an instrument for active composition and performance.
Unclear next steps break flow faster than imperfect visual styling.

Good examples:

- Archive Space highlights accepted candidates and the next action to send them
  to World Space
- World Space shows the selected scene, render readiness, and primary action to
  rehearse, capture, or resolve blockers
- Performance Space keeps capture arm, record, recovery, and scene activation
  states visible
- Capture Space makes replay, retry, export, and artifact review paths explicit

Anti-patterns:

- multiple competing primary buttons
- disabled actions with no reason
- empty states that only describe the problem
- screens that require reading logs to know what to do

### 2. Keep Interaction Responsive

Interaction stays immediate; work happens asynchronously.

Rationale: Studio must feel like a playable instrument and review surface, not
a blocking batch tool.

Good examples:

- debounced search and filters
- slider movement updates local intent immediately and schedules expensive
  preview work
- render planning, probing, preview generation, and export run through jobs
- progress, cancellation, retry, and completion states are visible
- navigation and inspection remain usable while background work runs

Anti-patterns:

- blocking the whole workspace while probing media
- recalculating expensive previews on every keypress or slider tick
- hiding queued work behind a spinner with no progress or recovery
- allowing rapid input to produce stale or out-of-order state

### 3. Keep The User Near The World

The main experience is the world surface, not a dashboard.

Rationale: Afterimage is a behavioural audiovisual instrument. Users should
feel they are shaping conditions and observing consequences.

Good examples:

- canvas remains central in World Space
- output remains dominant in Performance Space
- diagnostics explain the active world instead of replacing it

Anti-patterns:

- permanent all-purpose dashboard
- controls that bury the canvas
- route changes that feel like leaving the world

### 4. Macro Over Micro

Primary controls steer pressure, cohesion, entropy, memory, emergence,
transition bias, affinity, and recovery.

Rationale: The user should shape behavioural conditions before tuning raw
parameters.

Good examples:

- pressure dial
- entropy injector
- scene activator
- recovery trigger
- layer contribution control

Anti-patterns:

- raw filter parameter grid as the first surface
- unbounded sliders
- exposing shader uniforms or FFmpeg filter names as creative controls

### 5. Atmosphere First

Scenes are climates. Archive metadata, aesthetic packs, materials, and
behaviours should be presented through atmosphere and intent before files and
backend details.

Good examples:

- atmosphere dimensions before tag lists
- motif and recurrence review before file browsing
- material tendency before filter stack

Anti-patterns:

- enterprise asset-manager hierarchy
- clip bins as the primary model
- treating atmosphere as loose labels with no semantic mapping

### 6. Progressive Revelation

Show the smallest useful surface first, then let the user drill into detail.

Good examples:

- active warning chip expands into render graph details
- modulation route chip expands into source, mapping, and target
- provenance badge expands into sidecar, license, confidence, and generator

Anti-patterns:

- permanent raw debug console
- graph spaghetti editor
- inspector that exposes every field at once

### 7. Deterministic Trust Is Visible

The user must always know whether state is live, captured, preview, final,
unsupported, stale, or dirty.

Good examples:

- capture trust indicator
- preview approximation warning
- stale sidecar badge
- missing seed warning
- render target readiness

Anti-patterns:

- hiding export blockers in logs
- treating preview as final
- allowing uncaptured performance gestures to look replayable

### 8. Capture Is A First-Class State

Capture is a replayable traversal, not a video file.

Good examples:

- capture arm/record/replay states are visible in Performance Space
- Capture Space shows replay inputs and artifact provenance
- World Space warns when a change invalidates capture trust

Anti-patterns:

- video-file browser as Capture Space
- job queue status replacing semantic capture state
- failed export recovery hidden behind backend logs

### 9. Thin UI, Strong Meaning

The interface should be dense, legible, and purposeful. It should not become
ornamental, marketing-like, or bloated.

Good examples:

- compact status rail
- inspector groups by semantic purpose
- icon-first controls where the command is familiar
- stable dimensions for controls and counters

Anti-patterns:

- large decorative cards
- repeated explanatory copy inside the app
- controls that look important but do not map to Core state

### 10. Timeline Is Support, Not Metaphor

The timeline provides time, cues, scene changes, transitions, capture events,
and export ranges. It is not the product metaphor.

Good examples:

- compact cue/timeline strip under the world
- scene climate changes shown on the timeline
- capture events visible alongside cues

Anti-patterns:

- Premiere-like editing surface as the default experience
- frame-by-frame micromanagement as the primary workflow
- clip placement hiding scene climate

### 11. Warnings Are Product State

Unsupported, stale, approximate, missing, and non-deterministic states must be
visible in the relevant workspace.

Good examples:

- unsupported backend feature warning in World and Capture spaces
- stale sidecar warning in Archive and Capture spaces
- dropped event warning in Performance Space

Anti-patterns:

- warnings only in developer logs
- disabled controls with no reason
- silent fallbacks in final export

### 12. Context Moves Between Spaces

Switching spaces preserves project, world, scene, capture state, active output
target, and relevant selection.

Good examples:

- Archive selection opens in World Space as an accepted candidate
- Performance capture opens in Capture Space for replay
- Observatory drilldown returns to the same scene or layer in World Space

Anti-patterns:

- each workspace behaving like a separate application
- losing selection during navigation
- duplicated state that can drift

## Review Criteria

Future screens, components, and Penpot files should be reviewed against:

- Is it really obvious what the user should do next?
- Does it stay responsive while expensive work runs asynchronously?
- Are high-frequency interactions debounced, throttled, coalesced, or
  scheduled?
- Does it map to Core meaning?
- Is live/captured/preview/final state clear?
- Is the primary action obvious and valid?
- Does it avoid raw backend language as the first layer?
- Does it preserve deterministic trust?
- Does it reveal detail progressively?
- Does it keep the user near the world?
- Does it avoid dashboard, graph, asset-manager, or NLE defaults?
- Can replay/export-critical changes be captured?
- Are empty, loading, warning, unsupported, dirty, and failed states present?

## Primitive Control Library

Primitive controls are reusable semantic controls for Studio and Penpot.

Each primitive must define:

- semantic purpose
- valid scopes
- Core target
- input meaning
- output event or state
- capture/replay implication
- states
- compact and expanded forms where useful
- disabled and unsupported behavior
- warning behavior

### Shared States

All primitives should consider:

- default
- hover or focused
- active
- armed
- recording or capturing
- replaying
- warning
- unsupported
- disabled
- dirty or changed
- stale
- failed
- resolved

### Macro Dial

Purpose: steer a normalized semantic value such as pressure, cohesion, memory,
density, drift, or recovery.

Core target: scene, world, behaviour, field, material, or transition target.

Capture implication: if changed during performance and it affects replay, the
normalized value and route identity must be captured.

Avoid: exposing backend parameter names as the dial label.

### Pressure Meter

Purpose: show accumulated world, scene, transition, or material pressure.

Output: visual telemetry and optional threshold warning. It should not mutate
state unless paired with an explicit control.

Avoid: ambiguous decorative progress bars.

### Entropy Injector

Purpose: inject, release, or recover entropy.

Core target: entropy source and target from
`docs/architecture/ENTROPY_INTERACTION.md`.

States: idle, armed, injected, recovering, clamped, unsupported, uncaptured.

Avoid: randomize button semantics.

### Segmented Mode Control

Purpose: switch between explicit modes such as live, rehearse, capture, replay,
preview, final, author, inspect, or perform.

Capture implication: mode changes that affect replay or output must be
captured or stored as composition/capture state.

Avoid: hidden toggles with unclear downstream effects.

### Cue Trigger

Purpose: trigger a normalized cue, scene change, capture marker, recovery
event, or performance gesture.

States: idle, armed, triggered, cooling down, disabled, failed.

Avoid: trigger actions that cannot be replayed when they affect composition
meaning.

### Scene Activator

Purpose: activate, blend, hand off, or recover a scene climate.

Core target: stable scene ID and transition contract.

Capture implication: live activation must record scene ID, timing, event order,
and transition relationship.

Avoid: scene buttons that depend on UI order.

### Layer Contribution Control

Purpose: set layer emergence, mix, blend contribution, or influence.

Core target: stable layer ID and semantic contribution/influence target.

Avoid: raw opacity rows as the only layer model.

### Influence Field Control

Purpose: expose field strength, pressure wells, turbulence, drift,
convection, or diffusion at a semantic level.

States: visible, active, diagnostic, approximated, unsupported.

Avoid: direct source footage distortion as the default field metaphor.

### Modulation Route Chip

Purpose: show a source-to-target modulation route compactly.

Expanded view should reveal source, target, mapping, smoothing, conflict
policy, capture requirement, and seed where relevant.

Avoid: node spaghetti.

### Archive Provenance Badge

Purpose: reveal source, sidecar, rights, confidence, generator, and accepted
state for archive metadata.

States: candidate, accepted, rejected, stale, missing, low confidence,
conflicting.

Avoid: archive references without provenance.

### Capture Trust Indicator

Purpose: show whether the current state is replayable and exportable.

States: live only, captured, replaying, preview approximation, final-ready,
dirty, stale, invalid, failed.

Avoid: generic job status replacing deterministic trust.

### Warning Surface

Purpose: present unsupported, missing, stale, approximate, or non-deterministic
state.

Expanded view should identify affected scope, cause, severity, resolution, and
whether export is blocked.

Avoid: burying warnings in logs.

## Keyboard And Controller Expectations

Controls must map to semantic intents:

- scene pressure
- entropy injection
- recovery
- scene activation
- transition bias
- layer emergence
- field strength
- material intensity
- capture trigger
- replay control

Controller identity, normalized value, mapping identity, and capture replay
identity must be preserved when the control affects replay or export.

## Penpot Primitive Component Contract

The live Penpot workspace was not accessible from this session because Penpot
Cloudflare verification blocked API access. The following contract is the
repo-level source of truth for creating Penpot components once access is
available.

### Component Naming

Use this naming pattern:

```text
Afterimage / Primitive / <PrimitiveName> / <Variant> / <State>
```

Examples:

- `Afterimage / Primitive / Macro Dial / Compact / Active`
- `Afterimage / Primitive / Capture Trust / Expanded / Warning`
- `Afterimage / Primitive / Archive Provenance / Compact / Stale`

### Required Component Set

Penpot should contain reusable components for:

- Macro Dial
- Pressure Meter
- Entropy Injector
- Segmented Mode Control
- Cue Trigger
- Scene Activator
- Layer Contribution Control
- Influence Field Control
- Modulation Route Chip
- Archive Provenance Badge
- Capture Trust Indicator
- Warning Surface

### Required Variants

Where meaningful, each component should include:

- compact
- expanded
- horizontal
- vertical
- inspector
- performance
- disabled
- unsupported

### Required States

At minimum:

- default
- active
- armed
- recording or capturing
- replaying
- warning
- disabled
- unsupported
- dirty or changed
- stale
- failed

### Layout Constraints

Penpot components should be compact, dense, and reusable:

- fixed control heights where used in toolbars
- stable width tokens for chips and status controls
- no text overflow in compact variants
- icon-first where the action is familiar
- visible label in inspector and expanded variants
- warning and trust states use shape/text/icon together, not color alone
- no nested cards for repeated controls

### Tokens

Recommended token families:

- surface: base, raised, output, warning, disabled
- text: primary, secondary, muted, warning, success
- signal: capture, replay, preview, final, entropy, pressure, archive
- spacing: 4, 8, 12, 16, 24
- control height: 28 compact, 36 regular, 48 performance
- radius: 0 to 8px maximum unless a future design system overrides it

### Usage Examples

Archive Space should use Archive Provenance Badge, Modulation Route Chip,
Warning Surface, and Capture Trust Indicator.

World Space should use Macro Dial, Scene Activator, Layer Contribution Control,
Influence Field Control, Modulation Route Chip, Archive Provenance Badge, and
Warning Surface.

Performance Space should use Scene Activator, Entropy Injector, Macro Dial,
Cue Trigger, Capture Trust Indicator, and compact Warning Surface.

Observatory Space should use Pressure Meter, Modulation Route Chip, Warning
Surface, Archive Provenance Badge, and Capture Trust Indicator.

Capture Space should use Capture Trust Indicator, Segmented Mode Control,
Warning Surface, Archive Provenance Badge, and Cue Trigger for replay/export
actions.

## Workspace Wireframes

Wireframes describe structure and workflow, not final visual design.

The common shell should preserve:

- project identity
- selected world or composition
- selected scene/layer/archive/capture where meaningful
- global trust state
- active output target
- navigation between spaces

### World Space

Purpose: author behavioural worlds.

Primary tasks:

- shape scene climates
- organize layer contribution and influence
- accept archive references into world meaning
- connect modulation routes
- inspect behaviours and spatial systems
- check render/capture readiness

Layout:

```text
┌────────────────────────────────────────────────────────────────────┐
│ Space switcher | World title | trust | preview/export readiness    │
├───────────────┬───────────────────────────────────┬────────────────┤
│ Scene climates│ World canvas                      │ Inspector      │
│ + activators  │ - scene zones                     │ - selected     │
│               │ - layer influence                 │   scene/layer  │
│ Layers        │ - archive fragments               │ - modulation   │
│ contribution  │ - field overlays                  │ - archive refs │
│               │ - capture points                  │ - warnings     │
├───────────────┴───────────────────────────────────┴────────────────┤
│ cue/timeline support: sections, scene changes, capture events       │
└────────────────────────────────────────────────────────────────────┘
```

Required states:

- empty: create scene, import archive, add layer, add behaviour
- loading: planning render graph, probing media, loading sidecars
- unsupported: backend cannot preview required feature
- dirty: changes affect capture/export readiness
- warning: stale sidecar, missing seed, unsupported target

Navigation:

- Archive Space for source/memory discovery
- Performance Space for rehearsal and live steering
- Observatory Space for route/behaviour diagnostics
- Capture Space for replay/export review

### Observatory Space

Purpose: make the world understandable without becoming a debug console.

Primary tasks:

- inspect entropy and pressure
- inspect modulation routes and conflicts
- inspect behavioural/spatial systems
- inspect render graph warnings
- inspect archive recurrence and affinity
- inspect capture/export trust

Layout:

```text
┌────────────────────────────────────────────────────────────────────┐
│ Space switcher | Observatory | selected world | trust state        │
├───────────────────────────┬───────────────────────┬────────────────┤
│ Telemetry summary         │ Route/behaviour map    │ Detail drawer  │
│ - pressure                │ - modulation routes    │ - why changed │
│ - entropy                 │ - field influence      │ - source refs │
│ - cohesion/recovery       │ - render warnings      │ - resolution  │
├───────────────────────────┴───────────────────────┴────────────────┤
│ event strip: cues, captures, warnings, scene transitions            │
└────────────────────────────────────────────────────────────────────┘
```

Required states:

- no diagnostics: show current world state and explain that no blockers exist
- warning: unsupported backend, stale sidecar, missing seed
- non-deterministic: uncaptured event or unseeded source
- drilldown: semantic detail first, backend detail second

Diagnostic-only details must be labeled. Composition-affecting details must
link back to World Space.

### Performance Space

Purpose: steer live worlds.

Primary tasks:

- see output
- activate scenes
- steer pressure, entropy, cohesion, memory, and recovery
- use controller feedback
- arm and record capture
- recover from overload or failure

Layout:

```text
┌────────────────────────────────────────────────────────────────────┐
│ output target | live/capture trust | arm/record | recovery         │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│                         OUTPUT SURFACE                             │
│                                                                    │
├───────────────┬──────────────────────────────┬─────────────────────┤
│ Scene bank    │ Macro controls               │ Controller/capture  │
│ activators    │ pressure entropy memory      │ feedback + warnings │
└───────────────┴──────────────────────────────┴─────────────────────┘
```

Required states:

- rehearsal
- armed
- recording
- replaying
- uncaptured gesture warning
- overload or dropped preview warning
- recovery available
- unsupported control disabled with reason

Hidden from Performance Space:

- full layer editing
- raw graph editing
- detailed archive browsing
- backend filter parameters

### Archive Space

Purpose: discover and select memory.

Primary tasks:

- browse archive items as memory sources
- inspect segments
- explore motifs and atmospheres
- inspect provenance and confidence
- review recurrence and affinity
- accept archive references into World Space

Layout:

```text
┌────────────────────────────────────────────────────────────────────┐
│ Space switcher | Archive | source filter | import sidecar          │
├───────────────┬───────────────────────────────────┬────────────────┤
│ Memory index  │ Archive archaeology surface       │ Inspector      │
│ motifs        │ - segments timeline               │ provenance     │
│ atmospheres   │ - motif clusters                  │ confidence     │
│ recurrence    │ - atmosphere fields               │ recurrence     │
│ sidecars      │ - accepted candidates             │ accept/reject  │
└───────────────┴───────────────────────────────────┴────────────────┘
```

Required states:

- empty: import sidecar, analyze source, add manual curation
- loading: validating archive metadata
- stale sidecar
- missing source asset
- low confidence
- conflicting metadata
- candidate accepted into composition
- rejected candidate

Archive browsing must not mutate composition meaning without explicit
acceptance.

### Capture Space

Purpose: manage deterministic replay and export trust.

Primary tasks:

- review capture history
- replay captured traversal
- compare live, captured, preview, and final output states
- select render target
- inspect artifact provenance
- recover failed exports
- resolve stale dependencies

Layout:

```text
┌────────────────────────────────────────────────────────────────────┐
│ Space switcher | Capture | selected capture | deterministic trust  │
├───────────────┬───────────────────────────────────┬────────────────┤
│ Capture list  │ Replay / comparison surface       │ Export panel   │
│ history       │ live | captured | preview | final │ target         │
│ status        │ timeline + event log              │ provenance     │
│ artifacts     │ warnings over time                │ recovery       │
└───────────────┴───────────────────────────────────┴────────────────┘
```

Required states:

- no captures
- recording in progress
- replaying
- rendering preview
- final export queued
- final export complete
- failed export with recovery
- stale project or sidecar
- missing asset
- missing toolchain
- unsupported backend

Capture Space should show semantic state first: what can be replayed, what can
be exported, and what blocks trust. Backend logs are secondary diagnostics.

## Cross-Space State

Shared state across spaces:

- project
- composition/world
- selected scene
- selected layer
- selected archive reference
- active capture
- output target
- trust state
- warnings

Cross-space navigation examples:

- Archive accepted motif opens World Space with selected scene climate target.
- World warning opens Observatory Space with the relevant modulation route.
- Performance capture opens Capture Space at the new capture.
- Capture stale sidecar opens Archive Space at the missing sidecar.
- Observatory render warning opens Capture Space when it blocks export.

## Empty, Loading, Failure, And Unsupported Rules

Empty states should create work directly:

- import archive material
- create scene
- add behaviour
- bind controller
- start capture
- review failed export

Loading states should name the real work:

- validating sidecar
- probing media
- planning render graph
- rendering preview
- replaying capture
- exporting final artifact

Async work states should keep the surrounding workspace responsive:

- local selection and navigation remain interactive
- queued work is visible
- progress is visible when measurable
- cancellation or retry is available where safe
- stale results cannot overwrite newer user intent

Failure states should preserve authored intent and provide recovery:

- retry
- repair missing reference
- remove unsupported candidate
- switch backend
- mark preview-only approximation
- truncate or repair partial capture

Unsupported states should identify:

- affected scope
- missing capability
- whether preview is blocked
- whether final export is blocked
- suggested recovery

## Non-Goals

This document does not introduce:

- React implementation
- final visual design
- live Penpot edits
- runtime semantics
- new schemas
- controller protocol implementation
- render graph implementation

## V1 Minimum Shape

A Studio UX addition should be able to answer:

- Which workspace owns this moment?
- What should the user do next?
- Does the UI remain responsive while work runs?
- Which interactions need debounce, throttle, coalescing, or scheduling?
- Which Core contract does this control map to?
- Is the state live, captured, preview, or final?
- Is the action valid right now?
- What happens after the action?
- Can replay/export-critical changes be captured?
- What warning or unsupported state applies?
- Does this preserve context across spaces?
- Does it avoid parameter soup, graph spaghetti, NLE defaults, and asset
  manager defaults?

If it cannot answer these questions, it is not ready for implementation.
