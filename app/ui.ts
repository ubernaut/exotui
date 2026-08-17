import { BoxObject } from "../src/canvas/box.ts";
import { TextObject, type TextRectangle } from "../src/canvas/text.ts";
import type { Canvas } from "../src/canvas/canvas.ts";
import { Computed, Signal, type SignalOfObject } from "../src/signals/mod.ts";
import { cropToWidth, textWidth } from "../src/utils/strings.ts";
import type { Style } from "../src/theme.ts";
import type { BorderMode, MenuLine, Rect } from "./types.ts";

const PANEL_BODY_LINE_LIMIT = 1024;
const LIST_VIEW_LINE_LIMIT = 512;

class RetainedTextLines {
  readonly lines: TextObject[] = [];
  private drawn = false;

  private readonly handleRectangle = (rect: Rect) => {
    const previousCount = this.lines.length;
    this.ensureLineCount(Math.min(this.lineLimit, Math.max(0, rect.height)));

    if (!this.drawn) {
      return;
    }

    for (let index = previousCount; index < this.lines.length; index += 1) {
      this.lines[index]?.draw();
    }
  };

  constructor(
    private readonly rectangle: SignalOfObject<Rect>,
    private readonly lineLimit: number,
    private readonly createLine: (index: number) => TextObject,
  ) {}

  draw(): void {
    this.ensureLineCount(Math.min(this.lineLimit, Math.max(0, this.rectangle.peek().height)));
    for (const line of this.lines) {
      line.draw();
    }
    this.drawn = true;
    this.rectangle.subscribe(this.handleRectangle);
  }

  private ensureLineCount(targetCount: number): void {
    while (this.lines.length < targetCount) {
      this.lines.push(this.createLine(this.lines.length));
    }
  }
}

function frameChars(mode: BorderMode) {
  switch (mode) {
    case "ascii":
      return {
        topLeft: "+",
        topRight: "+",
        bottomLeft: "+",
        bottomRight: "+",
        horizontal: "-",
        vertical: "|",
      };
    case "sharp":
      return {
        topLeft: "┌",
        topRight: "┐",
        bottomLeft: "└",
        bottomRight: "┘",
        horizontal: "─",
        vertical: "│",
      };
    default:
      return {
        topLeft: "╭",
        topRight: "╮",
        bottomLeft: "╰",
        bottomRight: "╯",
        horizontal: "─",
        vertical: "│",
      };
  }
}

export function inset(rect: Rect, amountX: number, amountY = amountX): Rect {
  return {
    column: rect.column + amountX,
    row: rect.row + amountY,
    width: Math.max(0, rect.width - amountX * 2),
    height: Math.max(0, rect.height - amountY * 2),
  };
}

export class FrameView {
  top: TextObject;
  bottom: TextObject;
  left: BoxObject;
  right: BoxObject;

  constructor(options: {
    canvas: Canvas;
    rectangle: SignalOfObject<Rect>;
    style: Style | Signal<Style>;
    borderMode: BorderMode | Signal<BorderMode>;
    zIndex: number;
  }) {
    const borderMode = options.borderMode instanceof Signal ? options.borderMode : new Signal(options.borderMode);
    const charMap = new Computed(() => frameChars(borderMode.value));

    this.top = new TextObject({
      canvas: options.canvas,
      style: options.style,
      zIndex: options.zIndex,
      overwriteRectangle: true,
      rectangle: new Computed<TextRectangle>(() => ({
        column: options.rectangle.value.column,
        row: options.rectangle.value.row,
        width: options.rectangle.value.width,
      })),
      value: new Computed(() => {
        const rect = options.rectangle.value;
        const chars = charMap.value;
        if (rect.width <= 0) {
          return "";
        }
        if (rect.width === 1) {
          return chars.horizontal;
        }
        return `${chars.topLeft}${chars.horizontal.repeat(Math.max(0, rect.width - 2))}${chars.topRight}`;
      }),
    });

    this.bottom = new TextObject({
      canvas: options.canvas,
      style: options.style,
      zIndex: options.zIndex,
      overwriteRectangle: true,
      rectangle: new Computed<TextRectangle>(() => ({
        column: options.rectangle.value.column,
        row: options.rectangle.value.row + Math.max(0, options.rectangle.value.height - 1),
        width: options.rectangle.value.width,
      })),
      value: new Computed(() => {
        const rect = options.rectangle.value;
        const chars = charMap.value;
        if (rect.width <= 0) {
          return "";
        }
        if (rect.width === 1) {
          return chars.horizontal;
        }
        return `${chars.bottomLeft}${chars.horizontal.repeat(Math.max(0, rect.width - 2))}${chars.bottomRight}`;
      }),
    });

    this.left = new BoxObject({
      canvas: options.canvas,
      style: options.style,
      zIndex: options.zIndex,
      filler: new Computed(() => charMap.value.vertical),
      rectangle: new Computed(() => ({
        column: options.rectangle.value.column,
        row: options.rectangle.value.row + 1,
        width: 1,
        height: Math.max(0, options.rectangle.value.height - 2),
      })),
    });

    this.right = new BoxObject({
      canvas: options.canvas,
      style: options.style,
      zIndex: options.zIndex,
      filler: new Computed(() => charMap.value.vertical),
      rectangle: new Computed(() => ({
        column: options.rectangle.value.column + Math.max(0, options.rectangle.value.width - 1),
        row: options.rectangle.value.row + 1,
        width: 1,
        height: Math.max(0, options.rectangle.value.height - 2),
      })),
    });
  }

  draw() {
    this.top.draw();
    this.bottom.draw();
    this.left.draw();
    this.right.draw();
  }
}

export class MultilineTextView {
  lines: TextObject[];
  private readonly retainedLines: RetainedTextLines;

  constructor(options: {
    canvas: Canvas;
    rectangle: SignalOfObject<Rect>;
    text: string | Signal<string>;
    style: Style | Signal<Style>;
    zIndex: number;
    lineLimit?: number;
    padToWidth?: boolean | Signal<boolean>;
    lineOffset?: number | Signal<number>;
  }) {
    const textSignal = options.text instanceof Signal ? options.text : new Signal(options.text);
    const padToWidth = options.padToWidth instanceof Signal
      ? options.padToWidth
      : new Signal(options.padToWidth ?? true);
    const lineOffset = options.lineOffset instanceof Signal ? options.lineOffset : new Signal(options.lineOffset ?? 0);
    const lineLimit = options.lineLimit ?? 40;
    const lines = new Computed(() => textSignal.value.split("\n"));

    this.retainedLines = new RetainedTextLines(options.rectangle, lineLimit, (index) =>
      new TextObject({
        canvas: options.canvas,
        style: options.style,
        zIndex: options.zIndex,
        overwriteRectangle: true,
        rectangle: new Computed<TextRectangle>(() => {
          const rect = options.rectangle.value;
          const width = Math.max(0, rect.width);
          if (index >= rect.height || width <= 0) {
            return {
              column: rect.column,
              row: rect.row + index,
              width: 0,
            };
          }
          const source = lines.value[Math.max(0, lineOffset.value) + index] ?? "";
          const cropped = cropToWidth(source, width);
          return {
            column: rect.column,
            row: rect.row + index,
            width: padToWidth.value ? width : textWidth(cropped),
          };
        }),
        value: new Computed(() => {
          const rect = options.rectangle.value;
          if (index >= rect.height || rect.width <= 0) {
            return "";
          }
          const source = lines.value[Math.max(0, lineOffset.value) + index] ?? "";
          const cropped = cropToWidth(source, rect.width);
          return padToWidth.value ? cropped.padEnd(rect.width, " ") : cropped;
        }),
      }));
    this.lines = this.retainedLines.lines;
  }

  draw() {
    this.retainedLines.draw();
  }
}

export class ListView {
  lines: TextObject[];
  private readonly retainedLines: RetainedTextLines;

  constructor(options: {
    canvas: Canvas;
    rectangle: SignalOfObject<Rect>;
    lines: Signal<MenuLine[]>;
    emptyStyle?: Style | Signal<Style>;
    zIndex: number;
  }) {
    const limit = LIST_VIEW_LINE_LIMIT;
    const emptyStyle = options.emptyStyle instanceof Signal
      ? options.emptyStyle
      : new Signal<Style>(options.emptyStyle ?? ((text: string) => text));
    this.retainedLines = new RetainedTextLines(options.rectangle, limit, (index) =>
      new TextObject({
        canvas: options.canvas,
        style: new Computed(() => options.lines.value[index]?.style ?? emptyStyle.value),
        zIndex: options.zIndex,
        overwriteRectangle: true,
        rectangle: new Computed<TextRectangle>(() => {
          const rect = options.rectangle.value;
          if (index >= rect.height || rect.width <= 0) {
            return {
              column: rect.column,
              row: rect.row + index,
              width: 0,
            };
          }
          return {
            column: rect.column,
            row: rect.row + index,
            width: rect.width,
          };
        }),
        value: new Computed(() => {
          const rect = options.rectangle.value;
          if (index >= rect.height || rect.width <= 0) {
            return "";
          }
          const text = options.lines.value[index]?.text ?? "";
          return cropToWidth(text, rect.width).padEnd(rect.width, " ");
        }),
      }));
    this.lines = this.retainedLines.lines;
  }

  draw() {
    this.retainedLines.draw();
  }
}

export class PanelView {
  background: BoxObject;
  frame: FrameView;
  title: TextObject;
  alert: TextObject;
  body: MultilineTextView;
  bodyRect: SignalOfObject<Rect>;
  footer: TextObject;

  constructor(options: {
    canvas: Canvas;
    rectangle: SignalOfObject<Rect>;
    title: Signal<string>;
    alert: Signal<string>;
    body: Signal<string>;
    footer: Signal<string>;
    backgroundStyle: Signal<Style>;
    frameStyle: Signal<Style>;
    titleStyle: Signal<Style>;
    alertStyle: Signal<Style>;
    bodyStyle: Signal<Style>;
    footerStyle: Signal<Style>;
    borderMode: Signal<BorderMode>;
    bodyPadToWidth?: Signal<boolean>;
    bodyLineOffset?: Signal<number>;
    zIndex: number;
  }) {
    const innerRect = new Computed(() => inset(options.rectangle.value, 1));
    const headerRect = new Computed(() => ({
      column: innerRect.value.column,
      row: innerRect.value.row,
      width: innerRect.value.width,
      height: innerRect.value.height > 0 ? 1 : 0,
    }));
    const alertText = new Computed(() =>
      cropToWidth(options.alert.value, Math.max(0, Math.min(14, headerRect.value.width)))
    );
    const titleRect = new Computed<TextRectangle>(() => {
      // Two columns of gap keep a cropped title from reading as one string
      // with the alert badge ("...LATTICE CHA NOISE WARN").
      const reserved = alertText.value.length > 0 ? textWidth(alertText.value) + 2 : 0;
      return {
        column: headerRect.value.column,
        row: headerRect.value.row,
        width: Math.max(0, headerRect.value.width - reserved),
      };
    });
    const bodyRect = new Computed(() => {
      const rect = innerRect.value;
      return {
        column: rect.column,
        row: rect.row + 1,
        width: rect.width,
        height: Math.max(0, rect.height - 2),
      };
    });
    this.bodyRect = bodyRect;

    this.background = new BoxObject({
      canvas: options.canvas,
      style: options.backgroundStyle,
      zIndex: options.zIndex,
      rectangle: innerRect,
    });

    this.frame = new FrameView({
      canvas: options.canvas,
      rectangle: options.rectangle,
      style: options.frameStyle,
      borderMode: options.borderMode,
      zIndex: options.zIndex + 1,
    });

    this.title = new TextObject({
      canvas: options.canvas,
      style: options.titleStyle,
      zIndex: options.zIndex + 2,
      overwriteRectangle: true,
      rectangle: titleRect,
      value: new Computed(() => {
        const width = Math.max(0, titleRect.value.width ?? 0);
        const raw = ` ${options.title.value}`;
        const title = textWidth(raw) > width && width >= 2
          ? `${cropToWidth(raw, width - 1)}…`
          : cropToWidth(raw, width);
        return title.padEnd(width, " ");
      }),
    });

    this.alert = new TextObject({
      canvas: options.canvas,
      style: options.alertStyle,
      zIndex: options.zIndex + 2,
      rectangle: new Computed<TextRectangle>(() => ({
        column: headerRect.value.column + Math.max(0, headerRect.value.width - textWidth(alertText.value)),
        row: headerRect.value.row,
      })),
      value: alertText,
    });

    this.body = new MultilineTextView({
      canvas: options.canvas,
      rectangle: bodyRect,
      text: options.body,
      style: options.bodyStyle,
      zIndex: options.zIndex + 2,
      lineLimit: PANEL_BODY_LINE_LIMIT,
      padToWidth: options.bodyPadToWidth ?? true,
      lineOffset: options.bodyLineOffset,
    });

    this.footer = new TextObject({
      canvas: options.canvas,
      style: options.footerStyle,
      zIndex: options.zIndex + 2,
      overwriteRectangle: true,
      rectangle: new Computed<TextRectangle>(() => ({
        column: innerRect.value.column,
        row: innerRect.value.row + Math.max(0, innerRect.value.height - 1),
        width: innerRect.value.width,
      })),
      value: new Computed(() =>
        cropToWidth(options.footer.value, innerRect.value.width).padEnd(innerRect.value.width, " ")
      ),
    });
  }

  draw() {
    this.background.draw();
    this.frame.draw();
    this.title.draw();
    this.alert.draw();
    this.body.draw();
    this.footer.draw();
  }
}
