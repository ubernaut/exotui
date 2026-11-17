import { runtimeTaskCommand } from "./demo_launcher.ts";
import { runtimeHost } from "../src/runtime/host.ts";
import { stripAnsi } from "../src/utils/ansi_text.ts";

export interface VisualSmokeTarget {
  id: string;
  label: string;
  command: readonly string[];
  required: readonly string[];
  forbidden?: readonly string[];
  timeoutMs?: number;
}

export interface VisualSmokeTargetResult {
  id: string;
  label: string;
  command: readonly string[];
  code: number;
  passed: boolean;
  durationMs: number;
  missing: string[];
  forbidden: string[];
  nonBlankLines: number;
  outputPreview: string;
}

export interface VisualSmokeReport {
  passed: boolean;
  durationMs: number;
  results: VisualSmokeTargetResult[];
}

export const visualSmokeTargets: readonly VisualSmokeTarget[] = [
  {
    id: "demo-gallery",
    label: "Demo Gallery",
    command: ["deno", "task", "demo-gallery"],
    required: ["# Demo Gallery", "Runtime capabilities", "Terminal capabilities"],
  },
  {
    id: "window-manager",
    label: "Window Manager",
    command: ["deno", "task", "window-manager"],
    required: ["# Window Manager And File Explorer Demo", "Overlay Stack", "Usability Test Plan"],
  },
  {
    id: "component-catalog",
    label: "Component Catalog",
    command: ["deno", "task", "component-catalog"],
    required: ["# Component Catalog", "ComboBox", "RadioGroup"],
  },
  {
    id: "terminal-command",
    label: "Terminal Command Workflow",
    command: ["deno", "task", "terminal-command"],
    required: ["# Terminal Command Workflow Demo", "Mouse protocol", "Commands:"],
  },
  {
    id: "capabilities",
    label: "Runtime And Terminal Capabilities",
    command: ["deno", "task", "capabilities"],
    required: ["Runtime capabilities", "Terminal capabilities", "Terminal environment"],
  },
];

export async function runVisualSmoke(
  targets: readonly VisualSmokeTarget[] = visualSmokeTargets,
): Promise<VisualSmokeReport> {
  const started = performance.now();
  const results: VisualSmokeTargetResult[] = [];
  for (const target of targets) {
    results.push(await runVisualSmokeTarget(target));
  }
  return {
    passed: results.every((result) => result.passed),
    durationMs: Math.round(performance.now() - started),
    results,
  };
}

export async function runVisualSmokeTarget(target: VisualSmokeTarget): Promise<VisualSmokeTargetResult> {
  const started = performance.now();
  const argv = runtimeTaskCommand(target.command);
  const command = new runtimeHost.Command(argv[0]!, {
    args: [...argv.slice(1)],
    stdout: "piped",
    stderr: "piped",
    signal: AbortSignal.timeout(target.timeoutMs ?? 12_000),
  });
  try {
    const output = await command.output();
    return inspectVisualSmokeOutput(target, {
      code: output.code,
      stdout: new TextDecoder().decode(output.stdout),
      stderr: new TextDecoder().decode(output.stderr),
      durationMs: Math.round(performance.now() - started),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return inspectVisualSmokeOutput(target, {
      code: 1,
      stdout: "",
      stderr: message,
      durationMs: Math.round(performance.now() - started),
    });
  }
}

export function inspectVisualSmokeOutput(
  target: VisualSmokeTarget,
  output: { code: number; stdout: string; stderr?: string; durationMs?: number },
): VisualSmokeTargetResult {
  const text = stripAnsi(`${output.stdout}\n${output.stderr ?? ""}`);
  const missing = target.required.filter((token) => !text.includes(token));
  const forbidden = (target.forbidden ?? []).filter((token) => text.includes(token));
  const nonBlankLines = text.split("\n").filter((line) => line.trim().length > 0).length;
  return {
    id: target.id,
    label: target.label,
    command: target.command,
    code: output.code,
    passed: output.code === 0 && missing.length === 0 && forbidden.length === 0 && nonBlankLines > 0,
    durationMs: output.durationMs ?? 0,
    missing,
    forbidden,
    nonBlankLines,
    outputPreview: text.split("\n").slice(0, 12).join("\n").trimEnd(),
  };
}

export function formatVisualSmokeReport(report: VisualSmokeReport): string {
  const rows = report.results.map((result) =>
    `| ${result.passed ? "pass" : "fail"} | ${result.id} | ${result.durationMs} | ${
      result.missing.join(", ") || "-"
    } | ${result.forbidden.join(", ") || "-"} |`
  );
  const failed = report.results.filter((result) => !result.passed);
  return [
    "# Visual Smoke Report",
    "",
    `Status: ${report.passed ? "pass" : "fail"}`,
    `Duration: ${report.durationMs}ms`,
    "",
    "| Status | Target | ms | Missing | Forbidden |",
    "| --- | --- | ---: | --- | --- |",
    ...rows,
    ...(failed.length
      ? [
        "",
        "## Failed Output Previews",
        "",
        ...failed.flatMap((result) => [
          `### ${result.label}`,
          "",
          "```text",
          result.outputPreview,
          "```",
          "",
        ]),
      ]
      : []),
  ].join("\n");
}

if (import.meta.main) {
  const report = await runVisualSmoke();
  console.log(formatVisualSmokeReport(report));
  if (!report.passed) runtimeHost.exit(1);
}
