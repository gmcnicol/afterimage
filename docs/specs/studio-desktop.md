# Studio Desktop App Specification
## Afterimage — Phase 2

## 1. Purpose

Build the **Studio Desktop** product: a desktop application for **offline authoring, sequencing, styling, and high-quality rendering** of short-form and long-form video outputs.

This product is for:

- taking source media and optional music/audio
- analysing source media
- generating candidate cuts
- sequencing clips manually and semi-automatically
- applying filter stacks and automation
- rendering deterministic high-quality outputs for:
  - YouTube landscape videos
  - Shorts / Reels / TikTok style portrait videos
  - square social variants
  - archived masters

This is an **offline product**. It is not the live/gigging product and it is not the headless appliance.

---

## 2. Product Identity

Studio Desktop is the **authoring and render environment**.

It must feel like:

- fast
- keyboard-friendly
- deterministic
- visually efficient
- low-clutter
- made for short atmospheric edits and stylised montage work

It must **not** feel like a bloated general-purpose NLE.

---

## 3. Phase Boundary

This phase depends on **Phase 1 Core Engine** being present.

Studio Desktop must consume shared core libraries and contracts from Phase 1, including:

- project/session schema
- preset schema
- sequence schema
- analysis schema
- MIDI mapping schema
- FFmpeg toolchain wrapper
- FFmpeg command compiler
- shared logging and error model
- shared preset/filter definitions
- shared binary discovery and health checks

Studio Desktop must not implement its own ad hoc versions of those concerns.

---

## 4. Goals

### Primary goals

1. Import media into a project.
2. Analyse media with the shared engine.
3. Detect candidate cuts from long clips.
4. Present cuts in a visually efficient browser.
5. Build a timeline/sequence from cuts.
6. Sync sequence work to an optional music track.
7. Apply stylised filter stacks and automation.
8. Render deterministic, repeatable outputs.
9. Save and reopen projects without data loss.
10. Support variants and alternate cuts cleanly.

### Secondary goals

1. Batch generate multiple aspect-ratio outputs from one sequence.
2. Duplicate project variants with different seeds or presets.
3. Support safe randomisation constrained by preset family rules.
4. Record authoring-time MIDI as structured automation/edit intent.

---

## 5. Non-Goals

Studio Desktop must not include:

- live low-latency performance mode
- projector mode
- Twitch/live streaming mode
- headless runtime behaviour
- Pi appliance boot/runtime behaviour
- collaborative multi-user editing
- cloud sync
- plugin architecture
- arbitrary third-party script execution
- direct unmanaged shell-outs to FFmpeg from UI code
- general-purpose frame-accurate pro editing parity with Premiere/Resolve

This phase is about **atmospheric authoring and rendering**, not becoming a full broadcast editor.

---

## 6. Platform and Stack

### Target platforms

- macOS arm64
- macOS x64
- Windows x64
- Linux x64
- Linux arm64 where practical, but desktop priority is macOS/Windows/Linux x64

### Required stack

- Electron
- React
- TypeScript
- Vite
- shared monorepo packages from Phase 1

### Required architecture rule

All FFmpeg-family execution must go through the shared core toolchain layer.

No Studio Desktop feature may directly spawn `ffmpeg`, `ffprobe`, or `ffplay` without going through the shared runner/compiler abstraction.

---

## 7. Core User Outcomes

The user must be able to do the following end-to-end:

1. Create a new project.
2. Import long clips, short clips, stills, and an optional music track.
3. Run analysis.
4. Review scene/cut candidates and thumbnails.
5. Reject, keep, favorite, and tag candidate cuts.
6. Build a sequence manually or from assisted sequencing tools.
7. Apply a preset stack and tweak it.
8. Add automation, including MIDI-recorded automation where available.
9. Preview the sequence accurately enough for authoring decisions.
10. Export multiple final outputs from one project deterministically.

---

## 8. UX Principles

### 8.1 General

The interface must be:

- one-window
- panel-based
- keyboard-first
- low-friction
- dark UI by default
- visually restrained
- dense enough for speed, not clutter

### 8.2 Core UX rules

1. Common actions must be available without modal overload.
2. Expensive operations must be explicit and cancellable.
3. The user must always know:
   - what project is open
   - whether analysis is complete/in progress/failed
   - whether a sequence is dirty
   - whether a render is queued/running/failed/completed
4. Preview and render state must be clearly separated.
5. Temporary randomness must never silently mutate saved project state.
6. Deterministic render settings must be visible and preserved.

### 8.3 Performance UX rules

1. Large projects must remain navigable.
2. Thumbnail browsing must not freeze the UI.
3. Preview degradation is acceptable if clearly labelled and never confused with final render quality.
4. Background analysis and rendering must be cancellable.
5. The app must recover gracefully from a failed analysis or render process.

---

## 9. Major Product Areas

Studio Desktop consists of these major areas:

1. Project management
2. Media library
3. Analysis and cut discovery
4. Cut review/binning
5. Sequence/timeline authoring
6. Music sync
7. Filter stack authoring
8. Automation authoring
9. Preview
10. Export/render
11. Variant management
12. Diagnostics/logs

---

## 10. Main Screens and Views

## 10.1 App Shell

Persistent shell areas:

- top command/header bar
- left navigation rail or compact module switcher
- central work area
- right inspector panel
- bottom transport/status panel

### Required shell modules

- Project
- Media
- Analysis
- Sequence
- Style
- Export
- Diagnostics

These may be tabs, top-level routes, or segmented views, but the structure must remain stable.

---

## 10.2 Project Home View

Purpose:

- create project
- open project
- show recent projects
- import initial media
- show project metadata and output presets

Must include:

- project name
- project location
- creation date
- last saved
- current output profile set
- current media counts
- analysis status summary
- sequence duration summary

Actions:

- new project
- open project
- save
- save as
- duplicate project
- reveal project folder
- import media
- import music track

---

## 10.3 Media Library View

Purpose:

- manage source assets

Media types:

- long video clips
- short video clips
- still images
- audio/music tracks

Required fields per asset:

- id
- filename
- media type
- duration if applicable
- dimensions
- framerate if applicable
- audio presence
- import status
- analysis status
- tags
- notes

Required actions:

- import
- remove from project
- relink missing file
- preview asset
- mark for analysis
- mark excluded
- tag assets
- filter/search assets

Required sorting/filtering:

- by filename
- by duration
- by type
- by analysis status
- by tag
- by favorite
- by import order

---

## 10.4 Analysis View

Purpose:

- configure and run analysis
- inspect analysis outputs

Required analysis capabilities in this phase:

- scene detection
- thumbnail extraction
- basic luma/brightness summary
- basic motion/activity summary
- audio waveform summary for imported music
- cut candidate generation from source media

The analysis view must show:

- assets selected for analysis
- analysis preset/config used
- queued/running/completed/failed state
- scene/cut markers
- summary counts
- logs/errors per asset

Required actions:

- run analysis
- rerun analysis
- cancel analysis
- clear stale analysis results
- inspect analysis details for selected asset

### Rule

Analysis outputs must be saved as structured project data or sidecar data consistent with the shared schema model.

---

## 10.5 Cut Browser View

Purpose:

- browse and curate candidate cuts produced from analysis

Each cut card must show:

- thumbnail
- source asset name
- start time
- end time
- duration
- scene score if available
- motion/activity summary if available
- luma summary if available
- tags
- status: new / kept / rejected / favorite

Required cut actions:

- keep
- reject
- favorite
- tag
- add note
- preview cut
- add to sequence
- add to bin
- duplicate cut
- trim cut boundaries
- merge adjacent cuts if supported by source continuity

Required filtering:

- kept only
- rejected only
- favorites only
- by source asset
- by tag
- by duration range
- by scene score range
- by motion range
- by brightness range

---

## 10.6 Sequence View

Purpose:

- build the final authored edit

This is the primary creative workspace.

The sequence view must include:

- sequence timeline strip
- clip blocks
- playhead
- zoom controls
- in/out markers
- optional beat markers if music track present
- section markers
- selected clip inspector

Required clip operations:

- add clip from cut browser
- reorder clips
- duplicate clip
- delete clip
- trim start/end
- split clip
- nudge clip boundaries
- replace clip with another cut
- set transition style
- set per-clip filter overrides
- set per-clip notes/tags

Required sequence operations:

- create sequence
- rename sequence
- duplicate sequence
- mark sequence as favorite
- create sequence variant
- generate sequence from assisted mode
- lock sequence
- compare sequence variants

### Determinism rule

A saved sequence must be stable and reproducible.

Any seeded/random-assisted generation must store:

- seed
- preset family
- generation strategy
- parameters used

So the same sequence can be regenerated or understood later.

---

## 10.7 Music Sync View

Purpose:

- align sequence work to a track of music or audio

Required capabilities:

- import one primary music track
- waveform display
- playhead sync with timeline
- markers
- section markers
- beat grid support if available
- manual marker placement
- snap clips to markers and beat grid

Required actions:

- add marker
- add section
- rename marker/section
- snap clip edges to marker
- snap clip start to beat
- set sequence chapter points
- align transition moments to track structure

### Phase scope note

Automatic beat detection may be basic in this phase.
Manual authoring must remain first-class.

---

## 10.8 Style View

Purpose:

- author filter stacks and visual treatment

The style view must support:

- stack-based filter composition
- preset family application
- per-sequence stack
- per-clip overrides
- parameter editing
- mix control
- seed control where relevant
- safe randomisation

Required preset families at minimum:

- VHS
- Liminal
- Imagined Futures
- Glitch

Required stack item model:

- filter id/type
- enabled flag
- order index
- parameter set
- mix
- optional seed
- optional automation bindings

Required actions:

- add filter
- remove filter
- reorder filter
- enable/disable filter
- duplicate filter
- save stack preset
- load stack preset
- reset filter
- randomise filter safely
- randomise stack safely
- compare before/after

### Rule

Safe randomisation must use constrained ranges defined by preset/filter rules.
It must not generate unusable garbage by default.

---

## 10.9 Automation View

Purpose:

- author temporal change over visual parameters

Automation sources in this phase:

- timeline-authored keyframes/curves
- section-based parameter changes
- optional recorded MIDI for offline authoring intent

Required automation targets:

- filter mix
- saturation/desaturation
- blur amount
- bloom amount
- chroma offset
- glitch intensity
- dropout intensity
- ghost/trail intensity
- contrast
- brightness/tint parameters as defined by shared filter model

Required actions:

- add automation lane
- add keyframe
- move keyframe
- delete keyframe
- flatten/reset lane
- record MIDI input into automation where supported
- quantize automation timing where applicable
- bind automation target to filter parameter

### Rule

Recorded MIDI in Studio Desktop is an authoring input, not live runtime behaviour.
Recorded MIDI must become deterministic stored automation/edit intent.

---

## 10.10 Preview View / Preview Mode

Purpose:

- provide responsive authoring preview

The preview system may use lower-quality or proxy paths, but it must:

- clearly indicate preview quality mode
- preserve timing fidelity as much as practical
- preserve enough visual accuracy for creative decisions
- support playback of sequence with current stack and automation
- support clip/stack bypass comparisons

Required preview controls:

- play/pause
- stop
- step frame if practical
- jump to clip
- loop selection
- preview selected clip
- preview full sequence
- bypass selected filter
- bypass full stack
- compare variant A/B

### Rule

Preview output must never be silently mistaken for final render output.

---

## 10.11 Export View

Purpose:

- produce final outputs

Required export profiles:

- Landscape master
- Portrait short-form
- Square social
- Archive/intermediate master

Each profile must define:

- resolution
- aspect ratio
- fps
- codec/container
- bitrate/quality mode
- audio handling
- file naming rule

Required export actions:

- export current sequence
- export selected variant
- export multiple profiles
- export to chosen folder
- cancel export
- retry failed export
- reveal output folder

Required render feedback:

- queued/running/completed/failed
- elapsed time
- progress estimate if practical
- target output
- log access
- error summary

### Determinism rule

A render must be reproducible from project state and selected export profile.

---

## 10.12 Diagnostics View

Purpose:

- expose operational information without polluting creative workflows

Must include:

- FFmpeg toolchain health
- binary versions
- project warnings
- missing media
- analysis errors
- render errors
- log viewer
- last command summaries
- environment summary

This is a support/debugging view, not the normal user workspace.

---

## 11. Required Workflows

## 11.1 New Project Workflow

1. Create new project.
2. Select project folder.
3. Import media.
4. Import optional music track.
5. Save project.
6. Offer analysis step.

## 11.2 Analysis Workflow

1. Select assets.
2. Run analysis.
3. Generate cut candidates.
4. Review candidate pool.
5. Keep/reject/favorite cuts.

## 11.3 Authoring Workflow

1. Build sequence from cuts.
2. Add markers against music.
3. Refine timing.
4. Apply style stack.
5. Add automation.
6. Preview.
7. Duplicate variant if needed.

## 11.4 Export Workflow

1. Choose sequence and variant.
2. Choose output profile(s).
3. Confirm output path.
4. Render.
5. Review result and logs.
6. Re-render if needed.

---

## 12. Assisted Sequencing

Studio Desktop must support assisted sequencing, but it must remain controllable.

Required assisted modes:

- chronological assembly
- marker/section-aware assembly
- motif grouping by tag/bin
- constrained seeded generation from kept cuts

Assisted sequencing must always expose:

- source pool
- strategy used
- seed if applicable
- duration target
- any exclusion rules

Assisted sequencing must never overwrite the current sequence without explicit confirmation.

---

## 13. Data Model Requirements

Studio Desktop must use the shared schemas from Phase 1.

At minimum, it must operate with these logical entities:

- Project
- MediaAsset
- AnalysisResult
- CutCandidate
- Bin
- Sequence
- SequenceClip
- Marker
- Section
- FilterStack
- FilterInstance
- AutomationLane
- ExportProfile
- RenderJob
- Variant
- MIDIRecording or MIDIIntent

### Required persistence properties

- saveable
- reloadable
- schema-validatable
- versioned
- migration-aware

Project files must not depend on hidden transient in-memory state to render correctly.

---

## 14. App-State Rules

### 14.1 State categories

State must be separated into:

- persisted project state
- transient UI state
- background job state
- diagnostics state

### 14.2 Persistence rules

Persist:

- project structure
- sequence
- bins
- markers
- filter stacks
- automation
- selected export profiles
- saved seeds
- notes/tags

Do not persist unless explicitly intended:

- temporary panel layout tweaks
- transient preview cache
- ephemeral hover/selection state
- in-progress drag state

---

## 15. Background Job Model

Studio Desktop requires a background job system for:

- media analysis
- thumbnail generation
- proxy generation if used
- export rendering

Each job must support:

- id
- type
- target
- status
- started at
- ended at
- progress if available
- log output
- cancel action
- retry action where valid

UI must never block on long-running jobs.

---

## 16. Error Handling Rules

Studio Desktop must fail clearly and recoverably.

Required error classes:

- missing media
- invalid project file
- schema validation failure
- analysis failure
- render failure
- unsupported media
- toolchain unavailable
- output path failure
- permission failure

Required behaviour:

- concise user-facing summary
- optional expanded technical details
- retain logs
- preserve unsaved project state where possible
- allow retry where meaningful

Silent failure is unacceptable.

---

## 17. Keyboard-First Requirements

Required keyboard actions at minimum:

- `Cmd/Ctrl+N` new project
- `Cmd/Ctrl+O` open project
- `Cmd/Ctrl+S` save
- `Space` play/pause
- `J` previous cut/marker
- `K` pause
- `L` next cut/marker
- `[` set in or trim start for selection
- `]` set out or trim end for selection
- `Delete/Backspace` remove selected item
- `Cmd/Ctrl+D` duplicate selected clip/sequence/filter
- `A` add selected cut to sequence
- `F` favorite selected cut
- `R` safe-randomise selected filter
- `Shift+R` safe-randomise stack
- `B` bypass selected filter
- `Shift+B` bypass full stack
- `Cmd/Ctrl+Enter` export current sequence

Exact bindings may evolve, but keyboard-first support is mandatory.

---

## 18. Visual Design Rules

1. Dark theme first.
2. Functional contrast.
3. Avoid novelty chrome.
4. Thumbnail-first where browsing cuts.
5. Timeline clarity over ornament.
6. Inspector panel must be compact and stable.
7. Filter controls must emphasise the most important parameters first.
8. Advanced controls must be collapsible.
9. Avoid large empty decorative areas.

---

## 19. Performance Requirements

### Minimum expectations

- importing media must not freeze the UI
- browsing hundreds of cuts must remain usable
- analysis must be backgrounded
- rendering must be backgrounded
- preview must degrade gracefully if necessary
- project save/load must be reliable for medium-sized projects

### Phase 2 performance priorities

Priority order:

1. correctness
2. determinism
3. responsiveness
4. throughput
5. polish

Do not sacrifice correctness and determinism for flashy preview behaviour.

---

## 20. File and Directory Behaviour

Studio Desktop must support project folders containing:

- project file
- internal metadata
- analysis sidecars if used
- thumbnails/proxies/cache if used
- export outputs if configured locally

The app must not assume all source media lives inside the project folder.
It must support referenced media with relink capability.

---

## 21. Required Integration Boundaries

Studio Desktop must depend on shared packages/modules for:

- project model
- schema validation
- FFmpeg runner/compiler
- media analysis logic where shared
- preset/filter definitions
- MIDI mapping logic
- export profile model

Studio-specific code should own:

- desktop shell
- UI screens
- interaction workflows
- authoring view models
- project orchestration in the desktop context

---

## 22. Feature Flags and Scope Control

If a capability is risky or incomplete, gate it behind a feature flag rather than contaminating the entire workflow.

Candidates for feature flags in this phase:

- recorded MIDI automation
- advanced beat detection
- proxy generation strategies
- advanced assisted sequencing
- complex transition types

Feature flags must not undermine core project file stability.

---

## 23. Testing Requirements

### Unit tests

Must cover:

- project state operations
- sequence editing operations
- filter stack state logic
- export profile selection logic
- schema validation
- deterministic seed handling

### Integration tests

Must cover:

- import media
- run analysis
- create cut candidates
- add cuts to sequence
- save/reload project
- apply filter stack
- launch render job

### Manual acceptance testing

Must cover:

- new project flow
- missing media relink flow
- analysis rerun flow
- failed render recovery
- multi-profile export
- sequence variant workflow

---

## 24. Accessibility and Usability Baseline

This is not an accessibility-heavy phase, but it must still support:

- visible focus states
- keyboard navigation for major workflows
- non-color-only status indicators
- scalable text/UI where practical
- readable error messages

---

## 25. Security and Safety Rules

Studio Desktop must not:

- execute arbitrary project-embedded scripts
- trust arbitrary external binaries
- write outside chosen export/project paths without explicit user action
- mutate source media files
- silently upload data anywhere

Source media must be treated as read-only.

---

## 26. Logging and Telemetry Rules

This phase should implement local diagnostic logging only.

No remote telemetry is required.

Logs should include:

- analysis job start/stop
- render job start/stop
- tool invocation summaries
- major project load/save events
- errors and warnings

Logs must be accessible via Diagnostics.

---

## 27. PEP / Learning Capture Requirement

Codex must treat this phase as governed by the repository learning-note process.

At the end of each meaningful completed task in Studio Desktop work, Codex must do exactly one of:

1. create a new short PEP
2. update an existing short PEP
3. record "no new learnings"

Codex must create or update a PEP when it discovers:

- a pitfall to avoid
- a portability issue
- a successful pattern worth repeating
- a permanent design rule
- a packaging/runtime constraint
- a false start that should not be retried
- a measurable performance win or issue

PEPs must be short and operational.

---

## 28. Explicit Out-of-Scope Items for Studio Desktop

Do not implement in this phase:

- live projector output as primary workflow
- low-latency live modulation engine
- multi-destination streaming runtime
- Pi appliance service management
- appliance boot-to-broadcast behaviour
- remote control protocol for headless box
- show-control/installation runtime

Those belong to later phases.

---

## 29. Acceptance Criteria

Studio Desktop phase is complete when all of the following are true:

1. A user can create and save a project.
2. A user can import media and a music track.
3. A user can run analysis on imported media.
4. A user can browse and curate generated cut candidates.
5. A user can build and edit a sequence.
6. A user can align sequence work to music markers.
7. A user can apply and edit a filter stack.
8. A user can author basic automation.
9. A user can preview the sequence sufficiently for authoring.
10. A user can export deterministic outputs for at least:
    - landscape
    - portrait
    - square
11. A user can save, close, and reopen the project without losing core authored state.
12. Errors in analysis and render are surfaced clearly.
13. The app uses the shared Phase 1 FFmpeg/core abstractions rather than per-app shell-outs.
14. Codex has maintained PEP learning capture during implementation.

---

## 30. Recommended Internal Module Breakdown

Suggested Studio Desktop feature modules:

- `project-shell`
- `media-library`
- `analysis-orchestrator`
- `cut-browser`
- `sequence-editor`
- `music-sync`
- `style-editor`
- `automation-editor`
- `preview-controller`
- `export-manager`
- `diagnostics-panel`

Suggested service modules:

- `project-service`
- `analysis-service`
- `sequence-service`
- `render-service`
- `preset-service`
- `toolchain-service`

---

## 31. Implementation Order Inside Phase 2

Recommended order:

1. app shell and project open/save
2. media library import and listing
3. analysis orchestration and results display
4. cut browser and cut curation
5. sequence editor basics
6. music track and markers
7. style/filter stack editing
8. preview pipeline
9. export manager
10. automation editing
11. variants
12. diagnostics refinement

Do not start with advanced polish.
Get the full vertical slice working first.

---

## 32. Final Principle

Studio Desktop must optimise for this outcome:

**Take messy source footage and turn it into a deterministic, stylised, exportable finished piece quickly.**

That is the product.