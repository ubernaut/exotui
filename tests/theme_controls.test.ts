// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals } from "./deps.ts";
import {
  CONTROL_TOKEN_GROUP_IDS,
  CONTROL_TOKEN_GROUP_LABELS,
  CONTROL_TOKENS,
  controlToken,
  controlTokenChain,
  controlTokenGroups,
  controlTokenRegistry,
  resolveControlToken,
  resolveControlTokens,
} from "../src/theme_controls.ts";
import { themeTokenNames } from "../src/theme.ts";
import type { Rgb } from "../src/theme_expressions.ts";

// Plan 042 slice A. The promise this module makes is that naming forty control
// colours costs an existing theme nothing: a theme with the original seven
// resolves every one of them, and overriding any of them is optional.

/** A theme that knows only the compatibility profile. */
const SEVEN: Readonly<Record<string, Rgb>> = Object.freeze({
  foreground: [230, 230, 230],
  muted: [140, 140, 140],
  accent: [80, 160, 255],
  success: [90, 200, 120],
  warning: [230, 180, 70],
  danger: [230, 90, 90],
  surface: [20, 20, 28],
});

Deno.test("every control token resolves against a theme that defines only the seven", () => {
  const resolved = resolveControlTokens(SEVEN);
  assertEquals(Object.keys(resolved).length, CONTROL_TOKENS.length);
  for (const token of CONTROL_TOKENS) {
    const color = resolved[token.name];
    assert(color, `${token.name} did not resolve`);
    // Whatever it resolved to is one of the seven, because nothing else is set.
    assert(
      Object.values(SEVEN).some((core) => core[0] === color[0] && core[1] === color[1] && core[2] === color[2]),
      `${token.name} resolved to a colour the theme never defined`,
    );
  }
});

Deno.test("a fallback chain ends at a core token and every link is declared", () => {
  const registry = controlTokenRegistry();
  const core = new Set<string>(themeTokenNames);
  for (const token of CONTROL_TOKENS) {
    const chain = controlTokenChain(token.name);
    assertEquals(chain[0], token.name, "a chain starts at the token itself");
    assert(core.has(chain.at(-1)!), `${token.name} does not end at a core token: ${chain.join(" -> ")}`);
    assertEquals(new Set(chain).size, chain.length, `${token.name} has a cycle: ${chain.join(" -> ")}`);
    for (const link of chain) assert(registry.has(link) || core.has(link), `${link} is not a known token`);
  }
});

Deno.test("an override wins over the chain, and only for the tokens under it", () => {
  const pink: Rgb = [247, 101, 184];
  // Overriding the chrome tier moves everything that inherits from it...
  const chromed = resolveControlTokens({ ...SEVEN, "chrome:accent": pink });
  assertEquals(chromed["window:titlebar-background-active"], pink);
  assertEquals(chromed["menu:background-selected"], pink);
  assertEquals(chromed["button:background-active"], pink);
  // ...and nothing that does not.
  assertEquals(chromed["window:background"], SEVEN.surface);
  assertEquals(chromed["chrome:foreground"], SEVEN.foreground);

  // A leaf override moves only itself.
  const blue: Rgb = [31, 162, 255];
  const leaf = resolveControlTokens({ ...SEVEN, "chrome:accent": pink, "window:border-active": blue });
  assertEquals(leaf["window:border-active"], blue);
  assertEquals(leaf["menu:background-selected"], pink, "its siblings still follow the chrome tier");
});

Deno.test("resolution reports undefined only when the whole chain is undefined", () => {
  assertEquals(resolveControlToken("button:foreground", {}), undefined);
  assertEquals(resolveControlToken("button:foreground", { foreground: [1, 2, 3] }), [1, 2, 3]);
  // An unknown name is not a control token and resolves only to itself.
  assertEquals(controlTokenChain("nonsense:token"), ["nonsense:token"]);
  assertEquals(resolveControlToken("nonsense:token", { "nonsense:token": [4, 5, 6] }), [4, 5, 6]);
  assertEquals(resolveControlToken("nonsense:token", SEVEN), undefined);
});

Deno.test("groups cover every token exactly once, in a stable order", () => {
  const groups = controlTokenGroups();
  assertEquals(groups.map((group) => group.id), [...CONTROL_TOKEN_GROUP_IDS]);
  const seen = new Set<string>();
  for (const group of groups) {
    assertEquals(group.label, CONTROL_TOKEN_GROUP_LABELS[group.id]);
    assert(group.tokens.length > 0, `${group.id} is empty`);
    for (const token of group.tokens) {
      assertEquals(token.group, group.id);
      assert(!seen.has(token.name), `${token.name} appears in more than one group`);
      seen.add(token.name);
    }
  }
  assertEquals(seen.size, CONTROL_TOKENS.length);
});

Deno.test("token names are namespaced, unique, and looked up by name", () => {
  const seen = new Set<string>();
  for (const token of CONTROL_TOKENS) {
    assert(/^[a-z]+:[a-z-]+$/.test(token.name), `${token.name} is not a lowercase namespaced name`);
    assert(!seen.has(token.name), `${token.name} is declared twice`);
    seen.add(token.name);
    assertEquals(controlToken(token.name), token);
    assert(token.label.length > 0, `${token.name} has no label`);
  }
  assertEquals(controlToken("no:such-token"), undefined);
});

Deno.test("every foreground names the background it is read against", () => {
  for (const token of CONTROL_TOKENS) {
    if (token.role !== "foreground") continue;
    assert(token.against, `${token.name} is a foreground with nothing to read it against`);
    const against = controlToken(token.against!);
    assert(against, `${token.name} is read against ${token.against}, which is not a token`);
    assertEquals(against!.role, "background", `${token.against} is not a background`);
  }
});

Deno.test("the registry is built once and shared", () => {
  assert(controlTokenRegistry() === controlTokenRegistry(), "declaring is pure but not free");
});
