# FFmpeg Toolchain

This directory holds the shared FFmpeg-family toolchain used by all Afterimage products.

## Scope

Core tools:

- `ffmpeg`
- `ffprobe`

Optional tool:

- `ffplay`

## Policy

- versions must be pinned
- provenance must be recorded
- licensing notes must be recorded
- local unknown binaries must not be committed
- product code must not shell out directly; use the shared toolchain layer

## Expected layout

- `tools/ffmpeg/fetch-binaries.mjs`
- `tools/ffmpeg/manifests/`
- `tools/ffmpeg/bin/` (ignored from git)
- `tools/ffmpeg/downloads/` (ignored from git)
- `tools/ffmpeg/cache/` (ignored from git)

## Notes

`ffplay` is optional unless a later phase explicitly promotes it to a runtime dependency.
