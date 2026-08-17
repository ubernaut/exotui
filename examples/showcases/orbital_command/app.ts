// Copyright 2023 Im-Beast. MIT license.

// Orbital Command terminal app (vertical slice): observatory map, catalog,
// telemetry, and simulation-time controls over the renderer-neutral
// controller. The Three ASCII viewport window (ORBIT-001/002) and dockable
// window chrome (ORBIT-014) arrive in later slices; this app proves the
// hero loop — select, accelerate, scrub, inspect — offline.

import { crayon } from "crayon";
import {
  Computed,
  createTerminalApp,
  Frame,
  List,
  Signal,
  StatusBar,
  type TerminalApp,
  Text,
} from "../../../mod.app.ts";
import { KeyHelp, KeymapRegistry, type TextRectangle } from "../../../mod.ts";
import { ThreeAscii } from "../../../src/components/three_ascii.ts";
import { asciiEffectOptions, createDefaultAsciiOptions } from "../../../src/three_ascii/options.ts";
import { formatOrbitalSimTime, type OrbitalMapCell } from "./model.ts";
import type { OrbitalCommandController } from "./controller.ts";
import { createOrbitalViewportScene, type OrbitalViewportBundle } from "./viewport_scene.ts";

/** Actions dispatched by the Orbital Command keymap. */
export type OrbitalCommandAction =
  | { type: "select.next" }
  | { type: "select.previous" }
  | { type: "time.pause" }
  | { type: "time.faster" }
  | { type: "time.slower" }
  | { type: "time.stepBack" }
  | { type: "time.stepForward" }
  | { type: "time.rewind" }
  | { type: "view.toggle" }
  | { type: "app.quit" };

/** The mounted runtime returned to the launcher. */
export interface OrbitalCommandRuntime {
  readonly app: TerminalApp<OrbitalCommandAction>;
  start(): void;
  destroy(): Promise<void>;
}

const CATALOG_WIDTH = 26;
const TELEMETRY_WIDTH = 32;

/** Creates and mounts the Orbital Command terminal app. */
export function createOrbitalCommandTerminalApp(options: {
  readonly controller: OrbitalCommandController;
  /** WebGPU probe result; false renders the honest 2D fallback (ORBIT-002). */
  readonly threeAscii?: boolean;
}): OrbitalCommandRuntime {
  const controller = options.controller;
  const threeAvailable = options.threeAscii === true;
  const viewMode = new Signal<"3d" | "map">(threeAvailable ? "3d" : "map");
  let clockTimer: ReturnType<typeof setInterval> | undefined;
  let persistTimer: ReturnType<typeof setInterval> | undefined;
  let viewport: OrbitalViewportBundle | undefined;

  const app = createTerminalApp<OrbitalCommandAction>({
    id: "orbital-command",
    label: "Orbital Command",
    tuiOptions: { style: crayon.bgBlack, refreshRate: 1000 / 30 },
    commands: [
      { id: "select.next", label: "Next object", binding: { key: "down" }, action: { type: "select.next" } },
      {
        id: "select.previous",
        label: "Previous object",
        binding: { key: "up" },
        action: { type: "select.previous" },
      },
      { id: "time.pause", label: "Pause/resume", binding: { key: "space" }, action: { type: "time.pause" } },
      { id: "time.faster", label: "Faster", binding: { key: "+" }, action: { type: "time.faster" } },
      { id: "time.slower", label: "Slower", binding: { key: "-" }, action: { type: "time.slower" } },
      { id: "time.stepBack", label: "Step -10m", binding: { key: "[" }, action: { type: "time.stepBack" } },
      {
        id: "time.stepForward",
        label: "Step +10m",
        binding: { key: "]" },
        action: { type: "time.stepForward" },
      },
      { id: "time.rewind", label: "Rewind to T+0", binding: { key: "0" }, action: { type: "time.rewind" } },
      { id: "view.toggle", label: "3D / map view", binding: { key: "v" }, action: { type: "view.toggle" } },
      { id: "app.quit", label: "Quit", binding: { key: "q" }, action: { type: "app.quit" } },
    ],
    onAction(action) {
      switch (action.type) {
        case "select.next":
          controller.selectNext(1);
          break;
        case "select.previous":
          controller.selectNext(-1);
          break;
        case "time.pause":
          controller.togglePause();
          break;
        case "time.faster":
          controller.cycleMultiplier(1);
          break;
        case "time.slower":
          controller.cycleMultiplier(-1);
          break;
        case "time.stepBack":
          controller.step(-600);
          break;
        case "time.stepForward":
          controller.step(600);
          break;
        case "time.rewind":
          controller.scrubTo(0);
          break;
        case "view.toggle":
          if (threeAvailable) viewMode.value = viewMode.peek() === "3d" ? "map" : "3d";
          break;
        case "app.quit":
          void runtime.destroy().then(() => Deno.exit(0));
          break;
      }
    },
    setup(app) {
      const tui = app.tui;
      const revision = controller.revision;

      const mapRect = new Computed(() => ({
        column: CATALOG_WIDTH + 1,
        row: 2,
        width: Math.max(20, tui.rectangle.value.width - CATALOG_WIDTH - TELEMETRY_WIDTH - 2),
        height: Math.max(10, tui.rectangle.value.height - 4),
      }));

      new StatusBar({
        parent: tui,
        theme: { base: crayon.bgBlue.white },
        zIndex: 2,
        left: new Computed(() => {
          revision.value;
          const paused = controller.paused() ? "  ▍▍ PAUSED" : "";
          return ` ORBITAL COMMAND  ${controller.simClockLabel()}  x${controller.multiplier()}${paused}`;
        }),
        right: new Computed(() => {
          const status = controller.kernel.providerStatus.value;
          return `catalog: ${controller.kernel.provider.label} [${status}] `;
        }),
        rectangle: new Computed(() => ({ column: 0, row: 0, width: tui.rectangle.value.width, height: 1 })),
      });

      // ── catalog ────────────────────────────────────────────────────
      new Frame({
        parent: tui,
        theme: { base: crayon.blue },
        zIndex: 1,
        charMap: "rounded",
        rectangle: new Computed(() => ({
          column: 1,
          row: 2,
          width: CATALOG_WIDTH - 2,
          height: Math.max(10, tui.rectangle.value.height - 4),
        })),
      });
      new Text({
        parent: tui,
        theme: { base: crayon.bgBlack.lightBlue.bold },
        zIndex: 2,
        text: " CATALOG ",
        rectangle: { column: 2, row: 1 },
      });
      const catalogItems = new Computed(() => {
        revision.value;
        return controller.catalogRows().map((row) => {
          const badge = row.kind === "spacecraft" ? "◦" : row.kind === "moon" ? "☾" : "⌂";
          return `${badge} ${row.label}`;
        });
      });
      const selectedIndex = new Signal(0);
      const catalogList = new List({
        parent: tui,
        theme: { base: crayon.bgBlack.white },
        selectedStyle: crayon.bgBlue.white,
        zIndex: 1,
        items: catalogItems,
        selectedIndex,
        rectangle: new Computed(() => ({
          column: 2,
          row: 3,
          width: CATALOG_WIDTH - 4,
          height: Math.max(6, tui.rectangle.value.height - 7),
        })),
      });
      // Pointer routing needs explicit registration: without it the list
      // never receives clicks (ORBIT-004 linked tree selection).
      app.registerComponent(catalogList, { id: "catalog" });
      // The list mirrors controller selection; keyboard drives the controller.
      revision.subscribe(() => {
        const index = controller.catalogRows().findIndex((row) => row.id === controller.selectedId());
        if (index >= 0 && selectedIndex.peek() !== index) selectedIndex.value = index;
      }, controller.kernel.signal);
      // Clicking a catalog row drives the controller too (ORBIT-004 linked
      // tree/scene selection); stations reject selection, so the highlight
      // snaps back to the selected spacecraft.
      selectedIndex.subscribe((index) => {
        const rows = controller.catalogRows();
        const row = rows[index];
        if (!row || row.id === controller.selectedId()) return;
        if (!controller.select(row.id)) {
          const previous = rows.findIndex((entry) => entry.id === controller.selectedId());
          if (previous >= 0) selectedIndex.value = previous;
        }
      }, controller.kernel.signal);

      // ── observatory map ────────────────────────────────────────────
      new Frame({
        parent: tui,
        theme: { base: crayon.blue },
        zIndex: 1,
        charMap: "rounded",
        rectangle: mapRect,
      });
      new Text({
        parent: tui,
        theme: { base: crayon.bgBlack.lightBlue.bold },
        zIndex: 2,
        text: new Computed(() => {
          revision.value;
          if (viewMode.value === "3d") {
            return " OBSERVATORY · 3D · click picks · a/d w/s orbit · z/x zoom · v map ";
          }
          const range = controller.mapRender(10, 7).rangeKm;
          const fallback = threeAvailable ? "" : " · TEXT FALLBACK (no WebGPU)";
          return ` OBSERVATORY · top-down · ±${Math.round(range).toLocaleString("en-US")} km${fallback} `;
        }),
        rectangle: new Computed<TextRectangle>(() => ({
          column: mapRect.value.column + 1,
          row: mapRect.value.row - 1,
        })),
      });
      const MAP_ROWS = 60;
      for (let index = 0; index < MAP_ROWS; index += 1) {
        const rowIndex = index;
        new Text({
          parent: tui,
          theme: { base: crayon.bgBlack.cyan },
          zIndex: 1,
          text: new Computed(() => {
            revision.value;
            const rect = mapRect.value;
            const innerRows = Math.max(1, rect.height - 2);
            if (rowIndex >= innerRows) return "";
            const render = controller.mapRender(Math.max(10, rect.width - 2), innerRows);
            const cells = render.cells[rowIndex] ?? [];
            let line = "";
            for (let column = 0; column < Math.max(10, rect.width - 2); column += 1) {
              line += mapGlyph(cells[column] ?? null);
            }
            return line;
          }),
          overwriteWidth: true,
          rectangle: new Computed<TextRectangle>(() => ({
            column: mapRect.value.column + 1,
            row: mapRect.value.row + 1 + rowIndex,
            width: Math.max(10, mapRect.value.width - 2),
          })),
          visible: new Computed(() => viewMode.value === "map" && rowIndex < Math.max(1, mapRect.value.height - 2)),
        });
      }

      // ── telemetry ──────────────────────────────────────────────────
      new Frame({
        parent: tui,
        theme: { base: crayon.blue },
        zIndex: 1,
        charMap: "rounded",
        rectangle: new Computed(() => ({
          column: tui.rectangle.value.width - TELEMETRY_WIDTH + 1,
          row: 2,
          width: TELEMETRY_WIDTH - 2,
          height: Math.max(10, tui.rectangle.value.height - 4),
        })),
      });
      new Text({
        parent: tui,
        theme: { base: crayon.bgBlack.lightBlue.bold },
        zIndex: 2,
        text: " TELEMETRY ",
        rectangle: new Computed(() => ({
          column: tui.rectangle.value.width - TELEMETRY_WIDTH + 2,
          row: 1,
        })),
      });
      const telemetryLines = new Computed(() => {
        revision.value;
        const satellite = controller.selectedSatellite();
        const telemetry = controller.selectedTelemetry();
        if (!satellite || !telemetry) return ["no object selected"];
        const format = (value: number, unit: string) =>
          `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${unit}`;
        return [
          satellite.name,
          "",
          `alt      ${format(telemetry.altitudeKm, "km")}`,
          `radius   ${format(telemetry.radiusKm, "km")}`,
          `speed    ${telemetry.speedKmS.toFixed(3)} km/s`,
          `period   ${formatOrbitalSimTime(telemetry.periodSeconds).slice(2)}`,
          `apoapsis ${format(telemetry.apoapsisKm, "km")}`,
          `periapsis ${format(telemetry.periapsisKm, "km")}`,
          `mean an. ${telemetry.meanAnomalyDeg.toFixed(1)}°`,
          `true an. ${telemetry.trueAnomalyDeg.toFixed(1)}°`,
          "",
          ...wrapText(satellite.description, TELEMETRY_WIDTH - 6),
          "",
          "source: seeded fixture",
          "(simulated data)",
        ];
      });
      const TELEMETRY_ROWS = 18;
      for (let index = 0; index < TELEMETRY_ROWS; index += 1) {
        const rowIndex = index;
        new Text({
          parent: tui,
          theme: { base: rowIndex === 0 ? crayon.bgBlack.white.bold : crayon.bgBlack.white },
          zIndex: 1,
          text: new Computed(() => telemetryLines.value[rowIndex] ?? ""),
          overwriteWidth: true,
          rectangle: new Computed<TextRectangle>(() => ({
            column: tui.rectangle.value.width - TELEMETRY_WIDTH + 3,
            row: 3 + rowIndex,
            width: TELEMETRY_WIDTH - 6,
          })),
        });
      }

      // ── 3D observatory (ORBIT-001) ─────────────────────────────────
      if (threeAvailable) {
        viewport = createOrbitalViewportScene(controller.catalog);
        const ascii = createDefaultAsciiOptions("sharp");
        const viewportRect = new Computed(() => ({
          column: mapRect.value.column + 1,
          row: mapRect.value.row + 1,
          width: Math.max(10, mapRect.value.width - 2),
          height: Math.max(6, mapRect.value.height - 2),
        }));
        new ThreeAscii({
          parent: tui,
          theme: {},
          zIndex: 1,
          scene: viewport.scene,
          camera: viewport.camera,
          frameInterval: 1000 / 15,
          effect: asciiEffectOptions(ascii),
          terminalEdgeBias: ascii.terminalEdgeBias,
          terminalGlyphStyle: ascii.terminalGlyphStyle,
          onFrame: () => {
            viewport?.update(controller.simSeconds(), controller.selectedId());
          },
          rectangle: viewportRect,
          visible: new Computed(() => viewMode.value === "3d"),
        });
        // Terminal-cell picking (ORBIT-004): a click selects the marker
        // whose projection lands nearest the clicked cell.
        tui.on("mousePress", (event) => {
          if (event.release || event.drag || !viewport || viewMode.peek() !== "3d") return;
          const rect = viewportRect.peek();
          const x = event.x - rect.column;
          const y = event.y - rect.row;
          if (x < 0 || x >= rect.width || y < 0 || y >= rect.height) return;
          const picked = viewport.pick({ x, y }, { columns: rect.width, rows: rect.height });
          if (picked) controller.select(picked);
        });
        tui.on("keyPress", ({ key, ctrl, meta }) => {
          if (ctrl || meta || !viewport || viewMode.peek() !== "3d") return;
          const camera = viewport.cameraState;
          if (key === "a") camera.azimuthRad -= 0.12;
          else if (key === "d") camera.azimuthRad += 0.12;
          else if (key === "w") camera.elevationRad += 0.08;
          else if (key === "s") camera.elevationRad -= 0.08;
          else if (key === "z") camera.distanceUnits *= 0.85;
          else if (key === "x") camera.distanceUnits /= 0.85;
        });
      }

      const keymap = new KeymapRegistry();
      keymap.register({ key: "↑/↓", description: "select" });
      keymap.register({ key: "space", description: "pause" });
      keymap.register({ key: "+/-", description: "time scale" });
      keymap.register({ key: "[/]", description: "step 10m" });
      keymap.register({ key: "0", description: "rewind" });
      if (threeAvailable) {
        keymap.register({ key: "v", description: "3D/map" });
        keymap.register({ key: "a/d/w/s z/x", description: "camera" });
        keymap.register({ key: "click", description: "pick" });
      }
      keymap.register({ key: "q", description: "quit" });
      new KeyHelp({
        parent: tui,
        theme: { base: crayon.bgBlack.white },
        zIndex: 1,
        bindings: keymap,
        rectangle: new Computed(() => ({
          column: 0,
          row: Math.max(0, tui.rectangle.value.height - 1),
          width: tui.rectangle.value.width,
          height: 1,
        })),
      });

      // The simulation clock: real elapsed time scaled by the multiplier.
      clockTimer = setInterval(() => controller.advance(200), 200);
      // Coarse periodic persistence keeps scrub position across restarts
      // without writing on every frame.
      persistTimer = setInterval(() => controller.persist(), 2_000);
      return () => {
        if (clockTimer !== undefined) clearInterval(clockTimer);
        if (persistTimer !== undefined) clearInterval(persistTimer);
      };
    },
  });

  const runtime: OrbitalCommandRuntime = {
    app,
    start: () => app.start(),
    destroy: async () => {
      if (clockTimer !== undefined) clearInterval(clockTimer);
      if (persistTimer !== undefined) clearInterval(persistTimer);
      app.destroy();
      viewport?.dispose();
      await controller.dispose();
    },
  };
  return runtime;
}

function mapGlyph(cell: OrbitalMapCell | null): string {
  return cell?.char ?? " ";
}

function wrapText(text: string, width: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line.length + word.length + 1 > width && line.length > 0) {
      lines.push(line);
      line = word;
    } else {
      line = line.length > 0 ? `${line} ${word}` : word;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.slice(0, 3);
}
