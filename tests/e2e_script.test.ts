import { assertEquals } from "./deps.ts";
import {
  e2eArtifactTargets,
  e2eCommandTargets,
  formatE2EReport,
  inspectE2EArtifactData,
  inspectE2ECommandOutput,
} from "../scripts/e2e.ts";
import { defaultHealthSteps, formatHealthResult, type HealthResult, healthSucceeded } from "../scripts/health.ts";

Deno.test("e2e command inspection validates anchors and forbidden runtime errors", () => {
  const result = inspectE2ECommandOutput({
    id: "demo",
    label: "Demo",
    command: ["deno", "task", "demo"],
    required: ["Ready", "Theme"],
  }, {
    code: 0,
    stdout: "\x1b[32mReady\x1b[0m\nTheme Unit-01\n",
    durationMs: 8,
  });

  assertEquals(result.passed, true);
  assertEquals(result.missing, []);
  assertEquals(result.forbiddenMatches, []);
  assertEquals(result.outputPreview, "Ready\nTheme Unit-01");

  const runtimeFailure = inspectE2ECommandOutput({
    id: "runtime-failure",
    label: "Runtime Failure",
    command: ["deno", "task", "runtime-failure"],
    required: ["Ready"],
  }, {
    code: 0,
    stdout: "Ready\n",
    stderr: "TypeError: boom\n",
  });
  assertEquals(runtimeFailure.passed, false);
  assertEquals(runtimeFailure.missing, []);
  assertEquals(runtimeFailure.forbiddenMatches, ["TypeError"]);

  const failed = inspectE2ECommandOutput({
    id: "broken",
    label: "Broken",
    command: ["deno", "task", "broken"],
    required: ["Mounted"],
  }, {
    code: 1,
    stdout: "Booting\nReferenceError: bad state\n",
  });

  assertEquals(failed.passed, false);
  assertEquals(failed.missing, ["Mounted"]);
  assertEquals(failed.forbiddenMatches, ["ReferenceError"]);
});

Deno.test("e2e artifact inspection validates generated browser assets", () => {
  const result = inspectE2EArtifactData(
    {
      id: "bundle",
      label: "Bundle",
      path: "docs/assets/app.js",
      required: ["Generated", "mount"],
      minBytes: 8,
    },
    64,
    "// Generated\nclass ValidationError extends TypeError {}\nmount();",
  );

  assertEquals(result.passed, true);
  assertEquals(result.missing, []);
  assertEquals(result.forbiddenMatches, []);

  const explicitlyForbidden = inspectE2EArtifactData(
    {
      id: "bundle",
      label: "Bundle",
      path: "docs/assets/app.js",
      forbidden: ["TypeError"],
    },
    64,
    "class ValidationError extends TypeError {}",
  );
  assertEquals(explicitlyForbidden.passed, false);
  assertEquals(explicitlyForbidden.forbiddenMatches, ["TypeError"]);

  const failed = inspectE2EArtifactData(
    {
      id: "bundle",
      label: "Bundle",
      path: "docs/assets/app.js",
      required: ["Generated"],
      minBytes: 32,
    },
    20,
    "console.log('missing banner')",
  );

  assertEquals(failed.passed, false);
  assertEquals(failed.missing, ["minBytes:32", "Generated"]);

  const oversized = inspectE2EArtifactData(
    { id: "bundle", label: "Bundle", path: "docs/assets/app.js", maxBytes: 16 },
    20,
    "// Generated\nmount();",
  );
  assertEquals(oversized.passed, false);
  assertEquals(oversized.missing, ["maxBytes:16"]);
});

Deno.test("e2e report prints command and artifact failure diagnostics", () => {
  const command = inspectE2ECommandOutput({
    id: "broken-command",
    label: "Broken Command",
    command: ["deno", "task", "broken"],
    required: ["Ready"],
  }, {
    code: 1,
    stdout: "ReferenceError: bad state",
  });
  const artifact = inspectE2EArtifactData(
    {
      id: "small-artifact",
      label: "Small Artifact",
      path: "docs/assets/app.js",
      minBytes: 10,
    },
    4,
    "tiny",
  );
  const report = formatE2EReport({ passed: false, durationMs: 12, commands: [command], artifacts: [artifact] });

  assertEquals(report.includes("| fail | broken-command | 0 | 1 | Ready | ReferenceError |"), true);
  assertEquals(report.includes("| fail | small-artifact | 4 | minBytes:10 | - |"), true);
  assertEquals(report.includes("## Failed Output Previews"), true);
});

Deno.test("default e2e catalog covers web console package and generated pages", () => {
  assertEquals(e2eCommandTargets.map((target) => target.id), [
    "pages-build",
    "web-demo-check",
    "web-runtime-tests",
    "demo-gallery",
    "component-catalog",
    "app-plugin-catalog",
    "capabilities",
    "benchmark-catalog",
    "api-inventory-gate",
    "package-check",
  ]);
  assertEquals(e2eArtifactTargets.map((target) => target.id), [
    "pages-html",
    "web-workbench-bundle",
  ]);
});

Deno.test("health script exposes the expected contributor gates", () => {
  assertEquals(defaultHealthSteps.map((step) => step.name), [
    "format",
    "public-api",
    "focused-app-api",
    "api-inventory",
    "reachability",
    "package-check",
    "release-check",
    "api-reference",
    "web-api",
    "remote-api",
    "web-demo",
    "web-pages-build",
    "screenshots",
    "app-shell",
    "terminal-app",
    "command-search",
    "layout-recipe",
    "html-css-workbench",
    "action-middleware",
    "cached-resource",
    "cached-pipeline",
    "data-query",
    "form-workflow",
    "table-selection",
    "window-manager",
    "workspace-launcher",
    "terminal-command",
    "runtime-workloads",
    "e2e",
    "theme-engines",
    "theme-engine-commands",
    "theme-pipeline",
    "theme-workspace",
    "theme-resolver",
    "theme-bindings",
    "component-catalog",
    "app-plugin-catalog",
    "adopter-workbench",
    "demo-gallery",
    "demo-launcher",
    "visualization-app",
    "neon-exodus",
    "showcase",
    "api-workbench",
    "exomonitor",
    "benchmarks",
    "tests",
    "exomux-tests",
    "web-tests",
    "worker-tests",
  ]);
  // By name, not by index: what matters is that a gate runs the flags that make
  // it actually verify something, not where it sits in the list. Indexed
  // assertions broke the moment a gate was inserted ahead of them.
  const commandOf = (name: string) => defaultHealthSteps.find((step) => step.name === name)?.command;
  assertEquals(commandOf("api-inventory"), [
    "deno",
    "task",
    "api-inventory",
    "--",
    "--check",
    "--quiet",
    "--fail-duplicates",
    "--min-doc-coverage=1",
    "--baseline=docs/api-stable-baseline.json",
  ]);
  assertEquals(commandOf("package-check"), ["deno", "task", "package-check", "--", "--quiet"]);
  assertEquals(commandOf("release-check"), ["deno", "task", "release-check", "--", "--quiet"]);
  // --check is what makes reachability a gate rather than a report.
  assertEquals(commandOf("reachability"), ["deno", "run", "-A", "scripts/orphan_modules.ts", "--check", "--quiet"]);
});

Deno.test("health results format optional failures without failing the gate", () => {
  const results: HealthResult[] = [
    { name: "tests", command: ["deno", "test"], code: 0, success: true, durationMs: 12.4 },
    {
      name: "worker-tests",
      command: ["deno", "task", "test:workers"],
      code: 1,
      success: true,
      optional: true,
      durationMs: 4.4,
    },
  ];

  assertEquals(formatHealthResult(results[0]), "ok tests 12ms");
  assertEquals(formatHealthResult(results[1]), "ok worker-tests optional 4ms");
  assertEquals(healthSucceeded(results), true);
});

Deno.test("health results fail when a required step fails", () => {
  assertEquals(
    healthSucceeded([
      { name: "tests", command: ["deno", "test"], code: 1, success: false, durationMs: 1 },
    ]),
    false,
  );
});
