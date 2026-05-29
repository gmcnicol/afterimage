# Observatory Space

Observatory Space is the Studio explanation room. Use it when a world is not behaving as expected, when render output cannot be trusted, or when you need to understand which existing project facts are shaping the current composition.

It does not add a new project schema, render contract, capture mode, or diagnostics service. It derives its view from the active composition, sequence, variant, project integrity checks, desktop diagnostics, preview/export job results, render graph diagnostics, capture logs, and application logs.

![Full Observatory workspace](assets/observatory-space/full-observatory-space.png)

## Read The Active World

The header names the active composition and shows the sequence/variant pair resolved by the same composition resolver used by the rest of Studio. The trust pills show whether the current world is trusted, under watch, or blocked.

The left rail summarizes the world climate:

- **Pressure**, **entropy**, **cohesion**, and **memory** come from current scene climate.
- **Routes** and **entropy states** come from authored modulation and entropy data.
- **Capture** counts events already stored in capture logs.
- **Trust** lists blockers and warnings before lower-level logs.

![Telemetry and trust](assets/observatory-space/telemetry-trust.png)

## Inspect Behaviour

The central behaviour map connects the active world signals: scenes, layers, modulation routes, entropy states, archive references, capture memory, render diagnostics, backend state, and recent activity.

Selecting any signal opens the detail drawer. The drawer explains the signal in creator-facing language first, then exposes backend identifiers, paths, graph references, or raw messages in a collapsed details section.

![Behaviour map and signal detail](assets/observatory-space/behaviour-map-detail.png)

## Inspect Behavioural Fields

Spatial fields appear as behavioural signals rather than raw runtime ids. Their primary labels use artist-facing field language such as **Drift**, **Pressure**, **Corrosion**, **Instability**, **Memory**, **Viscosity**, and **Turbulence**.

Selecting a spatial-field signal in the behaviour map selects the same field in the field inspector. Selecting a field in the inspector also selects the matching Observatory signal, so the map, detail drawer, and field preview stay in sync.

The field inspector controls describe what you are looking at:

- **Field** shows the selected field on its own.
- **Motion** emphasizes where the field is strongest.
- **Drift** shows directional movement across the frame.
- **Balance** shows the distribution of values for diagnostics.

Runtime details are still available, but they are secondary. Use the detail rows for field id, generator id, frame id, storage mode, profile fit, dimensions, and cost class when debugging output planning.

## Choose A Runtime Profile

The Observatory header includes a compact profile selector:

- **Draft** favors quick checks with reduced resolution, short persistence, and lighter detail.
- **Live** favors responsive rehearsal with active memory and balanced resolution.
- **Studio** is the default working view, with steady playback, held memory, rich detail, layered depth, and full field resolution.
- **Render** favors locked output review with maximum detail, complete memory, deeper passes, and source resolution.

The selection is local to Studio. It does not write project schema or change export settings. Switching profiles replans the Observatory field view so dimensions, persistence depth, diagnostics, and profile fit reflect the selected budget while keeping the selected field and overlay mode where possible.

Field cards lead with artist-facing qualities: stability, persistence, detail, depth, and resolution. Backend identifiers such as frame id, storage mode, profile fit, generator id, update-pass count, and diagnostics remain in the Runtime details disclosure.

High-quality motion and optical-flow generation remains future THE-72 work. Observatory may show deterministic frame-difference motion inputs, but this profile selector does not add the full optical-flow pipeline.

## Decide What Can Be Trusted

The Trust lane categorizes existing system truth:

- Project integrity issues and missing media are blockers.
- An unavailable FFmpeg toolchain is a blocker.
- Failed preview/export jobs are blockers for their output targets.
- Desktop warnings, toolchain warnings, and unseeded modulation or entropy signals reduce confidence.

When no blockers are present, Observatory still shows the current world state and explicitly reports that no blockers are present.

## Understand Runtime And Backend State

Runtime collects field and output diagnostics returned by planning, preview, and export jobs. Backend collects FFmpeg availability, tool versions, toolchain warnings, environment summaries, and recent commands from desktop diagnostics.

These signals explain output planning without changing the public job result shape or diagnostics wire contract.

## Follow Recent Activity

The bottom strip shows recent failed, running, queued, completed, warning, and log signals. Raw application logs remain available, but they are secondary to the world explanation and trust state.

Use **World** for authoring, **Performance** for rehearsal and capture replay, and **Forge** for traversal artifacts and export delivery. Use **Observatory** when the question is why the world is behaving this way, what can be trusted, and what is blocking output.
