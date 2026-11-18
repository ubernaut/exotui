import { ensureBunWebGpuInitialized } from "../src/runtime/bun_webgpu.ts";
import {
  createComponentCatalogReport,
  createRuntimeRendererBackendCatalogReport,
  createThemeProvider,
  createThemeProviderReport,
  detectRuntimeCapabilities,
  summarizeRuntimeCapabilities,
} from "../mod.ts";
import { createVisualizationLaunchReport } from "../scripts/visualization_launcher.ts";

// Probe the optional Bun backend before reporting the currently available synchronous capabilities.
await ensureBunWebGpuInitialized().catch(() => undefined);

const runtime = detectRuntimeCapabilities();
const runtimeSummary = summarizeRuntimeCapabilities(runtime);
const components = createComponentCatalogReport();
const launchers = createVisualizationLaunchReport();
const renderers = createRuntimeRendererBackendCatalogReport({ capabilities: runtime });
const themes = createThemeProviderReport(createThemeProvider(), {
  preview: { tokens: ["foreground", "surface", "accent", "success"], components: ["StatusBar", "Button", "Table"] },
});

const phases = [
  {
    phase: 1,
    title: "Stable Core",
    status: "complete",
    proof: "controllers, signals, canvas primitives, input decoding, focus, keymaps",
    commands: ["deno test -A tests/widget_helpers.test.ts"],
  },
  {
    phase: 2,
    title: "Batteries Included Widgets",
    status: "complete",
    proof: `${components.inspection.count} cataloged components across ${components.categories.length} categories`,
    commands: ["./visualization widgets", "./visualization portfolio"],
  },
  {
    phase: 3,
    title: "App Framework",
    status: "complete",
    proof: "actions, commands, routes, settings, history, plugins, forms, selection workflows",
    commands: ["./visualization shell", "./visualization adopter", "./visualization forms"],
  },
  {
    phase: 4,
    title: "Runtime And Concurrency",
    status: "complete",
    proof: `${runtimeSummary.available}/${runtimeSummary.total} runtime capabilities available in this host`,
    commands: ["./visualization worker", "./visualization pipeline", "./visualization runtime-pressure"],
  },
  {
    phase: 5,
    title: "Web And Remote Surfaces",
    status: "complete",
    proof: "standalone web package, Canvas2D cell host, remote terminal protocol, GitHub Pages build",
    commands: ["deno task web:demo:check", "deno task web:test", "deno task web:pages:build"],
  },
  {
    phase: 6,
    title: "Polished Demo Portfolio",
    status: "active",
    proof:
      `${launchers.inspection.count} launch targets, ${renderers.inspection.available}/${renderers.inspection.count} renderer backends available, ${themes.summary.themeCount} theme packs`,
    commands: ["./visualization", "./visualization gallery", "./visualization neon", "./visualization polygons"],
  },
] as const;

console.log("# Batteries Included TUI Report");
console.log("");
console.log("This report ties the fork's reusable APIs to launchable demos and verification commands.");
console.log("");
console.log("## Phase Matrix");
console.log("");
console.log("| Phase | Status | Area | Proof | Demo commands |");
console.log("| ---: | --- | --- | --- | --- |");
for (const phase of phases) {
  console.log(
    `| ${phase.phase} | ${phase.status} | ${phase.title} | ${phase.proof} | ${
      phase.commands.map((command) => `\`${command}\``).join("<br>")
    } |`,
  );
}
console.log("");
console.log("## Launch Portfolio");
console.log("");
for (const category of launchers.inspection.categories) {
  const targets = launchers.targets.filter((target) => target.category === category);
  console.log(`- ${category}: ${targets.map((target) => target.aliases[0] ?? target.task).join(", ")}`);
}
console.log("");
console.log("## Recommended Manual Pass");
console.log("");
console.log(
  "1. `./visualization portfolio` - resize the terminal, click table rows, operate controls, and drag scrollbars.",
);
console.log("2. `./visualization showcase` - inspect the dense widget wall and visualization panels.");
console.log("3. `./visualization neon` - cycle the Neon Exodus/OpenTUI-inspired visualization suite.");
console.log("4. `./visualization polygons` - switch glyph, block, and mixed ASCII modes.");
console.log("5. `deno task web:pages:build` - refresh the standalone browser demos under `docs/`.");
