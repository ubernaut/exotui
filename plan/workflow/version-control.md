# Version-control workflow

Trunk-based development. `main` is the trunk and stays releasable: a commit on `main` should pass `deno task health`.

Adapted from [vibe-plan](https://github.com/ubernaut/vibe-plan). Where that document assumes deployable services, this
one substitutes what this project actually has.

## Working rules

- Integrate small, complete changes frequently. No long-lived development, release, or integration branches.
- Start each change from current `main` on a short-lived `feature/` or `bug/` branch. Development does not happen on
  `main`.
- Keep commits focused and describe the **outcome** in the message, not the activity. Explain why, since the diff
  already says what.
- Sync with `origin/main` before integrating; rebase the branch onto it, resolve conflicts on the branch, and rerun the
  affected checks.
- Never force-push `main`, and do not rewrite commits already shared.
- Preserve unrelated local changes. Do not sweep someone else's work into a commit.
- Keep credentials, runtime state, and large disposable artifacts out of version control. exomux's session state,
  descriptors and auth tokens live under `~/.local/state/deno-tui/exomux/` and belong nowhere near the repository.

## Typical loop

1. **Branch from `main`.** Confirm a clean worktree, fetch, and branch from current `main`.
2. **Develop locally.** Work until the change is complete and the focused tests pass. Keep commits focused.
3. **Reconcile with upstream.** If `origin/main` has advanced, rebase and re-run the affected checks.
4. **Open or update a pull request.** Push the branch and open a PR to `main`. Put the verification evidence in the
   body: which suites ran, what `deno task health` said, and what a human still needs to look at.
5. **Test the revision.** See below — there is no deploy target, so this step is the gate list plus, where relevant, a
   human at a real terminal.
6. **Merge and clean up.** When the checks pass, merge into `main`, confirm the trunk is still green, and delete the
   branch. If they fail, fix on the branch and repeat from step 2.

Any change to the tested revision invalidates its evidence: rerun rather than assume.

## What "integrated testing" means here

There is no staging environment to deploy a PR to — this is a library plus a terminal application that runs on the
maintainer's machine. The equivalents, in order of what a change touches:

- **Always:** `deno task health` on the exact revision. It runs formatting, type checks on every entrypoint and example,
  the API reference check, package and release checks, the web build, the benchmark budgets, and all four test suites.
- **Anything visible:** the maintainer runs it in a real terminal. Headless mounts disable animations and shaders, GPU
  fidelity reproduces only on their hardware, and every screenshot path from the sandbox returns black. A task that
  changes what a person sees is not complete until they have looked at it.
- **Protocol, descriptor, or daemon changes:** check version skew both ways before merging.
  `git worktree add <dir>
  <old-sha>` and run that build's host against the new client, and vice versa. A daemon that
  has been up for hours must survive a client upgrade, and a fresh client must not brick an old daemon.
- **Never:** point a test or a script at the maintainer's live exomux daemon. It holds real PTYs and a real tmux server.
  Isolate with `XDG_STATE_HOME` and a private tmux socket; read-only probes against the live daemon (list, a brief
  attach and detach) are safe and have been used to confirm fixes against the real thing.

## Releases

Cut releases from known commits on `main`. `deno task release-check` and `deno task package-check` verify the published
artifact; `CHANGELOG.md` records user-facing behaviour; tag when a durable release identifier is needed. Urgent fixes go
through the same `bug/` branch loop and are prioritised into `main` so a later release cannot lose them.

For work that has to reach `main` incomplete, keep it behind a flag or an inactive path and still run the full loop.

## Current state vs target

**Current:** every commit up to `ab98acbc` went straight to `main` and was pushed, which is why `main`'s history is a
sequence of single large commits rather than merges. The loop starts with this document: it and the plan corrections
beside it are being developed on `feature/trunk-based-workflow` and reach `main` as a branch, not as a direct commit.
The releasable-trunk rule at the top of this file is still aspirational — `main` fails six `deno task health` gates (see
`../todo/priority.md`) and does not hold until `bug/health-gates` lands.

**Target:** the loop above, starting with the change that adds this document. The rule that matters most in a
one-maintainer repository is not the pull request itself but what the pull request forces: a branch that can be thrown
away, and evidence attached to the revision that was actually tested.
