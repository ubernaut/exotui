// Copyright 2023 Im-Beast. MIT license.
import { contains, terminalMouseRoutingFromPrivateModes, type WorkbenchWindowHostProjection } from "@ubernaut/exotui";
import type { ExomuxController } from "./controller.ts";
import { exomuxSessionIdFromWindow } from "./model.ts";

/** Local mouse selection; child reporting and touch gestures keep their own captures. */
export class ExomuxTerminalSelectionRouter {
  #capture?: { pointerId: number; sessionId: string; windowId: string };
  #click?: { sessionId: string; column: number; row: number; time: number; count: number };

  constructor(readonly controller: ExomuxController) {}

  clear(): void {
    this.#capture = undefined;
    this.#click = undefined;
    for (const summary of this.controller.sessions.peek()) {
      const runtime = this.controller.runtime(summary.id);
      if (!runtime) continue;
      const active = runtime.selection.active;
      runtime.selection.clear();
      if (active) runtime.renderRevision.value++;
    }
  }

  route(
    kind: "down" | "move" | "up" | "cancel",
    pointerId: number,
    column: number,
    row: number,
    primary: boolean,
    forceLocal: boolean,
    projection: WorkbenchWindowHostProjection,
    time = performance.now(),
  ): boolean {
    if (kind === "down") {
      // A fresh press recovers from a lost release without copying stale text.
      const lastClick = this.#click;
      this.clear();
      if (!primary) return false;
      const window = [...projection.floatingWindows].reverse().find((w) => contains(w.rect, column, row)) ??
        [...projection.tiledWindows].reverse().find((w) => contains(w.rect, column, row));
      if (!window || !contains(window.clientRect, column, row)) return false;
      const sessionId = exomuxSessionIdFromWindow(window.id);
      const runtime = sessionId ? this.controller.runtime(sessionId) : undefined;
      if (!runtime || !sessionId) return false;
      const routing = terminalMouseRoutingFromPrivateModes(runtime.screen.inspect().privateModes);
      if (
        !forceLocal && runtime.attached.peek() && runtime.summary.peek().running &&
        runtime.scrollback.mode === "live" && this.controller.windowSettingsFor(sessionId).mouseReporting &&
        routing.mouseTracking !== "none"
      ) return false;
      const local = { column: column - window.clientRect.column, row: row - window.clientRect.row };
      const count = lastClick?.sessionId === sessionId && lastClick.column === column && lastClick.row === row &&
          time >= lastClick.time && time - lastClick.time < 400
        ? lastClick.count % 3 + 1
        : 1;
      this.#click = { sessionId, column, row, time, count };
      const viewport = runtime.scrollback.inspectViewport();
      const rows = viewport.mode === "copy"
        ? runtime.screen.cellRowsRange(viewport.offset, viewport.viewportRows)
        : runtime.screen.cellRows();
      runtime.selection.begin(
        rows.slice(0, window.clientRect.height).map((cells) => cells.slice(0, window.clientRect.width)),
        local,
        count === 3 ? "line" : count === 2 ? "word" : "cell",
      );
      this.#capture = { pointerId, sessionId, windowId: window.id };
      this.controller.windowHost.execute({ kind: "focus", id: window.id }, projection.bounds);
      this.controller.syncActiveSession();
      runtime.renderRevision.value++;
      return true;
    }
    const capture = this.#capture;
    if (!capture || capture.pointerId !== pointerId) return false;
    const runtime = this.controller.runtime(capture.sessionId);
    const window = projection.windows.find((w) => w.id === capture.windowId);
    if (!runtime || !window || kind === "cancel") {
      this.clear();
      return true;
    }
    runtime.selection.extend({ column: column - window.clientRect.column, row: row - window.clientRect.row });
    runtime.renderRevision.value++;
    if (kind === "up") {
      this.#capture = undefined;
      const text = runtime.selection.selectedText();
      if (text) this.controller.copyTerminalText(text);
      if (!runtime.selection.active) runtime.selection.clear();
    }
    return true;
  }
}
