import { runtimeHost } from "../src/runtime/host.ts";
import { crayon } from "crayon";

import {
  Chart,
  Computed,
  createThemeEngine,
  Gauge,
  handleInput,
  handleKeyboardControls,
  KeyHelp,
  KeymapRegistry,
  LogViewer,
  LogViewerController,
  Signal,
  Sparkline,
  StatusBar,
  Tui,
} from "../mod.ts";

const tui = new Tui({
  style: crayon.bgBlack,
  refreshRate: 1000 / 30,
});

handleInput(tui);
handleKeyboardControls(tui);
tui.dispatch();
tui.run();

const theme = createThemeEngine("neon", { tokens: { foreground: crayon.white } }).component("Dashboard");

const values = new Signal([2, 5, 3, 8, 4, 9, 6, 7], { deepObserve: true });
const logs = new LogViewerController({
  limit: 8,
  lines: ["dashboard demo started", "sampling synthetic metrics"],
});
const keymap = new KeymapRegistry();
keymap.register({ key: "q", description: "quit" });

setInterval(() => {
  values.value.push(Math.round(2 + Math.random() * 8));
  if (values.value.length > 40) values.value.shift();
  logs.append(`sample ${values.value.at(-1)}`);
}, 650);

new StatusBar({
  parent: tui,
  theme,
  zIndex: 1,
  left: "Deno TUI dashboard demo",
  right: "q quit",
  rectangle: new Computed(() => ({ column: 0, row: 0, width: tui.rectangle.value.width, height: 1 })),
});

new Sparkline({
  parent: tui,
  theme,
  zIndex: 1,
  values,
  rectangle: new Computed(() => ({ column: 2, row: 3, width: Math.max(10, tui.rectangle.value.width - 4), height: 1 })),
});

new Gauge({
  parent: tui,
  theme,
  zIndex: 1,
  value: new Computed(() => (values.value.at(-1) ?? 0) / 10),
  min: 0,
  max: 1,
  label: "LOAD",
  rectangle: { column: 2, row: 5, width: 32, height: 1 },
});

new Chart({
  parent: tui,
  theme,
  zIndex: 1,
  values,
  rectangle: new Computed(() => ({ column: 2, row: 7, width: 40, height: 8 })),
});

new LogViewer({
  parent: tui,
  theme,
  zIndex: 1,
  lines: logs.lines,
  rectangle: { column: 45, row: 7, width: 32, height: 8 },
});

new KeyHelp({
  parent: tui,
  theme,
  zIndex: 1,
  bindings: keymap,
  rectangle: new Computed(() => ({
    column: 0,
    row: Math.max(0, tui.rectangle.value.height - 1),
    width: tui.rectangle.value.width,
    height: 1,
  })),
});

tui.on("keyPress", ({ key }) => {
  if (key === "q") {
    logs.dispose();
    tui.destroy();
    runtimeHost.exit(0);
  }
});
