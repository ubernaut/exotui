# API Stability And Packaging

This fork now treats the package surface as an explicit contract. The source of truth is `src/api_stability.ts`; the
Deno export map in `deno.jsonc`, README guidance, and release notes should stay aligned with that manifest.

## Entrypoints

| Import target   | Source                       | Runtime  | Stability    | Use it for                                                                                                                     |
| --------------- | ---------------------------- | -------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `.`             | `mod.ts`                     | terminal | stable       | Full Deno terminal apps, reusable widgets, app primitives, themes, runtime helpers, tests, and benchmarks.                     |
| `./app`         | `mod.app.ts`                 | terminal | beta         | New terminal apps using the opinionated lifecycle, curated widgets, commands, routes, focus, and plugins.                      |
| `./web`         | `mod.web.ts`                 | browser  | beta         | Standalone browser bundles, GitHub Pages demos, Canvas2D/DOM hosts, browser input, IndexedDB, Workers, and shared controllers. |
| `./remote`      | `mod.remote.ts`              | remote   | experimental | Browser clients and server bridges that connect transports to hosted terminal session handles.                                 |
| `./three-ascii` | `mod.three_ascii.ts`         | shared   | experimental | Focused Acerola-style Three.js/WebGPU ASCII renderer APIs, glyph/block/mixed modes, presets, and renderer options.             |
| `./theme`       | `mod.theme.ts`               | shared   | beta         | Theme engines, semantic tokens, providers, resolvers, galleries, validation, and palette packs.                                |
| `./runtime`     | `mod.runtime.ts`             | shared   | beta         | Scheduling, workers, storage, resources, diagnostics, terminal plans, graphics, and renderer backends.                         |
| `./terminal`    | `mod.terminal.ts`            | terminal | beta         | Input parsing, terminal screens, shell/process sessions, PTY backends, scrollback, and workspaces.                             |
| `./testing`     | `mod.testing.ts`             | terminal | beta         | Downstream headless app interaction, input, snapshot, stdout, and canvas test helpers.                                         |
| `./layout/yoga` | `src/layout/solvers/yoga.ts` | shared   | experimental | Optional Yoga-backed Flexbox solving for HTML/CSS-style layout trees.                                                          |

Local development imports use relative paths:

```ts
import { createThemeProvider, Tui } from "./mod.ts";
import { createTerminalApp } from "./mod.app.ts";
import { createWebTui } from "./mod.web.ts";
import { RemoteTerminalClient } from "./mod.remote.ts";
import { createDefaultAsciiOptions } from "./mod.three_ascii.ts";
import { createThemeEngine } from "./mod.theme.ts";
import { AsyncScheduler } from "./mod.runtime.ts";
import { TerminalScreen } from "./mod.terminal.ts";
import { createTestCanvas } from "./mod.testing.ts";
import { yogaLayoutSolver } from "./src/layout/solvers/yoga.ts";
```

Published package imports should use the same subpaths:

```ts
import { Tui } from "jsr:@ubernaut/exotui";
import { createTerminalApp } from "jsr:@ubernaut/exotui/app";
import { createWebTui } from "jsr:@ubernaut/exotui/web";
import { RemoteTerminalClient } from "jsr:@ubernaut/exotui/remote";
import { createDefaultAsciiOptions } from "jsr:@ubernaut/exotui/three-ascii";
import { createThemeEngine } from "jsr:@ubernaut/exotui/theme";
import { AsyncScheduler } from "jsr:@ubernaut/exotui/runtime";
import { TerminalScreen } from "jsr:@ubernaut/exotui/terminal";
import { createTestCanvas } from "jsr:@ubernaut/exotui/testing";
import { yogaLayoutSolver } from "jsr:@ubernaut/exotui/layout/yoga";
```

The package identity and version are pinned in `deno.jsonc` as `@ubernaut/exotui`. The first upload still requires the
`ubernaut` JSR scope to exist and authorize the publisher; repository checks deliberately stop at a dry run and do not
perform authentication or publication.

## Import Guidance

Application authors should start with the narrowest runtime entrypoint that matches where their app runs:

- Use `./app` for new terminal applications. It provides the recommended `TerminalApp` lifecycle and a curated widget,
  layout, signal, theme, command, route, and plugin surface.
- Use `.` for Deno terminal applications, reusable terminal widgets, themes, app commands, testing helpers, and
  terminal-rendered Three ASCII widgets that need the broad compatibility surface.
- Use `./web` for standalone browser packages, GitHub Pages demos, Canvas2D/DOM hosts, browser input, IndexedDB-backed
  state, and Worker-friendly controllers.
- Use `./remote` only when building a browser client or bridge for a hosted terminal session.
- Use `./three-ascii` for renderer-focused integrations that need the Acerola-style node, glyph/block/mixed modes,
  presets, or shared ASCII options without importing the full terminal package.
- Use `./theme` for shared theme tooling without terminal or browser hosts.
- Use `./runtime` for schedulers, workers, resources, stores, diagnostics, and backend policy.
- Use `./terminal` for input parsing, terminal sessions, PTY integration, screens, and scrollback.
- Use `./testing` for downstream headless interaction and snapshot tests.
- Use `./layout/yoga` only when the optional Yoga dependency is acceptable and Flexbox parity matters more than a
  dependency-free layout solver.

Framework authors can import the same entrypoints, then layer their own submodules behind project-local shims. Avoid
importing from `app/*`, `examples/*`, or `scripts/*`; those files demonstrate behavior and are intentionally not
semver-protected package surfaces.

## Stability Tiers

- **Stable:** Semver-protected public API. Breaking changes require a major release, or an explicit pre-1.0 breaking
  change note while this fork is still stabilizing.
- **Beta:** Intended for adoption, but still expected to evolve. Breaking changes are allowed in minor releases when the
  changelog includes migration notes.
- **Experimental:** Useful and public, but not yet contract-stable. The changelog must call out affected experimental
  surfaces when behavior changes.
- **Internal:** Demo apps, examples, scripts, generated assets, and contributor tooling. These are not package
  entrypoints and may change to support the library.

Current marked surfaces:

- `mod.ts`: stable terminal package.
- `mod.app.ts`: beta focused application package and recommended starting point for new terminal apps.
- `mod.web.ts`: beta standalone browser package.
- `mod.remote.ts`: experimental remote-terminal client and bridge.
- `mod.three_ascii.ts`: experimental focused Three ASCII renderer package.
- `mod.theme.ts`: beta theme package.
- `mod.runtime.ts`: beta runtime and concurrency package.
- `mod.terminal.ts`: beta terminal integration package.
- `mod.testing.ts`: beta downstream test package.
- `src/layout/solvers/yoga.ts`: experimental optional Yoga-backed Flexbox solver.
- `src/three_ascii/*`: experimental renderer internals and presets, even when re-exported for demos.
- `src/runtime/graphics_surface.ts`: experimental raster graphics surface abstraction.
- `src/runtime/kitty_graphics.ts`: experimental Kitty terminal graphics protocol helpers.
- `src/runtime/pty_backend.ts`: experimental optional PTY adapter over Sigma PTY FFI. It is lazy and provider-based so
  normal terminal imports do not require native FFI setup.
- `app/*`, `examples/*`, and `scripts/*`: internal/demo surfaces.

## Release Policy

Every externally useful release should update `CHANGELOG.md`. Use these sections when relevant:

- `Added` for new public APIs, widgets, demos, package subpaths, and platform support.
- `Changed` for behavioral updates and beta/experimental API movement.
- `Deprecated` for stable APIs that will be removed or renamed later.
- `Removed` for public removals.
- `Fixed` for bug fixes and compatibility repairs.
- `Security` for security-sensitive changes.

Before a release, run:

```bash
deno task health
deno task release-check -- --clean
```

`deno task release-check` runs the package policy checks followed by a strict `deno publish --dry-run`. It does not use
`--allow-slow-types`, so JSR declaration generation and Node.js compatibility remain part of the gate. During normal
development the task allows a dirty worktree so it can run inside `deno task health`; `--clean` removes that allowance
for the final release candidate. The task also isolates Deno from an unrelated root `package.json` and reports the file
count and approximate upload size.

The publish allowlist contains only release metadata, root entrypoints, and `src/**/*.ts`. Demo applications, examples,
tests, scripts, plans, screenshots, generated browser assets, and the generated API reference remain in the repository
but are not uploaded to JSR. `deno task package-check` treats changes to that allowlist as reviewed package-policy
changes, which prevents accidental artifact bloat.

`deno task package-check` compares `deno.jsonc` exports with `packageEntrypoints`, verifies the entrypoint files exist,
checks the package identity, SemVer version, and publish allowlist, reports drift separately for stable, beta,
experimental, and internal tiers, and blocks new `src/app/*` modules from leaking through the stable root entrypoint
unless the legacy app-module allowlist in `docs/api-stable-app-modules.json` is intentionally updated. The current
stable root still exposes older app and Workbench helper modules for compatibility; new Workbench implementation helpers
should stay behind focused modules or app-local imports until they are intentionally promoted. Stale entries in the
app-module allowlist also fail the package check, so removing a stable app export must remove its compatibility-policy
entry in the same change.
`deno task api-inventory -- --check --quiet --fail-duplicates --min-doc-coverage=1
--baseline=docs/api-stable-baseline.json`
enforces a duplicate-free stable re-export graph with 100% JSDoc coverage and fails if the stable root API changes
without an intentional baseline update. `deno task api-reference > docs/api-reference.md` generates the full
stable/beta/experimental reference and should continue to show 100% documentation coverage for every public entrypoint.

## Adding A Public API

1. Add implementation under the owning module family.
2. Add focused tests for behavior and any cross-runtime expectations.
3. Add JSDoc before exporting; public docs coverage is expected to remain 100%.
4. Re-export through the appropriate module entrypoint.
5. If the API creates a new package surface or changes stability expectations, update `src/api_stability.ts`,
   `deno.jsonc`, this document, and `CHANGELOG.md`.
6. If the change intentionally adds a stable root `src/app/*` module, update the legacy app-module allowlist in
   `docs/api-stable-app-modules.json` and document why the helper belongs on the stable package surface instead of a
   focused subpath.
7. If the change intentionally adds or removes a stable root export, regenerate `docs/api-stable-baseline.json` with
   `deno run -A ./scripts/api_inventory.ts mod.ts --update-baseline=docs/api-stable-baseline.json --quiet`.
8. Regenerate `docs/api-reference.md` with `deno task api-reference > docs/api-reference.md`.
