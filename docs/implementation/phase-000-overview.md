# Phase 000: Delivery Overview

## Status
Draft

## Objective
Define the mandatory delivery order and the hand-off boundaries between phases.

## Delivery order
1. Core Engine
2. Studio Desktop
3. Live Desktop
4. Live Appliance

## Rules
- No phase may depend on undocumented behaviour from an earlier phase.
- Shared contracts must be stable before downstream runtimes rely on them.
- Each phase must end with demoable software, not just design notes.
- Each phase must follow `task-completion-and-learning-capture.md`.

## Shared deliverables expected across all phases
- updated docs
- tests appropriate to the phase
- example config or fixture data where useful
- at least one short PEP note if any real lesson emerged

## Exit rule
A phase is only complete when its phase document exit criteria are met, the result is runnable, and task completion follows `task-completion-and-learning-capture.md`.
