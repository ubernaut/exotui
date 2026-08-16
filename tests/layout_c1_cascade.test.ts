// Copyright 2023 Im-Beast. MIT license.

// C1 cascade language: !important ordering, initial resets, bounded nested
// rules with &, composed stylesheets, and the high-value pseudo classes
// (036 C1).

import { assert, assertEquals } from "./deps.ts";
import { createMarkupLayout, inspectTuiCssSupport, type LayoutNode } from "../mod.ts";

function styled(root: LayoutNode, id: string): LayoutNode {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = child.id === id ? child : child.children.length > 0 ? tryStyled(child, id) : undefined;
    if (found) return found;
  }
  throw new Error(`node ${id} not styled`);
}

function tryStyled(root: LayoutNode, id: string): LayoutNode | undefined {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = tryStyled(child, id);
    if (found) return found;
  }
  return undefined;
}

const bounds = { column: 0, row: 0, width: 40, height: 12 };

Deno.test("C1 !important outranks normal declarations across sources", () => {
  const result = createMarkupLayout({
    markup: `<window id="main" style="width: 30">Main</window>`,
    css: `
      #main { width: 10 !important; }
      window { width: 5; }
    `,
    bounds,
    widgets: false,
  });
  // Important stylesheet beats normal inline; among normals, inline beats all.
  assertEquals(result.styledRoot.style.width, { unit: "cell", value: 10 });

  const inlineImportant = createMarkupLayout({
    markup: `<window id="main" style="width: 30 !important">Main</window>`,
    css: `#main { width: 10 !important; }`,
    bounds,
    widgets: false,
  });
  assertEquals(inlineImportant.styledRoot.style.width, { unit: "cell", value: 30 });
});

Deno.test("C1 initial resets a property and its authored spacing metadata", () => {
  const result = createMarkupLayout({
    markup: `<window id="main"><panel id="reset">R</panel></window>`,
    css: `
      window { width: 32; height: 10; }
      panel { width: 20; margin: 25%; }
      #reset { width: initial; margin: initial; }
    `,
    bounds,
    widgets: false,
  });
  const reset = styled(result.styledRoot, "reset");
  assertEquals(reset.style.width, { unit: "auto", value: 0 });
  assertEquals(reset.style.margin, { top: 0, right: 0, bottom: 0, left: 0 });
  // The layout reflects the reset: no percent margin narrows the panel.
  assertEquals(result.layout.byId.get("reset")!.rect.width, 32);
});

Deno.test("C1 nested rules expand & and bare descendants with lists", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <panel id="plain" class="card">P</panel>
        <panel id="hot" class="card active">H</panel>
        <panel id="wrap" class="card"><panel id="inner">I</panel></panel>
        <panel id="outside">O</panel>
      </window>
    `,
    css: `
      .card {
        width: 10;
        &.active { width: 20; }
        panel {
          height: 3;
          &#inner { width: 4; }
        }
      }
    `,
    bounds: { column: 0, row: 0, width: 60, height: 20 },
    widgets: false,
  });
  assertEquals(styled(result.styledRoot, "plain").style.width, { unit: "cell", value: 10 });
  assertEquals(styled(result.styledRoot, "hot").style.width, { unit: "cell", value: 20 });
  const inner = styled(result.styledRoot, "inner");
  assertEquals(inner.style.height, { unit: "cell", value: 3 });
  assertEquals(inner.style.width, { unit: "cell", value: 4 });
  // A node outside .card is untouched by the nested descendant rule.
  assertEquals(styled(result.styledRoot, "outside").style.height, { unit: "auto", value: 0 });
});

Deno.test("C1 nesting past the depth cap is dropped, not misparsed", () => {
  let css = ".a { width: 1;";
  for (let depth = 0; depth < 12; depth += 1) css += ` .n${depth} { width: ${depth + 2};`;
  css += " } ".repeat(13);
  const result = createMarkupLayout({
    markup: `<window id="main" class="a">Main</window>`,
    css,
    bounds,
    widgets: false,
  });
  assertEquals(result.styledRoot.style.width, { unit: "cell", value: 1 });
});

Deno.test("C1 composed stylesheets apply in order with later sources winning", () => {
  const result = createMarkupLayout({
    markup: `<window id="main">Main</window>`,
    css: [
      `#main { width: 10; height: 4; }`,
      `#main { width: 24; }`,
    ],
    bounds,
    widgets: false,
  });
  assertEquals(result.styledRoot.style.width, { unit: "cell", value: 24 });
  assertEquals(result.styledRoot.style.height, { unit: "cell", value: 4 });
});

Deno.test("C1 structural and environment pseudo classes match", () => {
  const markup = `
    <window id="main">
      <panel id="first">A</panel>
      <panel id="mid"></panel>
      <panel id="last">C</panel>
      <toolbar id="bar">T</toolbar>
    </window>
  `;
  const result = createMarkupLayout({
    markup,
    css: `
      panel:first-of-type { width: 11; }
      panel:last-of-type { width: 12; }
      panel:empty { height: 9; }
      #main > panel:odd { min-width: 2; }
      #main > panel:even { min-width: 3; }
    `,
    bounds: { column: 0, row: 0, width: 60, height: 20 },
    widgets: false,
  });
  assertEquals(styled(result.styledRoot, "first").style.width, { unit: "cell", value: 11 });
  assertEquals(styled(result.styledRoot, "last").style.width, { unit: "cell", value: 12 });
  assertEquals(styled(result.styledRoot, "mid").style.height, { unit: "cell", value: 9 });
  assertEquals(styled(result.styledRoot, "first").style.minWidth, { unit: "cell", value: 2 });
  assertEquals(styled(result.styledRoot, "mid").style.minWidth, { unit: "cell", value: 3 });
  // last is position 3 (odd).
  assertEquals(styled(result.styledRoot, "last").style.minWidth, { unit: "cell", value: 2 });

  const environment = createMarkupLayout({
    markup: `<window id="main"><panel id="kid">K</panel></window>`,
    css: `
      #main:dark { width: 13; }
      #main:light { width: 14; }
      #main:screen-inline { height: 5; }
      #main:focus-within { min-width: 21; }
      #kid:enabled { width: 6; }
    `,
    bounds,
    widgets: false,
    cascade: {
      colorScheme: "dark",
      rendererMode: "inline",
      states: { kid: ["focus"] },
    },
  });
  assertEquals(environment.styledRoot.style.width, { unit: "cell", value: 13 });
  assertEquals(environment.styledRoot.style.height, { unit: "cell", value: 5 });
  // The child's focus lights the parent's :focus-within.
  assertEquals(environment.styledRoot.style.minWidth, { unit: "cell", value: 21 });
  assertEquals(styled(environment.styledRoot, "kid").style.width, { unit: "cell", value: 6 });

  const disabled = createMarkupLayout({
    markup: `<window id="main"><panel id="kid">K</panel></window>`,
    css: `#kid:enabled { width: 6; }`,
    bounds,
    widgets: false,
    cascade: { states: { kid: ["disabled"] } },
  });
  assertEquals(styled(disabled.styledRoot, "kid").style.width, { unit: "auto", value: 0 });
});

Deno.test("C1 support report lists the new cascade surface", () => {
  const report = inspectTuiCssSupport();
  assert(report.selectors.includes("nested rules with &"));
  assert(report.selectors.includes("!important"));
  assert(report.pseudoStates.includes("focus-within"));
  assert(report.pseudoStates.includes("dark"));
  assert(report.lengthUnits.includes("min-content"));
});
