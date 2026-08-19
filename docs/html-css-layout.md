# HTML/CSS-Style Layout

This fork now has a first renderer-neutral HTML/CSS-style authoring path for terminal-cell layouts.

This is not browser HTML/CSS compatibility. It is a deliberately small TUI subset that parses HTML-like markup and
CSS-like rules into the same layout tree used by terminal and browser render targets. The goal is familiar authoring
syntax without giving up predictable terminal cells, shared widget controllers, focus routing, hit regions, and the
existing Deno-first package model.

## Current Status

Implemented pieces:

- `parseTuiMarkup()` builds a renderer-neutral `LayoutNode` tree from HTML-like markup.
- `parseCssStylesheet()` parses a lightweight CSS subset into ordered rules.
- `applyCssCascade()` applies tag/class/id/attribute selectors, child and descendant selectors, pseudo states, CSS
  variables, and inline styles.
- CSS-like `@media` blocks can target terminal-cell viewport width and height with `min-width`, `max-width`,
  `min-height`, and `max-height`.
- `createMarkupLayout()` parses markup, applies CSS, and computes terminal-cell boxes.
- `hydrateMarkupWidgets()` and the `widgets` result from `createMarkupLayout()` create shared controllers for common
  markup controls and expose a renderer-neutral event dispatcher.
- `LayoutEngine` delegates layout to pluggable `LayoutSolver` backends.
- The default `simpleLayoutSolver()` is dependency-free and supports practical block/flex/grid layout, including wrapped
  flex rows/columns, a CSS Grid subset, and absolute-positioned children for terminal-cell containers.
- `./layout/yoga` exposes an experimental Yoga-backed Flexbox solver.
- `inspectLayoutSolverCapabilities()` reports every normalized style field and frozen invariant separately for Simple,
  Yoga, and the planned-but-unavailable Taffy adapter.
- `createMarkupLayout()` returns deterministic warnings for matched unknown or invalid declarations, selected-solver
  omissions, known partial cases, and semantic fallbacks.
- `examples/html_css_layout.ts` reports the computed tree through the simple solver or Yoga.

Not implemented yet:

- Full browser CSS compatibility.
- Full CSS Grid parity.
- Rich inline text layout.
- Component-specific rendering from every hydrated tag.
- DOM-style mutation semantics.
- Event bubbling/capture across a live markup tree.
- Hot reload for external markup/CSS files.

## Quick Start

```ts
import { createMarkupLayout } from "jsr:@ubernaut/exotui";

const result = createMarkupLayout({
  markup: `
    <window id="workspace">
      <menu-bar id="topbar">File View Theme Help</menu-bar>
      <div id="main">
        <panel id="sidebar">Explorer</panel>
        <scroll-area id="content">Rows and charts</scroll-area>
      </div>
      <statusbar id="status">ready</statusbar>
    </window>
  `,
  css: `
    window {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      gap: 1;
      padding: 1;
    }

    menu-bar,
    statusbar {
      height: 1;
    }

    #main {
      display: flex;
      flex: 1;
      flex-wrap: wrap;
      gap: 2;
      overflow: auto;
    }

    #sidebar {
      width: 24;
      padding: 1;
      border: 1 single var(--accent);
    }

    #content {
      flex: 1;
      padding: 1;
      overflow: auto;
    }
  `,
  cascade: {
    variables: {
      "--accent": "#7dd3fc",
    },
  },
  bounds: { column: 0, row: 0, width: 100, height: 30 },
});

console.log(result.layout.byId.get("content")?.rect);
result.widgets.dispatch({ type: "scroll", id: "content", rows: 5 });
result.widgets.dispose();
```

Responsive rules use terminal-cell dimensions:

```css
@media (max-width: 58) {
  #main {
    flex-direction: column;
  }

  #sidebar {
    width: 100%;
  }
}
```

`createMarkupLayout()` evaluates these rules against `bounds.width` and `bounds.height` unless you pass an explicit
`cascade.viewport`.

CSS Grid support is intentionally a terminal-cell subset. The default solver supports explicit tracks, `repeat(n, ...)`,
`fr` track distribution, `gap`, `grid-auto-flow: row | column`, implicit auto tracks, `grid-column`/`grid-row`
placements, and `grid-column-start`/`grid-column-end`/`grid-row-start`/`grid-row-end` longhands with numeric lines or
`span`. It also supports rectangular `grid-template-areas` plus per-item `grid-area` names. Grid items can use
`align-self`, `justify-self`, or `place-self` to align explicit-size boxes inside a larger grid track.

```css
#main {
  display: grid;
  grid-template-columns: 24 1fr 1fr;
  grid-template-rows: 3 1fr;
  gap: 1;
}

#terminal {
  grid-column: 2 / span 2;
  grid-row: 1 / span 2;
}
```

Run the report demo:

```bash
deno task html-css-layout
deno task html-css-layout:yoga
deno task html-css-layout:worker
deno task html-css-workbench
```

The worker report uses `WorkerPool`, `createMarkupLayoutWorkerHandler()`, and `runMarkupLayoutInWorker()` to run
parse/cascade/layout off the UI thread while leaving widget-controller hydration in the foreground app. The workbench
preview renders the shared layout fixture as colored terminal cells so the same flex, grid, media-rule, and
absolute-positioning behavior is visible without launching the full API Workbench.

Run the portfolio window demo:

```bash
./visualization portfolio
# Open New, then toggle "Layout: HTML/CSS Layout"
```

## Yoga Solver

The default solver is dependency-free and ships through the main entrypoint.

Yoga is opt-in through a separate experimental subpath:

```ts
import { createMarkupLayout } from "jsr:@ubernaut/exotui";
import { yogaLayoutSolver } from "jsr:@ubernaut/exotui/layout/yoga";

const result = createMarkupLayout({
  markup,
  css,
  bounds,
  solver: yogaLayoutSolver(),
});
```

Use Yoga when you want closer Flexbox behavior. Use the default solver when you want no optional solver dependency and
stable, inspectable cell math.

### Yoga Parity And Limits

The Yoga solver is a Flexbox backend behind the same `LayoutSolver` interface. It is expected to match the default
solver for the shared flex subset covered by fixtures:

- column and row flex containers
- wrapped flex rows
- fixed and percentage sizes
- `flex-grow`, `flex-shrink`, and `flex-basis`
- `gap`, padding, and borders
- basic absolute positioning
- terminal-cell rounding into `ComputedLayoutBox.rect`
- shared overflow inspection on solved boxes

Authoring support is available at runtime with `inspectTuiCssSupport()`, which returns selectors, pseudo states, media
features, CSS properties, markup tags, hydrated widget tags, explicit unsupported items, and the solver capability
report. Call `inspectLayoutSolverCapabilities()` directly when only backend data is needed.

Yoga is not a general replacement for the default solver. These remain intentionally unsupported or solver-specific:

- CSS Grid: use the default solver for grid tracks, spans, and grid item placement.
- browser CSS parsing: this project still owns the CSS-like parser and cascade.
- viewport (`vw`/`vh`), parent-axis (`w`/`h`), and `calc()` units: the Yoga adapter leaves them unset and the capability
  report marks them unsupported; use the Simple solver.
- browser layout units such as `em`, `rem`, and container queries.
- full browser intrinsic sizing, inline text layout, and baseline alignment (the Simple solver's
  min-content/max-content/fit-content subset is documented above).
- Yoga does not support CSS Grid, including named lines or template areas; use the Simple solver for the supported Grid
  subset. Named lines, subgrid, and dense browser Grid packing are unsupported by every current backend.
- paint/compositing features such as transforms, shadows, filters, gradients, transitions, and animations.
- exact browser flex edge cases involving margins, intrinsic basis calculation, and sub-cell rounding.

The contract to depend on is the normalized layout output, not browser pixel parity.

### Solver Capability Contract And Diagnostics

`inspectLayoutSolverCapabilities()` is serializable and exhaustive. Its `normalizedStyleFields` list has one entry for
every `ComputedLayoutStyle` field, and every solver profile classifies each field as `supported`, `partial`, `metadata`,
`outside-solver`, `unsupported`, or `unknown`. It also records support for cell rounding, overflow inspection, intrinsic
measurement, hidden nodes, absolute children, and min/max constraints.

```ts
import { inspectLayoutSolverCapabilities } from "jsr:@ubernaut/exotui";

const report = inspectLayoutSolverCapabilities();
const yoga = report.solvers.find((solver) => solver.solverId === "yoga");

console.log(yoga?.style.gridTemplateAreas); // "unsupported"
console.log(yoga?.invariants["intrinsic-measurement"]); // partial, with details
```

The markup path, and `LayoutEngine` when its optional diagnostic callback is supplied, make these current differences
explicit rather than silently normalizing them away:

- Input bounds are normalized to integer terminal cells. Simple floors resolved lengths while Yoga rounds its computed
  child edges and sizes.
- Simple omits non-root `display:none` subtrees; Yoga retains zero-sized invisible subtrees without hit regions.
- Simple honors `LayoutNode.intrinsic`; Yoga currently measures text leaves or a supplied callback.
- Simple may clip a minimum to its allocation; Yoga preserves the minimum and allows overflow.
- Simple's dual-edge absolute auto sizing remains solver-specific; Yoga follows its Flexbox inset behavior.
- Taffy is listed as `planned`, with every field unsupported until the L2 adapter spike succeeds.

`createMarkupLayout()` exposes warnings in `result.diagnostics`. Matched unknown properties and values outside the
documented terminal-cell grammar are reported as `unsupported-declaration`; fields ignored by a selected solver use
`unsupported-by-solver`; diagnosed partial behavior uses `partial-solver-support`; and Yoga's Block/Grid-to-column-Flex
behavior uses `solver-fallback`. Solver-specific warnings follow the winning declaration for each normalized field and
preserve stylesheet/inline provenance. Solving continues for backward compatibility. There is no implicit fallback from
one solver instance to another: a solver whose `supports()` method returns false still raises
`LayoutSolverUnsupportedError`.

## Supported Markup

Markup is normalized into `LayoutNode` records:

- `id` comes from the `id` attribute, or falls back to the tag name.
- `class` is split into `classes`.
- attributes are preserved as strings.
- text content is preserved on the owning node when practical.
- children preserve document order.

Useful semantic tags today:

- `window`
- `div`
- `panel`
- `menu-bar`
- `statusbar`
- `scroll-area`
- `button`
- `input`
- `textarea`
- `select`
- `table`
- `tree`
- `tabs`
- `modal`
- `three-ascii`

The tags are semantic layout nodes first. Supported interactive tags can also hydrate into shared controllers through
the default widget registry.

## Widget Hydration

`createMarkupLayout()` now returns a `widgets` handle in addition to the parsed document, styled tree, and computed
layout. The handle contains:

- `widgets`: ordered hydrated widgets.
- `byId`: widget lookup by markup id.
- `focusOrder`: focusable widgets in document order.
- `dispatch(event)`: renderer-neutral event routing.
- `inspect()`: serializable hydration summary.
- `dispose()`: controller cleanup.

The default registry hydrates:

- `button`
- `input type="text"` and `input type="password"`
- `input type="checkbox"` and `checkbox`
- `input type="range"` and `slider`
- `select`, `combobox`, and `combo-box`
- `radio-group`
- `textarea`, `textbox`, and `text-box`
- `tabs`
- `tree`
- `scroll-area`
- `window`, `panel`, `menu-bar`, `toolbar`, `statusbar`, and `form` as non-focusable containers

Dispatch events are intentionally small and renderer-neutral:

```ts
result.widgets.dispatch({ type: "press", id: "run", method: "keyboard" });
result.widgets.dispatch({ type: "input", id: "query", value: "deno task health" });
result.widgets.dispatch({ type: "toggle", id: "live" });
result.widgets.dispatch({ type: "select", id: "theme", index: 1 });
result.widgets.dispatch({ type: "set-value", id: "gain", value: 64 });
result.widgets.dispatch({ type: "scroll", id: "logs", rows: 10 });
```

Use a custom `MarkupWidgetHydrationRegistry` when an application introduces domain-specific tags. Factories return a
small descriptor with the widget kind, optional controller, focusability, and supported actions.

## Supported CSS Subset

Selectors:

- tag selectors: `button`
- class selectors: `.toolbar`
- id selectors: `#refresh`
- attribute selectors: `[disabled]`, `button[data-tone="primary"]`
- descendant selectors: `window button`
- direct child selectors: `.toolbar > button`
- pseudo states: `:focus`, `:active`, `:disabled`, `:hover`
- `:root` for root variables

Values:

- bare integers as terminal cells: `width: 24`
- `ch`, `cell`, `cells`
- percentages: `width: 100%`
- viewport-axis percentages: `width: 50vw`, `height: 25vh` (the solve bounds)
- parent-axis percentages, Textual-style: `width: 50w` (parent width), `width: 50h` (parent height), regardless of the
  property's own axis
- bounded additive `calc()`: at most 8 signed `+`/`-` terms of cells, `%`, `vw`, `vh`, `w`, or `h` — for example
  `width: calc(100% - 4)`. Nesting, multiplication, and `fr` terms are rejected; operators need surrounding spaces.
- intrinsic sizing keywords on the Simple solver: `min-content` (longest unbreakable word), `max-content` (the unwrapped
  line), and `fit-content` (the available size clamped between them) for `width`/`height` and their min/max forms —
  `min-width: min-content` is the content-derived minimum that keeps text from being squeezed below its longest word.
  Width-axis values are exact; the height axis uses the measured wrapped height; in grid tracks and `flex-basis` the
  keywords behave as `auto`.
- `fr` values for repo-owned sizing paths
- `auto`
- colors as strings for renderer/theme interpretation
- `var(--name)` with optional cascade variables

Properties:

- `display: block | flex | grid | none`
- `position: relative | absolute`
- `inset`, `top`, `right`, `bottom`, `left`
- `flex-direction`
- `flex-wrap`
- `flex-flow`
- `flex-grow`
- `flex-shrink`
- `flex-basis`
- `flex`
- `order`
- `align-items`
- `justify-content`
- `align-self`
- `justify-self`
- `place-self`
- `grid-template-columns`
- `grid-template-rows`
- `grid-template-areas`
- `grid-auto-columns`
- `grid-auto-rows`
- `grid-auto-flow`
- `grid-column`
- `grid-row`
- `grid-area`
- `grid-column-start`, `grid-column-end`
- `grid-row-start`, `grid-row-end`
- `width`, `height`
- `min-width`, `min-height`
- `max-width`, `max-height`
- `margin`, `padding`
- `border`
- `gap`, `row-gap`, `column-gap`
- `overflow`, `overflow-x`, `overflow-y`
- `color`, `background`, `background-color`, `border-color`, `border-style`
- `z-index`
- `visibility`
- `white-space`, `overflow-wrap`, `word-wrap`
- custom variables beginning with `--`

Unsupported for now:

- floats
- transforms
- animations/transitions
- browser layout units such as `em` and `rem` (`vh`, `vw`, `w`, `h`, and additive `calc()` are supported by the Simple
  solver)
- named grid lines, dense packing, subgrid, and full browser Grid behavior
- complex pseudo classes and pseudo elements
- browser paint effects such as shadows, filters, and gradients

Use `inspectTuiCssSupport()` when documentation, demos, or authoring tools need the canonical authoring subset plus the
per-backend matrix without scraping prose.

## Layout Output

`createMarkupLayout()` returns:

- `document`: parsed markup.
- `styledRoot`: cloned tree after cascade.
- `layout`: solver result with `root`, flattened `boxes`, `byId`, `contentWidth`, and `contentHeight`.
- `widgets`: hydrated widget controllers and dispatch helpers.
- `diagnostics`: deterministic selected-solver and declaration warnings suitable for tools, workers, and tests.

Each `ComputedLayoutBox` includes:

- `rect`
- `contentRect`
- `padding`, `margin`, `border`
- `overflowX`, `overflowY`
- `overflow`: shared viewport overflow inspection with per-axis content length, viewport length, scrollability,
  scrollbar visibility, thumb geometry, and visible range
- `scrollWidth`, `scrollHeight`
- `zIndex`
- `visible`
- `hitRegions`
- computed child boxes

That output is intentionally renderer-neutral. Terminal draw code, browser canvas code, DOM debug views, hit testing,
and widget hydration can consume the same boxes.

## Relationship To The Browser Runtime

The browser package should not rely on native browser layout for this feature. Native DOM/CSS layout is useful for debug
views and accessibility layers, but the core markup path should compile into terminal-cell boxes so terminal and browser
renders stay aligned.

See also:

- [Browser Framework Plan](./web-framework-plan.md)
- [API Stability and Packaging](./api-stability-and-packaging.md)
- [Implementation Plan](../plan/html-css-layout-engine.md)
