import { type ApiStabilityTier, packageEntrypointFor } from "../src/api_stability.ts";

export type ApiExportKind = "star" | "named";
export type ApiSymbolKind =
  | "class"
  | "const"
  | "enum"
  | "function"
  | "interface"
  | "type"
  | "variable";

export interface ApiExportDeclaration {
  module: string;
  target: string;
  kind: ApiExportKind;
  names: string[];
}

export interface ApiSymbolDeclaration {
  module: string;
  name: string;
  kind: ApiSymbolKind;
  typeOnly: boolean;
  documented: boolean;
}

export interface ApiModuleInventory {
  module: string;
  exports: ApiExportDeclaration[];
  symbols: ApiSymbolDeclaration[];
  missingTargets: string[];
}

export interface ApiInventory {
  entrypoint: string;
  modules: ApiModuleInventory[];
  exportCount: number;
  symbolCount: number;
  documentedSymbolCount: number;
  undocumentedSymbolCount: number;
  documentationCoverage: number;
  duplicateSymbols: Record<string, string[]>;
  missingTargets: string[];
}

export interface ApiInventoryOptions {
  root?: string;
  readTextFile?: (path: string) => string | Promise<string>;
  exists?: (path: string) => boolean | Promise<boolean>;
}

export interface ApiInventorySuccessOptions {
  failDuplicates?: boolean;
  minDocumentationCoverage?: number;
}

export interface ApiInventoryCliOptions {
  entrypoint: string;
  json: boolean;
  check: boolean;
  quiet: boolean;
  failDuplicates: boolean;
  minDocumentationCoverage?: number;
  baselinePath?: string;
  updateBaselinePath?: string;
}

export interface ApiInventorySymbolChange {
  module: string;
  name: string;
  kind: ApiSymbolKind;
  typeOnly: boolean;
  documented: boolean;
}

export interface ApiInventoryDiff {
  entrypoint: string;
  stability: ApiStabilityTier;
  added: ApiInventorySymbolChange[];
  removed: ApiInventorySymbolChange[];
  addedByStability: Record<ApiStabilityTier, ApiInventorySymbolChange[]>;
  removedByStability: Record<ApiStabilityTier, ApiInventorySymbolChange[]>;
}

export interface ApiInventoryBaseline {
  entrypoint: string;
  stability: ApiStabilityTier;
  symbols: ApiInventorySymbolChange[];
}

export const apiStabilityTiers: readonly ApiStabilityTier[] = ["stable", "beta", "experimental", "internal"];

/**
 * Blanks the *contents* of literals, leaving every other character — and
 * therefore every offset — where it was.
 *
 * The patterns below are regexes over raw source, so a module that
 * carries source code as data was reporting that data as its own API.
 * `src/tooling/init_templates.ts` embeds four whole scaffolded projects
 * as template literals, which is why the inventory saw a second
 * `createApp` and a re-export target of `src/tooling/${name.replaceAll(.ts`.
 *
 * `templateLiteralsOnly` exists because the two scanners need different
 * things: the symbol scanner never reads a literal, but the re-export
 * scanner reads the quoted specifier, and blanking those leaves the
 * crawl with no modules at all. Every literal kind is still *tracked*
 * either way, so a backtick inside an ordinary string cannot open a
 * phantom template. Comments are tracked but left intact, because
 * `hasLeadingJSDoc` reads the original source at the offsets this
 * function preserves.
 */
export function maskLiteralText(
  source: string,
  options: { readonly templateLiteralsOnly?: boolean } = {},
): string {
  const templateLiteralsOnly = options.templateLiteralsOnly ?? false;
  const masked = source.split("");
  const suspendedDepths: number[] = [];
  let state: "code" | "line-comment" | "block-comment" | "'" | '"' | "`" | "/" = "code";
  let braceDepth = 0;
  let index = 0;

  while (index < source.length) {
    const char = source[index]!;
    const next = source[index + 1];

    if (state === "code") {
      if (char === "/" && next === "/") {
        state = "line-comment";
        index += 2;
      } else if (char === "/" && next === "*") {
        state = "block-comment";
        index += 2;
      } else if (char === "/" && startsRegexLiteral(source, index)) {
        state = "/";
        index += 1;
      } else if (char === '"' || char === "'" || char === "`") {
        state = char;
        index += 1;
      } else {
        if (char === "{") braceDepth += 1;
        else if (char === "}") {
          if (braceDepth === 0 && suspendedDepths.length > 0) {
            braceDepth = suspendedDepths.pop()!;
            state = "`";
            index += 1;
            continue;
          }
          braceDepth = Math.max(0, braceDepth - 1);
        }
        index += 1;
      }
      continue;
    }

    if (state === "line-comment") {
      if (char === "\n") state = "code";
      index += 1;
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        state = "code";
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    // Inside a literal: mask everything but the delimiters and newlines.
    if (char === "\\") {
      if (blanking(state)) {
        masked[index] = " ";
        if (index + 1 < source.length && source[index + 1] !== "\n") masked[index + 1] = " ";
      }
      index += 2;
      continue;
    }
    if (char === state) {
      state = "code";
      index += 1;
      continue;
    }
    if (state === "`" && char === "$" && next === "{") {
      suspendedDepths.push(braceDepth);
      braceDepth = 0;
      state = "code";
      index += 2;
      continue;
    }
    if (state === "/" && char === "\n") {
      // An unterminated regex means the `/` was division; recover rather than
      // swallowing the rest of the file.
      state = "code";
      index += 1;
      continue;
    }
    if (char !== "\n" && blanking(state)) masked[index] = " ";
    index += 1;
  }

  return masked.join("");

  function blanking(current: typeof state): boolean {
    return !templateLiteralsOnly || current === "`";
  }
}

/** True when a `/` at `index` opens a regex literal rather than dividing. */
function startsRegexLiteral(source: string, index: number): boolean {
  for (let scan = index - 1; scan >= 0; scan -= 1) {
    const char = source[scan]!;
    if (char === " " || char === "\t" || char === "\r" || char === "\n") continue;
    // Division follows a value; a regex follows an operator, keyword, or nothing.
    return !/[\w$)\]]/.test(char);
  }
  return true;
}

export function parseApiExports(source: string, module: string): ApiExportDeclaration[] {
  const exports: ApiExportDeclaration[] = [];
  const scanned = maskLiteralText(source, { templateLiteralsOnly: true });
  const declarationPattern = /export\s+(?:(type)\s+)?(?:(\*)|\{([\s\S]*?)\})\s+from\s+["']([^"']+)["'];?/g;

  for (const match of scanned.matchAll(declarationPattern)) {
    const [, typeOnly, star, namesSource, target] = match;
    if (!target) continue;
    exports.push({
      module,
      target: normalizeModuleTarget(module, target),
      kind: star ? "star" : "named",
      names: star ? [] : parseExportNames(namesSource ?? "", typeOnly === "type"),
    });
  }

  return exports;
}

export function parseApiSymbols(source: string, module: string): ApiSymbolDeclaration[] {
  const symbols: ApiSymbolDeclaration[] = [];
  const scanned = maskLiteralText(source);
  const declarationPattern =
    /export\s+(?:(declare)\s+)?(?:(async)\s+)?(class|function|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  const namedExportPattern = /export\s+\{([\s\S]*?)\}(?!\s+from\s+["'])/g;

  for (const match of scanned.matchAll(declarationPattern)) {
    const [, , , rawKind, name] = match;
    const kind = normalizeSymbolKind(rawKind);
    symbols.push({
      module,
      name,
      kind,
      typeOnly: kind === "interface" || kind === "type",
      documented: hasLeadingJSDoc(source, match.index ?? 0),
    });
  }

  for (const match of scanned.matchAll(namedExportPattern)) {
    for (const part of (match[1] ?? "").split(",")) {
      const parsed = parseNamedSymbol(part);
      if (!parsed) continue;
      symbols.push({
        module,
        name: parsed.name,
        kind: parsed.typeOnly ? "type" : "variable",
        typeOnly: parsed.typeOnly,
        documented: hasLeadingJSDoc(source, match.index ?? 0),
      });
    }
  }

  return uniqueSymbols(symbols);
}

export async function createApiInventory(
  entrypoint = "mod.ts",
  options: ApiInventoryOptions = {},
): Promise<ApiInventory> {
  const root = options.root ?? Deno.cwd();
  const readTextFile = options.readTextFile ?? ((path: string) => Deno.readTextFile(path));
  const exists = options.exists ?? existsOnDisk;
  const normalizedEntrypoint = normalizeModulePath(entrypoint);
  const queue = [normalizedEntrypoint];
  const selections = new Map<string, ApiSymbolSelection>([[normalizedEntrypoint, "all"]]);
  const processedSelections = new Map<string, string>();
  const parsedModules = new Map<string, Omit<ApiModuleInventory, "missingTargets">>();
  const missingTargetsByModule = new Map<string, Set<string>>();

  while (queue.length > 0) {
    const module = queue.shift()!;
    const selection = selections.get(module)!;
    const signature = selectionSignature(selection);
    if (processedSelections.get(module) === signature) continue;
    processedSelections.set(module, signature);

    let parsed = parsedModules.get(module);
    if (!parsed) {
      const source = await readTextFile(joinPath(root, module));
      parsed = {
        module,
        exports: parseApiExports(source, module),
        symbols: parseApiSymbols(source, module),
      };
      parsedModules.set(module, parsed);
    }

    for (const declaration of parsed.exports) {
      const targetSelection = selectionForExport(selection, declaration);
      if (!targetSelection) continue;
      if (!isLocalTypeScriptModule(declaration.target)) continue;
      const targetPath = normalizeModulePath(declaration.target);
      if (!(await exists(joinPath(root, targetPath)))) {
        const missing = missingTargetsByModule.get(module) ?? new Set<string>();
        missing.add(targetPath);
        missingTargetsByModule.set(module, missing);
        continue;
      }
      if (mergeSymbolSelection(selections, targetPath, targetSelection)) queue.push(targetPath);
    }
  }

  const modules: ApiModuleInventory[] = [];
  for (const [module, parsed] of parsedModules) {
    const selection = selections.get(module)!;
    modules.push({
      module,
      exports: parsed.exports.filter((declaration) => selectionForExport(selection, declaration) !== undefined),
      symbols: selection === "all" ? parsed.symbols : parsed.symbols.filter((symbol) => selection.has(symbol.name)),
      missingTargets: [...(missingTargetsByModule.get(module) ?? [])].sort(),
    });
  }
  const sortedModules = modules.sort((left, right) => left.module.localeCompare(right.module));
  const missingTargets = [...new Set(modules.flatMap((module) => module.missingTargets))].sort();
  const symbolCount = modules.reduce((total, module) => total + module.symbols.length, 0);
  const documentedSymbolCount = modules.reduce(
    (total, module) => total + module.symbols.filter((symbol) => symbol.documented).length,
    0,
  );
  return {
    entrypoint: normalizedEntrypoint,
    modules: sortedModules,
    exportCount: modules.reduce((total, module) => total + module.exports.length, 0),
    symbolCount,
    documentedSymbolCount,
    undocumentedSymbolCount: symbolCount - documentedSymbolCount,
    documentationCoverage: symbolCount === 0 ? 1 : documentedSymbolCount / symbolCount,
    duplicateSymbols: duplicateApiSymbols(sortedModules),
    missingTargets,
  };
}

type ApiSymbolSelection = "all" | Set<string>;

function selectionForExport(
  selection: ApiSymbolSelection,
  declaration: ApiExportDeclaration,
): ApiSymbolSelection | undefined {
  if (declaration.kind === "star") {
    return selection === "all" ? "all" : new Set(selection);
  }
  const declaredNames = new Set(declaration.names.map(normalizeExportSelectionName));
  if (selection === "all") return declaredNames;
  const intersection = new Set<string>();
  for (const name of selection) {
    if (declaredNames.has(name)) intersection.add(name);
  }
  return intersection.size > 0 ? intersection : undefined;
}

function mergeSymbolSelection(
  selections: Map<string, ApiSymbolSelection>,
  module: string,
  incoming: ApiSymbolSelection,
): boolean {
  const current = selections.get(module);
  if (current === "all") return false;
  if (incoming === "all") {
    selections.set(module, "all");
    return true;
  }
  if (!current) {
    selections.set(module, new Set(incoming));
    return true;
  }
  let changed = false;
  for (const name of incoming) {
    if (current.has(name)) continue;
    current.add(name);
    changed = true;
  }
  return changed;
}

function selectionSignature(selection: ApiSymbolSelection): string {
  return selection === "all" ? "*" : [...selection].sort().join("\0");
}

function normalizeExportSelectionName(name: string): string {
  return name.replace(/^type\s+/, "");
}

export function formatApiInventory(inventory: ApiInventory): string {
  const lines = [
    `# API Inventory`,
    ``,
    `Entrypoint: \`${inventory.entrypoint}\``,
    `Modules: ${inventory.modules.length}`,
    `Re-export declarations: ${inventory.exportCount}`,
    `Exported symbols: ${inventory.symbolCount}`,
    `Documented symbols: ${inventory.documentedSymbolCount}`,
    `Documentation coverage: ${formatPercent(inventory.documentationCoverage)}`,
    `Duplicate symbols: ${Object.keys(inventory.duplicateSymbols).length}`,
    `Missing targets: ${inventory.missingTargets.length}`,
    ``,
    `| Module | Re-exports | Symbols | Missing Targets |`,
    `| ------ | ---------- | ------- | --------------- |`,
  ];

  for (const module of inventory.modules) {
    lines.push(
      `| \`${module.module}\` | ${module.exports.length} | ${module.symbols.length} | ${
        module.missingTargets.length === 0 ? "none" : module.missingTargets.map((target) => `\`${target}\``).join(", ")
      } |`,
    );
  }

  if (Object.keys(inventory.duplicateSymbols).length > 0) {
    lines.push("", "## Duplicate Symbols", "");
    for (const [name, modules] of Object.entries(inventory.duplicateSymbols)) {
      lines.push(`- \`${name}\`: ${modules.map((module) => `\`${module}\``).join(", ")}`);
    }
  }

  return lines.join("\n");
}

export function inventorySucceeded(
  inventory: ApiInventory,
  options: ApiInventorySuccessOptions = {},
): boolean {
  return inventory.missingTargets.length === 0 &&
    (!(options.failDuplicates ?? false) || Object.keys(inventory.duplicateSymbols).length === 0) &&
    inventory.documentationCoverage >= (options.minDocumentationCoverage ?? 0);
}

export function diffApiInventories(
  baseline: ApiInventory,
  current: ApiInventory,
  options: { stability?: ApiStabilityTier } = {},
): ApiInventoryDiff {
  const stability = options.stability ?? inventoryEntrypointStability(current.entrypoint);
  const baselineSymbols = symbolMap(baseline);
  const currentSymbols = symbolMap(current);
  const added = [...currentSymbols.entries()]
    .filter(([key]) => !baselineSymbols.has(key))
    .map(([, symbol]) => symbol)
    .sort(compareSymbolChanges);
  const removed = [...baselineSymbols.entries()]
    .filter(([key]) => !currentSymbols.has(key))
    .map(([, symbol]) => symbol)
    .sort(compareSymbolChanges);

  return {
    entrypoint: current.entrypoint,
    stability,
    added,
    removed,
    addedByStability: groupChangesByStability(added, stability),
    removedByStability: groupChangesByStability(removed, stability),
  };
}

export function createApiInventoryBaseline(
  inventory: ApiInventory,
  options: { stability?: ApiStabilityTier } = {},
): ApiInventoryBaseline {
  return {
    entrypoint: inventory.entrypoint,
    stability: options.stability ?? inventoryEntrypointStability(inventory.entrypoint),
    symbols: [...symbolMap(inventory).values()].sort(compareSymbolChanges),
  };
}

export function formatApiInventoryBaseline(baseline: ApiInventoryBaseline): string {
  const symbols = baseline.symbols.toSorted(compareSymbolChanges);
  const lines = [
    "{",
    `  "entrypoint": ${JSON.stringify(baseline.entrypoint)},`,
    `  "stability": ${JSON.stringify(baseline.stability)},`,
    '  "symbols": [',
  ];
  for (let index = 0; index < symbols.length; index += 1) {
    const symbol = symbols[index]!;
    const suffix = index + 1 < symbols.length ? "," : "";
    lines.push(`    ${
      JSON.stringify({
        module: symbol.module,
        name: symbol.name,
        kind: symbol.kind,
        typeOnly: symbol.typeOnly,
        documented: symbol.documented,
      })
    }${suffix}`);
  }
  lines.push("  ]", "}", "");
  return lines.join("\n");
}

export function diffApiInventoryBaseline(
  baseline: ApiInventoryBaseline,
  current: ApiInventory,
): ApiInventoryDiff {
  const baselineSymbols = new Map(baseline.symbols.map((symbol) => [symbolKey(symbol), symbol]));
  const currentSymbols = symbolMap(current);
  const added = [...currentSymbols.entries()]
    .filter(([key]) => !baselineSymbols.has(key))
    .map(([, symbol]) => symbol)
    .sort(compareSymbolChanges);
  const removed = [...baselineSymbols.entries()]
    .filter(([key]) => !currentSymbols.has(key))
    .map(([, symbol]) => symbol)
    .sort(compareSymbolChanges);

  return {
    entrypoint: current.entrypoint,
    stability: baseline.stability,
    added,
    removed,
    addedByStability: groupChangesByStability(added, baseline.stability),
    removedByStability: groupChangesByStability(removed, baseline.stability),
  };
}

export function formatApiInventoryDiff(diff: ApiInventoryDiff): string {
  const lines = [
    "# API Inventory Diff",
    "",
    `Entrypoint: \`${diff.entrypoint}\``,
    `Stability: ${diff.stability}`,
    `Added symbols: ${diff.added.length}`,
    `Removed symbols: ${diff.removed.length}`,
  ];

  for (
    const section of [
      { title: "Added", grouped: diff.addedByStability },
      { title: "Removed", grouped: diff.removedByStability },
    ]
  ) {
    lines.push("", `## ${section.title}`, "");
    let wroteAny = false;
    for (const tier of apiStabilityTiers) {
      const symbols = section.grouped[tier];
      if (symbols.length === 0) continue;
      wroteAny = true;
      lines.push(`### ${tier}`, "");
      for (const symbol of symbols) {
        lines.push(`- \`${symbol.name}\` (${symbol.kind}) from \`${symbol.module}\``);
      }
      lines.push("");
    }
    if (!wroteAny) lines.push("none");
  }

  return lines.join("\n").trimEnd();
}

function parseExportNames(source: string, typeOnly: boolean): string[] {
  return source
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => part.replace(/^type\s+/, ""))
    .map((part) => part.split(/\s+as\s+/)[0].trim())
    .map((part) => typeOnly ? `type ${part}` : part)
    .sort();
}

function parseNamedSymbol(source: string): { name: string; typeOnly: boolean } | undefined {
  const trimmed = source.trim();
  if (!trimmed) return undefined;
  const typeOnly = trimmed.startsWith("type ");
  const withoutType = trimmed.replace(/^type\s+/, "");
  const [, alias] = withoutType.split(/\s+as\s+/);
  const name = (alias ?? withoutType).trim();
  return name ? { name, typeOnly } : undefined;
}

function normalizeSymbolKind(kind: string): ApiSymbolKind {
  if (kind === "let" || kind === "var") return "variable";
  return kind as ApiSymbolKind;
}

function uniqueSymbols(symbols: ApiSymbolDeclaration[]): ApiSymbolDeclaration[] {
  const byKey = new Map<string, ApiSymbolDeclaration>();
  for (const symbol of symbols) {
    byKey.set(`${symbol.module}\0${symbol.name}\0${symbol.kind}\0${symbol.typeOnly}`, symbol);
  }
  return [...byKey.values()].sort((left, right) =>
    left.name.localeCompare(right.name) || left.kind.localeCompare(right.kind)
  );
}

function duplicateApiSymbols(modules: readonly ApiModuleInventory[]): Record<string, string[]> {
  const byName = new Map<string, Set<string>>();
  for (const module of modules) {
    for (const symbol of module.symbols) {
      const modulesForName = byName.get(symbol.name) ?? new Set<string>();
      modulesForName.add(module.module);
      byName.set(symbol.name, modulesForName);
    }
  }

  const duplicates: Record<string, string[]> = {};
  for (const [name, moduleNames] of [...byName.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (moduleNames.size > 1) {
      duplicates[name] = [...moduleNames].sort();
    }
  }
  return duplicates;
}

function symbolMap(inventory: ApiInventory): Map<string, ApiInventorySymbolChange> {
  const symbols = new Map<string, ApiInventorySymbolChange>();
  for (const module of inventory.modules) {
    for (const symbol of module.symbols) {
      symbols.set(symbolKey(symbol), { ...symbol });
    }
  }
  return symbols;
}

function symbolKey(symbol: ApiSymbolDeclaration): string {
  return `${symbol.module}\0${symbol.name}\0${symbol.kind}\0${symbol.typeOnly}`;
}

function groupChangesByStability(
  changes: readonly ApiInventorySymbolChange[],
  stability: ApiStabilityTier,
): Record<ApiStabilityTier, ApiInventorySymbolChange[]> {
  const grouped = emptyStabilityGroups();
  grouped[stability] = [...changes];
  return grouped;
}

function emptyStabilityGroups(): Record<ApiStabilityTier, ApiInventorySymbolChange[]> {
  return {
    stable: [],
    beta: [],
    experimental: [],
    internal: [],
  };
}

function compareSymbolChanges(left: ApiInventorySymbolChange, right: ApiInventorySymbolChange): number {
  return left.module.localeCompare(right.module) || left.name.localeCompare(right.name) ||
    left.kind.localeCompare(right.kind);
}

function inventoryEntrypointStability(entrypoint: string): ApiStabilityTier {
  return packageEntrypointFor(entrypoint)?.stability ?? packageEntrypointFor(`./${entrypoint}`)?.stability ??
    "internal";
}

function hasLeadingJSDoc(source: string, index: number): boolean {
  const prefix = source.slice(0, index).trimEnd();
  if (!prefix.endsWith("*/")) return false;
  const start = prefix.lastIndexOf("/**");
  if (start < 0) return false;
  const between = prefix.slice(start + 3, -2);
  return !between.includes("*/");
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function normalizeModuleTarget(module: string, target: string): string {
  if (!target.startsWith(".")) return target;
  return normalizeModulePath(joinPath(dirname(module), target));
}

function normalizeModulePath(path: string): string {
  const normalized = normalizePath(path);
  return normalized.endsWith(".ts") ? normalized : `${normalized}.ts`;
}

function isLocalTypeScriptModule(path: string): boolean {
  return path.endsWith(".ts") && !path.startsWith("http:") && !path.startsWith("https:") && !path.startsWith("npm:");
}

async function existsOnDisk(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

function dirname(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index < 0 ? "." : normalized.slice(0, index);
}

function joinPath(...parts: string[]): string {
  return normalizePath(parts.filter((part) => part.length > 0).join("/"));
}

function normalizePath(path: string): string {
  const absolute = path.startsWith("/");
  const parts: string[] = [];
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return `${absolute ? "/" : ""}${parts.join("/")}`;
}

if (import.meta.main) {
  let cli: ApiInventoryCliOptions;
  try {
    cli = parseApiInventoryCliArgs(Deno.args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(2);
  }
  const {
    baselinePath,
    check,
    entrypoint,
    failDuplicates,
    json,
    minDocumentationCoverage,
    quiet,
    updateBaselinePath,
  } = cli;
  const inventory = await createApiInventory(entrypoint);
  let baselineDiff: ApiInventoryDiff | undefined;
  let baselineFormatPassed = true;

  if (updateBaselinePath) {
    await Deno.writeTextFile(
      updateBaselinePath,
      formatApiInventoryBaseline(createApiInventoryBaseline(inventory)),
    );
  }
  if (baselinePath) {
    const baselineSource = await Deno.readTextFile(baselinePath);
    const baseline = JSON.parse(baselineSource) as ApiInventoryBaseline;
    baselineDiff = diffApiInventoryBaseline(baseline, inventory);
    baselineFormatPassed = baselineSource === formatApiInventoryBaseline(baseline);
    if (check && !baselineFormatPassed) {
      console.error(`API inventory baseline format drift: regenerate ${baselinePath} with --update-baseline.`);
    }
  }

  if (quiet) {
    // Check-only mode for contributor health gates.
  } else if (json) {
    console.log(JSON.stringify(inventory, null, 2));
  } else {
    console.log(formatApiInventory(inventory));
    if (baselineDiff && (baselineDiff.added.length > 0 || baselineDiff.removed.length > 0)) {
      console.log("");
      console.log(formatApiInventoryDiff(baselineDiff));
    }
  }

  const baselinePassed = !baselineDiff || (baselineDiff.added.length === 0 && baselineDiff.removed.length === 0);
  if (
    check &&
    (!inventorySucceeded(inventory, { failDuplicates, minDocumentationCoverage }) || !baselinePassed ||
      !baselineFormatPassed)
  ) {
    Deno.exit(1);
  }
}

export function parseApiInventoryCliArgs(args: readonly string[]): ApiInventoryCliOptions {
  let entrypoint: string | undefined;
  let minDocumentationCoverage: number | undefined;
  let baselinePath: string | undefined;
  let updateBaselinePath: string | undefined;
  const flags = {
    json: false,
    check: false,
    quiet: false,
    failDuplicates: false,
  };

  for (const arg of args) {
    if (arg === "--") continue;
    else if (arg === "--json") flags.json = true;
    else if (arg === "--check") flags.check = true;
    else if (arg === "--quiet") flags.quiet = true;
    else if (arg === "--fail-duplicates") flags.failDuplicates = true;
    else if (arg.startsWith("--min-doc-coverage=")) {
      minDocumentationCoverage = parseMinimumDocumentationCoverageValue(
        requiredOptionValue(arg, "--min-doc-coverage="),
      );
    } else if (arg.startsWith("--baseline=")) {
      baselinePath = requiredOptionValue(arg, "--baseline=");
    } else if (arg.startsWith("--update-baseline=")) {
      updateBaselinePath = requiredOptionValue(arg, "--update-baseline=");
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown api-inventory option: ${arg}`);
    } else if (!entrypoint) {
      entrypoint = arg;
    } else {
      throw new Error(`Unexpected api-inventory argument: ${arg}`);
    }
  }

  return {
    entrypoint: entrypoint ?? "mod.ts",
    json: flags.json,
    check: flags.check,
    quiet: flags.quiet,
    failDuplicates: flags.failDuplicates,
    minDocumentationCoverage,
    baselinePath,
    updateBaselinePath,
  };
}

function parseMinimumDocumentationCoverageValue(value: string): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) throw new Error(`Invalid --min-doc-coverage value: ${value}`);
  return raw > 1 ? raw / 100 : Math.max(0, raw);
}

function requiredOptionValue(arg: string, prefix: string): string {
  const value = arg.slice(prefix.length);
  if (value.length === 0) throw new Error(`Missing value for ${prefix.slice(0, -1)}`);
  return value;
}
