// Copyright 2023 Im-Beast. MIT license.
import { Component, type ComponentOptions } from "../component.ts";
import { Computed, type Signal } from "../signals/mod.ts";
import { drawTextChild } from "./text_children.ts";

/** Options for configuring status Bar. */
export interface StatusBarOptions extends ComponentOptions {
  left: string | Signal<string>;
  right?: string | Signal<string>;
  priority?: StatusBarPriority;
}

/** Which side keeps more text when both status segments cannot fit. */
export type StatusBarPriority = "left" | "right";

/** Renders status Bar into deterministic text rows. */
export function renderStatusBar(
  left: string,
  right: string,
  width: number,
  priority: StatusBarPriority = "left",
): string {
  const safeWidth = Math.max(0, width);
  if (priority === "right") return renderRightPriorityStatusBar(left, right, safeWidth);
  let leftText = fitStatusText(left, safeWidth);
  const remaining = safeWidth - leftText.length;
  if (remaining <= 0) return leftText;

  const minGap = leftText.length > 0 && right.length > 0 ? Math.min(2, safeWidth) : 0;
  let rightText = fitStatusText(right, remaining);
  let gap = Math.max(0, safeWidth - leftText.length - rightText.length);
  if (rightText.length > 0 && gap < minGap) {
    const trim = Math.min(leftText.length, minGap - gap);
    leftText = fitStatusText(left, leftText.length - trim);
    rightText = fitStatusText(right, Math.max(0, safeWidth - leftText.length - minGap));
    gap = rightText.length > 0 ? Math.max(minGap, safeWidth - leftText.length - rightText.length) : 0;
  }
  return `${leftText}${" ".repeat(gap)}${rightText}`;
}

function renderRightPriorityStatusBar(left: string, right: string, width: number): string {
  const rightText = fitStatusText(right, width);
  if (rightText.length >= width) return rightText;
  const minGap = left.length > 0 && rightText.length > 0 ? Math.min(2, width) : 0;
  const leftWidth = Math.max(0, width - rightText.length - minGap);
  const leftText = fitStatusText(left, leftWidth);
  const gap = rightText.length > 0 ? Math.max(0, width - leftText.length - rightText.length) : 0;
  return `${leftText}${" ".repeat(gap)}${rightText}`;
}

/** Truncated status text ends in an ellipsis instead of clipping mid-word. */
function fitStatusText(text: string, width: number): string {
  if (width <= 0) return "";
  if (text.length <= width) return text;
  return width === 1 ? "…" : `${text.slice(0, width - 1)}…`;
}

/** Public class implementing a status Bar. */
export class StatusBar extends Component {
  constructor(private readonly options: StatusBarOptions) {
    super(options);
  }

  override draw(): void {
    super.draw();

    drawTextChild(
      this,
      new Computed(() => {
        const left = typeof this.options.left === "string" ? this.options.left : this.options.left.value;
        const right = this.options.right === undefined
          ? ""
          : typeof this.options.right === "string"
          ? this.options.right
          : this.options.right.value;
        return renderStatusBar(left, right, this.rectangle.value.width, this.options.priority);
      }),
    );
  }
}
