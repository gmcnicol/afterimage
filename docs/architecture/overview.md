# Architecture overview

Afterimage is a shared-core, multi-runtime system.

## Runtimes

- **Studio Desktop**: offline authoring and HQ rendering
- **Live Desktop**: low-latency live performance on a desktop/laptop
- **Live Appliance**: headless Pi runtime for boot-to-broadcast deployment

## Shared core

- project model
- preset library
- MIDI mapping model
- FFmpeg command compilation
- media analysis metadata

## Deliberate separation

Studio and Live share data models, not workflows.
The appliance shares contracts and execution concepts, not UI assumptions.
