# PEP-0001: Workspace Bootstrap And TS References

## Status
Active

## Summary
The scaffold must pin an exact pnpm version and declare workspace package dependencies before TypeScript package references are added, or bootstrap succeeds unevenly and typecheck breaks in ways that look unrelated.

## Context
We were stabilizing the monorepo scaffold for Phase 0 so `bootstrap.sh` and the shared packages could serve as the starting point for later phases.

## Problem
`pnpm` refused to run with an incomplete `packageManager` value, and a shared package import plus project reference failed unless the dependency relationship and TypeScript behavior were wired deliberately.

## Decision
Pin pnpm to an exact version in the root manifest, keep bootstrap responsible for installing scaffold dependencies, and use explicit workspace dependencies when one shared package imports another.

## Pitfall to Avoid
Do not add cross-package imports in shared packages without also adding the corresponding workspace dependency and checking how that package typechecks.

## Success to Continue
Use the scaffold phase to prove bootstrap, typecheck, and workspace wiring before starting feature work.

## Action
Whenever a new shared package import is introduced, update bootstrap and package manifests in the same change and rerun workspace verification.
