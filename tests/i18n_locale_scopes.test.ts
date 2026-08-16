// Copyright 2023 Im-Beast. MIT license.

// LOC-007: subtree locale/direction overrides inherit unspecified fields
// and isolate completely from siblings.

import { assertEquals } from "./deps.ts";
import { createLocaleScopeTree } from "../mod.ts";

function tree() {
  const scopes = createLocaleScopeTree({
    requested: ["en"],
    supported: ["en", "de", "he", "ar"],
    timeZone: "UTC",
  });
  scopes.declare("app", undefined);
  scopes.declare("sidebar", "app");
  scopes.declare("hebrew-panel", "app", { requested: ["he"] });
  scopes.declare("hebrew-child", "hebrew-panel", { timeZone: "Asia/Jerusalem" });
  return scopes;
}

Deno.test("overrides isolate to their subtree; siblings inherit the root", () => {
  const scopes = tree();
  const sidebar = scopes.resolve("sidebar");
  assertEquals(sidebar.context.resolve().resolved, "en");
  assertEquals(sidebar.direction, "ltr");
  assertEquals(sidebar.overridden, []);

  const hebrew = scopes.resolve("hebrew-panel");
  assertEquals(hebrew.context.resolve().resolved, "he");
  assertEquals(hebrew.direction, "rtl"); // auto-derived from the language
  assertEquals(hebrew.overridden, ["requested"]);

  // The sibling is untouched by the Hebrew subtree.
  assertEquals(scopes.resolve("sidebar").direction, "ltr");
});

Deno.test("children inherit overridden fields and may add their own", () => {
  const scopes = tree();
  const child = scopes.resolve("hebrew-child");
  assertEquals(child.context.resolve().resolved, "he"); // inherited from panel
  assertEquals(child.context.resolve().timeZone, "Asia/Jerusalem"); // own override
  assertEquals(child.direction, "rtl");
  assertEquals(child.overridden, ["timeZone"]); // requested is inherited, not local

  // An explicit direction beats the auto derivation.
  scopes.update("hebrew-child", { timeZone: "Asia/Jerusalem", direction: "ltr" });
  assertEquals(scopes.resolve("hebrew-child").direction, "ltr");
});

Deno.test("removing a scope restores inheritance; unknown ids resolve at the root", () => {
  const scopes = createLocaleScopeTree({ requested: ["en"], supported: ["en", "ar"] });
  const dispose = scopes.declare("arabic", undefined, { requested: ["ar"] });
  assertEquals(scopes.resolve("arabic").direction, "rtl");
  dispose();
  assertEquals(scopes.resolve("arabic").context.resolve().resolved, "en"); // back to root
  assertEquals(scopes.resolve(undefined).direction, "ltr");
  assertEquals(scopes.inspect().scopes, []);
});
