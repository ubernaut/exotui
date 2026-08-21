// exomonitor, in a browser tab.
//
// The same compose, feeds and tiles the terminal application uses — nothing
// here knows how to draw a chart. The sources live in `browser_monitor.ts`,
// shared with the desktop page's monitor window: the microphone through an
// AnalyserNode, and the JS heap where the browser reports one. Feeds a browser
// cannot supply are not pushed, and the dashboard says "waiting" rather than
// drawing a zero — the same contract the terminal monitor keeps on a machine
// with no GPU.

import { TextObject, type TextRectangle } from "../../src/canvas/text.ts";
import { Computed, Signal } from "../../src/signals/mod.ts";
import { createWebTui } from "../../src/web/host.ts";
import { createBrowserMonitor } from "./browser_monitor.ts";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app mount element.");

const host = createWebTui({
  root,
  sinkOptions: { cellWidth: 9, cellHeight: 18 },
});

const monitor = createBrowserMonitor();

const columns = () => host.platform.size.peek().columns;
const rows = () => host.platform.size.peek().rows;

const lineSignals: Signal<string>[] = [];
function ensureLineSignals(): void {
  for (let row = lineSignals.length; row < rows(); row += 1) {
    const signal = new Signal("");
    const rowIndex = row;
    lineSignals.push(signal);
    new TextObject({
      canvas: host.canvas,
      rectangle: new Computed<TextRectangle>(() => ({ column: 0, row: rowIndex, width: columns() })),
      value: signal,
      overwriteRectangle: true,
      multiCodePointSupport: true,
      style: (text) => text,
      zIndex: 1,
    }).draw();
  }
}
ensureLineSignals();

function draw(): void {
  const width = columns();
  const height = rows();
  const frame = monitor.render(width, height);
  for (let row = 0; row < height; row += 1) {
    let line = "";
    let current = "";
    for (const cell of frame[row] ?? []) {
      const style = `${cell.foreground?.join(",") ?? ""}|${cell.background?.join(",") ?? ""}`;
      if (style !== current) {
        current = style;
        line += "\x1b[0m";
        if (cell.foreground) line += `\x1b[38;2;${cell.foreground.join(";")}m`;
        if (cell.background) line += `\x1b[48;2;${cell.background.join(";")}m`;
      }
      line += cell.char;
    }
    if (lineSignals[row]) lineSignals[row]!.value = `${line}\x1b[0m`;
  }
  for (let row = height; row < lineSignals.length; row += 1) lineSignals[row]!.value = "";
}

function tick(now: number): void {
  monitor.sample(now);
  draw();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

host.platform.size.subscribe(() => {
  ensureLineSignals();
  draw();
});

host.element.addEventListener("pointerdown", () => {
  void monitor.enableMicrophone();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "t") {
    monitor.cycleTheme();
    draw();
  }
});

host.start();
