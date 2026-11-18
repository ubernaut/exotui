// Copyright 2023 Im-Beast. MIT license.
import { Computed, createTerminalApp, Signal, StatusBar } from "../mod.app.ts";
import { Markdown, MarkdownSurface, TITLE_HEADING_FONTS } from "../mod.document.ts";
import { prepareMermaidMarkdown } from "../mod.mermaid.ts";
import { createHeadlessMermaidRenderer } from "../mod.mermaid_headless.ts";
import { createAnsiStyle } from "../src/theme.ts";
import { runtimeHost } from "../src/runtime/host.ts";

const accepted = new Set(["--snapshot", "--animate", "--no-chromium-sandbox", "--help"]);
for (const argument of runtimeHost.args) {
  if (argument.startsWith("--") && !accepted.has(argument)) throw new Error(`Unknown option: ${argument}`);
}
if (runtimeHost.args.includes("--help")) {
  console.log(
    "deno task mermaid:document-viewer [document.md] [--snapshot] [--animate] [--no-chromium-sandbox]\n" +
      "Set EXOTUI_CHROMIUM to an installed Chromium executable. No browser is downloaded.\n" +
      "Sandboxing is enabled unless the host explicitly opts out.\n" +
      "Wheel / PgUp / PgDn scroll; [ / ] pan diagrams; Q quits.\n" +
      "--snapshot prints one native 120x40 frame without terminal input.\n" +
      "--animate opts into host-clock playback; omit it for a deterministic/reduced-motion frame.",
  );
  runtimeHost.exit(0);
}
const paths = runtimeHost.args.filter((argument) => !argument.startsWith("--"));
if (paths.length > 1) throw new Error("Pass at most one Markdown document.");
const source = paths[0] ? await runtimeHost.readTextFile(paths[0]) : [
  "# Full Mermaid",
  "",
  "Official grammar and layout, composed with ordinary ExotUI cells. No HTML overlay or source-text substitute.",
  "",
  "## Nested architecture",
  "",
  "```mermaid",
  "flowchart LR",
  "subgraph Platform",
  "  direction TB",
  '  docs["Markdown"] --> compiler["Full Mermaid"]',
  '  compiler --> cells@{ shape: cyl, label: "Native cells" }',
  "end",
  'cells --> browser["Browser"]',
  'cells --> terminal["Terminal"]',
  'cells --> remote["Remote"]',
  "```",
  "",
  "## Animated edge",
  "",
  "```mermaid",
  "flowchart LR",
  "Clock e1@--> Native",
  "e1@{ animation: fast }",
  "```",
  "",
  "## Sequence",
  "",
  "```mermaid",
  "sequenceDiagram",
  "participant App",
  "participant Compiler",
  "App->>Compiler: Prepare unique fences",
  "Compiler-->>App: Measured scene and native frame",
  "Note over App: Compiler is now disposed",
  "App->>App: Scroll, resize and pan native cells",
  "```",
  "",
  "## Chart",
  "",
  "```mermaid",
  "pie title Shared scene consumers",
  '"Browser" : 1',
  '"Terminal" : 1',
  '"Remote" : 1',
  "```",
].join("\n");
const horizontalOffset = new Signal(0);
const animationTime = new Signal(0);
const animate = runtimeHost.args.includes("--animate") && !runtimeHost.args.includes("--snapshot");
const renderer = await createHeadlessMermaidRenderer({
  executablePath: runtimeHost.env.get("EXOTUI_CHROMIUM"),
  chromiumSandbox: !runtimeHost.args.includes("--no-chromium-sandbox"),
});
const prepared = await (async () => {
  try {
    return await prepareMermaidMarkdown(source, renderer, {
      native: { background: "rgb(10,12,20)" },
      offset: () => horizontalOffset.value,
      time: animate ? () => animationTime.peek() : undefined,
      render: {
        headingFonts: TITLE_HEADING_FONTS,
        headingArt: "title",
        wrapHeadingArt: false,
        showLinkDestinations: false,
      },
    });
  } finally {
    // Static and timed native scenes remain usable without a live browser/DOM compiler.
    await renderer.dispose();
  }
})();
for (const diagnostic of prepared.diagnostics) console.error(`Mermaid fidelity: ${diagnostic}`);
if (runtimeHost.args.includes("--snapshot")) {
  const surface = new MarkdownSurface({ source, render: prepared.render });
  try {
    await surface.ready;
    console.log(surface.render(120, 40).join("\n"));
  } finally {
    surface.dispose();
  }
} else {
  const text = createAnsiStyle({ foreground: [220, 230, 239] });
  const accent = createAnsiStyle({ foreground: [122, 219, 210] });
  let document: Markdown | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  const app = createTerminalApp<{ type: "quit" } | { type: "pan"; delta: number }>({
    id: "full-mermaid-viewer",
    label: "Full Mermaid native documents",
    tuiOptions: { style: createAnsiStyle({ background: [10, 12, 20] }), enableMouse: true },
    commands: [
      { id: "quit", label: "Quit", binding: { key: "q" }, action: { type: "quit" } },
      { id: "pan-left", label: "Pan diagrams left", binding: { key: "[" }, action: { type: "pan", delta: -10 } },
      { id: "pan-right", label: "Pan diagrams right", binding: { key: "]" }, action: { type: "pan", delta: 10 } },
    ],
    onAction(action) {
      if (action.type === "quit") {
        if (timer !== undefined) clearInterval(timer);
        animationTime.dispose();
        app.destroy();
        runtimeHost.exit(0);
      }
      horizontalOffset.value = Math.max(0, horizontalOffset.value + action.delta);
      document?.controller.invalidate();
    },
    setup(app) {
      document = new Markdown({
        parent: app.tui,
        zIndex: 1,
        theme: { base: text, focused: text },
        source,
        styles: { heading: accent },
        render: prepared.render,
        rectangle: new Computed(() => ({
          column: 1,
          row: 1,
          width: Math.max(1, app.tui.rectangle.value.width - 2),
          height: Math.max(1, app.tui.rectangle.value.height - 3),
        })),
      });
      new StatusBar({
        parent: app.tui,
        zIndex: 2,
        theme: { base: accent },
        left: new Computed(() => ` Full Mermaid · horizontal offset ${horizontalOffset.value} `),
        right: " Wheel · PgUp/PgDn · [ / ] pan · Q quit ",
        rectangle: new Computed(() => ({
          column: 0,
          row: Math.max(0, app.tui.rectangle.value.height - 1),
          width: app.tui.rectangle.value.width,
          height: 1,
        })),
      });
      app.registerComponent(document, { id: "document" });
      app.focus.focus(document);
      if (animate && prepared.diagrams.some((diagram) => diagram.diagram.scene?.animations?.length)) {
        const started = performance.now();
        timer = setInterval(() => {
          animationTime.value = performance.now() - started;
          document?.controller.invalidate();
        }, 100);
      }
    },
  });
  app.start();
}
