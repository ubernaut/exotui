// Copyright 2023 Im-Beast. MIT license.
/**
 * Focused terminal application API with an opinionated lifecycle and curated widgets.
 *
 * @module
 */

export { createTerminalApp, TerminalApp } from "./src/app/terminal_app.ts";
export type {
  TerminalAppBindings,
  TerminalAppComponentOptions,
  TerminalAppInputOptions,
  TerminalAppOptions,
} from "./src/app/terminal_app.ts";
export { createAppPlugin } from "./src/app/plugins.ts";
export type { AppPluginDefinition } from "./src/app/plugins.ts";
export type { Action, ActionHandler, ActionMiddleware } from "./src/app/actions.ts";
export type { Command } from "./src/app/commands.ts";
export type { Route } from "./src/app/router.ts";

export { Computed, Effect, Signal } from "./src/signals/mod.ts";
export type { SignalOfObject } from "./src/signals/mod.ts";
export { createThemeEngine, ThemeEngine } from "./src/theme.ts";
export { Tui } from "./src/tui.ts";
export type { TuiOptions } from "./src/tui.ts";
export type { Rectangle } from "./src/types.ts";
export { WidgetSurface, widgetSurfaceCellData } from "./src/app/widget_surface.ts";
export type { WidgetSurfaceCell, WidgetSurfaceCellData } from "./src/app/widget_surface.ts";

export { GridLayout } from "./src/layout/grid_layout.ts";
export { HorizontalLayout } from "./src/layout/horizontal_layout.ts";
export { SplitPaneController } from "./src/layout/split_pane.ts";
export { createTiledWorkspaceController, TiledWorkspaceController } from "./src/layout/tiled_workspace.ts";
export type { TiledWorkspaceControllerOptions } from "./src/layout/tiled_workspace.ts";
export { VerticalLayout } from "./src/layout/vertical_layout.ts";

export {
  createWorkbenchWindowHostController,
  createWorkbenchWindowHostRoot,
  WorkbenchWindowHostController,
} from "./src/app/workbench_window_host.ts";
export type {
  WorkbenchWindowChromeControl,
  WorkbenchWindowChromeProjection,
  WorkbenchWindowHostCommand,
  WorkbenchWindowHostControllerOptions,
  WorkbenchWindowHostDescriptor,
  WorkbenchWindowHostInspection,
  WorkbenchWindowHostProjection,
  WorkbenchWindowHostProjectionOptions,
  WorkbenchWindowHostResult,
  WorkbenchWindowSemanticNode,
  WorkbenchWindowSeparatorProjection,
  WorkbenchWindowShelfItem,
  WorkbenchWindowSnapPreview,
  WorkbenchWindowSwitcherProjection,
} from "./src/app/workbench_window_host.ts";

export { Box } from "./src/components/box.ts";
export { Button } from "./src/components/button.ts";
export { CheckBox } from "./src/components/checkbox.ts";
export { ComboBox } from "./src/components/combobox.ts";
export { CommandPalette } from "./src/components/command_palette.ts";
export { ContextMenu } from "./src/components/context_menu.ts";
export { Frame } from "./src/components/frame.ts";
export { Input } from "./src/components/input.ts";
export { Label } from "./src/components/label.ts";
export { List } from "./src/components/list.ts";
export { Modal } from "./src/components/modal.ts";
export {
  defaultMarkdownStyles,
  formatMarkdownRenderLine,
  Markdown,
  MarkdownController,
} from "./src/components/markdown.ts";
export type {
  MarkdownControllerOptions,
  MarkdownInspection,
  MarkdownOptions,
  MarkdownStyleKey,
  MarkdownStyles,
} from "./src/components/markdown.ts";
export { markdownRenderText, parseMarkdown, renderMarkdown } from "./src/content/markdown.ts";
export type {
  MarkdownBlock,
  MarkdownBlockKind,
  MarkdownDocument,
  MarkdownInlineMark,
  MarkdownInlineSpan,
  MarkdownParseOptions,
  MarkdownRenderLine,
  MarkdownRenderOptions,
  MarkdownRenderRole,
  MarkdownRenderSegment,
  MarkdownTableCell,
} from "./src/content/markdown.ts";
export { ProgressBar } from "./src/components/progressbar.ts";
export { RadioGroup } from "./src/components/radio_group.ts";
export { ScrollArea } from "./src/components/scroll_area.ts";
export { Slider } from "./src/components/slider.ts";
export { Spinner } from "./src/components/spinner.ts";
export { StatusBar } from "./src/components/statusbar.ts";
export { Table } from "./src/components/table.ts";
export { Tabs } from "./src/components/tabs.ts";
export { Text } from "./src/components/text.ts";
export { TextBox } from "./src/components/textbox.ts";
export { ToastStack } from "./src/components/toast.ts";
export { Tree } from "./src/components/tree.ts";
export { VirtualList } from "./src/components/virtual_list.ts";
