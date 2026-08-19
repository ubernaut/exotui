// Copyright 2023 Im-Beast. MIT license.

// PKG-001: every generated template formats, type-checks, tests, and
// uses only declared permissions (the declared set is empty — the
// generated suites run under a bare `deno test`).

import { assert, assertEquals } from "./deps.ts";
import { generateTemplate, TEMPLATE_KINDS, TEMPLATE_VERSION } from "../mod.ts";

async function runIn(directory: string, args: string[]): Promise<{ ok: boolean; output: string }> {
  const command = new Deno.Command("deno", {
    args,
    cwd: directory,
    stdout: "piped",
    stderr: "piped",
  });
  const result = await command.output();
  const output = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
  return { ok: result.success, output };
}

Deno.test("all four templates generate, format, type-check, and test cleanly", async () => {
  const repoRoot = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
  for (const kind of TEMPLATE_KINDS) {
    const files = generateTemplate(kind, { importSource: repoRoot });
    assert(files["deno.json"]!.includes(TEMPLATE_VERSION)); // versioned assets
    const directory = await Deno.makeTempDir({ prefix: `init-${kind}-` });
    try {
      for (const [name, contents] of Object.entries(files)) {
        await Deno.writeTextFile(`${directory}/${name}`, contents);
      }
      const entry = kind === "library" ? "mod.ts" : "main.ts";

      const formatted = await runIn(directory, ["fmt", "--check"]);
      assert(formatted.ok, `${kind}: fmt --check failed\n${formatted.output}`);

      const checked = await runIn(directory, ["check", entry]);
      assert(checked.ok, `${kind}: type-check failed\n${checked.output}`);

      // A bare `deno test` — no permission flags — proves the template
      // uses only its (empty) declared permission set.
      const tested = await runIn(directory, ["test"]);
      assert(tested.ok, `${kind}: test failed\n${tested.output}`);
      assert(/1 passed/.test(tested.output), `${kind}: no tests ran\n${tested.output}`);
    } finally {
      await Deno.remove(directory, { recursive: true });
    }
  }
});

Deno.test("templates embed versioned assets and declared import maps", () => {
  const files = generateTemplate("terminal");
  const config = JSON.parse(files["deno.json"]!);
  assertEquals(config.templateVersion, TEMPLATE_VERSION);
  assert(config.imports["@ubernaut/exotui"].startsWith("jsr:")); // default source
  assertEquals(config.tasks.test, "deno test"); // no ambient permissions declared

  const local = generateTemplate("terminal", { importSource: "/checkout" });
  assertEquals(JSON.parse(local["deno.json"]!).imports["@ubernaut/exotui"], "/checkout/mod.ts");
});
