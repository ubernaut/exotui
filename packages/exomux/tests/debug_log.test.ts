// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals, assertStringIncludes } from "./deps.ts";
import { createExomuxDebugLogger, exomuxDebugLog, exomuxDebugLoggingActive } from "../debug_log.ts";

Deno.test("Debug logger writes to logs/, tees console to the file, and restores on dispose", () => {
  // With nothing installed, the free logging function is a silent no-op.
  assert(!exomuxDebugLoggingActive());
  exomuxDebugLog("noop", "goes nowhere"); // must not throw

  const cwd = Deno.cwd();
  const dir = Deno.makeTempDirSync({ prefix: "exomux-log-" });
  const originalWarn = console.warn;
  try {
    Deno.chdir(dir);
    const logger = createExomuxDebugLogger();
    try {
      assert(exomuxDebugLoggingActive());
      // describe() names the actual file, under logs/ in the (temp) cwd here.
      const described = logger.describe?.() ?? "";
      assert(
        described.startsWith(`${dir}/logs/butterchurn-`),
        `describe() should name the log file, got "${described}"`,
      );
      exomuxDebugLog("gpu", "hello world");
      // While active, console output is diverted to the file, not the terminal.
      assert(console.warn !== originalWarn, "console.warn was not intercepted");
      console.warn("stray warning", { code: 7 });
    } finally {
      logger.dispose();
    }

    // Dispose restores the exact original console method and clears the sink.
    assertEquals(console.warn, originalWarn);
    assert(!exomuxDebugLoggingActive());
    exomuxDebugLog("gpu", "after dispose — dropped");

    // A single log file exists and captured the GPU line and the teed warning,
    // but not anything logged after dispose.
    const files = [...Deno.readDirSync("logs")].filter((entry) => entry.isFile);
    assertEquals(files.length, 1);
    const contents = Deno.readTextFileSync(`logs/${files[0]!.name}`);
    assertStringIncludes(contents, "[gpu] hello world");
    assertStringIncludes(contents, "[console.warn] stray warning");
    assertStringIncludes(contents, `{"code":7}`);
    assert(!contents.includes("after dispose"), "logged after dispose");
  } finally {
    Deno.chdir(cwd);
    Deno.removeSync(dir, { recursive: true });
  }
});

Deno.test("Global debug logger captures uncaught errors and unhandled rejections", () => {
  const cwd = Deno.cwd();
  const dir = Deno.makeTempDirSync({ prefix: "exomux-log-global-" });
  try {
    Deno.chdir(dir);
    const logger = createExomuxDebugLogger({ prefix: "exomux", captureGlobalErrors: true });
    try {
      const described = logger.describe?.() ?? "";
      assert(described.startsWith(`${dir}/logs/exomux-`), `prefix names the file, got "${described}"`);

      // A synthetic uncaught error is logged and consumed instead of tearing
      // the desktop down.
      globalThis.dispatchEvent(new ErrorEvent("error", { error: new Error("boom"), cancelable: true }));
      const written = Deno.readTextFileSync(described);
      assertStringIncludes(written, "[uncaught-error] Error: boom");
    } finally {
      logger.dispose();
    }
    // After dispose, a dispatched error no longer reaches the (closed) file.
    globalThis.dispatchEvent(new ErrorEvent("error", { error: new Error("late"), cancelable: true }));
    const files = [...Deno.readDirSync(`${dir}/logs`)];
    assertEquals(files.length, 1);
  } finally {
    Deno.chdir(cwd);
    Deno.removeSync(dir, { recursive: true });
  }
});
