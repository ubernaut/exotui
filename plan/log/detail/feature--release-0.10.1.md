# Detailed development log: `feature/release-0.10.1`

- **Branch:** `feature/release-0.10.1`
- **Started:** 2026-11-19

## 2026-11-19 — Release exotui 0.10.1

### Prompt

The maintainer asked for a new release to be pushed out.

### Response and strategy

`v0.10.0` was tagged on November 18. `main` was 14 commits past it, all from `feature/web-loading-scroll-speed`: wheel
scroll speed, the loading bar, the longer touch coast and the full snap preview. `git diff --stat v0.10.0..main` touches
`examples/web/`, `docs/`, `scripts/build_web_docs.ts`, tests and planning files, and nothing under `src/` or
`packages/exomux/`.

So this is a patch release of the library only: `deno.jsonc` and `package.json` go to 0.10.1 and the Unreleased
changelog entries move under a 0.10.1 heading. Exomux stays at 0.6.0; its `^0.10.0` range on the library already admits
0.10.1, so `packages/exomux/deno.json` is untouched. The `v0.10.1` tag still builds exomux binaries for the GitHub
release, and the npm job leaves the existing 0.6.0 unchanged.
