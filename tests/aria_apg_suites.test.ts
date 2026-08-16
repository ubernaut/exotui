// Copyright 2023 Im-Beast. MIT license.

// QAL-004: each supported pattern declares deviations and passes
// automated accessible-name/focus assertions.

import { assert, assertEquals } from "./deps.ts";
import type { AccessibilityNode } from "../mod.ts";
import { runAriaPatternSuite } from "../mod.testing.ts";

const TABLIST: AccessibilityNode = {
  role: "tablist",
  label: "Sessions",
  children: [
    { role: "tab", label: "main", states: { selected: true } },
    { role: "tab", label: "logs", states: { selected: false } },
  ],
};

Deno.test("conformant tablist passes role, name, state, and keyboard checks", () => {
  const report = runAriaPatternSuite("tablist", TABLIST);
  assert(report.conformant);
  assertEquals(report.deviations, []);
  assert(report.checks.every((check) => check.status === "passed"));
});

Deno.test("undeclared breaks fail; the same break declared records as a deviation", () => {
  const twoSelected: AccessibilityNode = {
    role: "tablist",
    children: [
      { role: "tab", label: "a", states: { selected: true } },
      { role: "tab", label: "b", states: { selected: true } },
    ],
  };
  const failed = runAriaPatternSuite("tablist", twoSelected);
  assert(!failed.conformant);
  assertEquals(failed.checks.find((check) => check.status === "failed")!.detail, "2 tabs selected");

  const declared = runAriaPatternSuite("tablist", twoSelected, {
    deviations: ["exactly one tab is selected"],
  });
  assert(declared.conformant); // conformant WITH visible deviations
  assertEquals(declared.deviations, ["exactly one tab is selected"]);
});

Deno.test("tree suite checks names, expanded state on branches, and keyboard spec", () => {
  const tree: AccessibilityNode = {
    role: "tree",
    label: "Files",
    children: [{
      role: "treeitem",
      label: "src",
      states: { expanded: true },
      children: [{ role: "treeitem", label: "mod.ts" }],
    }],
  };
  assert(runAriaPatternSuite("tree", tree).conformant);

  const missingExpanded: AccessibilityNode = {
    role: "tree",
    children: [{ role: "treeitem", label: "src", children: [{ role: "treeitem", label: "a" }] }],
  };
  const report = runAriaPatternSuite("tree", missingExpanded);
  assert(!report.conformant);
});

Deno.test("listbox enforces at-most-one focused node; dialog requires focus restore", () => {
  const doubleFocus: AccessibilityNode = {
    role: "list",
    children: [
      { role: "listitem", label: "a", states: { focused: true } },
      { role: "listitem", label: "b", states: { focused: true } },
    ],
  };
  const listReport = runAriaPatternSuite("listbox", doubleFocus);
  assert(!listReport.conformant);
  assertEquals(listReport.checks.find((check) => check.status === "failed")!.detail, "2 focused nodes");

  const dialog: AccessibilityNode = { role: "dialog", label: "Settings" };
  const dialogReport = runAriaPatternSuite("dialog", dialog);
  assert(dialogReport.conformant); // modal-close restores previous focus per T3 spec
});

Deno.test("grid and menu suites assert structure and names", () => {
  const grid: AccessibilityNode = {
    role: "grid",
    label: "Results",
    children: [{ role: "row", children: [{ role: "cell", label: "x" }] }],
  };
  assert(runAriaPatternSuite("grid", grid).conformant);
  const menu: AccessibilityNode = {
    role: "menu",
    label: "Workbench menu",
    children: [{ role: "menuitem", label: "Open" }],
  };
  assert(runAriaPatternSuite("menu", menu).conformant);
});
