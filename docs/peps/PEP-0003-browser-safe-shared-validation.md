# PEP-0003: Browser-Safe Shared Validation

## Status
Active

## Summary
Shared schema-validation code can be consumed by browser renderers, but only if the migration and validation layer stays free of Node-only imports.

## Context
Phase 2 needed the Studio renderer to load preset and project validation logic directly while the Electron main process also consumed the same shared packages.

## Problem
Using `node:path` inside the shared validator package broke the renderer build because Vite externalized the Node builtin, even though the rest of the package was browser-safe.

## Decision
Keep shared validation and migration packages browser-safe by default. If path handling is needed, use small string utilities in shared code and reserve Node-specific filesystem work for runtime services.

## Pitfall to Avoid
Do not let convenient Node helpers leak into shared packages that must bundle into both renderer and main-process environments.

## Success to Continue
Treat shared contracts, validation, and pure authoring operations as portable modules. Put dialogs, filesystem access, and process execution behind the Electron boundary.

## Action
When adding shared project loading or validation behavior, check that the package still builds in both browser and Node contexts before merging.
