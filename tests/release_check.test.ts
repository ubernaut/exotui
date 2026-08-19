import { assertEquals } from "./deps.ts";
import {
  formatReleaseArtifactSummary,
  normalizeReleaseCheckArgs,
  parseReleaseArtifactSummary,
} from "../scripts/release_check.ts";

Deno.test("release check summarizes Deno publish dry-run artifacts", () => {
  const summary = parseReleaseArtifactSummary([
    "Checking for slow types in the public API...",
    "Simulating publish of @ubernaut/exotui@0.1.0 with files:",
    "   file:///workspace/README.md (1.5KB)",
    "   file:///workspace/mod.ts (2B)",
    "Success Dry run complete",
  ].join("\n"));

  assertEquals(summary, {
    packageId: "@ubernaut/exotui@0.1.0",
    fileCount: 2,
    approximateBytes: 1_538,
  });
  assertEquals(
    formatReleaseArtifactSummary(summary!),
    "ok release dry run @ubernaut/exotui@0.1.0: 2 files, 1.5 KiB",
  );
  assertEquals(parseReleaseArtifactSummary("error: missing name"), undefined);
  assertEquals(normalizeReleaseCheckArgs(["--", "--quiet"]), ["--quiet"]);
});
