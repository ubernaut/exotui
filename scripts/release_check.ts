import { runtimeHost } from "../src/runtime/host.ts";
export interface ReleaseArtifactSummary {
  packageId: string;
  fileCount: number;
  approximateBytes: number;
}

interface CommandOutput {
  success: boolean;
  code: number;
  stdout: Uint8Array;
  stderr: Uint8Array;
}

const textDecoder = new TextDecoder();
const sizeUnits: Readonly<Record<string, number>> = {
  B: 1,
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
};

/** Parses the package identity and approximate artifact size from a successful Deno publish dry run. */
export function parseReleaseArtifactSummary(output: string): ReleaseArtifactSummary | undefined {
  const packageMatch = /Simulating publish of (\S+) with files:/.exec(output);
  if (!packageMatch) return undefined;

  let fileCount = 0;
  let approximateBytes = 0;
  const filePattern = /^\s+file:\/\/\/.+ \(([\d.]+)(B|KB|MB|GB)\)\s*$/gm;
  for (const match of output.matchAll(filePattern)) {
    const value = Number(match[1]);
    const multiplier = sizeUnits[match[2]!] ?? 1;
    if (!Number.isFinite(value)) continue;
    fileCount += 1;
    approximateBytes += value * multiplier;
  }

  return {
    packageId: packageMatch[1]!,
    fileCount,
    approximateBytes: Math.round(approximateBytes),
  };
}

/** Formats a compact successful release dry-run result. */
export function formatReleaseArtifactSummary(summary: ReleaseArtifactSummary): string {
  return `ok release dry run ${summary.packageId}: ${summary.fileCount} files, ${
    formatBytes(summary.approximateBytes)
  }`;
}

/** Removes the task-runner option sentinel before validating release-check flags. */
export function normalizeReleaseCheckArgs(args: readonly string[]): string[] {
  return args.filter((arg) => arg !== "--");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
}

function commandText(output: CommandOutput): string {
  return `${textDecoder.decode(output.stdout)}${textDecoder.decode(output.stderr)}`;
}

async function runDeno(args: string[]): Promise<CommandOutput> {
  return await new runtimeHost.Command("Bun" in globalThis ? "deno" : runtimeHost.execPath(), {
    args,
    // Match the checked-in workspace lock, including package.json dependencies.
    env: { DENO_NO_PACKAGE_JSON: "0" },
    stdout: "piped",
    stderr: "piped",
  }).output();
}

if (import.meta.main) {
  const args = normalizeReleaseCheckArgs(runtimeHost.args);
  const knownArgs = new Set(["--clean", "--json", "--quiet"]);
  const unknownArg = args.find((arg) => !knownArgs.has(arg));
  if (unknownArg) {
    console.error(`unknown release-check option: ${unknownArg}`);
    runtimeHost.exit(2);
  }

  const packageCheck = await runDeno(["run", "-A", "./scripts/package_check.ts", "--quiet"]);
  if (!packageCheck.success) {
    console.error(commandText(packageCheck).trimEnd());
    runtimeHost.exit(packageCheck.code);
  }

  const publishArgs = ["publish", "--dry-run"];
  if (!args.includes("--clean")) publishArgs.push("--allow-dirty");
  const publish = await runDeno(publishArgs);
  const output = commandText(publish);
  if (!publish.success) {
    console.error(output.trimEnd());
    runtimeHost.exit(publish.code);
  }

  const summary = parseReleaseArtifactSummary(output);
  if (args.includes("--json")) {
    console.log(JSON.stringify(summary ?? { ok: true }, null, 2));
  } else if (!args.includes("--quiet")) {
    console.log(summary ? formatReleaseArtifactSummary(summary) : "ok release dry run");
  }
}
