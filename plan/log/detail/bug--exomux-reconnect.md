# Detailed development log: `bug/exomux-reconnect`

- **Branch:** `bug/exomux-reconnect`
- **Started:** 2026-09-09

## 2026-09-09 — Recover terminal connections after a freeze

User authorized fixing the live diagnosis recorded in `main.md`: the WebSocket client permanently failed after a
transport loss, leaving local windows alive with stale terminal content. Preserve the user's running client and daemon.

Implementation: reconnect the same authenticated host with exponential backoff capped at five seconds. Initial
connection failures remain bounded; invalid protocol/authentication and changed host generations are terminal failures.
Capture close code/reason and expose the retained error in connection state, with opt-in debug logging. Do not replay
input or mutations. Connection notifications invalidate controller attachments and generations; recovery inventories the
host and reuses normal sequence-based attach/replay, including truncated-screen clearing and resize repaint. Preserve
window state, screen/scrollback objects, and closed windows. Retry inventory/attachment failures while connected; cancel
recovery on disposal and ignore operations from an earlier connection generation.

Regression coverage uses an isolated real WebSocket host with a retaining fake PTY backend for both current and legacy
replay. It checks output before/during/after loss, a failed first reconnect attempt, repeated disconnects, a window
closed during the outage, no input replay, unchanged PTY ownership, replay overflow and repaint resizes. Scripted checks
cover close diagnostics, host-generation mismatch, and disposal cancelling retries. Initial test delays below the
client's 100 ms minimum failed; validate the retry delay during construction and use supported delays in tests.

Verification and delivery:

- Focused client suite: 29 passed, including the four new regression cases (both replay variants exercise repeated
  disconnects, failed reconnect attempts, and replay overflow).
- Full exomux suite: 552 passed. Root suite with color enabled: 3,683 passed plus 41 steps. Web suite: 62 passed; worker
  suite: 54 passed. Repository build/check/release/package/web/benchmark gates passed in the full health run.
- The first health run inherited `NO_COLOR=1` from the tool environment. Five existing color-dependent root tests
  failed; rerunning the unchanged tests with `env -u NO_COLOR FORCE_COLOR=1` passed all 19 tests across the three
  affected files. The complete root suite then passed with that environment. No product or test behavior was changed to
  accommodate the environment. Health also caught wrapping in the prior turn's main-branch diagnosis log; formatted that
  file and verified `deno fmt --check` across 1,375 files. The second health run had already checked formatting before
  that repair, so its recorded format result must be read alongside the final passing format check.
- Regenerated entrypoint and public API baselines: no diff. The exomux lockfile updated only its linked-workspace
  metadata from exotui 0.7.1 to the actual 0.7.2. Its existing ^0.6.0 import range still emits the pre-existing linked
  package warning; no library dependency upgrade was included in this transport fix.
- Isolated runtime verification launched the previously installed compiled daemon with a private temporary descriptor,
  spawned a real `/bin/sh` PTY emitting a ticker, and used the new controller/client to interrupt its WebSocket.
  Recovery advanced output sequence 4 to 13, retained host/view identity, and resumed an attached terminal. The same
  check against the newly compiled daemon advanced 4 to 14. Owned test daemons and PTYs were cleaned up; the user's
  daemon was never used as a destructive test target.
- Compiled to `/home/cos/.cache/exomux-reconnect/exomux`; binary mmap inspection confirmed exact current client,
  controller, and model source embedded. Installed atomically at `/home/cos/.local/bin/exomux`; staged and installed
  SHA-256 match (`36e64331aa3793d7901b47734d3f9746e8469e345814dd4c87caca5334c264fb`). Previous binary retained outside
  the repository at `/home/cos/.cache/exomux-reconnect/exomux.before-reconnect`. Installed `--help` smoke passed.
- During the work the original UI PID 8138 was replaced externally by UI PID 530970, which is connected to the original
  daemon PID 8145. No tool here restarted either user process. The replacement UI started before installation and
  continues using the old executable inode; another user-controlled reopen loads the installed fix. Actual desktop
  rendering/animations remain a user check; automatic recovery was exercised over real WebSockets and real PTYs.
- ICC work dossier persisted under task `exomux-live-disconnect-20260909`; generic unrelated fallback-audit suggestions
  were retained as skipped, not relabeled as passes. Guard diff passed. Logs, binaries, and runtime scripts live outside
  the repository under `/tmp/exomux-reconnect-*` and `/home/cos/.cache/exomux-reconnect/`.

## 2026-09-09 — Release exomux 0.3.1

User explicitly requested committing and publishing another JSR release. The fix was already committed as `8af045b0`.
Prepare exomux 0.3.1, align its library imports with exotui ^0.7.2, and record the patch release in CHANGELOG.md. Remote
main remains at `05c6a66d`; local main already includes the prepared library 0.7.1 and 0.7.2 releases. The existing
GitHub Actions publish workflow publishes current exotui first, then exomux using repository-linked OIDC. No credential
or browser authorization flow is needed. JSR pages showed exomux 0.3.0 and exotui 0.7.0 before release preparation.

Acceptance for publication: full health on this release candidate with color enabled, clean root release check and
exomux publish dry run, merge to main, push, observe successful Publish workflow, and verify registry package versions.
The user's publication request authorizes integration and publication; retain the running daemon and UI throughout.
