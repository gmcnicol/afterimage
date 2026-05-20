# Agent Instructions

## Documentation
- Use Context7 for relevant library, SDK, and framework documentation before answering implementation questions or making code changes that depend on external APIs.
- Prefer primary documentation returned via Context7 over memory when behavior, configuration, or APIs may have changed.

## GitHub Workflow
- When finishing ticket work, always open a GitHub pull request.
- Open pull requests as normal open PRs, not draft PRs, unless explicitly asked otherwise.

## Tidy First
- Make small behavior-preserving tidies before implementation when they reduce risk or complexity.
- Keep tidy work scoped to the area being changed.
- Avoid opportunistic cleanup outside the task.
- Prefer separate commits or PRs for broad tidy-only work.
- Preserve public APIs unless the task explicitly changes them.
- Run relevant checks after tidy-only changes and after behavior changes.
