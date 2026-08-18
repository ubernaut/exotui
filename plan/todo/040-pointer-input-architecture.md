# Pointer input architecture

Status: complete — phases 0-6 shipped (e2a42b47) and confirmed working on a real desktop and phone by the user, August
18 2026. Architecture review page with diagrams: https://claude.ai/code/artifact/f913a0e4-8081-46c9-80b9-8957b2545714

One regression escaped to the user and was fixed in 888fd904: button and wheel events acted on the block cursor's
REMEMBERED cell, which only motion updated, so a phone (which sends no hover motion at all) froze the cursor at the
first tap and redirected every later tap, drag and scroll to it. Every event now moves the cursor and acts on the same
cell. Two tests had asserted the broken behavior; they are replaced by three that pin the fix, including the no-hover
tap sequence the harness default (block cursor off) hid.

User direction (Aug 17 2026): stop chaining hacks. Software should be composed of discrete modules that are easily and
independently tested, whose domain is clear and easy to understand, and which are easy to swap out. The pointer path
achieves none of those. Produce an overarching plan plus architecture diagrams before writing any code.

Prior context: five unpushed commits on main (4b1107f6, 93409e10, 20713f67, 3457df17, f5f733d4) fixed four real pointer
bugs one at a time, inside the very structure that produced them. They are behavior spec, not a foundation; Phase 0
captures their behavior before they are reworked or reverted. The working tree also has three uncommitted files from an
abandoned edit and is currently red — clear that before starting.

## The measured problem

- Nine independent "what is at this cell" implementations in `src/`, plus four more in `packages/exomux/`.
- Seven separate copies of point-in-rect (`hit_targets.ts:102`, `mouse_bindings.ts:316`, `utils/numbers.ts:16`,
  `software_cursor.ts:24`, `workbench_window_host.ts:1643`, `window_interactions.ts:1556`, `layout/overlay.ts:183`), and
  two more inside exomux (`app.ts:7459`, `terminal_mouse.ts:406`).
- Three unrelated drag-capture systems: `MouseInteractionRouter.#captureId`, `PointerCaptureController.#captures`,
  `WorkbenchThreeViewportInteractionController.#dragWindow`.
- `packages/exomux/app.ts` is 7,503 lines; `mountExomuxDesktop` is a single 3,196-line function (625-3820) and all ~740
  lines of pointer routing are closures inside it, over its locals — the reason none of it is independently testable.
- `routeWindowPointer` is 17 ordered branches where precedence IS statement order.
- Zero tests assert what a click at a given cell resolves to. One exomux test costs 11s (91% of that suite's pointer
  runtime) because asking "does this cell drag?" requires mounting a desktop and sleeping past a double-click timer.
- Library facilities that already exist and are bypassed: `MouseInteractionRouter` (exomux registers 2 targets, one a
  full-screen catch-all, and never calls its `hitTest`), `HitTargetStack` (zero production consumers for resolution),
  `TerminalQueryBroker` (zero consumers; exomux reimplemented CSI 16t uncorrelated in `pointer_space.ts`).
- The bypass has a documented cause (app.ts:3135-3137): router targets hit-test undistorted coordinates and the CRT
  shader warps the grid. A missing library hook became a 180-line app workaround — in the app whose stated purpose is to
  prove the library sufficient.

## Target decomposition

Two questions are conflated everywhere: WHICH SURFACE is at a cell (the router already answers this) and WHICH PART of
that surface (nobody owns it, so every surface re-derives it at hit time, separately from the geometry it computed at
paint time). Modules, each with one domain, pure unless noted:

- `transform` — `(cell, view) -> cell`. Display-space inverse for the shader warp; identity when no shader runs. Becomes
  a router hook, which is the gap that caused the bypass.
- `router` (exists, keep) — `(cell) -> Target`. Z-order plus drag capture.
- `regions` (new, library) — `(layout, local) -> Region`. Title, edge, control, row, client; computed once per frame by
  whoever paints the surface, so paint and hit-test cannot drift.
- `gesture` (new, library) — `(state, event, target) -> [state, Intent]`. Click vs drag vs double-click, capture,
  lost-release recovery: one state machine replacing flags in three files.
- `affordance` (new, library) — `(Region) -> glyph`. The cursor becomes a projection of the resolved region and cannot
  hold a private copy of the rules.
- `dispatch` (app) — `(Intent) -> effects`. The only impure part; exomux keeps this and nothing else.

Invariant to enforce: nothing answers "what is at this cell" except by resolving through the router and its regions.
Layer order becomes data you can print rather than the order statements appear in.

## Phases (each independently revertable, each ends green)

- [x] **Phase 0 — golden hit map.** For representative desktop layouts, record what every cell resolves to and what a
      press there does; commit as a golden table. Uses the pilot's existing `capture().hitRegions`. Documents today's
      behavior INCLUDING its bugs. No production code touched. This is the entire safety argument for phases 3-5.
- [x] **Phase 1 — library hooks.** Coordinate transform on `MouseInteractionRouter`; region classifier on target
      payloads. Additive, pure, unit-tested; existing suites unchanged.
- [x] **Phase 2 — lift layout out of the closure.** Extract the modal/window layout functions (which already compute
      every rect twice, once to paint and once to hit-test) into a module returning the region table; painter consumes
      it. Gate: rendering byte-identical.
- [x] **Phase 3 — register real targets, keep the cascade.** Windows, controls, shelf, start button, background as
      ordered router targets. Both paths run; new resolution asserted equal to old for every cell. Divergences are bugs
      found or fixes recorded deliberately.
- [x] **Phase 4 — flip dispatch, then subtract.** Dispatch reads typed targets; cascade branches deleted one per commit
      with the golden table green after each.
- [x] **Phase 5 — one capture, one gesture state.** Collapse the three capture systems; move double-click, drag
      threshold and lost-release recovery into the reducer as table-driven cases.
- [x] **Phase 6 — delete the duplicates.** Nine resolvers to one, seven point-in-rect copies to one, orphaned
      `HitTargetStack`/`GestureRecognizer` adopted or removed, geometry query moved onto `TerminalQueryBroker`,
      speculative `packages/exomux/pointer_space.ts` deleted (its padding model measured to zero on real Ghostty: CSI
      14t reports the text area, which is exactly columns x cellWidth, so padding is undiscoverable and irrelevant).

## Notes

- Ghostty geometry measured Aug 17 2026: cell 10x21px, text area 790x546px, grid 79x26 — exact, no padding. Recorded so
  nobody re-runs that investigation.
- Do not let any phase both add a structure and remove one; that is what made the last five commits unreviewable.

## What landed, and what did not

Commits: 10ce459e (0), 48ca4ec8 (1), 524477c1 (2-3), 8589315e (4), 0f989558 (5), plus phase 6.

Delivered:

- `packages/exomux/tests/hit_map.ts` + goldens: every desktop cell labelled, as a legend and an ASCII drawing. It
  immediately earned its keep by proving the FIRST draft of the map wrong about the gaps either side of the taskbar.
- `MouseInteractionRouter` gained a cell transform and a `regionAt` classifier, and `resolve()` returns target, local
  coordinates and region together. The transform is the gap exomux bypassed the router to work around.
- `packages/exomux/desktop_layout.ts`: the fixed geometry as pure functions, out of the 3,196-line closure.
- `packages/exomux/pointer_targets.ts`: the desktop as ordered targets with `EXOMUX_POINTER_LAYERS` as data. Dispatch
  switches on the resolved target; the differential asserts it matches the golden map cell for cell.
- `src/app/pointer_gestures.ts`: click/drag/double-click/lost-release as a pure reducer, twelve table cases in 11ms. The
  window host feeds it instead of `#lastTitleBarClick` + `#pendingTitleBarMaximize`.
- Deletions: `pointer_space.ts` and its 10 tests (the padding model measured to zero on real Ghostty, so the CSI query
  bought nothing), `configControlSessionAt`, `HitTargetStack`/`translateHitTargets` (a second public answer to "what is
  at this cell", zero production consumers, superseded by the router), and four of the nine point-in-rect copies.

Not done, deliberately:

- **Capture is still three systems.** `MouseInteractionRouter.#captureId`, `PointerCaptureController.#captures` and
  `WorkbenchThreeViewportInteractionController.#dragWindow` remain. Merging them means rewriting capture inside
  `MarkupWindowInteractionController` (32 tests) for no user-visible gain today; it is a phase of its own, not a rider
  on this one.
- **Five point-in-rect implementations remain** (was nine): the canonical `hit_targets.contains`, `overlay.pointInRect`
  and `markup containsCell` (both take a point object and live in other layers, so collapsing them means moving the
  helper to a neutral home), and `utils.fitsInRectangle`, which deliberately treats a zero-size rect as empty.
- **`GestureRecognizer` is still orphaned.** It is a working, tested touch-gesture feature with no consumer; deleting a
  feature for lack of a caller is a product decision, not cleanup.
- **`routeWindowPointer` is still ~190 lines.** What changed is that those lines are now dispatch actions rather than
  geometry: the branches ask the model instead of testing their own rectangles. Shrinking it further means moving the
  actions (manager rows, network rows, settings rows, modal activation) behind the same target vocabulary, which is the
  natural next slice.
- The **semantic/touch pointer path** (`routeSemanticPointerFast`, `routeSemanticPointerInBarrier`, ~230 lines) still
  resolves by hand and does not use the model. It is the browser/touch route; it should be folded in next.
