# Textual And OpenTUI Feature-Parity Roadmap

Status: active implementation program. The user approved the remaining milestones on July 16, 2026. L0 is complete; L1,
L2, W1, W2, R1, and K1 now have verified or active slices. Core imperative advanced windowing is already implemented; W1
and W2 track the remaining screen/modal lifecycle and declarative-markup integration.

## Execution Discipline

This file is the durable research-backed backlog. Authorization is active, but a checkbox is checked only after its
specific contract and tests pass. Each milestone remains its own ICC task and reviewable batch so a large program does
not erase failure evidence or blur partially completed work.

The recommended first implementation milestone is L0, followed by the bounded L2 Taffy spike. L1 and L3 should be
approved only after that adoption decision, so advanced Flexbox, intrinsic-sizing, and Grid work targets the chosen
backend strategy instead of being implemented twice.

## Research Snapshot

The comparison uses current first-party sources only:

- [Textual v8.2.8](https://github.com/Textualize/textual/releases/tag/v8.2.8), released June 30, 2026, is the Python TUI
  reference. This repo's existing layout plan also identifies Textual as the strongest production reference for
  CSS-styled terminal applications.
- [OpenTUI v0.4.4](https://github.com/anomalyco/opentui/releases/tag/v0.4.4), released July 16, 2026, is the
  TypeScript/Zig reference. `anomalyco/opentui` is the canonical repository; the former `sst/opentui` location redirects
  there.
- [Taffy 0.12.2](https://docs.rs/taffy/0.12.2/taffy/), current at the time of the spike, is the candidate advanced
  layout solver. It implements CSS-inspired Block, Flexbox, and Grid algorithms.

Important distinctions:

- Textual has powerful CSS-like sizing, horizontal/vertical flow, Grid, dock, layers, and scrolling, but it does not
  expose browser-grade Flexbox properties such as grow, shrink, basis, wrap, or order.
- OpenTUI uses Yoga, not Taffy. It has no CSS selector/cascade system and no CSS Grid implementation.
- A Taffy backend is therefore an extension beyond either library. It may unify the stronger parts of Textual-style Grid
  and OpenTUI-style Flexbox behind this repo's existing `LayoutSolver` boundary, but Taffy itself is not the parity
  target.
- Neither reference has a first-class movable/resizable tiled desktop window manager. The tiled workspace already in
  this repo should be preserved and integrated, not replaced.

## Current Repo Baseline

These capabilities already exist and should not be reimplemented under a different name.

### Layout And CSS Authoring

- `LayoutNode`, computed styles and boxes, `LayoutEngine`, `LayoutSolver`, deterministic cell rectangles, hit regions,
  overflow metadata, and intrinsic terminal text measurement.
- A dependency-free simple solver plus the opt-in `yoga-layout@3.2.1` solver exported from `./layout/yoga`.
- `display: block | flex | grid | none`, row/column Flexbox, grow/shrink/basis, wrap/wrap-reverse, order, gaps,
  `justify-content`, `align-items`, and `align-self`/`justify-self`.
- Fixed, percentage, fractional, and automatic dimensions; min/max constraints; padding, margin, borders, visibility,
  z-index, overflow, and absolute positioning.
- Grid tracks, `repeat(n, ...)`, `fr`, explicit and implicit tracks, row/column placement and spans, auto-flow, template
  areas in the simple solver, and per-item alignment.
- Tag, class, ID, universal, attribute, child, descendant, and selector-list matching; specificity, source order, CSS
  variables, inline styles, four UI pseudo states, bounded structural pseudo-classes, and viewport media rules.
- HTML-like markup parsing, widget hydration, terminal/browser-neutral dispatch, worker-offloaded parse/cascade/layout,
  and the canonical `inspectTuiCssSupport()` capability report.

Current evidence:

- `src/layout/style.ts`
- `src/layout/solvers/simple.ts`
- `src/layout/solvers/yoga.ts`
- `src/markup/cascade.ts`
- `src/markup/support.ts`
- `docs/html-css-layout.md`
- `tests/html_css_layout.test.ts`

### Application, Windows, Components, And Testing

- Signals, computed values and effects; actions, middleware, command registry/search/palette; router; undo/redo history;
  cancellable scheduling, resources, workers, storage, diagnostics, themes, and plugins.
- Focus scopes, keyboard and mouse routing, paste/focus input, selection models, overlays, modals, context menus,
  toasts, scroll areas, terminal scrollback/copy mode, and browser input adapters.
- A persistent tiled workspace with titlebar docking/swapping, splitter resize, keyboard layout mode, minimize,
  maximize/restore, compact focus fallback, workspace serialization, and terminal/web parity.
- A broad widget set including buttons, checkboxes, radio groups, inputs, multi-line text boxes, select/combobox,
  sliders, lists, virtual lists, tables/data tables, trees/file explorer, tabs, menu/status bars, Markdown, logs,
  progress, sparklines, charts, and Three ASCII.
- A headless `TerminalAppPilot`, fake keyboard/mouse/paste/focus/resize input, deterministic canvas/terminal snapshots,
  and visual smoke tooling.
- Three.js/WebGPU ASCII rendering, CPU paths, renderer policies, Kitty graphics, browser renderers, PTY/remote terminal
  surfaces, and terminal capability planning.

Current evidence:

- `src/components/mod.ts`
- `src/app/mod.ts`
- `src/runtime/mod.ts`
- `src/layout/tiled_workspace.ts`
- `src/testing/app.ts`
- `src/testing/snapshot.ts`
- `src/three_ascii/`

## Reference Feature Inventory

This inventory records useful upstream behavior even when this repo already has an equivalent.

### Textual

#### Styling And Layout

- Inline, external, app, screen, and scoped widget-default stylesheets.
- Type, ID, class, universal, descendant, child, and state selectors; specificity, `!important`, variables, `initial`,
  nested rules, and runtime CSS-class changes.
- Cell, percentage, parent-axis, viewport-axis, `auto`, and `fr` dimensions; min/max constraints; content-box and
  border-box sizing.
- Horizontal, vertical, Grid, auto-column item Grid, docked edges, named paint layers, relative/absolute positioning,
  scalar offsets, and responsive breakpoint classes.
- Overflow and reusable scroll containers, custom scrollbars, parent/content alignment, padding, margins, borders,
  outlines, border titles, text wrapping, opacity/tint/hatch, pointer styles, and animated style properties.
- Built-in and custom themes with semantic variables, light/dark variants, and ANSI mappings.

Sources: [CSS](https://textual.textualize.io/guide/CSS/), [styles](https://textual.textualize.io/guide/styles/),
[layout](https://textual.textualize.io/guide/layout/), [style reference](https://textual.textualize.io/styles/),
[themes](https://textual.textualize.io/guide/design/), and [animation](https://textual.textualize.io/guide/animation/).

#### Tree, State, Events, And Concurrency

- Declarative composition plus dynamic mount, remove, move, and recompose operations.
- Selector-based DOM queries with filter, exclude, and bulk operations.
- Reactive values with refresh/layout invalidation, validation, watchers, computed values, mutable-state notification,
  recomposition, and one-way child binding.
- Per-widget async message queues, custom events/messages, bubbling, prevent-default/stop, message suppression,
  selector-routed handlers, and sync/async handlers.
- Focus-aware priority bindings, runtime keymaps, dynamic availability, binding groups, timers, delayed/post-refresh
  callbacks, and managed async/thread workers with cancellation and owner cleanup.

Sources: [queries](https://textual.textualize.io/guide/queries/),
[reactivity](https://textual.textualize.io/guide/reactivity/), [events](https://textual.textualize.io/guide/events/),
[input](https://textual.textualize.io/guide/input/), and [workers](https://textual.textualize.io/guide/workers/).

#### Screens And Application UX

- Named/transient screen stacks with push, pop, and switch operations.
- Translucent and modal screens, typed dialog results, independent named modes, suspend/resume events, focus, and
  focused-widget maximize/restore.
- Extensible fuzzy command providers, global and screen-local commands, discovery results, notifications, tooltips,
  theme switching, clipboard/URL/bell helpers, inline mode, and browser serving.

Sources: [screens](https://textual.textualize.io/guide/screens/),
[command palette](https://textual.textualize.io/guide/command_palette/), and
[application API](https://textual.textualize.io/api/app/).

#### Widgets And Tooling

- Inputs, masked input, selection lists, buttons, checkboxes, switches, radio controls, selects, tabs, content switcher,
  collapsibles, list/option views, trees/directory trees, data tables, text area, Markdown viewer, log views, progress,
  sparkline, digits, loading indicator, header/footer, rule, and toast widgets.
- Cross-container text selection with selection-edge auto-scroll, plus cell-aware `Content`/Visual rendering and a Line
  API built around cacheable immutable strips and partial-region refresh for large widgets.
- Headless pilot tests for keys, clicks, hover, multi-click, resize, and synchronization; SVG screenshots; an official
  snapshot plugin and diff report; development console; logging bridge; live CSS reload; and key-input diagnostics.

Sources: [widget gallery](https://textual.textualize.io/widget_gallery/),
[v8.2.0 release](https://github.com/Textualize/textual/releases/tag/v8.2.0),
[widget and Line API](https://textual.textualize.io/guide/widgets/),
[testing](https://textual.textualize.io/guide/testing/), and
[developer tools](https://textual.textualize.io/guide/devtools/).

### OpenTUI

#### Layout And Render Tree

- A retained renderable tree using Yoga for row/column/reverse Flexbox, grow/shrink/basis, wrap/wrap-reverse,
  start/end/center/space-between/around/evenly distribution, stretch/baseline alignment, fixed/percentage/auto and
  min/max dimensions, absolute insets, per-edge/axis spacing, auto margins, overflow, and resize-driven responsive
  behavior. Box containers additionally expose fixed/percentage `gap`, `rowGap`, and `columnGap`.
- Source-level Yoga support for `align-content`, aspect ratio, RTL/direction, box sizing, `display: contents`,
  measurement callbacks, errata, and web-default configuration. These are not all documented as ordinary high-level
  component properties.

Sources: [layout](https://opentui.com/docs/core-concepts/layout/),
[renderables](https://opentui.com/docs/core-concepts/renderables/), and the
[v0.4.4 renderable API](https://github.com/anomalyco/opentui/blob/v0.4.4/packages/core/src/Renderable.ts#L61-L104).

#### Renderer And Terminal Runtime

- Native differential ANSI frames, no-op suppression, optional render threading, frame stats, event-driven and
  continuous/live render modes, idle waiting, and suspend/resume.
- Alternate-screen, main-screen, and split-footer modes; captured stdout; styled scrollback snapshots; reusable
  off-screen streaming surfaces; and custom streams for SSH, PTY, WebSocket, and xterm.js hosts.
- Clipping, culling, alpha blending, opacity, translation, z-index, render hooks, a composable framebuffer, and color
  matrices/post-processing. Its console overlay is dockable/resizable; its debug statistics overlay is a separate
  corner-positioned surface.
- Structured raw/Kitty keyboard events, key press/repeat/release, aliases, bracketed paste, focus, bubbling/stopping,
  mouse move/down/up/drag/drop/hover/scroll, and automatic focus routing.
- Terminal theme/palette detection, title/background control, cursor shape/color/pointer, OSC 52 clipboard,
  notifications, raw OSC subscriptions, and capability reporting.

Sources: [renderer](https://opentui.com/docs/core-concepts/renderer/),
[keyboard](https://opentui.com/docs/core-concepts/keyboard/), and
[console overlay](https://opentui.com/docs/core-concepts/console/).

#### Components, Bindings, Extensions, And Tests

- Box, selectable rich text, input, textarea/editor, select, tab select, slider, scrollbar/scroll box, Tree-sitter code,
  streaming Markdown, line-number gutters, unified/split diff, ASCII-art font, framebuffer, and optional QR renderables.
- Core imperative/construct APIs, React and Solid reconcilers, typed plugin slots, runtime-loaded plugins, and a layered
  keymap package with priorities, modes, multi-stroke sequences, leader keys, counts, conditions, diagnostics, and
  framework/browser hosts.
- A core timeline with numeric interpolation, multiple easing families, delays, loops, alternation, callbacks, and
  nested timelines, with binding-level hooks for React and Solid.
- A test renderer with one-pass/settled rendering, polling, frame/span/cursor capture, resize, mock keyboard/mouse,
  native statistics, and visual-idle waits.

Sources: [components](https://opentui.com/docs/getting-started/),
[Tree-sitter](https://opentui.com/docs/reference/tree-sitter/), [keymap](https://opentui.com/docs/keymap/overview/),
[plugin slots](https://opentui.com/docs/plugins/slots/),
[timeline source](https://github.com/anomalyco/opentui/blob/v0.4.4/packages/core/src/animation/Timeline.ts), and
[testing](https://opentui.com/docs/core-concepts/testing/).

#### Three.js And Glyph Rendering

- The source-confirmed `@opentui/three` package embeds Three.js/WebGPU scenes in normal layout, corrects camera aspect
  ratio for terminal cells when using a perspective camera, auto-resizes, integrates with the frame loop, exposes
  stats/capture, and supports GPU or CPU supersampling, or unsupersampled full-block pixel-to-cell conversion. Scene
  rendering itself still requires WebGPU; the CPU sampler is not a software 3D fallback.
- Its principal glyph path maps each 2x2 sample to one of 16 quadrant/block glyphs and chooses representative foreground
  and background colors. A GPU-compute pre-squeezed variant blends horizontal pairs first. A separate framebuffer filter
  supports customizable luminance ramps.

These APIs are lightly documented compared with OpenTUI core and should be treated as reference techniques, not a stable
API to clone.

Sources: [Three package](https://github.com/anomalyco/opentui/tree/v0.4.4/packages/three),
[WebGPU renderer](https://github.com/anomalyco/opentui/blob/v0.4.4/packages/three/src/WGPURenderer.ts), and
[quadrant shader](https://github.com/anomalyco/opentui/blob/v0.4.4/packages/three/src/shaders/supersampling.wgsl).

### Taffy

- CSS-inspired Block, Flexbox, Grid, hidden layout, floats as a Block subfeature, `calc()` values, content-size output,
  custom leaf measurement, caching, detailed Grid information, and deterministic rounding.
- High-level owned-tree and low-level host-tree APIs, making it possible to keep this repo's existing `LayoutNode` and
  solver contract rather than exposing Taffy nodes publicly.
- Style support includes reverse Flexbox, wrap, alignment/content distribution, box sizing, direction, aspect ratio,
  intrinsic/min/max/fit-content helpers, rich Grid track sizing, named lines, repetitions, and template areas.

Sources: [crate overview](https://docs.rs/taffy/0.12.1/taffy/),
[style module](https://docs.rs/taffy/0.12.1/taffy/style/), and
[Style fields](https://docs.rs/taffy/0.12.1/taffy/struct.Style.html).

## Proposed Implementation Backlog

### L0 - Freeze A Solver-Neutral Layout Contract (P0, Small)

- [x] Add a solver capability matrix that distinguishes simple, Yoga, and future Taffy support instead of reporting one
      blended CSS list.
- [x] Turn the current shared Flex/Grid fixtures into a backend conformance corpus with explicit supported,
      solver-specific, and unsupported/diagnosed-fallback cases.
- [x] Define cell rounding, overflow, intrinsic measurement, hidden-node, absolute-child, and min/max invariants before
      adding another solver.
- [x] Correct documentation drift, including the older prose that still calls template areas unsupported while the
      simple solver supports them.
- [x] Require diagnostics for unsupported declarations and solver fallback; never silently accept a property and ignore
      it in the selected backend.

Completed July 16, 2026: the dependency-free capability profiles cover all 46 normalized fields and six invariants;
matched declaration diagnostics validate winning-field provenance and supported value grammar; Simple/Yoga share one
conformance table with exact solver-specific output and diagnostics; worker results preserve diagnostics without putting
callbacks in structured-clone payloads.

Acceptance:

- One machine-readable capability report covers every normalized style field.
- Simple and Yoga fixtures run from the same table and explain intentional differences.
- Existing public layout output remains compatible.

### L1 - Complete Advanced Flexbox And Sizing (P0, Large)

- [x] Add `row-reverse` and `column-reverse` without conflating them with wrap reversal.
- [x] Add `align-content`, `justify-content: space-evenly`, and baseline alignment where text metrics exist.
- [x] Add `aspect-ratio`, `box-sizing`, auto margins, percentage padding/margins/gaps, and correct relative-position
      offsets.
- [ ] Add logical start/end edges and direction/RTL only if terminal ordering and hit testing can share one clear model.
- [ ] Add parent-axis and viewport-axis units, plus a bounded `calc()` expression model.
- [ ] Implement content-derived minimums and `min-content`, `max-content`, and `fit-content` sizing for text and custom
      measured widgets.
- [ ] Verify grow/shrink/basis, wrapping, gaps, min/max constraints, intrinsic basis, and one-cell remainder allocation
      across nested and overflowing containers.

Completed slice July 16, 2026: the Simple solver now has independent reverse main-axis handling, wrapped-line
`align-content`, `space-evenly`, and deterministic integer-cell remainder distribution. The capability report keeps Yoga
gaps explicit. Baseline remains deliberately gated because the shared intrinsic-measurement contract does not yet expose
ascent/baseline metrics; it is not silently approximated.

Completed sizing slice July 16, 2026: the Simple solver preserves legacy numeric spacing fields while carrying strict,
serializable authored percentage/auto metadata; resolves percentage margins and padding against the containing inline
dimension and gaps per axis; supports Flex main/cross auto margins and Block inline centering; distinguishes explicit
content-box from the compatibility border-box default; derives aspect-ratio axes before cell projection; and applies
relative insets to the visual subtree and hit regions without moving normal-flow siblings. Capability diagnostics keep
Yoga limitations explicit.

Acceptance:

- Simple and Yoga agree on the common advanced Flexbox corpus or emit a documented solver-specific result.
- Terminal and browser adapters produce identical cell rectangles and hit regions.
- No layout can violate an explicit minimum merely to fit the viewport; overflow/compact policy remains explicit.

### L2 - Evaluate A Taffy WASM Backend (P0, Medium Spike)

- [ ] Identify a maintained WASM distribution or build a minimal pinned bridge from Taffy 0.12.x.
- [x] Implement an experimental `LayoutSolver` adapter without exposing Taffy handles in public APIs.
- [ ] Prove Deno terminal import, browser import, GitHub Pages bundling, worker execution, disposal, and cache behavior.
- [ ] Compare simple, Yoga, and Taffy output over the L0 corpus and large nested trees.
- [ ] Measure cold-load size/time, steady layout time, memory, and cross-boundary overhead.
- [x] Write an adoption decision: replace Yoga, complement Yoga for Grid/Block, or reject/defer Taffy.

Completed spike July 16, 2026: `./layout/taffy` is an explicitly experimental, caller-loaded 0.12.x bridge protocol with
strict manifest/result validation, intrinsic-measurement callbacks, deterministic cell projection, lifecycle isolation,
and a candidate probe. Adoption is deferred because no maintained published 0.12.x JS/WASM distribution currently
satisfies the measurement, browser/worker packaging, and lifecycle gates. The remaining unchecked items require a real
candidate; protocol fixtures are not misreported as Taffy algorithm evidence.

Acceptance:

- The spike is opt-in and cannot increase the default package/runtime dependency surface.
- Switching solvers requires no public layout-tree changes.
- A checked-in compatibility/benchmark report supports the adoption decision.

### L3 - Complete Grid, Block, And Intrinsic Layout (P1, Large)

- [ ] Add Grid `minmax()`, `fit-content()`, auto-fill/auto-fit repetition, richer implicit-track sizing, and
      content-based tracks.
- [ ] Add named Grid lines and make template-area behavior backend-neutral; keep Yoga explicitly Flex-only.
- [ ] Add dense placement only with deterministic document/focus order and clear accessibility semantics.
- [ ] Evaluate subgrid after core Taffy parity; do not emulate it with fragile parent-coordinate shortcuts.
- [ ] Improve Block auto sizing, margin behavior, replaced/custom widget measurement, and nested overflow.
- [ ] Keep floats and full browser table layout out unless a concrete TUI use case justifies them.

Acceptance:

- Grid fixtures cover track functions, spans, implicit tracks, overflow, source order, and focus order.
- Measured text/widgets participate consistently in Block, Flex, and Grid.
- Layout results remain deterministic at cell boundaries and through resize cycles.

### C1 - Textual-Style CSS Authoring And Paint (P1, Large)

- [ ] Add `dock`, named `layers`/`layer`, parent/content alignment, scrollbar styling, and border title/subtitle
      placement to the normalized style model where they provide terminal value.
- [ ] Expose L1's `box-sizing` through the authoring layer. Define scalar `offset` as a visual translation owned by
      paint/hit testing, distinct from L1's relative-position insets that participate in layout.
- [ ] Add Textual-style `!important`, `initial`, nested rules with `&`, scoped widget defaults, and multiple external
      stylesheet composition. Evaluate browser-style `inherit` and `unset` separately as repo extensions, not Textual
      parity claims.
- [ ] Add high-value pseudo-classes: `focus-within`, `empty`, `enabled`, `first/last-of-type`, `light`, `dark`, `odd`,
      `even`, and explicit renderer-mode states that keep buffered main-screen and true inline modes distinct.
- [ ] Add renderer-neutral opacity/tint/hatch and a bounded transition/timeline API for numeric/color/offset styles.
- [ ] Add local markup/CSS hot reload with parse diagnostics and last-known-good rollback.
- [ ] Decide whether the lightweight parser remains sufficient or whether a `css-tree` adapter is justified by the new
      grammar and diagnostics.

Acceptance:

- Cascade fixtures cover nesting, scope, specificity, important rules, resets, variables, and dynamic states.
- Dock/layer/visual-offset behavior shares overlay and hit-test ownership in terminal and browser hosts.
- A malformed hot-reload does not destroy the live UI or its controller state.

### D1 - Make The Markup Tree Live (P1, Large)

- [ ] Add mount, remove, move, attribute/class mutation, query/filter, and bounded recompose operations.
- [ ] Add targeted dispatch plus capture/bubble phases, stop propagation, prevent default, and selector-routed handlers.
- [ ] Connect signal changes to style/layout/render invalidation at the nearest dirty ancestor.
- [ ] Preserve hydrated widget identity and state when unrelated markup branches change.
- [ ] Add incremental style matching/layout caching and inspection of dirty reasons.
- [ ] Integrate live `<scroll-area>`, `<modal>`, `<window>`, tooltips, menus, and dropdowns with existing controllers.

Acceptance:

- Mutation and event ordering are deterministic and disposable.
- Incremental output matches a clean full recomputation in property tests.
- The same live markup fixture runs in terminal and browser hosts.

### W1 - Screen Stacks And Modal Lifecycle (P1, Medium)

The persistent tiled workspace baseline already provides docking/swapping, splitter resize, keyboard layout mode,
minimize, maximize/restore, compact focus behavior, serialization, and terminal/web parity. W1 and W2 extend that one
window manager; they do not replace or reimplement the landed core.

- [x] Add named screen stacks with push/pop/switch.
- [x] Bind independent named modes to the existing router without duplicating route ownership.
- [x] Add typed modal results that can be awaited or delivered to a callback, plus suspend/resume lifecycle events.
- [x] Define screen/mode mount, focus, suspend, resume, close, and restoration ordering without duplicating router or
      focus-scope ownership.
- [x] Persist named screen/mode state with versioned migrations and safe restore only where restoring application state
      is semantically valid.

Completed slice July 16, 2026: `ScreenStack` provides deterministic push/pop/replace/switch/dismiss transitions, typed
once-only modal settlement, suspend/resume lifecycle, focus-token restoration hooks, immutable inspection, bounded
diagnostics, and top-down disposal. `ScreenPersistence` adds default-deny, versioned, migration-aware snapshots and
preflighted public-transition restore without serializing modal callbacks, focus tokens, or disposed resources.
`ScreenRouterModeBinding` keeps `RouteManager` as the sole navigation owner while projecting current, push, replace, and
back transitions into independent named stacks; direct stack drift reconciles to the active route without writing the
router, lifecycle-triggered navigation is queued and bounded, and injected routers/stacks remain host-owned.

Acceptance:

- Modal/screen focus is trapped and restored correctly.
- Screen and mode transitions are deterministic in terminal and browser hosts.
- Restored screens cannot revive disposed resources or stale modal callbacks.

### W2 - Declarative Window Integration (P1, Medium)

- [x] Connect `<window>` and `<modal>` layout nodes to the existing tiled workspace and overlay stack without creating a
      second window manager.
- [x] Expose controller-backed focus, move/dock/swap, splitter resize, minimize, maximize/restore, and close actions to
      declarative markup while preserving keyboard and pointer parity.
- [x] Persist declarative identity through a strict V2 integration snapshot composed with the existing V1 tiled
      workspace schema, rejecting unknown versions and intersecting identities safely.
- [x] Migrate supported V1 declarative snapshots forward to V2 while rejecting V2-only fields in legacy payloads.
- [x] Add layout-operation undo/redo only after state ownership is shared by terminal and web hosts.
- [x] Define compact-viewport and minimum-size behavior for declarative windows without allowing hidden panes to steal
      focus or hit regions.

Completed core slice July 17, 2026: `MarkupWindowController` discovers bounded declarative windows and modals while
preserving unrelated imperative panes. Tiled-tree geometry remains owned by the shared tiled workspace; the integration
owns durable floating rectangles, restore/snap metadata, groups, focus tiers, declaration lifecycle, and only the
workspace/overlay identities it registered. It exposes focus, move, swap, dock, separator and eight-edge resize,
minimize/maximize/restore/close, compact projection, bounds recovery, and strict V1-to-V2 persistence.
`MarkupWindowHistoryAdapter` records exact before/after shared-controller snapshots and batches capture-driven pointer
gestures into one entry with failure compensation. Automatic live-tree invalidation remains part of D1; shared host
chrome and flagship adoption remain tracked in 025:SHR-006 / SHOW-WIN-001.

Acceptance:

- Hiding or minimizing a window never destroys its durable split geometry.
- Declarative and imperative operations produce one shared workspace state and command history.
- Tiled and floating restoration is lossless across supported schema versions.

### R1 - OpenTUI-Inspired Renderer And Terminal Services (P2, Large)

- [ ] Unify alternate-screen, buffered main-screen, and split-footer modes behind one renderer-neutral policy. Do not
      call OpenTUI-style main-screen rendering true inline mode; specify a separate embedded/inline contract only if a
      concrete host use case requires it.
- [ ] Add styled scrollback snapshots and reusable streaming off-screen surfaces for Markdown, code, and process output.
- [ ] Complete structured Kitty keyboard press/repeat/release and base-layout metadata while keeping legacy input paths.
- [x] Add terminal theme/palette detection, title/background control, OSC 52 clipboard, desktop notifications, raw OSC
      subscriptions, and capability diagnostics with conservative fallbacks.
- [ ] Audit Unicode-width mode, truecolor/ANSI-256 depth, synchronized updates, hyperlinks, focus and bracketed-paste
      support, Kitty/Sixel protocol support, and terminal/multiplexer identity. Keep capability detection distinct from
      actually shipping a renderer for a detected graphics protocol.
- [ ] Add renderer idle/live-request accounting, frame statistics, scheduler diagnostics, and a reusable debug/console
      overlay rather than demo-local instrumentation.
- [ ] Audit custom stream ownership for PTY, SSH, WebSocket, xterm.js, and browser remote sessions.

Completed slice July 16, 2026: renderer-neutral OSC services now sanitize control injection, default every side effect
to disabled, bound clipboard/text/pending input, parse chunked color replies, isolate subscriber failures, expose
capability diagnostics, and provide an explicit theme/palette probe whose host owns the response deadline.

Acceptance:

- Terminal teardown restores every mode and global hook after normal exit, error, suspend, and signal handling.
- Capability-gated features fail closed and report why.
- Test transports can capture styled cells, cursor state, frame stats, and scrollback without a real TTY.

### G1 - Advanced Three/Glyph Sampling (P2, Medium)

- [ ] Add a dual-foreground/background 2x2 quadrant sampler as a separate mode from the repaired density-ramp glyph
      renderer.
- [ ] Compare the standard sampler with OpenTUI's GPU-only horizontally pre-squeezed technique for terminal cell aspect
      ratios; treat a matching CPU pre-squeezed path as a repo extension.
- [ ] Preserve and centralize perspective-camera cell-aspect correction; evaluate orthographic-camera correction as a
      separate repo extension with explicit projection tests.
- [ ] Provide GPU and deterministic CPU pixel-to-cell sampling with the same grid contract and explicit fallback reason.
      Do not describe the CPU sampler as software 3D rendering: scene rendering still requires the selected Three/WebGPU
      path.
- [ ] Add frame/image capture, sampler statistics, color-error metrics, and fixtures for ramps, quadrant glyphs, and
      full blocks.

Acceptance:

- Existing density ramps remain selectable and unchanged.
- CPU/GPU samples agree within a documented color/coverage tolerance.
- Live probes cover resize, fullscreen, narrow panes, fallback, and both sampling families.

### V1 - Close High-Value Widget And Content Gaps (P2, Large)

- [ ] Audit the existing `ScrollArea` and terminal scrollback controllers against OpenTUI's `ScrollBox` before adding a
      new abstraction; close only concrete gaps in bidirectional scrolling, sticky-edge behavior, viewport culling,
      configurable acceleration, `scrollChildIntoView`, scrollbar integration, nested input routing, and large-content
      behavior.
- [ ] Add a worker-backed Tree-sitter service and reusable code view with streaming highlighting, selection,
      concealment, diagnostics, and horizontal/vertical scrolling.
- [ ] Build line-number/sign gutters and unified/split diff views with synchronized scrolling on that code-view core.
- [ ] Extend `TextBox` into a full text-area surface with selection-edge auto-scroll, soft/character/no-wrap modes,
      configurable editing aliases, and optional syntax highlighting.
- [x] Deliver the bounded editor v2 foundation: visible grapheme-safe directional ranges, Shift/Ctrl-A selection,
      selection-aware atomic edits/paste, cell-width-aware Unicode projection, and failure-atomic bounded literal
      current-document find/replace with focused terminal tests.
- [ ] Add cross-container selectable text and a clipboard abstraction shared by terminal OSC 52 and browser clipboard.
- [ ] Add only genuinely missing general widgets: masked input, selection list, content switcher/collapsible, and richer
      loading/digits surfaces. Reuse DataTable, Tree/FileExplorer, Markdown, logs, and existing controls.
- [ ] Keep QR, ASCII-art fonts, native audio, and niche first-party OpenTUI packages as optional follow-ups unless an
      adopter requests them.

Acceptance:

- Large code/diff/Markdown documents remain virtualized and responsive.
- Selection, copy, keyboard editing, and scrolling have terminal/browser parity.
- New widgets use existing controller, command, theme, focus, hydration, and testing contracts.

### K1 - Layered Keymaps And Typed Plugin Slots (P2, Medium)

- [x] Extend the simple key registry with ordered global, focus-within, and exact-focus layers.
- [x] Add named command metadata, runtime conditions/modes, multi-stroke sequences, leader keys, pending-sequence
      inspection, conflict analysis, and live remapping.
- [x] Define typed host-owned UI slots with append, replace, and single-winner policies plus deterministic ordering and
      disposal.
- [x] Let core, markup, and optional JSX adapters contribute to slots without granting plugins layout ownership.
- [ ] Evaluate a Deno-native JSX reconciler after the live markup tree is stable; do not require React, Solid, Bun, or a
      native Zig runtime.

Completed slice July 16, 2026: the framework-neutral plugin-slot registry preserves host fallback UI, orders by priority
then registration sequence, isolates setup/render/dispose failures, exposes bounded diagnostics, and releases
contributions in deterministic reverse lifecycle order.

The layered registry resolves modal capture, exact focus, deepest focus-within, then global bindings; runtime
conditions, active/inactive reasons, winner/shadow conflict reports, safe dispatch, atomic focus-path changes, and
disposal are inspectable. `KeySequenceCoordinator` composes over that resolver with named command metadata, configurable
leaders, bounded multi-stroke prefixes, caller-advanced deadlines, runtime modes and conditions, defensive conflict
inspection, and atomic live-remap rollback without hidden timers.

`PluginSlotSourceAdapter` accepts core, markup, and optional view/JSX-style value sources through cloned, frozen,
data-only context. It preflights multi-registration sources, rolls partial contribution setup back in reverse order,
isolates conversion/render/disposal failures, preserves unrelated registrations and host fallback UI, and never exposes
layout controllers or ownership to plugins.

Acceptance:

- Key conflicts and inactive bindings are inspectable and testable.
- Focus transitions atomically activate the correct layers.
- Plugin failure cannot remove host UI or leak slot contributions.

### T1 - Testing And Visual Regression (P1, Medium)

- [ ] Extend `TerminalAppPilot` with selector/ID clicks, hover, mouse capture, modifiers, double/triple click, frame
      waits, and tooltip/notification helpers.
- [ ] Capture styled spans, cursor state, hit regions, layout trees, and renderer stats in addition to plain text.
- [ ] Add an HTML/SVG visual snapshot diff report and terminal-size/key-sequence test matrix.
- [ ] Add solver fuzz/property tests and incremental-vs-full equivalence tests.

Acceptance:

- Every accepted milestone has unit, integration, terminal, and browser evidence proportional to its risk.
- Visual changes produce a reviewable artifact rather than only a pass/fail checksum.
- Randomized failures retain a reproducible seed and minimal fixture.

### T2 - Devtools And Performance (P2, Medium)

- [ ] Add a live layout/style/event inspector, filtered console, worker/resource view, key diagnostic tool, and
      hot-reload error surface.
- [ ] Surface dirty/invalidation reasons, selected solver capabilities, frame timing, cell-diff size, cache behavior,
      task ownership, and leaked-resource warnings without requiring demo-local instrumentation.
- [ ] Add repeatable large-tree/layout/render benchmarks with cold/warm separation and checked-in comparison reports.
- [ ] Define performance budgets only after collecting representative terminal, browser, and worker baselines.

Acceptance:

- Devtools can be disabled without changing application output or lifecycle behavior.
- Performance regressions are visible and attributable rather than hidden in aggregate wall time.
- Diagnostic surfaces redact application content unless the host explicitly opts in.

### T3 - Accessibility Contract (P2, Medium; Repo Extension)

- [ ] Define a semantic accessibility tree for browser hosts and document the smaller set of semantics that terminal
      protocols can actually expose.
- [ ] Add keyboard-only acceptance, reduced-motion behavior, contrast checks, high-contrast/color-blind themes, and
      labels/roles for all workbench controls.
- [ ] Specify focus order and announcements for modal, tiled-window, menu, tab, tree, table, and virtualized content
      transitions.
- [ ] Treat this as an explicit repo extension: Textual supplies useful keyboard/focus patterns but does not establish
      screen-reader, high-contrast, or color-blind feature parity for this project.

Acceptance:

- Browser semantics and keyboard behavior have automated coverage plus a documented manual audit path.
- Reduced-motion and contrast requirements are enforceable release gates.
- Terminal documentation makes no unsupported screen-reader claims.

## Recommended Sequence

1. L0 completed.
2. Approve and run the bounded L2 spike against L0, then make an evidence-backed Taffy adoption decision.
3. Approve L1 and L3 separately, targeting the chosen backend strategy while keeping the public solver boundary stable.
4. Approve C1 and D1 separately so accepted advanced layout is usable from live markup, not only low-level objects.
5. Select W1, W2, and T1 when application integration and test depth become the next priorities.
6. Select R1, G1, V1, K1, T2, and T3 subfeatures based on adopter needs rather than landing them as one mega-change.

## Explicit Non-Goals For The First Slice

- Full browser CSS compatibility, floats, browser table layout, transforms, filters, or arbitrary compositing.
- Replacing the Deno runtime with OpenTUI's Zig/Bun core.
- Adding React or Solid as required dependencies.
- Adopting Taffy before the import, bundle, parity, lifecycle, and performance spike passes.
- Rewriting the tiled workspace, existing controllers, signals, commands, themes, testing harness, or Three ASCII API.
- Implementing native audio, SSH hosting, QR codes, or every upstream widget before core layout correctness.
- Claiming screen-reader support in terminals where the platform cannot provide it; browser semantic output remains a
  concrete accessibility target.

## Verification Gates For Any Approved Work

- Focused unit tests for each changed contract and cross-solver fixture.
- `deno fmt --check`
- `deno test -A`
- `deno task api-workbench:check`
- `deno task web:check`
- `deno task web:demo:check`
- `deno task web:test`
- `deno task web:pages:build`
- Relevant live terminal/visual probes for renderer or layout changes.
- ICC index/memory/history refresh, guard-diff, readiness, completion-oracle, production-audit, verified task attempt,
  and zero active/stale/conflicting leases.

## Approval Choices

- L0 is complete and provides the evidence needed for later solver decisions.
- After L0 lands, approve L2 as a bounded spike; its report determines whether L1 and L3 should target simple/Yoga,
  Taffy, or a deliberate combination.
- Approve any later milestone separately by ID: L1, L3, C1, D1, W1, W2, R1, G1, V1, K1, T1, T2, or T3.
- Revise or reject individual checkboxes before implementation begins.
