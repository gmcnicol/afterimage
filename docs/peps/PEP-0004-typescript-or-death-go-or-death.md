# PEP-0004: TypeScript Or Death, Go Or Death

## Context
Phase 2 exposed repeated friction from mixing authored TypeScript, authored JavaScript, CommonJS preload glue, and runtime-specific type drift inside the desktop app.

## Observation
The fastest path to runtime breakage in this repo is crossing language boundaries casually inside the same product surface. Studio/Desktop and shared packages want one authored language with one type system. The headless appliance and other non-UI runtime code want one authored language that matches their deployment model.

## Impact
Mixed authored languages inside a single surface create avoidable boot failures, preload/runtime mismatches, duplicated contracts, and weaker reviews because every change has to reason about multiple module systems at once.

## Rule
Desktop, renderer, Electron main/preload, and shared workspace packages are authored in TypeScript only. Headless runtime code is authored in Go only. JavaScript, CommonJS, and other artifacts are allowed only as generated build output, third-party code, or unavoidable tool configuration boundaries.

## Phase
studio-desktop

## Tags
typescript, go, language-boundary, electron, shared-contracts
