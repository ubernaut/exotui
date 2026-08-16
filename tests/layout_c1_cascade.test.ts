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

Deno.test("C1 scalar offset translates boxes and hit regions without reflow", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <panel id="moved">M</panel>
        <panel id="still">S</panel>
      </window>
    `,
    css: `
      panel { width: 6; height: 2; }
      #moved { offset: 3 1; }
    `,
    bounds: { column: 0, row: 0, width: 40, height: 12 },
    widgets: false,
  });
  const moved = result.layout.byId.get("moved")!;
  const still = result.layout.byId.get("still")!;
  // The translated box moved visually; its sibling stayed in normal flow at
  // the un-offset position (row 2, not 3).
  assertEquals(moved.rect, { column: 3, row: 1, width: 6, height: 2 });
  assertEquals(moved.hitRegions[0]!.bounds.column, 3);
  assertEquals(still.rect.row, 2);
  // Scroll metadata is untouched by a visual translation.
  assertEquals(result.layout.root.scrollHeight, result.layout.root.rect.height);

  const longhand = createMarkupLayout({
    markup: `<window id="main"><panel id="moved">M</panel></window>`,
    css: `#moved { width: 4; height: 1; offset-x: -2; offset-y: 2; }`,
    bounds: { column: 10, row: 0, width: 20, height: 8 },
    widgets: false,
  });
  assertEquals(longhand.layout.byId.get("moved")!.rect.column, 8);
  assertEquals(longhand.layout.byId.get("moved")!.rect.row, 2);

  const invalid = createMarkupLayout({
    markup: `<window id="main"><panel id="moved">M</panel></window>`,
    css: `#moved { offset: 3; }`,
    bounds: { column: 0, row: 0, width: 20, height: 8 },
    widgets: false,
  });
  assertEquals(invalid.layout.byId.get("moved")!.rect.column, 0);
});

Deno.test("C1 inherit copies the parent's computed value; unset resets or re-inherits", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <panel id="wide"><panel id="kid">K</panel></panel>
      </window>
    `,
    css: `
      #wide { width: 17; color: red; }
      #kid { width: inherit; color: blue; }
    `,
    bounds: { column: 0, row: 0, width: 40, height: 10 },
    widgets: false,
  });
  assertEquals(styled(result.styledRoot, "kid").style.width, { unit: "cell", value: 17 });

  const unset = createMarkupLayout({
    markup: `
      <window id="main">
        <panel id="wide"><panel id="kid">K</panel></panel>
      </window>
    `,
    css: `
      #wide { width: 17; color: red; }
      panel panel { width: 9; color: blue; }
      #kid { width: unset; color: unset; }
    `,
    bounds: { column: 0, row: 0, width: 40, height: 10 },
    widgets: false,
  });
  const kid = styled(unset.styledRoot, "kid");
  // width is not an inherited field: unset behaves as initial (auto).
  assertEquals(kid.style.width, { unit: "auto", value: 0 });
  // color is inherited: unset re-inherits the parent's red.
  assertEquals(kid.style.color, "red");
});

Deno.test("C1 scoped widget defaults sit below user rules and stay in their subtree", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="main">
        <button id="plain"><panel id="icon" class="icon">i</panel></button>
        <button id="styled-button">B</button>
        <panel id="loose" class="icon">x</panel>
      </window>
    `,
    css: `button { height: 3; }`,
    bounds: { column: 0, row: 0, width: 40, height: 14 },
    widgets: false,
    cascade: {
      scopedDefaults: {
        button: "width: 7; height: 1; .icon { width: 2; }",
      },
    },
  });
  // The default width applies; the default height loses to the user rule even
  // though the user selector's specificity is no higher.
  assertEquals(styled(result.styledRoot, "plain").style.width, { unit: "cell", value: 7 });
  assertEquals(styled(result.styledRoot, "plain").style.height, { unit: "cell", value: 3 });
  // The nested default is scoped to the widget's subtree.
  assertEquals(styled(result.styledRoot, "icon").style.width, { unit: "cell", value: 2 });
  assertEquals(styled(result.styledRoot, "loose").style.width, { unit: "auto", value: 0 });
});
