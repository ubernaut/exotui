# Detailed development log: `bug/unclosable-terminal-window`

- **Branch:** `bug/unclosable-terminal-window`
- **Started:** 2026-08-25
- **Base:** `main` at `64c22967`

## 2026-08-25 — A terminal whose session had already exited could not be closed

### Prompt

Sometimes after resuming an old exomux session, closing a terminal does nothing; the only way to be rid of the windows
is to terminate the session and reopen exomux.

### Response and strategy

Not related to this branch's work — a pre-existing defect in `killSession`, fixed here because that is where the user
was.

**The path, read end to end.** `runWindowCommand` (`app.ts`) turns a close on a terminal window into
`controller.killSession(id)`, and on a `false` it calls `presentWindow` to put the frame back — deliberately, so the
daemon refusing to end a live PTY cannot leave a hidden or frozen orphan. `#killSessionOnce` produced that `false` from
`await this.client.kill(sessionId).catch(() => false)`, and the real client **throws** rather than returning false: the
daemon answers `session-not-found` for any session it has dropped (`host.ts` `#requireSession`, and it deletes a session
as soon as it terminates). So two unlike outcomes shared one value — _the daemon refused_ and _there is nothing left to
kill_ — and the second one restored the window every single time. Nothing short of restarting exomux cleared it, which
is exactly what was reported.

The trigger is a shell that exited while this client was away. Runtimes are seeded from `client.list()` at startup
(`controller.ts`), and `#acceptBroadcastSession` → `#scheduleClosedSessionSweep` is what normally removes a runtime the
daemon no longer lists. That sweep only runs on an exit **broadcast**, and it returns silently when
`windowReconciliationApplied` is false, retrying only "on the next exit broadcast" — which for an already-exited session
never comes. Either gap leaves a runtime with no session behind it, and from there the window was unclosable.

**The fix** applies the rule this codebase already states one method away, in `#acceptBroadcastSession`: _the daemon's
list is the authority, and anything it no longer has is closed everywhere._ A failed kill now asks. Still listed → a
real refusal, keep the window, unchanged behaviour. Not listed → the session is gone, complete the teardown and say
`Closed <title>; it had already exited.` A list that fails answers "still there", so an unreachable daemon never becomes
grounds for closing a window with a live process behind it.

Deliberately not keyed on the `session-not-found` error string: the fake client in the suites returns `false` where the
real one throws, and a rule that only works over one transport is not the rule the sweep follows.

**Tests.** Two in `packages/exomux/tests/controller.test.ts`. The first fails without the change; the second — a refusal
for a session the daemon still lists keeps its window — passes either way and is there to catch an over-correction,
which is worth saying rather than counting as evidence. The existing "rejected kill preserves the live attachment
generation" and "retains a still-running session whose termination failed" tests still pass, which is the behaviour that
had to survive.

**Left alone, worth knowing.** A kill the daemon genuinely refuses still leaves a window that cannot be closed, with
only a status line saying so. That is defensible — there is a live process — but there is no escape hatch, and the same
report would be made about it. A force-close-the-frame-and-leave-the-PTY gesture is a design decision, not a bug fix.
The `#sweepClosedSessions` silent give-up on a blocked reconciliation is also still there; this fix makes it survivable
rather than terminal.

**Gates.** exomux suite 548 passed (546 + the two new). Root suite and `deno task health` run separately.
