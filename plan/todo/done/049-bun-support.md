Status: complete, 2026-10-09

# Complete Bun support for exotui and exomux

## Outcome

All existing library, example, tooling and exomux functionality runs on Bun, including native GPU rendering and compute
through `bun-webgpu`. Preserve the Deno and browser paths and the shared application/component architecture. Work lives
on `feature/bun-support`; this task does not authorize changing `plan/plan.md`.

## Current state

The Bun host boundary, native PTY backend, optional native GPU support, packaged entrypoints, examples, tooling and
Exomux are implemented. Source and standalone hardware probes pass. All 52 health gates pass, including Deno/browser
regressions. Bun suites pass 3,707 library and 563 Exomux tests. Source and standalone execution are verified on Linux;
other platform terminal and GPU availability retains native runtime constraints.

## Acceptance checks

- [x] Branch created and the complete task preserved in ICC and this document.
- [x] Every published entrypoint imports through a packaged Bun consumer; portable consumer types pass checking.
- [x] Terminal widgets, raw/cbreak input, mouse, paste, focus, resizing, signals and shutdown work under Bun.
- [x] Filesystem stores, watchers, Linux process inspection, subprocess sessions and workers retain their contracts.
- [x] Optional Yoga/Taffy integrations, image handling, examples and tooling run through documented Bun commands.
- [x] Native `bun-webgpu` initializes and real compute/readback, Three ASCII rendering, turbulence and butterchurn run;
      a CPU fallback or a mock GPU does not prove this requirement.
- [x] Exomux starts and discovers its isolated daemon, launches and resizes real PTYs, handles input/output, detaches,
      reattaches with retained scrollback, persists session/theme/config state and shuts down its own processes.
- [x] Exomux client/daemon protocol and version-skew behavior remain compatible with Deno implementations.
- [x] Root and exomux suites run under Bun with meaningful lifecycle/resource checks, and Deno regression suites pass.
- [x] Browser builds and existing health/release/API/budget checks pass on the completed change.
- [x] Documentation, package manifests, CI and the branch development log reflect verified support and platform limits.

## Implementation seams

Use one explicit host boundary for Deno/Bun terminal, filesystem, process and server operations; preserve pure/browser
modules. Bun PTYs implement the existing TerminalBackend contract. Native GPU initialization is lazy and isolated from
browser and Deno imports. Bindings and optional integrations are pinned separately from the dependency-free core.

## Verification isolation

Keep runtime artifacts outside the repository. Exomux checks use private state/config directories and a private tmux
socket. Never connect tests to the maintainer's live daemon. GPU evidence must use this machine's actual adapter, and
test helpers must distinguish unavailable hardware from successful acceleration.

## Verified result

Bun 1.4.0, bun-webgpu 0.1.7 and an actual NVIDIA RTX 5060 Ti were used. All 16 packed entrypoints pass strict portable
consumer checks. Real terminal input, mode restoration, resizing, signals and shell job control pass. Four Deno/Bun
client-daemon combinations and freshly compiled Exomux pass replay, lifecycle, job control and private-state cleanup.
The existing generic ICC audit retains unrelated baseline debt; no suppression or release policy was weakened. Changes
are prepared on feature/bun-support and have not been published or merged. See the
[branch development log](../../log/detail/feature--bun-support.md) for decisions, failures and verification evidence.
