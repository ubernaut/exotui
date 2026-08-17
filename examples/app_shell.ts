import { crayon } from "crayon";

import {
  bindModalFocus,
  bindRouteHistory,
  bindRouteIndex,
  bindRouteSetting,
  bindSplitPaneSetting,
  Breadcrumbs,
  CommandPalette,
  commandSurfaceItems,
  Computed,
  ContextMenu,
  createApp,
  createRuntimeStore,
  createSettingsController,
  createThemeEngine,
  dockRect,
  executeCommandSurfaceItem,
  Frame,
  handleInput,
  handleKeyboardControls,
  HistoryStack,
  KeyHelp,
  List,
  MenuBar,
  Modal,
  RadioGroup,
  resolveBreakpoint,
  ScrollArea,
  Signal,
  SplitPaneController,
  StatusBar,
  Stepper,
  Text,
  type TextRectangle,
  type ToastLevel,
  ToastStack,
  ToastStackController,
  Tree,
} from "../mod.ts";

type DemoAction =
  | { type: "route"; payload: string; history?: boolean }
  | { type: "toast"; payload: string }
  | { type: "palette"; payload: boolean }
  | { type: "context"; payload: boolean }
  | { type: "history.undo" }
  | { type: "history.redo" };

const app = createApp<DemoAction>({
  tuiOptions: {
    style: crayon.bgBlack,
    refreshRate: 1000 / 30,
  },
  routes: [
    { id: "overview", title: "Overview" },
    { id: "widgets", title: "Widgets" },
    { id: "runtime", title: "Runtime" },
  ],
});

handleInput(app.tui);
handleKeyboardControls(app.tui);

const themeEngine = createThemeEngine("neon", {
  tokens: { foreground: crayon.white },
  components: {
    Modal: {
      variants: {
        palette: { base: crayon.bgBlack.white, focused: crayon.bgBlack.cyan },
      },
    },
  },
});

const paletteVisible = new Signal(false);
const contextVisible = new Signal(false);
const activeMenu = new Signal(0);
const preferences = createRuntimeStore<string>({
  databaseName: "deno-tui-app-shell",
  storeName: "preferences",
});
const settings = createSettingsController({ store: preferences, namespace: "app-shell" });
const routeSetting = bindRouteSetting(app.routes, settings, { key: "active-route", initialValue: "overview" });
const routeChoice = routeSetting.setting.value;
app.onDispose(routeSetting.dispose);
const splitController = new SplitPaneController({
  direction: "row",
  ratio: 0.66,
  minFirst: 28,
  minSecond: 24,
  gap: 2,
  resizeMode: "ratio",
});
const splitSetting = bindSplitPaneSetting(splitController, settings, {
  key: "main-split",
  serialize: (value) => JSON.stringify(value),
  deserialize: (value: string) => JSON.parse(value),
});
app.onDispose(splitSetting.dispose);
app.onDispose(() => splitController.dispose());
app.onDispose(() => settings.dispose());
const routeStepIndex = new Signal(0);
app.onDispose(bindRouteIndex(app.routes, routeStepIndex, { routeIds: ["overview", "widgets", "runtime"] }));
const history = new HistoryStack({ capacity: 32 });
const toasts = new ToastStackController({
  limit: 4,
  messages: [{ id: "boot", level: "success", message: "App shell ready" }],
});
const routeList = new Signal(app.routes.routes.peek().map((route) => route.title ?? route.id), { deepObserve: true });
// RouteManager.active() peeks by design; track activeRouteId so header,
// breadcrumbs, and summary re-render when the route changes.
const activeRoute = new Computed(() => app.routes.get(app.routes.activeRouteId.value));
const breadcrumbs = new Computed(() => [
  { id: "app", label: "App" },
  { id: activeRoute.value?.id ?? "none", label: activeRoute.value?.title ?? "No route" },
]);
const scrollLines = [
  "Composable primitives",
  "  ActionBus dispatches app events without coupling widgets to routes.",
  "  RouteManager keeps route state observable and testable.",
  "  FocusScope lets modal-like surfaces trap and restore focus.",
  "  ScrollArea owns a View so children can render in local coordinates.",
  "",
  "Runtime direction",
  "  WorkerPool handles CPU-bound jobs without blocking input.",
  "  AsyncScheduler limits concurrent async work.",
  "  Runtime capability checks keep WebGPU, WebGL, workers, and storage optional.",
  "  PersistentSignal stores preferences through IndexedDB with memory fallback.",
  "",
  "Theming direction",
  "  ThemeEngine resolves semantic tokens, component variants, and palette presets.",
  "  Components consume theme slices instead of hard-coded styles.",
  "  Demos use the same theming API exported to application authors.",
  "",
  "History direction",
  "  HistoryStack keeps undo/redo separate from routing and commands.",
];

app.commands.register({
  id: "route.overview",
  label: "Go to Overview",
  group: "routes",
  keywords: ["home", "route"],
  binding: { key: "1" },
  action: { type: "route", payload: "overview" },
});
app.commands.register({
  id: "route.widgets",
  label: "Go to Widgets",
  group: "routes",
  keywords: ["components", "route"],
  binding: { key: "2" },
  action: { type: "route", payload: "widgets" },
});
app.commands.register({
  id: "route.runtime",
  label: "Go to Runtime",
  group: "routes",
  keywords: ["workers", "webgpu", "route"],
  binding: { key: "3" },
  action: { type: "route", payload: "runtime" },
});
app.commands.register({
  id: "palette.toggle",
  label: "Toggle Command Palette",
  group: "global",
  keywords: ["command", "search"],
  binding: { key: "p" },
  action: () => ({ type: "palette", payload: !paletteVisible.peek() }),
});
app.commands.register({
  id: "context.toggle",
  label: "Toggle Context Menu",
  group: "global",
  keywords: ["actions", "menu"],
  binding: { key: "c" },
  action: () => ({ type: "context", payload: !contextVisible.peek() }),
});
app.commands.register({
  id: "toast.show",
  label: "Show Toast",
  group: "global",
  keywords: ["notification"],
  action: { type: "toast", payload: "Command executed" },
});
app.commands.register({
  id: "history.undo",
  label: "Undo Route",
  group: "global",
  keywords: ["back", "history"],
  binding: { key: "u" },
  disabled: () => !history.canUndo(),
  action: { type: "history.undo" },
});
app.commands.register({
  id: "history.redo",
  label: "Redo Route",
  group: "global",
  keywords: ["forward", "history"],
  binding: { key: "r" },
  disabled: () => !history.canRedo(),
  action: { type: "history.redo" },
});
app.commands.register({
  id: "app.quit",
  label: "Quit",
  group: "global",
  binding: { key: "q" },
  action: () => {
    app.destroy();
    Deno.exit(0);
  },
});

app.enableCommandKeymap();

app.onActionType("route", (action) => {
  app.routes.navigate(action.payload);
  pushToast(`Route changed to ${action.payload}`, "info");
});
app.onActionType("toast", (action) => pushToast(action.payload, "success"));
app.onActionType("palette", (action) => {
  paletteVisible.value = action.payload;
});
app.onActionType("context", (action) => {
  contextVisible.value = action.payload;
});
app.onActionType("history.undo", () => void history.undo());
app.onActionType("history.redo", () => void history.redo());

void settings.ready().then(() => {
  app.onDispose(
    bindRouteHistory(app.routes, history, {
      navigate: (routeId) => app.actions.dispatch({ type: "route", payload: routeId, history: false }),
    }),
  );
});

new StatusBar({
  parent: app.tui,
  theme: themeEngine.component("StatusBar"),
  zIndex: 1,
  left: new Computed(() => `Deno TUI app shell / ${activeRoute.value?.title ?? "No route"}`),
  right: new Computed(() =>
    resolveBreakpoint(app.tui.rectangle.value, [
      { id: "mobile" },
      { id: "wide", minWidth: 100 },
    ])
  ),
  rectangle: new Computed(() => ({ column: 0, row: 0, width: app.tui.rectangle.value.width, height: 1 })),
});

const menuBar = new MenuBar({
  parent: app.tui,
  theme: themeEngine.component("MenuBar"),
  zIndex: 2,
  items: [
    { id: "routes", label: "Routes" },
    { id: "widgets", label: "Widgets" },
    { id: "runtime", label: "Runtime" },
  ],
  activeIndex: activeMenu,
  rectangle: new Computed(() => ({
    column: 2,
    row: 2,
    width: Math.max(20, app.tui.rectangle.value.width - 4),
    height: 1,
  })),
});

const bodyRect = new Computed(() => dockRect(app.tui.rectangle.value, "top", 1).second);
const appContentRect = new Computed(() => {
  const rect = bodyRect.value;
  return {
    column: rect.column + 4,
    row: rect.row + 3,
    width: Math.max(20, rect.width - 8),
    height: Math.max(6, rect.height - 10),
  };
});
const appPanes = new Computed(() => splitController.rects(appContentRect.value));

new Frame({
  parent: app.tui,
  theme: themeEngine.component("Frame"),
  zIndex: 1,
  charMap: "rounded",
  rectangle: new Computed(() => {
    const rect = appContentRect.value;
    const pane = appPanes.value.first;
    return {
      column: pane.column - 2,
      row: rect.row - 1,
      // Frame borders paint OUTSIDE this rectangle; +4 put the right border
      // exactly on pane.second.column where z2 panels overdraw it (QA-003).
      width: Math.max(10, pane.width + 3),
      height: Math.max(6, rect.height + 2),
    };
  }),
});

new Text({
  parent: app.tui,
  theme: themeEngine.component("Text"),
  zIndex: 2,
  text: new Computed(() =>
    [
      `Route: ${activeRoute.value?.title ?? "none"}`,
      "This demo wires app primitives, keymap, routes, command palette, context menu, tree, list, toasts, and responsive layout.",
      "Press p for palette, c for context actions, 1/2/3 for routes, u/r for history, q to quit.",
    ].join("  ")
  ),
  overwriteWidth: true,
  rectangle: new Computed<TextRectangle>(() => ({
    column: appPanes.value.first.column,
    row: appContentRect.value.row,
    width: Math.max(20, appPanes.value.first.width),
  })),
});

new Breadcrumbs({
  parent: app.tui,
  theme: themeEngine.component("Breadcrumbs"),
  zIndex: 2,
  items: breadcrumbs,
  separator: "›",
  rectangle: new Computed(() => ({
    column: appPanes.value.first.column,
    row: appContentRect.value.row + 1,
    width: Math.max(20, appPanes.value.first.width),
    height: 1,
  })),
});

new Stepper({
  parent: app.tui,
  theme: themeEngine.component("Stepper"),
  zIndex: 2,
  steps: [
    { id: "overview", label: "Overview", completed: true },
    { id: "widgets", label: "Widgets" },
    { id: "runtime", label: "Runtime" },
  ],
  activeIndex: routeStepIndex,
  onChange: (step) => app.executeCommand(`route.${step.id}`).then(() => undefined),
  rectangle: new Computed(() => ({
    column: appPanes.value.first.column,
    row: appContentRect.value.row + 2,
    width: Math.max(20, appPanes.value.first.width),
    height: 1,
  })),
});

new Tree({
  parent: app.tui,
  theme: themeEngine.component("Tree"),
  zIndex: 2,
  nodes: [
    {
      id: "app",
      label: "App",
      expanded: true,
      children: [
        { id: "routes", label: "RouteManager" },
        { id: "actions", label: "ActionBus" },
        { id: "focus", label: "FocusManager" },
      ],
    },
    {
      id: "widgets",
      label: "Widgets",
      expanded: true,
      children: [
        { id: "palette", label: "CommandPalette" },
        { id: "toasts", label: "ToastStack" },
      ],
    },
  ],
  rectangle: new Computed(() => ({
    column: appPanes.value.first.column,
    row: appContentRect.value.row + 5,
    width: Math.min(36, Math.max(20, appPanes.value.first.width)),
    height: Math.max(5, appContentRect.value.height - 5),
  })),
});

new List({
  parent: app.tui,
  theme: themeEngine.component("List"),
  zIndex: 2,
  items: routeList,
  rectangle: new Computed(() => ({
    column: appPanes.value.second.column,
    row: appContentRect.value.row,
    width: Math.max(20, appPanes.value.second.width),
    height: 5,
  })),
});

const routeRadio = new RadioGroup({
  parent: app.tui,
  theme: themeEngine.component("RadioGroup"),
  zIndex: 2,
  options: [
    { value: "overview", label: "Overview" },
    { value: "widgets", label: "Widgets" },
    { value: "runtime", label: "Runtime" },
  ],
  selectedValue: routeChoice,
  onChange: (option) => app.executeCommand(`route.${option.value}`).then(() => undefined),
  rectangle: new Computed(() => ({
    column: appPanes.value.second.column,
    row: appContentRect.value.row + 6,
    width: Math.max(20, appPanes.value.second.width),
    height: 3,
  })),
});

const scrollArea = new ScrollArea({
  parent: app.tui,
  theme: themeEngine.component("ScrollArea"),
  zIndex: 2,
  contentWidth: 74,
  contentHeight: scrollLines.length,
  rectangle: new Computed(() => ({
    column: appPanes.value.second.column,
    row: appContentRect.value.row + 10,
    width: Math.max(20, appPanes.value.second.width),
    height: Math.max(4, appContentRect.value.height - 10),
  })),
});
app.enableFocusNavigation({ items: [menuBar, routeRadio, scrollArea] });
app.enableCommandKeys();
app.focus.focus(scrollArea);

for (const [index, line] of scrollLines.entries()) {
  new Text({
    parent: scrollArea,
    theme: themeEngine.component("Text"),
    zIndex: 2,
    text: line,
    overwriteWidth: true,
    view: scrollArea.contentView,
    rectangle: {
      column: 0,
      row: index,
      width: 72,
    },
  });
}

new ToastStack({
  parent: app.tui,
  theme: themeEngine.component("ToastStack"),
  zIndex: 4,
  messages: toasts.messages,
  rectangle: new Computed(() => ({
    column: Math.max(0, app.tui.rectangle.value.width - 42),
    row: Math.max(2, app.tui.rectangle.value.height - 6),
    width: 40,
    height: 4,
  })),
});

new KeyHelp({
  parent: app.tui,
  theme: themeEngine.component("KeyHelp"),
  zIndex: 2,
  bindings: app.keymap,
  rectangle: new Computed(() => ({
    column: 0,
    row: Math.max(0, app.tui.rectangle.value.height - 1),
    width: app.tui.rectangle.value.width,
    height: 1,
  })),
});

new Modal({
  parent: app.tui,
  theme: themeEngine.component("Modal", "palette"),
  zIndex: 10,
  title: "Command Palette",
  rectangle: new Computed(() => ({
    column: Math.max(2, Math.floor(app.tui.rectangle.value.width / 2) - 24),
    row: 4,
    width: 48,
    height: 9,
  })),
  visible: paletteVisible,
});

const commandPalette = new CommandPalette({
  parent: app.tui,
  theme: themeEngine.component("CommandPalette"),
  zIndex: 11,
  items: new Computed(() => commandSurfaceItems(app.commands, { includeDisabled: false })),
  rectangle: new Computed(() => ({
    column: Math.max(3, Math.floor(app.tui.rectangle.value.width / 2) - 23),
    row: 5,
    width: 46,
    height: 7,
  })),
  onSelect: (item) => {
    paletteVisible.value = false;
    return executeCommandSurfaceItem(app.commands, item, (action) => app.actions.dispatch(action)).then(() =>
      undefined
    );
  },
  visible: paletteVisible,
});

// The context menu renders bare rows; the modal frame gives it the same
// bordered surface the command palette gets (QA-004).
new Modal({
  parent: app.tui,
  theme: themeEngine.component("Modal"),
  zIndex: 8,
  title: "Actions",
  rectangle: new Computed(() => ({
    column: Math.max(1, app.tui.rectangle.value.width - 35),
    row: 3,
    width: 32,
    height: 9,
  })),
  visible: contextVisible,
});

const contextMenu = new ContextMenu({
  parent: app.tui,
  theme: themeEngine.component("ContextMenu"),
  zIndex: 9,
  items: new Computed(() => [
    ...commandSurfaceItems(app.commands, { group: "routes", includeDisabled: false }),
    { id: "separator", label: "", separatorBefore: true },
    ...commandSurfaceItems(app.commands, { group: "global", includeDisabled: false }).filter((item) =>
      item.id !== "app.quit"
    ),
  ]),
  rectangle: new Computed(() => ({
    column: Math.max(2, app.tui.rectangle.value.width - 34),
    row: 4,
    width: 30,
    height: 7,
  })),
  onSelect: (item) => {
    contextVisible.value = false;
    return executeCommandSurfaceItem(app.commands, item, (action) => app.actions.dispatch(action)).then(() =>
      undefined
    );
  },
  visible: contextVisible,
});

app.onDispose(bindModalFocus(app.tui, paletteVisible, app.focus, [commandPalette]));
app.onDispose(bindModalFocus(app.tui, contextVisible, app.focus, [contextMenu]));

app.start();

function pushToast(message: string, level: ToastLevel) {
  toasts.show(message, level);
}
