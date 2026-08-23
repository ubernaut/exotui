# Agent instructions

Before starting work, read:

1. `plan/README.md`
2. `plan/plan.md`
3. `plan/todo/priority.md`

Then read only the task, workflow, architecture, test, reference, and summary-log files relevant to the work. Do not
load `plan/log/detail/` by default. Decide whether to scan a branch log there when the task may overlap prior attempts,
failures, pivots, or unresolved work. Prefer a targeted search before reading a whole file.

Keep planning documents aligned with the implementation. Do not edit `plan/plan.md` without explicit user permission.
Keep the current branch's detailed development log updated even though those logs are excluded from routine reading.
Under `plan/log/detail/`, a log is named for its branch with `/` replaced by `--`; `feature/exomux-remote` uses
`feature--exomux-remote.md`.
