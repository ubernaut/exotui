export interface HealthStep {
  name: string;
  command: string[];
  optional?: boolean;
}

export interface HealthResult extends HealthStep {
  code: number;
  success: boolean;
  durationMs: number;
}

export const defaultHealthSteps: readonly HealthStep[] = [
  { name: "format", command: ["deno", "fmt", "--check"] },
  { name: "public-api", command: ["deno", "check", "mod.ts"] },
  { name: "focused-app-api", command: ["deno", "check", "mod.app.ts"] },
  {
    name: "api-inventory",
    command: [
      "deno",
      "task",
      "api-inventory",
      "--",
      "--check",
      "--quiet",
      "--fail-duplicates",
      "--min-doc-coverage=1",
      "--baseline=docs/api-stable-baseline.json",
    ],
  },
  // A type check walks what an entrypoint imports, so a module nothing imports
  // is checked by nothing. 040 and audio_scripted.ts are both that story.
  { name: "reachability", command: ["deno", "run", "-A", "scripts/orphan_modules.ts", "--check", "--quiet"] },
  { name: "package-check", command: ["deno", "task", "package-check", "--", "--quiet"] },
  { name: "release-check", command: ["deno", "task", "release-check", "--", "--quiet"] },
  {
    name: "api-reference",
    command: ["deno", "run", "-A", "scripts/api_reference.ts", "--check=docs/api-reference.md"],
  },
  { name: "web-api", command: ["deno", "task", "web:check"] },
  { name: "remote-api", command: ["deno", "task", "remote:check"] },
  { name: "web-demo", command: ["deno", "task", "web:demo:check"] },
  { name: "web-pages-build", command: ["deno", "task", "web:pages:build"] },
  { name: "screenshots", command: ["deno", "check", "scripts/generate_screenshots.ts"] },
  { name: "app-shell", command: ["deno", "check", "examples/app_shell.ts"] },
  { name: "terminal-app", command: ["deno", "check", "examples/terminal_app.ts"] },
  { name: "command-search", command: ["deno", "check", "examples/command_search_index.ts"] },
  { name: "layout-recipe", command: ["deno", "check", "examples/layout_recipe_report.ts"] },
  { name: "html-css-workbench", command: ["deno", "check", "examples/html_css_workbench.ts"] },
  { name: "action-middleware", command: ["deno", "check", "examples/action_middleware.ts"] },
  { name: "cached-resource", command: ["deno", "check", "examples/cached_resource.ts"] },
  { name: "cached-pipeline", command: ["deno", "check", "examples/cached_pipeline.ts"] },
  { name: "data-query", command: ["deno", "check", "examples/data_query.ts"] },
  { name: "form-workflow", command: ["deno", "check", "examples/form_workflow.ts"] },
  { name: "table-selection", command: ["deno", "check", "examples/table_selection_workflow.ts"] },
  { name: "window-manager", command: ["deno", "check", "examples/window_manager_demo.ts"] },
  { name: "workspace-launcher", command: ["deno", "check", "examples/windowing_system_launcher.ts"] },
  { name: "terminal-command", command: ["deno", "check", "examples/terminal_command_workflow.ts"] },
  { name: "runtime-workloads", command: ["deno", "check", "examples/runtime_workloads.ts"] },
  { name: "e2e", command: ["deno", "task", "e2e", "--", "--quiet"] },
  { name: "theme-engines", command: ["deno", "check", "examples/theme_engines.ts"] },
  { name: "theme-engine-commands", command: ["deno", "check", "examples/theme_engine_commands.ts"] },
  { name: "theme-pipeline", command: ["deno", "check", "examples/theme_pipeline.ts"] },
  { name: "theme-workspace", command: ["deno", "check", "examples/theme_workspace.ts"] },
  { name: "theme-resolver", command: ["deno", "check", "examples/theme_resolver.ts"] },
  { name: "theme-bindings", command: ["deno", "check", "examples/theme_bindings.ts"] },
  { name: "component-catalog", command: ["deno", "check", "scripts/component_catalog.ts"] },
  { name: "app-plugin-catalog", command: ["deno", "check", "examples/app_plugin_catalog.ts"] },
  { name: "adopter-workbench", command: ["deno", "check", "examples/adopter_workbench.ts"] },
  { name: "demo-gallery", command: ["deno", "check", "examples/demo_gallery.ts"] },
  { name: "demo-launcher", command: ["deno", "check", "scripts/demo_launcher.ts"] },
  { name: "visualization-app", command: ["deno", "task", "viz:check"] },
  { name: "neon-exodus", command: ["deno", "task", "neon-exodus:check"] },
  { name: "showcase", command: ["deno", "task", "showcase:check"] },
  { name: "api-workbench", command: ["deno", "task", "api-workbench:check"] },
  // The worked example for ./viz. Its own tests run in the root suite; this is
  // the check that its launcher and preview still type.
  { name: "exomonitor", command: ["deno", "task", "exomonitor:check"] },
  { name: "benchmarks", command: ["deno", "task", "benchmark"] },
  { name: "tests", command: ["deno", "test", "-A"] },
  // Exomux resolves against its own config, so the root `deno test` no longer
  // reaches it; without this the gate would silently stop covering its 285 tests.
  { name: "exomux-tests", command: ["deno", "task", "exomux:test"] },
  { name: "web-tests", command: ["deno", "task", "web:test"] },
  { name: "worker-tests", command: ["deno", "task", "test:workers"] },
];

export async function runHealth(
  steps: readonly HealthStep[] = defaultHealthSteps,
  options: { cwd?: string; stdout?: "inherit" | "null"; stderr?: "inherit" | "null" } = {},
): Promise<HealthResult[]> {
  const results: HealthResult[] = [];
  for (const step of steps) {
    const started = performance.now();
    const command = new Deno.Command(step.command[0], {
      args: step.command.slice(1),
      cwd: options.cwd,
      stdout: options.stdout ?? "inherit",
      stderr: options.stderr ?? "inherit",
    });
    const status = await command.output();
    results.push({
      ...step,
      code: status.code,
      success: status.success || !!step.optional,
      durationMs: performance.now() - started,
    });
  }
  return results;
}

export function formatHealthResult(result: HealthResult): string {
  const icon = result.success ? "ok" : "fail";
  const suffix = result.optional && result.code !== 0 ? " optional" : "";
  return `${icon} ${result.name}${suffix} ${Math.round(result.durationMs)}ms`;
}

export function healthSucceeded(results: readonly HealthResult[]): boolean {
  return results.every((result) => result.success);
}

if (import.meta.main) {
  const results = await runHealth();
  for (const result of results) {
    console.log(formatHealthResult(result));
  }
  if (!healthSucceeded(results)) {
    Deno.exit(1);
  }
}
