// Copyright 2023 Im-Beast. MIT license.

// PKG-007: smoke binaries restore terminal state and locate assets
// deterministically; the launcher prints its permission manifest.

import { assert, assertEquals } from "./deps.ts";
import { generateLauncherTemplate } from "../mod.ts";

const repoRoot = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

async function compileTo(directory: string, target?: string): Promise<{ ok: boolean; output: string; binary: string }> {
  const binary = `${directory}/launcher${target?.includes("windows") ? ".exe" : ""}`;
  const args = ["compile", "--allow-env", "-o", binary];
  if (target) args.push("--target", target);
  args.push("main.ts");
  const command = new Deno.Command("deno", { args, cwd: directory, stdout: "piped", stderr: "piped" });
  const result = await command.output();
  return {
    ok: result.success,
    output: new TextDecoder().decode(result.stderr),
    binary,
  };
}

Deno.test("the host binary smokes: manifest, deterministic assets, terminal restore", async () => {
  const files = generateLauncherTemplate({ importSource: repoRoot });
  const directory = await Deno.makeTempDir({ prefix: "launcher-" });
  try {
    for (const [name, contents] of Object.entries(files)) {
      await Deno.writeTextFile(`${directory}/${name}`, contents);
    }
    const compiled = await compileTo(directory);
    assert(compiled.ok, `compile failed\n${compiled.output}`);

    // The binary prints its SEC-001 permission manifest on request.
    const manifestRun = new Deno.Command(compiled.binary, {
      args: ["--print-permissions"],
      stdout: "piped",
      env: { HOME: "/home/smoke" },
    });
    const manifestOut = new TextDecoder().decode((await manifestRun.output()).stdout);
    const manifest = JSON.parse(manifestOut);
    assertEquals(manifest.adapterId, "launcher-app");
    assertEquals(manifest.required[0].kind, "environment");

    // Deterministic asset location from declared env, twice identical.
    const runOnce = async () => {
      const run = new Deno.Command(compiled.binary, {
        stdout: "piped",
        env: { XDG_DATA_HOME: "/data/xdg", HOME: "/home/smoke" },
      });
      return new TextDecoder().decode((await run.output()).stdout);
    };
    const first = await runOnce();
    assertEquals(first, await runOnce()); // deterministic
    assert(first.includes("assets:/data/xdg/launcher-app")); // externalized, not beside the binary
    // Terminal state restores on exit: SGR reset + cursor show at the end.
    assert(first.trimEnd().endsWith("\x1b[0m\x1b[?25h"));
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("cross-compiled macOS and Windows binaries carry their formats", async () => {
  const files = generateLauncherTemplate({ importSource: repoRoot });
  const directory = await Deno.makeTempDir({ prefix: "launcher-x-" });
  try {
    for (const [name, contents] of Object.entries(files)) {
      await Deno.writeTextFile(`${directory}/${name}`, contents);
    }
    const targets = [
      { target: "x86_64-pc-windows-msvc", magic: [0x4d, 0x5a] }, // MZ
      { target: "aarch64-apple-darwin", magic: [0xcf, 0xfa, 0xed, 0xfe] }, // Mach-O 64 LE
    ];
    for (const { target, magic } of targets) {
      const compiled = await compileTo(directory, target);
      assert(compiled.ok, `${target}: cross-compile failed\n${compiled.output}`);
      const file = await Deno.open(compiled.binary, { read: true });
      const header = new Uint8Array(4);
      await file.read(header);
      file.close();
      assertEquals([...header.slice(0, magic.length)], magic, `${target}: wrong binary format`);
    }
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
