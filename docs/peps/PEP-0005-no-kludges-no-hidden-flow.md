# PEP-0005: No Kludges, No Hidden Flow

## Context
Studio/Desktop slipped into a pattern of shipping behavior through oversized files, renderer-side side effects, silent persistence rules, and “temporary” fixes that stacked on top of each other instead of tightening the architecture.

## Observation
The fastest way to make this app brittle is to hide responsibility boundaries:
- monolithic UI files that own layout, state orchestration, side effects, and feature logic at once
- persistence behavior that is implicit instead of deliberate
- renderer code that reaches across process boundaries without a narrow contract
- ad hoc hotfixes that patch symptoms but leave the control flow harder to reason about

## Impact
That style produces exactly the failure mode we want to avoid: duplicate loads, noisy startup, broken save behavior, unclear selection scope, brittle background job UX, and regressions that only show up when the app is already in the user’s hands.

## Rule
For Studio/Desktop work, the bar is:
- `App.tsx` is shell/orchestration only, not the feature implementation site
- hooks own lifecycle and process coordination
- views own tab-level behavior
- shared components own reusable rendering primitives
- main-process services own filesystem, dialogs, tool execution, and cached session state
- renderer state changes must be explicit and traceable; no hidden mutation paths
- persistence behavior must be deliberate and user-comprehensible; no silent “maybe saved, maybe not” flows
- temporary hacks are not acceptable unless they are isolated, named, and scheduled for removal in the same task stream

## Enforcement
When a change cannot be explained with a clear ownership boundary, it is not ready.
When a bug fix adds more hidden coupling than it removes, it is not acceptable.
When a feature requires “just trust the flow” to understand it, the design is not finished.

## Phase
studio-desktop

## Tags
architecture, renderer, electron, state-management, engineering-discipline
