import { assert, assertEquals, assertThrows } from "./deps.ts";
import {
  htmlCssLayoutBoxStyle,
  type HtmlCssLayoutRenderCommand,
  htmlCssLayoutRenderCommandsInto,
  htmlCssLayoutSummaryRows,
  type HtmlCssLayoutTheme,
  htmlCssVisibleLayoutBoxesInto,
  renderApiWorkbenchHtmlCssLayout,
} from "../app/html_css_layout_view.ts";
import {
  applyCssCascade,
  ButtonController,
  CheckBoxController,
  ComboBoxController,
  createHtmlCssLayoutDemo,
  createLayoutEngine,
  createLayoutNode,
  createMarkupLayout,
  createMarkupLayoutWorkerHandler,
  defaultComputedLayoutStyle,
  hydrateMarkupWidgets,
  InputController,
  inspectLayoutSolverCapabilities,
  inspectTuiCssSupport,
  LayoutMeasurementCache,
  LayoutSolverUnsupportedError,
  layoutTree,
  MarkupLayoutCache,
  MarkupWidgetHydrationRegistry,
  matchesCssMedia,
  matchesCssSelector,
  measureTerminalTextIntrinsic,
  NORMALIZED_LAYOUT_STYLE_FIELDS,
  parseCssMediaQuery,
  parseCssStylesheet,
  parseTuiMarkup,
  RadioGroupController,
  runMarkupLayoutInWorker,
  ScrollAreaController,
  selectorParts,
  SIMPLE_LAYOUT_SOLVER_CAPABILITIES,
  simpleLayoutSolver,
  SliderController,
  TabsController,
  TextBoxController,
  TreeController,
  WorkerPool,
} from "../mod.ts";
import { computedLayoutBoxOverflow } from "../src/layout/solver.ts";
import { yogaLayoutSolver } from "../src/layout/solvers/yoga.ts";
import type {
  ApplyCssCascadeOptions,
  ComputedLayoutBox,
  LayoutDiagnosticCode,
  LayoutNode,
  LayoutSolver,
  LayoutSolverResult,
  MarkupLayoutWorkerPayload,
  MarkupLayoutWorkerResult,
  Rectangle,
} from "../mod.ts";

const htmlCssViewTheme: HtmlCssLayoutTheme = {
  accent: "#00ff99",
  accentDeep: "#006644",
  background: "#000000",
  border: "#333333",
  borderStrong: "#ffffff",
  buttonActiveBg: "#99ff00",
  buttonActiveText: "#101010",
  danger: "#ff3366",
  muted: "#888888",
  panel: "#151515",
  panelSoft: "#222222",
  soft: "#bbbbbb",
  surface: "#050505",
  text: "#eeeeee",
  warn: "#ffcc00",
};

const htmlCssViewContrast = (color: string) => `contrast:${color}`;

Deno.test("htmlCssLayoutBoxStyle maps special layout boxes to theme-aware styles", () => {
  assertEquals(htmlCssLayoutBoxStyle({ id: "layout-toolbar" }, htmlCssViewTheme, htmlCssViewContrast), {
    fg: "contrast:#006644",
    bg: htmlCssViewTheme.accentDeep,
    border: htmlCssViewTheme.accent,
    bold: true,
  });
  assertEquals(htmlCssLayoutBoxStyle({ id: "layout-stage" }, htmlCssViewTheme, htmlCssViewContrast), {
    fg: htmlCssViewTheme.text,
    bg: htmlCssViewTheme.panelSoft,
    border: htmlCssViewTheme.borderStrong,
    bold: true,
  });
  assertEquals(htmlCssLayoutBoxStyle({ id: "layout-badge" }, htmlCssViewTheme, htmlCssViewContrast), {
    fg: "contrast:#ffcc00",
    bg: htmlCssViewTheme.warn,
    border: htmlCssViewTheme.danger,
    bold: true,
  });
});

Deno.test("htmlCssLayoutBoxStyle groups grid and metric child boxes", () => {
  assertEquals(htmlCssLayoutBoxStyle({ id: "grid-shell" }, htmlCssViewTheme, htmlCssViewContrast), {
    fg: htmlCssViewTheme.buttonActiveText,
    bg: htmlCssViewTheme.buttonActiveBg,
    border: htmlCssViewTheme.accent,
    bold: true,
  });
  assertEquals(htmlCssLayoutBoxStyle({ id: "grid-worker" }, htmlCssViewTheme, htmlCssViewContrast), {
    fg: "contrast:#ffcc00",
    bg: htmlCssViewTheme.warn,
    border: htmlCssViewTheme.danger,
    bold: true,
  });
  assertEquals(htmlCssLayoutBoxStyle({ id: "grid-cache" }, htmlCssViewTheme, htmlCssViewContrast), {
    fg: htmlCssViewTheme.text,
    bg: htmlCssViewTheme.panel,
    border: htmlCssViewTheme.accent,
  });
  assertEquals(htmlCssLayoutBoxStyle({ id: "metric-cpu" }, htmlCssViewTheme, htmlCssViewContrast), {
    fg: htmlCssViewTheme.buttonActiveText,
    bg: htmlCssViewTheme.buttonActiveBg,
    border: htmlCssViewTheme.accent,
    bold: true,
  });
  assertEquals(htmlCssLayoutBoxStyle({ id: "metric-memory" }, htmlCssViewTheme, htmlCssViewContrast), {
    fg: htmlCssViewTheme.text,
    bg: htmlCssViewTheme.panel,
    border: htmlCssViewTheme.accent,
  });
});

Deno.test("htmlCssVisibleLayoutBoxesInto filters hidden boxes and reuses caller storage", () => {
  const target = [{ id: "stale", visible: true, zIndex: 99 }];
  const result = htmlCssVisibleLayoutBoxesInto(target, [
    { id: "layout-badge", visible: true, zIndex: 1 },
    { id: "hidden", visible: false, zIndex: -1 },
    { id: "layout-demo", visible: true, zIndex: 0 },
    { id: "layout-stage", visible: true, zIndex: 1 },
    { id: "grid-worker", visible: true, zIndex: 1 },
    { id: "metric-cpu", visible: true, zIndex: 1 },
  ]);

  assertEquals(result, target);
  assertEquals(
    result.map((box) => box.id),
    ["layout-demo", "layout-stage", "metric-cpu", "grid-worker", "layout-badge"],
  );
});

Deno.test("htmlCssLayoutSummaryRows exposes terminal and web host profiles", () => {
  const terminal = htmlCssLayoutSummaryRows("terminal");
  const web = htmlCssLayoutSummaryRows("web");

  assertEquals(terminal.length, 3);
  assertEquals(web.length, 3);
  assertEquals(terminal[0], web[0]);
  assertEquals(terminal[1]?.includes("Default solver"), true);
  assertEquals(web[2]?.includes("browser"), true);
});

Deno.test("htmlCssLayoutRenderCommandsInto projects boxes outlines labels and summaries", () => {
  const target: HtmlCssLayoutRenderCommand[] = [{
    kind: "fill",
    rect: { column: 9, row: 9, width: 1, height: 1 },
    bg: "stale",
  }];
  const rect = { column: 1, row: 1, width: 10, height: 5 };
  const contentRect = { column: 2, row: 2, width: 8, height: 3 };
  const zeroEdges = { top: 0, right: 0, bottom: 0, left: 0 };
  const metricBox: ComputedLayoutBox = {
    id: "metric-cpu",
    tag: "panel",
    classes: [],
    attributes: {},
    rect,
    contentRect,
    padding: zeroEdges,
    margin: zeroEdges,
    border: zeroEdges,
    overflowX: "visible",
    overflowY: "visible",
    scrollWidth: contentRect.width,
    scrollHeight: contentRect.height,
    overflow: computedLayoutBoxOverflow(contentRect, contentRect.width, contentRect.height, "visible", "visible"),
    zIndex: 0,
    visible: true,
    hitRegions: [],
    text: "CPU 42%",
    children: [],
  };
  const commands = htmlCssLayoutRenderCommandsInto(target, {
    bounds: { column: 0, row: 0, width: 20, height: 8 },
    boxes: [metricBox],
    theme: htmlCssViewTheme,
    contrast: htmlCssViewContrast,
    summaryRows: ["pipeline", "resize"],
  });

  assertEquals(commands, target);
  assertEquals(commands[0], {
    kind: "fill",
    rect: { column: 1, row: 1, width: 10, height: 5 },
    bg: htmlCssViewTheme.buttonActiveBg,
  });
  assertEquals(
    commands.some((command) => command.kind === "text" && command.text === "primary @media width:16"),
    true,
  );
  assertEquals(commands.some((command) => command.kind === "text" && command.text === "CPU 42%"), true);
  assertEquals(commands.some((command) => command.kind === "text" && command.text === "10x5 content 8x3"), true);
  assertEquals(commands.at(-2), {
    kind: "text",
    row: 6,
    column: 0,
    text: "pipeline",
    maxWidth: 20,
    fg: htmlCssViewTheme.accent,
    bg: htmlCssViewTheme.panelSoft,
    bold: true,
  });
  assertEquals(commands.at(-1), {
    kind: "text",
    row: 7,
    column: 0,
    text: "resize",
    maxWidth: 20,
    fg: htmlCssViewTheme.soft,
    bg: htmlCssViewTheme.panelSoft,
    bold: false,
  });
});

Deno.test("renderApiWorkbenchHtmlCssLayout paints terminal frame commands", () => {
  const frame: string[][] = [];
  const boxes: ComputedLayoutBox[] = [];
  const commands: HtmlCssLayoutRenderCommand[] = [];
  const fills: Rectangle[] = [];

  renderApiWorkbenchHtmlCssLayout({
    frame,
    rect: { column: 0, row: 0, width: 44, height: 18 },
    boxes,
    commands,
    theme: htmlCssViewTheme,
    contrastText: htmlCssViewContrast,
    fit: (text, width) => text.slice(0, width),
    paint: (text, style) => `${style.bg}:${style.fg}:${text}`,
    write: (target, row, column, value) => {
      target[row] ??= [];
      target[row]![column] = value;
    },
    fillRect: (_target, rect) => fills.push(rect),
  });

  assertEquals(fills.length > 0, true);
  assertEquals(commands.length > 0, true);
  assertEquals(boxes.length > 0, true);
  assertEquals(frame.some((row) => row.some((cell) => cell?.includes("parseTuiMarkup"))), true);
});

Deno.test("parseTuiMarkup builds a layout tree with stable ids classes and text", () => {
  const document = parseTuiMarkup(`
    <window id="main" class="shell unit">
      <button id="run" class="primary">Run</button>
      <input id="query" value="filter" />
    </window>
  `);

  assertEquals(document.root.tag, "window");
  assertEquals(document.root.id, "main");
  assertEquals(document.root.classes, ["shell", "unit"]);
  assertEquals(document.root.children.map((child) => child.id), ["run", "query"]);
  assertEquals(document.root.children[0]!.text, "Run");
  assertEquals(document.root.children[1]!.attributes.value, "filter");
  assertEquals(document.nodeCount, 3);
});

Deno.test("applyCssCascade resolves selectors variables pseudo states and inline styles", () => {
  const document = parseTuiMarkup(`
    <window id="main">
      <div id="toolbar" class="toolbar">
        <button id="run" class="primary" style="height: 3">Run</button>
      </div>
    </window>
  `);
  const stylesheet = parseCssStylesheet(`
    :root {
      --button-bg: #102030;
      color: #eeeeee;
    }

    window .primary {
      width: 12;
      background: var(--button-bg);
    }

    .toolbar > button:focus {
      color: yellow;
    }
  `);

  const styled = applyCssCascade(document.root, stylesheet, { states: { run: ["focus"] } });
  const run = findLayoutNode(styled, "run")!;
  const toolbar = findLayoutNode(styled, "toolbar")!;

  assertEquals(
    matchesCssSelector(".toolbar > button:focus", run, [styled, toolbar], {
      run: ["focus"],
    }),
    true,
  );
  assertEquals(run.style.width, { unit: "cell", value: 12 });
  assertEquals(run.style.height, { unit: "cell", value: 3 });
  assertEquals(run.style.backgroundColor, "#102030");
  assertEquals(run.style.color, "yellow");
});

Deno.test("selectorParts parses child and descendant combinators without spacing assumptions", () => {
  assertEquals(selectorParts("window .toolbar>button:focus"), [
    { simple: "window", combinator: undefined },
    { simple: ".toolbar", combinator: "descendant" },
    { simple: "button:focus", combinator: "child" },
  ]);
  assertEquals(selectorParts("window   panel >  button.primary"), [
    { simple: "window", combinator: undefined },
    { simple: "panel", combinator: "descendant" },
    { simple: "button.primary", combinator: "child" },
  ]);
});

Deno.test("applyCssCascade supports attribute selectors", () => {
  const document = parseTuiMarkup(`
    <window id="main">
      <button id="save" data-tone="primary">Save</button>
      <button id="disabled" disabled>Disabled</button>
      <button id="plain">Plain</button>
    </window>
  `);
  const stylesheet = parseCssStylesheet(`
    button {
      width: 8;
    }

    button[data-tone="primary"] {
      width: 14;
      background: #123456;
    }

    [disabled] {
      color: #777777;
    }
  `);

  const styled = applyCssCascade(document.root, stylesheet);
  const save = findLayoutNode(styled, "save")!;
  const disabled = findLayoutNode(styled, "disabled")!;
  const plain = findLayoutNode(styled, "plain")!;

  assertEquals(matchesCssSelector('button[data-tone="primary"]', save, [styled]), true);
  assertEquals(matchesCssSelector("[disabled]", disabled, [styled]), true);
  assertEquals(matchesCssSelector("[disabled]", plain, [styled]), false);
  assertEquals(save.style.width, { unit: "cell", value: 14 });
  assertEquals(save.style.backgroundColor, "#123456");
  assertEquals(disabled.style.color, "#777777");
  assertEquals(plain.style.width, { unit: "cell", value: 8 });
});

Deno.test("applyCssCascade supports bounded structural pseudo selectors", () => {
  const document = parseTuiMarkup(`
    <window id="main">
      <button id="one">One</button>
      <button id="two">Two</button>
      <button id="three">Three</button>
    </window>
  `);
  const stylesheet = parseCssStylesheet(`
    button:first-child {
      width: 8;
    }

    button:nth-child(even) {
      background: #112233;
    }

    button:nth-child(3) {
      color: #eeee00;
    }

    button:last-child {
      height: 2;
    }

    button:nth-child(2n+1) {
      border-width: 3;
    }
  `);

  const styled = applyCssCascade(document.root, stylesheet);
  const one = findLayoutNode(styled, "one")!;
  const two = findLayoutNode(styled, "two")!;
  const three = findLayoutNode(styled, "three")!;

  assertEquals(matchesCssSelector("button:first-child", one, [styled]), true);
  assertEquals(matchesCssSelector("button:last-child", three, [styled]), true);
  assertEquals(matchesCssSelector("button:nth-child(even)", two, [styled]), true);
  assertEquals(matchesCssSelector("button:nth-child(2n+1)", one, [styled]), false);
  assertEquals(one.style.width, { unit: "cell", value: 8 });
  assertEquals(two.style.backgroundColor, "#112233");
  assertEquals(three.style.color, "#eeee00");
  assertEquals(three.style.height, { unit: "cell", value: 2 });
  assertEquals(one.style.border, { top: 0, right: 0, bottom: 0, left: 0 });
});

Deno.test("applyCssCascade supports only-child pseudo selector", () => {
  const document = parseTuiMarkup(`
    <window id="main">
      <panel id="single"><button id="solo">Solo</button></panel>
      <panel id="pair"><button id="left">Left</button><button id="right">Right</button></panel>
    </window>
  `);
  const styled = applyCssCascade(
    document.root,
    parseCssStylesheet(`
      button:only-child {
        color: #00ff99;
      }
    `),
  );
  const single = findLayoutNode(styled, "single")!;
  const pair = findLayoutNode(styled, "pair")!;

  assertEquals(matchesCssSelector("button:only-child", findLayoutNode(styled, "solo")!, [styled, single]), true);
  assertEquals(matchesCssSelector("button:only-child", findLayoutNode(styled, "left")!, [styled, pair]), false);
  assertEquals(findLayoutNode(styled, "solo")!.style.color, "#00ff99");
  assertEquals(findLayoutNode(styled, "left")!.style.color, undefined);
});

Deno.test("applyCssCascade parses flex flow shorthand into direction and wrapping", () => {
  const document = parseTuiMarkup(`
    <window id="main">
      <panel id="a"></panel>
      <panel id="b"></panel>
    </window>
  `);
  const stylesheet = parseCssStylesheet(`
    window {
      display: flex;
      flex-flow: column wrap-reverse;
    }
  `);

  const styled = applyCssCascade(document.root, stylesheet);

  assertEquals(styled.style.flexDirection, "column");
  assertEquals(styled.style.flexWrap, "wrap-reverse");
});

Deno.test("applyCssCascade parses flex item order", () => {
  const document = parseTuiMarkup(`
    <window id="main">
      <panel id="late">Late</panel>
      <panel id="early">Early</panel>
    </window>
  `);
  const stylesheet = parseCssStylesheet(`
    #late { order: 2; }
    #early { order: -1; }
  `);

  const styled = applyCssCascade(document.root, stylesheet);

  assertEquals(findLayoutNode(styled, "late")!.style.order, 2);
  assertEquals(findLayoutNode(styled, "early")!.style.order, -1);
});

Deno.test("applyCssCascade parses grid templates placement and auto flow", () => {
  const document = parseTuiMarkup(`
    <window id="main">
      <panel id="wide"></panel>
    </window>
  `);
  const stylesheet = parseCssStylesheet(`
    window {
      display: grid;
      grid-template-columns: repeat(2, 1fr) 12;
      grid-template-rows: 3 1fr;
      grid-auto-flow: column dense;
      grid-auto-rows: 2;
    }

    #wide {
      grid-column: 2 / span 2;
      grid-row: 1 / span 2;
    }
  `);

  const styled = applyCssCascade(document.root, stylesheet);
  const wide = findLayoutNode(styled, "wide")!;

  assertEquals(styled.style.display, "grid");
  assertEquals(styled.style.gridTemplateColumns, [
    { unit: "fr", value: 1 },
    { unit: "fr", value: 1 },
    { unit: "cell", value: 12 },
  ]);
  assertEquals(styled.style.gridTemplateRows, [
    { unit: "cell", value: 3 },
    { unit: "fr", value: 1 },
  ]);
  assertEquals(styled.style.gridAutoFlow, "column");
  assertEquals(styled.style.gridAutoRows, { unit: "cell", value: 2 });
  assertEquals(wide.style.gridColumn, { start: 2, span: 2 });
  assertEquals(wide.style.gridRow, { start: 1, span: 2 });
});

Deno.test("applyCssCascade parses grid line longhands", () => {
  const document = parseTuiMarkup(`
    <window id="main">
      <panel id="span"></panel>
      <panel id="ended"></panel>
    </window>
  `);
  const stylesheet = parseCssStylesheet(`
    #span {
      grid-column-start: 2;
      grid-column-end: 4;
      grid-row-start: 1;
      grid-row-end: span 2;
    }

    #ended {
      grid-column-end: 5;
      grid-column-start: span 2;
    }
  `);

  const styled = applyCssCascade(document.root, stylesheet);
  const span = findLayoutNode(styled, "span")!;
  const ended = findLayoutNode(styled, "ended")!;

  assertEquals(span.style.gridColumn, { start: 2, end: 4, span: 2 });
  assertEquals(span.style.gridRow, { start: 1, span: 2 });
  assertEquals(ended.style.gridColumn, { end: 5, span: 2 });
});

Deno.test("applyCssCascade parses grid item self alignment", () => {
  const document = parseTuiMarkup(`<window id="main"><panel id="card"></panel></window>`);
  const stylesheet = parseCssStylesheet(`
    #card {
      place-self: end center;
    }
  `);

  const styled = applyCssCascade(document.root, stylesheet);
  const card = findLayoutNode(styled, "card")!;

  assertEquals(card.style.alignSelf, "end");
  assertEquals(card.style.justifySelf, "center");
});

Deno.test("applyCssCascade inherits visibility while allowing explicit visible descendants", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <panel id="hidden">
          <button id="inherited">Inherited</button>
          <button id="override">Override</button>
        </panel>
      </window>
    `,
    css: `
      #hidden {
        visibility: hidden;
      }

      #override {
        visibility: visible;
      }
    `,
    bounds: { column: 0, row: 0, width: 40, height: 8 },
  });

  const hidden = result.layout.byId.get("hidden")!;
  const inherited = result.layout.byId.get("inherited")!;
  const override = result.layout.byId.get("override")!;

  assertEquals(hidden.visible, false);
  assertEquals(inherited.visible, false);
  assertEquals(override.visible, true);
  assertEquals(hidden.hitRegions, []);
  assertEquals(inherited.hitRegions, []);
  assertEquals(override.hitRegions.length, 1);
});

Deno.test("applyCssCascade parses terminal text flow properties", () => {
  const document = parseTuiMarkup(`
    <window id="main">
      <panel id="nowrap">alpha beta</panel>
      <panel id="break">abcdefghij</panel>
    </window>
  `);
  const styled = applyCssCascade(
    document.root,
    parseCssStylesheet(`
    #nowrap {
      white-space: nowrap;
    }

    #break {
      overflow-wrap: anywhere;
    }
  `),
  );

  assertEquals(findLayoutNode(styled, "nowrap")!.style.whiteSpace, "nowrap");
  assertEquals(findLayoutNode(styled, "break")!.style.overflowWrap, "anywhere");
});

Deno.test("parseCssStylesheet keeps terminal-cell media query metadata", () => {
  const stylesheet = parseCssStylesheet(`
    panel {
      width: 20;
    }

    @media (max-width: 40) and (min-height: 8) {
      panel.card {
        width: 12;
      }
    }
  `);

  assertEquals(stylesheet.rules.length, 2);
  assertEquals(stylesheet.rules[1]!.media?.conditions, [
    { feature: "max-width", value: 40 },
    { feature: "min-height", value: 8 },
  ]);
  assertEquals(matchesCssMedia(stylesheet.rules[1]!.media, { width: 32, height: 10 }), true);
  assertEquals(matchesCssMedia(stylesheet.rules[1]!.media, { width: 48, height: 10 }), false);
  assertEquals(parseCssMediaQuery("(min-width: 80cells)")?.conditions, [{ feature: "min-width", value: 80 }]);
});

Deno.test("inspectTuiCssSupport reports the documented HTML/CSS subset", () => {
  const report = inspectTuiCssSupport();

  assert(report.properties.includes("grid-template-columns"));
  assert(report.properties.includes("grid-template-areas"));
  assert(report.properties.includes("flex-flow"));
  assert(report.properties.includes("order"));
  assert(report.properties.includes("white-space"));
  assert(report.properties.includes("overflow-wrap"));
  assert(report.selectors.includes(":first-child"));
  assert(report.selectors.includes(":nth-child(number|odd|even)"));
  assert(report.mediaFeatures.includes("max-width"));
  assert(report.pseudoStates.includes("focus"));
  assert(report.hydratedWidgetTags.includes("radio-group"));
  assert(report.hydratedWidgetTags.includes("tree"));
  assert(report.markupTags.includes("three-ascii"));
  assert(report.unsupported.includes("Yoga solver CSS Grid support"));
  assertEquals(report.solverCapabilities.normalizedStyleFields, [...NORMALIZED_LAYOUT_STYLE_FIELDS]);
  assertEquals(report.solverCapabilities.solvers.map((solver) => [solver.solverId, solver.availability]), [
    ["simple", "built-in"],
    ["yoga", "optional"],
    ["taffy", "planned"],
  ]);
});

Deno.test("layout solver capability report exhaustively classifies normalized fields and invariants", () => {
  const report = inspectLayoutSolverCapabilities();
  const expectedFields = [
    ...Object.keys(defaultComputedLayoutStyle()),
    "gridArea",
    "gridTemplateColumnsAutoRepeat",
    "gridTemplateRowsAutoRepeat",
    "gridTemplateColumnsLineNames",
    "gridTemplateRowsLineNames",
    "dock",
    "layers",
    "layer",
    "alignHorizontal",
    "alignVertical",
    "scrollbarColor",
    "scrollbarBackgroundColor",
    "scrollbarSize",
    "borderTitle",
    "borderSubtitle",
    "borderTitleAlign",
    "borderSubtitleAlign",
    "tint",
    "hatch",
    "color",
    "backgroundColor",
    "borderColor",
    "borderStyle",
  ].sort();

  assertEquals([...report.normalizedStyleFields].sort(), expectedFields);
  assertEquals(report.normalizedStyleFields.length, 69);
  assertEquals(report.invariantIds, [
    "cell-rounding",
    "overflow-inspection",
    "intrinsic-measurement",
    "hidden-nodes",
    "absolute-children",
    "min-max-constraints",
  ]);
  for (const solver of report.solvers) {
    assertEquals(Object.keys(solver.style).sort(), expectedFields, solver.solverId);
    assertEquals(Object.keys(solver.invariants).sort(), [...report.invariantIds].sort(), solver.solverId);
  }

  const simple = report.solvers.find((solver) => solver.solverId === "simple")!;
  const yoga = report.solvers.find((solver) => solver.solverId === "yoga")!;
  const taffy = report.solvers.find((solver) => solver.solverId === "taffy")!;
  assertEquals(simple.style.gridTemplateAreas, "supported");
  assertEquals(yoga.style.gridTemplateAreas, "unsupported");
  assertEquals(yoga.style.alignSelf, "unsupported");
  assertEquals(yoga.invariants["intrinsic-measurement"].support, "partial");
  assertEquals(taffy.style.display, "unsupported");
  assert(Object.isFrozen(SIMPLE_LAYOUT_SOLVER_CAPABILITIES));
  assert(Object.isFrozen(SIMPLE_LAYOUT_SOLVER_CAPABILITIES.style));
  const mutatedReport = inspectLayoutSolverCapabilities();
  (mutatedReport.solvers[0]!.style as Record<string, string>).display = "unsupported";
  assertEquals(inspectLayoutSolverCapabilities().solvers[0]!.style.display, "supported");
});

Deno.test("createMarkupLayout reports unknown declarations and selected-solver fallbacks", () => {
  const result = createMarkupLayout({
    markup: `<window id="main"><panel id="item">Item</panel></window>`,
    css: `
      #main {
        display: grid;
        grid-template-columns: 1fr 1fr;
        mystery-layout: enabled;
      }
    `,
    bounds: { column: 0, row: 0, width: 20, height: 6 },
    solver: yogaLayoutSolver(),
    widgets: false,
  });

  assertEquals(result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.property, diagnostic.nodeId]), [
    ["solver-fallback", "display", "main"],
    ["unsupported-by-solver", "grid-template-columns", "main"],
    ["unsupported-declaration", "mystery-layout", "main"],
  ]);
});

Deno.test("layout diagnostics validate values and only report winning solver declarations", () => {
  const invalid = createMarkupLayout({
    markup: `<window id="main">Main</window>`,
    css: `
      #main {
        display: inline;
        flex-direction: sideways;
        justify-content: stretch;
        grid-auto-flow: dense;
        grid-template-areas: "a a" "a b";
        width: 10px;
        margin: auto;
        border: 1 2;
      }
    `,
    bounds: { column: 0, row: 0, width: 20, height: 5 },
    widgets: false,
  });
  assertEquals(
    invalid.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.property]),
    [
      ["unsupported-declaration", "display"],
      ["unsupported-declaration", "flex-direction"],
      ["unsupported-declaration", "justify-content"],
      ["unsupported-declaration", "grid-auto-flow"],
      ["unsupported-declaration", "grid-template-areas"],
      ["unsupported-declaration", "width"],
      ["unsupported-declaration", "border"],
      ["unsupported-by-solver", undefined],
    ],
  );

  const winning = createMarkupLayout({
    markup: `<window id="main" class="shell" style="display: flex">Main</window>`,
    css: `.shell { display: grid; } #main { display: grid; }`,
    bounds: { column: 0, row: 0, width: 20, height: 5 },
    solver: yogaLayoutSolver(),
    widgets: false,
  });
  assertEquals(winning.styledRoot.style.display, "flex");
  assertEquals(winning.diagnostics, []);

  const provenance = createMarkupLayout({
    markup: `<window id="main" class="shell">Main</window>`,
    css: `.shell { display: grid; } #main { display: grid; }`,
    bounds: { column: 0, row: 0, width: 20, height: 5 },
    solver: yogaLayoutSolver(),
    widgets: false,
  });
  assertEquals(provenance.diagnostics.map(({ code, selector, source }) => ({ code, selector, source })), [{
    code: "solver-fallback",
    selector: "#main",
    source: "stylesheet",
  }]);

  const invalidOverride = createMarkupLayout({
    markup: `<window id="main" class="shell">Main</window>`,
    css: `.shell { display: grid; } #main { display: inline; }`,
    bounds: { column: 0, row: 0, width: 20, height: 5 },
    solver: yogaLayoutSolver(),
    widgets: false,
  });
  assertEquals(invalidOverride.styledRoot.style.display, "grid");
  assertEquals(invalidOverride.diagnostics.map((diagnostic) => diagnostic.code), [
    "solver-fallback",
    "unsupported-declaration",
  ]);
});

Deno.test("layout diagnostics expose contextual Simple solver limitations", () => {
  const flex = createMarkupLayout({
    markup: `<window id="main"><panel id="child">Child</panel></window>`,
    css: `
      #main { display: flex; margin: 1; gap: 2; row-gap: 0; }
      #child { flex: none; align-self: end; justify-self: end; }
    `,
    bounds: { column: 0, row: 0, width: 20, height: 5 },
    widgets: false,
  });
  const flexFields = flex.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.nodeId, diagnostic.field]);
  assert(
    flexFields.some(([code, nodeId, field]) =>
      code === "partial-solver-support" && nodeId === "child" && field === "flexShrink"
    ),
  );
  assert(
    flexFields.some(([code, nodeId, field]) =>
      code === "unsupported-by-solver" && nodeId === "main" && field === "margin"
    ),
  );
  assert(
    flexFields.some(([code, nodeId, field]) =>
      code === "unsupported-by-solver" && nodeId === "child" && field === "alignSelf"
    ),
  );
  assert(
    flexFields.some(([code, nodeId, field]) =>
      code === "unsupported-by-solver" && nodeId === "child" && field === "justifySelf"
    ),
  );

  const grid = createMarkupLayout({
    markup: `<window id="main"><panel id="child">Child</panel></window>`,
    css: `#main { display: grid; grid-template-columns: 1fr; align-items: center; justify-content: center; }`,
    bounds: { column: 0, row: 0, width: 20, height: 5 },
    widgets: false,
  });
  assertEquals(
    grid.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.field]),
    [
      ["unsupported-by-solver", "alignItems"],
      ["unsupported-by-solver", "justifyContent"],
    ],
  );
});

Deno.test("layout diagnostics preserve shorthand provenance and distinct same-field issues", () => {
  const yoga = createMarkupLayout({
    markup: `<window id="main"><panel id="child">Child</panel></window>`,
    css: `#main { display: flex; } #child { flex: 1 1 2fr; place-self: center; }`,
    bounds: { column: 0, row: 0, width: 20, height: 5 },
    solver: yogaLayoutSolver(),
    widgets: false,
  });
  assertEquals(
    yoga.diagnostics.map(({ code, nodeId, property, field, selector, source }) => ({
      code,
      nodeId,
      property,
      field,
      selector,
      source,
    })),
    [
      {
        code: "unsupported-by-solver",
        nodeId: "child",
        property: "flex",
        field: "flexBasis",
        selector: "#child",
        source: "stylesheet",
      },
      {
        code: "unsupported-by-solver",
        nodeId: "child",
        property: "place-self",
        field: "alignSelf",
        selector: "#child",
        source: "stylesheet",
      },
      {
        code: "unsupported-by-solver",
        nodeId: "child",
        property: "place-self",
        field: "justifySelf",
        selector: "#child",
        source: "stylesheet",
      },
    ],
  );

  const simple = createMarkupLayout({
    markup: `<window id="main">Main</window>`,
    css: `#main { position: relative; top: 1fr; }`,
    bounds: { column: 0, row: 0, width: 20, height: 5 },
    widgets: false,
  });
  assertEquals(simple.diagnostics.map(({ code, property, field }) => ({ code, property, field })), [
    { code: "unsupported-by-solver", property: "top", field: "inset" },
  ]);
  assert(simple.diagnostics[0]!.message.includes("fr unit"));
});

Deno.test("markup layout worker preserves serializable layout diagnostics", () => {
  const handler = createMarkupLayoutWorkerHandler({ cache: false });
  const result = handler({
    markup: `<window id="main">Main</window>`,
    css: `#main { unsupported-layout-property: 1; }`,
    bounds: { column: 0, row: 0, width: 12, height: 3 },
  });

  assertEquals(result.diagnostics, [{
    code: "unsupported-declaration",
    severity: "warning",
    message: 'Layout declaration "unsupported-layout-property" is not recognized and was ignored.',
    solverId: "simple",
    nodeId: "main",
    selector: "#main",
    source: "stylesheet",
    property: "unsupported-layout-property",
    value: "1",
    field: undefined,
  }]);
});

Deno.test("layout engine diagnoses unknown custom capabilities without changing unsupported-root errors", () => {
  const root = createLayoutNode({ id: "root", tag: "window" });
  const baseSolver = simpleLayoutSolver();
  const diagnostics: string[] = [];
  const customSolver: LayoutSolver = {
    id: "custom",
    supports: () => true,
    solve: (input) => baseSolver.solve(input),
  };
  const result = createLayoutEngine({
    solver: customSolver,
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
  }).layout({ root, bounds: { column: 0, row: 0, width: 10, height: 3 } });

  assertEquals(result.root.rect, { column: 0, row: 0, width: 10, height: 3 });
  assertEquals(diagnostics, ["solver-capabilities-unavailable"]);

  const rejectingSolver: LayoutSolver = {
    id: "rejecting",
    supports: () => false,
    solve: (input) => baseSolver.solve(input),
  };
  assertThrows(
    () =>
      createLayoutEngine({ solver: rejectingSolver }).layout({
        root,
        bounds: { column: 0, row: 0, width: 10, height: 3 },
      }),
    LayoutSolverUnsupportedError,
    'Layout solver "rejecting" does not support root tag "window".',
  );
});

Deno.test("layout engine diagnoses Yoga's programmatic Block approximation", () => {
  const child = createLayoutNode({ id: "child", tag: "panel" });
  const root = createLayoutNode({ id: "root", tag: "window", children: [child] });
  const diagnostics: Array<[string, string | undefined, string | undefined]> = [];
  createLayoutEngine({
    solver: yogaLayoutSolver(),
    onDiagnostic: (diagnostic) => diagnostics.push([diagnostic.code, diagnostic.nodeId, diagnostic.field]),
  }).layout({ root, bounds: { column: 0, row: 0, width: 10, height: 3 } });
  assertEquals(diagnostics, [["solver-fallback", "root", "display"]]);
});

Deno.test("createMarkupLayout applies media rules from layout bounds", () => {
  const markup = `<window id="main"><panel id="card" class="card">Card</panel></window>`;
  const css = `
    window {
      width: 100%;
      height: 100%;
    }

    .card {
      width: 20;
      height: 2;
    }

    @media (max-width: 40) {
      .card {
        width: 12;
      }
    }
  `;

  const wide = createMarkupLayout({ markup, css, bounds: { column: 0, row: 0, width: 80, height: 12 } });
  const narrow = createMarkupLayout({ markup, css, bounds: { column: 0, row: 0, width: 32, height: 12 } });

  assertEquals(wide.layout.byId.get("card")!.rect.width, 20);
  assertEquals(narrow.layout.byId.get("card")!.rect.width, 12);
});

Deno.test("MarkupLayoutCache reuses parsed markup and stylesheets with cloned results", () => {
  const cache = new MarkupLayoutCache({ maxEntries: 2 });
  const options = {
    markup: `<window id="main"><panel id="card">Card</panel></window>`,
    css: `#card { width: 10; height: 2; }`,
    bounds: { column: 0, row: 0, width: 40, height: 8 },
    cache,
  };

  const first = createMarkupLayout(options);
  first.document.root.children[0]!.id = "mutated";
  first.styledRoot.children[0]!.style.width = { unit: "cell", value: 99 };

  const second = createMarkupLayout(options);

  assertEquals(cache.inspect(), { documents: 1, stylesheets: 1, maxEntries: 2 });
  assertEquals(second.document.root.children[0]!.id, "card");
  assertEquals(second.layout.byId.get("card")!.rect.width, 10);
});

Deno.test("MarkupLayoutCache can be disabled per layout call", () => {
  const cache = new MarkupLayoutCache();
  createMarkupLayout({
    markup: `<window id="main"></window>`,
    css: `window { width: 10; }`,
    bounds: { column: 0, row: 0, width: 20, height: 4 },
    cache: false,
  });

  assertEquals(cache.inspect(), { documents: 0, stylesheets: 0, maxEntries: 32 });
});

Deno.test("createMarkupLayoutWorkerHandler solves markup layout without hydrating controllers", () => {
  const handler = createMarkupLayoutWorkerHandler();
  const markup = `<window id="main"><panel id="left">A</panel><panel id="right">B</panel></window>`;
  const css = `window { display: flex; flex-direction: row; } panel { width: 10; height: 4; }`;
  const first = handler({
    markup,
    css,
    bounds: { column: 0, row: 0, width: 30, height: 6 },
  });
  const second = handler({
    markup,
    css,
    bounds: { column: 0, row: 0, width: 30, height: 6 },
  });

  assertEquals(first.layout.byId.get("right")?.rect.column, 10);
  assertEquals(first.layout.boxes.length, 3);
  assertEquals(first.cache, { documents: 1, stylesheets: 1, maxEntries: 32 });
  assertEquals(second.cache, { documents: 1, stylesheets: 1, maxEntries: 32 });
});

Deno.test("runMarkupLayoutInWorker solves markup layout through WorkerPool", async () => {
  const workerUrl = new URL("./fixtures/markup_layout_worker.ts", import.meta.url);
  const permission = await Deno.permissions.query({ name: "read", path: workerUrl });
  if (permission.state !== "granted") return;
  const pool = new WorkerPool<MarkupLayoutWorkerPayload, MarkupLayoutWorkerResult>({
    workerUrl,
    size: 1,
  });
  let declarationCallbacks = 0;
  const widenedCascade: ApplyCssCascadeOptions = {
    variables: { "--worker-width": "18" },
    onDeclaration: () => declarationCallbacks += 1,
  };
  try {
    const result = await runMarkupLayoutInWorker(pool, {
      markup: `<window id="main"><panel id="hero">Hero</panel></window>`,
      css: `#hero { width: var(--worker-width); height: 3; unsupported-worker-layout: 1; }`,
      bounds: { column: 2, row: 1, width: 40, height: 10 },
      cascade: widenedCascade,
    });

    assertEquals(result.document.nodeCount, 2);
    assertEquals(result.layout.byId.get("hero")?.rect, { column: 2, row: 1, width: 18, height: 3 });
    assertEquals(declarationCallbacks, 0);
    assertEquals(result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.property]), [
      ["unsupported-declaration", "unsupported-worker-layout"],
    ]);
  } finally {
    pool.terminate();
  }
});

Deno.test("createMarkupLayout computes CSS grid tracks and item placement", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <panel id="a">A</panel>
        <panel id="b">B</panel>
        <panel id="c">C</panel>
      </window>
    `,
    css: `
      window {
        display: grid;
        grid-template-columns: 10 1fr 5;
        grid-template-rows: 2 1fr;
        gap: 1;
        width: 100%;
        height: 100%;
      }

      #a {
        grid-column: 2;
        grid-row: 1 / span 2;
      }

      #b {
        grid-column: 1;
        grid-row: 2;
      }
    `,
    bounds: { column: 0, row: 0, width: 30, height: 8 },
  });

  assertEquals(result.layout.byId.get("a")!.rect, { column: 11, row: 0, width: 13, height: 8 });
  assertEquals(result.layout.byId.get("b")!.rect, { column: 0, row: 3, width: 10, height: 5 });
  assertEquals(result.layout.byId.get("c")!.rect, { column: 0, row: 0, width: 10, height: 2 });
});

Deno.test("createMarkupLayout honors explicit grid cells before auto-flow", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <panel id="auto-a">A</panel>
        <panel id="explicit">Explicit</panel>
        <panel id="row-fixed">Row fixed</panel>
        <panel id="auto-b">B</panel>
      </window>
    `,
    css: `
      window {
        display: grid;
        grid-template-columns: repeat(3, 4);
        grid-template-rows: repeat(2, 2);
        gap: 1;
        width: 14;
        height: 5;
      }

      #explicit {
        grid-column: 2;
        grid-row: 1;
      }

      #row-fixed {
        grid-row: 2;
      }
    `,
    bounds: { column: 0, row: 0, width: 14, height: 5 },
    widgets: false,
  });

  assertEquals(result.layout.byId.get("auto-a")!.rect, { column: 0, row: 0, width: 4, height: 2 });
  assertEquals(result.layout.byId.get("explicit")!.rect, { column: 5, row: 0, width: 4, height: 2 });
  assertEquals(result.layout.byId.get("row-fixed")!.rect, { column: 0, row: 3, width: 4, height: 2 });
  assertEquals(result.layout.byId.get("auto-b")!.rect, { column: 10, row: 0, width: 4, height: 2 });
});

Deno.test("createMarkupLayout resolves grid tracks spans alignment and hit regions", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <panel id="centered">Centered</panel>
      </window>
    `,
    css: `
      window {
        display: grid;
        grid-template-columns: 4 25% 1fr 1fr;
        grid-template-rows: 1fr;
        grid-auto-columns: 1fr;
        gap: 1;
        width: 100%;
        height: 100%;
      }

      #centered {
        grid-column: 2 / span 3;
        width: 4;
        height: 2;
        justify-self: center;
        align-self: end;
        z-index: 7;
      }
    `,
    bounds: { column: 2, row: 5, width: 24, height: 5 },
    widgets: false,
  });

  const centered = result.layout.byId.get("centered")!;
  assertEquals(centered.rect, { column: 14, row: 8, width: 4, height: 2 });
  assertEquals(centered.hitRegions, [{
    id: "centered",
    bounds: { column: 14, row: 8, width: 4, height: 2 },
    zIndex: 7,
    payload: { nodeId: "centered", tag: "panel" },
  }]);
});

Deno.test("createMarkupLayout supports grid numeric end lines and longhands", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <panel id="wide">Wide</panel>
        <panel id="from-end">From end</panel>
      </window>
    `,
    css: `
      window {
        display: grid;
        grid-template-columns: repeat(4, 5);
        grid-template-rows: 2 2;
        gap: 1;
        width: 23;
        height: 5;
      }

      #wide {
        grid-column: 2 / 4;
        grid-row: 1;
      }

      #from-end {
        grid-column-end: 5;
        grid-column-start: span 2;
        grid-row-start: 2;
      }
    `,
    bounds: { column: 0, row: 0, width: 40, height: 8 },
  });

  assertEquals(result.layout.byId.get("wide")!.rect, { column: 6, row: 0, width: 11, height: 2 });
  assertEquals(result.layout.byId.get("from-end")!.rect, { column: 12, row: 3, width: 11, height: 2 });
});

Deno.test("createMarkupLayout supports CSS grid template areas in the simple solver", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <panel id="title">Title</panel>
        <panel id="nav">Nav</panel>
        <panel id="content">Content</panel>
        <panel id="footer">Footer</panel>
      </window>
    `,
    css: `
      window {
        display: grid;
        grid-template-columns: 6 1fr;
        grid-template-rows: 2 1fr 1;
        grid-template-areas:
          "title title"
          "nav content"
          "footer footer";
        gap: 1;
        width: 24;
        height: 10;
      }

      #title { grid-area: title; }
      #nav { grid-area: nav; }
      #content { grid-area: content; }
      #footer { grid-area: footer; }
    `,
    bounds: { column: 0, row: 0, width: 40, height: 12 },
  });

  assertEquals(result.layout.byId.get("title")!.rect, { column: 0, row: 0, width: 24, height: 2 });
  assertEquals(result.layout.byId.get("nav")!.rect, { column: 0, row: 3, width: 6, height: 5 });
  assertEquals(result.layout.byId.get("content")!.rect, { column: 7, row: 3, width: 17, height: 5 });
  assertEquals(result.layout.byId.get("footer")!.rect, { column: 0, row: 9, width: 24, height: 1 });
});

Deno.test("createMarkupLayout aligns explicit grid item sizes with place-self", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <panel id="centered">Centered</panel>
        <panel id="ended">Ended</panel>
      </window>
    `,
    css: `
      window {
        display: grid;
        grid-template-columns: 10 10;
        grid-template-rows: 6;
        gap: 1;
        width: 21;
        height: 6;
      }

      #centered {
        width: 4;
        height: 2;
        place-self: center center;
      }

      #ended {
        width: 3;
        height: 2;
        justify-self: end;
        align-self: end;
      }
    `,
    bounds: { column: 0, row: 0, width: 30, height: 8 },
  });

  assertEquals(result.layout.byId.get("centered")!.rect, { column: 3, row: 2, width: 4, height: 2 });
  assertEquals(result.layout.byId.get("ended")!.rect, { column: 18, row: 4, width: 3, height: 2 });
});

Deno.test("applyCssCascade parses absolute positioning inset declarations", () => {
  const document = parseTuiMarkup(`<panel id="badge"></panel>`);
  const stylesheet = parseCssStylesheet(`
    panel {
      position: absolute;
      inset: 1 2 auto auto;
      left: 4;
    }
  `);

  const styled = applyCssCascade(document.root, stylesheet);

  assertEquals(styled.style.position, "absolute");
  assertEquals(styled.style.inset.top, { unit: "cell", value: 1 });
  assertEquals(styled.style.inset.right, { unit: "cell", value: 2 });
  assertEquals(styled.style.inset.bottom, { unit: "auto", value: 0 });
  assertEquals(styled.style.inset.left, { unit: "cell", value: 4 });
});

Deno.test("createMarkupLayout computes flex boxes from HTML and CSS subset", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <div id="toolbar"><button id="run">Run</button></div>
        <scroll-area id="body">Process table and charts</scroll-area>
      </window>
    `,
    css: `
      window {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
      }

      #toolbar {
        height: 3;
        padding: 0 1;
      }

      #body {
        flex: 1;
        min-height: 2;
        overflow: auto;
      }
    `,
    bounds: { column: 0, row: 0, width: 80, height: 24 },
  });

  const main = result.layout.byId.get("main")!;
  const toolbar = result.layout.byId.get("toolbar")!;
  const body = result.layout.byId.get("body")!;

  assertEquals(main.rect, { column: 0, row: 0, width: 80, height: 24 });
  assertEquals(toolbar.rect, { column: 0, row: 0, width: 80, height: 3 });
  assertEquals(toolbar.contentRect, { column: 1, row: 0, width: 78, height: 3 });
  assertEquals(body.rect, { column: 0, row: 3, width: 80, height: 21 });
  assertEquals(body.overflowY, "auto");
  assertEquals(body.overflow.rows.overflow, "auto");
  assertEquals(body.overflow.rows.canScroll, false);
  assertEquals(body.hitRegions[0]!.payload, { nodeId: "body", tag: "scroll-area" });
});

Deno.test("layout boxes expose shared overflow inspection for scrollable content", () => {
  const result = createMarkupLayout({
    markup: `
      <panel id="body">
        <div id="wide"></div>
      </panel>
    `,
    css: `
      #body {
        width: 10;
        height: 4;
        overflow: auto;
      }

      #wide {
        position: absolute;
        width: 30;
        height: 8;
      }
    `,
    bounds: { column: 0, row: 0, width: 40, height: 12 },
  });

  const body = result.layout.byId.get("body")!;
  assertEquals(body.overflow.columns.contentLength, 30);
  assertEquals(body.overflow.columns.viewportLength, 10);
  assertEquals(body.overflow.columns.maxOffset, 20);
  assertEquals(body.overflow.columns.scrollbarVisible, true);
  assertEquals(body.overflow.rows.contentLength, 8);
  assertEquals(body.overflow.rows.viewportLength, 4);
  assertEquals(body.overflow.rows.maxOffset, 4);
  assertEquals(body.overflow.rows.scrollbarVisible, true);
});

Deno.test("createMarkupLayout wraps flex rows in the simple solver", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <panel id="a">A</panel>
        <panel id="b">B</panel>
        <panel id="c">C</panel>
      </window>
    `,
    css: `
      window {
        display: flex;
        flex-flow: row wrap;
        align-items: start;
        width: 100%;
        height: 100%;
        gap: 1;
      }

      panel {
        width: 4;
        height: 1;
      }
    `,
    bounds: { column: 0, row: 0, width: 10, height: 6 },
  });

  assertEquals(result.layout.byId.get("a")!.rect, { column: 0, row: 0, width: 4, height: 1 });
  assertEquals(result.layout.byId.get("b")!.rect, { column: 5, row: 0, width: 4, height: 1 });
  assertEquals(result.layout.byId.get("c")!.rect, { column: 0, row: 2, width: 4, height: 1 });
});

Deno.test("createMarkupLayout reuses intrinsic measurements in the simple solver", () => {
  const cache = new LayoutMeasurementCache();
  const solver = simpleLayoutSolver({ intrinsicMeasurementCache: cache });
  const options = {
    markup: `
      <window id="main">
        <panel id="a">A longer text value that wraps in narrow panes</panel>
        <panel id="b">A longer text value that wraps in narrow panes</panel>
      </window>
    `,
    css: `
      window {
        display: flex;
        flex-flow: row wrap;
        width: 100%;
        height: 100%;
      }

      panel {
        width: auto;
        height: auto;
      }
    `,
    bounds: { column: 0, row: 0, width: 24, height: 8 },
    solver,
  };

  const first = createMarkupLayout(options);
  const afterFirst = cache.stats();
  const second = createMarkupLayout(options);
  const afterSecond = cache.stats();

  assert(afterFirst.entries > 0);
  assert(afterSecond.hits > afterFirst.hits);
  assertEquals(second.layout.byId.get("a")!.rect, first.layout.byId.get("a")!.rect);
  assertEquals(second.layout.byId.get("b")!.rect, first.layout.byId.get("b")!.rect);
});

Deno.test("measureTerminalTextIntrinsic wraps text on terminal word boundaries", () => {
  assertEquals(measureTerminalTextIntrinsic("aa bbbb cc", 6), { width: 10, height: 3 });
  assertEquals(measureTerminalTextIntrinsic("wide\ntext", 6), { width: 4, height: 2 });
  assertEquals(measureTerminalTextIntrinsic("abcdefghij", 5), { width: 10, height: 2 });
  assertEquals(measureTerminalTextIntrinsic("abc ", 3), { width: 4, height: 1 });
  assertEquals(measureTerminalTextIntrinsic("alpha beta", 5, 1, { wrap: false }), { width: 10, height: 1 });
  assertEquals(measureTerminalTextIntrinsic("abcdefghij", 5, 1, { breakWords: false }), { width: 10, height: 1 });
  assertEquals(measureTerminalTextIntrinsic("aa\tbb cc", 5), { width: 8, height: 2 });
});

Deno.test("simple layout solver measures auto height after resolving explicit text width", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="root">
        <panel id="card">aa bbbb cc</panel>
      </window>
    `,
    css: `
      #card {
        width: 6;
        height: auto;
      }
    `,
    bounds: { column: 0, row: 0, width: 20, height: 12 },
  });

  assertEquals(result.layout.byId.get("card")!.rect, { column: 0, row: 0, width: 6, height: 3 });
});

Deno.test("createMarkupLayout applies CSS text wrapping properties to intrinsic height", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="root">
        <panel id="normal">abcdefghij</panel>
        <panel id="break">abcdefghij</panel>
        <panel id="nowrap">aa bbbb cc</panel>
      </window>
    `,
    css: `
      panel {
        width: 5;
        height: auto;
      }

      #break {
        overflow-wrap: anywhere;
      }

      #nowrap {
        white-space: nowrap;
      }
    `,
    bounds: { column: 0, row: 0, width: 20, height: 12 },
  });

  assertEquals(result.layout.byId.get("normal")!.rect.height, 1);
  assertEquals(result.layout.byId.get("break")!.rect.height, 2);
  assertEquals(result.layout.byId.get("nowrap")!.rect.height, 1);
});

Deno.test("simple layout solver merges partial intrinsic dimensions with measured fallback", () => {
  const rootStyle = defaultComputedLayoutStyle();
  rootStyle.display = "flex";
  rootStyle.flexDirection = "row";
  rootStyle.alignItems = "start";

  const heightOnly = createLayoutNode({
    id: "height-only",
    tag: "panel",
    text: "wide text",
    intrinsic: { height: 3 },
  });
  const widthOnly = createLayoutNode({
    id: "width-only",
    tag: "panel",
    text: "one two three four five six",
    intrinsic: { width: 9 },
  });
  const root = createLayoutNode({
    id: "root",
    tag: "window",
    style: rootStyle,
    children: [heightOnly, widthOnly],
  });

  const result = layoutTree(root, { column: 0, row: 0, width: 40, height: 10 });

  assertEquals(result.byId.get("height-only")!.rect.width, 9);
  assertEquals(result.byId.get("height-only")!.rect.height, 3);
  assertEquals(result.byId.get("width-only")!.rect.width, 9);
  assertEquals(result.byId.get("width-only")!.rect.height > 1, true);
});

Deno.test("simple layout solver intrinsic block sizing ignores non-flow children and applies gap", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="root">
        <panel id="card">
          <panel id="a">A</panel>
          <panel id="gone">Hidden</panel>
          <panel id="float">Float</panel>
          <panel id="b">B</panel>
        </panel>
      </window>
    `,
    css: `
      #card { height: auto; gap: 2; }
      #a { height: 2; }
      #b { height: 3; }
      #gone { display: none; height: 20; }
      #float { position: absolute; height: 12; }
    `,
    bounds: { column: 0, row: 0, width: 30, height: 20 },
  });

  assertEquals(result.layout.byId.get("card")!.rect.height, 7);
});

Deno.test("simple layout solver intrinsic flex row basis uses gap fallback and ignores non-flow children", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="root">
        <panel id="cluster">
          <panel id="a">A</panel>
          <panel id="gone">Hidden</panel>
          <panel id="float">Float</panel>
          <panel id="b">B</panel>
        </panel>
      </window>
    `,
    css: `
      #root { display: flex; flex-direction: row; align-items: start; }
      #cluster { display: flex; flex-direction: row; width: auto; gap: 3; }
      #a { width: 4; height: 1; }
      #b { width: 5; height: 1; }
      #gone { display: none; width: 40; }
      #float { position: absolute; width: 30; }
    `,
    bounds: { column: 0, row: 0, width: 40, height: 8 },
  });

  assertEquals(result.layout.byId.get("cluster")!.rect.width, 12);
});

Deno.test("simple layout solver intrinsic cache keys include flow-affecting style", () => {
  const cache = new LayoutMeasurementCache();
  const solver = simpleLayoutSolver({ intrinsicMeasurementCache: cache });
  const rootStyle = defaultComputedLayoutStyle();
  const cardStyle = defaultComputedLayoutStyle();
  const childStyle = defaultComputedLayoutStyle();
  childStyle.height = { unit: "cell", value: 1 };

  const hiddenStyle = defaultComputedLayoutStyle();
  hiddenStyle.height = { unit: "cell", value: 9 };
  hiddenStyle.display = "none";

  const card = createLayoutNode({
    id: "card",
    tag: "panel",
    style: cardStyle,
    children: [
      createLayoutNode({ id: "a", tag: "panel", text: "A", style: childStyle }),
      createLayoutNode({ id: "hidden", tag: "panel", text: "Hidden", style: hiddenStyle }),
      createLayoutNode({ id: "b", tag: "panel", text: "B", style: childStyle }),
    ],
  });
  const root = createLayoutNode({ id: "root", tag: "window", style: rootStyle, children: [card] });

  const first = solver.solve({ root, bounds: { column: 0, row: 0, width: 30, height: 20 } });
  const afterFirst = cache.stats();
  card.style.gap = 3;
  card.children[1]!.style.display = "block";
  const second = solver.solve({ root, bounds: { column: 0, row: 0, width: 30, height: 20 } });
  const afterSecond = cache.stats();

  assert(afterSecond.misses > afterFirst.misses);
  assertEquals(first.byId.get("card")!.rect.height, 2);
  assertEquals(second.byId.get("card")!.rect.height, 17);
});

Deno.test("createMarkupLayout applies simple solver justify-content to flex rows", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <panel id="a">A</panel>
        <panel id="b">B</panel>
      </window>
    `,
    css: `
      window {
        display: flex;
        justify-content: center;
        align-items: start;
        width: 100%;
        height: 100%;
      }

      panel {
        width: 2;
        height: 1;
      }
    `,
    bounds: { column: 0, row: 0, width: 12, height: 3 },
  });

  assertEquals(result.layout.byId.get("a")!.rect, { column: 4, row: 0, width: 2, height: 1 });
  assertEquals(result.layout.byId.get("b")!.rect, { column: 6, row: 0, width: 2, height: 1 });
});

Deno.test("createMarkupLayout applies flex item order in the simple solver", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <panel id="late">Late</panel>
        <panel id="middle">Middle</panel>
        <panel id="early">Early</panel>
      </window>
    `,
    css: `
      window {
        display: flex;
        flex-direction: row;
        width: 100%;
        height: 100%;
      }

      panel {
        width: 3;
        height: 1;
        flex-shrink: 0;
      }

      #late { order: 2; }
      #early { order: -1; }
    `,
    bounds: { column: 0, row: 0, width: 12, height: 3 },
  });

  assertEquals(result.layout.root.children.map((box) => box.id), ["early", "middle", "late"]);
  assertEquals(result.layout.byId.get("early")!.rect.column, 0);
  assertEquals(result.layout.byId.get("middle")!.rect.column, 3);
  assertEquals(result.layout.byId.get("late")!.rect.column, 6);
});

Deno.test("createMarkupLayout positions absolute children without affecting simple solver flow", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <panel id="flow">Flow</panel>
        <panel id="badge">Badge</panel>
      </window>
    `,
    css: `
      window {
        width: 100%;
        height: 100%;
      }

      #flow {
        height: 3;
      }

      #badge {
        position: absolute;
        top: 1;
        right: 2;
        width: 6;
        height: 2;
      }
    `,
    bounds: { column: 0, row: 0, width: 20, height: 10 },
  });

  assertEquals(result.layout.byId.get("flow")!.rect, { column: 0, row: 0, width: 20, height: 3 });
  assertEquals(result.layout.byId.get("badge")!.rect, { column: 12, row: 1, width: 6, height: 2 });
});

Deno.test("createHtmlCssLayoutDemo drives wrapped flex and absolute portfolio boxes", () => {
  const result = createHtmlCssLayoutDemo({ column: 0, row: 0, width: 44, height: 18 });

  const stage = result.layout.byId.get("layout-stage")!;
  const cpu = result.layout.byId.get("metric-cpu")!;
  const gpu = result.layout.byId.get("metric-gpu")!;
  const net = result.layout.byId.get("metric-net")!;
  const badge = result.layout.byId.get("layout-badge")!;
  const grid = result.layout.byId.get("layout-grid")!;
  const gridShell = result.layout.byId.get("grid-shell")!;
  const gridWorker = result.layout.byId.get("grid-worker")!;

  assertEquals(stage.rect.width > 0, true);
  assertEquals(cpu.rect.row, gpu.rect.row);
  assertEquals(cpu.rect.width, 16);
  assertEquals(gpu.rect.width, 14);
  assertEquals(net.rect.row > cpu.rect.row, true);
  assertEquals(grid.rect.width, stage.contentRect.width);
  assertEquals(gridShell.rect.row, grid.rect.row);
  assertEquals(gridWorker.rect.row > gridShell.rect.row, true);
  assertEquals(badge.rect.column + badge.rect.width, stage.contentRect.column + stage.contentRect.width - 1);
  assertEquals(badge.rect.row, stage.contentRect.row + 1);
});

Deno.test("createMarkupLayout hydrates common widgets and dispatches controller events", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <button id="run">Run</button>
        <input id="query" value="deno" />
        <input id="gain" type="range" min="0" max="100" step="5" value="10" />
        <input id="live" type="checkbox" checked />
        <select id="theme">
          <option value="unit">Unit-01</option>
          <option value="tide" selected>Arcane Tide</option>
        </select>
        <radio-group id="mode" value="fast">
          <radio value="fast">Fast</radio>
          <radio value="slow">Slow</radio>
        </radio-group>
        <tabs id="views">
          <tab id="monitor">Monitor</tab>
          <tab id="three">Three</tab>
        </tabs>
        <textarea id="notes" word-wrap>ready</textarea>
        <scroll-area id="logs" content-width="120" content-height="40"></scroll-area>
        <tree id="files">
          <tree-node id="src" label="src" expanded>
            <tree-node id="mod" label="mod.ts"></tree-node>
          </tree-node>
        </tree>
      </window>
    `,
    css: `
      window {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
      }
    `,
    bounds: { column: 0, row: 0, width: 80, height: 24 },
  });

  assertEquals(result.widgets.inspect().focusOrder, [
    "run",
    "query",
    "gain",
    "live",
    "theme",
    "mode",
    "views",
    "notes",
    "logs",
    "files",
  ]);

  const run = result.widgets.byId.get("run")?.controller;
  assert(run instanceof ButtonController);
  assertEquals(result.widgets.dispatch({ type: "press", id: "run", method: "mouse", now: 10 }), true);
  assertEquals(run.inspect().pressCount, 1);
  assertEquals(run.inspect().lastMethod, "mouse");

  const query = result.widgets.byId.get("query")?.controller;
  assert(query instanceof InputController);
  result.widgets.dispatch({ type: "input", id: "query", value: "deno task" });
  result.widgets.dispatch({ type: "key", id: "query", key: "space" });
  assertEquals(query.inspect().text, "deno task ");

  const gain = result.widgets.byId.get("gain")?.controller;
  assert(gain instanceof SliderController);
  result.widgets.dispatch({ type: "set-value", id: "gain", value: 55 });
  assertEquals(gain.inspect().value, 55);
  result.widgets.dispatch({
    type: "pointer",
    id: "gain",
    column: 20,
    row: 0,
    track: { column: 0, row: 0, width: 21, height: 1 },
  });
  assertEquals(gain.inspect().value, 100);

  const live = result.widgets.byId.get("live")?.controller;
  assert(live instanceof CheckBoxController);
  result.widgets.dispatch({ type: "toggle", id: "live" });
  assertEquals(live.inspect().checked, false);

  const theme = result.widgets.byId.get("theme")?.controller;
  assert(theme instanceof ComboBoxController);
  assertEquals(theme.inspect().selected, "Arcane Tide");
  result.widgets.dispatch({ type: "select", id: "theme", index: 0 });
  assertEquals(theme.inspect().selected, "Unit-01");

  const mode = result.widgets.byId.get("mode")?.controller;
  assert(mode instanceof RadioGroupController);
  result.widgets.dispatch({ type: "select", id: "mode", value: "slow" });
  assertEquals(mode.inspect().selectedValue, "slow");

  const views = result.widgets.byId.get("views")?.controller;
  assert(views instanceof TabsController);
  result.widgets.dispatch({ type: "key", id: "views", key: "right" });
  assertEquals(views.inspect().active?.id, "three");

  const notes = result.widgets.byId.get("notes")?.controller;
  assert(notes instanceof TextBoxController);
  result.widgets.dispatch({ type: "input", id: "notes", value: "first\nsecond" });
  assertEquals(notes.inspect().lineCount, 2);
  assertEquals(notes.inspect().wordWrap, true);

  const logs = result.widgets.byId.get("logs")?.controller;
  assert(logs instanceof ScrollAreaController);
  assertEquals(logs.inspectOverflow().columns.contentLength, 120);
  assertEquals(logs.inspectOverflow().rows.contentLength, 40);
  result.widgets.dispatch({ type: "scroll", id: "logs", rows: 7 });
  assertEquals(logs.inspect().offset.rows, 7);

  const files = result.widgets.byId.get("files")?.controller;
  assert(files instanceof TreeController);
  result.widgets.dispatch({ type: "select", id: "files", value: "mod" });
  assertEquals(files.inspect().selected?.label, "mod.ts");

  result.widgets.dispose();
});

Deno.test("hydrateMarkupWidgets supports custom widget registries", () => {
  const document = parseTuiMarkup(`<meter id="cpu" value="42"></meter>`);
  const registry = new MarkupWidgetHydrationRegistry();
  registry.register("meter", () => ({
    kind: "container",
    focusable: false,
    actions: [],
  }));

  const widgets = hydrateMarkupWidgets(document.root, { registry });

  assertEquals(widgets.inspect().widgetCount, 1);
  assertEquals(widgets.byId.get("cpu")?.kind, "container");
});

Deno.test("hydrateMarkupWidgets orders focusable controls by tabindex", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <button id="doc-a">A</button>
        <button id="skip" tabindex="-1">Skip</button>
        <input id="third" tabindex="3" />
        <button id="first" tabindex="1">First</button>
        <input id="doc-b" tabindex="0" />
        <button id="second" tabindex="2">Second</button>
      </window>
    `,
    css: `
      window {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
      }
    `,
    bounds: { column: 0, row: 0, width: 40, height: 10 },
  });

  assertEquals(result.widgets.inspect().focusOrder, ["first", "second", "third", "doc-a", "doc-b"]);
});

Deno.test("yogaLayoutSolver computes basic flex boxes through the markup API", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <div id="toolbar">Tools</div>
        <scroll-area id="body">Process table and charts</scroll-area>
      </window>
    `,
    css: `
      window {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
      }

      #toolbar {
        height: 3;
      }

      #body {
        flex: 1;
        min-height: 2;
        overflow: auto;
      }
    `,
    bounds: { column: 0, row: 0, width: 80, height: 24 },
    solver: yogaLayoutSolver(),
  });

  assertEquals(result.layout.byId.get("toolbar")!.rect, { column: 0, row: 0, width: 80, height: 3 });
  assertEquals(result.layout.byId.get("body")!.rect, { column: 0, row: 3, width: 80, height: 21 });
});

Deno.test("yogaLayoutSolver applies flex item order through the markup API", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <panel id="late">Late</panel>
        <panel id="middle">Middle</panel>
        <panel id="early">Early</panel>
      </window>
    `,
    css: `
      window {
        display: flex;
        flex-direction: row;
        width: 100%;
        height: 100%;
      }

      panel {
        width: 3;
        height: 1;
        flex-shrink: 0;
      }

      #late { order: 2; }
      #early { order: -1; }
    `,
    bounds: { column: 0, row: 0, width: 12, height: 3 },
    solver: yogaLayoutSolver(),
  });

  assertEquals(result.layout.root.children.map((box) => box.id), ["early", "middle", "late"]);
  assertEquals(result.layout.byId.get("early")!.rect.column, 0);
  assertEquals(result.layout.byId.get("middle")!.rect.column, 3);
  assertEquals(result.layout.byId.get("late")!.rect.column, 6);
});

Deno.test("yogaLayoutSolver accepts wrapped flex rows through the markup API", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <panel id="a">A</panel>
        <panel id="b">B</panel>
        <panel id="c">C</panel>
      </window>
    `,
    css: `
      window {
        display: flex;
        flex-flow: row wrap;
        align-items: start;
        width: 100%;
        height: 100%;
        gap: 1;
      }

      panel {
        width: 4;
        height: 1;
      }
    `,
    bounds: { column: 0, row: 0, width: 10, height: 6 },
    solver: yogaLayoutSolver(),
  });

  assertEquals(result.layout.byId.get("a")!.rect, { column: 0, row: 0, width: 4, height: 1 });
  assertEquals(result.layout.byId.get("b")!.rect, { column: 5, row: 0, width: 4, height: 1 });
  assertEquals(result.layout.byId.get("c")!.rect, { column: 0, row: 2, width: 4, height: 1 });
});

Deno.test("yogaLayoutSolver positions absolute children through the markup API", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <panel id="flow">Flow</panel>
        <panel id="badge">Badge</panel>
      </window>
    `,
    css: `
      window {
        width: 100%;
        height: 100%;
      }

      #flow {
        height: 3;
      }

      #badge {
        position: absolute;
        top: 1;
        right: 2;
        width: 6;
        height: 2;
      }
    `,
    bounds: { column: 0, row: 0, width: 20, height: 10 },
    solver: yogaLayoutSolver(),
  });

  assertEquals(result.layout.byId.get("flow")!.rect, { column: 0, row: 0, width: 20, height: 3 });
  assertEquals(result.layout.byId.get("badge")!.rect, { column: 12, row: 1, width: 6, height: 2 });
});

interface ExpectedMarkupFixtureBox {
  id: string;
  rect: Rectangle;
}

interface MarkupLayoutFixture {
  name: string;
  category: "common" | "solver-specific";
  markup: string;
  css: string;
  bounds: Rectangle;
  expected?: ExpectedMarkupFixtureBox[];
  expectedScroll?: Array<{ id: string; width: number; height: number }>;
  backends: Array<{
    name: string;
    solver: () => LayoutSolver;
    disposition: "supported" | "solver-specific" | "unsupported";
    expected?: ExpectedMarkupFixtureBox[];
    expectedBoxIds?: string[];
    expectedVisibility?: Array<{ id: string; visible: boolean; hitRegions: number }>;
    expectedDiagnostics?: Array<{
      code: LayoutDiagnosticCode;
      nodeId?: string;
      property?: string;
      field?: string;
    }>;
  }>;
}

const sharedMarkupFlexSolvers = [
  { name: "simple", solver: () => simpleLayoutSolver(), disposition: "supported" as const },
  { name: "yoga", solver: () => yogaLayoutSolver(), disposition: "supported" as const },
];

const markupLayoutFixtures: MarkupLayoutFixture[] = [
  {
    name: "column shell with fixed toolbar and flexible body",
    category: "common",
    markup: `
      <window id="main">
        <menu-bar id="toolbar">Tools</menu-bar>
        <scroll-area id="body">Rows</scroll-area>
      </window>
    `,
    css: `
      window {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
      }

      #toolbar {
        height: 3;
      }

      #body {
        flex: 1;
        overflow: auto;
      }
    `,
    bounds: { column: 0, row: 0, width: 80, height: 24 },
    expected: [
      { id: "main", rect: { column: 0, row: 0, width: 80, height: 24 } },
      { id: "toolbar", rect: { column: 0, row: 0, width: 80, height: 3 } },
      { id: "body", rect: { column: 0, row: 3, width: 80, height: 21 } },
    ],
    backends: sharedMarkupFlexSolvers,
  },
  {
    name: "wrapped row flex cards",
    category: "common",
    markup: `
      <window id="main">
        <panel id="a">A</panel>
        <panel id="b">B</panel>
        <panel id="c">C</panel>
      </window>
    `,
    css: `
      window {
        display: flex;
        flex-flow: row wrap;
        align-items: start;
        width: 100%;
        height: 100%;
        gap: 1;
      }

      panel {
        width: 4;
        height: 1;
      }
    `,
    bounds: { column: 0, row: 0, width: 10, height: 6 },
    expected: [
      { id: "main", rect: { column: 0, row: 0, width: 10, height: 6 } },
      { id: "a", rect: { column: 0, row: 0, width: 4, height: 1 } },
      { id: "b", rect: { column: 5, row: 0, width: 4, height: 1 } },
      { id: "c", rect: { column: 0, row: 2, width: 4, height: 1 } },
    ],
    backends: sharedMarkupFlexSolvers,
  },
  {
    name: "row flex honors padding border and gap",
    category: "common",
    markup: `
      <window id="main">
        <panel id="a">A</panel>
        <panel id="b">B</panel>
      </window>
    `,
    css: `
      window {
        display: flex;
        flex-direction: row;
        width: 30;
        height: 8;
        padding: 1 2;
        border: 1;
        gap: 2;
      }

      panel {
        width: 5;
        height: 2;
      }
    `,
    bounds: { column: 4, row: 2, width: 80, height: 20 },
    expected: [
      { id: "main", rect: { column: 4, row: 2, width: 30, height: 8 } },
      { id: "a", rect: { column: 7, row: 4, width: 5, height: 2 } },
      { id: "b", rect: { column: 14, row: 4, width: 5, height: 2 } },
    ],
    backends: sharedMarkupFlexSolvers,
  },
  {
    name: "absolute child leaves normal flow",
    category: "common",
    markup: `
      <window id="main">
        <panel id="flow">Flow</panel>
        <panel id="badge">Badge</panel>
      </window>
    `,
    css: `
      #main {
        display: flex;
        flex-direction: column;
        width: 20;
        height: 10;
      }

      #flow { height: 3; }
      #badge {
        position: absolute;
        top: 1;
        right: 2;
        width: 6;
        height: 2;
      }
    `,
    bounds: { column: 0, row: 0, width: 20, height: 10 },
    expected: [
      { id: "main", rect: { column: 0, row: 0, width: 20, height: 10 } },
      { id: "flow", rect: { column: 0, row: 0, width: 20, height: 3 } },
      { id: "badge", rect: { column: 12, row: 1, width: 6, height: 2 } },
    ],
    backends: sharedMarkupFlexSolvers,
  },
  {
    name: "overflow inspection includes positive absolute extents",
    category: "common",
    markup: `<window id="main"><panel id="child">Child</panel></window>`,
    css: `
      #main { display: flex; position: relative; width: 10; height: 4; overflow: auto; }
      #child { position: absolute; left: 12; top: 1; width: 4; height: 1; }
    `,
    bounds: { column: 0, row: 0, width: 10, height: 4 },
    expected: [
      { id: "main", rect: { column: 0, row: 0, width: 10, height: 4 } },
      { id: "child", rect: { column: 12, row: 1, width: 4, height: 1 } },
    ],
    expectedScroll: [{ id: "main", width: 16, height: 4 }],
    backends: sharedMarkupFlexSolvers,
  },
  {
    name: "fractional input bounds normalize to terminal cells",
    category: "common",
    markup: `<window id="main">Main</window>`,
    css: "",
    bounds: { column: 1.8, row: 2.9, width: 10.8, height: 3.7 },
    expected: [{ id: "main", rect: { column: 1, row: 2, width: 10, height: 3 } }],
    backends: sharedMarkupFlexSolvers,
  },
  {
    name: "cell max constraint is shared",
    category: "common",
    markup: `<window id="main"><panel id="child">Child</panel></window>`,
    css: `
      #main { display: flex; width: 20; height: 4; }
      #child { width: 15; max-width: 7; height: 1; }
    `,
    bounds: { column: 0, row: 0, width: 20, height: 4 },
    expected: [
      { id: "main", rect: { column: 0, row: 0, width: 20, height: 4 } },
      { id: "child", rect: { column: 0, row: 0, width: 7, height: 1 } },
    ],
    backends: sharedMarkupFlexSolvers,
  },
  {
    name: "dual-edge absolute auto sizing is explicit per backend",
    category: "solver-specific",
    markup: `<window id="main"><panel id="badge">Badge</panel></window>`,
    css: `
      #main { display: flex; position: relative; width: 20; height: 10; }
      #badge { position: absolute; left: 2; right: 3; top: 1; bottom: 2; }
    `,
    bounds: { column: 0, row: 0, width: 20, height: 10 },
    backends: [
      {
        name: "simple",
        solver: () => simpleLayoutSolver(),
        disposition: "solver-specific",
        expected: [
          { id: "main", rect: { column: 0, row: 0, width: 20, height: 10 } },
          { id: "badge", rect: { column: 2, row: 1, width: 15, height: 1 } },
        ],
        expectedDiagnostics: [{ code: "partial-solver-support", nodeId: "badge", field: "inset" }],
      },
      {
        name: "yoga",
        solver: () => yogaLayoutSolver(),
        disposition: "solver-specific",
        expected: [
          { id: "main", rect: { column: 0, row: 0, width: 20, height: 10 } },
          { id: "badge", rect: { column: 2, row: 1, width: 15, height: 7 } },
        ],
      },
    ],
  },
  {
    name: "display and visibility hiding retain declared backend shape",
    category: "solver-specific",
    markup: `
      <window id="main">
        <panel id="gone"><button id="gone-child">Gone child</button></panel>
        <panel id="invisible"><button id="visible-override">Visible override</button></panel>
        <panel id="flow">Flow</panel>
      </window>
    `,
    css: `
      #main { display: flex; width: 10; height: 4; }
      #gone { display: none; width: 3; height: 1; }
      #invisible { display: flex; flex-direction: column; visibility: hidden; width: 3; height: 1; }
      #visible-override { visibility: visible; width: 2; height: 1; }
      #flow { width: 3; height: 1; }
    `,
    bounds: { column: 0, row: 0, width: 10, height: 4 },
    backends: [
      {
        name: "simple",
        solver: () => simpleLayoutSolver(),
        disposition: "solver-specific",
        expectedBoxIds: ["main", "invisible", "visible-override", "flow"],
        expectedVisibility: [
          { id: "invisible", visible: false, hitRegions: 0 },
          { id: "visible-override", visible: true, hitRegions: 1 },
        ],
      },
      {
        name: "yoga",
        solver: () => yogaLayoutSolver(),
        disposition: "solver-specific",
        expectedBoxIds: ["main", "gone", "gone-child", "invisible", "visible-override", "flow"],
        expectedVisibility: [
          { id: "gone", visible: false, hitRegions: 0 },
          { id: "gone-child", visible: false, hitRegions: 0 },
          { id: "invisible", visible: false, hitRegions: 0 },
          { id: "visible-override", visible: true, hitRegions: 1 },
        ],
      },
    ],
  },
  {
    // Since the L1 fairness/minimum pass, both backends preserve an explicit
    // minimum and let the container overflow instead of squeezing below it.
    name: "explicit minimums overflow the container in both backends",
    category: "common",
    markup: `<window id="main"><panel id="child">Child</panel></window>`,
    css: `
      #main { display: flex; width: 5; height: 3; }
      #child { width: 1; min-width: 8; max-width: 10; height: 1; }
    `,
    bounds: { column: 0, row: 0, width: 5, height: 3 },
    expected: [
      { id: "main", rect: { column: 0, row: 0, width: 5, height: 3 } },
      { id: "child", rect: { column: 0, row: 0, width: 8, height: 1 } },
    ],
    backends: [
      {
        name: "simple",
        solver: () => simpleLayoutSolver(),
        disposition: "supported",
        expectedDiagnostics: [{
          code: "partial-solver-support",
          nodeId: "child",
          property: "min-width",
          field: "minWidth",
        }],
      },
      { name: "yoga", solver: () => yogaLayoutSolver(), disposition: "supported" },
    ],
  },
  {
    name: "width-constrained intrinsic text is explicit per backend",
    category: "solver-specific",
    markup: `<window id="main"><panel id="child">aa bbbb cc</panel></window>`,
    css: `
      #main { display: flex; align-items: start; width: 20; height: 5; }
      #child { width: 6; height: auto; }
    `,
    bounds: { column: 0, row: 0, width: 20, height: 5 },
    backends: [
      {
        name: "simple",
        solver: () => simpleLayoutSolver(),
        disposition: "solver-specific",
        expected: [
          { id: "main", rect: { column: 0, row: 0, width: 20, height: 5 } },
          { id: "child", rect: { column: 0, row: 0, width: 6, height: 1 } },
        ],
        expectedDiagnostics: [{
          code: "partial-solver-support",
          nodeId: "child",
          field: "height",
        }],
      },
      {
        name: "yoga",
        solver: () => yogaLayoutSolver(),
        disposition: "solver-specific",
        expected: [
          { id: "main", rect: { column: 0, row: 0, width: 20, height: 5 } },
          { id: "child", rect: { column: 0, row: 0, width: 6, height: 3 } },
        ],
      },
    ],
  },
  {
    name: "grid placement with spanning cell",
    category: "solver-specific",
    markup: `
      <window id="main">
        <panel id="left">Left</panel>
        <panel id="right">Right</panel>
        <panel id="footer">Footer</panel>
      </window>
    `,
    css: `
      window {
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 3 2;
        width: 20;
        height: 6;
        gap: 1;
      }

      #footer {
        grid-column: 1 / span 2;
        grid-row: 2;
      }
    `,
    bounds: { column: 2, row: 1, width: 30, height: 10 },
    expected: [
      { id: "main", rect: { column: 2, row: 1, width: 20, height: 6 } },
      { id: "left", rect: { column: 2, row: 1, width: 9, height: 3 } },
      { id: "right", rect: { column: 12, row: 1, width: 10, height: 3 } },
      { id: "footer", rect: { column: 2, row: 5, width: 20, height: 2 } },
    ],
    backends: [
      { name: "simple", solver: () => simpleLayoutSolver(), disposition: "solver-specific" },
      {
        name: "yoga",
        solver: () => yogaLayoutSolver(),
        disposition: "unsupported",
        expectedDiagnostics: [
          { code: "solver-fallback", nodeId: "main", property: "display", field: "display" },
          {
            code: "unsupported-by-solver",
            nodeId: "main",
            property: "grid-template-columns",
            field: "gridTemplateColumns",
          },
          {
            code: "unsupported-by-solver",
            nodeId: "main",
            property: "grid-template-rows",
            field: "gridTemplateRows",
          },
          {
            code: "unsupported-by-solver",
            nodeId: "footer",
            property: "grid-column",
            field: "gridColumn",
          },
          {
            code: "unsupported-by-solver",
            nodeId: "footer",
            property: "grid-row",
            field: "gridRow",
          },
        ],
      },
    ],
  },
  // L1 verification corpus: grow/shrink/basis, wrapping, gaps, min/max,
  // intrinsic bases, and one-cell remainder allocation across nested and
  // overflowing containers (036 L1).
  {
    name: "nested equal grow splits with a one-cell remainder",
    category: "solver-specific",
    markup: `
      <window id="main">
        <panel id="bar">T</panel>
        <panel id="row">
          <panel id="a">A</panel>
          <panel id="b">B</panel>
          <panel id="c">C</panel>
        </panel>
      </window>
    `,
    css: `
      #main { display: flex; flex-direction: column; width: 100%; height: 100%; }
      #bar { height: 1; }
      #row { display: flex; flex-direction: row; flex: 1; }
      #a, #b, #c { flex-grow: 1; flex-basis: 0; height: 2; }
    `,
    bounds: { column: 0, row: 0, width: 10, height: 6 },
    backends: [
      {
        // Largest-remainder allocation: the single leftover cell lands on the
        // first item; every item stays within one cell of the ideal share.
        name: "simple",
        solver: () => simpleLayoutSolver(),
        disposition: "solver-specific",
        expected: [
          { id: "main", rect: { column: 0, row: 0, width: 10, height: 6 } },
          { id: "bar", rect: { column: 0, row: 0, width: 10, height: 1 } },
          { id: "row", rect: { column: 0, row: 1, width: 10, height: 5 } },
          { id: "a", rect: { column: 0, row: 1, width: 4, height: 2 } },
          { id: "b", rect: { column: 4, row: 1, width: 3, height: 2 } },
          { id: "c", rect: { column: 7, row: 1, width: 3, height: 2 } },
        ],
      },
      {
        // Yoga rounds fractional edges per item, so 10/3 yields three 4-wide
        // rects whose columns round from thirds and may abut off-by-one.
        name: "yoga",
        solver: () => yogaLayoutSolver(),
        disposition: "solver-specific",
        expected: [
          { id: "main", rect: { column: 0, row: 0, width: 10, height: 6 } },
          { id: "bar", rect: { column: 0, row: 0, width: 10, height: 1 } },
          { id: "row", rect: { column: 0, row: 1, width: 10, height: 5 } },
          { id: "a", rect: { column: 0, row: 1, width: 4, height: 2 } },
          { id: "b", rect: { column: 3, row: 1, width: 4, height: 2 } },
          { id: "c", rect: { column: 6, row: 1, width: 4, height: 2 } },
        ],
      },
    ],
  },
  {
    name: "shrinking stops at explicit minimums and reports the overflow",
    category: "common",
    markup: `
      <window id="main">
        <panel id="hold">HH</panel>
        <panel id="give">GG</panel>
      </window>
    `,
    css: `
      #main { display: flex; flex-direction: row; width: 12; height: 3; }
      #hold { flex-basis: 10; flex-shrink: 1; min-width: 8; height: 2; }
      #give { flex-basis: 10; flex-shrink: 1; min-width: 6; height: 2; }
    `,
    bounds: { column: 0, row: 0, width: 20, height: 6 },
    expected: [
      { id: "main", rect: { column: 0, row: 0, width: 12, height: 3 } },
      { id: "hold", rect: { column: 0, row: 0, width: 8, height: 2 } },
      { id: "give", rect: { column: 8, row: 0, width: 6, height: 2 } },
    ],
    expectedScroll: [{ id: "main", width: 14, height: 3 }],
    backends: [
      {
        name: "simple",
        solver: () => simpleLayoutSolver(),
        disposition: "supported",
        expectedDiagnostics: [
          { code: "partial-solver-support", nodeId: "hold", property: "min-width", field: "minWidth" },
          { code: "partial-solver-support", nodeId: "give", property: "min-width", field: "minWidth" },
        ],
      },
      { name: "yoga", solver: () => yogaLayoutSolver(), disposition: "supported" },
    ],
  },
  {
    name: "intrinsic text bases wrap with gaps inside a vertically overflowing container",
    category: "common",
    markup: `
      <window id="main">
        <panel id="one">alpha beta</panel>
        <panel id="two">gamma</panel>
        <panel id="three">delta epsilon</panel>
      </window>
    `,
    css: `
      #main { display: flex; flex-flow: row wrap; align-items: start; width: 14; height: 3; gap: 1; overflow: auto; }
      #one, #two, #three { height: 1; }
    `,
    bounds: { column: 0, row: 0, width: 20, height: 8 },
    expected: [
      { id: "main", rect: { column: 0, row: 0, width: 14, height: 3 } },
      { id: "one", rect: { column: 0, row: 0, width: 10, height: 1 } },
      { id: "two", rect: { column: 0, row: 2, width: 5, height: 1 } },
      { id: "three", rect: { column: 0, row: 4, width: 13, height: 1 } },
    ],
    expectedScroll: [{ id: "main", width: 14, height: 5 }],
    backends: sharedMarkupFlexSolvers,
  },
  {
    name: "nested max-width caps a grow item while column shrink is solver-specific",
    category: "solver-specific",
    markup: `
      <window id="main">
        <panel id="outer">
          <panel id="capped">C</panel>
          <panel id="rest">R</panel>
        </panel>
      </window>
    `,
    css: `
      #main { display: flex; flex-direction: column; width: 16; height: 4; overflow: auto; }
      #outer { display: flex; flex-direction: row; height: 6; }
      #capped { flex-grow: 1; flex-basis: 0; max-width: 5; height: 6; }
      #rest { flex-grow: 1; flex-basis: 0; height: 6; }
    `,
    bounds: { column: 0, row: 0, width: 24, height: 10 },
    backends: [
      {
        // CSS default flex-shrink is 1, so the 6-high row shrinks into the
        // 4-high column; the max-width cap on one item holds either way.
        name: "simple",
        solver: () => simpleLayoutSolver(),
        disposition: "solver-specific",
        expected: [
          { id: "main", rect: { column: 0, row: 0, width: 16, height: 4 } },
          { id: "outer", rect: { column: 0, row: 0, width: 16, height: 4 } },
          { id: "capped", rect: { column: 0, row: 0, width: 5, height: 4 } },
          { id: "rest", rect: { column: 5, row: 0, width: 11, height: 4 } },
        ],
      },
      {
        // The Yoga adapter keeps Yoga's native flex-shrink default of 0: the
        // row's children stay 6 high inside the clamped 4-high row rect, and
        // the overflow shows up in the row's scroll metadata instead.
        name: "yoga",
        solver: () => yogaLayoutSolver(),
        disposition: "solver-specific",
        expected: [
          { id: "main", rect: { column: 0, row: 0, width: 16, height: 4 } },
          { id: "outer", rect: { column: 0, row: 0, width: 16, height: 4 } },
          { id: "capped", rect: { column: 0, row: 0, width: 5, height: 6 } },
          { id: "rest", rect: { column: 5, row: 0, width: 11, height: 6 } },
        ],
      },
    ],
  },
];

for (const fixture of markupLayoutFixtures) {
  for (const backend of fixture.backends) {
    Deno.test(`layout fixture: ${fixture.category}: ${fixture.name} (${backend.name}, ${backend.disposition})`, () => {
      const result = createMarkupLayout({
        markup: fixture.markup,
        css: fixture.css,
        bounds: fixture.bounds,
        solver: backend.solver(),
        widgets: false,
      });

      assertLayoutResultContract(result.layout, `${fixture.name} (${backend.name})`);
      const expectedBoxes = backend.expected ?? fixture.expected ?? [];
      if (backend.disposition !== "unsupported") {
        assert(expectedBoxes.length > 0 || (backend.expectedBoxIds?.length ?? 0) > 0, "fixture must assert boxes");
        for (const expected of expectedBoxes) {
          assertEquals(result.layout.byId.get(expected.id)?.rect, expected.rect, expected.id);
        }
        for (const expected of fixture.expectedScroll ?? []) {
          const box = result.layout.byId.get(expected.id);
          assertEquals([box?.scrollWidth, box?.scrollHeight], [expected.width, expected.height], expected.id);
        }
      }
      if (backend.expectedBoxIds) {
        assertEquals(result.layout.boxes.map((box) => box.id), backend.expectedBoxIds);
      } else if (backend.disposition !== "unsupported") {
        assertEquals(result.layout.boxes.map((box) => box.id), expectedBoxes.map((box) => box.id));
      }
      for (const expectation of backend.expectedVisibility ?? []) {
        const box = result.layout.byId.get(expectation.id);
        assertEquals(box?.visible, expectation.visible, `${expectation.id} visibility`);
        assertEquals(box?.hitRegions.length, expectation.hitRegions, `${expectation.id} hits`);
      }
      const actualDiagnostics = result.diagnostics.map(({ code, nodeId, property, field }) => {
        const diagnostic: { code: LayoutDiagnosticCode; nodeId?: string; property?: string; field?: string } = { code };
        if (nodeId !== undefined) diagnostic.nodeId = nodeId;
        if (property !== undefined) diagnostic.property = property;
        if (field !== undefined) diagnostic.field = field;
        return diagnostic;
      });
      assertEquals(
        actualDiagnostics,
        backend.expectedDiagnostics ?? [],
        `${fixture.name} (${backend.name}) diagnostics`,
      );
    });
  }
}

Deno.test("generated flex fixtures keep simple and yoga solvers in parity", () => {
  const random = seededRandom(0x1a7007);
  for (let run = 0; run < 60; run += 1) {
    const direction = run % 2 === 0 ? "row" : "column";
    const count = 1 + Math.floor(random() * 5);
    const gap = Math.floor(random() * 3);
    const padding = Math.floor(random() * 2);
    const childWidth = 3 + Math.floor(random() * 8);
    const childHeight = 1 + Math.floor(random() * 4);
    const mainUsed = count * (direction === "row" ? childWidth : childHeight) + (count - 1) * gap + padding * 2;
    const crossUsed = (direction === "row" ? childHeight : childWidth) + padding * 2;
    const bounds: Rectangle = {
      column: Math.floor(random() * 4),
      row: Math.floor(random() * 3),
      width: direction === "row" ? mainUsed + 5 : crossUsed + 5,
      height: direction === "row" ? crossUsed + 4 : mainUsed + 4,
    };
    const markup = `
      <window id="main">
        ${Array.from({ length: count }, (_, index) => `<panel id="item-${index}">Item ${index}</panel>`).join("\n")}
      </window>
    `;
    const css = `
      window {
        display: flex;
        flex-direction: ${direction};
        width: 100%;
        height: 100%;
        padding: ${padding};
        gap: ${gap};
      }

      panel {
        width: ${childWidth};
        height: ${childHeight};
        flex-shrink: 0;
      }
    `;

    const simple = createMarkupLayout({ markup, css, bounds, solver: simpleLayoutSolver(), widgets: false });
    const yoga = createMarkupLayout({ markup, css, bounds, solver: yogaLayoutSolver(), widgets: false });

    for (let index = 0; index < count; index += 1) {
      const id = `item-${index}`;
      const simpleRect = simple.layout.byId.get(id)?.rect;
      const yogaRect = yoga.layout.byId.get(id)?.rect;
      assertEquals(simpleRect, yogaRect, `${id} run ${run}`);
      assertRectWithin(simpleRect!, bounds, `${id} run ${run}`);
    }
  }
});

function findLayoutNode(node: LayoutNode, id: string): LayoutNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findLayoutNode(child, id);
    if (found) return found;
  }
  return undefined;
}

function assertRectWithin(rect: Rectangle, bounds: Rectangle, label: string): void {
  assertEquals(rect.column >= bounds.column, true, `${label} column lower bound`);
  assertEquals(rect.row >= bounds.row, true, `${label} row lower bound`);
  assertEquals(rect.column + rect.width <= bounds.column + bounds.width, true, `${label} column upper bound`);
  assertEquals(rect.row + rect.height <= bounds.row + bounds.height, true, `${label} row upper bound`);
}

function assertLayoutResultContract(result: LayoutSolverResult, label: string): void {
  const preorder: ComputedLayoutBox[] = [];
  visit(result.root);
  assertEquals(result.boxes.map((box) => box.id), preorder.map((box) => box.id), `${label} preorder`);
  assert(result.boxes[0] === result.root, `${label} root identity`);
  for (let index = 0; index < preorder.length; index += 1) {
    assert(result.boxes[index] === preorder[index], `${label} preorder identity ${index}`);
  }
  assertEquals(result.byId.size, result.boxes.length, `${label} byId size`);
  assertEquals(result.contentWidth, result.root.scrollWidth, `${label} content width`);
  assertEquals(result.contentHeight, result.root.scrollHeight, `${label} content height`);

  for (const box of result.boxes) {
    assert(result.byId.get(box.id) === box, `${label} map identity ${box.id}`);
    for (
      const value of [
        box.rect.column,
        box.rect.row,
        box.rect.width,
        box.rect.height,
        box.contentRect.column,
        box.contentRect.row,
        box.contentRect.width,
        box.contentRect.height,
        box.scrollWidth,
        box.scrollHeight,
      ]
    ) {
      assert(Number.isFinite(value) && Number.isInteger(value), `${label} integer cells ${box.id}`);
    }
    assert(box.rect.width >= 0 && box.rect.height >= 0, `${label} non-negative rect ${box.id}`);
    assert(box.contentRect.width >= 0 && box.contentRect.height >= 0, `${label} non-negative content ${box.id}`);
    assert(box.contentRect.column >= box.rect.column, `${label} content column lower bound ${box.id}`);
    assert(box.contentRect.row >= box.rect.row, `${label} content row lower bound ${box.id}`);
    assert(
      box.contentRect.column + box.contentRect.width <= box.rect.column + box.rect.width,
      `${label} content column upper bound ${box.id}`,
    );
    assert(
      box.contentRect.row + box.contentRect.height <= box.rect.row + box.rect.height,
      `${label} content row upper bound ${box.id}`,
    );
    assert(box.scrollWidth >= box.contentRect.width, `${label} scroll width ${box.id}`);
    assert(box.scrollHeight >= box.contentRect.height, `${label} scroll height ${box.id}`);
    assertEquals(
      box.overflow,
      computedLayoutBoxOverflow(box.contentRect, box.scrollWidth, box.scrollHeight, box.overflowX, box.overflowY),
      `${label} overflow ${box.id}`,
    );
    if (!box.visible) assertEquals(box.hitRegions, [], `${label} hidden hits ${box.id}`);
    for (const region of box.hitRegions) assertEquals(region.bounds, box.rect, `${label} hit bounds ${box.id}`);
  }

  function visit(box: ComputedLayoutBox): void {
    preorder.push(box);
    for (const child of box.children) visit(child);
  }
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}
