# Core Engine Flow

Phase 1 treats the shared engine as a pure pipeline with one execution boundary:

1. load project or sidecar JSON
2. validate against schema contracts
3. normalize into deterministic in-memory shapes
4. compile analysis or render command plans
5. resolve FFmpeg tools
6. execute commands through the shared executor

## Canonical project rule

The canonical project file embeds stable authoring data:

- sources
- presets
- sequence
- MIDI mappings

Generated analysis data stays in sidecars referenced by `analysisRefs`.

## FFmpeg rule

Apps compile plans and call the shared executor.
Apps do not shell out to `ffmpeg` or `ffprobe` directly.

Binary lookup order is:

1. explicit env override
2. PATH fallback

The default licensing assumption remains LGPL-compatible FFmpeg, with provenance recorded before redistribution.
