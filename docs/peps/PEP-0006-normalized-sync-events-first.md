# PEP-0006: Normalized Sync Events First

## Context
Studio/Desktop needs to support very different kinds of music authoring:
- rhythmic material with usable beat/downbeat structure
- ambient, drone, noise, and freeform material where “beat detection” is often the wrong abstraction
- manual and MIDI-driven cues that represent user intent rather than inferred audio structure

Trying to force all of that through a beat-only model would make the editor biased toward one kind of music and brittle for everything else.

## Decision
The shared engine standardizes on `SyncEventTrack` as the sequencing contract.

Specific analyzers and inputs feed that contract:
- `AudioChangeTrack` for texture, energy, spectral, and silence changes
- `BeatTrack` for rhythmic material when beat/downbeat extraction is useful
- `MidiGestureTrack` for recorded or imported cue/gesture input
- manual markers from the authoring UI

The sequencer, cut browser, and music tooling consume normalized sync events rather than analyzer-specific raw data.

## Why
- Ambient and noise workflows need change detection more than beat detection.
- Rhythmic workflows still need beats, but beats are only one signal source.
- MIDI should express intent and gesture, not be treated as the primary audio-analysis engine.
- A single downstream sync contract prevents the renderer and the shared engine from fragmenting into multiple mutually incompatible timing systems.

## Consequences
- `AudioChangeTrack` ships before `BeatTrack`.
- FFmpeg-only change analysis is a valid first-class feature, not a temporary fallback.
- UI features such as snapping, cut biasing, and marker import operate on `SyncEventTrack`.
- New analyzers can be added later without changing the sequence authoring contract.

## Rule
- Do not hard-code Studio/Desktop around beats.
- Do not let analyzer-specific data leak directly into sequencing behavior when it can be normalized into sync events first.
- When adding new timing signals, map them into `SyncEventTrack` unless there is a strong reason not to.

## Phase
studio-desktop, shared-engine

## Tags
music-analysis, sequencing, ffmpeg, midi, architecture
