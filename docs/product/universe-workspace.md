# Universe Workspace

Universe is the first Studio workspace. It is where a user creates, opens,
saves, duplicates, and returns to an Afterimage workspace folder.

The visible workspace name is **Universe**. The underlying file format,
commands, schema fields, and service contracts still use the existing project
noun. A saved Universe is still stored as `.afterimage.json` in the selected
folder.

## First Launch

Studio opens on **Universe** from the top navigation. Use **New Universe** to
choose a folder and create the `.afterimage.json` file, or **Open Universe** to
load an existing Afterimage JSON file.

The Universe workspace contains these surfaces:

- **Universe**: file path, folder, save state, current media counts, and recent
  universes.
- **Archive**: archive sidecar review and candidate acceptance.
- **Media**: source imports, analysis state, and media readiness.
- **Catalogue**: reusable library roots and scanned global assets.

Keyboard shortcuts keep the same behaviour: `Cmd/Ctrl+N` creates a new
Universe, and `Cmd/Ctrl+O` opens one.

## Archive Access

Archive sidecars need a saved Universe folder. If Archive is opened before a
folder exists, the empty state sends the user back to Universe setup to save or
open a Universe first.
