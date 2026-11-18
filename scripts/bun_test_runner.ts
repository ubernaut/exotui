// Copyright 2026 ubernaut. MIT license.
// Each source file receives its own process: mutable globals and mocks cannot leak between suites.
import { readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { relative, resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const preload = fileURLToPath(new URL("./bun_test_preload.ts", import.meta.url));
const args = Bun.argv.slice(2);
const selected: string[] = [];
const flags: string[] = [];
let filterPattern: string | undefined;
for (let index = 0; index < args.length; index++) {
  const arg = args[index]!;
  if (arg === "--") continue;
  if (arg === "--help" || arg === "-h") {
    console.log(
      "usage: bun scripts/bun_test_runner.ts [test directories or files] [--test-name-pattern pattern] [--timeout=ms]",
    );
    process.exit(0);
  }
  if (arg === "--test-name-pattern" || arg === "-t") {
    const pattern = args[++index];
    if (pattern === undefined) throw new Error(`${arg} needs a pattern`);
    filterPattern = pattern;
    flags.push("--test-name-pattern", pattern);
    continue;
  }
  if (arg.startsWith("--test-name-pattern=")) {
    filterPattern = arg.slice("--test-name-pattern=".length);
    flags.push("--test-name-pattern", filterPattern);
    continue;
  }
  if (arg.startsWith("--timeout=")) {
    flags.push(arg);
    continue;
  }
  if (arg.startsWith("-")) throw new Error(`Unsupported test-runner option: ${arg}`);
  selected.push(resolve(arg));
}
const files = new Set<string>();
async function gather(path: string): Promise<void> {
  const info = await stat(path);
  if (info.isDirectory()) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isDirectory() || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) {
        await gather(resolve(path, entry.name));
      }
    }
  } else {
    if (!/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path)) throw new Error(`Not a test source: ${path}`);
    files.add(path);
  }
}
for (const path of selected.length ? selected : [resolve(root, "tests"), resolve(root, "packages/exomux/tests")]) {
  await gather(path);
}
if (!files.size) throw new Error("No test files selected");
let passed = 0, skipped = 0, failed = 0;
let matchedTests = 0, filteredFiles = 0, filteredTests = 0;
const failures: string[] = [];
const testEnv = { ...process.env };
delete testEnv.NO_COLOR;
for (const file of [...files].sort()) {
  const child = Bun.spawn([
    process.execPath,
    "test",
    "--preload",
    preload,
    "--timeout=60000",
    "--only-failures",
    ...flags,
    file,
  ], {
    cwd: root,
    env: testEnv,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), 180_000);
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  clearTimeout(timer);
  const output = (stdout + stderr).replace(/\x1b\[[0-9;]*m/g, "");
  const match = /Ran (\d+) tests? across \d+ files?/.exec(output);
  const filePass = Number(/^\s*(\d+) pass\s*$/m.exec(output)?.[1] ?? 0);
  const fileFail = Number(/^\s*(\d+) fail\s*$/m.exec(output)?.[1] ?? 0);
  const fileSkip = Number(/^\s*(\d+) skip\s*$/m.exec(output)?.[1] ?? 0);
  // Bun exits 1 for a filtered file with no matching registrations. Accept
  // only its complete, otherwise-empty diagnostic; import errors, leaks,
  // assertions and unexpected output must retain their failing exit status.
  const diagnostic = output.trim().replace(/^bun test v[^\r\n]+\r?\n/, "").trim();
  const noMatchPrefix = `error: regex "${filterPattern}" matched 0 tests. Searched 1 file (skipping `;
  const noMatch = filterPattern !== undefined && code === 1 && !match && fileFail === 0 &&
      diagnostic.startsWith(noMatchPrefix)
    ? /^(\d+) tests?\) \[\d+(?:\.\d+)?(?:ms|s)\]$/.exec(diagnostic.slice(noMatchPrefix.length))
    : null;
  if (noMatch) {
    filteredFiles++;
    filteredTests += Number(noMatch[1]);
    console.log(`filtered ${relative(root, file)} (${noMatch[1]} tests)`);
    continue;
  }
  matchedTests += Number(match?.[1] ?? 0);
  passed += filePass;
  skipped += fileSkip;
  failed += fileFail;
  if (code !== 0 || !match) {
    failures.push(file);
    if (fileFail === 0) failed++;
    console.error(`FAIL ${relative(root, file)} (exit ${code})\n${output}`);
  } else console.log(`ok ${relative(root, file)} (${filePass} passed${fileSkip ? `, ${fileSkip} skipped` : ""})`);
}
const globallyUnmatched = filterPattern !== undefined && matchedTests === 0;
if (globallyUnmatched) {
  failed++;
  console.error(`Filter ${JSON.stringify(filterPattern)} matched no registered tests across ${files.size} files.`);
}
console.log(
  `Bun suite: ${passed} passed, ${failed} failed, ${skipped} skipped across ${files.size} isolated files.` +
    (filterPattern !== undefined ? ` ${filteredFiles} filtered files (${filteredTests} filtered tests).` : ""),
);
if (failures.length) {
  console.error(`Failing files:\n${failures.map((file) => relative(root, file)).join("\n")}`);
  process.exit(1);
}
if (globallyUnmatched) process.exit(1);
