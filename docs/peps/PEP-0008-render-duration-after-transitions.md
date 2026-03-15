# PEP-0008: Render Duration After Transitions

## Status
Draft

## Summary
Do not assume authored clip duration equals rendered video duration once overlap transitions are added. Transition overlap can shorten the effective timeline, and dense auto-assigned transitions or overlays can make FFmpeg preview graphs too large to build reliably.

## Context
We were auto-building music-backed sequences, then randomizing mask transitions and overlays before generating previews.

## Problem
Mask transitions consumed visible timeline duration after sequence build, which left the rendered video shorter than the music. The preview then had to pad the tail. On long tight-cut sequences, assigning effects too densely also produced very large FFmpeg graphs that failed before encoding started.

## Decision
Treat transition randomization as a duration-changing step. After assigning overlap transitions, re-check rendered coverage against the music duration and extend the sequence with reusable clips if needed. Also cap transition and overlay density on long sequences instead of applying them everywhere.

## Pitfall to Avoid
Do not validate music coverage using only raw clip durations before transitions are applied.

## Success to Continue
Prefer sequence-level fixes over renderer-only tricks. Keeping the authored sequence long enough avoids frozen tails and reduces pressure on the final FFmpeg stage.

## Action
Whenever a feature adds overlap, modulation, or per-clip effects after sequencing, add an explicit rendered-duration check and a graph-complexity cap.
