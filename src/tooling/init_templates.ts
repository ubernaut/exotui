// Copyright 2023 Im-Beast. MIT license.

// PKG-001: `init` scaffolds from VERSIONED built-in assets. Four
// templates — terminal, browser, remote-client, library — are embedded
// as data (no network, no copying from the live repo), each carrying a
// deno.json with an explicit import mapping and a task section, a main
// module, and a test. Templates request NO permissions: their generated
// tests run under a bare `deno test`, which is how the acceptance
// criterion "uses only declared permissions" is enforced — the declared
// set is empty, and the verification suite generates every template and
// actually runs fmt --check, check, and test on it.

/** Template kinds. */
export type TemplateKind = "terminal" | "browser" | "remote-client" | "library";

/** The template asset version. */
export const TEMPLATE_VERSION = "1.0.0";

/** One generated project: file path → contents. */
export type TemplateFiles = Readonly<Record<string, string>>;

function denoJson(importSource: string): string {
  return JSON.stringify(
    {
      templateVersion: TEMPLATE_VERSION,
      tasks: { test: "deno test", check: "deno check main.ts" },
      imports: {
        "@ubernaut/deno-tui": `${importSource}/mod.ts`,
        "@ubernaut/deno-tui/app": `${importSource}/mod.app.ts`,
        "@ubernaut/deno-tui/remote": `${importSource}/mod.remote.ts`,
        "@ubernaut/deno-tui/testing": `${importSource}/mod.testing.ts`,
      },
      compilerOptions: { lib: ["deno.window", "dom", "dom.iterable"] },
    },
    null,
    2,
  ) + "\n";
}

const TEMPLATES: Readonly<Record<TemplateKind, (importSource: string) => TemplateFiles>> = {
  terminal: (importSource) => ({
    "deno.json": denoJson(importSource),
    "main.ts": `import { createTokenEditor } from "@ubernaut/deno-tui";

/** The app's single controller — grow from here. */
export function createApp() {
  const editor = createTokenEditor();
  editor.type("hello,world,");
  return { tokens: editor.tokens().map((token) => token.text) };
}
`,
    "main_test.ts": `import { createApp } from "./main.ts";

Deno.test("the terminal app boots with its seed tokens", () => {
  const app = createApp();
  if (app.tokens.join("+") !== "hello+world") {
    throw new Error(app.tokens.join("+"));
  }
});
`,
  }),
  browser: (importSource) => ({
    "deno.json": denoJson(importSource),
    "main.ts": `import { parseTuiMarkup } from "@ubernaut/deno-tui";

/** Parses the app's markup shell. */
export function shell() {
  return parseTuiMarkup('<div id="app"><span id="title">hi</span></div>').root;
}
`,
    "main_test.ts": `import { shell } from "./main.ts";

Deno.test("the browser shell parses with its title node", () => {
  const root = shell();
  const hasTitle = JSON.stringify(root).includes("title");
  if (!hasTitle) {
    throw new Error("missing title node");
  }
});
`,
  }),
  "remote-client": (importSource) => ({
    "deno.json": denoJson(importSource),
    "main.ts": `import { type CellFrame, encodeCellFrame } from "@ubernaut/deno-tui/remote";

/** Encodes the client's first frame. */
export function firstFrame(): ReturnType<typeof encodeCellFrame> {
  const frame: CellFrame = {
    columns: 5,
    rows: 1,
    cells: [..."ready"].map((char) => ({ char, style: "plain" })),
  };
  return encodeCellFrame(frame);
}
`,
    "main_test.ts": `import { firstFrame } from "./main.ts";

Deno.test("the remote client encodes its first frame", () => {
  const encoded = firstFrame();
  if (encoded.kind !== "full" || encoded.palette[0] !== "plain") {
    throw new Error(encoded.kind);
  }
});
`,
  }),
  library: (importSource) => ({
    "deno.json": denoJson(importSource),
    "mod.ts": `import { linearScale } from "@ubernaut/deno-tui";

/** The library's public helper. */
export function percentToCell(percent: number, cells: number): number {
  const scale = linearScale([0, 100], [0, Math.max(0, cells - 1)]);
  return Math.round(scale.map(Math.max(0, Math.min(100, percent))));
}
`,
    "mod_test.ts": `import { percentToCell } from "./mod.ts";

Deno.test("the library helper maps percents onto cells", () => {
  if (percentToCell(0, 80) !== 0) {
    throw new Error("start");
  }
  if (percentToCell(100, 80) !== 79) {
    throw new Error("end");
  }
  if (percentToCell(50, 80) !== 40) {
    throw new Error("middle");
  }
});
`,
  }),
};

/** All template kinds. */
export const TEMPLATE_KINDS: readonly TemplateKind[] = ["terminal", "browser", "remote-client", "library"];

/**
 * Generates one template's files. `importSource` defaults to the JSR
 * package; tests point it at a local checkout.
 */
export function generateTemplate(
  kind: TemplateKind,
  options: { readonly importSource?: string } = {},
): TemplateFiles {
  return TEMPLATES[kind](options.importSource ?? "jsr:@ubernaut/deno-tui");
}
