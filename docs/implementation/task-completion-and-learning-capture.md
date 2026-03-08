# Task Completion And Learning Capture

## Purpose
Define the shared task-completion rule for all implementation phases.

## Task completion rule
Do not treat a meaningful task as complete until learning capture has been handled.

At the end of a meaningful task, do exactly one of the following:

1. create a new short PEP note
2. update an existing PEP note
3. record that there were no new learnings in the task summary

## What counts as a meaningful task
A meaningful task includes work that discovers or confirms:

- a pitfall to avoid
- a portability issue
- a successful pattern worth repeating
- a design rule that should become permanent
- a runtime or packaging constraint
- a false start that should not be retried
- a measurable performance issue or win

## When to write a PEP
Create or update a PEP note when any of the following happens:

- a bug costs more than 30 minutes to diagnose
- a design assumption turns out wrong
- an FFmpeg command or graph behaves unexpectedly
- a cross-platform issue appears
- a latency or stability issue is discovered
- a workflow or coding pattern works especially well
- a lesson would prevent future rework

## PEP rules
PEPs must be:

- short
- specific
- written in plain English
- committed alongside or immediately after the related change

Prefer:

- one learning per PEP
- one rule per PEP
- no essays
- no vague retrospectives

## Related documents
- `docs/peps/README.md`
- `docs/peps/PEP-0000-learning-note-process.md`
- `docs/implementation/templates/pep-note-template.md`
