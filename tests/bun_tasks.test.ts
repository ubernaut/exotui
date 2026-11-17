// Copyright 2026 ubernaut. MIT license.
import { assertEquals } from "./deps.ts";
import { runtimeHost } from "../src/runtime/host.ts";

Deno.test({
  name: "Bun translated task executes in its requested directory instead of printing CLI usage",
  ignore: !("Bun" in globalThis),
  async fn() {
    const script = "../scripts/bun_tasks.ts";
    const { translateBunTask } = await import(script);
    const directory = await runtimeHost.makeTempDir({ prefix: "bun task cwd " });
    try {
      await runtimeHost.writeTextFile(
        `${directory}/package.json`,
        JSON.stringify({
          scripts: { probe: "printf 'TASK_EXECUTED\\n'; pwd" },
        }),
      );
      const command = translateBunTask(`deno task --cwd '${directory}' probe`, runtimeHost.execPath());
      const result = await new runtimeHost.Command("sh", { args: ["-c", command] }).output();
      assertEquals(result.code, 0);
      assertEquals(new TextDecoder().decode(result.stdout), `TASK_EXECUTED\n${directory}\n`);
    } finally {
      await runtimeHost.remove(directory, { recursive: true });
    }
  },
});
