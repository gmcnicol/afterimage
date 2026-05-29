# Behavioural Spatial Systems

## Purpose

Behavioural spatial systems define how invisible spatial influence shapes an
Afterimage world.

They should generally avoid directly warping or destructively distorting source
footage. The footage can remain coherent while the world around it becomes
unstable.

## Core Rule

Spatial systems influence masks, fields, overlays, modulation, emergence,
compositing behaviour, and material evolution.

They are not conventional video distortion plugins.

## Canonical Example: Whirl Machine

The Whirl Machine is not a vortex or twirl effect.

It is a behavioural flow-field system that creates invisible currents, pressure
wells, convection zones, and turbulence. Those influences change how visual
behaviours spread through the world.

The source image may remain legible. The surrounding atmosphere changes.

## System Types

Initial behavioural spatial systems include whirl systems, gravity systems,
convection systems, erosion systems, diffusion systems, pulse systems, and
turbulence systems.

Each system produces spatial influence data. Rendering observes the result.

## Components

### Flow Field

A flow field stores directional movement tendency over space and time.

It can drive overlay drift, fog movement, mask spread, particle movement, and
material accumulation.

### Vortex Well

A vortex well is a localized rotational pressure zone.

It can attract, rotate, or hold material behaviour without distorting the source
footage directly.

### Drift Accumulation

Drift accumulation stores directional memory.

It lets the world remember repeated movement rather than resetting every frame.

### Turbulence Noise

Turbulence noise introduces unstable perturbation.

It should be seeded for deterministic export.

### Convection Region

A convection region clusters or lifts behaviour in space.

It is useful for heat, smoke, vapor, signal bloom, and atmospheric rise.

## Influenced Systems

Spatial systems may influence overlay emergence, particle drift, fog movement,
corrosion spread, memory resurfacing, transition behaviour, entropy migration,
atmospheric accumulation, scene pressure distribution, and material cooling or
recovery.

## Runtime Shape

The runtime architecture evolves toward:

```text
World State
+ Behavioural Systems
+ Spatial Influence Systems
+ Material Systems
+ Observed Rendering
```

The renderer is downstream from behaviour.

Spatial fields now plan explicit runtime execution sessions. Each session has
deterministic frame identity, dimensions, storage mode, a persistence plan, and
bounded update passes. Persistence is represented as frame slots:

- current-frame fields allocate one current slot
- previous-frame fields allocate current plus previous slots for ping-pong
  updates
- history-window fields allocate current plus a bounded history window, capped
  by the active runtime profile

The same plan drives byte estimates, profile fit, cache identity, diagnostics,
and GPU texture allocation. Draft, Live, Studio, and Render profiles scale field
resolution, pass depth, memory budget, cost tolerance, and fallback policy
without changing the project schema.

## Data Requirements

Spatial systems should define system ID, system type, scene or world scope,
influence region, strength, falloff, seed, modulation inputs, affected targets,
and cache identity where render planning requires it.

The values must be serializable for deterministic capture and export.

## Render Planning

The render graph may lower a spatial system into generated masks, generated
overlays, intermediate field passes, particle or texture passes, modulation
curves, or backend-specific shader and filter inputs.

The graph should prefer intermediate passes over enormous monolithic
`filter_complex` chains when the system has state or reuse value.

The current executable path is intentionally limited to WebGPU field texture
sessions inside `@afterimage/ffmpeg-compiler`. It allocates planned field
textures, encodes minimal compute updates for replace, accumulate, decay,
diffuse, and smear-compatible passes, submits command buffers, and reports CPU
fallback diagnostics on missing WebGPU, allocation errors, validation errors,
out-of-memory, limit failures, pass execution failures, or device loss.

Higher-quality motion generation and optical-flow inputs are still future
THE-72 work. The runtime may use deterministic frame-difference motion inputs
where they already exist, but it must not introduce the full optical-flow
pipeline here.

## Constraint

Do not pursue physically accurate fluid simulation initially.

The target is emotionally and behaviourally convincing audiovisual evolution,
not computational fluid dynamics correctness.
