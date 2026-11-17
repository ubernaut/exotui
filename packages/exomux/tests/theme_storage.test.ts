// Copyright 2026 ubernaut. MIT license.

import { assertEquals, assertRejects } from "./deps.ts";
import { createExomuxThemeStorage } from "../theme_storage.ts";

Deno.test("Exomux filesystem theme storage retains saved documents across instances and removes them", async () => {
  const directory = await Deno.makeTempDir({ prefix: "exomux-theme-storage-" });
  const path = `${directory}/themes`;
  try {
    const writer = createExomuxThemeStorage(path);
    assertEquals(await writer.list(), []);
    assertEquals(await writer.read("missing"), undefined);
    const document = '{"id":"my-theme","tokens":{"surface":"#112233"}}';
    await writer.write("my-theme", document);
    await writer.write("another-theme", "{}");
    const reader = createExomuxThemeStorage(path);
    assertEquals(await reader.list(), ["another-theme", "my-theme"]);
    assertEquals((await reader.read("my-theme"))!.trim(), document);
    assertEquals([...Deno.readDirSync(path)].filter((entry) => entry.name.includes(".tmp-")).length, 0);
    await reader.remove("my-theme");
    assertEquals(await writer.read("my-theme"), undefined);
    await reader.remove("my-theme");
    await assertRejects(() => writer.write("../outside", "{}"), TypeError);
    assertEquals(await reader.read("../outside"), undefined);
    assertEquals(await reader.list(), ["another-theme"]);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
