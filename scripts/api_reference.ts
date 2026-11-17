import { runtimeHost } from "../src/runtime/host.ts";
import { type ApiInventory, type ApiModuleInventory, createApiInventory } from "./api_inventory.ts";
import { type ApiStabilityTier, packageEntrypoints, type PackageRuntime } from "../src/api_stability.ts";
import { textWidth } from "../src/utils/strings.ts";

export interface ApiReferenceMarkdownOptions {
  title?: string;
}

export interface PackageApiReferenceSection {
  specifier: string;
  path: string;
  runtime: PackageRuntime;
  stability: ApiStabilityTier;
  description: string;
  inventory: ApiInventory;
}

interface ApiModuleReference {
  inventory: ApiModuleInventory;
  entrypoints?: string[];
}

export function formatApiReferenceMarkdown(
  inventory: ApiInventory,
  options: ApiReferenceMarkdownOptions = {},
): string {
  const lines = [
    `# ${options.title ?? "API Reference"}`,
    "",
    "This document is generated from the public re-export graph rooted at `mod.ts`. It is intended as a complete",
    "map of the modules and exported symbols that make up the package API.",
    "",
    "## Summary",
    "",
    ...inventorySummary(inventory),
    "",
  ];
  const modules = inventory.modules.map((module) => ({ inventory: module }));
  appendModuleIndex(lines, modules, 2);
  appendModuleDetails(lines, modules, 2);
  appendInventoryIssues(lines, inventory, 2);
  return lines.join("\n").trimEnd() + "\n";
}

export function formatPackageApiReferenceMarkdown(
  sections: readonly PackageApiReferenceSection[],
  options: ApiReferenceMarkdownOptions = {},
): string {
  const modules = collectPackageModuleReferences(sections);
  const visits = sections.reduce(
    (total, section) => ({
      modules: total.modules + section.inventory.modules.length,
      exports: total.exports + section.inventory.exportCount,
      symbols: total.symbols + section.inventory.symbolCount,
      duplicates: total.duplicates + Object.keys(section.inventory.duplicateSymbols).length,
      missing: total.missing + section.inventory.missingTargets.length,
    }),
    { modules: 0, exports: 0, symbols: 0, duplicates: 0, missing: 0 },
  );
  const unique = modules.reduce(
    (total, reference) => ({
      exports: total.exports + reference.inventory.exports.length,
      symbols: total.symbols + reference.inventory.symbols.length,
      documented: total.documented + reference.inventory.symbols.filter((symbol) => symbol.documented).length,
    }),
    { exports: 0, symbols: 0, documented: 0 },
  );
  const lines = [
    `# ${options.title ?? "API Reference"}`,
    "",
    "This document is generated from every public package entrypoint in the Deno export map. Entrypoint contracts remain",
    "separate while shared module declarations are listed once with explicit entrypoint membership.",
    "",
    "## Summary",
    "",
    `- Entrypoints: ${sections.length}`,
    `- Unique modules: ${modules.length}`,
    `- Module visits: ${visits.modules}`,
    `- Unique re-export declarations: ${unique.exports}`,
    `- Re-export declaration visits: ${visits.exports}`,
    `- Unique symbol declarations: ${unique.symbols}`,
    `- Symbol declaration visits: ${visits.symbols}`,
    `- Documented symbol declarations: ${unique.documented}`,
    `- Documentation coverage: ${formatPercent(unique.symbols === 0 ? 1 : unique.documented / unique.symbols)}`,
    `- Duplicate symbol groups: ${visits.duplicates}`,
    `- Missing targets: ${visits.missing}`,
    "",
    "## Entrypoints",
    "",
    ...formatMarkdownTable(
      ["Specifier", "Path", "Runtime", "Stability", "Modules", "Symbols", "Docs"],
      ["left", "left", "left", "left", "right", "right", "right"],
      sections.map((section) => [
        markdownCode(section.specifier),
        markdownCode(section.path),
        section.runtime,
        section.stability,
        String(section.inventory.modules.length),
        String(section.inventory.symbolCount),
        formatPercent(section.inventory.documentationCoverage),
      ]),
    ),
  ];

  for (const section of sections) {
    lines.push(
      "",
      `## Entrypoint ${section.specifier}`,
      "",
      section.description,
      "",
      `- Path: ${markdownCode(section.path)}`,
      `- Runtime: ${section.runtime}`,
      `- Stability: ${section.stability}`,
      ...inventorySummary(section.inventory, false),
    );
    appendInventoryIssues(lines, section.inventory, 3);
  }

  lines.push("");
  appendModuleIndex(lines, modules, 2, "Module Catalog");
  appendModuleDetails(lines, modules, 2, "Module Details");
  return lines.join("\n").trimEnd() + "\n";
}

export async function createPackageApiReferenceSections(): Promise<PackageApiReferenceSection[]> {
  const sections: PackageApiReferenceSection[] = [];
  for (const entrypoint of packageEntrypoints) {
    sections.push({
      specifier: entrypoint.specifier,
      path: entrypoint.path,
      runtime: entrypoint.runtime,
      stability: entrypoint.stability,
      description: entrypoint.description,
      inventory: await createApiInventory(entrypoint.path.replace(/^\.\//, "")),
    });
  }
  return sections;
}

function inventorySummary(inventory: ApiInventory, includeEntrypoint = true): string[] {
  const lines: string[] = [];
  if (includeEntrypoint) lines.push(`- Entrypoint: ${markdownCode(inventory.entrypoint)}`);
  lines.push(
    `- Modules: ${inventory.modules.length}`,
    `- Re-export declarations: ${inventory.exportCount}`,
    `- Exported symbols: ${inventory.symbolCount}`,
    `- Documented symbols: ${inventory.documentedSymbolCount}`,
    `- Documentation coverage: ${formatPercent(inventory.documentationCoverage)}`,
    `- Duplicate symbols: ${Object.keys(inventory.duplicateSymbols).length}`,
    `- Missing targets: ${inventory.missingTargets.length}`,
  );
  return lines;
}

function appendModuleIndex(
  lines: string[],
  modules: readonly ApiModuleReference[],
  headingLevel: number,
  title = "Module Index",
): void {
  const heading = "#".repeat(headingLevel);
  const includesEntrypoints = modules.some((reference) => reference.entrypoints !== undefined);
  const rows: string[][] = [];
  for (const reference of modules) {
    const module = reference.inventory;
    const row = [`[${markdownCode(module.module)}](#${moduleAnchor(module.module)})`];
    if (includesEntrypoints) {
      row.push(reference.entrypoints?.map(markdownCode).join(", ") ?? "-");
    }
    row.push(
      String(module.exports.length),
      String(module.symbols.length),
      String(module.symbols.filter((symbol) => symbol.documented).length),
    );
    rows.push(row);
  }
  const headers = includesEntrypoints
    ? ["Module", "Entrypoints", "Re-exports", "Symbols", "Documented"]
    : ["Module", "Re-exports", "Symbols", "Documented"];
  const aligns: MarkdownTableAlign[] = includesEntrypoints
    ? ["left", "left", "right", "right", "right"]
    : ["left", "right", "right", "right"];
  lines.push(`${heading} ${title}`, "", ...formatMarkdownTable(headers, aligns, rows), "");
}

function appendModuleDetails(
  lines: string[],
  modules: readonly ApiModuleReference[],
  headingLevel: number,
  title = "Modules",
): void {
  const heading = "#".repeat(headingLevel);
  lines.push(`${heading} ${title}`, "");
  for (const reference of modules) {
    const module = reference.inventory;
    lines.push(`${heading}# ${module.module}`, "");
    if (reference.entrypoints) {
      lines.push(`_Entrypoints: ${reference.entrypoints.map(markdownCode).join(", ")}_`, "");
    }
    appendModuleExports(lines, module);
    appendModuleSymbols(lines, module);
  }
}

function appendModuleExports(lines: string[], module: ApiModuleInventory): void {
  if (module.exports.length === 0) return;
  const rows = module.exports.map((declaration) => [
    markdownCode(declaration.target),
    declaration.kind,
    declaration.names.length > 0 ? declaration.names.map(markdownCode).join(", ") : "-",
  ]);
  lines.push(...formatMarkdownTable(["Re-export Target", "Kind", "Names"], ["left", "left", "left"], rows), "");
}

function appendModuleSymbols(lines: string[], module: ApiModuleInventory): void {
  if (module.symbols.length === 0) {
    lines.push("_No direct exported symbols._", "");
    return;
  }
  const rows = module.symbols.map((symbol) => [
    markdownCode(symbol.name),
    symbol.kind,
    symbol.typeOnly ? "yes" : "no",
    symbol.documented ? "yes" : "no",
  ]);
  lines.push(
    ...formatMarkdownTable(["Symbol", "Kind", "Type Only", "JSDoc"], ["left", "left", "left", "left"], rows),
    "",
  );
}

function appendInventoryIssues(lines: string[], inventory: ApiInventory, headingLevel: number): void {
  const heading = "#".repeat(headingLevel);
  if (Object.keys(inventory.duplicateSymbols).length > 0) {
    lines.push(`${heading} Duplicate Symbols`, "");
    for (const [name, modules] of Object.entries(inventory.duplicateSymbols)) {
      lines.push(`- ${markdownCode(name)}: ${modules.map(markdownCode).join(", ")}`);
    }
    lines.push("");
  }
  if (inventory.missingTargets.length > 0) {
    lines.push(`${heading} Missing Targets`, "");
    for (const target of inventory.missingTargets) lines.push(`- ${markdownCode(target)}`);
    lines.push("");
  }
}

function collectPackageModuleReferences(sections: readonly PackageApiReferenceSection[]): ApiModuleReference[] {
  const references = new Map<string, ApiModuleReference>();
  for (const section of sections) {
    for (const module of section.inventory.modules) {
      const existing = references.get(module.module);
      if (existing) {
        const entrypoints = existing.entrypoints ?? (existing.entrypoints = []);
        if (!entrypoints.includes(section.specifier)) entrypoints.push(section.specifier);
      } else {
        references.set(module.module, { inventory: module, entrypoints: [section.specifier] });
      }
    }
  }
  return [...references.values()].sort((a, b) => a.inventory.module.localeCompare(b.inventory.module));
}

function moduleAnchor(module: string): string {
  return module.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function markdownCode(value: string): string {
  return `\`${escapeMarkdown(value)}\``;
}

function escapeMarkdown(value: string): string {
  return value.replaceAll("|", "\\|");
}

type MarkdownTableAlign = "left" | "right";

function formatMarkdownTable(
  headers: readonly string[],
  aligns: readonly MarkdownTableAlign[],
  rows: readonly (readonly string[])[],
): string[] {
  const widths = headers.map((header, index) =>
    Math.max(textWidth(header), ...rows.map((row) => textWidth(row[index] ?? "")), 3)
  );
  const output = [
    `| ${
      headers.map((header, index) => padMarkdownCell(header, widths[index]!, aligns[index] ?? "left")).join(" | ")
    } |`,
    `| ${
      widths.map((width, index) => {
        const align = aligns[index] ?? "left";
        const dashes = "-".repeat(Math.max(3, width - (align === "right" ? 1 : 0)));
        return align === "right" ? `${dashes}:` : dashes;
      }).join(" | ")
    } |`,
  ];
  for (const row of rows) {
    output.push(
      `| ${
        headers.map((_, index) => padMarkdownCell(row[index] ?? "", widths[index]!, aligns[index] ?? "left")).join(
          " | ",
        )
      } |`,
    );
  }
  return output;
}

function padMarkdownCell(value: string, width: number, align: MarkdownTableAlign): string {
  const padding = " ".repeat(Math.max(0, width - textWidth(value)));
  return align === "right" ? `${padding}${value}` : `${value}${padding}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

if (import.meta.main) {
  const checkArgument = runtimeHost.args.find((arg) => arg.startsWith("--check="));
  const checkPath = checkArgument?.slice("--check=".length);
  if (checkArgument && !checkPath) {
    console.error("--check requires a file path");
    runtimeHost.exit(2);
  }
  const entrypoint = runtimeHost.args.find((arg) => !arg.startsWith("--")) ?? "mod.ts";
  let markdown: string;
  if (runtimeHost.args.includes("--single") || runtimeHost.args.some((arg) => !arg.startsWith("--"))) {
    const inventory = await createApiInventory(entrypoint);
    markdown = formatApiReferenceMarkdown(inventory);
  } else {
    markdown = formatPackageApiReferenceMarkdown(await createPackageApiReferenceSections());
  }
  if (checkPath) {
    if (await runtimeHost.readTextFile(checkPath) !== markdown) {
      console.error(`${checkPath} is stale; regenerate it with deno task api-reference`);
      runtimeHost.exit(1);
    }
  } else {
    await runtimeHost.stdout.write(new TextEncoder().encode(markdown));
  }
}
