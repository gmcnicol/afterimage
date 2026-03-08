# Afterimage

Monorepo scaffold for a three-product video system:

- **Studio Desktop**: offline authoring, scene detection, sequencing, HQ export
- **Live Desktop**: low-latency reactive desktop performance app
- **Live Appliance**: headless Raspberry Pi 5 runtime for boot-to-broadcast live output

## Stack

- Desktop apps: Electron + React + TypeScript
- Appliance: Go
- Shared contracts: JSON Schema
- Workspace: pnpm + Turborepo

## First-run bootstrap

```bash
bash scripts/bootstrap.sh
```

The bootstrap script:

- checks for `node`, `pnpm`, and `go`
- installs current workspace tooling with pnpm
- installs the current desktop shell dependencies into each Electron app
- installs AJV for schema validation
- runs `go mod tidy` for the appliance module

## Repo shape

- `apps/studio-desktop` — offline editor / render shell
- `apps/live-desktop` — live performance desktop shell
- `apps/live-appliance` — Go service for the headless Pi target
- `packages/*` — shared domain packages
- `schemas/*` — canonical project, preset, sequence, analysis, and MIDI mapping contracts
- `docs/adr/*` — architectural decisions
- `docs/constraints/appliance.md` — hard appliance constraints

## Notes

This is intentionally a **scaffold**, not a finished product.
The desktop shells are minimal but structured to keep Studio and Live cleanly separated.
The appliance service is a compileable starting point with health and config loading stubs.
