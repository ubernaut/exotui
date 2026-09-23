import { assertEquals, assertRejects } from "./deps.ts";
import { openExomuxLocalLink } from "../open_link.ts";

Deno.test({
  name: "local link opening passes one literal URL to the OS launcher and reports failures",
  ignore: Deno.build.os === "windows",
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "exomux-link-opener-" });
    const name = Deno.build.os === "darwin" ? "open" : "xdg-open";
    const output = `${root}/url.txt`;
    const path = Deno.env.get("PATH");
    const previousRecord = Deno.env.get("EXOMUX_TEST_LINK_RECORD");
    try {
      await Deno.writeTextFile(`${root}/${name}`, '#!/bin/sh\nprintf "%s" "$1" > "$EXOMUX_TEST_LINK_RECORD"\n');
      await Deno.chmod(`${root}/${name}`, 0o700);
      Deno.env.set("PATH", `${root}:${path ?? ""}`);
      Deno.env.set("EXOMUX_TEST_LINK_RECORD", output);
      const url = "https://example.com/?x=$(echo)&a=b;c=d";
      await openExomuxLocalLink(url);
      assertEquals(await Deno.readTextFile(output), url);
      await assertRejects(() => openExomuxLocalLink("javascript:alert(1)"), TypeError);
      assertEquals(await Deno.readTextFile(output), url);
      await Deno.writeTextFile(`${root}/${name}`, "#!/bin/sh\nexit 7\n");
      await assertRejects(() => openExomuxLocalLink(url), Error, "status 7");
    } finally {
      if (path === undefined) Deno.env.delete("PATH");
      else Deno.env.set("PATH", path);
      if (previousRecord === undefined) Deno.env.delete("EXOMUX_TEST_LINK_RECORD");
      else Deno.env.set("EXOMUX_TEST_LINK_RECORD", previousRecord);
      await Deno.remove(root, { recursive: true });
    }
  },
});
