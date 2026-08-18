# HTML/CSS Layout Engine Plan

## Goal

Add an HTML-like and CSS-like authoring layer for Deno TUI while preserving the existing terminal-first,
renderer-neutral component model.

The target is not full browser compatibility. The target is a documented TUI subset that lets users write familiar
markup and CSS, compiles into a shared layout tree, hydrates existing controllers/widgets, and renders through both the
terminal and browser runtimes.

## Why This Matters

The current library has useful layout primitives, widgets, themes, command surfaces, browser entrypoints, and a window
manager. What it does not have yet is a single layout tree that can:

- measure content and intrinsic sizes,
- apply min/max/preferred sizes,
- compose block, flex, grid, split, dock, scroll, overlay, modal, and window layout,
- produce stable rects and hit regions,
- drive terminal and browser renderers from the same output,
- connect focus, mouse, keyboard, and command behavior to the same tree.

HTML/CSS support should be built on that foundation. Parsing HTML and CSS before this foundation exists would only add a
new syntax over app-specific layout behavior.

## Existing Repo Fit

Current useful building blocks:

- `src/layout/flex_layout.ts`: lightweight row/column flex size solving.
- `src/layout/grid_layout.ts`: existing signal-driven grid layout component.
- `src/layout/responsive.ts`: breakpoints, adaptive grids, tiling, splits, insets.
- `src/layout/recipe.ts`: breakpoint-driven dock/split/leaf recipes.
- `src/layout/window_manager.ts`: renderer-neutral window states and tiling.
- `src/layout/overlay.ts`: z-order, popovers, modal blockers, overlay hit testing.
- `src/components/*`: widget controllers that can be hydrated from markup tags.
- `src/components/interaction.ts`: hit-region helpers.
- `src/focus.ts`: focus manager and focus scopes.
- `src/theme.ts`, `src/theme_engine_*`: token/component theming.
- `src/web/*`: browser-safe render and input surfaces.

The HTML/CSS layer should compile into these systems rather than fork them.

## External Technology Survey

### Textual / TCSS

Textual is the strongest production reference for terminal UI development with a CSS-like styling model. Its value for
this project is architectural: widget structure remains separate from styling, CSS-like selectors target widget trees,
and terminal layout gets a web-inspired box model rather than ad hoc per-widget positioning.

Useful ideas to copy:

- CSS variables and theme tokens.
- Separate structure from style.
- Developer ergonomics around CSS files and hot reload.
- TUI-specific CSS subset instead of pretending to implement all browser CSS.
- First-class layout properties such as padding, margin, width, height, dock, and overflow.

Less useful as a direct port:

- It is Python-native and tied to Textual's widget/runtime model.
- TCSS is intentionally Textual-specific.

Primary references:

- https://textual.textualize.io/guide/CSS/
- https://textual.textualize.io/guide/layout/

### Yoga

Yoga is an embeddable Flexbox engine. It is the most practical short-term solver candidate because it already has a
JavaScript/npm package that imports under Deno.

Local viability check completed:

- `deno info npm:yoga-layout` resolved `yoga-layout@3.2.1`.
- A `deno eval` smoke test imported Yoga, created a row flex tree, calculated layout, and returned integer-ish computed
  widths successfully.

Useful ideas:

- Use Yoga as a pluggable Flexbox solver behind a repo-owned `LayoutSolver` interface.
- Keep style parsing and CSS cascade in TypeScript; Yoga only receives normalized computed style.
- Round Yoga output into terminal cell rects at the engine boundary.

Limitations:

- Yoga does not solve CSS Grid.
- Yoga does not parse HTML or CSS.
- Yoga expects a node API, so we need a style-to-Yoga adapter and lifecycle management.
- We need our own support for overlays, scroll containers, terminal borders, focus order, and hit regions.

Primary references:

- https://www.yogalayout.dev/
- https://github.com/facebook/yoga

### Taffy

Taffy is the most attractive long-term solver candidate. It is a Rust layout library covering multiple CSS-inspired
algorithms, including Flexbox, CSS Grid, and Block layout. It is a better match for a broad layout engine than Yoga, but
it introduces a Rust/WASM build and packaging decision for Deno and browser consumers.

Useful ideas:

- Treat Taffy as a future `LayoutSolver` backend once the internal tree and style model are stable.
- Use Taffy's larger layout surface as a guide for our normalized style schema.
- Consider a WASM package only after Yoga/fallback solver tests prove the engine boundary.

Limitations:

- Requires a maintained WASM bridge or local Rust build pipeline.
- Adds packaging complexity for Deno, browser, GitHub Pages, and possibly npm/npm-free usage.
- Still requires our own HTML parser, CSS cascade, widget hydration, event model, themes, and renderers.

Primary reference:

- https://docs.rs/taffy/latest/taffy/

### OpenTUI

OpenTUI is a strong reference for high-performance JavaScript/TypeScript terminal UI design with a native backend and
Yoga-style layout. Its relevance is less "copy the API" and more "validate that a JS tree plus native/WASM layout solver
can work well for terminals."

Useful ideas:

- Keep JS/TS app authoring ergonomic.
- Use an explicit render tree.
- Use a high-performance backend where layout/rendering needs it.
- Treat terminal rendering as a real renderer, not a string-concatenation afterthought.

Limitations:

- The backend architecture is different from this repo's existing Deno-first runtime.
- Directly porting OpenTUI would likely fight our current controllers, canvas, themes, and web package.

Primary reference:

- https://opentui.com/

### Dioxus TUI

Dioxus TUI is useful mostly as a historical/reference point: Rust UI frameworks have shown that HTML-like trees can be
rendered into terminal cells through a layout solver. It is not the best direct dependency for this TypeScript/Deno
library.

Useful ideas:

- Markup/component trees can target terminal renderers.
- A layout solver can sit below a declarative UI tree.

Limitations:

- Rust ecosystem, not directly reusable in Deno without a larger port.
- We should verify current upstream status before treating it as a current production reference.

Reference:

- https://docs.rs/dioxus-tui/latest/dioxus_tui/

### Melker-Style Document Authoring

The document-first `.melker` idea is directionally useful: simple files containing markup, styles, and logic can make
TUI apps approachable. During this pass, I did not find a mature, reusable Melker implementation that should be ported
directly into this repo.

Useful idea:

- A single-file authoring format could be a later convenience layer:

```html
<template>
  <window title="Monitor">
    <button id="refresh">Refresh</button>
  </window>
</template>

<style>
window {
  display: flex;
  flex-direction: column;
}
button {
  background: var(--button-bg);
  color: var(--button-fg);
}
</style>

<script type="module">
export function refresh() {}
</script>
```

Recommendation:

- Do not port Melker first.
- Build the tree/style/layout/hydration primitives first.
- Add `.tui.html`, `.tui.css`, or `.tui` single-file syntax after the core engine works.

### Parser Packages

The parser layer can be implemented with existing JavaScript packages rather than hand-written parsers.

Local Deno viability checks:

- `deno info npm:parse5` resolved `parse5@8.0.1`.
- `deno info npm:css-tree` resolved `css-tree@3.2.1`.
- `deno info npm:yoga-layout` resolved `yoga-layout@3.2.1`.

Recommended parser choices:

- `parse5` for HTML parsing because it is a mature WHATWG-style HTML parser.
- `css-tree` for CSS parsing, AST walking, and validation-friendly transforms.
- Avoid `Lightning CSS` initially despite its quality because it adds a Rust/native/WASM complexity profile that
  overlaps with the future Taffy decision.

Primary references:

- https://github.com/inikulin/parse5
- https://github.com/csstree/csstree
- https://lightningcss.dev/

## Recommended Strategy

Build a repo-owned layout engine and markup package with a pluggable solver boundary.

Do not directly port a complete framework. The existing repo already has enough primitives that a direct port would
duplicate or undermine them. The more durable path is:

1. Define a shared layout tree.
2. Normalize CSS into a terminal-aware style model.
3. Add a solver interface.
4. Implement a small deterministic fallback solver.
5. Add a Yoga solver for Flexbox.
6. Keep Taffy as a planned backend once the boundary is proven.
7. Hydrate markup nodes into existing controllers/widgets.
8. Render through existing terminal and browser surfaces.

## Proposed Public Shape

New package areas:

- `src/layout/engine.ts`
- `src/layout/style.ts`
- `src/layout/solver.ts`
- `src/layout/solvers/simple.ts`
- `src/layout/solvers/yoga.ts`
- `src/markup/html.ts`
- `src/markup/css.ts`
- `src/markup/cascade.ts`
- `src/markup/hydrate.ts`
- `src/markup/mod.ts`

Exports:

- `mod.ts` should export the stable engine and markup APIs once ready.
- `mod.web.ts` should export the same browser-safe markup APIs.
- Solver adapters that pull npm/WASM dependencies should be optional imports if possible.

Example authoring API:

```ts
import { createMarkupApp, yogaLayoutSolver } from "./mod.ts";

const app = createMarkupApp({
  markup: `
    <window id="main" title="System Monitor">
      <div class="toolbar">
        <button id="refresh">Refresh</button>
        <select id="theme"></select>
      </div>
      <scroll-area class="body">
        <table id="processes"></table>
      </scroll-area>
    </window>
  `,
  css: `
    window {
      display: flex;
      flex-direction: column;
      border: single;
      background: var(--surface);
      color: var(--foreground);
    }

    .toolbar {
      display: flex;
      gap: 1;
      padding: 0 1;
      background: var(--surface-raised);
    }

    .body {
      flex: 1;
      overflow: auto;
    }
  `,
  solver: yogaLayoutSolver(),
});
```

Internal tree sketch:

```ts
export interface LayoutNode {
  id: string;
  tag: string;
  classes: readonly string[];
  attributes: Record<string, string>;
  text?: string;
  style: ComputedLayoutStyle;
  children: LayoutNode[];
  intrinsic?: LayoutIntrinsicSize;
}

export interface ComputedLayoutBox {
  id: string;
  tag: string;
  rect: Rectangle;
  contentRect: Rectangle;
  padding: BoxEdges;
  margin: BoxEdges;
  border: BoxEdges;
  overflowX: "visible" | "hidden" | "auto" | "scroll";
  overflowY: "visible" | "hidden" | "auto" | "scroll";
  zIndex: number;
  hitRegions: WidgetHitRegion[];
}

export interface LayoutSolver {
  readonly id: string;
  supports(style: ComputedLayoutStyle): boolean;
  solve(input: LayoutSolverInput): LayoutSolverResult;
}
```

## CSS Subset

Initial supported selectors:

- tag selectors: `button`
- class selectors: `.toolbar`
- id selectors: `#refresh`
- descendant selectors: `window button`
- direct child selectors: `.toolbar > button`
- state selectors mapped from widget state: `:focus`, `:active`, `:disabled`, `:hover`
- `:root` for variables

Initial supported values:

- integers as terminal cells
- `%`
- `auto`
- `fr` for repo-owned grid/split sizing, not Yoga
- colors: ANSI names, 8-bit index, RGB hex, `rgb()`, `var()`
- theme tokens: `var(--foreground)`, `var(--surface)`, etc.

Initial supported properties:

- `display: block | flex | grid | none`
- `flex-direction`
- `flex-wrap`
- `flex-grow`
- `flex-shrink`
- `flex-basis`
- `align-items`
- `justify-content`
- `gap`, `row-gap`, `column-gap`
- `width`, `height`, `min-width`, `min-height`, `max-width`, `max-height`
- `margin`, `padding`
- `border`, `border-style`, `border-color`
- `background`, `background-color`
- `color`
- `overflow`, `overflow-x`, `overflow-y`
- `position: relative | absolute`
- `top`, `right`, `bottom`, `left`
- `z-index`
- `visibility`

Explicitly unsupported at first:

- floats
- inline layout beyond text runs
- transforms
- animations/transitions
- media queries beyond terminal-aware breakpoints
- browser painting effects such as shadows, filters, gradients
- arbitrary CSS units such as `em`, `rem`, `vh`, `vw` until their terminal meaning is specified

## Widget Hydration

Markup tags should map to existing controllers/components:

- `<button>` -> button controller/render helper
- `<input type="text">` -> input/textbox controller
- `<textarea>` -> multiline textbox controller
- `<checkbox>` or `<input type="checkbox">` -> checkbox controller
- `<radio-group>` -> radio group controller
- `<select>` -> combobox/dropdown controller
- `<slider>` -> slider controller
- `<table>` -> data table controller
- `<tree>` -> tree/file explorer controller
- `<tabs>` -> tabs controller
- `<modal>` / `<dialog>` -> modal/overlay controller
- `<scroll-area>` -> scroll area/pad controller
- `<window>` -> window manager entry
- `<menu-bar>` -> menu bar controller
- `<three-ascii>` -> Three ASCII panel controller

Hydration should be one-way at first:

1. Parse markup.
2. Build a layout tree.
3. Create controller instances.
4. Attach event handlers by id or action name.
5. Render from controller state.

Avoid two-way DOM mutation semantics in the first version.

## Event Model

Needed event surfaces:

- `click`
- `keydown`
- `input`
- `change`
- `focus`
- `blur`
- `wheel`
- `pointerdown`
- `pointermove`
- `pointerup`

Recommended routing:

- Layout engine produces hit regions.
- Overlay stack filters topmost target and modal blockers.
- Event dispatcher targets a node/controller.
- Optional bubbling can be added after targeted dispatch is reliable.
- Keyboard focus order follows document order unless `tabindex` is set.

## Solver Decision Matrix

| Option                             | Pros                                         | Cons                                                     | Recommendation                        |
| ---------------------------------- | -------------------------------------------- | -------------------------------------------------------- | ------------------------------------- |
| Extend current layout helpers only | No new dependencies, easy to test            | Still fragmented, no standard flex/grid behavior         | Use as fallback only                  |
| Yoga npm solver                    | Works in Deno now, small, Flexbox-compatible | No Grid/Block, requires adapter, optional npm dependency | Recommended Phase 1 solver            |
| Taffy WASM solver                  | Flex/Grid/Block, best long-term CSS fit      | Rust/WASM/package complexity                             | Phase 2/3 spike after engine boundary |
| Browser DOM layout                 | Native browser CSS                           | Terminal cannot use it, hard to keep parity              | Debug/preview adapter only            |
| Full framework port                | Faster if it matched perfectly               | Fights existing architecture and public APIs             | Do not do first                       |

## Implementation Phases

### Current Implementation Checkpoint

- The renderer-neutral `LayoutNode`, `ComputedLayoutStyle`, `ComputedLayoutBox`, and `LayoutSolver` boundary are in
  place.
- The lightweight CSS parser/cascade supports selectors, specificity, variables, inline styles, pseudo states, and the
  documented terminal-cell layout declarations.
- Markup hydration maps common controls onto existing controller classes.
- The default TypeScript solver supports block layout, flex row/column layout, wrapped flex rows/columns,
  `justify-content`, `align-items`, a CSS Grid subset with explicit tracks, `fr`, gaps, line spans, auto-placement,
  absolute-positioned children, box edges, overflow metadata, and hit regions.
- The optional Yoga solver consumes the same normalized style model and now maps `flex-wrap`/`flex-flow` into Yoga's
  Flexbox implementation plus `inset`/side offsets into Yoga absolute positioning.
- Markup layout can be offloaded through `createMarkupLayoutWorkerHandler()` and `runMarkupLayoutInWorker()`, allowing
  browser or console apps to parse CSS/markup and solve layout in a `WorkerPool` while keeping widget controllers on the
  UI thread.
- Simple-solver intrinsic measurement now follows flow layout participation for parent auto sizing: `display:none` and
  absolute-positioned children are excluded, explicit child dimensions are respected, and `gap` fallback contributes to
  block and flex-row intrinsic sizes.
- Simple and Yoga solvers share terminal-aware text intrinsic measurement. Simple-solver auto-height text boxes are
  measured after explicit width resolution, so wrapped text, scroll extents, and panel bounds agree.
- The CSS subset now includes `white-space`, `overflow-wrap`, and `word-wrap`, with solver-aware intrinsic text
  measurement for no-wrap and long-token wrapping behavior.
- The selector subset now includes bounded structural pseudo-classes for common terminal list and toolbar styling:
  `:first-child`, `:last-child`, `:only-child`, and `:nth-child(number|odd|even)`.
- The Flexbox subset now includes stable `order` support in both the simple TypeScript solver and the optional Yoga
  adapter.
- Markup widget hydration now honors `tabindex` for focus order: positive indexes sort first, `0` and missing values
  follow document order, and negative values are omitted from traversal.
- Intrinsic measurement cache keys now include the flow-affecting style fields used by that sizing path, including
  position, explicit/min/max dimensions, flex basis, and gap values.
- The next high-value solver work is richer block/intrinsic text behavior, full Grid/Taffy parity, and either a Taffy
  WASM adapter or a Taffy-compatible internal style mapping layer.

### Phase 0: Spike And Lock Decisions

- Add a small solver spike under `tests/fixtures` or `scripts/spikes`.
- Verify Yoga imports through Deno, browser bundle, and GitHub Pages build.
- Verify `parse5` and `css-tree` import through Deno and browser bundle.
- Check dependency licenses and package sizes.
- Decide whether optional npm imports belong in root exports or opt-in subpath exports.

Acceptance:

- One terminal test proves parse -> CSS -> Yoga layout -> cell rects.
- One web check proves the same path bundles.
- Dependency and license notes are documented.

### Phase 1: Layout Tree Core

- Add `LayoutNode`, `LayoutStyle`, `ComputedLayoutStyle`, `ComputedLayoutBox`.
- Add `LayoutEngine` with `measure()` and `layout()` phases.
- Add terminal cell rounding rules.
- Add intrinsic text measurement with word wrap.
- Add overflow metadata and scroll extents.
- Add hit region generation.
- Add snapshot inspection helpers.

Acceptance:

- Unit tests cover block layout, flex fallback layout, min/max clamping, text measurement, overflow, and hit regions.
- Existing `src/layout` helpers remain exported and compatible.

### Phase 2: CSS Parser And Cascade

- Add `parseCssStylesheet()`.
- Add selector matching for tag/class/id/descendant/direct child/state selectors.
- Add specificity and source order.
- Add CSS variable resolution.
- Add theme token variable injection.
- Add supported-property validation with useful diagnostics.

Acceptance:

- Tests cover cascade order, specificity, variables, unsupported declarations, and theme token resolution.
- Diagnostics are stable enough for docs and demos.

### Phase 3: HTML Parser And Hydration

- Add `parseTuiMarkup()` using `parse5`.
- Normalize text nodes and attributes.
- Map tags to semantic layout nodes.
- Add controller hydration registry.
- Add action/event binding by id.
- Add focus order from document order.

Acceptance:

- Tests cover parser normalization, tag registry errors, hydration, events, focus order, and widget state updates.

### Phase 4: Yoga Solver Adapter

- Add `yogaLayoutSolver()` behind an optional import path if possible.
- Map normalized styles to Yoga node properties.
- Implement measure callbacks for text and custom widgets.
- Convert computed Yoga output to terminal cell rectangles.
- Add deterministic rounding for fractional outputs.
- Add `simpleLayoutSolver()` fallback.

Acceptance:

- Flexbox tests compare expected terminal-cell rects.
- Yoga and fallback tests share the same public fixtures where practical.
- Browser Pages build still passes.

### Phase 5: Scroll, Overlay, Windows, And Web Parity

- Integrate layout overflow with `ScrollAreaController` and `PadController`.
- Integrate `OverlayStackController` for dropdowns, menus, popovers, modals, and tooltips.
- Integrate `WindowManagerController` for `<window>` trees.
- Ensure web and terminal event dispatch use the same layout hit regions.
- Add a DOM debug renderer for inspecting the computed tree in browser demos.

Acceptance:

- Dropdowns and modals do not disturb layout flow.
- Scrollbars map pointer position to content offsets.
- Same markup demo runs in terminal and browser.

### Phase 6: Demo, Docs, And Developer Experience

- Add `examples/html_css_workbench.ts`.
  - Done: `deno task html-css-workbench` renders the shared HTML/CSS workbench layout fixture as colored terminal cells.
- Add `examples/web/html_css_page.ts`.
- Add a docs page explaining the supported CSS subset.
- Add API reference coverage for markup and layout engine APIs.
- Add screenshots and a Pages demo.
- Add hot-reload support for local CSS/markup files if practical.

Acceptance:

- `deno task health`
- `deno task web:pages:build`
- New tests for parser, cascade, layout, hydration, and browser import.
- README links to the HTML/CSS authoring path.

### Phase 7: Taffy WASM Evaluation

- Build or consume a Taffy WASM adapter behind the existing `LayoutSolver` interface.
- Compare output against Yoga and fallback fixtures.
- Measure performance on large widget trees.
- Decide whether Taffy should replace Yoga, complement it for Grid/Block, or remain experimental.

Acceptance:

- Documented benchmark and compatibility report.
- No public API churn required to switch solvers.

## Testing Strategy

Test layers:

- Parser tests for HTML normalization and CSS AST diagnostics.
- Cascade tests for specificity, variables, inheritance, and theme tokens.
- Layout tests for block, flex, grid subset, rounding, min/max, overflow, and intrinsic text.
- Hydration tests for every supported widget tag.
- Event tests for mouse, keyboard, focus, blur, wheel, and modal blocking.
- Snapshot tests for computed layout trees.
- Browser bundle tests through `deno task web:demo:check` and `deno task web:pages:build`.
- Manual terminal tests through the workbench and demo launcher once demos exist.

## Performance Strategy

- Cache parsed HTML and CSS by content hash.
- Cache selector matching where tree structure is unchanged.
- Track dirty style/layout/render regions separately.
- Incrementally relayout from the nearest dirty ancestor.
- Run expensive parse/layout work in a worker where browser/runtime support exists.
  - `createMarkupLayoutWorkerHandler()` and `runMarkupLayoutInWorker()` now provide the first renderer-neutral worker
    seam for parse/cascade/layout jobs. The current worker result intentionally disables widget hydration so controller
    state remains local to the interactive UI adapter.
- Keep Yoga/Taffy solver instances pooled or disposable with explicit lifecycle rules.

## Risks

- CSS compatibility expectations can grow without bound.
- Solver rounding can cause one-cell drift between terminal and browser.
- Optional npm/WASM dependencies can complicate Deno package ergonomics.
- Widget hydration can become a second framework if it bypasses existing controllers.
- Cascade and event bubbling can become subtle; tests need to be written before the API hardens.

## Recommendation

Proceed with a staged implementation.

The best first milestone is not "HTML/CSS everywhere." It is:

1. Add a real layout tree and solver boundary.
2. Add parser/cascade support for a small documented CSS subset.
3. Add Yoga as the first optional Flexbox solver.
4. Hydrate a limited but useful widget set.
5. Run the same markup demo in terminal and browser.

That puts the library on the path toward Textual/OpenTUI-style ergonomics without sacrificing the Deno-first runtime,
existing controllers, Three ASCII renderer, browser package, or terminal fidelity.
