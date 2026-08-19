# Test strategy

How this project is verified, what each level is for, and how to run it. Current as of August 18 2026.

## Levels

**Pure model tests.** Every controller, layout function, reducer, and resolver is testable without a terminal, a mount,
or a frame. These are the bulk of the suite and they run in milliseconds. If a piece of logic needs a rendered frame to
test, that is a signal it is in the wrong place — extract the model.

**Component and layout tests.** A layout function is given a rect and asserted on the rects it returns: rows stay inside
the box, buttons do not overlap the text, a narrow window stacks instead of truncating. Deterministic, no rendering.

**Mounted application tests.** `mod.testing.ts` provides a headless terminal app with a `pilot` that clicks, types, and
scrolls, and a frame buffer that can be read back cell by cell. This is the level that catches what inspection cannot:
an event swallowed before its handler, a frame memoised on a signature that omits the thing that changed. Both of those
shipped and were caught here.

**Golden fixtures.** Where behaviour is a whole-surface property rather than a single assertion, the surface is
captured: `packages/exomux/tests/fixtures/hit_map/` holds an ASCII map of which target owns every cell of the desktop,
so a refactor of the pointer stack is a diff rather than an argument.

**Protocol and skew tests.** The exomux daemon is versioned against clients that may be newer or older. Tests cover both
directions: an unknown message from an authenticated client is refused without dropping the session, a descriptor
carrying unknown fields still loads, and a capability the host never advertised is never exercised.

**Contract tests.** Where an API's meaning is easy to misread, a test pins the meaning rather than the behaviour —
`tests/tui_destroy_contract.test.ts` exists because `destroy()` not emitting `destroy` cost a black screen.

## Running it

```sh
deno test -A                      # root suite (~3,460 tests, ~3 min)
deno test -A --filter "<name>"    # one test
cd packages/exomux && deno test -A # exomux suite (~510 tests, ~2 min)
deno task health                  # the full gate list, as CI runs it
```

Before committing anything that touches modules or public API:

```sh
deno fmt
deno run -A scripts/update_entrypoint_budgets.ts     # export budgets per entrypoint
deno run -A scripts/update_public_api_baseline.ts    # the recorded stable surface
```

Both regenerate a checked-in baseline. A diff in either is the point: it makes an API change visible in review instead
of silent.

## Gates

`deno task health` runs formatting, type checks on every entrypoint and example, a reachability check that no source
module is imported by nothing, the API reference check, package and release checks, and the web build. CI runs `health`
plus a clean release-candidate verification. A green suite with a red gate is not done.

## What is not covered automatically

State these rather than pretending otherwise:

- **GPU rendering fidelity.** The butterchurn GPU path is validated by a fixture rotation and a CPU-vs-GPU comparison,
  but strict-driver failures reproduce only on the maintainer's Intel laptop, not in the sandbox. Debug logs from the
  real machine are the evidence.
- **Live terminal behaviour.** Animations, shaders, and true-colour output are disabled or unobservable in headless
  mounts. They need a human looking at a real terminal, and a task is not complete until that check happens.
- **The live daemon.** Never drive the maintainer's running exomux from a test or a script: it attaches to real PTYs and
  a real tmux. Use an isolated state root (`XDG_STATE_HOME`) and a private tmux socket. Read-only probes — listing
  sessions, a brief attach and detach — are safe and have been used to verify fixes against the real thing.

## Acceptance

A task is complete when its own acceptance checks pass, both suites pass, the gates pass, and — for anything that
changes what a person sees — the maintainer has looked at it running.
