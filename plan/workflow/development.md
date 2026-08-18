# Development workflow

Use the smallest complete loop that moves the project forward without losing important context. Adapted from
[vibe-plan](https://github.com/ubernaut/vibe-plan); the concrete steps are this repository's.

## The loop

1. **Orient.** Read `plan/README.md`, `plan/plan.md`, and `plan/todo/priority.md`, then load only what the work needs.
   Inspect the live repository before trusting documentation — a plan that reads as current can still be stale, and two
   claims in this one were. Scan `log/log-detail.md` when the area has a history of failed approaches.
2. **Define the outcome.** State what should be observably true when the work is done. Write a task file only when the
   work spans sessions, needs decisions, or needs durable acceptance checks; handle small obvious changes directly.
3. **Investigate.** Find the affected code, interfaces, tests, and constraints. **Measure before modelling.** Two of
   this project's worst hours went into a coordinate-space abstraction for terminal padding that measured to exactly
   zero, and its best ten minutes went into profiling a slow wrap before optimising the loop everyone would have guessed
   at — the cost was 77% somewhere else.
4. **Implement.** The smallest coherent change that satisfies the outcome. Follow the shape already here: a pure
   controller with the logic, a thin view that draws it. No unrelated refactors riding along.
5. **Verify.** Focused first, then broad:
   - the specific test file, then the package suite (`cd packages/exomux && deno test -A`), then the root suite
     (`deno test -A`), then `deno task health` — which type-checks files neither suite reaches. A green suite with a red
     gate is not done.
   - `deno fmt`, and regenerate `budgets/entrypoints.json` and the public API baseline whenever modules or exports move.
     Both are checked in; the diff is the point.
   - **Drive it rather than reasoning about it.** Press the key, turn the wheel, click the button in a mounted test.
     Three bugs this month were invisible to inspection and obvious on the first real interaction.
   - Say what the tests cannot see: animations, shaders, GPU fidelity and true-colour output need the maintainer's real
     terminal. See `plan/test/test.md`.
6. **Reconcile.** Update the planning, architecture, testing, and workflow documents this change made inaccurate, in the
   same change. Add durable outcomes to `log/log-summary.md` and the attempts, failures and reproductions to
   `log/log-detail.md`.
7. **Integrate.** Follow `version-control.md`. Leave the worktree clean, and report the result, the verification
   actually performed, and anything left undone.

If blocked, record the evidence and the next useful action in the task file or the log rather than leaving it in a head.
Do not add process artifacts when a note is enough.

## Standing rules that came from mistakes

- A test states the intent. If it reads like a description of the current code, it is not a test — two tests here once
  asserted the bug and passed happily.
- Any protocol, descriptor, or capability change is a version-skew question first: the exomux daemon outlives its
  clients by design.
- A geometry function must not depend on the content it lays out when another caller has no content to give it.
- State the tradeoff you took. A tradeoff named is fine; one implied to be complete is not.
