# Codex Task Prompt

You are working in this repository as a fresh Codex context.

## Required Setup

1. Read `TASKS.md` first.
2. Review enough of the project to understand the task area before editing.
3. Pick exactly one task to work on.

## Task Selection

- If any task has `status: in-progress`, pick that task and continue it.
- Otherwise, pick the highest-priority `status: backlog` task whose dependencies are complete.
- Do not start multiple tasks.
- Do not do opportunistic cleanup outside the selected task.

## Before Starting

- Update `TASKS.md` to mark the selected task as `status: in-progress`.
- Keep the edit focused so a later context can see which task is active.

## During Work

- Complete the selected task only.
- Follow existing project patterns and tests.
- Prefer small, reviewable changes.
- If the task scope is ambiguous, choose the smallest interpretation that satisfies the acceptance criteria.

## At The End

Update `TASKS.md` before finishing:

- If the task is complete, mark it `status: done`.
- If the task is not complete, leave it `status: in-progress` and document what remains.
- Add brief notes for the next context window:
  - successful approaches
  - pitfalls or failed approaches
  - commands/tests run
  - any remaining risks

Commit changes before finishing:

- Commit focused changes for the selected task.
- Include the `TASKS.md` status/notes update in the same commit.
- If the task is incomplete, still commit the useful partial work and documented remaining steps unless the worktree is known to be broken beyond the documented task state.
- Leave the worktree clean except for explicitly documented external artifacts that should not be committed.

The final response should state:

- which task was selected
- whether it is complete
- what changed
- what verification ran
- the commit hash
