import { assertEquals } from "./deps.ts";
import {
  type ApiInventory,
  createApiInventory,
  createApiInventoryBaseline,
  diffApiInventories,
  diffApiInventoryBaseline,
  formatApiInventory,
  formatApiInventoryBaseline,
  formatApiInventoryDiff,
  inventorySucceeded,
  maskLiteralText,
  parseApiExports,
  parseApiInventoryCliArgs,
  parseApiSymbols,
} from "../scripts/api_inventory.ts";
import {
  formatApiReferenceMarkdown,
  formatPackageApiReferenceMarkdown,
  type PackageApiReferenceSection,
} from "../scripts/api_reference.ts";

Deno.test("a module that carries source code as data does not export that data", () => {
  // src/tooling/init_templates.ts embeds whole scaffolded projects as
  // template literals. Before the mask, the scanner read the embedded
  // `export function createApp()` as a second real `createApp` and the
  // interpolated specifier as a module that does not exist on disk.
  const source = [
    "/** The real one. */",
    "export const TEMPLATES = {",
    "  terminal: (importSource: string) => ({",
    '    "main.ts": `export function createApp() {',
    "  return 1;",
    "}",
    "`,",
    '    "mod.ts": `export * from "${importSource}/generated.ts";`,',
    "  }),",
    "};",
  ].join("\n");

  assertEquals(parseApiSymbols(source, "src/tooling/init_templates.ts").map((symbol) => symbol.name), [
    "TEMPLATES",
  ]);
  assertEquals(parseApiExports(source, "src/tooling/init_templates.ts"), []);
});

Deno.test("masking keeps every offset, and specifiers when the caller needs them", () => {
  const source = 'const a = "one";\nconst b = `two`;\n';
  const masked = maskLiteralText(source);
  assertEquals(masked.length, source.length);
  assertEquals(masked, 'const a = "   ";\nconst b = `   `;\n');

  // The re-export scanner reads the quoted specifier, so only templates blank.
  assertEquals(
    maskLiteralText(source, { templateLiteralsOnly: true }),
    'const a = "one";\nconst b = `   `;\n',
  );
});

Deno.test("a quote or backtick inside a comment or regex cannot open a literal", () => {
  // A single lexer slip here silently blanks the rest of the file, which is
  // how the first attempt at this mask reduced a 4,231-symbol inventory to 1.
  const source = [
    "// don't let this apostrophe open a string",
    "const pattern = /['\"`]/;",
    "/* a ` in a block comment */",
    "export const kept = 1;",
  ].join("\n");

  assertEquals(parseApiSymbols(source, "src/x.ts").map((symbol) => symbol.name), ["kept"]);
});

Deno.test("parseApiExports extracts star named and type re-exports", () => {
  assertEquals(
    parseApiExports(
      [
        `export * from "./src/app/mod.ts";`,
        `export { Button, type ButtonOptions as Options } from "./src/components/button.ts";`,
        `export type { Theme, ThemeState } from "./src/theme.ts";`,
        `export const local = 1;`,
      ].join("\n"),
      "mod.ts",
    ),
    [
      { module: "mod.ts", target: "src/app/mod.ts", kind: "star", names: [] },
      {
        module: "mod.ts",
        target: "src/components/button.ts",
        kind: "named",
        names: ["Button", "ButtonOptions"],
      },
      {
        module: "mod.ts",
        target: "src/theme.ts",
        kind: "named",
        names: ["type Theme", "type ThemeState"],
      },
    ],
  );
});

Deno.test("parseApiSymbols extracts public declarations and local named exports", () => {
  assertEquals(
    parseApiSymbols(
      [
        `export class Button {}`,
        `/** Button configuration. */`,
        `export interface ButtonOptions {}`,
        `export type ButtonState = "base";`,
        `export const buttonKinds = [];`,
        `export let mutableButton = 1;`,
        `export function renderButton() {}`,
        `export enum ButtonMode { Primary }`,
        `const internal = 1;`,
        `type InternalType = string;`,
        `export { internal as exposedInternal, type InternalType as ExposedType };`,
        `export { Other } from "./other.ts";`,
      ].join("\n"),
      "src/components/button.ts",
    ),
    [
      { module: "src/components/button.ts", name: "Button", kind: "class", typeOnly: false, documented: false },
      { module: "src/components/button.ts", name: "buttonKinds", kind: "const", typeOnly: false, documented: false },
      { module: "src/components/button.ts", name: "ButtonMode", kind: "enum", typeOnly: false, documented: false },
      {
        module: "src/components/button.ts",
        name: "ButtonOptions",
        kind: "interface",
        typeOnly: true,
        documented: true,
      },
      { module: "src/components/button.ts", name: "ButtonState", kind: "type", typeOnly: true, documented: false },
      {
        module: "src/components/button.ts",
        name: "exposedInternal",
        kind: "variable",
        typeOnly: false,
        documented: false,
      },
      { module: "src/components/button.ts", name: "ExposedType", kind: "type", typeOnly: true, documented: false },
      {
        module: "src/components/button.ts",
        name: "mutableButton",
        kind: "variable",
        typeOnly: false,
        documented: false,
      },
      {
        module: "src/components/button.ts",
        name: "renderButton",
        kind: "function",
        typeOnly: false,
        documented: false,
      },
    ],
  );
});

Deno.test("createApiInventory crawls local re-export modules and formats results", async () => {
  const files = new Map([
    [
      "/repo/mod.ts",
      [
        `export * from "./src/components/mod.ts";`,
        `export * from "./src/runtime/mod.ts";`,
        `export * from "npm:three";`,
      ].join("\n"),
    ],
    ["/repo/src/components/mod.ts", `export * from "./button.ts";`],
    ["/repo/src/components/button.ts", `export interface ButtonOptions { label: string }`],
    ["/repo/src/runtime/mod.ts", `export { AsyncScheduler } from "./scheduler.ts";`],
    [
      "/repo/src/runtime/scheduler.ts",
      [
        `export class AsyncScheduler {}`,
        `export class InternalSchedulerProbe {}`,
      ].join("\n"),
    ],
  ]);

  const inventory = await createApiInventory("mod.ts", {
    root: "/repo",
    readTextFile: (path) => files.get(path) ?? "",
    exists: (path) => files.has(path),
  });

  assertEquals(inventory.entrypoint, "mod.ts");
  assertEquals(inventory.modules.map((module) => module.module), [
    "mod.ts",
    "src/components/button.ts",
    "src/components/mod.ts",
    "src/runtime/mod.ts",
    "src/runtime/scheduler.ts",
  ]);
  assertEquals(inventory.exportCount, 5);
  assertEquals(inventory.symbolCount, 2);
  assertEquals(inventory.documentedSymbolCount, 0);
  assertEquals(inventory.undocumentedSymbolCount, 2);
  assertEquals(inventory.documentationCoverage, 0);
  assertEquals(inventory.duplicateSymbols, {});
  assertEquals(
    inventory.modules.find((module) => module.module === "src/runtime/scheduler.ts")?.symbols.map((symbol) =>
      symbol.name
    ),
    ["AsyncScheduler"],
  );
  assertEquals(inventorySucceeded(inventory), true);
  assertEquals(inventorySucceeded(inventory, { minDocumentationCoverage: 0.1 }), false);
  assertEquals(formatApiInventory(inventory).includes("Exported symbols: 2"), true);
  assertEquals(formatApiInventory(inventory).includes("Documentation coverage: 0.0%"), true);
  assertEquals(formatApiInventory(inventory).includes("| `src/components/mod.ts` | 1 | 0 | none |"), true);
});

Deno.test("createApiInventory reports missing public export targets", async () => {
  const files = new Map([
    ["/repo/mod.ts", `export * from "./src/missing.ts";`],
  ]);
  const inventory = await createApiInventory("mod.ts", {
    root: "/repo",
    readTextFile: (path) => files.get(path) ?? "",
    exists: (path) => files.has(path),
  });

  assertEquals(inventorySucceeded(inventory), false);
  assertEquals(inventory.missingTargets, ["src/missing.ts"]);
  assertEquals(inventory.modules[0].missingTargets, ["src/missing.ts"]);
});

Deno.test("createApiInventory reports duplicate exported symbol names", async () => {
  const files = new Map([
    ["/repo/mod.ts", [`export * from "./a.ts";`, `export * from "./b.ts";`].join("\n")],
    ["/repo/a.ts", `export interface Options { a: string }`],
    ["/repo/b.ts", `export type Options = { b: string };`],
  ]);
  const inventory = await createApiInventory("mod.ts", {
    root: "/repo",
    readTextFile: (path) => files.get(path) ?? "",
    exists: (path) => files.has(path),
  });

  assertEquals(inventory.duplicateSymbols, { Options: ["a.ts", "b.ts"] });
  assertEquals(inventorySucceeded(inventory), true);
  assertEquals(inventorySucceeded(inventory, { failDuplicates: true }), false);
  assertEquals(formatApiInventory(inventory).includes("## Duplicate Symbols"), true);
});

Deno.test("api inventory diffs group symbol changes by stability tier", async () => {
  const baseline = await createApiInventory("mod.ts", {
    root: "/repo",
    readTextFile: (path) =>
      ({
        "/repo/mod.ts": `export * from "./src/widgets.ts";`,
        "/repo/src/widgets.ts": [
          `export class Button {}`,
          `export function oldHelper() {}`,
        ].join("\n"),
      })[path] ?? "",
    exists: () => true,
  });
  const current = await createApiInventory("mod.ts", {
    root: "/repo",
    readTextFile: (path) =>
      ({
        "/repo/mod.ts": `export * from "./src/widgets.ts";`,
        "/repo/src/widgets.ts": [
          `export class Button {}`,
          `export function newHelper() {}`,
        ].join("\n"),
      })[path] ?? "",
    exists: () => true,
  });

  const diff = diffApiInventories(baseline, current);
  const report = formatApiInventoryDiff(diff);

  assertEquals(diff.stability, "stable");
  assertEquals(diff.added.map((symbol) => symbol.name), ["newHelper"]);
  assertEquals(diff.removed.map((symbol) => symbol.name), ["oldHelper"]);
  assertEquals(diff.addedByStability.stable.map((symbol) => symbol.name), ["newHelper"]);
  assertEquals(diff.addedByStability.beta, []);
  assertEquals(report.includes("### stable"), true);
  assertEquals(report.includes("`newHelper`"), true);
  assertEquals(report.includes("`oldHelper`"), true);
});

Deno.test("api inventory baseline detects accidental stable export drift", async () => {
  const baselineInventory = await createApiInventory("mod.ts", {
    root: "/repo",
    readTextFile: (path) =>
      ({
        "/repo/mod.ts": `export * from "./src/widgets.ts";`,
        "/repo/src/widgets.ts": `export class Button {}`,
      })[path] ?? "",
    exists: () => true,
  });
  const current = await createApiInventory("mod.ts", {
    root: "/repo",
    readTextFile: (path) =>
      ({
        "/repo/mod.ts": `export * from "./src/widgets.ts";`,
        "/repo/src/widgets.ts": [`export class Button {}`, `export function surpriseExport() {}`].join("\n"),
      })[path] ?? "",
    exists: () => true,
  });

  const baseline = createApiInventoryBaseline(baselineInventory, { stability: "stable" });
  const formatted = formatApiInventoryBaseline(baseline);
  const diff = diffApiInventoryBaseline(baseline, current);

  assertEquals(baseline.symbols.map((symbol) => symbol.name), ["Button"]);
  assertEquals(
    formatted,
    [
      "{",
      '  "entrypoint": "mod.ts",',
      '  "stability": "stable",',
      '  "symbols": [',
      '    {"module":"src/widgets.ts","name":"Button","kind":"class","typeOnly":false,"documented":false}',
      "  ]",
      "}",
      "",
    ].join("\n"),
  );
  assertEquals(JSON.parse(formatted), baseline);
  assertEquals(diff.stability, "stable");
  assertEquals(diff.added.map((symbol) => symbol.name), ["surpriseExport"]);
  assertEquals(diff.addedByStability.stable.map((symbol) => symbol.name), ["surpriseExport"]);
  assertEquals(diff.removed, []);
});

Deno.test("api inventory cli parser validates flags before choosing an entrypoint", () => {
  assertEquals(
    parseApiInventoryCliArgs([
      "--",
      "mod.web.ts",
      "--json",
      "--check",
      "--quiet",
      "--fail-duplicates",
      "--min-doc-coverage=100",
      "--baseline=docs/api-stable-baseline.json",
    ]),
    {
      entrypoint: "mod.web.ts",
      json: true,
      check: true,
      quiet: true,
      failDuplicates: true,
      minDocumentationCoverage: 1,
      baselinePath: "docs/api-stable-baseline.json",
      updateBaselinePath: undefined,
    },
  );
});

Deno.test("api inventory cli parser rejects unknown flags and extra positionals", () => {
  assertEquals(captureCliParseError(["--format", "markdown"]), "Unknown api-inventory option: --format");
  assertEquals(captureCliParseError(["mod.ts", "markdown"]), "Unexpected api-inventory argument: markdown");
});

function referenceInventory(entrypoint: string, symbolName: string): ApiInventory {
  return {
    entrypoint,
    modules: [
      {
        module: entrypoint,
        exports: [],
        symbols: [
          {
            module: entrypoint,
            name: symbolName,
            kind: "function",
            typeOnly: false,
            documented: true,
          },
        ],
        missingTargets: [],
      },
    ],
    exportCount: 0,
    symbolCount: 1,
    documentedSymbolCount: 1,
    undocumentedSymbolCount: 0,
    documentationCoverage: 1,
    duplicateSymbols: {},
    missingTargets: [],
  };
}

Deno.test("formatApiReferenceMarkdown preserves the single-entrypoint report", () => {
  const markdown = formatApiReferenceMarkdown(referenceInventory("mod.ts", "Tui"));
  assertEquals(markdown.includes("Entrypoint: `mod.ts`"), true);
  assertEquals(markdown.includes("`Tui`"), true);
});

Deno.test("formatPackageApiReferenceMarkdown groups public entrypoints by stability", () => {
  const sections: PackageApiReferenceSection[] = [
    {
      specifier: ".",
      path: "./mod.ts",
      runtime: "terminal",
      stability: "stable",
      description: "Terminal package.",
      inventory: referenceInventory("mod.ts", "Tui"),
    },
    {
      specifier: "./web",
      path: "./mod.web.ts",
      runtime: "browser",
      stability: "beta",
      description: "Browser package.",
      inventory: referenceInventory("mod.web.ts", "createWebTui"),
    },
  ];
  const sharedModule = referenceInventory("shared.ts", "Shared").modules[0]!;
  for (const section of sections) {
    section.inventory.modules.push(sharedModule);
    section.inventory.symbolCount += 1;
    section.inventory.documentedSymbolCount += 1;
  }

  const markdown = formatPackageApiReferenceMarkdown(sections);
  assertEquals(markdown.includes("Entrypoints: 2"), true);
  assertEquals(markdown.includes("Unique modules: 3"), true);
  assertEquals(markdown.includes("Module visits: 4"), true);
  assertEquals(markdown.includes("`./mod.ts`"), true);
  assertEquals(markdown.includes("terminal"), true);
  assertEquals(markdown.includes("stable"), true);
  assertEquals(markdown.includes("`./mod.web.ts`"), true);
  assertEquals(markdown.includes("browser"), true);
  assertEquals(markdown.includes("beta"), true);
  assertEquals(markdown.includes("## Entrypoint ./web"), true);
  assertEquals(markdown.includes("`createWebTui`"), true);
  assertEquals(markdown.match(/^### shared\.ts$/gm)?.length, 1);
  assertEquals(markdown.match(/`Shared`/g)?.length, 1);
  assertEquals(markdown.includes("_Entrypoints: `.`, `./web`_"), true);
});

function captureCliParseError(args: readonly string[]): string {
  try {
    parseApiInventoryCliArgs(args);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}
