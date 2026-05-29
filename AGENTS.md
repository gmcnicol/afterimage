# Agent Instructions

## Documentation
- Use Context7 for relevant library, SDK, and framework documentation before answering implementation questions or making code changes that depend on external APIs.
- Prefer primary documentation returned via Context7 over memory when behavior, configuration, or APIs may have changed.

## GitHub Workflow
- When finishing ticket work, always open a GitHub pull request.
- Open pull requests as normal open PRs, not draft PRs, unless explicitly asked otherwise.
- When the user replies "lgtm" or "LGTM" after a PR handoff, treat it as approval to proceed with the current PR: check the PR status, merge it if checks are green, close the Linear tickets covered by the merged PR, and report the result. If checks are pending or failing, do not merge or close tickets; report the blocking check status and the next action.

## Linear
- In this repo, ticket and project management references mean Linear unless the user explicitly names another tracker.
- When the user says "tickets", "milestone", "M4", "issue", or "backlog" in an Afterimage planning context, treat it as Linear work first.
- When the user asks "what's next?", treat it as a request for the next item in the Linear backlog, not as a generic workflow/status question.
- After merging a PR, update the Linear issues that the PR explicitly completed to Done and link or mention the merged PR when the tool supports it. Do not close unrelated or only partially completed tickets; leave a note or report the remaining scope instead.

## Screenshots
- At the end of each ticket with visible UI changes, capture final screenshots for the user.
- Store screenshots in a stable ignored path such as `screenshots/<ticket-or-branch-slug>/`, not Playwright `test-results`, because test runs may clear that directory.
- Include direct local links to the screenshots in the final handoff.

## Tidy First
- Make small behavior-preserving tidies before implementation when they reduce risk or complexity.
- Keep tidy work scoped to the area being changed.
- Avoid opportunistic cleanup outside the task.
- Prefer separate commits or PRs for broad tidy-only work.
- Preserve public APIs unless the task explicitly changes them.
- Run relevant checks after tidy-only changes and after behavior changes.
