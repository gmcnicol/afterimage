# Phase 004: Live Appliance (Headless)

## Status
Planned

## Objective
Build the truly headless runtime target for Raspberry Pi 5 or equivalent appliance-class hardware.

## Hard constraint
The device must be truly headless: on power-up it must boot, start the service automatically, and be ready to broadcast or output without an attached display, keyboard, or manual login.

## Scope
- Go runtime service
- boot/startup flow
- config loading
- service health and supervision
- FFmpeg process orchestration
- remote control surface or API
- media storage strategy
- output readiness checks
- crash recovery and restart strategy

## Explicit non-goals
- desktop-style editing UI
- manual operator workflows that require a local monitor
- first-class authoring features

## Deliverables
- bootable service runtime
- systemd integration
- remote health endpoint
- remote control or session launch API
- deterministic startup behaviour
- operational docs for deployment and recovery

## Key questions to answer
- how the device becomes ready automatically
- what the watchdog or supervisor behaviour must be
- how logs are accessed remotely
- how sessions are delivered to the device
- how configuration is updated safely
- how output readiness is checked and surfaced

## Exit criteria
- device boots into service automatically
- device reaches a ready state without manual login
- service health can be checked remotely
- a live session can be launched remotely or from preconfigured startup state
- restart and crash recovery behaviour is documented and tested
- headless-specific lessons are recorded in PEP notes

## Learning capture focus
Prefer notes about:
- boot sequencing
- service supervision
- remote diagnostics
- device-specific hardware constraints
- deployment or packaging pain points
