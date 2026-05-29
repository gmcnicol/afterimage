# A Dummy's Guide To Using Afterimage

This guide starts after the app is open. It is about what to do in Studio, not
how to build or run the repo.

Afterimage is not a normal video editor. You are not just lining clips up on a
timeline. You are making a saved **Universe**: a project folder containing
media, analysis, composition choices, performance state, and output artifacts.

The first useful path is:

1. Create a Universe.
2. Import media.
3. Review cuts.
4. Build a sequence.
5. Shape the look.
6. Preview the performance.
7. Forge an output.

## The Big Map

Studio is split into workspaces:

- **Universe**: create, open, autosave, and inspect the project.
- **Archive**: review remembered source material and sidecars.
- **Media**: import source files, music, transitions, and overlays.
- **Catalogue**: browse reusable material from library scans.
- **World**: author composition structure, scenes, layers, modulation, and
  render intent.
- **Cuts**: review suggested clips and decide what to keep.
- **Sequence**: assemble clips into a traversal.
- **Music Sync**: manage soundtrack cues and timing.
- **Style**: apply presets and edit filter stacks.
- **Automation**: add parameter lanes and keyframes.
- **Performance Space**: rehearse and preview the current traversal.
- **Forge Space**: produce reviewable output artifacts and recover failed
  output jobs.
- **Observatory Space**: inspect diagnostics, trust, render graph, and backend
  state.

If you are lost, go back to **Universe**. It tells you which project is open,
whether it is saved, how many assets it has, and where the folder lives.

## Start A Universe

Open **Universe**.

Use **New Universe** when starting fresh. Pick a folder that can hold project
data and generated artifacts. Studio writes the `.afterimage.json` file as part
of creating the Universe.

Use **Open Universe** when continuing existing work.

After that, Studio autosaves dirty project changes once the Universe has a
project path. Use **Save Universe** only when you want to force a write,
**Save Universe As** when you want to choose a new folder, and **Duplicate
Universe** when you want a separate copy.

Use **Reveal Universe Folder** when you need to inspect the actual project
folder on disk.

## Import Material

Open **Media**.

Use:

- **Import Media** for source video or image material.
- **Import Music** for soundtrack material.
- **Import Transitions** for transition masks.
- **Import Overlays** for visual overlay clips.
- **Import From Catalogue** when reusable library material is available.

After import, select an asset in the media grid. The inspector shows preview
and metadata for the selected item.

For a first test, import at least one video. Import music too if you want to
exercise music sync and duration-aware sequencing.

## Review Cuts

Open **Cuts**.

Cuts are candidate segments from imported footage. The job is not to perfect
the final edit here. The job is to decide which bits are usable.

Use the cut preview controls to inspect a candidate:

- **Play / Pause** auditions the selected cut.
- **Jump In** and **Jump Out** move to the proposed boundaries.
- **Set In** and **Set Out** adjust the boundary from the current preview time.
- The `-100` and `+100` controls make small boundary nudges.
- **Apply** commits a trim change.

Then make a decision:

- **Keep** marks a cut as usable.
- **Reject** removes it from consideration.
- **Favorite** marks stronger material.
- **Add** sends the selected cut into the active sequence.

For a first pass, keep a handful of cuts and add two or three of them.

## Build A Sequence

Open **Sequence**.

The sequence is the current traversal through selected material. It is closer
to an authored journey than a traditional timeline, but the first interaction
is straightforward: clips are rows, and their order matters.

Useful first actions:

- Select an available reviewed cut and use **Add Cut**.
- Use **Up** and **Down** to reorder clips.
- Use `[` and `]` to shorten or lengthen a clip.
- Use **Remove** to take a clip out.
- Use **Rebuild**, **Rebuild Tight**, or **Rebuild Longer** to regenerate from
  reviewed cuts.
- Use **New Sequence** if you want an alternate traversal.
- Use **Duplicate Sequence** before experimenting with a version you like.
- Use **Shuffle Transitions** and **Shuffle Overlays** when transition and
  overlay material exists.
- Use **Build Preview** to render an audition cache for the current sequence.

If **Build Preview** is unavailable or produces nothing useful, check that the
active sequence has clips and that the source media still exists on disk.

## Add Music Cues

Open **Music Sync** if your piece depends on soundtrack timing.

Use **Select Media** to choose the music asset. If you have an external cue
file, use the cue import action in this workspace to load custom markers.

You do not need perfect music sync for a first pass. A useful beginner target is
just this: make sure the intended music file is selected before previewing or
forging output.

## Shape The Look

Open **Style**.

A style stack is a set of filters applied to the active stack. You can work
manually or start from presets.

Useful first actions:

- Add a simple filter such as contrast, brightness, blur, bloom, glitch bands,
  or chroma bleed.
- Use **Apply** on a preset family item to load a look.
- Use **Randomise Stack** when exploring.
- Use **Bypass** to compare a filter against the unfiltered result.
- Use **Randomise** on one filter when the whole stack is too much.
- Use **Up** and **Down** to change filter order.

Keep the first look modest. It is easier to judge sequence and rhythm before
the style stack gets extreme.

## Add Automation

Open **Automation** when you want parameters to change over time.

Use **Add Automation Lane** to create a lane, then **Add Keyframe** to place
changes. Lanes can be enabled, bypassed, reset, or removed.

For a first pass, automation is optional. Use it after the sequence and style
are already understandable.

## Rehearse In Performance Space

Open **Performance Space**.

This is the rehearsal room. It previews the current traversal and lets you
adjust performance-facing state before committing to output.

Useful first actions:

- Choose the **World source** and **Traversal** if there is more than one.
- Select a scene or region from the rehearsal set.
- Adjust **Pressure**, **Entropy**, **Atmosphere**, **Influence**, or **Output
  role** if the controls are available for the selected region/layer.
- Use **Preview** to build a rehearsal preview.
- Use **Replay Preview** only when the project already has a capture log.

If **Preview** is blocked, read the inline reason. Common causes are no clips in
the active sequence, composition integrity issues, missing media, or another
preview job already running.

## Forge Output

Open **Forge Space** when the traversal is ready to become output artifacts.

Use **Traversal source** and **Traversal** to confirm what will be rendered.
Review the profile lanes so you know which outputs are enabled.

Useful first actions:

- Use **Forge Traversal** for normal output.
- Use **Forge Replay** only when rendering from an existing capture log.
- Watch the artifact console for queued, running, completed, failed, or
  cancelled jobs.
- Use **Retry Failed** or lane-level **Retry** after a failed output job.
- Use **Cancel Active** if the wrong job is running.

Completed lanes expose output paths and render artifacts. Those are the files
to review.

## Use Observatory When Something Feels Wrong

Open **Observatory Space** when you need to understand why Studio made a choice
or why output is not ready.

Use it for:

- diagnostics
- trust and fallback state
- render graph inspection
- backend readiness
- activity signals

Observatory is not the main authoring path. It is the explanation room.

## A Good First Session

Do this the first time you use the app:

1. **Universe**: create a new Universe.
2. **Media**: import one video.
3. **Media**: import one music file if available.
4. **Cuts**: keep three cuts and add them.
5. **Sequence**: arrange the cuts and build a preview.
6. **Style**: apply one preset or add one filter.
7. **Performance Space**: run Preview.
8. **Forge Space**: run Forge Traversal.
9. **Universe**: confirm the project shows the expected autosaved state.

That path touches the core loop without needing archive sidecars, capture
replay, deep automation, or appliance/live performance setup.

## Beginner Rules Of Thumb

- Create or open a saved Universe before importing lots of media.
- Keep source media in place after importing it.
- Start with a short sequence.
- Prefer a few kept cuts over dozens of undecided cuts.
- Build previews before forging output.
- Read blocked-state messages before changing random settings.
- Duplicate a sequence before aggressive experiments.
- Use Observatory for explanation, not as the main workflow.

## What To Read Next

- `docs/product/universe-workspace.md`: Universe setup and saved project model.
- `docs/product/archive-space.md`: Archive sidecar review and acceptance.
- `docs/product/performance-space.md`: rehearsal and preview workflow.
- `docs/product/forge-space.md`: output artifacts and recovery.
- `docs/product/observatory-space.md`: diagnostics and trust inspection.
