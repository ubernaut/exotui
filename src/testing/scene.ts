// Copyright 2023 Im-Beast. MIT license.

// 036 T1: scene capture beyond plain text. One structured snapshot carries
// styled spans (runs of identically styled cells), focused-cursor state,
// registered hit regions, the live component layout tree, and the last
// render pass's stats — everything a visual-regression assertion or a
// reviewable diff artifact needs, without reaching into renderer internals
// from individual tests.

import type { Canvas } from "../canvas/canvas.ts";
import type { CanvasRenderStats } from "../canvas/canvas.ts";
import type { Component } from "../component.ts";
import type { Rectangle } from "../types.ts";
import type { Signal } from "../signals/mod.ts";
import type { Tui } from "../tui.ts";
import { stripAnsi } from "./snapshot.ts";

/** One run of identically styled contiguous cells on one row. */
export interface TerminalStyledSpan {
  row: number;
  column: number;
  /** Plain visible text of the run. */
  text: string;
  /** The shared leading SGR prefix ("" for unstyled cells). */
  style: string;
}

/** Focused-component cursor state, when the focused component exposes one. */
export interface TerminalCursorCapture {
  /** Raw cursor index inside the focused component's value. */
  position: number;
  /** The focused component's on-screen bounds. */
  bounds: Rectangle;
}

/** One node of the captured component layout tree. */
export interface TerminalLayoutNode {
  kind: string;
  rectangle: Rectangle;
  zIndex: number;
  visible: boolean;
  children: TerminalLayoutNode[];
}

/** Everything one scene capture carries. */
export interface TerminalSceneCapture {
  text: string;
  spans: TerminalStyledSpan[];
  cursor?: TerminalCursorCapture;
  hitRegions: { id: string; bounds: Rectangle; zIndex: number; disabled: boolean }[];
  layout: TerminalLayoutNode[];
  stats: CanvasRenderStats;
}

const decoder = new TextDecoder();
// deno-lint-ignore no-control-regex
const LEADING_SGR = /^(?:\x1b\[[0-9;]*m)+/;

/** Extracts styled spans from a rendered canvas frame buffer. */
export function captureStyledSpans(canvas: Canvas): TerminalStyledSpan[] {
  const spans: TerminalStyledSpan[] = [];
  for (let row = 0; row < canvas.frameBuffer.length; row += 1) {
    const cells = canvas.frameBuffer[row] ?? [];
    let current: TerminalStyledSpan | undefined;
    for (let column = 0; column < cells.length; column += 1) {
      const raw = cells[column];
      const cell = raw === undefined ? " " : typeof raw === "string" ? raw : decoder.decode(raw);
      const style = LEADING_SGR.exec(cell)?.[0] ?? "";
      const text = stripAnsi(cell) || " ";
      if (current && current.style === style && current.column + current.text.length === column) {
        current.text += text;
      } else {
        current = { row, column, text, style };
        spans.push(current);
      }
    }
    current = undefined;
  }
  // Trailing all-space unstyled spans are framing, not content.
  return spans.filter((span) => span.style !== "" || span.text.trim() !== "");
}

/** Captures the component tree with resolved rectangles and paint order. */
export function captureLayoutTree(root: Tui | Component): TerminalLayoutNode[] {
  const nodes: TerminalLayoutNode[] = [];
  const seen = new Set<Component>();
  for (const child of root.children) {
    // Tui.children is a flat registry of every component (each direct child
    // twice); the tree is the parent-edge subset, deduplicated.
    if (child.parent !== root || seen.has(child)) continue;
    seen.add(child);
    nodes.push({
      kind: child.constructor.name,
      rectangle: { ...child.rectangle.peek() },
      zIndex: child.zIndex.peek(),
      visible: child.visible.peek(),
      children: captureLayoutTree(child),
    });
  }
  return nodes;
}

/** The host surfaces a scene capture consumes. */
export interface TerminalSceneSources {
  canvas: Canvas;
  text: string;
  hitRegions?: TerminalSceneCapture["hitRegions"];
  layoutRoot?: Tui;
  focused?: unknown;
}

/** Assembles one full scene capture from already-rendered surfaces. */
export function captureTerminalScene(sources: TerminalSceneSources): TerminalSceneCapture {
  return {
    text: sources.text,
    spans: captureStyledSpans(sources.canvas),
    cursor: cursorOf(sources.focused),
    hitRegions: sources.hitRegions ?? [],
    layout: sources.layoutRoot ? captureLayoutTree(sources.layoutRoot) : [],
    stats: sources.canvas.inspectRender(),
  };
}

function cursorOf(focused: unknown): TerminalCursorCapture | undefined {
  if (typeof focused !== "object" || focused === null) return undefined;
  const candidate = focused as { cursorPosition?: Signal<number>; rectangle?: Signal<Rectangle> };
  if (typeof candidate.cursorPosition?.peek !== "function" || typeof candidate.rectangle?.peek !== "function") {
    return undefined;
  }
  return { position: candidate.cursorPosition.peek(), bounds: { ...candidate.rectangle.peek() } };
}
