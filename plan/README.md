# Planning guide

This directory holds the durable context needed to understand and continue the project. Keep it useful and small: record
information only when it will affect future work or prevent a decision from being repeated.

Structure follows [vibe-plan](https://github.com/ubernaut/vibe-plan).

## What to read

For every task, read:

1. `plan.md` for scope and intended outcomes.
2. `todo/priority.md` for the current order of work.
3. The specific task file, when one exists.

Read relevant files from `arch/`, `test/`, `refs/`, and `log/log-summary.md` as needed. Do not load `log/log-detail.md`
by default; scan it — with a targeted search rather than a full read — when the current task may have been attempted
before, or when a subsystem has a history of failed approaches. That reading rule does not make detailed logging
optional.

## What belongs where

- `plan.md`: user-owned scope, goals, non-goals, success criteria, and high-level direction. Update only with explicit
  permission.
- `todo/priority.md`: a short, ordered list of the next actionable tasks.
- `todo/`: one file for work that spans multiple steps or sessions, requires meaningful decisions, or needs durable
  acceptance criteria. Handle small, obvious changes directly rather than writing a task file for them.
- `todo/done/`: completed task files worth retaining.
- `todo/hiatus/`: paused task files that may be resumed.
- `arch/`: cross-cutting architecture, stack choices, and decisions that affect more than one task. Do not document what
  is already obvious from the code.
- `test/`: the shared test strategy and project-wide completion expectations. Task-specific acceptance checks belong in
  the task file.
- `log/log-summary.md`: concise durable progress, decisions, and pivots.
- `log/log-detail.md`: the development record — attempts, failures, pivots, and reproductions, in enough detail that the
  same ground is not retrodden.
- `refs/`: reference material that is actually used; link each reference from the plan or task that needs it.

Use `todo/_template.md` when a task file is warranted. Delete unused sections rather than filling them with boilerplate.

## Current and target state

When a document describes a desired state that differs from the repository, add brief `Current state` and `Target state`
sections to that document. Remove the distinction once the target is reached. There is no separate drift register.

## Maintenance

Update planning files in the same change that makes them inaccurate. Keep the priority list short. When work finishes or
pauses, move its task file and remove it from the active queue.

## Conventions specific to this repo

- Task files are numbered in creation order (`NNN-slug.md`) and numbers are never reused. Gaps are work that was folded
  into another task or abandoned.
- A task file opens with a `Status:` line carrying a date. Anything without one is a design note, not a task.
- Work is sliced so each slice is independently testable and lands on its own. A slice that cannot be tested without
  three others is a sign the seam is in the wrong place.
