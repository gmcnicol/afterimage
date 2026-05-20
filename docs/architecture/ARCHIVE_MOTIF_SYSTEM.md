# Archive And Motif System

## Purpose

This document defines the Afterimage v1 Archive & Motif System contract.

The archive layer connects Darklife intelligence to Afterimage composition,
performance, capture, and export. It describes source fragments, segments,
motifs, atmospheres, materials, motion, behavioural seeds, recurrence, world
affinity, provenance, and import acceptance without making Afterimage depend on
Darklife's full graph model.

## Core Rule

Archive metadata is memory input, not runtime meaning by itself.

Darklife may generate intelligence. Afterimage may discover and inspect that
intelligence. A composition changes only when archive references are explicitly
accepted into Core-owned composition, scene, layer, modulation, behaviour,
capture, or render graph contracts.

## Current V1 Anchor

The current repository already has:

- `schemas/archive.schema.json`
- `ArchiveMetadataFile` and related TypeScript types in
  `packages/project-model/src/index.ts`
- archive validation in `packages/schema-validators/src/index.ts`
- an archive fixture at
  `packages/test-fixtures/src/fixtures/archive/source-alpha.archive.json`
- architecture doctrine in `docs/architecture/ARCHIVE_SCHEMA.md`
- Darklife boundary doctrine in `docs/architecture/DARKLIFE_PIPELINE.md`
- deterministic sidecar references in `docs/architecture/DATA_MODEL.md`
- composition archive ownership in `docs/architecture/COMPOSITION_MODEL.md`
- scene/layer archive participation in
  `docs/architecture/SCENE_LAYER_HIERARCHY.md`

This document is intentionally documentation-only. It defines the semantics
that later schema, type, validator, fixture, and Studio work should implement.

## Ownership

### Darklife

Darklife owns:

- source ingestion intelligence
- cut and segment candidate extraction
- motif candidate extraction
- atmosphere classification
- material and motion descriptors
- recurrence detection
- motif graph intelligence
- archive enrichment
- publishing adaptation

Darklife does not own Afterimage composition meaning.

### Afterimage Core

Afterimage Core owns:

- accepted archive references inside compositions
- scene and layer participation
- modulation, entropy, and behaviour meaning
- deterministic capture and export requirements
- render graph planning inputs
- validation rules for replay-critical references

Core should reference archive sidecars by stable IDs and versions. It should not
embed large Darklife graphs inside project files.

### Studio

Studio owns:

- discovery and inspection of archive sidecars
- provenance display
- acceptance and rejection workflows
- ambiguity and conflict presentation
- recurrence and affinity review
- diagnostics for stale, missing, or unsupported metadata

Studio may help the user choose archive intelligence. It must not silently
rewrite composition meaning.

## Archive Sidecar Boundary

Archive intelligence belongs in sidecars.

Sidecars may contain:

- source identity
- provenance
- segments
- motif candidates
- atmosphere metadata
- material metadata
- motion metadata
- behavioural seed candidates
- recurrence links
- world affinity candidates
- generator metadata
- confidence and curation state

Core project files should store only deterministic references needed to
reproduce an authored world or export. Large intelligence graphs, classifier
output, and exploratory candidate sets stay in sidecars.

## Top-Level Archive Item

An archive item describes one source asset or archive source.

Required v1 identity:

- archive item ID
- schema version
- source system
- source asset ID
- provenance

Recommended metadata:

- generated time
- generator identity
- generator version
- source URI
- rights status
- license
- notes
- content hash where available
- sidecar file identity where available

The archive item ID must be stable across validation and import. It must not be
derived from local array position, UI ordering, or transient file discovery
order.

## Source Identity

`sourceAssetId` links archive metadata to an Afterimage asset or accepted
source reference.

If metadata comes from Darklife before the source is imported into Afterimage,
the import contract must resolve the external source identity to a project
asset ID before composition use.

Source identity should distinguish:

- original media identity
- project asset identity
- archive item identity
- sidecar file identity
- generated artifact identity
- capture identity where the source is an Afterimage capture

## Segments

Segments identify time ranges inside a source.

Required v1 fields:

- segment ID
- time range start in milliseconds
- time range end in milliseconds

Recommended fields:

- label
- confidence
- descriptor tags
- motif IDs
- atmosphere IDs
- material IDs
- motion IDs
- behaviour seed IDs
- provenance or generator note where segmenting is inferred

Segment ranges must be explicit and deterministic. A segment ID should remain
stable when metadata is regenerated unless its source range or meaning changes
materially.

Segments are the bridge between media time and world memory. Scenes, layers,
archive resurfacing, motif use, atmosphere use, recurrence, and behavioural
seeds should target segment IDs when timing matters.

## Motif Metadata

Motifs are recurring symbolic or perceptual patterns.

Examples:

- hallway
- surveillance
- empty interior
- thermal bloom
- domestic decay
- signal collapse
- ritual doorway
- industrial corridor

A motif candidate should define:

- motif ID
- label
- descriptors
- confidence
- weight
- segment links
- source links where needed
- recurrence group link where available
- generated or curated state
- provenance

Labels are not stable identity. A label can change for clarity without changing
motif identity. A motif ID should survive regeneration when the underlying
pattern remains the same.

## Motif Candidate, Accepted Motif, And Graph Node

Afterimage distinguishes:

- motif candidate: archive sidecar intelligence available for inspection
- accepted motif reference: a deterministic composition or scene reference
- recurrence group: an archive-side grouping of related motif appearances
- Darklife graph node: a richer intelligence object that remains in Darklife

Afterimage should not import the full Darklife motif graph. It may reference a
graph node or recurrence group by stable external ID when useful for provenance.

## Motif Ambiguity

Motifs may be ambiguous, synonymous, or duplicate.

Contract-level handling should include:

- confidence score
- descriptor list
- optional duplicate-of reference
- optional synonym group reference
- human curation state
- explanation where inferred

Ambiguous motifs may be useful for discovery, but they should not affect
deterministic composition meaning until accepted or mapped through explicit
rules.

## Motif Use In Composition

Accepted motifs may influence:

- scene active motifs
- archive segment resurfacing
- atmosphere bias
- modulation routes
- memory pressure
- behavioural seed selection
- recurrence inspection
- layer contribution

Composition owns how accepted motif references participate. Motif metadata does
not directly activate scenes or layers.

## Atmosphere Metadata

Atmosphere describes the emotional, environmental, and material feeling of
archive fragments.

Atmosphere is not a flat tag list. It should be structured enough to map into
scene climate, layer contribution, modulation bias, material selection, and
behavioural seed selection.

An atmosphere entry should define:

- atmosphere ID
- label
- descriptors
- intensity
- confidence
- segment links
- motif links where useful
- generated or curated state
- provenance

## Atmosphere Dimensions

V1 atmosphere dimensions may include:

- pressure
- warmth
- density
- dread
- drift
- decay
- stillness
- volatility
- memory
- corrosion
- surveillance coldness
- fog or haze
- claustrophobia
- openness

Dimensions should be normalized when used as Core inputs. Descriptive labels
may remain human-facing, but render, modulation, and scene contracts should
consume explicit values or accepted references.

## Atmosphere Conflict Handling

Archive fragments may carry conflicting atmospheres.

Conflict handling should preserve:

- each candidate's confidence
- each candidate's intensity
- source segment links
- curation state
- explanation where inferred
- acceptance state

Studio may present conflict. Core should not collapse conflict into a hidden
single label unless the composition explicitly accepts a resolved climate.

## Atmosphere Use In Composition

Accepted atmosphere metadata may influence:

- scene climate
- layer emergence
- material response
- modulation bias
- entropy bias
- aesthetic pack selection
- transition tendency
- behavioural seed selection

Studio UI labels must not redefine atmosphere metadata. The metadata contract
belongs to archive sidecars and Core acceptance rules.

## Material And Motion Metadata

Materials describe visual substance. Motion describes movement character.

Material examples:

- concrete
- glass
- smoke
- tape noise
- corroded metal
- wet asphalt
- fabric
- phosphor glow

Motion examples:

- still
- drift
- pulse
- shake
- flow
- collapse
- convection
- flicker

Material and motion metadata may influence aesthetic packs, behavioural
systems, transition choices, field strength, layer contribution, and material
passes. They remain candidate metadata until accepted into composition meaning.

## Archive Import Contracts

Archive import is a staged process:

1. Discover sidecar.
2. Validate schema and version.
3. Resolve source identity.
4. Validate provenance and generator identity.
5. Inspect candidate metadata.
6. Accept, reject, or defer metadata.
7. Store deterministic references in project or composition state where needed.
8. Preserve sidecar identity for replay and export.

Supported import sources:

- Darklife sidecars
- Afterimage-generated sidecars
- manual curation sidecars
- future capture-derived sidecars

Imports must not mutate composition meaning without explicit acceptance.

## Discovery

Discovery may find sidecars through:

- project-relative paths
- asset-adjacent metadata files
- workspace archive folders
- manually selected files
- generated Afterimage analysis output

Discovery order must not define identity or import priority. If multiple
sidecars claim the same source, Studio should present a deterministic conflict
state.

## Validation

Import validation should check:

- schema version
- archive item ID
- source system
- source asset identity
- required provenance
- segment time ranges
- duplicate IDs within the sidecar
- references to missing segments, motifs, atmospheres, materials, motion, or
  seeds
- confidence and intensity bounds
- behavioural seed bounds
- recurrence source and target references
- generator identity where inferred values affect trust
- rights and license metadata where output may be published

Invalid candidate metadata may be ignored for discovery, but invalid accepted
metadata must block deterministic export until repaired or removed.

## Acceptance

Acceptance turns candidate metadata into composition-relevant intent.

Accepted references should store:

- archive item ID
- sidecar version or content identity
- source asset ID
- referenced segment IDs
- referenced motif IDs
- referenced atmosphere IDs
- referenced material or motion IDs where relevant
- referenced behaviour seed IDs where relevant
- referenced recurrence IDs where relevant
- acceptance scope
- acceptance time or project version where useful
- human curation note where useful

Acceptance scope may be project, composition, scene, layer, behaviour, material
system, modulation route, or capture.

## Rejection And Staleness

Rejected metadata should remain inspectable when useful, but it must not affect
composition meaning.

Stale sidecar cases include:

- missing sidecar
- changed sidecar content identity
- changed generator identity
- source asset mismatch
- removed segment or motif ID
- incompatible schema version
- rights metadata change

Stale accepted references must produce diagnostics. They must not silently
fall back to similarly named labels.

## Behavioural Seeds

Behavioural seeds are archive-derived suggestions that initialize or bias world
behaviour.

They can influence:

- scene climates
- layer emergence
- behaviours
- spatial fields
- material systems
- modulation routes
- entropy bias
- transition tendencies

Behavioural seeds are not executable code. They are bounded, typed,
inspectable parameters that Core may accept into explicit behaviour meaning.

## Behavioural Seed Fields

A behavioural seed should define:

- seed ID
- seed type
- strength
- confidence
- deterministic numeric seed
- segment links
- motif links
- atmosphere links
- parameter object
- provenance
- generator identity where inferred
- supported target scopes
- curation state

Parameters must be bounded and schema-valid. Archive metadata must never carry
scripts, shader code, command fragments, or backend instructions.

## Seed Categories

V1 seed categories may include:

- atmosphere
- material
- motion
- recurrence
- pressure
- emergence
- decay
- recovery
- spatial influence
- memory resurfacing
- entropy bias
- transition tendency

Unsupported seed types should be rejected or left as candidates with clear
diagnostics. They should not execute or silently approximate.

## Seed Acceptance And Determinism

Once accepted, a behavioural seed becomes Afterimage-owned composition meaning.

Acceptance should define:

- target scene, layer, behaviour, field, material, or modulation route
- parameter mapping
- deterministic seed ownership
- capture requirements
- replay requirements
- conflict policy
- fallback or rejection policy

Accepted seeds must preserve deterministic capture and export. If a seed
affects replay, capture must record the accepted seed identity and any
performance changes derived from it.

## Seed Conflict Handling

Multiple seeds may target the same behaviour or scene.

Conflict policy must be explicit:

- priority
- weighted blend
- maximum strength
- scene-local override
- human selection
- capture replay override
- reject until resolved

Do not combine seed parameters implicitly.

## World Affinity

World affinity describes why archive intelligence belongs in a world.

Affinity is not search ranking, generic recommendation, or Darklife graph
magic. It is an explainable candidate relationship between archive metadata and
Afterimage world intent.

Affinity scope may be:

- project
- composition
- scene
- layer
- behaviour
- material system
- modulation route
- capture

## Affinity Inputs

World affinity may consider:

- motifs
- atmospheres
- materials
- motion
- recurrence links
- provenance
- accepted user selections
- scene climate
- layer contribution
- behavioural seeds
- capture history
- aesthetic pack compatibility

Every inferred affinity should preserve confidence and explanation.

## Affinity Outputs

Affinity may produce candidates for:

- source fragment participation
- scene climate bias
- layer resurfacing
- material selection
- behaviour seed suggestion
- modulation bias
- recurrence review
- archive resurfacing
- aesthetic pack compatibility

Affinity does not change export meaning until accepted into deterministic
composition or capture state.

## Affinity Acceptance

Accepted affinity should record:

- affinity ID
- source archive references
- target composition scope
- accepted output type
- explanation
- confidence at acceptance time
- provenance
- sidecar identity

The user should be able to inspect why an affinity suggestion exists. Hidden
mutation is not allowed.

## Recurrence

Recurrence describes how motifs, atmospheres, fragments, materials, behaviours,
or captures persist across time.

Recurrence supports memory and mythology. It should not force Afterimage to
load Darklife's full graph.

## Recurrence Fields

A recurrence link should define:

- recurrence ID
- source reference
- target reference
- relationship type
- strength
- explanation
- scope
- provenance
- confidence where inferred
- generator identity where relevant

Source and target references may point to archive items, segments, motifs,
atmospheres, materials, behaviour seeds, captures, or external Darklife graph
nodes when kept as provenance.

## Recurrence Scopes

V1 recurrence scopes include:

- within source
- within project
- across archive
- across captures
- across published artifacts

Afterimage may consume recurrence candidates at any scope, but final export
meaning changes only after acceptance into composition or capture state.

## Recurrence Relationship Types

V1 relationship types include:

- motif repeat
- atmosphere similarity
- material echo
- behavioural echo
- source lineage
- capture reuse
- visual similarity
- performance reuse

Existing schema names should remain stable or be migrated explicitly when the
implementation evolves.

## Recurrence Use In Composition

Accepted recurrence may influence:

- scene memory
- layer resurfacing
- modulation bias
- entropy pressure
- behavioural seed selection
- archive inspection
- capture review

Recurrence must not alter export meaning unless accepted into deterministic
composition or capture state.

## Candidate, Accepted, And Graph Recurrence

Afterimage distinguishes:

- candidate recurrence in an archive sidecar
- accepted recurrence references in composition state
- Darklife graph recurrence in the external intelligence system

Afterimage may reference graph recurrence by external ID for provenance. It
should not require Darklife to be online for replay or export.

## Deterministic References

Project and composition references must use stable IDs.

Reference paths should include:

- archive item ID
- sidecar version or content identity
- source asset ID
- segment ID where time range matters
- motif, atmosphere, material, motion, seed, or recurrence ID
- accepted scope

Do not reference array position, local file order, generated UI labels, or
transient service state.

## Versioning

Archive schema evolution should require:

- architecture update
- JSON schema update
- TypeScript type update
- validator update
- fixture update
- migration or compatibility policy
- diagnostics for older sidecars

Generated metadata changes should be visible through sidecar version, content
identity, generator identity, or explicit regenerated-at metadata.

## Capture And Export

Capture and export require fixed archive inputs.

Replay/export should know:

- which archive sidecars were referenced
- which accepted references participated
- which sidecar versions or content identities were used
- which seeds were accepted
- which recurrence or affinity links affected composition meaning
- which provenance and rights metadata matter for output

Darklife availability must not be required during replay or final export.

## Studio Inspection

Studio should expose:

- archive item identity
- source and provenance
- rights/license state
- segment timeline
- motif candidates and accepted motifs
- atmosphere candidates and accepted atmospheres
- material and motion descriptors
- behavioural seed candidates
- recurrence links
- world affinity explanations
- stale sidecar diagnostics
- missing reference diagnostics
- accepted versus available metadata

Studio should feel like archive archaeology and memory selection, not an
enterprise asset manager.

## Render Graph Boundary

Render graph planning consumes accepted archive meaning.

It may use archive references for:

- source nodes
- archive resurfacing layers
- material pass inputs
- atmosphere pass inputs
- behavioural pass inputs
- modulation bias
- entropy bias
- deterministic seed summaries
- cache keys
- provenance diagnostics

The render graph must not reinterpret archive candidates that have not been
accepted into composition meaning.

## Non-Goals

This document does not introduce:

- extraction algorithms
- computer vision work
- classifier implementation
- Darklife graph storage inside Afterimage
- schema or type changes by itself
- Studio UI implementation
- recommendation magic
- executable archive metadata

## V1 Minimum Shape

Archive work should be able to answer:

- Which source does this metadata describe?
- Which sidecar and version are authoritative?
- Which segments, motifs, atmospheres, materials, motion tags, seeds, affinity
  links, and recurrence links exist?
- Which fields are inferred, curated, or accepted?
- Which provenance and confidence values apply?
- Which accepted references affect composition meaning?
- Which references are deterministic for replay and export?
- Which stale or conflicting metadata blocks use?
- Which data remains in Darklife?

If a feature cannot answer those questions, it is not ready for implementation.
