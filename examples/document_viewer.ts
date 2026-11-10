import { Computed, createTerminalApp, StatusBar } from "../mod.app.ts";
import { ASCII_HEADING_FONTS, Markdown } from "../mod.document.ts";
import { createAnsiStyle } from "../src/theme.ts";

const source = Deno.args[0] ? await Deno.readTextFile(Deno.args[0]) : [
  "# DOCUMENTS",
  "",
  "## Native Markdown",
  "",
  "The real Markdown component renders this document in a terminal, browser, or cell-composed window.",
  "",
  "### Three-row headings",
  "",
  "#### Plain headings",
  "",
  "- **Structured text**, *emphasis*, `code`, and wrapped links.",
  "- Wheel, arrow keys, Page Up/Down, Home/End; Q quits.",
  "",
  "| Surface | Renderer |",
  "| --- | --- |",
  "| Terminal | ANSI cells |",
  "| Browser | The same cells |",
  "",
  "```mermaid",
  "flowchart TB",
  'code["Code / evidence"] --> review(Review)',
  "review -.->|optional adapter| model[Model]",
  "model ==> serving{Ready?}",
  "```",
  "",
  "[Inspect the supported flowchart grammar](https://mermaid.js.org/syntax/flowchart.html)",
].join("\n");
const text = createAnsiStyle({ foreground: [220, 230, 239] });
const accent = createAnsiStyle({ foreground: [122, 219, 210] });
const app = createTerminalApp<{ type: "quit" }>({
  id: "document-viewer",
  label: "Terminal-native documents",
  tuiOptions: { style: createAnsiStyle({ background: [10, 12, 20] }), enableMouse: true },
  commands: [{ id: "quit", label: "Quit", binding: { key: "q" }, action: { type: "quit" } }],
  onAction() {
    app.destroy();
    Deno.exit(0);
  },
  setup(app) {
    const document = new Markdown({
      parent: app.tui,
      zIndex: 1,
      theme: { base: text, focused: text },
      source,
      styles: { heading: accent, "code-fence": accent },
      render: { headingFonts: ASCII_HEADING_FONTS, mermaid: true, showLinkDestinations: false },
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
      left: " Markdown / Mermaid ",
      right: " Wheel · PgUp/PgDn · Home/End · Q quit ",
      rectangle: new Computed(() => ({
        column: 0,
        row: Math.max(0, app.tui.rectangle.value.height - 1),
        width: app.tui.rectangle.value.width,
        height: 1,
      })),
    });
    app.registerComponent(document, { id: "document" });
    app.focus.focus(document);
  },
});
app.start();
