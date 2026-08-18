# Engineering principles

The first section is the standing agreement, inherited from [vibe-plan](https://github.com/ubernaut/vibe-plan). The
second is what this repository enforces mechanically, so a principle does not depend on anyone remembering it.

## Principles

**Separation of concerns.** Build separate components with clean interfaces that can be tested, swapped, and read in
isolation. If a change to one thing requires touching five files, the seam is in the wrong place.

**Use supported, well-established dependencies.** Prefer the LTS or best-supported release of a library. Prefer the
popular, battle-tested option unless there is a specific reason not to. Do not adopt anything unmaintained.

**Fit the change to the architecture.** Before adding functionality, work out where it belongs. A shortcut that adds a
feature by chaining onto an existing hack costs more than the feature is worth — and this repository has paid that bill
(see `log/log-detail.md`, pointer input).

**Design fractally.** The same patterns and style repeat at every scale: controller plus view, pure model plus thin
renderer, one authority per concern. A reader who has understood one component should recognise the next.

**Performance is a feature.** Choose algorithms and a concurrency model that suit the hardware. On a GPU, use the
concurrency instead of writing a sequential loop. In a terminal, repaint the range that changed instead of the screen.

## What this repository enforces

These run in `deno task health` and in CI, so they are not optional:

- **`deno fmt --check`** — one formatting authority, no debate.
- **Entrypoint export budgets** (`scripts/update_entrypoint_budgets.ts`, `budgets/entrypoints.json`) — a public
  entrypoint has a documented export count. Growing it is a deliberate act with a diff, not a side effect.
- **Public API baseline** (`scripts/update_public_api_baseline.ts`) — the stable surface is recorded; a change to it
  shows up in review.
- **`deno check` on every entrypoint and example**, so a broken example is a failed build rather than a surprise.
- **API reference generation** checked against `docs/api-reference.md`.
- **Package and release checks** — the published artifact is built and verified, not assumed.

## Working rules that came from mistakes

Each of these exists because ignoring it cost time. The detail is in `log/log-detail.md`.

- **Measure before building an abstraction for a problem you have inferred.** A 183-line coordinate-space model was
  written to correct terminal padding that measured, against the real terminal, to exactly zero.
- **A test must pin the intent, not the implementation.** Two tests were once written that asserted the buggy behaviour,
  and passed happily while the bug shipped.
- **Drive the thing rather than reasoning about it.** Two bugs in one wheel-scroll path — a swallowed event and a stale
  paint signature — were invisible to inspection and obvious the moment the wheel was actually turned in a test.
- **Any protocol or descriptor addition is a version-skew question.** The daemon outlives its clients by design.
- **A geometry function must not depend on the content it lays out** when another caller (the pointer router) has no
  content to hand it.
- **State the tradeoff you took.** Where a decision was a judgement call — a colour outside a supplied palette, a token
  that is editable but not yet painted — say so in the commit and the plan rather than letting it read as complete.
