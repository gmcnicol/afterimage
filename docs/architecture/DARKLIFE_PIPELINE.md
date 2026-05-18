# Darklife Pipeline

## Purpose

Darklife is the archive intelligence and mythology engine around Afterimage.

Darklife remembers. Afterimage dreams.

Darklife enriches media into motifs, atmospheres, recurrence, and publishing
adaptations. Afterimage consumes selected outputs as archive metadata and
behavioural seeds.

## Responsibilities

Darklife owns cut detection, scene segmentation, computer vision tagging,
atmosphere classification, motif extraction, recurrence detection, archive
enrichment, publishing adaptation, reels and shorts generation, and livestream
harvesting.

Afterimage owns world state, scene climates, behavioural runtime semantics,
modulation, render graph planning, capture, and deterministic export.

## Inputs

Darklife may ingest public domain footage, Afterimage captures, livestream
recordings, narration fragments, textures, overlays, still images, and
generated artifacts.

Each input must carry provenance before it can feed reusable archive metadata.

## Extraction Pipeline

The pipeline stages are:

1. Ingest source media and provenance.
2. Probe technical metadata.
3. Detect cuts and segment candidates.
4. Extract thumbnails and visual summaries.
5. Run motion, color, texture, and atmosphere classifiers.
6. Generate motif candidates.
7. Detect recurrence within and across sources.
8. Produce archive metadata sidecars.
9. Produce publishing candidates where appropriate.
10. Feed selected behaviour seeds back into Afterimage.

Early implementations may use simple heuristics. The contract should still
separate extracted intelligence from Afterimage runtime meaning.

## Extracted Signals

Extraction can produce motifs, symbolic recurrence, emotional spikes, motion
characteristics, material characteristics, atmosphere clusters, visual texture
descriptors, narration or caption descriptors, and behavioural seed candidates.

Signals must include confidence when inferred.

## Outputs

Darklife outputs include enriched archive metadata, motif graphs, recurrence
maps, reels or shorts campaigns, teaser fragments, livestream promotional
shards, and behavioural seeds for Afterimage.

Afterimage should consume only the outputs relevant to composition and
performance. Publishing artifacts remain outside the Afterimage core.

## Motif Graph

A motif graph links recurring symbols, places, textures, atmospheres, and
behaviours.

Graph edges may represent visual similarity, temporal recurrence, atmosphere
similarity, source lineage, performance reuse, and publishing adaptation.

The graph belongs in Darklife. Afterimage may reference graph nodes through
archive contracts.

## Feedback Loop

Afterimage captures can return to Darklife.

The loop is:

```text
Archive source
-> Darklife intelligence
-> Afterimage world
-> performance capture
-> Darklife enrichment
-> new motifs and recurrence
```

This enables recursive mythology without merging the systems.

## Publishing Adaptation

Publishing adaptation includes short-form edits, teaser fragments, campaign
grouping, title and description candidates, and livestream promotional shards.

These outputs are not core runtime semantics. They may reference captures and
motifs, but they do not define how Afterimage performs a world.

## Long-Term Direction

Darklife should support recursive mythology systems, recurring audiovisual
identity, cross-project emotional continuity, motif-driven social campaigns,
and archive loops between Darklife and Afterimage.

The boundary remains stable: Darklife remembers and enriches. Afterimage
performs and renders.

