# Afterimage

Afterimage is an open-source behavioural audiovisual composition and
performance instrument.

It is not a traditional video editor. Afterimage is for defining audiovisual
worlds, shaping their behaviour, performing their evolution, and capturing the
resulting traversal.

## Product Surfaces

Afterimage is a shared-core, multi-runtime system:

- **Studio**: offline authoring, scene analysis, sequencing, music sync, filter
  design, and deterministic high-quality export.
- **Live Desktop**: low-latency desktop performance runtime for preview,
  clip banks, reactive inputs, MIDI control, projector output, recording, and
  streaming.
- **Live Appliance**: headless appliance runtime for boot-to-broadcast output,
  remote control, health signalling, and supervised playback.
- **Afterimage Core**: shared project, preset, modulation, render planning,
  FFmpeg compilation, media metadata, and runtime-neutral contracts used by all
  product surfaces.

## Getting Started

For a beginner app walkthrough, start with
`docs/getting-started.md`.

Prerequisites:

- Node.js
- pnpm `10.20.0`
- Go, for the Live Appliance runtime
- FFmpeg, for media analysis, preview, and export workflows

Install dependencies:

```bash
pnpm install
```

Run the Studio desktop app:

```bash
pnpm dev:studio
```

Run the Live Desktop app:

```bash
pnpm dev:live
```

Run the Live Appliance service:

```bash
pnpm dev:appliance
```

Run the development checks:

```bash
pnpm check:dev
```

For a first machine setup, `bash scripts/bootstrap.sh` checks local tooling,
installs workspace dependencies, and tidies the Go module.

## Documentation

- `FOUNDATIONS.md`: product doctrine and design principles.
- `docs/architecture/README.md`: current architecture source-of-truth index.
- `docs/product/README.md`: product-facing concepts and runtime notes.
- `docs/implementation/README.md`: active implementation policy and learning
  capture guidance.
- `docs/licensing.md`: repository, dependency, asset, and FFmpeg licensing
  policy.
- `docs/archive/README.md`: historical phase/spec documents kept for context,
  not current implementation guidance.

## Repository Shape

- `apps/studio-desktop`: Studio runtime.
- `apps/live-desktop`: Live Desktop runtime.
- `apps/live-appliance`: Go service for the headless appliance target.
- `packages/*`: shared domain, compiler, preset, and contract packages.
- `schemas/*`: canonical JSON Schema contracts.
- `tools/*`: local build, FFmpeg, and repository tooling.
- `docs/*`: architecture, product, ADR, implementation, licensing, and archive
  documentation.

## Contributing

Afterimage is not currently accepting unsolicited pull requests as the normal
contribution path. Please open or discuss issues first so product direction,
runtime boundaries, and licensing implications can be settled before
implementation work starts.

GitHub pull requests are used for planned implementation review once work is
agreed.
