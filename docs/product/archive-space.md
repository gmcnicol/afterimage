# Archive Space

Archive Space is the Studio workspace for reviewing archive intelligence before
it becomes composition meaning.

It is not a media library. Sidecars can be discovered and inspected without
changing a project. A project changes only when a candidate is accepted or
rejected.

## Opening Archive Space

Use the **Archive** workspace from the top navigation.

Archive Space has three working areas:

- **Memory Index**: discovered archive sidecars, health, load errors, and import
  controls.
- **Archive Archaeology Surface**: segments, motifs, atmospheres, materials,
  motion, behaviour seeds, recurrence, and affinity candidates from the selected
  sidecar.
- **Provenance / Acceptance Inspector**: source identity, rights, generator
  details, diagnostics, target selection, and candidate actions.

## Loading Sidecars

Archive Space auto-loads archive sidecars from the current project folder:

```text
<project>/.afterimage/archive/*.archive.json
<project>/archive/*.archive.json
<project>/archives/*.archive.json
```

Use **Import Archive Sidecar** to copy selected archive JSON into:

```text
<project>/.afterimage/archive/<archive-id>.archive.json
```

The imported sidecar is then available on the next project open.

If the project has not been saved or opened from disk, sidecar import is
disabled. Save or open a project first so Studio has a stable project folder.

## Reading The Memory Index

Each sidecar row shows:

- archive ID or filename
- source asset linkage
- total candidate count
- ready, check, or invalid state

Invalid sidecars stay visible as load failures. Select them to see validation
details in the inspector.

## Reviewing Candidates

The archaeology surface shows archive intelligence as reviewable candidates:

- segments with time ranges
- motif cards
- atmosphere, material, and motion clusters
- behaviour seeds
- recurrence links
- affinity candidates

Candidates can be untouched, accepted, or rejected. Accepted and rejected states
are shown directly on cards so repeated review does not rely on memory.

## Accepting Or Rejecting

Select a candidate, choose a target in the inspector, then use **Accept** or
**Reject**.

Targets include:

- the composition
- each scene
- each layer
- each sequence clip

The composition is the default target.

Accepting a candidate writes an accepted archive reference into the project.
Rejecting a candidate writes a rejected archive reference. Both use the normal
project mutation path, so autosave and export identity behave the same as other
Studio edits.

## Provenance And Rights

The inspector keeps provenance visible before acceptance:

- source URI
- source asset ID
- source system
- generator identity and version
- rights status
- license

For publishable work, missing rights or license metadata appears as an archive
diagnostic.

## Diagnostics

Archive Space surfaces diagnostics for:

- stale sidecars
- missing sidecars
- missing source assets
- missing archive items
- changed generator identity
- incompatible schema versions
- unresolved source IDs
- missing rights or license
- sidecar validation failures

Diagnostics do not crash the workspace. They stay visible in Memory Index and
the inspector so the sidecar can be fixed or replaced.

## Autosave

Archive Space assumes project edits are autosaved. It does not reserve screen
space for a persistent saved/unsaved indicator.

If autosave fails, Studio shows a warning notification.
