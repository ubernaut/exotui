import { ensureBunWebGpuInitialized } from "../src/runtime/bun_webgpu.ts";
import {
  createAppPluginDefinitionRegistry,
  createComponentCatalogReport,
  createRuntimeRendererBackendCatalogReport,
  createTerminalPlan,
  createThemeProvider,
  createThemeProviderReport,
  createThemeRegistry,
  detectRuntimeCapabilities,
  detectTerminalCapabilities,
  formatTerminalPlan,
  grWizardThemePacks,
  summarizeRuntimeCapabilities,
  summarizeTerminalCapabilities,
} from "../mod.ts";
import { createVisualizationLaunchReport } from "../scripts/visualization_launcher.ts";

// Probe the optional Bun backend before reporting the currently available synchronous capabilities.
await ensureBunWebGpuInitialized().catch(() => undefined);

const runtime = detectRuntimeCapabilities();
const terminal = detectTerminalCapabilities();
const terminalPlan = createTerminalPlan(terminal);
const launchers = createVisualizationLaunchReport();
const components = createComponentCatalogReport();
const renderers = createRuntimeRendererBackendCatalogReport({ capabilities: runtime });
const themeReport = createThemeProviderReport(
  createThemeProvider({
    registry: createThemeRegistry(grWizardThemePacks),
    activeId: "grwizard-unit01",
    layers: [
      {
        id: "focus-rings",
        label: "Focus Rings",
        options: {
          components: {
            Button: { variants: { primary: { focused: "accent", active: "success" } } },
            DataTable: { variants: { selected: { active: "accent" } } },
          },
        },
      },
      {
        id: "review-states",
        label: "Review States",
        enabled: false,
        options: {
          components: {
            Badge: { variants: { review: { base: "warning" } } },
            StatusBar: { variants: { review: { active: "warning" } } },
          },
        },
      },
    ],
  }),
  {
    preview: { tokens: ["foreground", "accent", "success"], components: ["panel", "button"], states: ["base"] },
  },
);
const plugins = createAppPluginDefinitionRegistry([
  { id: "shell", label: "Shell Pack", tags: ["app", "routes"], routes: [{ id: "home", title: "Home" }] },
  { id: "visualization", label: "Visualization Pack", tags: ["three", "runtime"], commands: [] },
  { id: "data", label: "Data Pack", tags: ["data", "query"], commands: [] },
]);

const categories = groupBy(launchers.targets, (target) => target.category ?? "uncategorized");
const runtimeSummary = summarizeRuntimeCapabilities(runtime);
const terminalSummary = summarizeTerminalCapabilities(terminal);

console.log("# Demo Gallery");
console.log("");
console.log(`Launch targets: ${launchers.inspection.count} across ${launchers.inspection.categories.join(", ")}`);
console.log(`Components: ${components.inspection.count} across ${components.categories.join(", ")}`);
console.log(`Renderer backends: ${renderers.inspection.available}/${renderers.inspection.count} available`);
console.log(`Theme packs: ${themeReport.summary.themeCount}, layers: ${themeReport.summary.layerCount}`);
console.log(`Plugin packs: ${plugins.inspect().ids.join(", ")}`);
console.log(`Runtime capabilities: ${runtimeSummary.available}/${runtimeSummary.total}`);
console.log(`Terminal capabilities: ${terminalSummary.available}/${terminalSummary.total}`);
console.log("");
console.log(formatTerminalPlan(terminalPlan));
console.log("");
console.log("## Launch Surfaces");
for (const [category, targets] of categories) {
  console.log(`- ${category}: ${targets.map((target) => target.aliases[0] ?? target.task).join(", ")}`);
}
console.log("");
console.log("## Recommended Tour");
console.log("1. `./visualization portfolio` for resizable windows, menus, controls, scroll areas, tables, and themes.");
console.log("2. `./visualization showcase` for the full widget wall and Neon Exodus panels.");
console.log("3. `./visualization neon` for the OpenTUI/web Neon Exodus suite.");
console.log("4. `./visualization form` for form controllers, validation, binding, and commands.");
console.log("5. `./visualization table` for data table state, keyed rows, and multi-selection.");
console.log("6. `./visualization terminal-session` for terminal plans and command-surface dispatch.");
console.log("7. `./visualization polygons` for glyph/block/mixed three.js ASCII rendering.");
console.log("8. `./visualization monitor` for live system panels and selectable 3D views.");
console.log("9. `./visualization adopter` for the integrated app/runtime/theme/plugin/data report.");
console.log("10. `deno task health` for the complete contributor verification path.");

function groupBy<T>(
  values: readonly T[],
  keyForValue: (value: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyForValue(value);
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  return new Map([...groups.entries()].sort(([left], [right]) => left.localeCompare(right)));
}
