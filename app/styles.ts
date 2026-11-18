import { runtimeHost } from "../src/runtime/host.ts";
import type { Style } from "../src/theme.ts";
import { Computed } from "../src/signals/mod.ts";
import type { Accent, PanelRender, Severity } from "./types.ts";

export const palette = {
  void: "#05070d",
  voidSoft: "#0f1b34",
  panel: "#0a1020",
  panelSoft: "#111932",
  alarm: "#ff4231",
  amber: "#ff9f24",
  phosphor: "#7dffba",
  signal: "#5bb0ff",
  violet: "#b17cff",
  paper: "#eff7ff",
  dim: "#5a6478",
  shade: "#000000",
};

export const neonColors = {
  void: palette.void,
  alarm: palette.alarm,
  amber: palette.amber,
  phosphor: palette.phosphor,
  signal: palette.signal,
  violet: palette.violet,
};

export function accentColor(accent: Accent): string {
  return palette[accent];
}

function hexToRgb(hex: string) {
  const normalized = hex.replace(/^#/, "");
  const value = normalized.length === 3 ? expandShortHex(normalized) : normalized;
  const intValue = Number.parseInt(value, 16);
  return {
    r: (intValue >> 16) & 0xff,
    g: (intValue >> 8) & 0xff,
    b: intValue & 0xff,
  };
}

function expandShortHex(value: string): string {
  const r = value[0] ?? "0";
  const g = value[1] ?? "0";
  const b = value[2] ?? "0";
  return `${r}${r}${g}${g}${b}${b}`;
}

export function makeStyle(options: {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  inverse?: boolean;
} = {}): Style {
  const codes: string[] = [];
  if (options.bold) {
    codes.push("1");
  }
  if (options.dim) {
    codes.push("2");
  }
  if (options.inverse) {
    codes.push("7");
  }
  if (options.fg) {
    const { r, g, b } = hexToRgb(options.fg);
    codes.push(`38;2;${r};${g};${b}`);
  }
  if (options.bg) {
    const { r, g, b } = hexToRgb(options.bg);
    codes.push(`48;2;${r};${g};${b}`);
  }

  if (codes.length === 0) {
    return (text) => text;
  }

  const prefix = `\x1b[${codes.join(";")}m`;
  return (text) => `${prefix}${text}\x1b[0m`;
}

export function severityAccent(severity: Severity): Accent {
  switch (severity) {
    case "alarm":
      return "alarm";
    case "warning":
      return "amber";
    default:
      return "signal";
  }
}

export function titleInk(accent: Accent): string {
  return accent === "alarm" || accent === "violet" ? palette.paper : palette.void;
}

export function createNeonPanelStyles(
  render: { readonly value: Pick<PanelRender, "accent" | "alert" | "severity"> },
  selected: { readonly value: boolean },
  options: { emphasizeSeverity?: boolean } = {},
) {
  return {
    backgroundStyle: new Computed(() =>
      makeStyle({
        bg: selected.value ? palette.panelSoft : palette.panel,
        fg: palette.paper,
      })
    ),
    frameStyle: new Computed(() =>
      makeStyle({
        fg: selected.value ? palette.paper : accentColor(render.value.accent),
        bg: selected.value ? palette.panelSoft : undefined,
        bold: selected.value || (options.emphasizeSeverity === true && render.value.severity !== "info"),
      })
    ),
    titleStyle: new Computed(() =>
      makeStyle({
        fg: titleInk(render.value.accent),
        bg: accentColor(render.value.accent),
        bold: true,
      })
    ),
    alertStyle: new Computed(() =>
      makeStyle({
        fg: titleInk(severityAccent(render.value.severity)),
        bg: accentColor(severityAccent(render.value.severity)),
        bold: render.value.alert.length > 0,
      })
    ),
    bodyStyle: new Computed(() =>
      makeStyle({
        fg: render.value.severity === "alarm"
          ? accentColor("alarm")
          : render.value.severity === "warning"
          ? accentColor("amber")
          : palette.paper,
        bg: selected.value ? palette.panelSoft : palette.panel,
      })
    ),
    footerStyle: new Computed(() =>
      makeStyle({
        fg: selected.value ? accentColor(render.value.accent) : palette.dim,
        bg: selected.value ? palette.panelSoft : palette.panel,
      })
    ),
  };
}

export function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function formatPercent(value: number) {
  return `${value.toFixed(value >= 100 ? 0 : 1)}%`;
}

export function formatBytes(value: number) {
  return formatBytesWithSeparator(value, " ");
}

export function formatCompactBytes(value: number) {
  return formatBytesWithSeparator(value, "");
}

function formatBytesWithSeparator(value: number, separator: string) {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let amount = Math.max(0, value);
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  const precision = amount >= 100 || index === 0 ? 0 : amount >= 10 ? 1 : 2;
  return `${amount.toFixed(precision)}${separator}${units[index]}`;
}

export function formatRate(value: number) {
  return `${formatBytes(value)}/s`;
}

export function formatOptionalNumber(value: number | null, suffix: string) {
  return value === null ? "--" : `${value.toFixed(value >= 100 ? 0 : 1)}${suffix}`;
}

export function requireInteractiveTerminal(command: string): void {
  const input = runtimeHost.stdin.isTerminal();
  const output = runtimeHost.stdout.isTerminal();
  if (input && output) return;

  const missing = [
    input ? undefined : "stdin",
    output ? undefined : "stdout",
  ].filter((value): value is string => value !== undefined).join(" and ");
  const verb = missing.includes(" and ") ? "are" : "is";

  console.error(`${command} requires an interactive terminal (${missing} ${verb} not a TTY).`);
  console.error("Run it directly in a terminal, or use a report/web task for non-interactive output.");
  runtimeHost.exit(64);
}
