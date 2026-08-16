// Copyright 2023 Im-Beast. MIT license.

// NAV-009: route-owned focus/selection/scroll anchors — restoration falls
// back safely on missing targets and hidden windows never receive focus.

import { assertEquals } from "./deps.ts";
import { createRouteAnchorStore, type RouteAnchorHost } from "../mod.ts";

function host(focusableIds: readonly string[]) {
  const log: string[] = [];
  const surface: RouteAnchorHost = {
    focusable: (id) => focusableIds.includes(id),
    applyFocus: (id) => log.push(`focus:${id}`),
    applySelection: (id, selection) => log.push(`select:${id}:${selection.start}-${selection.end}`),
    applyScroll: (scroll) => log.push(`scroll:${scroll.x},${scroll.y}`),
    fallbackFocus: () => log.push("fallback"),
  };
  return { surface, log };
}

Deno.test("anchors roundtrip: focus, selection, and scroll all restore", () => {
  const store = createRouteAnchorStore();
  store.capture("/editor", { focusId: "body", selection: { start: 4, end: 9 }, scroll: { x: 0, y: 120 } });
  const { surface, log } = host(["body"]);
  const report = store.restore("/editor", surface);
  assertEquals(report, { focused: true, selectionApplied: true, scrolled: true, usedFallback: false });
  assertEquals(log, ["focus:body", "select:body:4-9", "scroll:0,120"]);
});

Deno.test("missing targets and hidden windows fall back; selection follows focus only", () => {
  const store = createRouteAnchorStore();
  store.capture("/editor", { focusId: "gone", selection: { start: 1, end: 2 }, scroll: { x: 3, y: 4 } });
  // The control does not exist (or its window is hidden/minimized): the host
  // answers focusable=false, so focus goes to the fallback and the selection
  // never applies to a ghost - but scroll still restores.
  const { surface, log } = host([]);
  const report = store.restore("/editor", surface);
  assertEquals(report, { focused: false, selectionApplied: false, scrolled: true, usedFallback: true });
  assertEquals(log, ["fallback", "scroll:3,4"]);

  // Without a fallback the restore is a clean partial, never a throw.
  const bare = host([]);
  delete (bare.surface as { fallbackFocus?: unknown }).fallbackFocus;
  const partial = store.restore("/editor", bare.surface);
  assertEquals(partial.usedFallback, false);
  assertEquals(bare.log, ["scroll:3,4"]);

  // Unknown routes restore nothing at all.
  const empty = host(["body"]);
  assertEquals(store.restore("/unknown", empty.surface), {
    focused: false,
    selectionApplied: false,
    scrolled: false,
    usedFallback: false,
  });
  assertEquals(empty.log, []);
  store.clear("/editor");
  assertEquals(store.inspect().routes, []);
});
