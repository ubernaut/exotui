import { assertEquals } from "./deps.ts";
import { commandDisabledBoolean as commandDisabled } from "./test_commands.ts";
import {
  formatTerminalOutputLine,
  TerminalOutputController,
  visibleTerminalOutputLines,
} from "../src/components/terminal_output.ts";
import { bindTerminalCommands, type TerminalCommandAction, terminalCommands } from "../src/app/terminal_commands.ts";
import {
  encodeTerminalKeyPress,
  encodeTerminalMouse,
  encodeTerminalPaste,
  inspectTerminalPaste,
  routeTerminalKeyPress,
  routeTerminalMouse,
  routeTerminalPaste,
  terminalMouseRoutingFromPrivateModes,
} from "../src/app/terminal_input.ts";
import { CommandRegistry } from "../src/app/commands.ts";
import {
  formatProcessCommandLine,
  type ProcessSessionChild,
  ProcessSessionController,
  type ProcessSessionInspection,
} from "../src/runtime/process_session.ts";
import { createProcessTerminalBackend, type TerminalSessionHandleInspection } from "../src/runtime/terminal_backend.ts";
import {
  formatTerminalOutputHint,
  formatTerminalOutputWindowTitle,
  formatTerminalShellHint,
  formatTerminalShellStatusLine,
  formatTerminalShellWindowTitle,
  summarizeTerminalStatus,
  terminalInputModeDisplayLabel,
  terminalStatusFields,
  terminalStatusTone,
} from "../src/runtime/terminal_status.ts";
import { denoTaskTerminalTemplate, type TerminalSessionDescriptor } from "../src/runtime/terminal_templates.ts";
import { DiagnosticsCollector } from "../src/runtime/diagnostics.ts";
import { BoundedOutputLineBuffer, MAX_PENDING_OUTPUT_LINE_LENGTH } from "../src/runtime/output_line_buffer.ts";
import type { Key, KeyPressEvent, MousePressEvent, MouseScrollEvent, PasteEvent } from "../src/input_reader/types.ts";

Deno.test("BoundedOutputLineBuffer incrementally splits lines and caps unterminated tails", () => {
  const buffer = new BoundedOutputLineBuffer();
  const lines: string[] = [];

  assertEquals(buffer.append("first\r", (line) => lines.push(line)), false);
  assertEquals(buffer.append("\nsecond\n", (line) => lines.push(line)), false);
  assertEquals(lines, ["first", "second"]);
  assertEquals(buffer.append("a".repeat(MAX_PENDING_OUTPUT_LINE_LENGTH + 8), (line) => lines.push(line)), true);
  assertEquals(buffer.pendingLength, MAX_PENDING_OUTPUT_LINE_LENGTH);
  assertEquals(buffer.append("tail", (line) => lines.push(line)), false);
  assertEquals(buffer.pendingLength, MAX_PENDING_OUTPUT_LINE_LENGTH);
  buffer.finish((line) => lines.push(line));
  assertEquals(lines.at(-1)?.length, MAX_PENDING_OUTPUT_LINE_LENGTH);
  assertEquals(lines.at(-1)?.endsWith("tail"), true);
});

Deno.test("TerminalOutputController bounds stream-tagged scrollback and follow mode", () => {
  const output = new TerminalOutputController({ limit: 3 });

  output.appendText("system", "boot", 1);
  output.appendMany([
    { source: "stdout", text: "ready", timestamp: 2 },
    { source: "stderr", text: "warn", timestamp: 3 },
    { source: "stdout", text: "done", timestamp: 4 },
  ]);

  assertEquals(output.inspect(2), {
    lines: [
      { source: "stdout", text: "ready", timestamp: 2 },
      { source: "stderr", text: "warn", timestamp: 3 },
      { source: "stdout", text: "done", timestamp: 4 },
    ],
    lineCount: 3,
    visible: [
      { source: "stderr", text: "warn", timestamp: 3 },
      { source: "stdout", text: "done", timestamp: 4 },
    ],
    limit: 3,
    follow: true,
    empty: false,
  });

  output.setFollow(false);
  assertEquals(visibleTerminalOutputLines(output.lines.peek(), 2, false), [
    { source: "stdout", text: "ready", timestamp: 2 },
    { source: "stderr", text: "warn", timestamp: 3 },
  ]);
  assertEquals(formatTerminalOutputLine({ source: "stderr", text: "warn" }, { sourcePrefix: true }), "[err] warn");
  output.dispose();

  const metadataLine = { source: "stdout" as const, text: "tagged", timestamp: 5, tag: "preserved in view" };
  const metadataOutput = new TerminalOutputController({ lines: [metadataLine] });
  assertEquals(metadataOutput.visible(1), [metadataLine]);
  assertEquals(metadataOutput.inspect().lines, [{ source: "stdout", text: "tagged", timestamp: 5 }]);
  metadataOutput.dispose();
});

Deno.test("summarizeTerminalStatus formats process session state", () => {
  const output = new TerminalOutputController();
  const source: ProcessSessionInspection = {
    command: { command: "deno", args: ["task", "health"], cwd: "/repo" },
    commandLine: "deno task health",
    status: "failed",
    running: false,
    exit: { code: 1, success: false, durationMs: 42 },
    output: output.inspect(),
  };

  assertEquals(summarizeTerminalStatus(source, { backendId: "process" }), {
    title: undefined,
    status: "failed",
    running: false,
    backendId: "process",
    pty: false,
    backendKind: "process",
    commandLine: "deno task health",
    cwd: "/repo",
    columns: undefined,
    rows: undefined,
    exitCode: 1,
    exitSignal: undefined,
    detached: false,
    reconnectable: false,
    fields: ["FAILED", "PROCESS FALLBACK", "backend:process", "exit:1", "cwd:/repo", "cmd:deno task health"],
    text: "FAILED  PROCESS FALLBACK  backend:process  exit:1  cwd:/repo  cmd:deno task health",
  });
  output.dispose();
});

Deno.test("summarizeTerminalStatus formats backend dimensions and exit signals", () => {
  const source: TerminalSessionHandleInspection = {
    id: "session-1",
    backendId: "pty",
    pty: true,
    commandLine: "bash -l",
    status: "cancelled",
    running: false,
    columns: 120,
    rows: 32,
    resizeSupported: true,
    exit: { code: 143, signal: "SIGTERM", success: false, durationMs: 100 },
  };

  const summary = summarizeTerminalStatus(source, {
    title: "Shell",
    detached: true,
    reconnectable: true,
    width: 38,
  });
  assertEquals(summary.fields, [
    "Shell",
    "CANCELLED",
    "PTY",
    "backend:pty",
    "120x32",
    "exit:143/SIGTERM",
    "detached",
    "reconnectable",
    "cmd:bash -l",
  ]);
  assertEquals(summary.text, "Shell  CANCELLED  PTY  backend:pty ...");
});

Deno.test("summarizeTerminalStatus reads workspace descriptor metadata", () => {
  const descriptor: TerminalSessionDescriptor = {
    id: "health",
    title: "Health Task",
    template: denoTaskTerminalTemplate({ task: "health", cwd: "/repo", reconnectable: true }),
    backendId: "process",
    pty: false,
    commandLine: "deno task health",
    status: "running",
    running: true,
    columns: 100,
    rows: 24,
    reconnectable: true,
    restartPolicy: "on-failure",
    createdAt: 1,
    updatedAt: 2,
  };

  assertEquals(summarizeTerminalStatus(descriptor, { includeCommand: false }).fields, [
    "Health Task",
    "RUNNING",
    "PROCESS FALLBACK",
    "backend:process",
    "100x24",
    "cwd:/repo",
    "reconnectable",
  ]);
  assertEquals(terminalStatusFields({ status: "idle", running: false, includeCommand: false }), ["IDLE"]);
});

Deno.test("formatTerminalOutputWindowTitle includes input mode and status", () => {
  assertEquals(
    formatTerminalOutputWindowTitle({ status: "running" }, { mode: "raw" }),
    "Terminal Output RAW RUNNING",
  );
  assertEquals(
    formatTerminalOutputWindowTitle({ status: "starting" }, { mode: "wb", prefix: "Process" }),
    "Process WB STARTING",
  );
});

Deno.test("formatTerminalShellWindowTitle includes OSC runtime titles", () => {
  assertEquals(
    formatTerminalShellWindowTitle({ status: "running", title: "vim main.ts" }, { mode: "raw" }),
    "Shell RAW RUNNING · vim main.ts",
  );
  assertEquals(
    formatTerminalShellWindowTitle({ status: "idle", title: "   " }, { mode: "wb" }),
    "Shell WB IDLE",
  );
});

Deno.test("terminal status presenters expose stable tone and mode labels", () => {
  assertEquals(terminalStatusTone("running"), "good");
  assertEquals(terminalStatusTone("failed"), "danger");
  assertEquals(terminalStatusTone("cancelled"), "warning");
  assertEquals(terminalStatusTone("starting"), "accent");
  assertEquals(terminalStatusTone("idle"), "muted");
  assertEquals(terminalInputModeDisplayLabel("raw"), "RAW INPUT");
  assertEquals(terminalInputModeDisplayLabel("raw", { rawLabel: "RAW SHELL" }), "RAW SHELL");
  assertEquals(terminalInputModeDisplayLabel("workbench"), "WORKBENCH");
});

Deno.test("formatTerminalShellStatusLine composes backend command and scrollback state", () => {
  assertEquals(
    formatTerminalShellStatusLine({
      mode: "RAW SHELL",
      status: "running",
      pty: true,
      backendLabel: "sigma-pty",
      commandLine: "bash -l",
      scrollbackOffset: 24,
      scrollbackViewportRows: 10,
      scrollbackTotalRows: 100,
    }),
    "RAW SHELL RUNNING PTY sigma-pty · bash -l · rows 25-34/100",
  );
  assertEquals(
    formatTerminalShellStatusLine({
      mode: "COPY MODE",
      status: "starting",
      pty: false,
      commandLine: "bash",
      scrollbackOffset: 0,
      scrollbackViewportRows: 20,
      scrollbackTotalRows: 0,
    }),
    "COPY MODE STARTING PROCESS FALLBACK pending · bash · rows 0-0/0",
  );
});

Deno.test("terminal hint formatters cover process output shell and copy modes", () => {
  assertEquals(
    formatTerminalOutputHint("raw"),
    "raw input: printable keys go to child process  Esc workbench mode  Ctrl+C reserved",
  );
  assertEquals(
    formatTerminalOutputHint("workbench"),
    "keys: P run  S stop  U restart  K clear  V follow  Y copy  I raw input",
  );
  assertEquals(
    formatTerminalShellHint({ inputMode: "raw" }),
    "raw shell input: keys go to shell  Ctrl+C interrupts shell  Esc returns to Workbench",
  );
  assertEquals(
    formatTerminalShellHint({ inputMode: "workbench" }),
    "keys: P start  S stop  U restart  K clear  I raw input  PageUp copy scroll",
  );
  assertEquals(
    formatTerminalShellHint({ inputMode: "raw", copyMode: true }),
    "copy mode: PageUp/PageDown scroll  Space select  Shift+Up/Down extend  C copy  Esc live input",
  );
});

Deno.test("ProcessSessionController streams stdout stderr and exit metadata", async () => {
  const raw: string[] = [];
  const args = ["--stdout", "--stderr"];
  const env = { MODE: "test" };
  const session = new ProcessSessionController({
    command: "demo",
    args,
    env,
    now: () => 10,
    spawn: () => completedChild("alpha\n", "beta\n", { code: 0, success: true }),
    onOutputData: (source, data) => {
      raw.push(`${source}:${new TextDecoder().decode(data)}`);
    },
  });
  args[0] = "--mutated";
  env.MODE = "mutated";
  assertEquals(session.command.peek(), {
    command: "demo",
    args: ["--stdout", "--stderr"],
    cwd: undefined,
    env: { MODE: "test" },
  });

  assertEquals(await session.start(), true);

  const inspection = session.inspect();
  assertEquals(inspection.status, "exited");
  assertEquals(inspection.running, false);
  assertEquals(inspection.exit, { code: 0, success: true, durationMs: 0 });
  assertEquals(
    inspection.output.lines.map((line) => [line.source, line.text]),
    [
      ["system", `$ ${formatProcessCommandLine(session.command.peek())}`],
      ["stdout", "alpha"],
      ["stderr", "beta"],
      ["system", "process exited code=0 duration=0ms"],
    ],
  );
  assertEquals(raw, ["stdout:alpha\n", "stderr:beta\n"]);

  await session.dispose();
});

Deno.test("ProcessSessionController can stop a running process", async () => {
  let resolveStatus!: (status: { code: number; signal?: string | null; success: boolean }) => void;
  const status = new Promise<{ code: number; signal?: string | null; success: boolean }>((resolve) => {
    resolveStatus = resolve;
  });
  const session = new ProcessSessionController({
    command: "demo",
    args: ["--long"],
    appendCommandLine: false,
    spawn: () => ({
      stdout: streamFromText("started\n"),
      stderr: streamFromText(""),
      status,
      kill: (signal) => resolveStatus({ code: 143, signal, success: false }),
    }),
  });

  const run = session.start();
  assertEquals(session.running, true);
  assertEquals(await session.stop(), true);
  await run;

  assertEquals(session.inspect().status, "cancelled");
  assertEquals(session.inspect().output.lines.some((line) => line.text.startsWith("sent ")), true);
  await session.dispose();
});

Deno.test("ProcessSessionController reports failed spawn diagnostics", async () => {
  const diagnostics = new DiagnosticsCollector();
  const session = new ProcessSessionController({
    command: "missing-demo",
    args: ["--bad"],
    appendCommandLine: false,
    diagnostics,
    spawn: () => {
      throw new Error("command not found");
    },
  });

  assertEquals(await session.start(), false);
  assertEquals(session.inspect().status, "failed");
  assertEquals(diagnostics.entries().map((entry) => [entry.source, entry.code, entry.severity, entry.detail]), [
    ["process", "spawn-failed", "error", "command not found"],
  ]);

  await session.dispose();
});

Deno.test("terminalCommands run clear follow and copy process sessions", async () => {
  const session = new ProcessSessionController({
    command: "demo",
    args: ["--ok"],
    appendCommandLine: false,
    spawn: () => completedChild("ok\n", "", { code: 0, success: true }),
  });
  const registry = new CommandRegistry<TerminalCommandAction>();
  const actions: TerminalCommandAction[] = [];
  const dispose = bindTerminalCommands(registry, session, {
    id: "build",
    idPrefix: "terminal.build",
    group: "terminal",
  });

  assertEquals(terminalCommands(session).map((command) => [command.id, commandDisabled(command)]), [
    ["terminal.run", false],
    ["terminal.stop", true],
    ["terminal.restart", false],
    ["terminal.clear", true],
    ["terminal.toggleFollow", false],
    ["terminal.copyCommand", false],
  ]);
  assertEquals(registry.list("terminal").map((command) => command.id), [
    "terminal.build.clear",
    "terminal.build.copyCommand",
    "terminal.build.restart",
    "terminal.build.run",
    "terminal.build.stop",
    "terminal.build.toggleFollow",
  ]);

  assertEquals(await registry.execute("terminal.build.run", (action) => void actions.push(action)), true);
  assertEquals(actions[0]!.type, "terminal.run");
  assertEquals(session.inspect().output.lines.some((line) => line.text === "ok"), true);

  assertEquals(await registry.execute("terminal.build.toggleFollow", (action) => void actions.push(action)), true);
  assertEquals(actions[1], {
    type: "terminal.followChanged",
    payload: {
      id: "build",
      follow: false,
      session: session.inspect(),
    },
  });

  assertEquals(await registry.execute("terminal.build.copyCommand", (action) => void actions.push(action)), true);
  const copyAction = actions[2];
  assertEquals(copyAction?.type, "terminal.commandCopied");
  assertEquals(
    copyAction?.type === "terminal.commandCopied" ? copyAction.payload?.commandLine : undefined,
    formatProcessCommandLine(session.command.peek()),
  );

  assertEquals(await registry.execute("terminal.build.clear", (action) => void actions.push(action)), true);
  assertEquals(session.inspect().output.empty, true);

  dispose();
  assertEquals(registry.list("terminal"), []);
  await session.dispose();
});

Deno.test("ProcessSessionController writes encoded input to child stdin", async () => {
  const writes: string[] = [];
  let resolveStatus!: (status: { code: number; signal?: string | null; success: boolean }) => void;
  const status = new Promise<{ code: number; signal?: string | null; success: boolean }>((resolve) => {
    resolveStatus = resolve;
  });
  const session = new ProcessSessionController({
    command: "demo",
    spawn: () => ({
      stdin: writableTextSink(writes),
      stdout: streamFromText(""),
      stderr: streamFromText(""),
      status,
      kill: () => resolveStatus({ code: 143, signal: "SIGTERM", success: false }),
    }),
  });

  const run = session.start();
  assertEquals(await session.writeInput("abc"), true);
  assertEquals(writes, ["abc"]);
  assertEquals(await session.closeInput(), true);
  resolveStatus({ code: 0, success: true });
  await run;
  await session.dispose();
});

Deno.test("ProcessSessionController reports failed input close diagnostics", async () => {
  const diagnostics = new DiagnosticsCollector();
  let resolveStatus!: (status: { code: number; signal?: string | null; success: boolean }) => void;
  const status = new Promise<{ code: number; signal?: string | null; success: boolean }>((resolve) => {
    resolveStatus = resolve;
  });
  const session = new ProcessSessionController({
    command: "demo",
    diagnostics,
    spawn: () => ({
      stdin: failingCloseSink(),
      stdout: streamFromText(""),
      stderr: streamFromText(""),
      status,
      kill: () => resolveStatus({ code: 143, signal: "SIGTERM", success: false }),
    }),
  });

  const run = session.start();
  assertEquals(await session.closeInput(), false);
  assertEquals(diagnostics.entries().map((entry) => [entry.source, entry.code, entry.severity, entry.detail]), [
    ["process", "input-close-failed", "warning", "close denied"],
  ]);
  assertEquals(session.inspect().output.lines.some((line) => line.text === "input close failed: close denied"), true);

  resolveStatus({ code: 0, success: true });
  await run;
  await session.dispose();
});

Deno.test("terminal input routing preserves reserved keys and writes raw mode bytes", async () => {
  const writes: string[] = [];
  let resolveStatus!: (status: { code: number; signal?: string | null; success: boolean }) => void;
  const status = new Promise<{ code: number; signal?: string | null; success: boolean }>((resolve) => {
    resolveStatus = resolve;
  });
  const session = new ProcessSessionController({
    command: "demo",
    spawn: () => ({
      stdin: writableTextSink(writes),
      stdout: streamFromText(""),
      stderr: streamFromText(""),
      status,
      kill: () => resolveStatus({ code: 143, signal: "SIGTERM", success: false }),
    }),
  });
  const run = session.start();

  assertEquals([...encodeTerminalKeyPress(keyPress("up"))!], [...new TextEncoder().encode("\x1b[A")]);
  assertEquals(await routeTerminalKeyPress(session, keyPress("a"), { mode: "workbench" }), {
    routed: false,
    reason: "workbench-mode",
  });
  assertEquals(await routeTerminalKeyPress(session, keyPress("c", { ctrl: true }), { mode: "raw" }), {
    routed: false,
    reason: "reserved",
  });
  assertEquals((await routeTerminalKeyPress(session, keyPress("a"), { mode: "raw" })).reason, "encoded");
  assertEquals((await routeTerminalKeyPress(session, keyPress("return"), { mode: "raw" })).reason, "encoded");
  assertEquals((await routeTerminalPaste(session, paste("paste text"), { mode: "raw" })).reason, "encoded");
  assertEquals(writes, ["a", "\r", "paste text"]);

  resolveStatus({ code: 0, success: true });
  await run;
  await session.dispose();
});

Deno.test("terminal paste routing supports negotiated bracketed paste framing", async () => {
  const encoder = new TextEncoder();
  assertEquals([...encodeTerminalPaste(paste("alpha\nbeta"))], [...encoder.encode("alpha\nbeta")]);
  assertEquals(
    [...encodeTerminalPaste(paste("alpha\nbeta"), { bracketedPaste: true })],
    [...encoder.encode("\x1b[200~alpha\nbeta\x1b[201~")],
  );
  assertEquals(
    [...encodeTerminalPaste({ ...paste("ignored"), buffer: encoder.encode("raw paste") }, { bracketedPaste: true })],
    [...encoder.encode("raw paste")],
  );

  const writes: string[] = [];
  let resolveStatus!: (status: { code: number; signal?: string | null; success: boolean }) => void;
  const status = new Promise<{ code: number; signal?: string | null; success: boolean }>((resolve) => {
    resolveStatus = resolve;
  });
  const session = new ProcessSessionController({
    command: "demo",
    spawn: () => ({
      stdin: writableTextSink(writes),
      stdout: streamFromText(""),
      stderr: streamFromText(""),
      status,
      kill: () => resolveStatus({ code: 143, signal: "SIGTERM", success: false }),
    }),
  });
  const run = session.start();

  assertEquals(
    (await routeTerminalPaste(session, paste("safe\npaste"), { mode: "raw", bracketedPaste: true })).reason,
    "encoded",
  );
  assertEquals(writes, ["\x1b[200~safe\npaste\x1b[201~"]);

  resolveStatus({ code: 0, success: true });
  await run;
  await session.dispose();
});

Deno.test("terminal paste routing supports opt-in confirmation policies", async () => {
  const encoder = new TextEncoder();
  assertEquals(inspectTerminalPaste(paste("one\ntwo")), {
    byteLength: 7,
    lineCount: 2,
    multiline: true,
    containsControlCharacters: false,
  });
  assertEquals(inspectTerminalPaste({ ...paste("ignored"), buffer: encoder.encode("raw\x01") }), {
    byteLength: 4,
    lineCount: 1,
    multiline: false,
    containsControlCharacters: true,
  });

  const writes: string[] = [];
  let resolveStatus!: (status: { code: number; signal?: string | null; success: boolean }) => void;
  const status = new Promise<{ code: number; signal?: string | null; success: boolean }>((resolve) => {
    resolveStatus = resolve;
  });
  const session = new ProcessSessionController({
    command: "demo",
    spawn: () => ({
      stdin: writableTextSink(writes),
      stdout: streamFromText(""),
      stderr: streamFromText(""),
      status,
      kill: () => resolveStatus({ code: 143, signal: "SIGTERM", success: false }),
    }),
  });
  const run = session.start();

  assertEquals(
    (await routeTerminalPaste(session, paste("one\ntwo"), {
      mode: "raw",
      pasteConfirmationPolicy: "multiline",
    })).reason,
    "paste-rejected",
  );
  assertEquals(writes, []);

  assertEquals(
    (await routeTerminalPaste(session, paste("one\ntwo"), {
      mode: "raw",
      pasteConfirmationPolicy: "multiline",
      confirmPaste: () => true,
    })).reason,
    "encoded",
  );
  assertEquals(writes, ["one\ntwo"]);

  assertEquals(
    (await routeTerminalPaste(session, { ...paste("ignored"), buffer: encoder.encode("raw\x01") }, {
      mode: "raw",
      pasteConfirmationPolicy: "control",
      confirmPaste: (inspection) => !inspection.containsControlCharacters,
    })).reason,
    "paste-rejected",
  );

  resolveStatus({ code: 0, success: true });
  await run;
  await session.dispose();
});

Deno.test("terminal mouse routing encodes negotiated SGR mouse packets", async () => {
  const encoder = new TextEncoder();
  assertEquals(terminalMouseRoutingFromPrivateModes([1000, 1006]), { mouseTracking: "press", sgrMouse: true });
  assertEquals(terminalMouseRoutingFromPrivateModes([1002, 1006]), { mouseTracking: "button", sgrMouse: true });
  assertEquals(terminalMouseRoutingFromPrivateModes([1003]), { mouseTracking: "any", sgrMouse: false });
  assertEquals(
    encodeTerminalMouse(mousePress(12, 6, { button: 0 }), {
      mouseTracking: "press",
      sgrMouse: true,
      mouseOrigin: { column: 10, row: 5 },
    }),
    encoder.encode("\x1b[<0;3;2M"),
  );
  assertEquals(
    encodeTerminalMouse(mousePress(12, 6, { button: 0, drag: true }), {
      mouseTracking: "press",
      sgrMouse: true,
      mouseOrigin: { column: 10, row: 5 },
    }),
    undefined,
  );
  assertEquals(
    encodeTerminalMouse(mousePress(12, 6, { button: 0, drag: true, shift: true }), {
      mouseTracking: "button",
      sgrMouse: true,
      mouseOrigin: { column: 10, row: 5 },
    }),
    encoder.encode("\x1b[<36;3;2M"),
  );
  assertEquals(
    encodeTerminalMouse(mousePress(12, 6, { release: true }), {
      mouseTracking: "press",
      sgrMouse: true,
      mouseOrigin: { column: 10, row: 5 },
    }),
    encoder.encode("\x1b[<3;3;2m"),
  );
  assertEquals(
    encodeTerminalMouse(mousePress(12, 6, { release: true, button: 0 }), {
      mouseTracking: "button",
      sgrMouse: true,
      mouseOrigin: { column: 10, row: 5 },
    }),
    encoder.encode("\x1b[<0;3;2m"),
  );
  assertEquals(
    encodeTerminalMouse({ ...mousePress(12, 6, { button: 0, drag: true }), button: undefined }, {
      mouseTracking: "any",
      sgrMouse: true,
      mouseOrigin: { column: 10, row: 5 },
    }),
    encoder.encode("\x1b[<35;3;2M"),
  );
  assertEquals(
    encodeTerminalMouse(mouseScroll(12, 6, -1), {
      mouseTracking: "press",
      sgrMouse: true,
      mouseOrigin: { column: 10, row: 5 },
    }),
    encoder.encode("\x1b[<64;3;2M"),
  );
  assertEquals(
    encodeTerminalMouse({ ...mousePress(12, 6, { button: 0 }), buffer: encoder.encode("raw") }, {
      mouseTracking: "none",
      sgrMouse: false,
    }),
    encoder.encode("raw"),
  );

  const writes: string[] = [];
  let resolveStatus!: (status: { code: number; signal?: string | null; success: boolean }) => void;
  const status = new Promise<{ code: number; signal?: string | null; success: boolean }>((resolve) => {
    resolveStatus = resolve;
  });
  const session = new ProcessSessionController({
    command: "demo",
    spawn: () => ({
      stdin: writableTextSink(writes),
      stdout: streamFromText(""),
      stderr: streamFromText(""),
      status,
      kill: () => resolveStatus({ code: 143, signal: "SIGTERM", success: false }),
    }),
  });
  const run = session.start();

  assertEquals(
    (await routeTerminalMouse(session, mousePress(12, 6, { button: 2 }), {
      mode: "raw",
      mouseTracking: "press",
      sgrMouse: true,
      mouseOrigin: { column: 10, row: 5 },
    })).reason,
    "encoded",
  );
  assertEquals(writes, ["\x1b[<2;3;2M"]);

  resolveStatus({ code: 0, success: true });
  await run;
  await session.dispose();
});

Deno.test("ProcessTerminalBackend spawns inspectable non-PTY sessions", async () => {
  const backend = createProcessTerminalBackend({
    spawn: () => completedChild("backend ok\n", "", { code: 0, success: true }),
  });
  const handle = backend.spawn({
    command: "demo",
    args: ["--backend"],
    columns: 100,
    rows: 30,
  });

  assertEquals(backend.id, "process");
  assertEquals(backend.pty, false);
  assertEquals((await handle.closed).status, "exited");
  assertEquals(handle.output.lines.peek().some((line) => line.text === "backend ok"), true);
  assertEquals(handle.inspect().commandLine, "demo --backend");
  assertEquals(handle.inspect().pty, false);
  assertEquals(handle.inspect().resizeSupported, false);
  assertEquals(handle.inspect().columns, 100);
  assertEquals(handle.inspect().rows, 30);
  assertEquals(await handle.resize(120, 40), false);
  assertEquals(handle.inspect().columns, 120);
  assertEquals(handle.inspect().rows, 40);
  await handle.dispose();
});

Deno.test("ProcessTerminalBackend supplies the ONLCR a pipe has no tty to provide", async () => {
  // A PTY's line discipline turns the child's LF into CRLF on its way out. This
  // backend has only a pipe, and a bare LF is an index — down a row, same column
  // — so without the translation ordinary output would staircase.
  const chunks: string[] = [];
  const decoder = new TextDecoder();
  const backend = createProcessTerminalBackend({
    spawn: () => completedChild("one\ntwo\r\nthree\n", "", { code: 0, success: true }),
  });
  const handle = backend.spawn({
    command: "demo",
    onData: (data) => {
      chunks.push(typeof data === "string" ? data : decoder.decode(data));
    },
  });
  await handle.closed;

  // Every LF gains a CR; the one that already had a CR is left alone.
  assertEquals(chunks.join(""), "one\r\ntwo\r\nthree\r\n");
  await handle.dispose();
});

Deno.test("ProcessTerminalBackend does not double a CRLF split across two reads", async () => {
  const chunks: string[] = [];
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const backend = createProcessTerminalBackend({
    spawn: () => ({
      stdout: new ReadableStream<Uint8Array>({
        start(controller) {
          // The CR ends one read and its LF opens the next.
          controller.enqueue(encoder.encode("alpha\r"));
          controller.enqueue(encoder.encode("\nbeta\n"));
          controller.close();
        },
      }),
      stderr: streamFromText(""),
      status: Promise.resolve({ code: 0, success: true }),
      kill: () => {},
    }),
  });
  const handle = backend.spawn({
    command: "demo",
    onData: (data) => {
      chunks.push(typeof data === "string" ? data : decoder.decode(data));
    },
  });
  await handle.closed;

  assertEquals(chunks.join(""), "alpha\r\nbeta\r\n");
  await handle.dispose();
});

function completedChild(
  stdout: string,
  stderr: string,
  status: { code: number; signal?: string | null; success: boolean },
): ProcessSessionChild {
  return {
    stdout: streamFromText(stdout),
    stderr: streamFromText(stderr),
    status: Promise.resolve(status),
    kill: () => {},
  };
}

function streamFromText(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      if (text) controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function writableTextSink(writes: string[]): WritableStream<Uint8Array> {
  return new WritableStream({
    write(chunk) {
      writes.push(new TextDecoder().decode(chunk));
    },
  });
}

function failingCloseSink(): WritableStream<Uint8Array> {
  return new WritableStream({
    close() {
      throw new Error("close denied");
    },
  });
}

function keyPress(
  key: Key,
  options: Partial<Omit<KeyPressEvent, "key" | "buffer">> = {},
): KeyPressEvent {
  return {
    key,
    ctrl: options.ctrl ?? false,
    meta: options.meta ?? false,
    shift: options.shift ?? false,
    buffer: new Uint8Array(),
  };
}

function paste(text: string): PasteEvent {
  return { key: "paste", text, buffer: new Uint8Array() };
}

function mousePress(
  x: number,
  y: number,
  options: Partial<Omit<MousePressEvent, "key" | "buffer" | "x" | "y" | "movementX" | "movementY">> = {},
): MousePressEvent {
  return {
    key: "mouse",
    buffer: new Uint8Array(),
    x,
    y,
    movementX: 0,
    movementY: 0,
    meta: options.meta ?? false,
    ctrl: options.ctrl ?? false,
    shift: options.shift ?? false,
    drag: options.drag ?? false,
    release: options.release ?? false,
    button: options.release ? options.button : options.button ?? 0,
  };
}

function mouseScroll(x: number, y: number, scroll: -1 | 0 | 1): MouseScrollEvent {
  return {
    key: "mouse",
    buffer: new Uint8Array(),
    x,
    y,
    movementX: 0,
    movementY: 0,
    meta: false,
    ctrl: false,
    shift: false,
    drag: false,
    scroll,
  };
}
