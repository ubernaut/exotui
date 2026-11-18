// Invoked separately by Deno and Bun against the launcher's SQLite file.
import { DatabaseSync } from "node:sqlite";
import process from "node:process";
import { readFileSync } from "node:fs";
import { sqliteStateStore } from "./sqlite_store.ts";

const [path, action] = process.argv.slice(2);
if (!path || (action !== "seed" && action !== "verify")) throw new Error("Expected DB and seed or verify");
const db = new DatabaseSync(path);
try {
  db.exec(readFileSync(new URL("./store.sql", import.meta.url), "utf8"));
  const store = sqliteStateStore<{
    barHints: boolean;
    wallpaper?: string;
    windowOpacity?: number;
    animations?: { kinds: { open: "off" } };
    label?: string;
  }>(db, "desktop");
  if (action === "seed") {
    await store.set("settings", {
      barHints: false,
      wallpaper: "dots",
      windowOpacity: 1,
      animations: { kinds: { open: "off" } },
    });
    await store.set("unicode", { barHints: false, label: "⚡ 色" });
  } else {
    const settings = await store.get("settings");
    if (settings?.barHints !== false || settings.wallpaper !== "plain") throw new Error("WASI settings write missing");
    if ((await store.get("unicode"))?.label !== "⚡ 色") throw new Error("Unicode settings did not round trip");
    await store.set("temporary", settings);
    const writer = new DatabaseSync(path);
    try {
      writer.exec("BEGIN IMMEDIATE");
      let rejected = false;
      try {
        await store.set("temporary", { barHints: true });
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error("Concurrent write was not rejected");
    } finally {
      writer.close();
    }
    if ((await store.get("temporary"))?.barHints !== false) throw new Error("Rejected write modified state");
    await store.delete("temporary");
    if (await store.get("temporary") !== undefined) throw new Error("Delete was not visible");
    db.prepare("INSERT INTO exotui_kv VALUES (?, ?, ?)").run("desktop", "corrupt", new Uint8Array([0xff]));
    let rejected = false;
    try {
      await store.get("corrupt");
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("Corrupt UTF-8 was accepted");
    await store.delete("corrupt");
  }
} finally {
  db.close();
}
