import { ensureBunWebGpuInitialized } from "../src/runtime/bun_webgpu.ts";
import { runtimeHost } from "../src/runtime/host.ts";
import {
  createRuntimePlan,
  createRuntimeProfileCatalogReport,
  createRuntimeRendererBackendCatalogReport,
  createTerminalPlan,
  detectRuntimeCapabilities,
  detectTerminalCapabilities,
  detectTerminalEnvironment,
  formatRuntimeCapabilities,
  formatRuntimePlan,
  formatRuntimeProfileCatalogMarkdown,
  formatRuntimeRendererBackendCatalogMarkdown,
  formatTerminalCapabilities,
  formatTerminalEnvironment,
  formatTerminalPlan,
  summarizeRuntimeCapabilities,
  summarizeTerminalCapabilities,
  terminalEnvironmentDiagnostics,
} from "../mod.ts";

// Probe the optional Bun backend before reporting the currently available synchronous capabilities.
await ensureBunWebGpuInitialized().catch(() => undefined);

const capabilities = detectRuntimeCapabilities();
const plan = createRuntimePlan(capabilities);
const profiles = createRuntimeProfileCatalogReport({ capabilities });
const renderers = createRuntimeRendererBackendCatalogReport({ capabilities });
const terminal = detectTerminalCapabilities();
const terminalEnvironment = detectTerminalEnvironment();
const terminalPlan = createTerminalPlan(terminal);

if (runtimeHost.args.includes("--json")) {
  console.log(JSON.stringify(
    {
      ...summarizeRuntimeCapabilities(capabilities),
      plan,
      terminal: summarizeTerminalCapabilities(terminal),
      terminalEnvironment,
      terminalDiagnostics: terminalEnvironmentDiagnostics(terminalEnvironment),
      terminalPlan,
      profiles,
      renderers,
    },
    null,
    2,
  ));
} else {
  console.log(formatRuntimeCapabilities(capabilities));
  console.log("");
  console.log(formatRuntimePlan(plan));
  console.log("");
  console.log(formatTerminalCapabilities(terminal));
  console.log("");
  console.log(formatTerminalEnvironment(terminalEnvironment));
  console.log("");
  console.log(formatTerminalPlan(terminalPlan));
  console.log("");
  console.log(formatRuntimeProfileCatalogMarkdown({ capabilities, includeSummary: false }));
  console.log("");
  console.log(formatRuntimeRendererBackendCatalogMarkdown({ capabilities, includeSummary: false }));
}
