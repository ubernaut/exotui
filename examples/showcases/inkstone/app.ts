// Copyright 2023 Im-Beast. MIT license.

import { crayon } from "crayon";
import {
  CommandPalette,
  Computed,
  createTerminalApp,
  Frame,
  Input,
  Markdown,
  Modal,
  Signal,
  StatusBar,
  Tabs,
  type TerminalApp,
  type TerminalAppOptions,
  Text,
  TextBox,
  ToastStack,
  Tree,
} from "../../../mod.app.ts";
import {
  bindModalFocus,
  Breadcrumbs,
  CommandPaletteController,
  commandSurfaceItems,
  type Component,
  type DiagnosticEntry,
  executeCommandSurfaceItem,
  InputController,
  type InputRectangle,
  KeyHelp,
  List,
  ListController,
  MenuBar,
  type Rectangle,
  type TextRectangle,
  textWidth,
  type TiledWorkspaceLayoutInspection,
  ToastStackController,
  type WorkbenchWindowChromeProjection,
  type WorkbenchWindowHostProjection,
  type WorkbenchWindowHostProjectionOptions,
} from "../../../mod.ts";
import type { MousePressEvent } from "../../../src/input_reader/types.ts";
import { createInkstoneController, type InkstoneController } from "./controller.ts";
import type {
  InkstoneBacklink,
  InkstoneEditorFindResult,
  InkstoneEditorReplaceResult,
  InkstoneHeading,
  InkstoneSaveResult,
  InkstoneSearchRow,
} from "./model.ts";
import type { ShowcaseRouteManifest } from "../../../src/showcase/mod.ts";

/** Responsive modes used by the terminal workbench projection. */
export type InkstoneTerminalBreakpoint = "wide" | "medium" | "narrow";

/** Stable tiled-window ids owned by the shared showcase kernel. */
export type InkstoneWindowId = "vault" | "editor" | "preview" | "inspector";

/** Actions handled by the Inkstone terminal shell. */
export type InkstoneAppAction =
  | Readonly<{ type: "inkstone.save" }>
  | Readonly<{ type: "inkstone.undo" }>
  | Readonly<{ type: "inkstone.redo" }>
  | Readonly<{ type: "inkstone.find"; focus: "find" | "replace" }>
  | Readonly<{ type: "inkstone.find-next"; direction: "forward" | "backward" }>
  | Readonly<{ type: "inkstone.replace-one" }>
  | Readonly<{ type: "inkstone.replace-all" }>
  | Readonly<{ type: "inkstone.palette" }>
  | Readonly<{ type: "inkstone.search" }>
  | Readonly<{ type: "inkstone.recovery" }>
  | Readonly<{ type: "inkstone.route"; routeId: "note" | "search" | "diagnostics" }>
  | Readonly<{ type: "inkstone.focus"; windowId: InkstoneWindowId }>
  | Readonly<{
    type: "inkstone.window";
    operation:
      | "detach-preview"
      | "dock-preview"
      | "minimize-preview"
      | "restore-preview"
      | "pin-preview"
      | "recover-all";
  }>
  | Readonly<{ type: "inkstone.window-undo" }>
  | Readonly<{ type: "inkstone.window-redo" }>
  | Readonly<{ type: "inkstone.quit" }>;

/** Mutable mount reference populated by TerminalApp setup and useful to pilots. */
export interface InkstoneAppMountRef {
  current?: InkstoneAppMount;
}

/** Mounted workbench surfaces exposed for deterministic integration tests. */
export interface InkstoneAppMount {
  readonly app: TerminalApp<InkstoneAppAction>;
  readonly controller: InkstoneController;
  readonly breakpoint: Computed<InkstoneTerminalBreakpoint>;
  readonly visibleWindowIds: Computed<readonly InkstoneWindowId[]>;
  readonly bodyRect: Computed<Rectangle>;
  readonly shelfBounds: Computed<Rectangle>;
  readonly windowProjection: Computed<WorkbenchWindowHostProjection>;
  readonly workspaceLayout: Computed<TiledWorkspaceLayoutInspection>;
  readonly paletteVisible: Signal<boolean>;
  readonly findVisible: Signal<boolean>;
  readonly findFeedback: Signal<string>;
  readonly menu: MenuBar;
  readonly searchInput: Input;
  readonly findInput: Input;
  readonly replaceInput: Input;
  readonly explorer: Tree;
  readonly tabs: Tabs;
  readonly editor: TextBox;
  readonly preview: Markdown;
  readonly outline: List;
  readonly backlinks: List;
  readonly searchResults: List;
  readonly diagnostics: List;
  readonly palette: CommandPalette;
  readonly toasts: ToastStackController;
  focusWindow(windowId: InkstoneWindowId): void;
  dispose(): void;
}

/** Controller, declarative TerminalApp options, and mount slot returned to launchers/tests. */
export interface InkstoneAppDefinition {
  readonly controller: InkstoneController;
  readonly mount: InkstoneAppMountRef;
  readonly terminalOptions: TerminalAppOptions<InkstoneAppAction>;
}

/** Running real-terminal Inkstone instance. */
export interface InkstoneTerminalRuntime {
  readonly app: TerminalApp<InkstoneAppAction>;
  readonly controller: InkstoneController;
  readonly mount: InkstoneAppMount;
  start(): void;
  destroy(): Promise<void>;
}

/** Optional dependencies accepted by the app-definition factory. */
export interface CreateInkstoneAppDefinitionOptions {
  readonly controller?: InkstoneController;
}

const PANEL_THEME = {
  base: crayon.bgBlack.white,
  focused: crayon.bgBlue.white,
  active: crayon.bgCyan,
};

const FRAME_THEME = { base: crayon.lightBlack };
const LABEL_THEME = { base: crayon.bgBlack.cyan };
const MUTED_THEME = { base: crayon.bgBlack.lightBlack };
const INPUT_THEME = {
  ...PANEL_THEME,
  cursor: { base: crayon.invert },
  placeholder: { base: crayon.bgBlack.lightBlack },
};
const EDITOR_THEME = {
  ...PANEL_THEME,
  cursor: { base: crayon.invert },
  selection: { base: crayon.bgCyan.black, focused: crayon.bgCyan.black, active: crayon.bgCyan.black },
  lineNumbers: { base: crayon.bgBlack.lightBlack },
  highlightedLine: { base: crayon.bgLightBlack.white },
};

const WINDOW_TITLES: Readonly<Record<InkstoneWindowId, string>> = Object.freeze({
  vault: "VAULT",
  editor: "EDITOR",
  preview: "MARKDOWN PREVIEW",
  inspector: "INSPECTOR",
});

/** Resolves one of the deliberately small responsive terminal modes. */
export function resolveInkstoneTerminalBreakpoint(width: number): InkstoneTerminalBreakpoint {
  const safeWidth = Math.max(1, Number.isFinite(width) ? Math.floor(width) : 1);
  if (safeWidth >= 116) return "wide";
  if (safeWidth >= 78) return "medium";
  return "narrow";
}

/**
 * Returns the windows projected at a terminal width without mutating the
 * kernel's persisted tiled layout.
 */
export function inkstoneVisibleWindowIds(
  width: number,
  routeId: string,
): readonly InkstoneWindowId[] {
  const breakpoint = resolveInkstoneTerminalBreakpoint(width);
  if (breakpoint === "wide") return ["vault", "editor", "preview", "inspector"];
  if (breakpoint === "medium") {
    if (routeId === "search" || routeId === "diagnostics") return ["editor", "preview", "inspector"];
    return ["vault", "editor", "preview"];
  }
  if (routeId === "search" || routeId === "diagnostics") return ["inspector"];
  return ["editor"];
}

/** Creates an initialized fixture-first Inkstone definition for a terminal host or pilot. */
export async function createInkstoneAppDefinition(
  options: CreateInkstoneAppDefinitionOptions = {},
): Promise<InkstoneAppDefinition> {
  const controller = options.controller ?? createInkstoneController();
  await controller.ready;
  const mount: InkstoneAppMountRef = {};
  return {
    controller,
    mount,
    terminalOptions: createInkstoneTerminalOptions(controller, mount),
  };
}

/** Creates and mounts the real-terminal app without starting its input loop. */
export async function createInkstoneTerminalApp(
  options: CreateInkstoneAppDefinitionOptions = {},
): Promise<InkstoneTerminalRuntime> {
  const definition = await createInkstoneAppDefinition(options);
  const app = createTerminalApp(definition.terminalOptions);
  const mount = definition.mount.current;
  if (!mount) {
    app.destroy();
    await definition.controller.dispose();
    throw new Error("Inkstone workbench did not mount.");
  }
  return {
    app,
    controller: definition.controller,
    mount,
    start: () => app.start(),
    destroy: async () => {
      app.destroy();
      await definition.controller.dispose();
    },
  };
}

/** Builds the declarative TerminalApp contract around one domain controller. */
export function createInkstoneTerminalOptions(
  controller: InkstoneController,
  mount: InkstoneAppMountRef = {},
): TerminalAppOptions<InkstoneAppAction> {
  return {
    id: "inkstone",
    label: "Inkstone",
    // The launcher owns awaited signal shutdown so durable draft writes finish
    // before the process exits. Tests and embedded hosts remain exit-free.
    exitOnSignal: false,
    tuiOptions: {
      style: crayon.bgBlack,
      refreshRate: 1000 / 60,
    },
    commands: inkstoneCommands(),
    keyBindings: [
      { key: "tab", description: "next focus", group: "navigation" },
      { key: "escape", description: "close overlay", group: "navigation" },
    ],
    onAction: (action) => handleInkstoneAction(action, mount),
    setup(app) {
      const mounted = mountInkstoneWorkbench(app, controller);
      mount.current = mounted;
      return () => {
        if (mount.current === mounted) mount.current = undefined;
        mounted.dispose();
        void controller.dispose();
      };
    },
  };
}

/** Mounts the complete responsive workbench over the controller's one tiled workspace. */
export function mountInkstoneWorkbench(
  app: TerminalApp<InkstoneAppAction>,
  controller: InkstoneController,
): InkstoneAppMount {
  const windowHost = controller.kernel.windowHost;
  if (!windowHost) throw new Error("Inkstone requires the shared advanced-window host.");
  const owned: Array<{ dispose(): void }> = [];
  const unsubscribers: Array<() => void> = [];
  const subscriptions = new AbortController();
  const own = <T extends { dispose(): void }>(value: T): T => {
    owned.push(value);
    return value;
  };

  const paletteVisible = own(new Signal(false));
  const findVisible = own(new Signal(false));
  const findFeedback = own(new Signal("Type a literal query · Enter/F3 next · Shift-F3 previous"));
  const menuIndex = own(new Signal(routeMenuIndex(controller.kernel.routeId.peek())));
  const breakpoint = own(new Computed(() => resolveInkstoneTerminalBreakpoint(app.tui.rectangle.value.width)));
  const visibleWindowIds = own(
    new Computed(() =>
      inkstoneVisibleWindowIds(
        app.tui.rectangle.value.width,
        controller.kernel.routeId.value,
      )
    ),
  );
  const bodyRect = own(
    new Computed<Rectangle>(() => ({
      column: 0,
      row: 3,
      width: Math.max(1, app.tui.rectangle.value.width),
      height: Math.max(1, app.tui.rectangle.value.height - 6),
    })),
  );
  const shelfBounds = own(
    new Computed<Rectangle>(() => ({
      column: bodyRect.value.column,
      row: bodyRect.value.row + bodyRect.value.height,
      width: bodyRect.value.width,
      height: 1,
    })),
  );
  const projectionOptions = (): WorkbenchWindowHostProjectionOptions => ({
    visibleWindowIds: visibleWindowIds.peek(),
    separatorHitSize: 3,
    shelfBounds: shelfBounds.peek(),
  });
  const focusHostWindow = (windowId: InkstoneWindowId): void => {
    if (!windowProjection.peek().windows.some((window) => window.id === windowId)) return;
    const inspection = windowHost.controller.inspect();
    const state = inspection.windows.find((window) => window.id === windowId)?.state;
    if (state === "minimized" || state === "closed") {
      windowHost.execute({ kind: "restore", id: windowId }, bodyRect.peek(), projectionOptions());
    }
    if (windowHost.controller.inspect().activeWindowId === windowId) return;
    windowHost.execute({ kind: "focus", id: windowId }, bodyRect.peek(), projectionOptions());
  };
  let pendingHostFocus: InkstoneWindowId | undefined;
  let hostFocusQueued = false;
  let hostFocusBindingDisposed = false;
  const requestHostWindowFocus = (windowId: InkstoneWindowId): void => {
    pendingHostFocus = windowId;
    if (hostFocusQueued || hostFocusBindingDisposed) return;
    hostFocusQueued = true;
    queueMicrotask(() => {
      hostFocusQueued = false;
      if (hostFocusBindingDisposed) return;
      const requested = pendingHostFocus;
      pendingHostFocus = undefined;
      if (requested) focusHostWindow(requested);
    });
  };
  const windowProjection = own(
    new Computed(() =>
      windowHost.project(bodyRect.value, {
        visibleWindowIds: visibleWindowIds.value,
        separatorHitSize: 3,
        shelfBounds: shelfBounds.value,
      })
    ),
  );
  const workspaceLayout = own(
    new Computed(() => windowProjection.value.core.workspace),
  );

  const title = new Text({
    parent: app.tui,
    theme: { base: crayon.bgBlue.white },
    zIndex: 2,
    text: " INKSTONE ",
    overwriteWidth: true,
    rectangle: { column: 0, row: 0, width: 13 },
  });
  void title;

  const menu = new MenuBar({
    parent: app.tui,
    theme: PANEL_THEME,
    zIndex: 2,
    items: controller.kernel.manifest.routes.map((route: ShowcaseRouteManifest) => ({
      id: route.id,
      label: route.title,
    })),
    activeIndex: menuIndex,
    onChange: (item) => {
      controller.kernel.navigate(item.id);
    },
    rectangle: new Computed<Rectangle>(() => ({
      column: 14,
      row: 0,
      width: Math.max(1, app.tui.rectangle.value.width - 14),
      height: 1,
    })),
  });

  const searchSelectedIndex = own(new Signal(0));
  const searchInputController = own(
    new InputController({
      text: controller.searchQuery,
      multiCodePointSupport: true,
      placeholder: "Search titles, tags, paths, and note text…",
      onChange: (query) => {
        void controller.setSearch(query);
      },
      onSubmit: () => openSearchResultAt(controller, searchSelectedIndex.peek()),
    }),
  );
  new Text({
    parent: app.tui,
    theme: LABEL_THEME,
    zIndex: 2,
    text: " FIND ",
    overwriteWidth: true,
    rectangle: { column: 0, row: 1, width: 7 },
  });
  const searchInput = new Input({
    parent: app.tui,
    theme: INPUT_THEME,
    zIndex: 2,
    controller: searchInputController,
    text: controller.searchQuery,
    multiCodePointSupport: true,
    rectangle: new Computed<InputRectangle>(() => ({
      column: 7,
      row: 1,
      width: Math.max(1, app.tui.rectangle.value.width - 7),
      height: 1 as const,
    })),
  });

  const breadcrumbs = new Breadcrumbs({
    parent: app.tui,
    theme: MUTED_THEME,
    zIndex: 2,
    items: new Computed(() => {
      const tab = controller.tabs.active();
      return [
        { id: "inkstone", label: "Inkstone" },
        { id: controller.kernel.routeId.value, label: routeTitle(controller, controller.kernel.routeId.value) },
        ...(tab ? [{ id: tab.id, label: tab.label.replace(/ \*$/, "") }] : []),
      ];
    }),
    separator: "›",
    rectangle: new Computed(() => ({
      column: 1,
      row: 2,
      width: Math.max(1, app.tui.rectangle.value.width - 2),
      height: 1,
    })),
  });
  void breadcrumbs;

  const vaultPane = createPaneChrome(app, windowProjection, "vault", own, subscriptions.signal);
  const editorPane = createPaneChrome(app, windowProjection, "editor", own, subscriptions.signal);
  const previewPane = createPaneChrome(app, windowProjection, "preview", own, subscriptions.signal);
  const inspectorPane = createPaneChrome(app, windowProjection, "inspector", own, subscriptions.signal);

  const shelfVisibleSource = own(new Computed(() => windowProjection.value.shelf.length > 0));
  const shelfVisible = mirrorBoolean(shelfVisibleSource, own, subscriptions.signal);
  new Text({
    parent: app.tui,
    theme: { base: crayon.bgLightBlack.white },
    zIndex: 3_000,
    text: new Computed(() => `minimized ${windowProjection.value.shelf.map((item) => `[ ${item.title} ]`).join(" ")}`),
    overwriteWidth: true,
    rectangle: new Computed<TextRectangle>(() => ({
      column: shelfBounds.value.column,
      row: shelfBounds.value.row,
      width: shelfBounds.value.width,
    })),
    visible: shelfVisible,
  });

  const snapVisibleSource = own(new Computed(() => windowProjection.value.snapPreview !== undefined));
  const snapVisible = mirrorBoolean(snapVisibleSource, own, subscriptions.signal);
  new Frame({
    parent: app.tui,
    theme: { base: crayon.cyan },
    zIndex: 2_900,
    charMap: "rounded",
    rectangle: new Computed(() => insetWindowRect(windowProjection.value.snapPreview?.rect ?? emptyRect())),
    visible: snapVisible,
  });

  const switcherVisibleSource = own(new Computed(() => windowProjection.value.switcher !== undefined));
  const switcherVisible = mirrorBoolean(switcherVisibleSource, own, subscriptions.signal);
  const switcherRect = own(new Computed(() => centeredWindowRect(bodyRect.value, 44, 9)));
  new Frame({
    parent: app.tui,
    theme: { base: crayon.bgBlue.white },
    zIndex: 3_100,
    charMap: "rounded",
    rectangle: new Computed(() => insetWindowRect(switcherRect.value)),
    visible: switcherVisible,
  });
  new Text({
    parent: app.tui,
    theme: { base: crayon.bgBlue.white },
    zIndex: 3_101,
    text: new Computed(() => {
      const switcher = windowProjection.value.switcher;
      return switcher
        ? ` WINDOWS\n${switcher.items.map((item) => `${item.selected ? "▶" : " "} ${item.title}`).join("\n")}`
        : "";
    }),
    rectangle: new Computed<TextRectangle>(() => ({
      column: switcherRect.value.column + 1,
      row: switcherRect.value.row,
      width: Math.max(0, switcherRect.value.width - 2),
    })),
    visible: switcherVisible,
  });

  const explorer = new Tree({
    parent: app.tui,
    theme: PANEL_THEME,
    zIndex: vaultPane.contentZIndex,
    controller: controller.explorer.tree,
    nodes: controller.explorer.tree.nodes,
    selectedIndex: controller.explorer.tree.selectedIndex,
    rectangle: vaultPane.content,
    visible: vaultPane.visible,
  });

  const tabsRect = new Computed(() => {
    const rect = editorPane.content.value;
    return { ...rect, height: Math.min(1, rect.height) };
  });
  const findBarVisibleSource = own(
    new Computed(() => {
      const paneVisible = editorPane.visible.value;
      const findBarRequested = findVisible.value;
      return paneVisible && findBarRequested;
    }),
  );
  const findBarVisible = mirrorBoolean(findBarVisibleSource, own, subscriptions.signal);
  const editorRect = new Computed(() => {
    const rect = editorPane.content.value;
    const findRows = findVisible.value ? 2 : 0;
    return {
      column: rect.column,
      row: rect.row + 1 + findRows,
      width: rect.width,
      height: Math.max(0, rect.height - 1 - findRows),
    };
  });
  const tabs = new Tabs({
    parent: app.tui,
    theme: PANEL_THEME,
    zIndex: editorPane.contentZIndex,
    controller: controller.tabs,
    tabs: controller.tabs.tabs,
    activeIndex: controller.tabs.activeIndex,
    rectangle: tabsRect,
    visible: editorPane.visible,
  });
  const findQuery = own(new Signal(""));
  const replacement = own(new Signal(""));
  const findInputController = own(
    new InputController({
      text: findQuery,
      multiCodePointSupport: true,
      placeholder: "Literal text in current note",
      onChange: (query) => {
        if (query.length === 0) {
          controller.editor.clearSelection();
          findFeedback.value = "Type a literal query · Enter/F3 next · Shift-F3 previous";
        }
      },
      onSubmit: (query) => {
        findFeedback.value = formatEditorFindResult(controller.findInActiveEditor(query, "forward"));
      },
    }),
  );
  const replaceInputController = own(
    new InputController({
      text: replacement,
      multiCodePointSupport: true,
      placeholder: "Replacement text",
      onSubmit: (value) => {
        const result = controller.replaceInActiveEditor(findQuery.peek(), value);
        findFeedback.value = formatEditorReplaceResult(result, false);
      },
    }),
  );
  new Text({
    parent: app.tui,
    theme: LABEL_THEME,
    zIndex: editorPane.overlayZIndex,
    text: " FIND ",
    overwriteWidth: true,
    rectangle: new Computed<TextRectangle>(() => {
      const rect = editorPane.content.value;
      return { column: rect.column, row: rect.row + 1, width: Math.min(7, rect.width) };
    }),
    visible: findBarVisible,
  });
  const findInput = new Input({
    parent: app.tui,
    theme: INPUT_THEME,
    zIndex: editorPane.overlayZIndex,
    controller: findInputController,
    text: findQuery,
    multiCodePointSupport: true,
    rectangle: new Computed<InputRectangle>(() => {
      const rect = editorPane.content.value;
      const feedbackWidth = Math.min(30, Math.max(0, Math.floor(rect.width / 3)));
      return {
        column: rect.column + Math.min(7, rect.width),
        row: rect.row + 1,
        width: Math.max(1, rect.width - Math.min(7, rect.width) - feedbackWidth),
        height: 1 as const,
      };
    }),
    visible: findBarVisible,
  });
  new Text({
    parent: app.tui,
    theme: MUTED_THEME,
    zIndex: editorPane.overlayZIndex,
    text: findFeedback,
    overwriteWidth: true,
    rectangle: new Computed<TextRectangle>(() => {
      const rect = editorPane.content.value;
      const width = Math.min(30, Math.max(0, Math.floor(rect.width / 3)));
      return { column: rect.column + rect.width - width, row: rect.row + 1, width };
    }),
    visible: findBarVisible,
  });
  new Text({
    parent: app.tui,
    theme: LABEL_THEME,
    zIndex: editorPane.overlayZIndex,
    text: " REPLACE ",
    overwriteWidth: true,
    rectangle: new Computed<TextRectangle>(() => {
      const rect = editorPane.content.value;
      return { column: rect.column, row: rect.row + 2, width: Math.min(10, rect.width) };
    }),
    visible: findBarVisible,
  });
  const replaceInput = new Input({
    parent: app.tui,
    theme: INPUT_THEME,
    zIndex: editorPane.overlayZIndex,
    controller: replaceInputController,
    text: replacement,
    multiCodePointSupport: true,
    rectangle: new Computed<InputRectangle>(() => {
      const rect = editorPane.content.value;
      return {
        column: rect.column + Math.min(10, rect.width),
        row: rect.row + 2,
        width: Math.max(1, rect.width - Math.min(10, rect.width)),
        height: 1 as const,
      };
    }),
    visible: findBarVisible,
  });
  const editor = new TextBox({
    parent: app.tui,
    theme: EDITOR_THEME,
    zIndex: editorPane.contentZIndex,
    controller: controller.editor,
    text: controller.editor.text,
    cursorPosition: controller.editor.cursorPosition,
    multiCodePointSupport: true,
    lineNumbering: true,
    lineHighlighting: true,
    wordWrap: true,
    rectangle: editorRect,
    visible: editorPane.visible,
  });
  const preview = new Markdown({
    parent: app.tui,
    theme: PANEL_THEME,
    zIndex: previewPane.contentZIndex,
    controller: controller.markdown,
    rectangle: previewPane.content,
    visible: previewPane.visible,
  });

  const outlineRows = own(
    new Computed(() =>
      controller.outline.value.map((heading: InkstoneHeading) =>
        `${"#".repeat(Math.min(6, heading.level))} ${heading.text}`
      )
    ),
  );
  const outlineController = own(
    new ListController({
      items: outlineRows,
      onSelect: (_label, index) => {
        const heading = controller.outline.peek()[index];
        if (!heading) return;
        controller.editor.setCursorPosition({ x: 0, y: heading.line });
        app.focus.focus(editor);
      },
    }),
  );
  const backlinkRows = own(
    new Computed(() =>
      controller.backlinks.value.map((backlink: InkstoneBacklink) =>
        `← ${backlink.sourceTitle} · line ${backlink.line + 1}`
      )
    ),
  );
  const backlinksController = own(
    new ListController({
      items: backlinkRows,
      onSelect: (_label, index) => {
        const backlink = controller.backlinks.peek()[index];
        if (backlink) void controller.openNote(backlink.sourceNoteId);
      },
    }),
  );
  const searchRows = own(
    new Computed(() => controller.searchResults.value.map((row: InkstoneSearchRow) => `${row.title} · ${row.path}`)),
  );
  const searchResultsController = own(
    new ListController({
      items: searchRows,
      selectedIndex: searchSelectedIndex,
      onSelect: (_label, index) => openSearchResultAt(controller, index),
    }),
  );
  const diagnosticRows = own(
    new Signal<string[]>(diagnosticLabels(controller.kernel.diagnostics.entries()), {
      deepObserve: true,
    }),
  );
  const diagnosticsController = own(new ListController({ items: diagnosticRows }));
  unsubscribers.push(controller.kernel.diagnostics.subscribe(() => {
    diagnosticRows.value = diagnosticLabels(controller.kernel.diagnostics.entries());
  }));

  const inspectorPanels = own(
    new Computed(() => visibleInspectorPanels(breakpoint.value, controller.kernel.routeId.value)),
  );
  const outlineSurface = createInspectorList(
    app,
    inspectorPane,
    inspectorPanels,
    "outline",
    "OUTLINE",
    outlineController,
    own,
    subscriptions.signal,
  );
  const backlinksSurface = createInspectorList(
    app,
    inspectorPane,
    inspectorPanels,
    "backlinks",
    "BACKLINKS",
    backlinksController,
    own,
    subscriptions.signal,
  );
  const searchSurface = createInspectorList(
    app,
    inspectorPane,
    inspectorPanels,
    "search",
    "SEARCH RESULTS",
    searchResultsController,
    own,
    subscriptions.signal,
  );
  const diagnosticsSurface = createInspectorList(
    app,
    inspectorPane,
    inspectorPanels,
    "diagnostics",
    "DIAGNOSTICS",
    diagnosticsController,
    own,
    subscriptions.signal,
  );

  const toasts = own(
    new ToastStackController({
      limit: 3,
      idFactory: deterministicToastId,
      messages: [
        { id: "inkstone-ready", level: "success", message: "Fixture vault ready" },
        ...(controller.inspect().recoveredDraftCount > 0
          ? [{
            id: "inkstone-recovered",
            level: "warning" as const,
            message: `Recovered ${controller.inspect().recoveredDraftCount} unsaved draft${
              controller.inspect().recoveredDraftCount === 1 ? "" : "s"
            }`,
          }]
          : []),
      ],
    }),
  );
  new ToastStack({
    parent: app.tui,
    theme: { base: crayon.bgLightBlack.white },
    zIndex: 3_500,
    messages: toasts.messages,
    rectangle: new Computed(() => ({
      column: Math.max(0, app.tui.rectangle.value.width - Math.min(46, app.tui.rectangle.value.width)),
      row: Math.max(3, app.tui.rectangle.value.height - 6),
      width: Math.min(46, app.tui.rectangle.value.width),
      height: Math.min(3, Math.max(0, app.tui.rectangle.value.height - 3)),
    })),
  });

  new StatusBar({
    parent: app.tui,
    theme: { base: crayon.bgBlue.white },
    zIndex: 5,
    left: new Computed(() => inkstoneStatusLeft(controller)),
    right: new Computed(() => inkstoneStatusRight(controller, breakpoint.value)),
    priority: "left",
    rectangle: new Computed(() => ({
      column: 0,
      row: Math.max(0, app.tui.rectangle.value.height - 2),
      width: app.tui.rectangle.value.width,
      height: 1,
    })),
  });
  new KeyHelp({
    parent: app.tui,
    theme: { base: crayon.bgBlack.lightBlack },
    zIndex: 5,
    bindings: app.keymap,
    rectangle: new Computed(() => ({
      column: 0,
      row: Math.max(0, app.tui.rectangle.value.height - 1),
      width: app.tui.rectangle.value.width,
      height: 1,
    })),
  });

  const modalRect = new Computed<Rectangle>(() => {
    const width = Math.min(66, Math.max(24, app.tui.rectangle.value.width - 8));
    const height = Math.min(13, Math.max(7, app.tui.rectangle.value.height - 8));
    return {
      column: Math.max(1, Math.floor((app.tui.rectangle.value.width - width) / 2)),
      row: Math.max(3, Math.floor((app.tui.rectangle.value.height - height) / 2)),
      width,
      height,
    };
  });
  new Modal({
    parent: app.tui,
    theme: { base: crayon.bgBlack.cyan },
    zIndex: 4_000,
    title: "Command Palette",
    body: "Type to filter · Enter to run · Esc to return",
    rectangle: modalRect,
    visible: paletteVisible,
  });
  const paletteController = own(
    new CommandPaletteController({
      items: new Computed(() => commandSurfaceItems(app.commands, { includeDisabled: false })),
    }),
  );
  const palette = new CommandPalette({
    parent: app.tui,
    theme: PANEL_THEME,
    zIndex: 4_001,
    controller: paletteController,
    items: paletteController.items,
    query: paletteController.query,
    selectedIndex: paletteController.selectedIndex,
    rectangle: new Computed(() => {
      const rect = modalRect.value;
      return {
        column: rect.column + 2,
        row: rect.row + 2,
        width: Math.max(1, rect.width - 4),
        height: Math.max(1, rect.height - 3),
      };
    }),
    visible: paletteVisible,
    onSelect: async (item) => {
      paletteVisible.value = false;
      paletteController.setQuery("");
      await executeCommandSurfaceItem(app.commands, item, (action) => app.actions.dispatch(action));
    },
  });

  const registered: Array<{ component: Component; id: string; windowId?: InkstoneWindowId }> = [
    { component: menu, id: "inkstone-chrome-menu" },
    { component: searchInput, id: "inkstone-chrome-search" },
    { component: explorer, id: "inkstone-vault-explorer", windowId: "vault" },
    { component: tabs, id: "inkstone-editor-tabs", windowId: "editor" },
    { component: editor, id: "inkstone-editor-textbox", windowId: "editor" },
    { component: preview, id: "inkstone-preview-markdown", windowId: "preview" },
    { component: outlineSurface.list, id: "inkstone-inspector-outline", windowId: "inspector" },
    { component: backlinksSurface.list, id: "inkstone-inspector-backlinks", windowId: "inspector" },
    { component: searchSurface.list, id: "inkstone-inspector-search", windowId: "inspector" },
    { component: diagnosticsSurface.list, id: "inkstone-inspector-diagnostics", windowId: "inspector" },
  ];
  let rebuildingFocus = false;
  for (const { component, id, windowId } of registered) {
    // Focus membership follows responsive visibility below. Component mouse
    // registration remains available for controls with native interaction.
    app.registerComponent(component, { id, focus: false });
    if (windowId) {
      component.state.subscribe((state) => {
        if (!rebuildingFocus && (state === "focused" || state === "active")) requestHostWindowFocus(windowId);
      }, subscriptions.signal);
    }
  }
  app.registerComponent(palette, { id: "command-palette", mouse: true, focus: false });
  app.registerComponent(findInput, { id: "inkstone-editor-find", mouse: true, focus: false });
  app.registerComponent(replaceInput, { id: "inkstone-editor-replace", mouse: true, focus: false });
  for (const input of [findInput, replaceInput]) {
    input.state.subscribe((state) => {
      if (state === "focused" || state === "active") requestHostWindowFocus("editor");
    }, subscriptions.signal);
  }
  unsubscribers.push(bindModalFocus(app.tui, paletteVisible, app.focus, [palette]));
  unsubscribers.push(bindModalFocus(app.tui, findVisible, app.focus, [findInput, replaceInput]));
  const focusDisposers = new Map<Component, () => void>();
  let focusRebuildQueued = false;
  let focusBindingDisposed = false;
  let pendingSurfaceFocus: Component | undefined;
  const focusEligible = (component: Component): boolean =>
    component.visible.peek() && component.state.peek() !== "disabled";
  const focusFallback = (): Component | undefined => {
    const routeId = controller.kernel.routeId.peek();
    const candidates = routeId === "diagnostics"
      ? [diagnosticsSurface.list, editor, searchInput, menu]
      : routeId === "search"
      ? [searchInput, searchSurface.list, editor, menu]
      : routeId === "vault"
      ? [explorer, editor, searchInput, menu]
      : [editor, tabs, preview, explorer, searchInput, menu];
    return candidates.find((component) => focusDisposers.has(component) && focusEligible(component));
  };
  const rebuildResponsiveFocus = (): void => {
    if (paletteVisible.peek() || findVisible.peek()) return;
    const previous = app.focus.current() as Component | undefined;
    const previouslyRegistered = new Set(focusDisposers.keys());
    rebuildingFocus = true;
    for (const dispose of focusDisposers.values()) dispose();
    focusDisposers.clear();
    for (const { component } of registered) {
      if (focusEligible(component)) focusDisposers.set(component, app.focus.register(component));
    }
    rebuildingFocus = false;
    const requested = pendingSurfaceFocus && focusDisposers.has(pendingSurfaceFocus) &&
        focusEligible(pendingSurfaceFocus)
      ? pendingSurfaceFocus
      : undefined;
    if (requested) pendingSurfaceFocus = undefined;
    const activeWindowId = windowHost.controller.inspect().activeWindowId as InkstoneWindowId | undefined;
    const newlyEligibleActiveSurface = activeWindowId
      ? windowFocusCandidates(activeWindowId, controller.kernel.routeId.peek(), {
        explorer,
        tabs,
        editor,
        preview,
        outline: outlineSurface.list,
        backlinks: backlinksSurface.list,
        search: searchSurface.list,
        diagnostics: diagnosticsSurface.list,
      }).find((component) => focusDisposers.has(component) && !previouslyRegistered.has(component))
      : undefined;
    const next = requested ?? newlyEligibleActiveSurface ??
      (previous && focusDisposers.has(previous) ? previous : focusFallback());
    if (next) app.focus.focus(next);
    const projectedIds = new Set(windowProjection.peek().windows.map((window) => window.id));
    if (!activeWindowId || !projectedIds.has(activeWindowId)) {
      const routeId = controller.kernel.routeId.peek();
      const candidates: readonly InkstoneWindowId[] = routeId === "diagnostics" || routeId === "search"
        ? ["inspector", "editor", "preview", "vault"]
        : routeId === "vault"
        ? ["vault", "editor", "preview", "inspector"]
        : ["editor", "preview", "vault", "inspector"];
      const projected = candidates.find((windowId) => projectedIds.has(windowId));
      if (projected) windowHost.execute({ kind: "focus", id: projected }, bodyRect.peek(), projectionOptions());
    }
  };
  const requestResponsiveFocusRebuild = (): void => {
    if (focusBindingDisposed || focusRebuildQueued) return;
    focusRebuildQueued = true;
    queueMicrotask(() => {
      focusRebuildQueued = false;
      if (!focusBindingDisposed) rebuildResponsiveFocus();
    });
  };
  const requestSurfaceFocus = (component: Component): boolean => {
    pendingSurfaceFocus = component;
    if (
      !paletteVisible.peek() && !findVisible.peek() && focusEligible(component) && focusDisposers.has(component)
    ) {
      pendingSurfaceFocus = undefined;
      app.focus.focus(component);
      return true;
    }
    requestResponsiveFocusRebuild();
    return false;
  };
  for (const { component } of registered) {
    component.visible.subscribe(requestResponsiveFocusRebuild, subscriptions.signal);
  }
  paletteVisible.subscribe((visible) => {
    if (!visible) requestResponsiveFocusRebuild();
  }, subscriptions.signal);
  findVisible.subscribe((visible) => {
    if (!visible) requestResponsiveFocusRebuild();
  }, subscriptions.signal);
  unsubscribers.push(() => {
    hostFocusBindingDisposed = true;
    pendingHostFocus = undefined;
    pendingSurfaceFocus = undefined;
    focusBindingDisposed = true;
    rebuildingFocus = true;
    for (const dispose of focusDisposers.values()) dispose();
    focusDisposers.clear();
    rebuildingFocus = false;
  });
  rebuildResponsiveFocus();
  controller.kernel.routeId.subscribe((routeId: string) => {
    if (routeId !== "note") findVisible.value = false;
    menuIndex.value = routeMenuIndex(routeId);
    requestSurfaceFocus(routeFocusCandidate(routeId, {
      editor,
      explorer,
      diagnostics: diagnosticsSurface.list,
      searchInput,
    }));
  }, subscriptions.signal);
  editor.on("paste", (event) => insertEditorPaste(controller, event.text));

  const preferredWindowSurface = (windowId: InkstoneWindowId): Component =>
    windowFocusCandidates(windowId, controller.kernel.routeId.peek(), {
      explorer,
      tabs,
      editor,
      preview,
      outline: outlineSurface.list,
      backlinks: backlinksSurface.list,
      search: searchSurface.list,
      diagnostics: diagnosticsSurface.list,
    })[0]!;
  const focusWindow = (windowId: InkstoneWindowId): void => {
    const inspected = windowHost.controller.inspect().windows.find((window) => window.id === windowId);
    if (!inspected) return;
    const eligibleByResponsivePolicy = inspected.placement === "floating" ||
      visibleWindowIds.peek().includes(windowId);
    if (!eligibleByResponsivePolicy) return;
    if (inspected.state === "minimized" || inspected.state === "closed") {
      windowHost.execute({ kind: "restore", id: windowId }, bodyRect.peek(), projectionOptions());
    }
    if (!windowProjection.peek().windows.some((window) => window.id === windowId)) return;
    windowHost.execute({ kind: "focus", id: windowId }, bodyRect.peek(), projectionOptions());
    requestSurfaceFocus(preferredWindowSurface(windowId));
  };
  const syncActiveWindowSurface = (): void => {
    if (paletteVisible.peek() || findVisible.peek()) return;
    const activeWindowId = windowHost.controller.inspect().activeWindowId as InkstoneWindowId | undefined;
    if (!activeWindowId || !windowProjection.peek().windows.some((window) => window.id === activeWindowId)) return;
    requestSurfaceFocus(preferredWindowSurface(activeWindowId));
  };

  unsubscribers.push(...registerInkstoneWindowMouseTargets(
    app,
    windowProjection,
    shelfBounds,
    (event) => windowHost.handleMouse("terminal", event, bodyRect.peek(), projectionOptions()),
    syncActiveWindowSurface,
  ));
  unsubscribers.push(...registerInkstoneContentMouseTargets(app, {
    explorer,
    tabs,
    preview,
    outline: outlineSurface.list,
    backlinks: backlinksSurface.list,
    search: searchSurface.list,
    diagnostics: diagnosticsSurface.list,
  }));
  unsubscribers.push(app.tui.on("keyPress", (event) => {
    if (paletteVisible.peek() || findVisible.peek()) return;
    const switcherWasOpen = windowHost.inspect().switcherOpen;
    const activeBefore = windowHost.controller.inspect().activeWindowId;
    const result = windowHost.handleKey(event, bodyRect.peek(), projectionOptions());
    const activeAfter = windowHost.controller.inspect().activeWindowId;
    if (
      result.handled && (activeBefore !== activeAfter || (switcherWasOpen && ["return", "space"].includes(event.key)))
    ) {
      syncActiveWindowSurface();
    }
  }));

  app.focus.focus(editor);
  focusHostWindow("editor");

  let disposed = false;
  const mounted: InkstoneAppMount = {
    app,
    controller,
    breakpoint,
    visibleWindowIds,
    bodyRect,
    shelfBounds,
    windowProjection,
    workspaceLayout,
    paletteVisible,
    findVisible,
    findFeedback,
    menu,
    searchInput,
    findInput,
    replaceInput,
    explorer,
    tabs,
    editor,
    preview,
    outline: outlineSurface.list,
    backlinks: backlinksSurface.list,
    searchResults: searchSurface.list,
    diagnostics: diagnosticsSurface.list,
    palette,
    toasts,
    focusWindow,
    dispose() {
      if (disposed) return;
      disposed = true;
      subscriptions.abort();
      for (let index = unsubscribers.length - 1; index >= 0; index -= 1) unsubscribers[index]!();
      for (let index = owned.length - 1; index >= 0; index -= 1) owned[index]!.dispose();
    },
  };
  return mounted;
}

function inkstoneCommands(): TerminalAppOptions<InkstoneAppAction>["commands"] {
  return [
    {
      id: "inkstone.save",
      label: "Save active note",
      description: "Persist the active fixture note with optimistic revision checking.",
      group: "document",
      binding: { key: "s", ctrl: true },
      action: { type: "inkstone.save" },
    },
    {
      id: "inkstone.undo",
      label: "Undo editor change",
      group: "document",
      binding: { key: "z", ctrl: true },
      action: { type: "inkstone.undo" },
    },
    {
      id: "inkstone.redo",
      label: "Redo editor change",
      group: "document",
      binding: { key: "y", ctrl: true },
      action: { type: "inkstone.redo" },
    },
    {
      id: "inkstone.find",
      label: "Find in active note",
      description: "Open grapheme-safe literal find and replace for the current note.",
      group: "document",
      binding: { key: "f", ctrl: true },
      action: { type: "inkstone.find", focus: "find" },
    },
    {
      id: "inkstone.replace",
      label: "Replace in active note",
      description: "Open current-note find and focus the replacement field.",
      group: "document",
      binding: { key: "h", ctrl: true },
      action: { type: "inkstone.find", focus: "replace" },
    },
    {
      id: "inkstone.find-next",
      label: "Find next match",
      group: "document",
      binding: { key: "f3" },
      action: { type: "inkstone.find-next", direction: "forward" },
    },
    {
      id: "inkstone.find-previous",
      label: "Find previous match",
      group: "document",
      binding: { key: "f3", shift: true },
      action: { type: "inkstone.find-next", direction: "backward" },
    },
    {
      id: "inkstone.replace-one",
      label: "Replace current match",
      group: "document",
      action: { type: "inkstone.replace-one" },
    },
    {
      id: "inkstone.replace-all",
      label: "Replace all matches in active note",
      group: "document",
      action: { type: "inkstone.replace-all" },
    },
    {
      id: "inkstone.palette",
      label: "Open command palette",
      group: "global",
      binding: { key: "p", ctrl: true },
      action: { type: "inkstone.palette" },
    },
    {
      id: "inkstone.search",
      label: "Focus vault search",
      group: "global",
      binding: { key: "f", ctrl: true, shift: true },
      action: { type: "inkstone.search" },
    },
    {
      id: "inkstone.recovery",
      label: "Review recovery diagnostics",
      description: "Open redacted diagnostics for restored drafts and storage recovery.",
      group: "document",
      action: { type: "inkstone.recovery" },
    },
    {
      id: "inkstone.workspace",
      label: "Show writing workspace",
      group: "navigation",
      binding: { key: "1", ctrl: true },
      action: { type: "inkstone.route", routeId: "note" },
    },
    {
      id: "inkstone.search-workspace",
      label: "Show search workspace",
      group: "navigation",
      binding: { key: "2", ctrl: true },
      action: { type: "inkstone.route", routeId: "search" },
    },
    {
      id: "inkstone.diagnostics-workspace",
      label: "Show diagnostics workspace",
      group: "navigation",
      binding: { key: "3", ctrl: true },
      action: { type: "inkstone.route", routeId: "diagnostics" },
    },
    {
      id: "inkstone.focus-vault",
      label: "Focus vault explorer",
      group: "focus",
      action: { type: "inkstone.focus", windowId: "vault" },
    },
    {
      id: "inkstone.focus-editor",
      label: "Focus editor",
      group: "focus",
      action: { type: "inkstone.focus", windowId: "editor" },
    },
    {
      id: "inkstone.focus-preview",
      label: "Focus Markdown preview",
      group: "focus",
      action: { type: "inkstone.focus", windowId: "preview" },
    },
    {
      id: "inkstone.focus-inspector",
      label: "Focus knowledge inspector",
      group: "focus",
      action: { type: "inkstone.focus", windowId: "inspector" },
    },
    {
      id: "inkstone.detach-preview",
      label: "Detach Markdown preview",
      description: "Float the live preview above the tiled writing workspace.",
      group: "windows",
      binding: { key: "d", ctrl: true, shift: true },
      action: { type: "inkstone.window", operation: "detach-preview" },
    },
    {
      id: "inkstone.dock-preview",
      label: "Dock Markdown preview",
      description: "Return the preview to its preserved tiled split.",
      group: "windows",
      binding: { key: "t", ctrl: true, shift: true },
      action: { type: "inkstone.window", operation: "dock-preview" },
    },
    {
      id: "inkstone.minimize-preview",
      label: "Minimize Markdown preview",
      group: "windows",
      binding: { key: "m", ctrl: true, shift: true },
      action: { type: "inkstone.window", operation: "minimize-preview" },
    },
    {
      id: "inkstone.restore-preview",
      label: "Restore Markdown preview",
      group: "windows",
      action: { type: "inkstone.window", operation: "restore-preview" },
    },
    {
      id: "inkstone.pin-preview",
      label: "Toggle preview always on top",
      group: "windows",
      binding: { key: "p", ctrl: true, shift: true },
      action: { type: "inkstone.window", operation: "pin-preview" },
    },
    {
      id: "inkstone.recover-windows",
      label: "Recover off-screen windows",
      group: "windows",
      binding: { key: "r", ctrl: true, shift: true },
      action: { type: "inkstone.window", operation: "recover-all" },
    },
    {
      id: "inkstone.window-undo",
      label: "Undo window change",
      description: "Undo layout and window chrome independently from note editing.",
      group: "windows",
      binding: { key: "z", meta: true, shift: true },
      action: { type: "inkstone.window-undo" },
    },
    {
      id: "inkstone.window-redo",
      label: "Redo window change",
      group: "windows",
      binding: { key: "y", meta: true, shift: true },
      action: { type: "inkstone.window-redo" },
    },
    {
      id: "inkstone.quit",
      label: "Quit Inkstone",
      group: "global",
      binding: { key: "q", ctrl: true },
      action: { type: "inkstone.quit" },
    },
  ];
}

async function handleInkstoneAction(action: InkstoneAppAction, mount: InkstoneAppMountRef): Promise<void> {
  const mounted = mount.current;
  if (!mounted) return;
  const { app, controller, toasts } = mounted;
  if (
    (mounted.paletteVisible.peek() || mounted.findVisible.peek()) &&
    (action.type === "inkstone.focus" || action.type === "inkstone.window" ||
      action.type === "inkstone.window-undo" || action.type === "inkstone.window-redo")
  ) {
    return;
  }
  switch (action.type) {
    case "inkstone.save": {
      const result = await controller.saveActive();
      showSaveToast(toasts, result);
      return;
    }
    case "inkstone.undo":
      toasts.show(await controller.undo() ? "Editor change undone" : "Nothing to undo", "info");
      return;
    case "inkstone.redo":
      toasts.show(await controller.redo() ? "Editor change restored" : "Nothing to redo", "info");
      return;
    case "inkstone.find":
      mounted.paletteVisible.value = false;
      mounted.findVisible.value = true;
      app.focus.focus(action.focus === "replace" ? mounted.replaceInput : mounted.findInput);
      return;
    case "inkstone.find-next": {
      const query = mounted.findInput.controller.text.peek();
      if (!mounted.findVisible.peek() || query.length === 0) {
        mounted.findVisible.value = true;
        app.focus.focus(mounted.findInput);
        return;
      }
      mounted.findFeedback.value = formatEditorFindResult(controller.findInActiveEditor(query, action.direction));
      return;
    }
    case "inkstone.replace-one": {
      const result = controller.replaceInActiveEditor(
        mounted.findInput.controller.text.peek(),
        mounted.replaceInput.controller.text.peek(),
      );
      mounted.findFeedback.value = formatEditorReplaceResult(result, false);
      return;
    }
    case "inkstone.replace-all": {
      const result = controller.replaceAllInActiveEditor(
        mounted.findInput.controller.text.peek(),
        mounted.replaceInput.controller.text.peek(),
      );
      mounted.findFeedback.value = formatEditorReplaceResult(result, true);
      return;
    }
    case "inkstone.palette":
      mounted.findVisible.value = false;
      mounted.palette.controller.setQuery("");
      mounted.paletteVisible.value = true;
      return;
    case "inkstone.search":
      mounted.findVisible.value = false;
      controller.kernel.navigate("search");
      return;
    case "inkstone.recovery":
      controller.kernel.navigate("diagnostics");
      return;
    case "inkstone.route":
      controller.kernel.navigate(action.routeId);
      return;
    case "inkstone.focus":
      mounted.focusWindow(action.windowId);
      return;
    case "inkstone.window": {
      const result = executeInkstoneWindowOperation(mounted, action.operation);
      const labels: Record<typeof action.operation, string> = {
        "detach-preview": "Preview detached",
        "dock-preview": "Preview docked",
        "minimize-preview": "Preview minimized to the window shelf",
        "restore-preview": "Preview restored",
        "pin-preview": "Preview stacking updated",
        "recover-all": "Floating windows recovered",
      };
      toasts.show(
        result.status === "applied" ? labels[action.operation] : result.reason ?? `Window action ${result.status}`,
        result.status === "applied" ? "success" : result.status === "unchanged" ? "info" : "warning",
      );
      if (action.operation === "detach-preview" || action.operation === "restore-preview") {
        mounted.focusWindow("preview");
      }
      return;
    }
    case "inkstone.window-undo":
      toasts.show(
        await controller.kernel.windowHost!.undo() ? "Window change undone" : "No window change to undo",
        "info",
      );
      return;
    case "inkstone.window-redo":
      toasts.show(
        await controller.kernel.windowHost!.redo() ? "Window change restored" : "No window change to redo",
        "info",
      );
      return;
    case "inkstone.quit":
      app.destroy();
      await controller.dispose();
  }
}

function executeInkstoneWindowOperation(
  mount: InkstoneAppMount,
  operation: Extract<InkstoneAppAction, { type: "inkstone.window" }>["operation"],
) {
  const host = mount.controller.kernel.windowHost!;
  const bounds = mount.bodyRect.peek();
  const options: WorkbenchWindowHostProjectionOptions = {
    visibleWindowIds: mount.visibleWindowIds.peek(),
    separatorHitSize: 3,
    shelfBounds: mount.shelfBounds.peek(),
  };
  if (operation === "detach-preview") {
    return host.execute({ kind: "set-placement", id: "preview", placement: "floating" }, bounds, options);
  }
  if (operation === "dock-preview") {
    return host.execute({ kind: "set-placement", id: "preview", placement: "tiled" }, bounds, options);
  }
  if (operation === "minimize-preview") return host.execute({ kind: "minimize", id: "preview" }, bounds, options);
  if (operation === "restore-preview") return host.execute({ kind: "restore", id: "preview" }, bounds, options);
  if (operation === "pin-preview") {
    return host.execute({ kind: "toggle-always-on-top", id: "preview" }, bounds, options);
  }
  return host.execute({ kind: "recover-all" }, bounds, options);
}

interface PaneChrome {
  readonly window: Computed<WorkbenchWindowChromeProjection | undefined>;
  readonly visible: Signal<boolean>;
  readonly content: Computed<Rectangle>;
  readonly contentZIndex: Computed<number>;
  readonly overlayZIndex: Computed<number>;
  readonly chromeZIndex: Computed<number>;
}

type OwnDisposable = <T extends { dispose(): void }>(value: T) => T;

function createPaneChrome(
  app: TerminalApp<InkstoneAppAction>,
  projection: Computed<WorkbenchWindowHostProjection>,
  windowId: InkstoneWindowId,
  own: OwnDisposable,
  signal: AbortSignal,
): PaneChrome {
  const window = own(new Computed(() => projection.value.windows.find((candidate) => candidate.id === windowId)));
  const visibleSource = own(
    new Computed(() => {
      const rect = window.value?.rect;
      return Boolean(rect && rect.width >= 4 && rect.height >= 3);
    }),
  );
  const visible = mirrorBoolean(visibleSource, own, signal);
  const frameRect = own(new Computed<Rectangle>(() => ({ ...(window.value?.clientRect ?? emptyRect()) })));
  const content = own(new Computed<Rectangle>(() => ({ ...(window.value?.clientRect ?? emptyRect()) })));
  const contentZIndex = own(new Computed(() => inkstoneWindowBaseZ(window.value) + 1));
  const chromeZIndex = own(new Computed(() => inkstoneWindowBaseZ(window.value) + 3));
  const overlayZIndex = own(new Computed(() => inkstoneWindowBaseZ(window.value) + 4));
  new Frame({
    parent: app.tui,
    theme: FRAME_THEME,
    zIndex: new Computed(() => inkstoneWindowBaseZ(window.value)),
    charMap: "rounded",
    rectangle: frameRect,
    visible,
  });
  new Text({
    parent: app.tui,
    theme: LABEL_THEME,
    zIndex: chromeZIndex,
    text: new Computed(() => {
      const active = window.value?.active ?? false;
      return ` ${active ? "◆" : "◇"} ${WINDOW_TITLES[windowId]} `;
    }),
    rectangle: new Computed<TextRectangle>(() => {
      const projected = window.value;
      const rect = projected?.titleBarRect ?? emptyRect();
      const column = rect.column + Math.min(1, rect.width);
      const firstControl = projected?.controls.reduce(
        (minimum, control) => Math.min(minimum, control.rect.column),
        rect.column + rect.width,
      ) ?? rect.column + rect.width;
      return { column, row: rect.row, width: Math.max(0, firstControl - column) };
    }),
    visible,
  });
  for (const kind of ["always-on-top", "minimize", "maximize", "restore", "close"] as const) {
    const control = own(new Computed(() => window.value?.controls.find((candidate) => candidate.kind === kind)));
    const controlVisibleSource = own(
      new Computed(() => {
        const windowVisible = visible.value;
        const projectedControl = control.value;
        return windowVisible && projectedControl !== undefined;
      }),
    );
    const controlVisible = mirrorBoolean(controlVisibleSource, own, signal);
    new Text({
      parent: app.tui,
      theme: LABEL_THEME,
      zIndex: overlayZIndex,
      text: new Computed(() => control.value?.text ?? ""),
      overwriteWidth: true,
      rectangle: new Computed<TextRectangle>(() => {
        const rect = control.value?.rect ?? emptyRect();
        return { column: rect.column, row: rect.row, width: rect.width };
      }),
      visible: controlVisible,
    });
  }
  return { window, visible, content, contentZIndex, overlayZIndex, chromeZIndex };
}

function registerInkstoneWindowMouseTargets(
  app: TerminalApp<InkstoneAppAction>,
  projection: Computed<WorkbenchWindowHostProjection>,
  shelfBounds: Computed<Rectangle>,
  route: (event: MousePressEvent) => { handled: boolean },
  syncActiveWindowSurface: () => void,
): Array<() => void> {
  const disposers: Array<() => void> = [];
  const routeOnly = (event: MousePressEvent): boolean => route(event).handled;
  const routeAndFocus = (event: MousePressEvent): boolean => {
    const result = route(event);
    if (result.handled) syncActiveWindowSurface();
    return result.handled;
  };
  for (const windowId of ["vault", "editor", "preview", "inspector"] as const) {
    const projected = () => projection.peek().windows.find((window) => window.id === windowId);
    disposers.push(app.mouse.register({
      id: `inkstone-window-${windowId}-titlebar`,
      bounds: () => projected()?.titleBarRect ?? emptyRect(),
      zIndex: () => inkstoneWindowBaseZ(projected()) + 8,
      disabled: () => projected() === undefined,
      captureDrag: true,
      onPress: routeAndFocus,
      onDrag: routeOnly,
      onRelease: routeOnly,
    }));
    for (const edge of ["left", "right", "bottom"] as const) {
      disposers.push(app.mouse.register({
        id: `inkstone-window-${windowId}-${edge}`,
        bounds: () => floatingWindowEdgeRect(projected(), edge),
        zIndex: () => inkstoneWindowBaseZ(projected()) + 9,
        disabled: () => projected()?.placement !== "floating",
        captureDrag: true,
        onPress: routeAndFocus,
        onDrag: routeOnly,
        onRelease: routeOnly,
      }));
    }
  }
  for (let index = 0; index < 3; index += 1) {
    disposers.push(app.mouse.register({
      id: `inkstone-window-separator-${index}`,
      bounds: () => projection.peek().separators[index]?.hitRect ?? emptyRect(),
      zIndex: 900,
      disabled: () => projection.peek().separators[index] === undefined,
      captureDrag: true,
      onPress: routeOnly,
      onDrag: routeOnly,
      onRelease: routeOnly,
    }));
  }
  disposers.push(app.mouse.register({
    id: "inkstone-window-shelf",
    bounds: () => shelfBounds.peek(),
    zIndex: 3_001,
    disabled: () => projection.peek().shelf.length === 0,
    captureDrag: false,
    onPress: routeAndFocus,
  }));
  return disposers;
}

interface InkstoneContentMouseSurfaces {
  readonly explorer: Tree;
  readonly tabs: Tabs;
  readonly preview: Markdown;
  readonly outline: List;
  readonly backlinks: List;
  readonly search: List;
  readonly diagnostics: List;
}

function registerInkstoneContentMouseTargets(
  app: TerminalApp<InkstoneAppAction>,
  surfaces: InkstoneContentMouseSurfaces,
): Array<() => void> {
  const disposers: Array<() => void> = [];
  const focus = (component: Component): boolean => {
    if (!component.visible.peek() || !app.focus.items.includes(component)) return false;
    app.focus.focus(component);
    return true;
  };
  disposers.push(app.mouse.register({
    id: "inkstone-vault-explorer-rows",
    bounds: () => surfaces.explorer.rectangle.peek(),
    zIndex: () => surfaces.explorer.zIndex.peek(),
    disabled: () => !surfaces.explorer.visible.peek(),
    captureDrag: false,
    onPress: (event, context) => {
      if (event.button !== 0 || !focus(surfaces.explorer)) return false;
      const height = surfaces.explorer.rectangle.peek().height;
      const inspection = surfaces.explorer.controller.inspect(height);
      const index = inspection.window.start + Math.floor(context.localY);
      if (index < inspection.window.start || index >= inspection.window.end) return false;
      surfaces.explorer.controller.setSelectedIndex(index);
      surfaces.explorer.controller.selectActive();
      return true;
    },
  }));
  disposers.push(app.mouse.register({
    id: "inkstone-editor-tab-items",
    bounds: () => surfaces.tabs.rectangle.peek(),
    zIndex: () => surfaces.tabs.zIndex.peek(),
    disabled: () => !surfaces.tabs.visible.peek(),
    captureDrag: false,
    onPress: (event, context) => {
      if (event.button !== 0 || !focus(surfaces.tabs)) return false;
      const index = tabIndexAtColumn(surfaces.tabs, Math.floor(context.localX));
      if (index === undefined) return false;
      surfaces.tabs.controller.setActive(index);
      return true;
    },
  }));
  disposers.push(app.mouse.register({
    id: "inkstone-preview-content",
    bounds: () => surfaces.preview.rectangle.peek(),
    zIndex: () => surfaces.preview.zIndex.peek(),
    disabled: () => !surfaces.preview.visible.peek(),
    captureDrag: false,
    onPress: (event) => event.button === 0 && focus(surfaces.preview),
  }));
  for (
    const [id, list] of [
      ["outline", surfaces.outline],
      ["backlinks", surfaces.backlinks],
      ["search", surfaces.search],
      ["diagnostics", surfaces.diagnostics],
    ] as const
  ) {
    disposers.push(app.mouse.register({
      id: `inkstone-inspector-${id}-rows`,
      bounds: () => list.rectangle.peek(),
      zIndex: () => list.zIndex.peek(),
      disabled: () => !list.visible.peek(),
      captureDrag: false,
      onPress: (event, context) => {
        if (event.button !== 0 || !focus(list)) return false;
        const height = list.rectangle.peek().height;
        const inspection = list.controller.inspect(height);
        const index = inspection.window.start + Math.floor(context.localY);
        if (index < inspection.window.start || index >= inspection.window.end) return false;
        list.controller.setSelectedIndex(index);
        list.controller.selectActive();
        return true;
      },
    }));
  }
  return disposers;
}

function tabIndexAtColumn(tabs: Tabs, column: number): number | undefined {
  if (!Number.isFinite(column) || column < 0) return undefined;
  const items = tabs.tabs.peek();
  let start = 0;
  for (let index = 0; index < items.length; index += 1) {
    const width = textWidth(items[index]!.label) + 2;
    if (column >= start && column < start + width) return index;
    start += width + 1;
  }
  return undefined;
}

function floatingWindowEdgeRect(
  window: WorkbenchWindowChromeProjection | undefined,
  edge: "left" | "right" | "bottom",
): Rectangle {
  if (!window || window.placement !== "floating" || window.rect.width <= 0 || window.rect.height <= 0) {
    return emptyRect();
  }
  if (edge === "left") {
    return { column: window.rect.column, row: window.rect.row, width: 1, height: window.rect.height };
  }
  if (edge === "right") {
    return {
      column: window.rect.column + window.rect.width - 1,
      row: window.rect.row,
      width: 1,
      height: window.rect.height,
    };
  }
  return {
    column: window.rect.column,
    row: window.rect.row + window.rect.height - 1,
    width: window.rect.width,
    height: 1,
  };
}

type InspectorPanelId = "outline" | "backlinks" | "search" | "diagnostics";

interface InspectorListSurface {
  readonly list: List;
}

function visibleInspectorPanels(
  breakpoint: InkstoneTerminalBreakpoint,
  routeId: string,
): readonly InspectorPanelId[] {
  if (breakpoint === "wide") return ["outline", "backlinks", "search", "diagnostics"];
  if (routeId === "search") return ["search"];
  if (routeId === "diagnostics") return ["diagnostics"];
  return ["outline", "backlinks"];
}

function createInspectorList(
  app: TerminalApp<InkstoneAppAction>,
  pane: PaneChrome,
  panels: Computed<readonly InspectorPanelId[]>,
  panelId: InspectorPanelId,
  title: string,
  controller: ListController,
  own: OwnDisposable,
  signal: AbortSignal,
): InspectorListSurface {
  const visibleSource = own(
    new Computed(() => {
      const paneVisible = pane.visible.value;
      const panelVisible = panels.value.includes(panelId);
      return paneVisible && panelVisible;
    }),
  );
  const visible = mirrorBoolean(visibleSource, own, signal);
  const slot = own(new Computed(() => inspectorSlot(pane.content.value, panels.value, panelId)));
  new Text({
    parent: app.tui,
    theme: MUTED_THEME,
    zIndex: pane.overlayZIndex,
    text: ` ${title}`,
    overwriteWidth: true,
    rectangle: new Computed<TextRectangle>(() => ({
      column: slot.value.column,
      row: slot.value.row,
      width: slot.value.width,
    })),
    visible,
  });
  const list = new List({
    parent: app.tui,
    theme: PANEL_THEME,
    zIndex: pane.contentZIndex,
    controller,
    items: controller.items,
    selectedIndex: controller.selectedIndex,
    rectangle: new Computed(() => ({
      column: slot.value.column,
      row: slot.value.row + 1,
      width: slot.value.width,
      height: Math.max(0, slot.value.height - 1),
    })),
    visible,
  });
  return { list };
}

function mirrorBoolean(
  source: Computed<boolean>,
  own: OwnDisposable,
  signal: AbortSignal,
): Signal<boolean> {
  const mirrored = own(new Signal(source.peek()));
  source.subscribe((value) => {
    mirrored.value = value;
  }, signal);
  return mirrored;
}

function inspectorSlot(
  content: Rectangle,
  panels: readonly InspectorPanelId[],
  panelId: InspectorPanelId,
): Rectangle {
  const index = panels.indexOf(panelId);
  if (index < 0 || panels.length === 0) return emptyRect();
  const baseHeight = Math.floor(content.height / panels.length);
  const row = content.row + baseHeight * index;
  const height = index === panels.length - 1 ? Math.max(0, content.row + content.height - row) : baseHeight;
  return { column: content.column, row, width: content.width, height };
}

function emptyRect(): Rectangle {
  return { column: 0, row: 0, width: 0, height: 0 };
}

function insetWindowRect(rect: Rectangle): Rectangle {
  return {
    column: rect.column + Math.min(1, rect.width),
    row: rect.row + Math.min(1, rect.height),
    width: Math.max(0, rect.width - 2),
    height: Math.max(0, rect.height - 2),
  };
}

function centeredWindowRect(bounds: Rectangle, requestedWidth: number, requestedHeight: number): Rectangle {
  const width = Math.min(Math.max(1, requestedWidth), bounds.width);
  const height = Math.min(Math.max(1, requestedHeight), bounds.height);
  return {
    column: bounds.column + Math.floor((bounds.width - width) / 2),
    row: bounds.row + Math.floor((bounds.height - height) / 2),
    width,
    height,
  };
}

function inkstoneWindowBaseZ(window: WorkbenchWindowChromeProjection | undefined): number {
  if (!window) return 0;
  if (window.placement === "tiled") return 20 + window.zIndex * 10;
  return (window.alwaysOnTop ? 2_000 : 1_000) + window.zIndex * 10;
}

function routeMenuIndex(routeId: string): number {
  if (routeId === "vault") return 0;
  if (routeId === "note") return 1;
  if (routeId === "search") return 2;
  if (routeId === "diagnostics") return 3;
  return 0;
}

function routeTitle(controller: InkstoneController, routeId: string): string {
  return controller.kernel.manifest.routes.find((route: ShowcaseRouteManifest) => route.id === routeId)?.title ??
    routeId;
}

function diagnosticLabels(entries: readonly DiagnosticEntry[]): string[] {
  if (entries.length === 0) return ["✓ no diagnostics"];
  return entries.map((entry) => `${entry.severity.toUpperCase()} ${entry.code}: ${entry.message}`);
}

function inkstoneStatusLeft(controller: InkstoneController): string {
  controller.status.value;
  controller.tabs.tabs.value;
  const dirtyCount = controller.dirtyNoteIds.value.length;
  const title = controller.tabs.active()?.label.replace(/ \*$/, "") ?? "No note";
  const dirty = dirtyCount > 0 ? ` · ${dirtyCount} modified` : " · saved";
  return ` ${controller.status.peek().toUpperCase()} · ${title}${dirty}`;
}

function inkstoneStatusRight(
  controller: InkstoneController,
  breakpoint: InkstoneTerminalBreakpoint,
): string {
  const lineCount = controller.editor.lines.value.length;
  const searchResultCount = controller.searchResults.value.length;
  const persistenceStatus = controller.kernel.persistenceStatus.value;
  return `${lineCount} lines · ${searchResultCount} matches · ${breakpoint} · ${controller.storageMode}/${persistenceStatus} `;
}

function formatEditorFindResult(result: InkstoneEditorFindResult): string {
  if (result.status === "empty") return "Type a literal query";
  if (result.status === "limited") return "Query exceeds 512 characters";
  if (result.status === "not-found") return "No matches";
  return `${result.matchIndex + 1}/${result.matchCount}${result.wrapped ? " · wrapped" : ""}`;
}

function formatEditorReplaceResult(result: InkstoneEditorReplaceResult, all: boolean): string {
  if (result.replacements === 0) return result.truncated ? "Replacement exceeds editor limits" : "No match replaced";
  const label = all ? `${result.replacements} replaced` : "1 replaced";
  const remaining = result.remainingMatches > 0 ? ` · ${result.remainingMatches} remain` : " · done";
  return `${label}${remaining}${result.truncated ? " · capped" : ""}`;
}

function openSearchResultAt(controller: InkstoneController, index: number): void {
  const selected = controller.searchResults.peek()[index];
  if (selected) void controller.openNote(selected.noteId);
}

function insertEditorPaste(controller: InkstoneController, text: string): void {
  const normalized = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  controller.editor.insertText(normalized);
}

function routeFocusCandidate(
  routeId: string,
  surfaces: {
    editor: Component;
    explorer: Component;
    diagnostics: Component;
    searchInput: Component;
  },
): Component {
  if (routeId === "vault") return surfaces.explorer;
  if (routeId === "search") return surfaces.searchInput;
  if (routeId === "diagnostics") return surfaces.diagnostics;
  return surfaces.editor;
}

interface InkstoneWindowFocusSurfaces {
  explorer: Component;
  tabs: Component;
  editor: Component;
  preview: Component;
  outline: Component;
  backlinks: Component;
  search: Component;
  diagnostics: Component;
}

function windowFocusCandidates(
  windowId: InkstoneWindowId,
  routeId: string,
  surfaces: InkstoneWindowFocusSurfaces,
): Component[] {
  if (windowId === "vault") return [surfaces.explorer];
  if (windowId === "editor") return [surfaces.editor, surfaces.tabs];
  if (windowId === "preview") return [surfaces.preview];
  if (routeId === "diagnostics") {
    return [surfaces.diagnostics, surfaces.outline, surfaces.backlinks, surfaces.search];
  }
  if (routeId === "search") {
    return [surfaces.search, surfaces.outline, surfaces.backlinks, surfaces.diagnostics];
  }
  return [surfaces.outline, surfaces.backlinks, surfaces.search, surfaces.diagnostics];
}

function showSaveToast(toasts: ToastStackController, result: InkstoneSaveResult): void {
  if (result.status === "saved") {
    toasts.show(`Saved revision ${result.revision}`, "success");
  } else if (result.status === "clean") {
    toasts.show("Active note is already saved", "info");
  } else if (result.status === "conflict") {
    toasts.show("Save conflict — fixture revision changed", "warning");
  } else if (result.status === "no-active-note") {
    toasts.show("No active note to save", "warning");
  } else {
    toasts.show("Save failed; diagnostics updated", "error");
  }
}

let toastSequence = 0;

function deterministicToastId(): string {
  toastSequence += 1;
  return `inkstone-toast-${toastSequence}`;
}
