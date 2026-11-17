import { runtimeHost } from "../src/runtime/host.ts";
import {
  capitalize,
  type ComponentCapability,
  type ComponentCatalogQuery,
  type ComponentCatalogReport,
  type ComponentCategory,
  createComponentCatalogReport,
  formatComponentCatalogMarkdown,
} from "../mod.ts";

if (import.meta.main) {
  const args = new Set(runtimeHost.args);
  const query = parseQuery(runtimeHost.args);
  if (args.has("--json")) {
    console.log(JSON.stringify(createComponentCatalogReport({ query }), null, 2));
  } else if (args.has("--terminal") || args.has("--compact")) {
    console.log(formatComponentCatalogTerminal(createComponentCatalogReport({ query })));
  } else {
    console.log(formatComponentCatalogMarkdown({ query }));
  }
}

export interface ComponentCatalogTerminalOptions {
  width?: number;
  maxCapabilities?: number;
}

export function formatComponentCatalogTerminal(
  report: ComponentCatalogReport,
  options: ComponentCatalogTerminalOptions = {},
): string {
  const width = Math.max(48, Math.floor(options.width ?? 100));
  const maxCapabilities = Math.max(1, Math.floor(options.maxCapabilities ?? 4));
  const lines = [
    "# Component Catalog",
    "",
    `Components: ${report.inspection.count}`,
    ...wrapText(`Categories: ${nonZeroCategorySummary(report).join(", ")}`, width),
    "",
  ];

  for (const category of report.categories) {
    const entries = report.entries.filter((entry) => entry.category === category);
    if (entries.length === 0) continue;
    lines.push(`## ${capitalize(category)} (${entries.length})`);
    for (const entry of entries) {
      const capabilityText = summarizeCapabilities(entry.capabilities, maxCapabilities);
      const labelWidth = Math.min(18, Math.max(12, Math.floor(width * 0.2)));
      const capabilityWidth = Math.min(34, Math.max(18, Math.floor(width * 0.32)));
      const left = `${entry.name.padEnd(labelWidth)} ${capabilityText.padEnd(capabilityWidth)}`;
      const bodyWidth = Math.max(16, width - left.length - 1);
      const wrapped = wrapText(entry.description, bodyWidth);
      lines.push(`${left} ${wrapped[0] ?? ""}`.slice(0, width));
      for (const continuation of wrapped.slice(1)) {
        lines.push(`${" ".repeat(left.length + 1)}${continuation}`.slice(0, width));
      }
    }
    lines.push("");
  }

  lines.push(...wrapText("Use --json for machine-readable metadata or omit --terminal for Markdown tables.", width));
  return lines.join("\n").trimEnd();
}

function parseQuery(args: readonly string[]): ComponentCatalogQuery {
  const query: ComponentCatalogQuery = {};
  for (const arg of args) {
    const [name, value] = arg.split("=", 2);
    if (!value) continue;
    if (name === "--category") {
      query.category = value as ComponentCategory;
    } else if (name === "--capability") {
      query.capability = value as ComponentCapability;
    } else if (name === "--search") {
      query.search = value;
    }
  }
  return query;
}

function nonZeroCategorySummary(report: ComponentCatalogReport): string[] {
  return Object.entries(report.inspection.categories)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `${name} ${count}`);
}

function summarizeCapabilities(capabilities: readonly string[], maxCapabilities: number): string {
  const visible = capabilities.slice(0, maxCapabilities);
  const suffix = capabilities.length > visible.length ? ` +${capabilities.length - visible.length}` : "";
  return `${visible.join(", ")}${suffix}`;
}

function wrapText(value: string, width: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line.length === 0) {
      line = word;
    } else if (line.length + 1 + word.length <= width) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
