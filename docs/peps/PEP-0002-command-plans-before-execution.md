# PEP-0002: Command Plans Before Execution

## Status
Active

## Summary
Shared media work is easier to validate and snapshot when command compilation is kept pure and process execution is isolated behind a separate boundary.

## Context
Phase 1 introduced project validation, FFmpeg analysis planning, render planning, and tool resolution for multiple future runtimes.

## Problem
If products shell out directly, command generation, tool lookup, logging, and failure handling drift quickly and become hard to test.

## Decision
Compile serializable `CommandSpec` plans first, then execute them only through the shared FFmpeg executor.

## Pitfall to Avoid
Do not hide FFmpeg argument generation inside app-specific side effects or UI code.

## Success to Continue
Keep analysis and render plans snapshot-tested before wiring them into runtime workflows.

## Action
Any new FFmpeg or ffprobe behavior must be added as plan-building logic plus tests before a runtime consumes it.
