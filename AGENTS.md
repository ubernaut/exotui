# Repository instructions

Planning context lives in `plan/`, in the [vibe-plan](https://github.com/ubernaut/vibe-plan) layout. For every task read
`plan/plan.md`, `plan/todo/priority.md`, and the specific task file when one exists; read `plan/arch/`, `plan/test/`,
and `plan/log/log-summary.md` as they become relevant. Do not load `plan/log/log-detail.md` routinely — scan it when the
work may have been attempted before.

- `plan/plan.md` is the user's. Do not change it without explicit permission.
- Write a task file for work that spans multiple steps or sessions, needs decisions, or needs durable acceptance checks;
  handle small obvious changes directly. Template: `plan/todo/_template.md`.
- Keep planning files accurate in the same change that would make them stale.
- Run `deno fmt`, regenerate `budgets/entrypoints.json` and the public API baseline, and pass both suites and
  `deno task health` before calling anything done. `plan/test/test.md` has the commands.
- Never drive the maintainer's live exomux daemon from a script or test; `plan/test/test.md` explains the safe path.
