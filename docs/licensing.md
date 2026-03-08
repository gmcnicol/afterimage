# Licensing

## Purpose

This document defines the licensing policy for the Afterimage monorepo.

The goals are:

- keep the repository itself under the MIT License
- only use dependencies that are compatible with commercial distribution
- avoid accidental copyleft contamination
- make third-party obligations explicit and automatable
- treat FFmpeg as a controlled dependency with special handling

---

## Repository License

The Afterimage source repository is licensed under the **MIT License**, unless a subdirectory explicitly states otherwise.

This means:

- our own source code should be written and contributed under terms compatible with MIT
- contributors must not add code copied from incompatible sources
- generated files, templates, presets, and schemas created in this repo are assumed to be MIT unless explicitly noted otherwise

---

## Default Dependency Policy

### Allowed by default

The following license types are generally acceptable for direct dependencies:

- MIT
- BSD-2-Clause
- BSD-3-Clause
- ISC
- Apache-2.0
- Zlib

These are treated as permissive and acceptable for normal use in this project.

### Allowed with review

The following may be acceptable, but must be reviewed before adoption:

- LGPL
- MPL-2.0
- CC-BY assets or content
- dual-licensed packages where one option is permissive and one is copyleft

These are not banned, but they require an explicit decision and documentation.

### Not allowed without explicit written approval

Do not introduce these into the project without an explicit licensing decision:

- GPL
- AGPL
- SSPL
- source-available but non-open-source licenses
- licenses restricting commercial use
- licenses restricting redistribution
- licenses forbidding modification
- assets/fonts/media with unclear or custom licensing

If in doubt, treat the dependency as **not approved** until reviewed.

---

## Special Case: FFmpeg

FFmpeg is a special case and must be handled carefully.

### Policy

We will treat FFmpeg as an **external runtime dependency / bundled binary with documented provenance**, not as a casual unreviewed binary drop-in.

### Required rule

**Use an LGPL-compatible FFmpeg build by default.**

Do not enable or bundle FFmpeg configurations that pull the project into GPL obligations unless we make an explicit product-level decision to do so.

### Practical meaning

- prefer FFmpeg builds configured to remain under LGPL terms
- avoid GPL-only codec/library combinations unless explicitly approved
- record where the FFmpeg binary came from
- record the build flags or package source where possible
- preserve required notices when redistributing FFmpeg binaries

### Repo rule

If a script fetches FFmpeg binaries, that script must be deterministic and documented.

At minimum, document:

- source of the binaries
- target platform
- version
- architecture
- licensing notes
- whether the build is LGPL-only or not

---

## Fonts, Presets, Media, and Assets

Code is not the only licensing risk.

The following must have clear provenance before being committed:

- fonts
- LUTs
- overlays
- textures
- stock footage
- audio tracks
- impulse responses
- sample packs
- shader code copied from elsewhere
- preset packs imported from third parties

### Rule

If an asset did not originate in this repo, it must have one of:

- a clearly permissive license
- a commercial license owned by us
- a written note explaining why it is safe to distribute

If none of those exist, do not commit it.

---

## Dependency Intake Rules

Before adding a new dependency, check:

1. what license it uses
2. whether it is a direct dependency or transitive-only
3. whether it ships code, assets, fonts, codecs, or binaries
4. whether redistribution creates extra obligations
5. whether notices or attribution must be included
6. whether it introduces GPL/AGPL/SSPL risk

### Required for non-trivial dependencies

For anything substantial, add a short note to the relevant ADR or docs file covering:

- why we need it
- its license
- any redistribution obligations
- why it is acceptable

---

## CI and Automation

We should automate license checking.

### JavaScript / TypeScript

CI should include a license scan for workspace dependencies and fail on disallowed licenses.

Suggested checks:

- generate a machine-readable dependency license report
- fail build on banned licenses
- produce a third-party notices artifact for release builds

### Go

CI should also generate a Go dependency license report for the appliance/runtime code.

### Release artifacts

Release pipelines should, where practical, attach or generate:

- third-party notices
- dependency license reports
- FFmpeg binary provenance notes where relevant

---

## Banned Shortcuts

Do not:

- copy random code from blogs, gists, forums, or repositories without checking the license
- commit binaries of unknown origin
- add fonts from “free font” sites without verifying redistribution rights
- bundle FFmpeg builds without recording provenance
- assume npm or GitHub availability means a package is safe to ship
- assume transitive dependencies do not matter

---

## Review Triggers

A licensing review is required if any of the following happen:

- a new media runtime or codec is added
- FFmpeg build strategy changes
- a GPL/LGPL/MPL dependency is proposed
- third-party assets are bundled into releases
- we add cloud services with source-available licenses
- we distribute appliance images or prebuilt hardware bundles

---

## Third-Party Notices

Where required by dependency licenses, we must preserve and ship appropriate third-party notices.

This may include:

- LICENSE files
- NOTICE files
- attribution text
- binary provenance notes

Do not remove upstream license headers from source files when those files are used under their original license.

---

## Decision Rules

### Safe by default
Use permissive dependencies.

### Caution by default
Treat FFmpeg, fonts, codecs, and bundled assets as review-required.

### No by default
Avoid strong copyleft and unclear licensing.

---

## Ownership and Responsibility

Whoever introduces a dependency is responsible for:

- checking the license
- documenting anything non-obvious
- ensuring release obligations are understood
- updating notices if required

Reviewers should reject additions that do not make licensing status clear.

---

## Future Work

Add and maintain:

- `THIRD_PARTY_NOTICES.md` or generated equivalent
- CI license scanning for JS/TS
- CI license scanning for Go
- FFmpeg provenance documentation
- asset provenance tracking for presets/media/fonts/overlays

---

## Non-Legal Disclaimer

This document is an engineering policy, not legal advice.

If the project begins commercial distribution at scale, bundles paid media assets, or ships appliance hardware/images, we should perform a proper legal review of the release process and third-party obligations.