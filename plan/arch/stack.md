# Stack

What this project runs on, and why. Current as of August 18 2026.

## Runtime

**Deno** (TypeScript, ESM, `deno.jsonc` workspace). Chosen for a batteries-included toolchain — formatter, linter,
type-checker, test runner, permissions, and `deno compile` — with no build step and no `node_modules`. Permissions
matter here: exomux spawns PTYs and opens a loopback socket, and the runtime makes that explicit.

## Dependencies

**The library core has no runtime dependencies.** That is a deliberate constraint, not an accident: a TUI toolkit that
drags a dependency tree into every application is a toolkit people vendor around. Where an outside capability is
genuinely needed it is isolated behind a module boundary and made optional:

- **Layout solvers** — Yoga and Taffy are available as opt-in entrypoints (`@ubernaut/deno-tui/layout/yoga`,
  `/layout/taffy`). The built-in flex, grid, and linear layouts have no dependency.
- **PTY** — exomux uses a sigma PTY backend, selected at runtime through `selectExomuxTerminalBackend`, so the host
  degrades rather than failing when a backend is unavailable.
- **butterchurn** — the MilkDrop-style visualiser backgrounds, GPU where WebGPU exists and a CPU renderer where it does
  not. Confined to exomux's background layer.

exomux is a standalone package with its own import map and lockfile, deliberately **not** a workspace member: a Deno
workspace shares one npm resolution and `deno compile` materialises all of it, which put ~48 MB of unrelated packages
into the binary.

## Surfaces

| Surface  | Entrypoint       | Notes                                                            |
| -------- | ---------------- | ---------------------------------------------------------------- |
| Terminal | `mod.ts`         | ANSI sink, capability detection, kitty graphics where supported  |
| App      | `mod.app.ts`     | Opinionated lifecycle: routes, commands, keymaps, windowing      |
| Browser  | `mod.web.ts`     | Canvas sink, the same components, GitHub Pages build             |
| Remote   | `mod.remote.ts`  | The desktop over a link                                          |
| Theme    | `mod.theme.ts`   | Tokens, control vocabulary, OKLCH, contrast, interchange         |
| Testing  | `mod.testing.ts` | Headless mounts, a pilot that clicks and types, frame inspection |

## Storage and formats

- **Themes** — one JSON document per theme (`ThemeDocument` v2: name plus a sparse map of token to RGB), in
  `~/.config/exomux/themes/`. Written to a temporary file and renamed, so an interrupted save cannot leave half a theme.
- **exomux config** — `~/.config/exomux/exomux.json`, watched for live shader changes.
- **Session state** — `~/.local/state/deno-tui/exomux/`: one host descriptor per session plus a window layout. The
  descriptor carries the loopback URL, an auth token, and the capabilities the daemon advertises.
- **Protocol** — JSON over a loopback WebSocket, token-authenticated, with a bounded replay ring per session.
