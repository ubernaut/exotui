import { runtimeHost } from "../src/runtime/host.ts";
import { crayon } from "crayon";
import { Button, Computed, createTerminalApp, Frame, Signal, StatusBar, Text } from "../mod.app.ts";

type CounterAction =
  | { type: "counter.increment" }
  | { type: "counter.reset" }
  | { type: "app.quit" };

const count = new Signal(0);
const app = createTerminalApp<CounterAction>({
  id: "counter",
  label: "Counter",
  tuiOptions: {
    style: crayon.bgBlack,
    refreshRate: 1000 / 30,
  },
  commands: [
    {
      id: "counter.increment",
      label: "Increment",
      binding: { key: "return" },
      action: { type: "counter.increment" },
    },
    {
      id: "counter.reset",
      label: "Reset",
      binding: { key: "r" },
      action: { type: "counter.reset" },
    },
    {
      id: "app.quit",
      label: "Quit",
      binding: { key: "q" },
      action: { type: "app.quit" },
    },
  ],
  onAction(action) {
    if (action.type === "counter.increment") count.value += 1;
    if (action.type === "counter.reset") count.value = 0;
    if (action.type === "app.quit") {
      app.destroy();
      runtimeHost.exit(0);
    }
  },
  setup(app) {
    new StatusBar({
      parent: app.tui,
      theme: { base: crayon.bgBlue.white },
      zIndex: 1,
      left: "Focused terminal app",
      right: "R reset  Q quit",
      rectangle: new Computed(() => ({
        column: 0,
        row: 0,
        width: app.tui.rectangle.value.width,
        height: 1,
      })),
    });

    new Frame({
      parent: app.tui,
      theme: { base: crayon.blue },
      zIndex: 1,
      charMap: "rounded",
      rectangle: new Computed(() => ({
        column: Math.max(0, Math.floor(app.tui.rectangle.value.width / 2) - 14),
        row: Math.max(2, Math.floor(app.tui.rectangle.value.height / 2) - 4),
        width: 28,
        height: 8,
      })),
    });

    new Text({
      parent: app.tui,
      theme: { base: crayon.white },
      zIndex: 2,
      text: new Computed(() => `Count: ${count.value}`),
      rectangle: new Computed(() => ({
        column: Math.max(1, Math.floor(app.tui.rectangle.value.width / 2) - 5),
        row: Math.max(3, Math.floor(app.tui.rectangle.value.height / 2) - 2),
      })),
    });

    const increment = new Button({
      parent: app.tui,
      theme: {
        base: crayon.bgBlue.white,
        focused: crayon.bgLightBlue.black,
        active: crayon.bgCyan.black,
      },
      zIndex: 2,
      label: { text: "Increment" },
      onPress: () => void app.executeCommand("counter.increment"),
      rectangle: new Computed(() => ({
        column: Math.max(1, Math.floor(app.tui.rectangle.value.width / 2) - 6),
        row: Math.max(5, Math.floor(app.tui.rectangle.value.height / 2) + 1),
        width: 12,
        height: 3,
      })),
    });
    app.registerComponent(increment, { id: "increment" });
    app.focus.focus(increment);
  },
});

app.start();
