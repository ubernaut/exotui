// Copyright 2023 Im-Beast. MIT license.
import type { MermaidIconData } from "../../../mod.mermaid.ts";

/** Local asymmetric multicolor vectors; no network, icon font or external asset is involved. */
export const MERMAID_ICON_DATA: MermaidIconData = {
  prefix: "long-original-prefix",
  width: 24,
  height: 24,
  icons: {
    signal: {
      body:
        '<path fill="#ff2200" d="M2 2H10V22H2Z"/><path fill="#00dd44" d="M10 14H22V22H10Z"/><path fill="#2255ff" d="M14 2H22V10H14Z"/>',
    },
    local: {
      body:
        '<defs><path id="icon-local-square" d="M2 2H22V22H2Z"/></defs><use href="#icon-local-square" fill="#00dd44"/>',
    },
    current: { body: '<path fill="currentColor" d="M2 2H22V22H2Z"/>' },
  },
  aliases: { turned: { parent: "signal", rotate: 1, hFlip: true } },
};

/** Separate documented icon grammar cases; the family catalogue alone does not cover these features. */
export const MERMAID_ICON_FIXTURES: readonly {
  name: string;
  source: string;
  trusted?: boolean;
  labels: readonly string[];
}[] = [
  {
    name: "icon-bare",
    source: 'flowchart TD\nA@{icon: "stack:signal", h: 96, label: "Bare icon", pos: "t"}',
    labels: ["Bare", "icon"],
  },
  {
    name: "icon-square",
    labels: ["Square", "icon"],
    source: 'flowchart TD\nA@{icon: "stack:signal", form: "square", h: 96, label: "Square icon", pos: "b"}',
  },
  {
    name: "icon-circle",
    labels: ["Circle", "icon"],
    source: 'flowchart TD\nA@{icon: "stack:signal", form: "circle", h: 96, label: "Circle icon", pos: "t"}',
  },
  {
    name: "icon-rounded",
    labels: ["Rounded", "icon"],
    source: 'flowchart TD\nA@{icon: "stack:signal", form: "rounded", h: 96, label: "Rounded icon", pos: "b"}',
  },
  {
    name: "icon-alias",
    source: 'flowchart TD\nA@{icon: "stack:turned", h: 96, label: "Transformed alias"}',
    labels: ["Transformed", "alias"],
  },
  // Mermaid's strict sanitizer strips SVG use. This known host-owned local
  // reference fixture opts into upstream's trusted loose mode and ADD_TAGS use.
  {
    name: "icon-local-use",
    labels: ["Local", "reference"],
    source: 'flowchart TD\nA@{icon: "stack:local", h: 96, label: "Local reference"}',
    trusted: true,
  },
  { name: "icon-fontawesome-label", source: 'flowchart TD\nA["fa:fa-signal Inline icon"]', labels: ["Inline", "icon"] },
  {
    name: "icon-architecture",
    labels: ["Custom", "service", "Built", "in"],
    source: "architecture-beta\nservice a(stack:signal)[Custom service]\nservice b(server)[Built in]\na:R --> L:b",
  },
  {
    name: "icon-tree-explicit",
    labels: ["project", "file.ts"],
    source: "treeView-beta\n    project/ icon(stack:signal)\n        file.ts icon(stack:turned)",
  },
  {
    name: "icon-tree-mapping",
    labels: ["project", "README.md", "file.ts", "hidden.txt"],
    source:
      '---\nconfig:\n  treeView:\n    showIcons: true\n    defaultIconPack: stack\n    filenameIcons:\n      README.md: signal\n    extensionIcons:\n      ".ts": turned\n---\ntreeView-beta\n    project/\n        README.md\n        file.ts\n        hidden.txt icon(none)',
  },
];
