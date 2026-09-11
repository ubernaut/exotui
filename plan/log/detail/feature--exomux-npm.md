# Detailed development log: `feature/exomux-npm`

- **Branch:** `feature/exomux-npm`
- **Started:** 2026-09-11

## 2026-09-11 — npm/npx distribution

The user requested npm/npx installation after reviewing the existing JSR, binary, source, and Nix instructions. Fetched
origin and branched from clean main at `0644933b`. ICC task: `exomux-npm-distribution`; source and derived stores were
fresh. The generic ICC oracle flags unrelated library fallback/transport paths and has no authored npm distribution
criteria; it is not acceptance evidence for this task.

The npm package is a dependency-free Node launcher around the compiled application. The private source template is
staged into an external output directory with the version from `packages/exomux/deno.json`, the exact GitHub release
tag, and SHA-256 checksums/sizes for all four binary assets. Exotui release tags and exomux package versions differ.
Downloads use a per-user content-addressed cache so read-only global packages and npx cache eviction do not remove a
detached daemon's executable. Install-script skipping is handled by downloading on first invocation.

Inspection found the previous release only has Linux x64 and macOS arm64 binaries; the Intel macOS runner label is
retired. npm publishing must wait for all four builds and package smoke tests. The local npm CLI has no authenticated
publisher (`npm whoami` reports ENEEDAUTH); publishing setup remains separate from local implementation/verification.
The build matrix now explicitly uses Bash: the previous Windows upload inherited PowerShell, where its `$TAG` and
`$GITHUB_REPOSITORY` references do not read the configured environment variables.

Verification:

- The 14 installer/launcher tests pass on both Node 22 and Node 24. They cover platform mapping, pinned URLs, checksum
  and size validation, truncated/oversized/interrupted downloads, cache corruption and reuse, concurrent installation,
  release staging, argument boundaries, inherited stdin/stdout/stderr/env/cwd, exit codes, and signal forwarding.
- All four binaries compiled locally (native Linux; cross-compiled macOS arm64/x64 and Windows x64). Linux `--help`
  passed. Native macOS/Windows execution belongs to the release workflow and was not run on this Linux host.
- Staged a local test release tagged `v0.7.3-npm-test` in `/tmp/exomux-npm-build`, then packed a 4,711-byte npm archive
  containing only the launcher, installer, metadata, README, and license. The tag is a local fixture, not a published
  GitHub release. A temporary local HTTP mirror served the real Linux build through a test-only Node fetch preload.
  `npm exec --ignore-scripts` and a temporary global npm installation both launched the actual exomux `--help` command;
  subsequent launches passed offline without the preload. No live daemon was touched. Logs/artifacts stay outside Git.
- `actionlint` 1.7.12 accepts both modified/new workflows. `deno fmt --check` passes. The initial multi-path formatting
  invocation picked an unintended width; re-applied the repository's 120-column config and removed unrelated reflows.
- The first health run inherited `NO_COLOR=1` and failed three ANSI-paint assertions in `tests/focus_model.test.ts`. The
  same focused file passes with `NO_COLOR` unset. `env -u NO_COLOR deno task health` then passed (exit 0): 3,683 root
  tests, 552 exomux tests, 62 web tests, 54 worker tests, and all format/type/API/package/release/build/benchmark gates.
  The initial formatting failure also belongs to the corrected first run.
- `npm publish <test-tarball> --dry-run --access public` passes; packing the unprepared source template fails as
  intended. ICC guard-diff passes with only the expected workflow-path warning. Origin/main remained at `0644933b` when
  re-fetched before integration. Final verification runs against the committed branch before merging locally.

The public registry returns E404 for `@ubernaut/exomux`; `npm whoami` returns ENEEDAUTH and the repository has no
`NPM_TOKEN` secret. No registry package, GitHub release, or tag has been published by this work. The release guide
documents the bootstrap publication and subsequent GitHub OIDC configuration.
