# Performance Space

Performance Space is the Studio rehearsal room. Use it when a composition already has a sequence and you want to steer the active world before committing to Capture or export.

It brings the active scenes, forces, climate, entropy, preview state, and capture replay state into one console. It does not record a new capture. It lets you rehearse the current composition and replay an existing capture log when one is available.

![Full Performance workspace](assets/performance-space/full-performance-workspace.png)

## Choose The Active World

The top bar chooses the source sequence and traversal variant. These are the same composition targets used by World and Sequence, so changing them changes which universe Performance Space rehearses.

Use **World source** for the sequence and **Traversal** for the variant. The rehearsal console updates the scene list, central signal view, live controls, preview output path, and replay output path from that selection.

## Choose A Scene Or Region

The **Rehearsal Set** on the left lists the composition scenes. Each scene shows its climate, layer count, capture references, pressure, entropy, and readiness.

Select a scene to make it the active region. The central signal view moves to that region and exposes its forces as selectable layer controls.

![Scene and region selection](assets/performance-space/scene-region-selection.png)

## Steer Pressure, Entropy, And Influence

The **Live Controls** panel changes rehearsal-facing composition state:

- **Pressure** changes how forceful the selected region should feel.
- **Entropy** changes how unstable or drift-prone the selected region should feel.
- **Atmosphere** names the current climate.
- **Influence** changes the selected layer mix.
- **Render intent** changes the selected layer pass kind.

These are normal project edits. They are saved through the same Studio project update path as World Space.

![Live controls](assets/performance-space/live-controls.png)

## Rehearse A Preview

Use **Rehearse** in the output strip to render a preview for the active sequence and variant. The output strip shows whether the preview is idle, queued, rendering, completed, failed, or cancelled. When a render completes, the last artifact path appears in the strip.

If Rehearse is blocked, the first blocking reason appears inline. Common reasons are an active variant with no clips, composition integrity issues, or another preview render already running.

![Preview and replay output strip](assets/performance-space/preview-replay-output-strip.png)

## Replay A Capture

Use **Replay Capture** when the project already has a capture log. Performance Space selects the latest capture session and matching log by default, and you can choose another replay log from Live Controls.

Replay renders a preview with the selected capture session/log applied. It does not append new capture events and it does not arm recording.

When no capture exists, Replay Capture stays blocked and the output strip explains why.

![Blocked no-capture state](assets/performance-space/blocked-no-capture-state.png)

## Readiness And Blocked States

Readiness is shown in the header, scene list, central signal view, and output strip.

- **Rehearsal ready** means the active variant has clips and no composition integrity blockers.
- **Replay ready** additionally needs a selected capture log with events.
- **Blocked** means the action is unavailable until the inline reason is fixed.
- **Rendering** or **queued** means an existing preview or replay job owns that output target.
- **Failed** means the last job for that output target ended with an error; read the output strip before retrying.

## Where To Go Next

Use **World** for deeper composition authoring, **Sequence** for clip assembly, and **Capture** for export delivery. Performance Space is for rehearsal and steering; Capture remains the place for export profiles and delivery outputs.
