import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assetFor, assets, checksum, packageRoot } from "../lib/binary.mjs";

async function launcher(t) {
  const root = await mkdtemp(join(tmpdir(), "exomux launcher "));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pkg = join(root, "package");
  await cp(packageRoot, pkg, { recursive: true });
  const entry = {
    sha256: await checksum(process.execPath),
    size: (await stat(process.execPath)).size,
  };
  const cache = join(root, "cache");
  await mkdir(join(cache, entry.sha256), { recursive: true });
  // Node itself stands in for the native executable; it can assert argv/stdin
  // and emit chosen exit codes on all supported operating systems.
  await cp(process.execPath, join(cache, entry.sha256, assetFor()));
  await writeFile(
    join(pkg, "release.json"),
    JSON.stringify({
      version: "0.0.0",
      tag: "v0.7.2",
      assets: Object.fromEntries(
        Object.values(assets).map((asset) => [asset, entry]),
      ),
    }),
  );
  return {
    command: join(pkg, "bin/exomux.mjs"),
    env: { ...process.env, EXOMUX_CACHE_DIR: cache },
    root,
  };
}

test("launcher inherits input, output, environment and cwd, preserves argv and nonzero exit", async (t) => {
  const fixture = await launcher(t);
  const script =
    "process.stdout.write(JSON.stringify({args:process.argv.slice(1),cwd:process.cwd(),value:process.env.EXOMUX_TEST_VALUE,input:require('fs').readFileSync(0,'utf8')}));process.stderr.write('stderr-ok');process.exitCode=23";
  const args = ["session with spaces", "--help", "$(untouched)", 'a"b'];
  const result = spawnSync(process.execPath, [
    fixture.command,
    "-e",
    script,
    "--",
    ...args,
  ], {
    env: { ...fixture.env, EXOMUX_TEST_VALUE: "inherited" },
    cwd: fixture.root,
    input: "stdin-ok",
    encoding: "utf8",
  });
  assert.equal(result.status, 23, result.stderr);
  assert.equal(result.stderr, "stderr-ok");
  assert.deepEqual(JSON.parse(result.stdout), {
    args,
    // process.cwd() resolves macOS's /var -> /private/var alias.
    cwd: await realpath(fixture.root),
    value: "inherited",
    input: "stdin-ok",
  });
});

test("launcher forwards SIGTERM and preserves signal termination", {
  skip: process.platform === "win32",
}, async (t) => {
  const fixture = await launcher(t);
  const child = spawn(process.execPath, [
    fixture.command,
    "-e",
    "console.log('ready');setInterval(()=>{},1000)",
  ], {
    env: fixture.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  });
  const exit = once(child, "exit");
  await once(child.stdout, "data", { signal: AbortSignal.timeout(15_000) });
  child.kill("SIGTERM");
  const [code, signal] = await exit;
  assert.equal(code, null);
  assert.equal(signal, "SIGTERM");
});
