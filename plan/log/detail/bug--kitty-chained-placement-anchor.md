# Detailed development log: `bug/kitty-chained-placement-anchor`

- **Branch:** `bug/kitty-chained-placement-anchor`
- **Started:** 2026-08-30

## 2026-08-30 — The active window's streamed frame lands at the parked cursor

### Prompt

Maintainer field report with a screenshot: tode (electron app relayed as kitty graphics) "is having some issues staying
within its dedicated terminal window. sometimes when the screen updates it is in the wrong location for a split second
before snapping back. this only seems to happen when it's the active window." In the screenshot the frame sits in a
strip at the bottom of the screen while its window — active, topmost, fully visible — shows nothing.

### Response and strategy

**Diagnosis.** The relay comment claimed "kitty anchors a chained transmission at the command that opened it"
(`src/runtime/kitty_passthrough.ts`). The spec says the opposite, explicitly: _"the cursor position used to display the
image must be the position when the final chunk is received."_ Every tode frame is a chunked chain (the protocol caps
APC payloads at 4096 bytes, so a full-frame PNG is always `m=1…m=0`), and the flush in `packages/exomux/app.ts` CUPs the
host cursor only before emissions that carry a `cell` — the opening chunk. When a chain spanned a 33 ms flush tick, the
batch's closing `ESC 8` restored the cursor and the compositor's own painting moved it further; the host then displayed
the image wherever the cursor happened to be when `m=0` arrived. The next frame that fit in one batch snapped it back.

Why only the active window: the clip path already rewrote `a=T` to transmit-only and emitted explicit cursor-anchored
`a=p` placements at chain close — occluded windows were immune. Only a fully visible window (`regions === null`, i.e.
the topmost/active one) passed the child's chained display command through raw and trusted the host's anchoring.

**Fix** (`src/runtime/kitty_passthrough.ts`): a chained display command never keeps its display action, clipped or not.
The data goes out transmit-only (`a=t`) and the placement is emitted explicitly at chain close, anchored to the cursor
cell captured when the chain opened. Placement ids are reused per image, so each frame atomically replaces the previous
placement — no delete/flash.

Adjacent protocol-legality holes closed in the same change, all of the class "nothing else may enter the stream while a
chain is open" (the spec forbids interleaving other graphics escapes between chunks):

- `setClip` mid-chain now defers its delete-and-re-place sweep to the chain close (dragging a window while a frame
  streams used to inject deletes into the chain). The old placements stand at most a frame longer — the existing
  heals-within-a-frame doctrine.
- `release()` with a dangling chain emits an empty final chunk (`Gm=0;`) before its deletes, so the deletes are not
  swallowed as chunk data. Quiet, because `q=2` went out on the opening chunk.
- The controller's 512-emission pending cap (`packages/exomux/controller.ts`) no longer clears mid-chain — a cleared
  middle desyncs the host's chunk reassembly for everything after it. New `chainOpen` getter on the relay is the seam.
  Tradeoff, named: while a chain is open the queue is unbounded; in practice it is bounded by one frame's chunks, and a
  child that never closes a chain is already bounded misbehaviour elsewhere (the 64 KB pending-APC cap).

**Found on the way, pre-existing on `main`:** `ffe470be` bumped the library to 0.7.0 without widening
`packages/exomux/deno.json`'s `^0.6.0` ranges — exactly the trap `plan/workflow/version-control.md` documents. Deno
warned "Linked package '@ubernaut/exotui@0.7.0' was not used because it did not match" and resolved the **published
0.6.0** instead, so the exomux suite on `main` has been exercising the registry copy, not the local tree, since that
commit. Ranges widened to `^0.7.0` here (required anyway: the new getter is invisible through the stale link).

**Evidence.**

- New tests in `tests/kitty_passthrough.test.ts`: chained display becomes transmit + anchored placement at close
  (regression test for the field report); a clip arriving mid-chain waits for the close; release closes a dangling chain
  before deleting. Existing release test updated for the close-first emission (its old expectation asserted the dangling
  chain).
- `deno test -A tests/kitty_passthrough.test.ts`: 19 passed.
- exomux package suite: 548 passed — now against the linked local library.
- Root suite: 3684 passed; the one failure was the entrypoint-budget gate (`kitty_passthrough.ts` +2068 B), budgets
  regenerated, public API baseline and api-reference unchanged.
- `deno task health`: recorded in the commit message.

**What the tests cannot see:** the actual host-terminal behaviour — the maintainer should run tode in a live exomux
under Ghostty and watch for the transient misplacement on updates while the window is active, plus a drag mid-stream
(the deferred clip sweep) and a window close mid-stream (the chain-closing release).
