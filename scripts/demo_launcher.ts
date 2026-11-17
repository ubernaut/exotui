import { runtimeHost } from "../src/runtime/host.ts";
import {
  findVisualizationLaunchTarget,
  formatVisualizationUsage,
  queryVisualizationLaunchTargets,
} from "./visualization_launcher.ts";
import type { VisualizationLaunchCategory, VisualizationLaunchTarget } from "./visualization_launcher.ts";
import { stripAnsi } from "../src/utils/ansi_text.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CONTROL_CHARACTER_PATTERN = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
);
/** Runs a catalog task with the current host runtime while preserving explicit external commands. */
export function runtimeTaskCommand(command: readonly string[]): readonly string[] {
  if (runtimeHost?.runtime !== "bun" || command[0] !== "deno" || command[1] !== "task") return command;
  const args = command.slice(3);
  if (args[0] === "--") args.shift();
  return [runtimeHost.execPath(), "run", command[2]!, ...args];
}

export interface DemoLauncherSelection {
  index: number;
  query: string;
}

export function filterDemoTargets(
  targets: readonly VisualizationLaunchTarget[],
  query: string,
): VisualizationLaunchTarget[] {
  const normalized = query.trim();
  return normalized
    ? queryVisualizationLaunchTargets({ search: normalized }, targets)
    : queryVisualizationLaunchTargets({}, targets);
}

export function moveDemoSelection(
  selection: DemoLauncherSelection,
  targets: readonly VisualizationLaunchTarget[],
  delta: number,
): DemoLauncherSelection {
  if (targets.length === 0) return { ...selection, index: 0 };
  return { ...selection, index: wrap(selection.index + delta, targets.length) };
}

export function appendDemoLauncherInput(selection: DemoLauncherSelection, input: string): DemoLauncherSelection {
  if (CONTROL_CHARACTER_PATTERN.test(input)) return selection;
  const printable = input.replace(/[^\w -]/g, "");
  return printable ? { index: 0, query: selection.query + printable } : selection;
}

export function formatDemoLauncherScreen(
  targets: readonly VisualizationLaunchTarget[],
  selection: DemoLauncherSelection,
  options: { width?: number; height?: number } = {},
): string {
  const width = options.width ?? 96;
  const height = options.height ?? 28;
  const visibleHeight = Math.max(1, height - 8);
  const start = Math.max(
    0,
    Math.min(selection.index - Math.floor(visibleHeight / 2), Math.max(0, targets.length - visibleHeight)),
  );
  const visible = targets.slice(start, start + visibleHeight);
  const lines = [
    style(" DEMO LAUNCHER ", { fg: "#081219", bg: "#7ad7ff", bold: true }) +
    style("  select a demo and press Enter", { fg: "#f6f1e8", bg: "#10222c" }),
    style(` Search: ${selection.query || "(type to filter)"} `, { fg: "#f4c86a", bg: "#152c37" }),
    style(" Keys: arrows/j/k move  Enter launch  Backspace filter  Esc/q quit ", { fg: "#9db3bf", bg: "#10222c" }),
    "",
  ];
  for (let offset = 0; offset < visible.length; offset += 1) {
    const target = visible[offset]!;
    const index = start + offset;
    const active = index === selection.index;
    const alias = target.aliases[0] ?? target.task;
    const category = target.category ?? "demo";
    const prefix = active ? ">" : " ";
    lines.push(formatTargetLine(prefix, alias, target, category, active, width));
  }
  if (targets.length === 0) {
    lines.push(style(" No demos match the current filter. ", { fg: "#160d0b", bg: "#ffd166", bold: true }));
  }
  lines.push("", style(` ${targets.length} demos `, { fg: "#081219", bg: "#f4c86a", bold: true }));
  return lines.slice(0, height).map((line) => fitAnsi(line, width)).join("\n");
}

if (import.meta.main) {
  await main(runtimeHost.args);
}

async function main(args: string[]): Promise<void> {
  const [targetArg, ...rest] = args;
  if (targetArg === "-h" || targetArg === "--help" || targetArg === "help") {
    console.log(formatVisualizationUsage("./visualization"));
    return;
  }
  if (targetArg === "--list" || targetArg === "list") {
    console.log(formatVisualizationUsage("./visualization"));
    return;
  }
  if (targetArg) {
    const target = findVisualizationLaunchTarget(targetArg);
    if (!target) {
      console.error(`unknown visualization: ${targetArg}`);
      console.error(formatVisualizationUsage("./visualization"));
      runtimeHost.exit(64);
    }
    await launchTask(target.task, rest);
    return;
  }
  const selected = await selectDemo();
  if (!selected) return;
  await launchTask(selected.task, rest);
}

async function selectDemo(): Promise<VisualizationLaunchTarget | undefined> {
  const allTargets = queryVisualizationLaunchTargets().filter((target) => target.category !== "check");
  const interactive = runtimeHost.stdin.isTerminal() && runtimeHost.stdout.isTerminal();
  if (!interactive) {
    console.log(formatVisualizationUsage("./visualization"));
    return undefined;
  }

  let selection: DemoLauncherSelection = { index: 0, query: "" };
  runtimeHost.stdin.setRaw(true, { cbreak: true });
  try {
    while (true) {
      const targets = filterDemoTargets(allTargets, selection.query);
      if (selection.index >= targets.length) selection = { ...selection, index: Math.max(0, targets.length - 1) };
      render(targets, selection);
      const key = await readKey();
      if (key === "enter") return targets[selection.index];
      if (key === "escape" || key === "q") return undefined;
      if (key === "up" || key === "k") selection = moveDemoSelection(selection, targets, -1);
      else if (key === "down" || key === "j") selection = moveDemoSelection(selection, targets, 1);
      else if (key === "backspace") selection = { index: 0, query: selection.query.slice(0, -1) };
      else selection = appendDemoLauncherInput(selection, key);
    }
  } finally {
    runtimeHost.stdin.setRaw(false);
    write("\x1b[?25h\x1b[2J\x1b[H");
  }
}

function render(targets: readonly VisualizationLaunchTarget[], selection: DemoLauncherSelection): void {
  const size = runtimeHost.consoleSize();
  write(`\x1b[?25l\x1b[2J\x1b[H${
    formatDemoLauncherScreen(targets, selection, {
      width: Math.max(40, size.columns),
      height: Math.max(12, size.rows),
    })
  }`);
}

async function readKey(): Promise<string> {
  const buffer = new Uint8Array(16);
  const size = await runtimeHost.stdin.read(buffer);
  const value = decoder.decode(buffer.subarray(0, size ?? 0));
  if (value === "\r" || value === "\n") return "enter";
  if (value === "\x1b") return "escape";
  if (value === "\x7f" || value === "\b") return "backspace";
  if (value === "\x1b[A") return "up";
  if (value === "\x1b[B") return "down";
  return value;
}

async function launchTask(task: string, args: string[]): Promise<void> {
  const command = new runtimeHost.Command(runtimeHost.execPath(), {
    args: ["Bun" in globalThis ? "run" : "task", task, ...args],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await command.spawn().status;
  runtimeHost.exit(status.code);
}

function formatTargetLine(
  prefix: string,
  alias: string,
  target: VisualizationLaunchTarget,
  category: VisualizationLaunchCategory,
  active: boolean,
  width: number,
): string {
  const bg = active ? "#1a3644" : "#0d1a22";
  const fg = active ? "#f6f1e8" : "#c7d8df";
  const categoryStyle = category === "app"
    ? { fg: "#081219", bg: "#7ad7ff", bold: true }
    : category === "demo"
    ? { fg: "#160d0b", bg: "#f4c86a", bold: true }
    : { fg: "#081219", bg: "#9ad29a", bold: true };
  const marker = style(` ${prefix} `, active ? categoryStyle : { fg, bg });
  const categoryBadge = style(` ${category} `, categoryStyle);
  const left = `${alias.padEnd(18)} ${target.task.padEnd(18)} `;
  const tags = (target.tags ?? []).slice(0, 3).join(",");
  const plain = `${left} ${target.description} ${tags ? `(${tags})` : ""}`;
  const remaining = Math.max(0, width - stripAnsi(marker).length - stripAnsi(categoryBadge).length - 1);
  return marker + categoryBadge + style(` ${fitPlain(plain, remaining)}`, { fg, bg });
}

function fitAnsi(value: string, width: number): string {
  const plain = stripAnsi(value);
  if (plain.length >= width) return fitPlain(plain, width);
  return value + " ".repeat(width - plain.length);
}

function fitPlain(value: string, width: number): string {
  return value.length > width ? value.slice(0, Math.max(0, width - 1)) + "…" : value.padEnd(width);
}

function style(text: string, options: { fg?: string; bg?: string; bold?: boolean }): string {
  const codes = [];
  if (options.bold) codes.push("1");
  if (options.fg) codes.push(`38;2;${rgb(options.fg).join(";")}`);
  if (options.bg) codes.push(`48;2;${rgb(options.bg).join(";")}`);
  return codes.length ? `\x1b[${codes.join(";")}m${text}\x1b[0m` : text;
}

function rgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16)) as [number, number, number];
}

function wrap(value: number, length: number): number {
  return ((value % length) + length) % length;
}

function write(value: string): void {
  runtimeHost.stdout.writeSync(encoder.encode(value));
}
