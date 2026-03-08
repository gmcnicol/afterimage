
## Required Task Exit Criteria

Codex must not treat a task as complete until it has handled learning capture.

At the end of each completed task, Codex must:

1. decide whether a new learning exists
2. if yes, create a new short PEP or update an existing one
3. if no, record "no new learnings" in the task notes or task summary

Codex must create or update a PEP whenever it discovers:

- a pitfall to avoid
- a portability issue
- a successful pattern worth repeating
- a design rule that should become permanent
- a runtime or packaging constraint
- a false start that should not be retried
- a measurable performance issue or win

PEPs must be:

- short
- specific
- operational
- phase-tagged
- written as durable guidance for future work

Avoid long prose.
Avoid generic retrospectives.
Prefer a direct rule.


## External Media Toolchain

Phase 1 must define, acquire, validate, and expose the external media toolchain used by all products.

This toolchain is part of the core engine and core libraries/framework scope.

### Required tools

The Phase 1 toolchain must cover:

- `ffmpeg`
- `ffprobe`

The Phase 1 toolchain may also cover:

- `ffplay`

`ffplay` is optional and must be treated as a development or preview aid unless a later phase explicitly promotes it to a runtime dependency.

### Phase 1 deliverables

Phase 1 must deliver:

- a platform support matrix
- a binary acquisition strategy
- pinned versions
- provenance and licensing notes
- checksum or verification process
- a shared process execution wrapper
- common logging and error handling
- timeout and cancellation behaviour
- local bootstrap/install path
- CI/bootstrap path
- tool presence and health checks

### Supported platforms

The toolchain design must support:

- macOS arm64
- macOS x64
- Linux x64
- Linux arm64
- Windows x64

### Rules

All FFmpeg-family process execution must go through the shared core toolchain layer.

Direct per-app shell-outs to `ffmpeg`, `ffprobe`, or `ffplay` are forbidden.

The default policy is to use an LGPL-compatible FFmpeg build unless an explicit licensing decision says otherwise.

Binary provenance must be recorded.

Ad hoc local binaries of unknown origin must not be committed or relied upon.

### Minimum implementation scope

Phase 1 must provide, at minimum:

- a deterministic binary fetch/install script
- a standard on-disk layout under `tools/ffmpeg/`
- version/provenance manifest files
- a shared runner abstraction for FFmpeg-family tools
- health-check commands
- a small set of sample invocation tests

### Out of scope for Phase 1

Phase 1 must not couple the whole architecture to a specific preview strategy.

This means:

- no assumption that `ffplay` is the final preview backend
- no product-specific scene detection UX
- no product-specific streaming UX
- no per-app bespoke command builders

Phase 1 establishes the toolchain layer only.

