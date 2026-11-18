import { runtimeTaskCommand } from "./demo_launcher.ts";
import { runtimeHost } from "../src/runtime/host.ts";
import { clamp } from "../src/utils/numbers.ts";

export interface WorkbenchVisualSmokeOptions {
  command?: readonly string[];
  columns?: number;
  rows?: number;
  resizeColumns?: number;
  resizeRows?: number;
  settleMs?: number;
  timeoutMs?: number;
  dumpScreen?: boolean;
  retryTransientResize?: boolean;
}

export interface WorkbenchVisualSmokeResult {
  passed: boolean;
  columns: number;
  rows: number;
  screenLines: readonly string[];
  missing: string[];
  forbidden: string[];
  statusLine: string;
  threeLine: string;
  nonBlankRows: number;
  outputBytes: number;
  truecolorBackgroundWrites: number;
  finalTruecolorBackgroundRows: number;
  finalTruecolorBackgroundMaxColumns: number;
  threeRenderedCells: number;
  threePane?: WorkbenchThreePaneCoverage;
}

export interface WorkbenchThreePaneCoverage {
  found: boolean;
  top: number;
  left: number;
  right: number;
  bottom: number;
  bodyStart: number;
  bodyRows: number;
  bodyColumns: number;
  truecolorRows: number;
  truecolorMaxColumns: number;
  truecolorCells: number;
  visibleRows: number;
  visibleMaxColumns: number;
  visibleCells: number;
}

export interface WorkbenchFullscreenVisualSmokeResult extends WorkbenchVisualSmokeResult {
  fullscreen: boolean;
  fullscreenCells: number;
  fullscreenCap: number;
  fullscreenBodyMinCells: number;
  truecolorBackgroundRows: number;
  truecolorBackgroundMaxColumns: number;
  bodyTruecolorBackgroundRows: number;
  bodyTruecolorBackgroundMaxColumns: number;
  bodyVisibleRows: number;
  bodyVisibleMaxColumns: number;
  bodyVisibleCells: number;
}

export interface WorkbenchFullscreenVisualSmokeOptions {
  command?: readonly string[];
  columns?: number;
  rows?: number;
  resizeColumns?: number;
  resizeRows?: number;
  timeoutMs?: number;
  settleMs?: number;
  fullscreenKey?: string;
  minCells?: number;
  minTruecolorRows?: number;
  minTruecolorColumns?: number;
  dumpScreen?: boolean;
  retryTransientResize?: boolean;
  requireRenderer?: boolean;
}

interface ReplayState {
  row: number;
  column: number;
  truecolorForeground: boolean;
  truecolorBackground: boolean;
}

export interface WorkbenchStyledScreenReplay {
  screen: string[][];
  truecolorForeground: boolean[][];
  truecolorBackground: boolean[][];
  truecolorStyled: boolean[][];
  truecolorBackgroundRows: number;
  truecolorBackgroundMaxColumns: number;
}

const DEFAULT_COMMAND = ["deno", "task", "api-workbench"] as const;
const REQUIRED_TOKENS: readonly string[] = ["API WORKBENCH", "THREE ASCII"];
const FORBIDDEN_TOKENS: readonly string[] = ["ReferenceError", "RangeError", "Maximum call stack", ")F10"];
const FULLSCREEN_THREE_CELL_PATTERN = /(\d+)c(?: cap (\d+)c)?/;
const THREE_RENDERED_CELL_PATTERN = /(\d+)c/;
const THREE_RENDER_CAP_PATTERN = /\bcap\s+(\d+)c\b/;
const THREE_RENDERER_UNAVAILABLE_PATTERN =
  /ASCII RENDERER OFFLINE|ASCII RENDERER UNAVAILABLE|THREE ASCII GPU READBACK UNAVAILABLE|renderer unavailable|WebGPU\/WebGL backend unavailable|text preview active/i;

if (import.meta.main) {
  const fullscreen = runtimeHost.args.includes("--fullscreen");
  const args = fullscreen ? runtimeHost.args.filter((arg) => arg !== "--fullscreen") : runtimeHost.args;
  const options = fullscreen ? parseWorkbenchFullscreenVisualSmokeArgs(args) : parseWorkbenchVisualSmokeArgs(args);
  const result = fullscreen ? await runWorkbenchFullscreenVisualSmoke(options) : await runWorkbenchVisualSmoke(options);
  console.log(
    fullscreen
      ? formatWorkbenchFullscreenVisualSmokeResult(result as WorkbenchFullscreenVisualSmokeResult)
      : formatWorkbenchVisualSmokeResult(result),
  );
  if (result.screenLines.length > 0 && options.dumpScreen) {
    console.log("");
    console.log("Screen:");
    for (let index = 0; index < result.screenLines.length; index += 1) {
      console.log(`${String(index + 1).padStart(2, "0")}|${result.screenLines[index]}`);
    }
  }
  if (!result.passed) runtimeHost.exit(1);
}

export function parseWorkbenchFullscreenVisualSmokeArgs(
  args: readonly string[],
): WorkbenchFullscreenVisualSmokeOptions {
  const options: WorkbenchFullscreenVisualSmokeOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--") continue;
    const [name, inlineValue] = arg.split("=", 2);
    if (name === "--dump-screen") {
      options.dumpScreen = inlineValue === undefined ? true : inlineValue !== "false";
      continue;
    }
    if (name === "--require-renderer") {
      options.requireRenderer = inlineValue === undefined ? true : inlineValue !== "false";
      continue;
    }
    const value = inlineValue ?? args[index + 1];
    if (inlineValue === undefined && name.startsWith("--")) index += 1;
    if (value === undefined) continue;
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number)) continue;
    if (name === "--columns") options.columns = number;
    else if (name === "--rows") options.rows = number;
    else if (name === "--resize-columns") options.resizeColumns = number;
    else if (name === "--resize-rows") options.resizeRows = number;
    else if (name === "--timeout-ms") options.timeoutMs = number;
    else if (name === "--settle-ms") options.settleMs = number;
    else if (name === "--min-cells") options.minCells = number;
    else if (name === "--min-truecolor-rows") options.minTruecolorRows = number;
    else if (name === "--min-truecolor-columns") options.minTruecolorColumns = number;
  }
  return options;
}

export async function runWorkbenchFullscreenVisualSmoke(
  options: WorkbenchFullscreenVisualSmokeOptions = {},
): Promise<WorkbenchFullscreenVisualSmokeResult> {
  const columns = Math.max(1, Math.floor(options.columns ?? 132));
  const rows = Math.max(1, Math.floor(options.rows ?? 44));
  const resizeColumns = options.resizeColumns === undefined
    ? undefined
    : Math.max(1, Math.floor(options.resizeColumns));
  const resizeRows = options.resizeRows === undefined ? undefined : Math.max(1, Math.floor(options.resizeRows));
  return await runWorkbenchFullscreenVisualSmokeCapture({
    command: options.command ?? DEFAULT_COMMAND,
    columns,
    rows,
    resizeColumns,
    resizeRows,
    timeoutMs: options.timeoutMs ?? 12_000,
    settleMs: options.settleMs ?? 4_000,
    fullscreenKey: options.fullscreenKey ?? "f",
    minCells: options.minCells,
    minTruecolorRows: options.minTruecolorRows,
    minTruecolorColumns: options.minTruecolorColumns,
    requireRenderer: options.requireRenderer,
    retryTransientResize: options.retryTransientResize ?? true,
  });
}

async function runWorkbenchFullscreenVisualSmokeCapture(
  options:
    & Required<
      Pick<
        WorkbenchFullscreenVisualSmokeOptions,
        "command" | "columns" | "rows" | "timeoutMs" | "settleMs" | "fullscreenKey" | "retryTransientResize"
      >
    >
    & Pick<
      WorkbenchFullscreenVisualSmokeOptions,
      "resizeColumns" | "resizeRows" | "minCells" | "minTruecolorRows" | "minTruecolorColumns"
    >
    & { requireRenderer?: boolean },
): Promise<WorkbenchFullscreenVisualSmokeResult> {
  const hasResize = options.resizeColumns !== undefined && options.resizeRows !== undefined;
  const maxAttempts = hasResize && options.retryTransientResize ? 2 : 1;
  let result: WorkbenchFullscreenVisualSmokeResult | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const settleMs = attempt === 0 ? options.settleMs : Math.max(options.settleMs * 2, options.settleMs + 3_000);
    const output = await captureWorkbenchFullscreenPty({ ...options, settleMs });
    result = inspectWorkbenchFullscreenVisualSmokeOutput(output, {
      columns: options.resizeColumns ?? options.columns,
      rows: options.resizeRows ?? options.rows,
      minCells: options.minCells,
      minTruecolorRows: options.minTruecolorRows,
      minTruecolorColumns: options.minTruecolorColumns,
      requireRenderer: options.requireRenderer,
    });
    if (result.passed || !isTransientWorkbenchThreeResizeResult(result)) return result;
  }
  return result!;
}

export async function captureWorkbenchFullscreenPty(
  options:
    & Required<
      Pick<
        WorkbenchFullscreenVisualSmokeOptions,
        "command" | "columns" | "rows" | "timeoutMs" | "settleMs" | "fullscreenKey"
      >
    >
    & Pick<WorkbenchFullscreenVisualSmokeOptions, "resizeColumns" | "resizeRows">,
): Promise<string> {
  const tempFile = await runtimeHost.makeTempFile({ prefix: "deno-tui-workbench-fullscreen-", suffix: ".ansi" });
  const command = quotePythonList(runtimeTaskCommand(options.command));
  const resizeRows = pythonOptionalNumber(options.resizeRows);
  const resizeColumns = pythonOptionalNumber(options.resizeColumns);
  const python = `
import os, pexpect, signal, subprocess, sys, time
path = sys.argv[1]
command = ${command}
child = pexpect.spawn(command[0], command[1:], encoding=None, timeout=${
    Math.ceil(options.timeoutMs / 1000)
  }, dimensions=(${options.rows}, ${options.columns}))
chunks = []
def child_pids(pid):
    try:
        output = subprocess.check_output(["pgrep", "-P", str(pid)], stderr=subprocess.DEVNULL)
    except Exception:
        return []
    return [int(value) for value in output.decode().split() if value.strip().isdigit()]
def process_tree(pid):
    children = []
    for child_pid in child_pids(pid):
        children.extend(process_tree(child_pid))
        children.append(child_pid)
    return children
def signal_tree(pid, sig):
    for target in process_tree(pid) + [pid]:
        try:
            os.kill(target, sig)
        except Exception:
            pass
def drain(duration):
    deadline = time.time() + duration
    while time.time() < deadline:
        try:
            chunks.append(child.read_nonblocking(size=200000, timeout=0.05))
        except Exception:
            time.sleep(0.02)
def recent_output():
    return b"".join(chunks[-12:])
def drain_until(duration, predicate, min_duration=0.75):
    start = time.time()
    start_index = len(chunks)
    deadline = time.time() + duration
    while time.time() < deadline:
        try:
            chunks.append(child.read_nonblocking(size=200000, timeout=0.05))
        except Exception:
            time.sleep(0.02)
        if time.time() - start >= min_duration and predicate(b"".join(chunks[start_index:]) or recent_output()):
            return True
    return False
try:
    drain(${(options.settleMs / 1000).toFixed(3)})
    child.send(${JSON.stringify(options.fullscreenKey)}.encode())
    drain_until(${(options.settleMs / 1000).toFixed(3)}, lambda output: b"fps" in output and b"live" in output)
    resize_rows = ${resizeRows}
    resize_columns = ${resizeColumns}
    if resize_rows and resize_columns:
        child.setwinsize(resize_rows, resize_columns)
        drain_until(${(options.settleMs / 1000).toFixed(3)}, lambda output: b"fps" in output and b"live" in output)
finally:
    try:
        child.sendintr()
    except Exception:
        pass
    time.sleep(0.2)
    signal_tree(child.pid, signal.SIGTERM)
    time.sleep(0.2)
    signal_tree(child.pid, signal.SIGKILL)
    try:
        child.close(force=True)
    except Exception:
        pass
open(path, "wb").write(b"".join(chunks))
`;
  try {
    const process = await new runtimeHost.Command("python3", {
      args: ["-c", python, tempFile],
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!process.success) {
      const error = new TextDecoder().decode(process.stderr).trim();
      throw new Error(error || "workbench fullscreen visual smoke PTY capture failed");
    }
    return await runtimeHost.readTextFile(tempFile);
  } finally {
    await runtimeHost.remove(tempFile).catch(() => {});
  }
}

export function parseWorkbenchVisualSmokeArgs(args: readonly string[]): WorkbenchVisualSmokeOptions {
  const options: WorkbenchVisualSmokeOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--") continue;
    const [name, inlineValue] = arg.split("=", 2);
    if (name === "--dump-screen") {
      options.dumpScreen = true;
      continue;
    }
    const value = inlineValue ?? args[index + 1];
    if (inlineValue === undefined && name.startsWith("--")) index += 1;
    if (value === undefined) continue;
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number)) continue;
    if (name === "--columns") options.columns = number;
    else if (name === "--rows") options.rows = number;
    else if (name === "--resize-columns") options.resizeColumns = number;
    else if (name === "--resize-rows") options.resizeRows = number;
    else if (name === "--settle-ms") options.settleMs = number;
    else if (name === "--timeout-ms") options.timeoutMs = number;
  }
  return options;
}

export async function runWorkbenchVisualSmoke(
  options: WorkbenchVisualSmokeOptions = {},
): Promise<WorkbenchVisualSmokeResult> {
  const columns = Math.max(1, Math.floor(options.columns ?? 118));
  const rows = Math.max(1, Math.floor(options.rows ?? 34));
  const resizeColumns = options.resizeColumns === undefined
    ? undefined
    : Math.max(1, Math.floor(options.resizeColumns));
  const resizeRows = options.resizeRows === undefined ? undefined : Math.max(1, Math.floor(options.resizeRows));
  const command = options.command ?? DEFAULT_COMMAND;
  if (resizeColumns && resizeRows) {
    return await runWorkbenchResizeVisualSmoke({
      command,
      columns,
      rows,
      resizeColumns,
      resizeRows,
      settleMs: options.settleMs ?? 3_000,
      timeoutMs: options.timeoutMs ?? 10_000,
      retryTransientResize: options.retryTransientResize ?? true,
    });
  }

  const output = await captureWorkbenchPty({
    command,
    columns,
    rows,
    timeoutMs: options.timeoutMs ?? 8_000,
  });
  return inspectWorkbenchVisualSmokeOutput(output, { columns: resizeColumns ?? columns, rows: resizeRows ?? rows });
}

async function runWorkbenchResizeVisualSmoke(
  options: Required<
    Pick<
      WorkbenchVisualSmokeOptions,
      | "command"
      | "columns"
      | "rows"
      | "resizeColumns"
      | "resizeRows"
      | "settleMs"
      | "timeoutMs"
      | "retryTransientResize"
    >
  >,
): Promise<WorkbenchVisualSmokeResult> {
  const maxAttempts = options.retryTransientResize ? 2 : 1;
  let result: WorkbenchVisualSmokeResult | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const settleMs = attempt === 0 ? options.settleMs : Math.max(options.settleMs * 2, options.settleMs + 3_000);
    const output = await captureWorkbenchResizePty({ ...options, settleMs });
    result = inspectWorkbenchVisualSmokeOutput(output, { columns: options.resizeColumns, rows: options.resizeRows });
    if (result.passed || !isTransientWorkbenchThreeResizeResult(result)) return result;
  }
  return result!;
}

export async function captureWorkbenchPty(
  options: Required<Pick<WorkbenchVisualSmokeOptions, "command" | "columns" | "rows" | "timeoutMs">>,
): Promise<string> {
  const shellCommand = [
    `stty cols ${options.columns} rows ${options.rows}`,
    `timeout -k 1s ${Math.max(0.1, options.timeoutMs / 1000)}s ${quoteCommand(runtimeTaskCommand(options.command))}`,
  ].join("; ");
  const output = await new runtimeHost.Command("script", {
    args: ["-q", "-c", shellCommand, "/dev/null"],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const text = new TextDecoder().decode(output.stdout);
  if (text.length === 0) {
    const error = new TextDecoder().decode(output.stderr).trim();
    throw new Error(error || "workbench visual smoke produced no PTY output");
  }
  return text;
}

export async function captureWorkbenchResizePty(
  options: Required<
    Pick<
      WorkbenchVisualSmokeOptions,
      "command" | "columns" | "rows" | "resizeColumns" | "resizeRows" | "timeoutMs" | "settleMs"
    >
  >,
): Promise<string> {
  const tempFile = await runtimeHost.makeTempFile({ prefix: "deno-tui-workbench-resize-", suffix: ".ansi" });
  const command = quotePythonList(runtimeTaskCommand(options.command));
  const python = `
import pexpect, sys, time
path = sys.argv[1]
command = ${command}
child = pexpect.spawn(command[0], command[1:], encoding=None, timeout=${
    Math.ceil(options.timeoutMs / 1000)
  }, dimensions=(${options.rows}, ${options.columns}))
chunks = []
def drain(duration):
    deadline = time.time() + duration
    while time.time() < deadline:
        try:
            chunks.append(child.read_nonblocking(size=200000, timeout=0.05))
        except Exception:
            time.sleep(0.02)
try:
    drain(${(options.settleMs / 1000).toFixed(3)})
    child.setwinsize(${options.resizeRows}, ${options.resizeColumns})
    drain(${(options.settleMs / 1000).toFixed(3)})
finally:
    try:
        child.sendintr()
    except Exception:
        pass
    time.sleep(0.2)
    try:
        child.terminate(force=True)
    except Exception:
        pass
open(path, "wb").write(b"".join(chunks))
`;
  try {
    const process = await new runtimeHost.Command("python3", {
      args: ["-c", python, tempFile],
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!process.success) {
      const error = new TextDecoder().decode(process.stderr).trim();
      throw new Error(error || "workbench resize visual smoke PTY capture failed");
    }
    return await runtimeHost.readTextFile(tempFile);
  } finally {
    await runtimeHost.remove(tempFile).catch(() => {});
  }
}

export function inspectWorkbenchVisualSmokeOutput(
  output: string,
  options: { columns: number; rows: number },
): WorkbenchVisualSmokeResult {
  const replay = replayWorkbenchStyledScreen(output, options);
  const screen = replay.screen;
  const lines = screen.map((row) => row.join("").trimEnd());
  const text = lines.join("\n");
  const statusLine = lines.at(-1) ?? "";
  const threePane = inspectWorkbenchThreePaneCoverage(lines, replay.truecolorStyled);
  const threeLine = findWorkbenchThreePaneTelemetryLine(lines, threePane) ?? "";
  const rendererUnavailable = THREE_RENDERER_UNAVAILABLE_PATTERN.test(text);
  const missing = REQUIRED_TOKENS.filter((token) => !text.includes(token));
  const forbidden = FORBIDDEN_TOKENS.filter((token) => text.includes(token));
  const nonBlankRows = lines.filter((line) => line.trim().length > 0).length;
  const truecolorBackgroundWrites = countOccurrences(output, "\x1b[48;2;");
  const threeRenderedCells = parseThreeRenderedCells(threeLine);
  const threeRenderCap = parseThreeRenderCap(threeLine);
  if (threeLine.length === 0 && !rendererUnavailable) missing.push("three telemetry line");
  if (statusLine.trim().length === 0) missing.push("status line");
  if (threePane?.found && truecolorBackgroundWrites > 0) {
    const minPaneRows = Math.min(2, threePane.bodyRows);
    const minPaneColumns = Math.max(1, Math.floor(threePane.bodyColumns * 0.35));
    const minVisibleColumns = Math.max(1, Math.floor(threePane.bodyColumns * 0.08));
    const focusedThreeWideColumns = statusLine.includes("focus Three ASCII") && options.columns >= 130
      ? Math.floor(options.columns * 0.65)
      : 0;
    const focusedThreeTallRows = statusLine.includes("focus Three ASCII") && options.rows >= 40
      ? Math.floor(options.rows * 0.38)
      : 0;
    const focusedThreeTopRow = statusLine.includes("focus Three ASCII") && options.columns >= 96 && options.rows >= 28
      ? 5
      : 0;
    if (threePane.truecolorRows < minPaneRows) missing.push(`three pane truecolor rows >= ${minPaneRows}`);
    if (threePane.truecolorMaxColumns < minPaneColumns) {
      missing.push(`three pane truecolor columns >= ${minPaneColumns}`);
    }
    if (focusedThreeTopRow > 0 && threePane.top + 1 > focusedThreeTopRow) {
      missing.push(`focused three pane starts by row ${focusedThreeTopRow}`);
    }
    if (focusedThreeWideColumns > 0 && threePane.bodyColumns < focusedThreeWideColumns) {
      missing.push(`focused three pane columns >= ${focusedThreeWideColumns}`);
    }
    if (focusedThreeTallRows > 0 && threePane.bodyRows < focusedThreeTallRows) {
      missing.push(`focused three pane body rows >= ${focusedThreeTallRows}`);
    }
    if (threePane.visibleRows < minPaneRows) missing.push(`three pane visible rows >= ${minPaneRows}`);
    if (threePane.visibleMaxColumns < minVisibleColumns) {
      missing.push(`three pane visible columns >= ${minVisibleColumns}`);
    }
    if (!rendererUnavailable && threeRenderedCells > 0) {
      const minRenderedCells = paneBodyRenderCellMinimum(threePane);
      const cappedMinRenderedCells = threeRenderCap > 0
        ? Math.min(minRenderedCells, Math.max(1, Math.floor(threeRenderCap * 0.9)))
        : minRenderedCells;
      if (cappedMinRenderedCells >= 1_000 && threeRenderedCells < cappedMinRenderedCells) {
        missing.push(`three rendered cells >= ${cappedMinRenderedCells}`);
      }
    }
  }
  return {
    passed: missing.length === 0 && forbidden.length === 0 && nonBlankRows >= Math.min(4, options.rows),
    columns: options.columns,
    rows: options.rows,
    screenLines: lines,
    missing,
    forbidden,
    statusLine,
    threeLine,
    nonBlankRows,
    outputBytes: new TextEncoder().encode(output).byteLength,
    truecolorBackgroundWrites,
    finalTruecolorBackgroundRows: replay.truecolorBackgroundRows,
    finalTruecolorBackgroundMaxColumns: replay.truecolorBackgroundMaxColumns,
    threeRenderedCells,
    threePane,
  };
}

export function inspectWorkbenchFullscreenVisualSmokeOutput(
  output: string,
  options: {
    columns: number;
    rows: number;
    minCells?: number;
    minTruecolorRows?: number;
    minTruecolorColumns?: number;
    requireRenderer?: boolean;
  },
): WorkbenchFullscreenVisualSmokeResult {
  const base = inspectWorkbenchVisualSmokeOutput(output, options);
  const replay = replayWorkbenchStyledScreen(output, options);
  const cellMatch = base.threeLine.match(FULLSCREEN_THREE_CELL_PATTERN);
  const fullscreenCells = cellMatch ? Number.parseInt(cellMatch[1]!, 10) : 0;
  const fullscreenCap = cellMatch && cellMatch[2] ? Number.parseInt(cellMatch[2], 10) : fullscreenCells;
  const truecolorBackgroundRows = base.finalTruecolorBackgroundRows;
  const truecolorBackgroundMaxColumns = base.finalTruecolorBackgroundMaxColumns;
  const bodyTruecolor = threeBodyTruecolorCoverage(base.screenLines, replay.truecolorStyled);
  const missing = [...base.missing];
  const fullscreenBodyMinCells = fullscreenBodyRenderCellMinimum(base.threePane);
  const defaultMinCells = fullscreenBodyMinCells > 0 ? Math.min(3_000, fullscreenBodyMinCells) : 3_000;
  const minCells = Math.max(1, Math.floor(options.minCells ?? defaultMinCells), fullscreenBodyMinCells);
  const minTruecolorRows = Math.max(1, Math.floor(options.minTruecolorRows ?? Math.min(12, options.rows)));
  const minTruecolorColumns = Math.max(1, Math.floor(options.minTruecolorColumns ?? options.columns * 0.75));
  const rendererUnavailable = THREE_RENDERER_UNAVAILABLE_PATTERN.test(base.screenLines.join("\n"));
  if (options.requireRenderer && rendererUnavailable) {
    missing.push("three renderer telemetry");
  }
  const bodyVisible = threeBodyVisibleCoverage(base.screenLines);
  if (!rendererUnavailable && fullscreenCells < minCells) missing.push(`fullscreen three cells >= ${minCells}`);
  if (truecolorBackgroundRows < minTruecolorRows) missing.push(`truecolor rows >= ${minTruecolorRows}`);
  if (truecolorBackgroundMaxColumns < minTruecolorColumns) {
    missing.push(`truecolor columns >= ${minTruecolorColumns}`);
  }
  if (bodyTruecolor.rows < minTruecolorRows) missing.push(`three body truecolor rows >= ${minTruecolorRows}`);
  if (bodyTruecolor.maxColumns < minTruecolorColumns) {
    missing.push(`three body truecolor columns >= ${minTruecolorColumns}`);
  }
  if (!rendererUnavailable && bodyVisible.rows < Math.min(2, minTruecolorRows)) {
    missing.push(`three body visible rows >= ${Math.min(2, minTruecolorRows)}`);
  }
  if (!rendererUnavailable && bodyVisible.maxColumns < Math.max(1, Math.floor(minTruecolorColumns * 0.08))) {
    missing.push(`three body visible columns >= ${Math.max(1, Math.floor(minTruecolorColumns * 0.08))}`);
  }
  let minVisibleCells = 0;
  if (!rendererUnavailable && fullscreenCells >= 1_000) {
    const largeFullscreenPane = bodyTruecolor.rows >= 12 && bodyTruecolor.maxColumns >= minTruecolorColumns;
    minVisibleCells = largeFullscreenPane
      ? Math.max(1, Math.floor(fullscreenCells * 0.44))
      : Math.max(1, Math.min(300, Math.floor(fullscreenCells * 0.05)));
    if (bodyVisible.cells < minVisibleCells) {
      missing.push(`three body visible cells >= ${minVisibleCells}`);
    }
  }
  const fullscreen = fullscreenCells >= minCells && truecolorBackgroundRows >= minTruecolorRows &&
    truecolorBackgroundMaxColumns >= minTruecolorColumns && bodyTruecolor.rows >= minTruecolorRows &&
    bodyTruecolor.maxColumns >= minTruecolorColumns && bodyVisible.rows >= Math.min(2, minTruecolorRows) &&
    bodyVisible.maxColumns >= Math.max(1, Math.floor(minTruecolorColumns * 0.08)) &&
    bodyVisible.cells >= minVisibleCells;
  return {
    ...base,
    passed: base.forbidden.length === 0 && missing.length === 0,
    missing,
    fullscreen,
    fullscreenCells,
    fullscreenCap,
    fullscreenBodyMinCells,
    truecolorBackgroundRows,
    truecolorBackgroundMaxColumns,
    bodyTruecolorBackgroundRows: bodyTruecolor.rows,
    bodyTruecolorBackgroundMaxColumns: bodyTruecolor.maxColumns,
    bodyVisibleRows: bodyVisible.rows,
    bodyVisibleMaxColumns: bodyVisible.maxColumns,
    bodyVisibleCells: bodyVisible.cells,
  };
}

function fullscreenBodyRenderCellMinimum(coverage: WorkbenchThreePaneCoverage | undefined): number {
  return paneBodyRenderCellMinimum(coverage);
}

function paneBodyRenderCellMinimum(coverage: WorkbenchThreePaneCoverage | undefined): number {
  if (!coverage?.found || coverage.bodyRows <= 0 || coverage.bodyColumns <= 0) return 0;
  const sceneRows = Math.max(1, coverage.bodyRows - 1);
  return sceneRows * coverage.bodyColumns;
}

export function isTransientWorkbenchThreeResizeResult(
  result: Pick<WorkbenchVisualSmokeResult, "forbidden" | "missing">,
): boolean {
  if (result.forbidden.length > 0 || result.missing.length === 0) return false;
  return result.missing.every((missing) =>
    missing === "three telemetry line" ||
    missing.startsWith("fullscreen three cells ") ||
    missing.startsWith("three body truecolor ") ||
    missing.startsWith("three body visible ") ||
    missing.startsWith("three pane truecolor ") ||
    missing.startsWith("three pane visible ") ||
    missing.startsWith("three rendered cells ")
  );
}

function threeBodyTruecolorCoverage(
  lines: readonly string[],
  truecolorBackground: readonly (readonly boolean[])[],
): { rows: number; maxColumns: number } {
  const telemetryRow = lines.findIndex((line) => line.includes("fps") && line.includes("live"));
  if (telemetryRow < 0) {
    const pane = inspectWorkbenchThreePaneCoverage(lines, truecolorBackground);
    return pane?.found
      ? { rows: pane.truecolorRows, maxColumns: pane.truecolorMaxColumns }
      : { rows: 0, maxColumns: 0 };
  }
  const endRow = findThreeBodyEndRow(lines, telemetryRow + 1);
  let rows = 0;
  let maxColumns = 0;
  for (let row = telemetryRow + 1; row < endRow; row += 1) {
    const line = lines[row] ?? "";
    const rowMask = truecolorBackground[row] ?? [];
    const leftBorder = line.indexOf("│");
    const rightBorder = line.lastIndexOf("│");
    const start = leftBorder >= 0 ? leftBorder + 1 : 0;
    const end = rightBorder > start ? rightBorder : rowMask.length;
    let count = 0;
    for (let column = start; column < end; column += 1) {
      if (rowMask[column]) count += 1;
    }
    if (count > 0) rows += 1;
    if (count > maxColumns) maxColumns = count;
  }
  return { rows, maxColumns };
}

function findThreeBodyEndRow(lines: readonly string[], startRow: number): number {
  for (let row = startRow; row < lines.length; row += 1) {
    const line = lines[row] ?? "";
    if (line.includes("└") || line.trimStart().startsWith("windows [") || line.includes("F10 menu")) return row;
  }
  return lines.length;
}

function threeBodyVisibleCoverage(lines: readonly string[]): { rows: number; maxColumns: number; cells: number } {
  const telemetryRow = lines.findIndex((line) => line.includes("fps") && line.includes("live"));
  if (telemetryRow < 0) return { rows: 0, maxColumns: 0, cells: 0 };
  const endRow = findThreeBodyEndRow(lines, telemetryRow + 1);
  let rows = 0;
  let maxColumns = 0;
  let cells = 0;
  for (let row = telemetryRow + 1; row < endRow; row += 1) {
    const line = lines[row] ?? "";
    const leftBorder = line.indexOf("│");
    const rightBorder = line.lastIndexOf("│");
    const start = leftBorder >= 0 ? leftBorder + 1 : 0;
    const end = rightBorder > start ? rightBorder : line.length;
    let count = 0;
    for (let column = start; column < end; column += 1) {
      if ((line[column] ?? " ") !== " ") count += 1;
    }
    if (count > 0) rows += 1;
    maxColumns = Math.max(maxColumns, count);
    cells += count;
  }
  return { rows, maxColumns, cells };
}

export function formatWorkbenchVisualSmokeResult(result: WorkbenchVisualSmokeResult): string {
  return [
    "# Workbench Visual Smoke",
    "",
    `Status: ${result.passed ? "pass" : "fail"}`,
    `Size: ${result.columns}x${result.rows}`,
    `Output: ${result.outputBytes} bytes`,
    `Truecolor backgrounds: ${result.truecolorBackgroundWrites}`,
    `Three rendered cells: ${result.threeRenderedCells}`,
    `Final truecolor rows: ${result.finalTruecolorBackgroundRows}`,
    `Final truecolor max columns: ${result.finalTruecolorBackgroundMaxColumns}`,
    `Three pane truecolor: ${
      result.threePane?.found
        ? `${result.threePane.truecolorRows} rows, ${result.threePane.truecolorMaxColumns}/${result.threePane.bodyColumns} columns`
        : "not found"
    }`,
    `Nonblank rows: ${result.nonBlankRows}`,
    `Missing: ${result.missing.join(", ") || "-"}`,
    `Forbidden: ${result.forbidden.join(", ") || "-"}`,
    "",
    "Status line:",
    result.statusLine,
    "",
    "Three line:",
    result.threeLine,
  ].join("\n");
}

export function formatWorkbenchFullscreenVisualSmokeResult(result: WorkbenchFullscreenVisualSmokeResult): string {
  return [
    "# Workbench Fullscreen Visual Smoke",
    "",
    `Status: ${result.passed ? "pass" : "fail"}`,
    `Size: ${result.columns}x${result.rows}`,
    `Output: ${result.outputBytes} bytes`,
    `Fullscreen cells: ${result.fullscreenCells}/${result.fullscreenCap}`,
    `Truecolor rows: ${result.truecolorBackgroundRows}`,
    `Truecolor max columns: ${result.truecolorBackgroundMaxColumns}`,
    `Three body truecolor rows: ${result.bodyTruecolorBackgroundRows}`,
    `Three body truecolor max columns: ${result.bodyTruecolorBackgroundMaxColumns}`,
    `Three body visible cells: ${result.bodyVisibleCells}`,
    `Three pane truecolor: ${
      result.threePane?.found
        ? `${result.threePane.truecolorRows} rows, ${result.threePane.truecolorMaxColumns}/${result.threePane.bodyColumns} columns`
        : "not found"
    }`,
    `Final truecolor rows: ${result.finalTruecolorBackgroundRows}`,
    `Truecolor backgrounds: ${result.truecolorBackgroundWrites}`,
    `Nonblank rows: ${result.nonBlankRows}`,
    `Missing: ${result.missing.join(", ") || "-"}`,
    `Forbidden: ${result.forbidden.join(", ") || "-"}`,
    "",
    "Three line:",
    result.threeLine,
    "",
    "Status line:",
    result.statusLine,
  ].join("\n");
}

function parseThreeRenderedCells(line: string): number {
  const match = line.match(THREE_RENDERED_CELL_PATTERN);
  return match ? Number.parseInt(match[1]!, 10) : 0;
}

function parseThreeRenderCap(line: string): number {
  const match = line.match(THREE_RENDER_CAP_PATTERN);
  return match ? Number.parseInt(match[1]!, 10) : 0;
}

function findWorkbenchThreePaneTelemetryLine(
  lines: readonly string[],
  pane: WorkbenchThreePaneCoverage | undefined,
): string | undefined {
  if (!pane?.found) return lines.find((line) => line.includes("fps") && line.includes("live"));
  for (let row = pane.top + 1; row < pane.bottom; row += 1) {
    const line = lines[row] ?? "";
    const segment = line.slice(pane.left, pane.right + 1);
    if (segment.includes("fps") && segment.includes("live")) return segment;
    if (line.includes("fps") && line.includes("live")) return line;
  }
  return undefined;
}

export function replayWorkbenchScreen(
  output: string,
  options: { columns: number; rows: number },
): string[][] {
  return replayWorkbenchStyledScreen(output, options).screen;
}

export function inspectWorkbenchThreePaneCoverage(
  lines: readonly string[],
  truecolorBackground: readonly (readonly boolean[])[],
): WorkbenchThreePaneCoverage | undefined {
  const top = findWorkbenchThreePaneTop(lines);
  if (top < 0) return undefined;
  const line = lines[top] ?? "";
  const left = line.indexOf("┌─ THREE ASCII");
  const right = line.lastIndexOf("┐");
  if (left < 0 || right <= left) return undefined;
  const bottom = findWorkbenchThreePaneBottom(lines, top, left, right);
  if (bottom <= top) return undefined;
  const bodyStart = Math.min(bottom, findWorkbenchThreePaneBodyStart(lines, top, bottom));
  const bodyRows = Math.max(0, bottom - bodyStart);
  const bodyColumns = Math.max(0, right - left - 1);
  let truecolorRows = 0;
  let truecolorMaxColumns = 0;
  let truecolorCells = 0;
  let visibleRows = 0;
  let visibleMaxColumns = 0;
  let visibleCells = 0;
  for (let row = bodyStart; row < bottom; row += 1) {
    const mask = truecolorBackground[row] ?? [];
    const line = lines[row] ?? "";
    let rowCells = 0;
    let rowVisibleCells = 0;
    for (let column = left + 1; column < right; column += 1) {
      if (mask[column]) rowCells += 1;
      if ((line[column] ?? " ") !== " ") rowVisibleCells += 1;
    }
    if (rowCells > 0) truecolorRows += 1;
    if (rowVisibleCells > 0) visibleRows += 1;
    truecolorCells += rowCells;
    visibleCells += rowVisibleCells;
    truecolorMaxColumns = Math.max(truecolorMaxColumns, rowCells);
    visibleMaxColumns = Math.max(visibleMaxColumns, rowVisibleCells);
  }
  return {
    found: true,
    top,
    left,
    right,
    bottom,
    bodyStart,
    bodyRows,
    bodyColumns,
    truecolorRows,
    truecolorMaxColumns,
    truecolorCells,
    visibleRows,
    visibleMaxColumns,
    visibleCells,
  };
}

function findWorkbenchThreePaneTop(lines: readonly string[]): number {
  for (let row = lines.length - 1; row >= 0; row -= 1) {
    if ((lines[row] ?? "").includes("┌─ THREE ASCII")) return row;
  }
  return -1;
}

function findWorkbenchThreePaneBottom(lines: readonly string[], top: number, left: number, right: number): number {
  for (let row = top + 1; row < lines.length; row += 1) {
    const line = lines[row] ?? "";
    if (line.slice(Math.max(0, left), right + 1).includes("└")) return row;
  }
  return lines.length;
}

function findWorkbenchThreePaneBodyStart(lines: readonly string[], top: number, bottom: number): number {
  for (let row = top + 1; row < bottom; row += 1) {
    const line = lines[row] ?? "";
    if (line.includes("fps") && line.includes("live")) return row + 1;
  }
  return Math.min(bottom, top + 3);
}

export function replayWorkbenchStyledScreen(
  output: string,
  options: { columns: number; rows: number },
): WorkbenchStyledScreenReplay {
  const columns = Math.max(1, Math.floor(options.columns));
  const rows = Math.max(1, Math.floor(options.rows));
  const screen = Array.from({ length: rows }, () => Array.from({ length: columns }, () => " "));
  const truecolorForeground = Array.from({ length: rows }, () => Array.from({ length: columns }, () => false));
  const truecolorBackground = Array.from({ length: rows }, () => Array.from({ length: columns }, () => false));
  const truecolorStyled = Array.from({ length: rows }, () => Array.from({ length: columns }, () => false));
  const state: ReplayState = { row: 0, column: 0, truecolorForeground: false, truecolorBackground: false };
  let index = 0;
  while (index < output.length) {
    const char = output[index]!;
    if (char === "\x1b") {
      const skipped = skipEscape(
        output,
        index,
        screen,
        truecolorForeground,
        truecolorBackground,
        truecolorStyled,
        state,
      );
      if (skipped > index) {
        index = skipped;
        continue;
      }
    }
    if (char === "\r") {
      state.column = 0;
      index += 1;
      continue;
    }
    if (char === "\n") {
      state.row = Math.min(rows - 1, state.row + 1);
      state.column = 0;
      index += 1;
      continue;
    }
    const codePoint = output.codePointAt(index) ?? char.charCodeAt(0);
    const glyph = String.fromCodePoint(codePoint);
    if (glyph >= " ") {
      screen[state.row]![state.column] = glyph;
      truecolorForeground[state.row]![state.column] = state.truecolorForeground;
      truecolorBackground[state.row]![state.column] = state.truecolorBackground;
      truecolorStyled[state.row]![state.column] = state.truecolorForeground || state.truecolorBackground;
      state.column += 1;
      if (state.column >= columns) {
        state.column = columns - 1;
      }
    }
    index += codePoint > 0xffff ? 2 : 1;
  }
  return {
    screen,
    truecolorForeground,
    truecolorBackground,
    truecolorStyled,
    truecolorBackgroundRows: truecolorBackground.filter((row) => row.some(Boolean)).length,
    truecolorBackgroundMaxColumns: truecolorBackground.reduce(
      (max, row) => Math.max(max, row.reduce((count, cell) => count + (cell ? 1 : 0), 0)),
      0,
    ),
  };
}

function skipEscape(
  output: string,
  start: number,
  screen: string[][],
  truecolorForeground: boolean[][],
  truecolorBackground: boolean[][],
  truecolorStyled: boolean[][],
  state: ReplayState,
): number {
  const next = output[start + 1];
  if (next === "[") {
    return applyCsi(output, start, screen, truecolorForeground, truecolorBackground, truecolorStyled, state);
  }
  if (next === "]") return skipOsc(output, start);
  if (next === "P" || next === "_") return skipStringTerminatedEscape(output, start);
  return start + 1;
}

function applyCsi(
  output: string,
  start: number,
  screen: string[][],
  truecolorForeground: boolean[][],
  truecolorBackground: boolean[][],
  truecolorStyled: boolean[][],
  state: ReplayState,
): number {
  let index = start + 2;
  while (index < output.length) {
    const code = output.charCodeAt(index);
    if (code >= 0x40 && code <= 0x7e) {
      applyCsiCommand(
        output.slice(start + 2, index),
        output[index]!,
        screen,
        truecolorForeground,
        truecolorBackground,
        truecolorStyled,
        state,
      );
      return index + 1;
    }
    index += 1;
  }
  return output.length;
}

function applyCsiCommand(
  raw: string,
  command: string,
  screen: string[][],
  truecolorForeground: boolean[][],
  truecolorBackground: boolean[][],
  truecolorStyled: boolean[][],
  state: ReplayState,
): void {
  const params = raw.replace(/^\?/, "").split(";");
  const rows = screen.length;
  const columns = screen[0]?.length ?? 0;
  switch (command) {
    case "H":
    case "f":
      state.row = clamp(numberParam(params[0], 1) - 1, 0, rows - 1);
      state.column = clamp(numberParam(params[1], 1) - 1, 0, columns - 1);
      return;
    case "G":
      state.column = clamp(numberParam(params[0], 1) - 1, 0, columns - 1);
      return;
    case "A":
      state.row = clamp(state.row - numberParam(params[0], 1), 0, rows - 1);
      return;
    case "B":
      state.row = clamp(state.row + numberParam(params[0], 1), 0, rows - 1);
      return;
    case "C":
      state.column = clamp(state.column + numberParam(params[0], 1), 0, columns - 1);
      return;
    case "D":
      state.column = clamp(state.column - numberParam(params[0], 1), 0, columns - 1);
      return;
    case "J":
      if (numberParam(params[0], 0) === 2 || numberParam(params[0], 0) === 3) {
        clearScreen(screen);
        clearBooleanScreen(truecolorForeground);
        clearBooleanScreen(truecolorBackground);
        clearBooleanScreen(truecolorStyled);
      }
      return;
    case "K":
      clearRow(screen[state.row]!, state.column, numberParam(params[0], 0));
      clearBooleanRow(truecolorForeground[state.row]!, state.column, numberParam(params[0], 0));
      clearBooleanRow(truecolorBackground[state.row]!, state.column, numberParam(params[0], 0));
      clearBooleanRow(truecolorStyled[state.row]!, state.column, numberParam(params[0], 0));
      return;
    case "m":
      state.truecolorForeground = nextTruecolorForegroundState(raw, state.truecolorForeground);
      state.truecolorBackground = nextTruecolorBackgroundState(raw, state.truecolorBackground);
      return;
  }
  if (raw === "?1049h") {
    clearScreen(screen);
    clearBooleanScreen(truecolorForeground);
    clearBooleanScreen(truecolorBackground);
    clearBooleanScreen(truecolorStyled);
  }
}

function skipOsc(output: string, start: number): number {
  let index = start + 2;
  while (index < output.length) {
    if (output[index] === "\x07") return index + 1;
    if (output[index] === "\x1b" && output[index + 1] === "\\") return index + 2;
    index += 1;
  }
  return output.length;
}

function skipStringTerminatedEscape(output: string, start: number): number {
  let index = start + 2;
  while (index < output.length) {
    if (output[index] === "\x1b" && output[index + 1] === "\\") return index + 2;
    index += 1;
  }
  return output.length;
}

function quoteCommand(command: readonly string[]): string {
  return command.map((part) => `'${part.replaceAll("'", "'\\''")}'`).join(" ");
}

function quotePythonList(values: readonly string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

function pythonOptionalNumber(value: number | undefined): string {
  return value === undefined ? "None" : String(Math.max(1, Math.floor(value)));
}

function clearScreen(screen: string[][]): void {
  for (const row of screen) row.fill(" ");
}

function clearBooleanScreen(screen: boolean[][]): void {
  for (const row of screen) row.fill(false);
}

function clearRow(row: string[], column: number, mode: number): void {
  const start = mode === 1 || mode === 2 ? 0 : Math.max(0, column);
  const end = mode === 0 || mode === 2 ? row.length : Math.min(row.length, column + 1);
  for (let index = start; index < end; index += 1) row[index] = " ";
}

function clearBooleanRow(row: boolean[], column: number, mode: number): void {
  const start = mode === 1 || mode === 2 ? 0 : Math.max(0, column);
  const end = mode === 0 || mode === 2 ? row.length : Math.min(row.length, column + 1);
  for (let index = start; index < end; index += 1) row[index] = false;
}

function nextTruecolorBackgroundState(raw: string, current: boolean): boolean {
  const params = raw.replace(/^\?/, "").split(";").map((value) => Number.parseInt(value, 10));
  for (let index = 0; index < params.length; index += 1) {
    const value = params[index];
    if (value === 0) return false;
    if (value === 49) current = false;
    if (value === 48 && params[index + 1] === 2) current = true;
  }
  return current;
}

function nextTruecolorForegroundState(raw: string, current: boolean): boolean {
  const params = raw.replace(/^\?/, "").split(";").map((value) => Number.parseInt(value, 10));
  for (let index = 0; index < params.length; index += 1) {
    const value = params[index];
    if (value === 0) return false;
    if (value === 39) current = false;
    if (value === 38 && params[index + 1] === 2) current = true;
  }
  return current;
}

function numberParam(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function countOccurrences(value: string, needle: string): number {
  let count = 0;
  let index = 0;
  while (true) {
    index = value.indexOf(needle, index);
    if (index < 0) return count;
    count += 1;
    index += needle.length;
  }
}

export function countTruecolorBackgroundRows(output: string): number {
  const rows = new Set<number>();
  let row = 1;
  let index = 0;
  while (index < output.length) {
    const char = output[index]!;
    if (char === "\x1b") {
      const applied = applyTruecolorRowCsi(output, index, rows, row);
      if (applied.next > index) {
        row = applied.row;
        index = applied.next;
        continue;
      }
    }
    if (output.startsWith("\x1b[48;2;", index)) rows.add(row);
    if (char === "\n") row += 1;
    index += 1;
  }
  return rows.size;
}

function applyTruecolorRowCsi(
  output: string,
  start: number,
  rows: Set<number>,
  currentRow: number,
): { row: number; next: number } {
  if (output[start + 1] !== "[") return { row: currentRow, next: start };
  let index = start + 2;
  while (index < output.length) {
    const code = output.charCodeAt(index);
    if (code >= 0x40 && code <= 0x7e) {
      const command = output[index]!;
      const raw = output.slice(start + 2, index);
      if (command === "H" || command === "f") {
        const row = numberParam(raw.replace(/^\?/, "").split(";")[0], 1);
        return { row, next: index + 1 };
      }
      if (command === "B") return { row: currentRow + numberParam(raw, 1), next: index + 1 };
      if (command === "A") return { row: Math.max(1, currentRow - numberParam(raw, 1)), next: index + 1 };
      if (command === "m" && raw.includes("48;2;")) rows.add(currentRow);
      return { row: currentRow, next: index + 1 };
    }
    index += 1;
  }
  return { row: currentRow, next: output.length };
}
