# Detailed development log: `feature/terminal-mouse-selection`

- **Branch:** `feature/terminal-mouse-selection`
- **Started:** 2026-09-12

## 2026-09-12 — Terminal mouse selection and copying

User requested better mouse selection/copy in exomux, then asked whether the feature belongs in exotui. The reusable
model is now `src/runtime/terminal_selection.ts`, exported from runtime, terminal, web, and transitively root. It owns
snapshot cells, inclusive cell/word/line ranges, reverse drags, wide-glyph boundaries and plain-text extraction. Exomux
owns pane targeting, pointer capture, child-reporting arbitration, themed highlighting and OSC 52 writes. Shift starts
local selection over child mouse reporting; ordinary child mouse and touch routing remain available.

The first mounted test caught selection being cleared by the geometry subscription on every render revision (focus and
selection republish the projection). Removed unconditional clearing there; actual terminal dimension changes clear the
model. Added keyboard ingress clearing as normal typing bypasses the workbench key barrier. Clipboard payloads use the
existing 100 KB byte limit and explicitly reject oversized selections instead of silently truncating to the network copy
action's 1,024 characters.

Scope: select within the currently visible live, alternate, or scrollback viewport. The visible snapshot remains until
Escape, typing, paste, wheel, another mouse gesture, or resize; output continues in the screen model. Soft wraps retain
newlines because the terminal screen has no wrap metadata. No cross-viewport drag autoscroll in this slice. Host
clipboard acceptance and modifier interception still require a real terminal check.

Verification so far: five library selection tests and all 100 mounted app tests passed. Final suite/health evidence will
be appended after running the release checks. ICC saved task: `exomux-mouse-selection`; unrelated generated plugin/GPU
plan items were replaced with the authorized selection scope. Initial sandbox denied Git and ICC artifact writes; the
user enabled full access and work resumed without further approval requests.

### Full verification and environment diagnosis

The package suite passed all 553 tests. The first root run passed 3,683 tests and failed five color assertions; an
isolated unchanged HEAD worktree reproduced exactly those five failures. The environment set `NO_COLOR=1`. All 19 tests
in the three affected files passed with that variable unset. The health gate with `env -u NO_COLOR` then passed all four
suites (root: 3,688 tests), formatting, type checks, API reference, reachability, package/release checks, web build,
e2e, and benchmarks. Its single remaining failure was API inventory: the separate `docs/api-stable-baseline.json` also
needed the two new public declarations. Regenerated it, reviewed the two additions and zero removals, and reran that
check successfully. Final complete health rerun uses `/tmp/exomux-selection-health-final.log`.

ICC full refresh and source checks succeeded. Guard diff passed. The scoped production audit reports existing oversized
`app.ts`/`controller.ts` files, pending local edits, and unrelated stale/incomplete task portfolio entries; its
freshness, index quality, diff guard and shell audit passed. These broad portfolio findings do not describe selection
failures. The temporary baseline worktree was removed after its comparison. No live daemon or installed binary was
changed.

The feature branch awaits the maintainer's real-terminal selection/clipboard check before merging, as required by
`plan/workflow/version-control.md`; mounted tests prove rendered highlight and the exact OSC 52 sequence, not the host
terminal's acceptance of that sequence or interception of Shift-drag.

### Final result

`env -u NO_COLOR deno task health` completed with exit code 0. All gates passed, including 3,688 root tests (41 steps),
553 exomux tests, 62 web tests, and 54 worker tests. Final output: `/tmp/exomux-selection-health-final.log`.
`git diff --check` passed. Regenerated API reference, both API baselines, entrypoint budgets, and the web workbench
bundle are included with the source changes. The final log-only edit was format-checked before committing.
