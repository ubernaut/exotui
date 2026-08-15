import { assertEquals, assertThrows } from "./deps.ts";
import { commandDisabled } from "./test_commands.ts";
import { bindInputCommands, inputCommands } from "../src/app/input_commands.ts";
import { bindListCommands, listCommands } from "../src/app/list_commands.ts";
import { bindMenuBarCommands, menuBarCommands } from "../src/app/menu_bar_commands.ts";
import { bindPadCommands, padCommands } from "../src/app/pad_commands.ts";
import { bindScrollAreaCommands, scrollAreaCommands } from "../src/app/scroll_area_commands.ts";
import { CommandRegistry } from "../src/app/commands.ts";
import { bindTableCommands, tableCommands } from "../src/app/table_commands.ts";
import { bindTabsCommands, tabsCommands } from "../src/app/tabs_commands.ts";
import { bindTreeCommands, treeCommands } from "../src/app/tree_commands.ts";
import {
  bindButtonCommands,
  bindCheckBoxCommands,
  bindComboBoxCommands,
  bindProgressBarCommands,
  bindRadioGroupCommands,
  bindSliderCommands,
  bindStepperCommands,
  bindTextBoxCommands,
  buttonCommands,
  checkBoxCommands,
  comboBoxCommands,
  progressBarCommands,
  radioGroupCommands,
  sliderCommands,
  stepperCommands,
  textBoxCommands,
} from "../src/app/widget_commands.ts";
import { formatKeyBinding, KeymapRegistry } from "../src/keymap.ts";
import { renderBreadcrumbs } from "../src/components/breadcrumbs.ts";
import { ButtonController } from "../src/components/button.ts";
import { CheckBoxController, Mark, renderCheckBoxMark } from "../src/components/checkbox.ts";
import { ComboBoxController, comboBoxLabel } from "../src/components/combobox.ts";
import { renderEmptyState } from "../src/components/empty_state.ts";
import { createFileExplorerTree, FileExplorerController } from "../src/components/file_explorer.ts";
import { Gauge } from "../src/components/gauge.ts";
import { InputController } from "../src/components/input.ts";
import { hitTestWidgetRegions, stackedRowHitRegions, stackedRowIndexAt } from "../src/components/interaction.ts";
import { labelLineLayout } from "../src/components/label.ts";
import { renderKeyHelp } from "../src/components/key_help.ts";
import { ListController, virtualRows, visibleListRows, visibleListRowsInto } from "../src/components/list.ts";
import {
  clampMenuIndex,
  MenuBarController,
  menuItemForIndex,
  renderMenuBar,
  shiftMenuIndex,
} from "../src/components/menu_bar.ts";
import { Modal, ModalController, renderModalRows } from "../src/components/modal.ts";
import { clampPadCursor, measurePadContent, PadController, renderPadRows } from "../src/components/pad.ts";
import {
  clampProgressValue,
  ProgressBarController,
  progressRatio,
  progressRectangle,
  progressSmoothLine,
} from "../src/components/progressbar.ts";
import {
  clampRadioIndex,
  optionForValue,
  RadioGroupController,
  renderRadioGroupRows,
  shiftRadioIndex,
  visibleRadioOptions,
} from "../src/components/radio_group.ts";
import {
  clampScrollOffset,
  maxScrollOffset,
  ScrollArea,
  ScrollAreaController,
  scrollbarGlyph,
  scrollbarOffsetForPointer,
  scrollbarThumb,
  scrollOffsetBy,
} from "../src/components/scroll_area.ts";
import { renderStatusBar } from "../src/components/statusbar.ts";
import type { Text } from "../src/components/text.ts";
import {
  clampSliderValue,
  SliderController,
  sliderThumbRectangle,
  sliderValueAt,
  sliderValueBy,
  snapSliderValue,
} from "../src/components/slider.ts";
import { renderSpinner, spinnerGlyph } from "../src/components/spinner.ts";
import {
  clampStepperIndex,
  renderStepper,
  shiftStepperIndex,
  stepForIndex,
  StepperController,
} from "../src/components/stepper.ts";
import {
  clampTableRow,
  tableAutoColumnWidths,
  TableController,
  tableMaxOffset,
  tableVisibleCapacity,
} from "../src/components/table.ts";
import { clampTabIndex, renderTabs, shiftTabIndex, tabForIndex, TabsController } from "../src/components/tabs.ts";
import {
  type CursorPosition,
  TextBox,
  TextBoxController,
  textBoxVisualCursor,
  TextLineCache,
  wrapTextBoxLines,
  wrapTextBoxLinesInto,
} from "../src/components/textbox.ts";
import { flattenTree, flattenTreeRows, TreeController } from "../src/components/tree.ts";
import {
  renderVirtualListRows,
  renderVirtualListRowsInto,
  VirtualListController,
  virtualListRows,
} from "../src/components/virtual_list.ts";
import type { Key, KeyPressEvent } from "../src/input_reader/types.ts";
import { Signal } from "../src/signals/mod.ts";
import type { Component } from "../src/component.ts";
import type { Tui } from "../src/tui.ts";
import { graphemeBoundaries } from "../src/unicode/grapheme.ts";
import { createTestTerminalApp } from "../mod.testing.ts";

Deno.test("visibleListRows centers the selected item when space allows", () => {
  assertEquals(visibleListRows(["alpha", "beta", "gamma", "delta"], 2, 3), [
    "  beta",
    "> gamma",
    "  delta",
  ]);
  const buffer = ["stale", "rows"];
  assertEquals(visibleListRowsInto(buffer, ["alpha", "beta", "gamma", "delta"], 2, 3), [
    "  beta",
    "> gamma",
    "  delta",
  ]);
  assertEquals(visibleListRowsInto(buffer, ["alpha"], 0, 2), buffer);
  assertEquals(buffer, ["> alpha"]);
});

Deno.test("shared widget hit helpers map stacked rows and z-ordered regions", () => {
  assertEquals(stackedRowIndexAt(7, 5, 3), 2);
  assertEquals(stackedRowIndexAt(8, 5, 3), undefined);

  const regions = stackedRowHitRegions(
    { column: 4, row: 2, width: 12, height: 3 },
    ["alpha", "beta", "gamma"],
    { idPrefix: "option", disabled: (row) => row === "beta" },
  );

  assertEquals(regions.map((region) => [region.id, region.bounds.row, region.disabled]), [
    ["option-0", 2, false],
    ["option-1", 3, true],
    ["option-2", 4, false],
  ]);
  assertEquals(hitTestWidgetRegions(regions, { column: 5, row: 3 }), undefined);
  assertEquals(hitTestWidgetRegions(regions, { column: 5, row: 4 })?.region.payload, "gamma");
  assertEquals(
    hitTestWidgetRegions([
      { id: "low", zIndex: 1, bounds: { column: 0, row: 0, width: 5, height: 1 } },
      { id: "alpha", zIndex: 3, bounds: { column: 0, row: 0, width: 5, height: 1 } },
      { id: "omega", zIndex: 3, bounds: { column: 0, row: 0, width: 5, height: 1 } },
    ], { column: 1, row: 0 })?.region.id,
    "omega",
  );
});

Deno.test("labelLineLayout crops and aligns text inside fixed rectangles", () => {
  assertEquals(
    labelLineLayout(["abcdef"], { column: 10, row: 2, width: 4, height: 1 }, {
      horizontal: "right",
      vertical: "top",
    }),
    [
      {
        sourceIndex: 0,
        value: "abcd",
        rectangle: { column: 10, row: 2, width: 4 },
      },
    ],
  );
  assertEquals(
    labelLineLayout(["hi"], { column: 10, row: 2, width: 6, height: 1 }, {
      horizontal: "center",
      vertical: "top",
    }),
    [
      {
        sourceIndex: 0,
        value: "hi",
        rectangle: { column: 12, row: 2, width: 2 },
      },
    ],
  );
});

Deno.test("labelLineLayout clips vertical overflow according to alignment", () => {
  const lines = ["one", "two", "three", "four"];
  assertEquals(
    labelLineLayout(lines, { column: 0, row: 5, width: 5, height: 2 }, {
      horizontal: "left",
      vertical: "top",
    }).map((line) => [line.sourceIndex, line.value, line.rectangle.row]),
    [
      [0, "one", 5],
      [1, "two", 6],
    ],
  );
  assertEquals(
    labelLineLayout(lines, { column: 0, row: 5, width: 5, height: 2 }, {
      horizontal: "left",
      vertical: "bottom",
    }).map((line) => [line.sourceIndex, line.value, line.rectangle.row]),
    [
      [2, "three", 5],
      [3, "four", 6],
    ],
  );
  assertEquals(labelLineLayout(lines, { column: 0, row: 0, width: 0, height: 2 }), []);
});

Deno.test("ButtonController tracks presses disabled state and inspection", () => {
  const presses: number[] = [];
  const controller = new ButtonController({
    label: "Save",
    disabled: false,
    onPress: (inspection) => void presses.push(inspection.pressCount),
  });

  assertEquals(controller.inspect(), {
    label: "Save",
    disabled: false,
    pressCount: 0,
    lastPressedAt: undefined,
    lastMethod: undefined,
  });
  assertEquals(controller.press("keyboard", 123), true);
  assertEquals(controller.inspect(), {
    label: "Save",
    disabled: false,
    pressCount: 1,
    lastPressedAt: 123,
    lastMethod: "keyboard",
  });
  assertEquals(presses, [1]);

  controller.disable();
  assertEquals(controller.press("mouse", 456), false);
  assertEquals(controller.inspect().pressCount, 1);
  controller.setLabel("Deploy");
  assertEquals(controller.inspect().label, "Deploy");
  controller.dispose();
});

Deno.test("buttonCommands press and change disabled state", async () => {
  const controller = new ButtonController({ label: "Run" });
  const registry = new CommandRegistry();
  const dispose = bindButtonCommands(registry, controller, {
    id: "run",
    idPrefix: "button.run",
    group: "actions",
  });
  const actions: unknown[] = [];

  assertEquals(buttonCommands(controller).map((command) => [command.id, commandDisabled(command)]), [
    ["button.press", false],
    ["button.enable", true],
    ["button.disable", false],
  ]);
  assertEquals(registry.list("actions").map((command) => command.id), [
    "button.run.disable",
    "button.run.enable",
    "button.run.press",
  ]);

  assertEquals(await registry.execute("button.run.press", (action) => void actions.push(action)), true);
  assertEquals(controller.inspect().pressCount, 1);
  assertEquals(actions[0], {
    type: "button.pressed",
    payload: {
      id: "run",
      inspection: {
        label: "Run",
        disabled: false,
        pressCount: 1,
        lastPressedAt: controller.inspect().lastPressedAt,
        lastMethod: undefined,
      },
    },
  });

  assertEquals(await registry.execute("button.run.disable", (action) => void actions.push(action)), true);
  assertEquals(controller.disabled.peek(), true);
  assertEquals(await registry.execute("button.run.press", (action) => void actions.push(action)), false);
  assertEquals(actions.length, 2);

  dispose();
  assertEquals(registry.list("actions"), []);
  controller.dispose();
});

Deno.test("InputController edits text validates characters and inspects state", () => {
  const changes: string[] = [];
  const submissions: string[] = [];
  const controller = new InputController({
    text: "ab",
    cursorPosition: 1,
    validator: /[a-z ]/,
    placeholder: "name",
    onChange: (value) => void changes.push(value),
    onSubmit: (value) => void submissions.push(value),
  });

  assertEquals(controller.insert("X"), false);
  assertEquals(controller.handleKeyPress(keyPress("space")), "changed");
  assertEquals(controller.inspect(), {
    text: "a b",
    cursorPosition: 2,
    length: 3,
    empty: false,
    password: false,
    placeholder: "name",
    valid: true,
  });

  assertEquals(controller.handleKeyPress(keyPress("right")), "moved");
  assertEquals(controller.handleKeyPress(keyPress("backspace")), "changed");
  assertEquals(controller.text.peek(), "a ");
  assertEquals(controller.cursorPosition.peek(), 2);
  controller.setText("abc", 99);
  assertEquals(controller.cursorPosition.peek(), 3);
  controller.handleKeyPress(keyPress("return"));
  assertEquals(submissions, ["abc"]);
  assertEquals(changes, ["a b", "a ", "abc"]);
  controller.dispose();
});

Deno.test("InputController keeps UTF-16 cursor offsets on extended-grapheme boundaries", () => {
  const value = "A😀e\u0301Z";
  const controller = new InputController({
    text: value,
    cursorPosition: 2,
    multiCodePointSupport: true,
  });

  assertEquals(controller.cursorPosition.peek(), 1);
  assertEquals(controller.moveCursor(1), 3);
  assertEquals(controller.moveCursor(1), 5);
  assertEquals(controller.moveCursor(-1), 3);
  assertEquals(controller.delete(), true);
  assertEquals(controller.text.peek(), "A😀Z");
  assertEquals(controller.cursorPosition.peek(), 3);

  controller.setText(value, 5);
  assertEquals(controller.backspace(), true);
  assertEquals(controller.text.peek(), "A😀Z");
  assertEquals(controller.cursorPosition.peek(), 3);
  assertEquals(controller.accepts("e\u0301"), true);
  assertEquals(controller.accepts("👩‍👩"), true);
  assertEquals(controller.accepts("ab"), false);
  controller.dispose();

  const cursor = new Signal(2);
  const external = new InputController({ text: value, cursorPosition: cursor, multiCodePointSupport: true });
  assertEquals(cursor.peek(), 1);
  cursor.value = 4;
  assertEquals(cursor.peek(), 3);
  external.dispose();

  const singleCodePoint = new InputController();
  assertEquals(singleCodePoint.accepts("é"), true);
  assertEquals(singleCodePoint.accepts("e\u0301"), false);
  assertEquals(singleCodePoint.accepts("😀"), false);
  singleCodePoint.dispose();

  const validated = new InputController({
    text: "e\u0301e\u0301",
    validator: /^e\u0301$/,
    multiCodePointSupport: true,
  });
  assertEquals(validated.inspect().valid, true);
  validated.dispose();
});

Deno.test("inputCommands submit clear move cursor and set preset values", async () => {
  const controller = new InputController({ text: "run", cursorPosition: 1 });
  const registry = new CommandRegistry();
  const dispose = bindInputCommands(registry, controller, {
    id: "query",
    idPrefix: "input.query",
    group: "search",
    includeValueCommands: true,
    values: ["run", "deploy"],
  });
  const actions: unknown[] = [];

  assertEquals(inputCommands(new InputController()).map((command) => [command.id, commandDisabled(command)]), [
    ["input.submit", undefined],
    ["input.clear", true],
    ["input.home", true],
    ["input.left", true],
    ["input.right", true],
    ["input.end", true],
  ]);
  assertEquals(registry.list("search").map((command) => command.id), [
    "input.query.clear",
    "input.query.end",
    "input.query.home",
    "input.query.left",
    "input.query.right",
    "input.query.value.deploy",
    "input.query.value.run",
    "input.query.submit",
  ]);

  assertEquals(await registry.execute("input.query.right", (action) => void actions.push(action)), true);
  assertEquals(controller.cursorPosition.peek(), 2);
  assertEquals(actions[0], {
    type: "input.cursorMoved",
    payload: { id: "query", inspection: controller.inspect() },
  });

  assertEquals(await registry.execute("input.query.value.deploy", (action) => void actions.push(action)), true);
  assertEquals(controller.text.peek(), "deploy");
  assertEquals(await registry.execute("input.query.submit", (action) => void actions.push(action)), true);
  assertEquals(actions[2], {
    type: "input.submitted",
    payload: { id: "query", inspection: controller.inspect(), value: "deploy" },
  });
  assertEquals(await registry.execute("input.query.clear", (action) => void actions.push(action)), true);
  assertEquals(controller.inspect().empty, true);

  dispose();
  assertEquals(registry.list("search"), []);
  controller.dispose();
});

Deno.test("virtualRows exposes source indices for large lists", () => {
  assertEquals(virtualRows(["a", "b", "c", "d", "e"], 3, 3), [
    { item: "c", index: 2, selected: false },
    { item: "d", index: 3, selected: true },
    { item: "e", index: 4, selected: false },
  ]);
});

Deno.test("ListController navigates selects and inspects visible rows", () => {
  const selections: string[] = [];
  const selectedIndex = new Signal(1);
  const controller = new ListController({
    items: ["alpha", "beta", "gamma", "delta"],
    selectedIndex,
    onSelect: (item) => void selections.push(item),
  });

  assertEquals(controller.rows(3), ["  alpha", "> beta", "  gamma"]);
  controller.handleKeyPress(keyPress("down"), 3);
  controller.handleKeyPress(keyPress("pagedown"), 3);
  assertEquals(controller.inspect(2), {
    items: ["alpha", "beta", "gamma", "delta"],
    itemCount: 4,
    selectedIndex: 3,
    selected: "delta",
    window: { start: 2, end: 4 },
    empty: false,
  });
  assertEquals(controller.handleKeyPress(keyPress("return"), 2), "delta");
  assertEquals(selections, ["delta"]);
  controller.items.value = ["alpha"];
  assertEquals(selectedIndex.peek(), 0);
  controller.dispose();
  selectedIndex.dispose();
});

Deno.test("listCommands move and select items", async () => {
  const controller = new ListController({ items: ["alpha", "beta", "gamma"] });
  const registry = new CommandRegistry();
  const actions: unknown[] = [];
  const dispose = bindListCommands(registry, controller, {
    id: "files",
    idPrefix: "list.files",
    group: "list",
    includeItemCommands: true,
  });
  const emptyController = new ListController({ items: [] });

  assertEquals(listCommands(emptyController).map((command) => command.id), [
    "list.first",
    "list.previous",
    "list.next",
    "list.last",
    "list.select",
  ]);
  assertEquals(registry.list("list").map((command) => command.id), [
    "list.files.first",
    "list.files.last",
    "list.files.next",
    "list.files.previous",
    "list.files.select",
    "list.files.item.0",
    "list.files.item.1",
    "list.files.item.2",
  ]);

  assertEquals(await registry.execute("list.files.next", (action) => void actions.push(action)), true);
  assertEquals(controller.selected(), "beta");
  assertEquals(actions.at(-1), {
    type: "list.changed",
    payload: {
      id: "files",
      inspection: controller.inspect(),
    },
  });
  assertEquals(await registry.execute("list.files.item.2", (action) => void actions.push(action)), true);
  assertEquals(actions.at(-1), {
    type: "list.itemSelected",
    payload: {
      id: "files",
      inspection: controller.inspect(),
      item: "gamma",
      index: 2,
    },
  });

  dispose();
  assertEquals(registry.list("list"), []);
  controller.dispose();
  emptyController.dispose();
});

Deno.test("TreeController flattens navigates toggles and inspects rows", () => {
  const toggles: Array<[string, boolean]> = [];
  const selections: string[] = [];
  const controller = new TreeController({
    nodes: [
      {
        id: "src",
        label: "src",
        expanded: true,
        children: [
          { id: "mod", label: "mod.ts" },
          { id: "components", label: "components", children: [{ id: "button", label: "button.ts" }] },
        ],
      },
      { id: "readme", label: "README.md" },
    ],
    onToggle: (row, expanded) => void toggles.push([row.id, expanded]),
    onSelect: (row) => void selections.push(row.id),
  });

  assertEquals(flattenTree(controller.nodes.peek()), ["▾ src", "    mod.ts", "  ▸ components", "  README.md"]);
  assertEquals(flattenTreeRows(controller.nodes.peek()).map((row) => [row.id, row.depth, row.index]), [
    ["src", 0, 0],
    ["mod", 1, 1],
    ["components", 1, 2],
    ["readme", 0, 3],
  ]);
  const initialNodes = controller.nodes.peek();
  const initialComponents = initialNodes[0]!.children![1]!;
  assertEquals(controller.setExpanded("missing", true), false);
  assertEquals(controller.nodes.peek() === initialNodes, true);

  controller.handleKeyPress(keyPress("down"), 3);
  controller.handleKeyPress(keyPress("down"), 3);
  assertEquals(controller.selected()?.id, "components");
  assertEquals(controller.handleKeyPress(keyPress("right"), 3)?.expanded, true);
  const expandedNodes = controller.nodes.peek();
  assertEquals(expandedNodes === initialNodes, false);
  assertEquals(expandedNodes[1] === initialNodes[1], true);
  assertEquals(expandedNodes[0] === initialNodes[0], false);
  assertEquals(expandedNodes[0]!.children![0] === initialNodes[0]!.children![0], true);
  assertEquals(expandedNodes[0]!.children![1] === initialComponents, false);
  assertEquals(controller.rowTexts(), ["▾ src", "    mod.ts", "  ▾ components", "      button.ts", "  README.md"]);
  assertEquals(controller.inspect(2).window, { start: 1, end: 3 });

  controller.handleKeyPress(keyPress("space"), 3);
  assertEquals(controller.selected()?.expanded, false);
  assertEquals(toggles, [["components", true], ["components", false]]);
  assertEquals(controller.handleKeyPress(keyPress("return"), 3)?.id, "components");
  assertEquals(selections, ["components"]);
  controller.dispose();
});

Deno.test("FileExplorerController builds path trees and opens files", () => {
  const opened: string[] = [];
  const controller = new FileExplorerController({
    root: createFileExplorerTree([
      "/src//components/alert.ts",
      "/src/components/button.ts",
      "/src/components/tree.ts",
      "/src/layout/window_manager.ts",
      "/README.md",
    ]),
    onOpen: (entry) => void opened.push(entry.path),
  });

  assertEquals(controller.entries().map((entry) => entry.path), [
    "/src",
    "/src/components",
    "/src/components/alert.ts",
    "/src/components/button.ts",
    "/src/components/tree.ts",
    "/src/layout",
    "/src/layout/window_manager.ts",
    "/README.md",
  ]);
  controller.tree.setSelectedIndex(3);
  assertEquals(controller.selected()?.kind, "file");
  controller.openActive();
  assertEquals(opened, ["/src/components/button.ts"]);
  controller.tree.setSelectedIndex(1);
  controller.openActive();
  assertEquals(controller.selected()?.expanded, false);

  controller.dispose();
});

Deno.test("treeCommands navigate toggle and select nodes", async () => {
  const controller = new TreeController({
    nodes: [
      {
        id: "root",
        label: "Root",
        expanded: true,
        children: [{ id: "child", label: "Child" }],
      },
      { id: "logs", label: "Logs" },
    ],
  });
  const registry = new CommandRegistry();
  const actions: unknown[] = [];
  const dispose = bindTreeCommands(registry, controller, {
    id: "project",
    idPrefix: "tree.project",
    group: "tree",
    includeNodeCommands: true,
  });
  const emptyController = new TreeController({ nodes: [] });

  assertEquals(treeCommands(emptyController).map((command) => command.id), [
    "tree.first",
    "tree.previous",
    "tree.next",
    "tree.last",
    "tree.toggle",
    "tree.expand",
    "tree.collapse",
    "tree.select",
  ]);
  assertEquals(registry.list("tree").map((command) => command.id), [
    "tree.project.collapse",
    "tree.project.expand",
    "tree.project.first",
    "tree.project.last",
    "tree.project.next",
    "tree.project.previous",
    "tree.project.select",
    "tree.project.node.child",
    "tree.project.node.logs",
    "tree.project.node.root",
    "tree.project.toggle",
  ]);

  assertEquals(await registry.execute("tree.project.next", (action) => void actions.push(action)), true);
  assertEquals(controller.selected()?.id, "child");
  assertEquals(actions.at(-1), {
    type: "tree.changed",
    payload: { id: "project", inspection: controller.inspect() },
  });

  assertEquals(await registry.execute("tree.project.node.root", (action) => void actions.push(action)), true);
  assertEquals(actions.at(-1), {
    type: "tree.nodeSelected",
    payload: { id: "project", inspection: controller.inspect(), row: controller.inspect().selected },
  });
  assertEquals(await registry.execute("tree.project.collapse", (action) => void actions.push(action)), true);
  assertEquals(controller.inspect().selected?.expanded, false);
  assertEquals(actions.at(-1), {
    type: "tree.nodeToggled",
    payload: {
      id: "project",
      inspection: controller.inspect(),
      row: controller.inspect().selected,
      expanded: false,
    },
  });

  dispose();
  assertEquals(registry.list("tree"), []);
  controller.dispose();
  emptyController.dispose();
});

Deno.test("ComboBoxController opens navigates selects and inspects state", () => {
  const selections: string[] = [];
  const expanded: boolean[] = [];
  const controller = new ComboBoxController({
    items: ["alpha", "beta", "gamma"],
    placeholder: "choose",
    onSelect: (item) => void selections.push(item),
    onExpandedChange: (next) => void expanded.push(next),
  });

  assertEquals(
    comboBoxLabel(controller.items.peek(), controller.selectedIndex.peek(), controller.placeholder.peek()),
    "choose",
  );
  assertEquals(controller.inspect(), {
    items: ["alpha", "beta", "gamma"],
    itemCount: 3,
    selectedIndex: undefined,
    selected: undefined,
    expanded: false,
    placeholder: "choose",
    label: "choose",
    empty: false,
  });

  controller.handleKeyPress(keyPress("down"));
  controller.handleKeyPress(keyPress("down"));
  assertEquals(controller.inspect().selected, "beta");
  assertEquals(controller.inspect().expanded, true);
  assertEquals(controller.handleKeyPress(keyPress("return")), "beta");
  assertEquals(controller.inspect().expanded, false);
  assertEquals(selections, ["beta"]);
  assertEquals(expanded, [true, false]);
  controller.open();
  assertEquals(controller.itemIndexAt(12, 10), 2);
  assertEquals(controller.handleMousePress({ y: 12 }, 10), "gamma");
  assertEquals(controller.inspect().selectedIndex, 2);
  assertEquals(controller.inspect().expanded, false);
  assertEquals(selections, ["beta", "gamma"]);

  controller.items.value = ["only"];
  assertEquals(controller.inspect().selectedIndex, 0);
  controller.items.value = [];
  assertEquals(controller.inspect().selectedIndex, undefined);
  assertEquals(controller.inspect().empty, true);
  controller.dispose();
});

Deno.test("comboBoxCommands open move and select items", async () => {
  const controller = new ComboBoxController({ items: ["alpha", "beta", "gamma"] });
  const registry = new CommandRegistry();
  const actions: unknown[] = [];
  const dispose = bindComboBoxCommands(registry, controller, {
    id: "choice",
    idPrefix: "combo.choice",
    group: "input",
    includeItemCommands: true,
  });
  const emptyController = new ComboBoxController<string[]>({ items: [] });

  assertEquals(comboBoxCommands(emptyController).map((command) => command.id), [
    "combobox.open",
    "combobox.close",
    "combobox.toggle",
    "combobox.first",
    "combobox.previous",
    "combobox.next",
    "combobox.last",
    "combobox.select",
  ]);
  assertEquals(registry.list("input").map((command) => command.id), [
    "combo.choice.close",
    "combo.choice.first",
    "combo.choice.last",
    "combo.choice.next",
    "combo.choice.open",
    "combo.choice.previous",
    "combo.choice.select",
    "combo.choice.item.0",
    "combo.choice.item.1",
    "combo.choice.item.2",
    "combo.choice.toggle",
  ]);

  assertEquals(await registry.execute("combo.choice.open", (action) => void actions.push(action)), true);
  assertEquals(controller.expanded.peek(), true);
  assertEquals(actions.at(-1), {
    type: "comboBox.expandedChanged",
    payload: { id: "choice", inspection: controller.inspect(), expanded: true },
  });
  assertEquals(await registry.execute("combo.choice.next", (action) => void actions.push(action)), true);
  assertEquals(controller.selected(), "alpha");
  assertEquals(await registry.execute("combo.choice.item.2", (action) => void actions.push(action)), true);
  assertEquals(actions.at(-1), {
    type: "comboBox.itemSelected",
    payload: {
      id: "choice",
      inspection: controller.inspect(),
      item: "gamma",
      index: 2,
    },
  });

  dispose();
  assertEquals(registry.list("input"), []);
  controller.dispose();
  emptyController.dispose();
});

Deno.test("ProgressBarController clamps values and computes progress geometry", () => {
  const changes: number[] = [];
  const value = new Signal(40);
  const controller = new ProgressBarController({
    min: 0,
    max: 100,
    value,
    smooth: true,
    direction: "normal",
    orientation: "horizontal",
    onChange: (next) => void changes.push(next),
  });

  assertEquals(clampProgressValue(120, 0, 100), 100);
  assertEquals(progressRatio(25, 0, 100), 0.25);
  assertEquals(progressRatio(25, 0, 100, "reversed"), 0.75);
  assertEquals(progressRectangle({ column: 1, row: 2, width: 10, height: 3 }, 40, 0, 100, "horizontal"), {
    column: 1,
    row: 2,
    width: 4,
    height: 3,
  });
  assertEquals(progressSmoothLine(0, 4, 1, 50, 0, 100, "horizontal", "normal", controller.charMap.peek()), "██");

  assertEquals(controller.increment(70), 100);
  assertEquals(controller.inspect(), {
    min: 0,
    max: 100,
    value: 100,
    normalizedValue: 1,
    direction: "normal",
    orientation: "horizontal",
    smooth: true,
    complete: true,
    empty: false,
  });
  value.value = -10;
  assertEquals(controller.value.peek(), 0);
  assertEquals(changes, [100]);
  controller.dispose();
  value.dispose();
});

Deno.test("progressBarCommands adjust progress values and presets", async () => {
  const controller = new ProgressBarController({
    min: 0,
    max: 100,
    value: 25,
    smooth: false,
    direction: "normal",
    orientation: "horizontal",
  });
  const registry = new CommandRegistry();
  const actions: unknown[] = [];
  const dispose = bindProgressBarCommands(registry, controller, {
    id: "build",
    idPrefix: "progress.build",
    group: "progress",
    step: 25,
    includeValueCommands: true,
    values: [0, 50, 100],
  });

  assertEquals(progressBarCommands(controller).map((command) => command.id), [
    "progress.decrement",
    "progress.increment",
    "progress.min",
    "progress.max",
  ]);
  assertEquals(registry.list("progress").map((command) => command.id), [
    "progress.build.decrement",
    "progress.build.increment",
    "progress.build.max",
    "progress.build.min",
    "progress.build.value.0",
    "progress.build.value.100",
    "progress.build.value.50",
  ]);

  assertEquals(await registry.execute("progress.build.increment", (action) => void actions.push(action)), true);
  assertEquals(controller.value.peek(), 50);
  assertEquals(actions.at(-1), {
    type: "progressBar.changed",
    payload: { id: "build", value: 50, inspection: controller.inspect() },
  });
  assertEquals(registry.enabled(registry.get("progress.build.value.50")!), false);
  assertEquals(await registry.execute("progress.build.max", (action) => void actions.push(action)), true);
  assertEquals(controller.inspect().complete, true);

  dispose();
  assertEquals(registry.list("progress"), []);
  controller.dispose();
});

Deno.test("virtual list rows support formatted multi selection windows", () => {
  const items = ["alpha", "beta", "gamma", "delta", "epsilon"];
  const state = { activeIndex: 3, anchorIndex: 1, selected: [1, 3] };

  assertEquals(virtualListRows(items, state, 3, (item, index) => `${index}:${item}`), [
    { item: "gamma", index: 2, active: false, selected: false, text: "2:gamma" },
    { item: "delta", index: 3, active: true, selected: true, text: "3:delta" },
    { item: "epsilon", index: 4, active: false, selected: false, text: "4:epsilon" },
  ]);
  assertEquals(renderVirtualListRows(items, state, 3), [
    "    gamma",
    "> ● delta",
    "    epsilon",
  ]);
  const buffer = ["stale"];
  assertEquals(renderVirtualListRowsInto(buffer, items, state, 3, (item, index) => `${index}:${item}`), [
    "    2:gamma",
    "> ● 3:delta",
    "    4:epsilon",
  ]);
  assertEquals(
    renderVirtualListRowsInto(buffer, ["alpha"], { activeIndex: 0, anchorIndex: 0, selected: [] }, 3),
    buffer,
  );
  assertEquals(buffer, [">   alpha"]);
});

Deno.test("VirtualListController drives viewport rows and key navigation", () => {
  const controller = new VirtualListController({
    items: ["alpha", "beta", "gamma", "delta", "epsilon"],
    mode: "multiple",
    format: (item, index) => `${index}:${item}`,
  });

  controller.setViewportHeight(3);
  controller.handleKeyPress(keyPress("down", { shift: true }));
  controller.handleKeyPress(keyPress("down", { shift: true }));

  assertEquals(controller.inspect(), {
    itemCount: 5,
    mode: "multiple",
    activeIndex: 2,
    selected: [0, 1, 2],
    selectedItems: ["alpha", "beta", "gamma"],
    window: { start: 1, end: 4 },
  });
  assertEquals(controller.rows.peek().map((row) => row.text), ["1:beta", "2:gamma", "3:delta"]);

  controller.handleKeyPress(keyPress("pagedown"));
  assertEquals(controller.inspect().activeIndex, 4);
  assertEquals(controller.handleKeyPress(keyPress("return")), "epsilon");
  controller.dispose();
});

Deno.test("VirtualListController syncs selected values and external state", () => {
  const selection = new Signal({ activeIndex: 0, anchorIndex: 0, selected: [0] });
  const controller = new VirtualListController({
    items: [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
      { id: "c", label: "Gamma" },
    ],
    mode: "multiple",
    selection,
    valueForItem: (item) => item.id,
  });

  controller.selectValues(["c", "a"]);

  assertEquals(controller.selectedValues(), ["a", "c"]);
  assertEquals(selection.peek(), { activeIndex: 2, anchorIndex: 2, selected: [0, 2] });

  controller.items.value = [
    { id: "a", label: "Alpha" },
    { id: "c", label: "Gamma" },
  ];
  assertEquals(controller.inspect().itemCount, 2);
  assertEquals(controller.inspect().selected, [0, 1]);
  controller.dispose();
});

Deno.test("TableController moves pages scrolls and clamps row state", () => {
  const selected: number[] = [];
  const controller = new TableController({
    rowCount: 10,
    viewportHeight: 6,
    selectedRow: 4,
    onSelect: (row) => void selected.push(row),
  });

  assertEquals(tableVisibleCapacity(6), 2);
  assertEquals(tableMaxOffset(10, 6), 8);
  assertEquals(clampTableRow(99, 10), 9);
  assertEquals(controller.inspect(), {
    rowCount: 10,
    selectedRow: 4,
    offsetRow: 0,
    viewportHeight: 6,
    visibleCapacity: 2,
    maxOffsetRow: 8,
    empty: false,
  });

  controller.pageDown();
  assertEquals(controller.selectedRow.peek(), 6);
  assertEquals(controller.offsetRow.peek(), 5);
  controller.handleKeyPress(keyPress("end"));
  assertEquals(controller.selectedRow.peek(), 9);
  assertEquals(controller.scroll(-2), 6);
  assertEquals(controller.selectViewportRow(5, 1), 7);
  controller.setRowCount(3);
  assertEquals(controller.inspect(), {
    rowCount: 3,
    selectedRow: 2,
    offsetRow: 1,
    viewportHeight: 6,
    visibleCapacity: 2,
    maxOffsetRow: 1,
    empty: false,
  });
  assertEquals(selected, [6, 9, 7]);
  controller.dispose();
});

Deno.test("tableAutoColumnWidths scans sparse data without row buffers", () => {
  assertEquals(
    tableAutoColumnWidths(
      [{ title: "ID" }, { title: "Name" }, { title: "State" }],
      [
        ["1", "Alpha"],
        ["200", "Beta Service", "ready"],
        ["3", "C", "degraded"],
      ],
    ),
    [3, 12, 8],
  );
});

Deno.test("tableCommands move and select table rows", async () => {
  const controller = new TableController({ rowCount: 5, viewportHeight: 6 });
  const registry = new CommandRegistry();
  const dispose = bindTableCommands(registry, controller, {
    id: "processes",
    idPrefix: "table.processes",
    group: "table",
  });
  const actions: unknown[] = [];

  assertEquals(tableCommands(new TableController()).map((command) => [command.id, commandDisabled(command)]), [
    ["table.first", true],
    ["table.previous", true],
    ["table.next", true],
    ["table.last", true],
    ["table.pagePrevious", true],
    ["table.pageNext", true],
    ["table.select", true],
  ]);
  assertEquals(registry.list("table").map((command) => command.id), [
    "table.processes.first",
    "table.processes.last",
    "table.processes.pageNext",
    "table.processes.next",
    "table.processes.pagePrevious",
    "table.processes.previous",
    "table.processes.select",
  ]);

  assertEquals(await registry.execute("table.processes.next", (action) => void actions.push(action)), true);
  assertEquals(controller.selectedRow.peek(), 1);
  assertEquals(actions[0], {
    type: "table.changed",
    payload: { id: "processes", inspection: controller.inspect() },
  });
  assertEquals(await registry.execute("table.processes.select", (action) => void actions.push(action)), true);
  assertEquals(actions[1], {
    type: "table.rowSelected",
    payload: { id: "processes", inspection: controller.inspect(), row: 1 },
  });

  dispose();
  assertEquals(registry.list("table"), []);
  controller.dispose();
});

Deno.test("CheckBoxController toggles and inspects boolean state", () => {
  const changes: boolean[] = [];
  const checked = new Signal(false);
  const controller = new CheckBoxController({
    checked,
    onChange: (next) => void changes.push(next),
  });

  assertEquals(renderCheckBoxMark(false), Mark.Cross);
  assertEquals(controller.inspect(), { checked: false, mark: Mark.Cross });
  assertEquals(controller.toggle(), true);
  assertEquals(controller.check(), true);
  assertEquals(controller.uncheck(), false);
  assertEquals(checked.peek(), false);
  assertEquals(changes, [true, true, false]);
  controller.dispose();
  checked.dispose();
});

Deno.test("checkBoxCommands toggle check and uncheck state", async () => {
  const controller = new CheckBoxController({ checked: false });
  const registry = new CommandRegistry();
  const actions: unknown[] = [];
  const dispose = bindCheckBoxCommands(registry, controller, {
    id: "autosave",
    idPrefix: "settings.autosave",
    group: "settings",
  });

  assertEquals(checkBoxCommands(new CheckBoxController({ checked: false })).map((command) => command.id), [
    "checkbox.toggle",
    "checkbox.check",
    "checkbox.uncheck",
  ]);
  assertEquals(registry.list("settings").map((command) => command.id), [
    "settings.autosave.check",
    "settings.autosave.toggle",
    "settings.autosave.uncheck",
  ]);
  assertEquals(registry.enabled(registry.get("settings.autosave.uncheck")!), false);

  assertEquals(await registry.execute("settings.autosave.toggle", (action) => void actions.push(action)), true);
  assertEquals(controller.checked.peek(), true);
  assertEquals(registry.enabled(registry.get("settings.autosave.check")!), false);
  assertEquals(await registry.execute("settings.autosave.uncheck", (action) => void actions.push(action)), true);
  assertEquals(actions.at(-1), {
    type: "checkbox.changed",
    payload: {
      id: "autosave",
      checked: false,
      inspection: { checked: false, mark: Mark.Cross },
    },
  });

  dispose();
  assertEquals(registry.list("settings"), []);
  controller.dispose();
});

Deno.test("renderTabs marks the active tab", () => {
  const tabs = [
    { id: "one", label: "One" },
    { id: "two", label: "Two", disabled: true },
    { id: "three", label: "Three" },
  ];

  assertEquals(
    renderTabs(tabs, 2),
    " One   (Two)  [Three]",
  );
  assertEquals(shiftTabIndex(tabs, 0, 1), 2);
  assertEquals(clampTabIndex(tabs, 1), 2);
  assertEquals(tabForIndex(tabs, 1)?.id, "three");
});

Deno.test("TabsController navigates and inspects tab state", () => {
  const changes: string[] = [];
  const controller = new TabsController({
    tabs: [
      { id: "overview", label: "Overview" },
      { id: "logs", label: "Logs", disabled: true },
      { id: "settings", label: "Settings" },
    ],
    activeIndex: 1,
    onChange: (tab) => void changes.push(tab.id),
  });

  assertEquals(controller.inspect(), {
    tabs: [
      { id: "overview", label: "Overview" },
      { id: "logs", label: "Logs", disabled: true },
      { id: "settings", label: "Settings" },
    ],
    tabCount: 3,
    activeIndex: 2,
    active: { id: "settings", label: "Settings" },
    empty: false,
  });
  assertEquals(controller.move(-1)?.id, "overview");
  controller.handleKeyPress(keyPress("right"));
  controller.handleKeyPress(keyPress("home"));
  assertEquals(controller.active()?.id, "overview");
  assertEquals(changes, ["overview", "settings", "overview"]);
  controller.dispose();
});

Deno.test("active item controllers retain caller-owned collection and index signals", () => {
  const tabs = new Signal([
    { id: "overview", label: "Overview" },
    { id: "settings", label: "Settings" },
  ]);
  const activeIndex = new Signal(0);
  const controller = new TabsController({ tabs, activeIndex });

  controller.move(1);
  controller.dispose();

  assertEquals(activeIndex.peek(), 1);
  assertEquals(tabs.disposed, false);
  assertEquals(activeIndex.disposed, false);
  tabs.dispose();
  activeIndex.dispose();
});

Deno.test("tabsCommands move and select tabs", async () => {
  const controller = new TabsController({
    tabs: [
      { id: "overview", label: "Overview" },
      { id: "logs", label: "Logs", disabled: true },
      { id: "settings", label: "Settings" },
    ],
  });
  const registry = new CommandRegistry();
  const actions: unknown[] = [];
  const dispose = bindTabsCommands(registry, controller, {
    id: "main",
    idPrefix: "tabs.main",
    group: "tabs",
    includeTabCommands: true,
  });

  assertEquals(tabsCommands(new TabsController({ tabs: [] })).map((command) => command.id), [
    "tabs.first",
    "tabs.previous",
    "tabs.next",
    "tabs.last",
  ]);
  assertEquals(registry.list("tabs").map((command) => command.id), [
    "tabs.main.first",
    "tabs.main.tab.logs",
    "tabs.main.tab.overview",
    "tabs.main.tab.settings",
    "tabs.main.last",
    "tabs.main.next",
    "tabs.main.previous",
  ]);

  assertEquals(await registry.execute("tabs.main.next", (action) => void actions.push(action)), true);
  assertEquals(controller.active()?.id, "settings");
  assertEquals(await registry.execute("tabs.main.tab.logs", (action) => void actions.push(action)), false);
  assertEquals(await registry.execute("tabs.main.tab.overview", (action) => void actions.push(action)), true);
  assertEquals(actions.at(-1), {
    type: "tabs.tabSelected",
    payload: {
      id: "main",
      tab: { id: "overview", label: "Overview" },
      inspection: controller.inspect(),
    },
  });

  dispose();
  assertEquals(registry.list("tabs"), []);
  controller.dispose();
});

Deno.test("renderBreadcrumbs truncates from the left", () => {
  const items = [
    { id: "app", label: "App" },
    { id: "settings", label: "Settings" },
    { id: "runtime", label: "Runtime" },
  ];

  assertEquals(renderBreadcrumbs(items, "/"), "App / Settings / Runtime");
  assertEquals(renderBreadcrumbs(items, "/", 12), "… / Runtime");
  assertEquals(renderBreadcrumbs(items, "/", 6), "… / R…");
  assertEquals(renderBreadcrumbs([], "/", 6), "");
  assertEquals(renderBreadcrumbs(items, "/", 1), "…");
  assertEquals(renderBreadcrumbs(items, "/", 0), "");
});

Deno.test("renderEmptyState centers and truncates content", () => {
  assertEquals(
    renderEmptyState(
      {
        icon: "-",
        title: "No results found",
        message: "Try a different filter",
        action: "Press / to search",
      },
      12,
      6,
    ),
    ["", "-", "No results …", "Try a diffe…", "Press / to …"],
  );
  assertEquals(renderEmptyState({ title: "Nothing here", message: "Add an item" }, 20, 1), ["Nothing here"]);
  assertEquals(renderEmptyState({ title: "Nothing here" }, 0, 2, false), [""]);
});

Deno.test("menu bar renders active item and skips disabled entries", () => {
  const items = [
    { id: "file", label: "File" },
    { id: "edit", label: "Edit", disabled: true },
    { id: "view", label: "View" },
  ];

  assertEquals(renderMenuBar(items, 0), "[File] (Edit) View");
  assertEquals(shiftMenuIndex(items, 0, 1), 2);
  assertEquals(clampMenuIndex(items, 1), 2);
  assertEquals(menuItemForIndex(items, 1)?.id, "view");
});

Deno.test("active item helpers preserve wrapped and bounded boundary policies", () => {
  const items = [
    { id: "first", value: "first", label: "First" },
    { id: "disabled", value: "disabled", label: "Disabled", disabled: true },
    { id: "last", value: "last", label: "Last" },
  ];

  assertEquals(shiftMenuIndex(items, 2, 1), 0);
  assertEquals(shiftTabIndex(items, 2, 1), 0);
  assertEquals(shiftRadioIndex(items, 2, 1), 2);
  assertEquals(shiftStepperIndex(items, 2, 1), 2);
  assertEquals(clampMenuIndex([], 4), -1);
  assertEquals(clampTabIndex([], 4), -1);
  assertEquals(clampRadioIndex([], 4), 0);
  assertEquals(clampStepperIndex([], 4), 0);
});

Deno.test("ModalController opens updates actions and closes on escape", () => {
  const actions: unknown[] = [];
  const controller = new ModalController({
    title: "Deploy changes",
    body: "Ship the active build to production?",
    tone: "confirm",
    actions: [
      { id: "cancel", label: "Cancel" },
      { id: "ship", label: "Ship", default: true },
    ],
    onAction: (action, inspection) => void actions.push({ action, open: inspection.open }),
  });

  assertEquals(controller.inspect().open, false);
  assertEquals(controller.open().selectedAction?.id, "ship");
  assertEquals(controller.moveAction(-1)?.id, "cancel");
  controller.handleKeyPress({ key: "right" });
  assertEquals(controller.selectedAction()?.id, "ship");
  controller.handleKeyPress({ key: "return" });
  assertEquals(actions, [{
    action: { id: "ship", label: "Ship", default: true },
    open: true,
  }]);
  controller.handleKeyPress({ key: "escape" });
  assertEquals(controller.inspect().open, false);
  assertEquals(
    controller.open({
      actions: [
        { id: "back", label: "Back" },
        { id: "details", label: "Details", default: true },
      ],
    }).selectedAction?.id,
    "details",
  );

  controller.dispose();
});

Deno.test("text-backed components preserve shared child wiring and custom modal options", () => {
  const tui = createFakeTui();
  const gauge = new Gauge({
    parent: tui,
    theme: {},
    zIndex: 1,
    rectangle: { column: 2, row: 3, width: 12, height: 1 },
    value: 0.5,
  });
  gauge.draw();
  const gaugeText = gauge.subComponents.text as Text;
  const gaugeTextRect = gaugeText.rectangle.peek();
  assertEquals(gaugeText.subComponentOf === gauge, true);
  assertEquals(
    { column: gaugeTextRect.column, row: gaugeTextRect.row, width: gaugeTextRect.width },
    { column: 2, row: 3, width: 12 },
  );
  assertEquals(gaugeText.overwriteRectangle.peek(), true);

  const modal = new Modal({
    parent: tui,
    theme: {},
    zIndex: 2,
    rectangle: { column: 4, row: 5, width: 20, height: 8 },
    title: "Confirm",
    body: "Proceed?",
  });
  modal.draw();
  const title = modal.subComponents.title as Text;
  const body = modal.subComponents.body as Text;
  assertEquals(title.overwriteRectangle.peek(), false);
  assertEquals(body.overwriteRectangle.peek(), true);
  assertEquals(title.zIndex.peek(), 3);
});

Deno.test("renderModalRows formats wrapped body and focused actions", () => {
  const controller = new ModalController({
    open: true,
    title: "Validation failed",
    body: ["One field is invalid and needs attention.", "Review the highlighted input."],
    tone: "error",
    actions: [
      { id: "dismiss", label: "Dismiss", default: true },
      { id: "details", label: "Details" },
    ],
  });

  assertEquals(renderModalRows(controller.inspect(), { width: 28 }), [
    "[ERROR] Validation faile",
    "",
    "One field is invalid and",
    "needs attention.",
    "Review the highlighted",
    "input.",
    "",
    "[ Dismiss ]   Details  ",
  ]);
  assertEquals(renderModalRows(controller.inspect(), { width: 28, height: 4 }), [
    "[ERROR] Validation faile",
    "",
    "One field is invalid and",
    "[ Dismiss ]   Details  ",
  ]);

  controller.dispose();
});

Deno.test("MenuBarController navigates selects and inspects menu state", () => {
  const changes: string[] = [];
  const selections: string[] = [];
  const controller = new MenuBarController({
    items: [
      { id: "file", label: "File" },
      { id: "edit", label: "Edit", disabled: true },
      { id: "view", label: "View" },
    ],
    activeIndex: 1,
    onChange: (item) => void changes.push(item.id),
    onSelect: (item) => void selections.push(item.id),
  });

  assertEquals(controller.inspect(), {
    items: [
      { id: "file", label: "File" },
      { id: "edit", label: "Edit", disabled: true },
      { id: "view", label: "View" },
    ],
    itemCount: 3,
    activeIndex: 2,
    active: { id: "view", label: "View" },
    empty: false,
  });
  assertEquals(controller.move(-1)?.id, "file");
  controller.handleKeyPress(keyPress("right"));
  assertEquals(controller.selectActive()?.id, "view");
  controller.handleKeyPress(keyPress("home"));
  controller.handleKeyPress(keyPress("space"));
  assertEquals(changes, ["file", "view", "file"]);
  assertEquals(selections, ["view", "file"]);
  controller.dispose();
});

Deno.test("menuBarCommands move and select menu items", async () => {
  const controller = new MenuBarController({
    items: [
      { id: "file", label: "File" },
      { id: "edit", label: "Edit", disabled: true },
      { id: "view", label: "View" },
    ],
  });
  const registry = new CommandRegistry();
  const actions: unknown[] = [];
  const dispose = bindMenuBarCommands(registry, controller, {
    id: "main",
    idPrefix: "menubar.main",
    group: "menu",
    includeItemCommands: true,
  });

  assertEquals(menuBarCommands(new MenuBarController({ items: [] })).map((command) => command.id), [
    "menu.first",
    "menu.previous",
    "menu.next",
    "menu.last",
    "menu.select",
  ]);
  assertEquals(registry.list("menu").map((command) => command.id), [
    "menubar.main.first",
    "menubar.main.last",
    "menubar.main.next",
    "menubar.main.previous",
    "menubar.main.select",
    "menubar.main.item.edit",
    "menubar.main.item.file",
    "menubar.main.item.view",
  ]);

  assertEquals(await registry.execute("menubar.main.next", (action) => void actions.push(action)), true);
  assertEquals(controller.active()?.id, "view");
  assertEquals(await registry.execute("menubar.main.item.edit", (action) => void actions.push(action)), false);
  assertEquals(await registry.execute("menubar.main.item.file", (action) => void actions.push(action)), true);
  assertEquals(actions.at(-1), {
    type: "menuBar.itemSelected",
    payload: {
      id: "main",
      item: { id: "file", label: "File" },
      inspection: controller.inspect(),
    },
  });

  dispose();
  assertEquals(registry.list("menu"), []);
  controller.dispose();
});

Deno.test("radio group renders selected state and skips disabled options", () => {
  const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta", disabled: true },
    { value: "c", label: "Gamma" },
  ];

  assertEquals(renderRadioGroupRows(options, "c", 0, 3), [
    "> ○ Alpha",
    "  ○ (Beta)",
    "  ● Gamma",
  ]);
  assertEquals(shiftRadioIndex(options, 0, 1), 2);
  assertEquals(shiftRadioIndex(options, 2, -1), 0);
  assertEquals(clampRadioIndex(options, 1), 2);
  assertEquals(optionForValue(options, "c")?.label, "Gamma");
  assertEquals(visibleRadioOptions(options, 2, 2).map((row) => row.index), [1, 2]);
});

Deno.test("RadioGroupController navigates selects and inspects option state", () => {
  const changes: string[] = [];
  const selectedValue = new Signal<string | undefined>("c");
  const controller = new RadioGroupController({
    options: [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta", disabled: true },
      { value: "c", label: "Gamma" },
    ],
    selectedValue,
    activeIndex: 1,
    onChange: (option) => void changes.push(option.value),
  });

  assertEquals(controller.inspect(), {
    options: [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta", disabled: true },
      { value: "c", label: "Gamma" },
    ],
    optionCount: 3,
    activeIndex: 2,
    active: { value: "c", label: "Gamma" },
    selectedValue: "c",
    selected: { value: "c", label: "Gamma" },
    empty: false,
  });
  assertEquals(controller.move(-1)?.value, "a");
  assertEquals(controller.selectActive()?.value, "a");
  assertEquals(selectedValue.peek(), "a");
  assertEquals(controller.selectValue("b"), undefined);
  controller.handleKeyPress(keyPress("end"));
  controller.handleKeyPress(keyPress("space"));
  assertEquals(controller.handleMousePress({ y: 10 }, 10, 3)?.value, "a");
  assertEquals(controller.handleMousePress({ y: 11 }, 10, 3), undefined);
  assertEquals(changes, ["a", "c", "a"]);
  controller.dispose();
  selectedValue.dispose();
});

Deno.test("radioGroupCommands move and select options", async () => {
  const controller = new RadioGroupController({
    options: [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta", disabled: true },
      { value: "c", label: "Gamma" },
    ],
  });
  const registry = new CommandRegistry();
  const actions: unknown[] = [];
  const dispose = bindRadioGroupCommands(registry, controller, {
    id: "priority",
    idPrefix: "radio.priority",
    group: "form",
    includeOptionCommands: true,
  });

  assertEquals(radioGroupCommands(new RadioGroupController({ options: [] })).map((command) => command.id), [
    "radio.first",
    "radio.previous",
    "radio.next",
    "radio.last",
    "radio.select",
  ]);
  assertEquals(registry.list("form").map((command) => command.id), [
    "radio.priority.first",
    "radio.priority.last",
    "radio.priority.next",
    "radio.priority.previous",
    "radio.priority.select",
    "radio.priority.option.a",
    "radio.priority.option.b",
    "radio.priority.option.c",
  ]);

  assertEquals(await registry.execute("radio.priority.next", (action) => void actions.push(action)), true);
  assertEquals(controller.active()?.value, "c");
  assertEquals(await registry.execute("radio.priority.option.b", (action) => void actions.push(action)), false);
  assertEquals(await registry.execute("radio.priority.option.a", (action) => void actions.push(action)), true);
  assertEquals(actions.at(-1), {
    type: "radioGroup.optionSelected",
    payload: {
      id: "priority",
      option: { value: "a", label: "Alpha" },
      inspection: controller.inspect(),
    },
  });

  dispose();
  assertEquals(registry.list("form"), []);
  controller.dispose();
});

Deno.test("slider helpers clamp values and compute thumb rectangles", () => {
  assertEquals(clampSliderValue(12, 0, 10), 10);
  assertEquals(clampSliderValue(-2, 0, 10), 0);
  assertEquals(sliderValueBy(4, 0, 10, 2, 3), 10);
  assertEquals(sliderThumbRectangle({ column: 2, row: 3, width: 10, height: 2 }, 5, 0, 10, "horizontal"), {
    column: 7,
    row: 3,
    width: 1,
    height: 2,
  });
  assertEquals(sliderThumbRectangle({ column: 2, row: 3, width: 2, height: 10 }, 5, 0, 10, "vertical", true), {
    column: 2,
    row: 8,
    width: 2,
    height: 1,
  });
});

Deno.test("SliderController handles keyboard mouse and inspection state", () => {
  const changes: number[] = [];
  const value = new Signal(4);
  const controller = new SliderController({
    min: 0,
    max: 10,
    step: 2,
    value,
    orientation: "horizontal",
    adjustThumbSize: true,
    onChange: (next) => void changes.push(next),
  });

  controller.handleKeyPress(keyPress("right"));
  controller.handleDrag(2, 0);
  controller.handleScroll(-1);
  assertEquals(snapSliderValue(5, 0, 10, 2), 6);
  assertEquals(
    sliderValueAt({ column: 0, row: 0, width: 11, height: 1 }, { column: 5, row: 0 }, 0, 10, 2, "horizontal"),
    6,
  );
  controller.handlePointer({ column: 0, row: 0, width: 11, height: 1 }, 5, 0);
  controller.handleKeyPress(keyPress("home"));
  controller.handleKeyPress(keyPress("end"));

  assertEquals(value.peek(), 10);
  assertEquals(changes, [6, 10, 8, 6, 0, 10]);
  assertEquals(controller.inspect(), {
    min: 0,
    max: 10,
    step: 2,
    value: 10,
    normalizedValue: 1,
    orientation: "horizontal",
    adjustThumbSize: true,
    range: 10,
  });
  assertEquals(controller.thumbRectangle({ column: 0, row: 0, width: 10, height: 1 }), {
    column: 9,
    row: 0,
    width: 1,
    height: 1,
  });
  controller.dispose();
  value.dispose();
});

Deno.test("sliderCommands drive value changes and presets", async () => {
  const controller = new SliderController({
    min: 0,
    max: 10,
    step: 2,
    value: 4,
    orientation: "horizontal",
  });
  const registry = new CommandRegistry();
  const actions: unknown[] = [];
  const dispose = bindSliderCommands(registry, controller, {
    id: "volume",
    idPrefix: "slider.volume",
    group: "controls",
    includeValueCommands: true,
    values: [0, 4, 10],
  });

  assertEquals(
    sliderCommands(new SliderController({ min: 0, max: 1, step: 1, value: 0, orientation: "horizontal" })).map((
      command,
    ) => command.id),
    [
      "slider.decrement",
      "slider.increment",
      "slider.min",
      "slider.max",
    ],
  );
  assertEquals(registry.list("controls").map((command) => command.id), [
    "slider.volume.decrement",
    "slider.volume.increment",
    "slider.volume.max",
    "slider.volume.min",
    "slider.volume.value.0",
    "slider.volume.value.10",
    "slider.volume.value.4",
  ]);

  assertEquals(await registry.execute("slider.volume.increment", (action) => void actions.push(action)), true);
  assertEquals(controller.value.peek(), 6);
  assertEquals(await registry.execute("slider.volume.value.10", (action) => void actions.push(action)), true);
  assertEquals(registry.enabled(registry.get("slider.volume.value.10")!), false);
  assertEquals(actions.at(-1), {
    type: "slider.changed",
    payload: {
      id: "volume",
      value: 10,
      inspection: controller.inspect(),
    },
  });

  dispose();
  assertEquals(registry.list("controls"), []);
  controller.dispose();
});

Deno.test("stepper renders progress and skips disabled steps", () => {
  const steps = [
    { id: "plan", label: "Plan", completed: true },
    { id: "build", label: "Build" },
    { id: "ship", label: "Ship", disabled: true },
    { id: "verify", label: "Verify" },
  ];

  assertEquals(renderStepper(steps, 1), ["✓ Plan → [Build] → (Ship) → Verify"]);
  assertEquals(renderStepper(steps, 1, "horizontal", 12), ["✓ Plan → [B…"]);
  assertEquals(renderStepper(steps, 3, "vertical"), [
    "  ✓ Plan",
    "  ○ Build",
    "  - (Ship)",
    "> ○ Verify",
  ]);
  assertEquals(shiftStepperIndex(steps, 1, 1), 3);
  assertEquals(shiftStepperIndex(steps, 3, -1), 1);
  assertEquals(clampStepperIndex(steps, 2), 3);
  assertEquals(stepForIndex(steps, 2)?.id, "verify");
});

Deno.test("StepperController navigates and inspects workflow state", () => {
  const changes: string[] = [];
  const controller = new StepperController({
    steps: [
      { id: "plan", label: "Plan", completed: true },
      { id: "build", label: "Build" },
      { id: "ship", label: "Ship", disabled: true },
      { id: "verify", label: "Verify" },
    ],
    activeIndex: 1,
    orientation: "vertical",
    onChange: (step) => void changes.push(step.id),
  });

  assertEquals(controller.inspect(), {
    steps: [
      { id: "plan", label: "Plan", completed: true },
      { id: "build", label: "Build" },
      { id: "ship", label: "Ship", disabled: true },
      { id: "verify", label: "Verify" },
    ],
    stepCount: 4,
    activeIndex: 1,
    active: { id: "build", label: "Build" },
    orientation: "vertical",
    empty: false,
  });
  assertEquals(controller.move(1)?.id, "verify");
  controller.handleKeyPress(keyPress("up"));
  assertEquals(controller.active()?.id, "build");
  assertEquals(controller.last()?.id, "verify");
  assertEquals(changes, ["verify", "build", "verify"]);
  controller.dispose();
});

Deno.test("stepperCommands move and select steps", async () => {
  const controller = new StepperController({
    steps: [
      { id: "plan", label: "Plan" },
      { id: "build", label: "Build" },
      { id: "ship", label: "Ship", disabled: true },
    ],
  });
  const registry = new CommandRegistry();
  const actions: unknown[] = [];
  const dispose = bindStepperCommands(registry, controller, {
    id: "release",
    idPrefix: "wizard.release",
    group: "wizard",
    includeStepCommands: true,
  });

  assertEquals(stepperCommands(new StepperController({ steps: [] })).map((command) => command.id), [
    "stepper.first",
    "stepper.previous",
    "stepper.next",
    "stepper.last",
  ]);
  assertEquals(registry.list("wizard").map((command) => command.id), [
    "wizard.release.first",
    "wizard.release.step.build",
    "wizard.release.step.plan",
    "wizard.release.step.ship",
    "wizard.release.last",
    "wizard.release.next",
    "wizard.release.previous",
  ]);

  assertEquals(await registry.execute("wizard.release.next", (action) => void actions.push(action)), true);
  assertEquals(controller.active()?.id, "build");
  assertEquals(await registry.execute("wizard.release.step.ship", (action) => void actions.push(action)), false);
  assertEquals(await registry.execute("wizard.release.step.plan", (action) => void actions.push(action)), true);
  assertEquals(actions.at(-1), {
    type: "stepper.stepSelected",
    payload: {
      id: "release",
      step: { id: "plan", label: "Plan" },
      inspection: controller.inspect(),
    },
  });

  dispose();
  assertEquals(registry.list("wizard"), []);
  controller.dispose();
});

Deno.test("spinner renders status glyphs and truncates labels", () => {
  assertEquals(spinnerGlyph("loading", 5, ["a", "b", "c"]), "c");
  assertEquals(spinnerGlyph("success"), "✓");
  assertEquals(spinnerGlyph("error"), "!");
  assertEquals(spinnerGlyph("idle"), " ");
  assertEquals(renderSpinner("Loading data", "loading", 1, ["|", "/"], 20), "/ Loading data");
  assertEquals(renderSpinner("Loading data", "loading", 1, ["|", "/"], 8), "/ Loadi…");
});

Deno.test("scroll helpers clamp offsets and expose scrollbar thumb state", () => {
  const max = maxScrollOffset(80, 40, 20, 10);
  assertEquals(max, { columns: 60, rows: 30 });
  assertEquals(clampScrollOffset({ columns: 70, rows: -4 }, max), { columns: 60, rows: 0 });
  assertEquals(scrollOffsetBy({ columns: 10, rows: 10 }, max, -2, 25), { columns: 8, rows: 30 });

  const thumb = scrollbarThumb(40, 10, 15);
  assertEquals(thumb, { start: 4, size: 3, visible: true });
  assertEquals(scrollbarGlyph(3, thumb), "│");
  assertEquals(scrollbarGlyph(4, thumb), "█");
  assertEquals(scrollbarThumb(8, 10, 0).visible, false);
  assertEquals(scrollbarOffsetForPointer(40, 10, 0), 0);
  assertEquals(scrollbarOffsetForPointer(40, 10, 9), 30);
  assertEquals(scrollbarOffsetForPointer(8, 10, 8), 0);
});

Deno.test("ScrollAreaController inspects and clamps viewport offsets", () => {
  const controller = new ScrollAreaController({
    contentWidth: 80,
    contentHeight: 40,
    viewportWidth: 20,
    viewportHeight: 10,
    offset: { columns: 90, rows: 15 },
  });

  assertEquals(controller.inspect(), {
    contentWidth: 80,
    contentHeight: 40,
    viewportWidth: 20,
    viewportHeight: 10,
    maxOffset: { columns: 60, rows: 30 },
    offset: { columns: 60, rows: 15 },
    horizontalThumb: { start: 15, size: 5, visible: true },
    verticalThumb: { start: 4, size: 3, visible: true },
    visibleColumns: { start: 60, end: 80 },
    visibleRows: { start: 15, end: 25 },
    canScrollColumns: true,
    canScrollRows: true,
    showScrollbar: true,
  });

  assertEquals(controller.scrollBy(-10, 100), { columns: 50, rows: 30 });
  assertEquals(controller.setViewportSize(100, 100), { columns: 0, rows: 0 });
  controller.setViewportSize(20, 10);
  controller.scrollTo(60, 30);
  assertEquals(controller.inspectOverflow().rows.scrollbarVisible, true);
  controller.setScrollbarVisible(false);
  assertEquals(controller.inspect().showScrollbar, false);
  assertEquals(controller.inspectOverflow().rows.canScroll, true);
  assertEquals(controller.inspectOverflow().rows.scrollbarVisible, false);
  controller.dispose();
});

Deno.test("ScrollArea component syncs offsets without recursive updates", async () => {
  const tui = createFakeTui();
  const contentHeight = new Signal(20);
  const area = new ScrollArea({
    parent: tui,
    theme: {},
    zIndex: 1,
    rectangle: { column: 0, row: 0, width: 12, height: 4 },
    contentHeight,
  });

  area.scrollBy(0, 8);
  assertEquals(area.offset.peek(), { columns: 0, rows: 8 });
  assertEquals(area.contentView.offset.peek(), { columns: 0, rows: 8 });

  await Promise.resolve();
  contentHeight.value = 3;
  assertEquals(area.offset.peek(), { columns: 0, rows: 0 });
  assertEquals(area.contentView.offset.peek(), { columns: 0, rows: 0 });
  assertEquals(area.contentView.maxOffset.peek(), { columns: 0, rows: 0 });

  area.destroy();
});

Deno.test("scrollAreaCommands drive movement and scrollbar visibility", async () => {
  const controller = new ScrollAreaController({
    contentWidth: 80,
    contentHeight: 40,
    viewportWidth: 20,
    viewportHeight: 10,
  });
  const registry = new CommandRegistry();
  const actions: unknown[] = [];
  const dispose = bindScrollAreaCommands(registry, controller, {
    id: "main",
    idPrefix: "viewport.main",
    group: "viewport",
    includeScrollbarCommands: true,
  });

  assertEquals(scrollAreaCommands(new ScrollAreaController()).map((command) => command.id), [
    "scroll.up",
    "scroll.down",
    "scroll.left",
    "scroll.right",
    "scroll.pageUp",
    "scroll.pageDown",
    "scroll.home",
    "scroll.end",
  ]);
  assertEquals(registry.list("viewport").map((command) => command.id), [
    "viewport.main.scrollbar.hide",
    "viewport.main.pageDown",
    "viewport.main.pageUp",
    "viewport.main.down",
    "viewport.main.end",
    "viewport.main.home",
    "viewport.main.left",
    "viewport.main.right",
    "viewport.main.up",
    "viewport.main.scrollbar.show",
  ]);

  assertEquals(await registry.execute("viewport.main.pageDown", (action) => void actions.push(action)), true);
  assertEquals(controller.offset.peek(), { columns: 0, rows: 9 });
  assertEquals(await registry.execute("viewport.main.end", (action) => void actions.push(action)), true);
  assertEquals(controller.offset.peek(), { columns: 0, rows: 30 });
  assertEquals(await registry.execute("viewport.main.scrollbar.hide", (action) => void actions.push(action)), true);
  assertEquals(controller.showScrollbar.peek(), false);
  assertEquals(actions.at(-1), {
    type: "scrollArea.scrollbarChanged",
    payload: {
      id: "main",
      visible: false,
      inspection: controller.inspect(),
    },
  });

  dispose();
  assertEquals(registry.list("viewport"), []);
  controller.dispose();
});

Deno.test("pad helpers render off-screen content slices", () => {
  const content = ["alpha", "beta-gamma", "delta"];

  assertEquals(measurePadContent(content), { width: 10, height: 3 });
  assertEquals(clampPadCursor({ row: 20, column: -4 }, { width: 10, height: 3 }), { row: 2, column: 0 });
  assertEquals(renderPadRows(content, { width: 4, height: 3, offset: { columns: 2, rows: 1 } }), [
    { row: 0, sourceRow: 1, text: "ta-g" },
    { row: 1, sourceRow: 2, text: "lta " },
    { row: 2, sourceRow: 3, text: "    " },
  ]);
  assertEquals(renderPadRows("a\nb", { width: 3, height: 2, fill: "." }).map((row) => row.text), ["a..", "b.."]);
});

Deno.test("PadController writes content reveals cursor and maps scrollbars", () => {
  const controller = new PadController({
    content: ["alpha", "beta", "gamma", "delta"],
    viewportWidth: 4,
    viewportHeight: 2,
  });

  assertEquals(controller.write(2, 3, "XYZ"), { width: 6, height: 4 });
  assertEquals(controller.lines()[2], "gamXYZ");
  assertEquals(controller.setCursor(3, 5), { row: 3, column: 5 });
  assertEquals(controller.scroll.offset.peek(), { columns: 2, rows: 2 });
  assertEquals(controller.viewportRows().map((row) => row.text), ["mXYZ", "lta "]);
  assertEquals(controller.scrollbarOffsetForPointer("vertical", 1), 2);
  assertEquals(controller.handleKeyPress(keyPress("up")), { columns: 2, rows: 1 });
  assertEquals(controller.handleKeyPress(keyPress("left")), { columns: 1, rows: 1 });
  assertEquals(controller.inspect().cursor, { row: 3, column: 5 });

  controller.appendLine("epsilon");
  assertEquals(controller.inspect().contentHeight, 5);
  assertEquals(controller.clear(), { width: 0, height: 0 });
  assertEquals(controller.inspect().offset, { columns: 0, rows: 0 });
  controller.dispose();
});

Deno.test("padCommands expose movement and cursor reveal actions", async () => {
  const controller = new PadController({
    content: ["alpha", "beta", "gamma", "delta"],
    viewportWidth: 2,
    viewportHeight: 2,
  });
  const registry = new CommandRegistry();
  const actions: unknown[] = [];
  const dispose = bindPadCommands(registry, controller, {
    id: "log",
    idPrefix: "pad.log",
    group: "viewport",
  });

  assertEquals(padCommands(new PadController()).map((command) => command.id), [
    "pad.up",
    "pad.down",
    "pad.left",
    "pad.right",
    "pad.pageUp",
    "pad.pageDown",
    "pad.home",
    "pad.end",
    "pad.cursor.reveal",
  ]);
  assertEquals(await registry.execute("pad.log.pageDown", (action) => void actions.push(action)), true);
  assertEquals(controller.scroll.offset.peek(), { columns: 0, rows: 1 });
  controller.setCursor(3, 4, { reveal: false });
  assertEquals(await registry.execute("pad.log.cursor.reveal", (action) => void actions.push(action)), true);
  assertEquals(controller.scroll.offset.peek(), { columns: 3, rows: 2 });
  assertEquals(actions.at(-1), {
    type: "pad.cursorRevealed",
    payload: {
      id: "log",
      inspection: controller.inspect(),
    },
  });

  dispose();
  assertEquals(registry.list("viewport"), []);
  controller.dispose();
});

Deno.test("renderStatusBar keeps left and right content inside width", () => {
  assertEquals(renderStatusBar("READY", "12:00", 12), "READY  12:00");
  assertEquals(renderStatusBar("READY", "12:00", 10), "REA  12:00");
  assertEquals(renderStatusBar("LONG LEFT", "RIGHT", 8), "LONG LEF");
  assertEquals(renderStatusBar("LONG LEFT", "RIGHT", 8, "right"), "L  RIGHT");
  assertEquals(renderStatusBar("READY", "12:00", 0), "");
  assertEquals(renderStatusBar("left segment", "right segment", 18), "left segme  right ");
  assertEquals(renderStatusBar("left segment", "right segment", 18, "right"), "lef  right segment");
});

Deno.test("TextLineCache reuses line snapshots until text changes", () => {
  const cache = new TextLineCache();
  const first = cache.lines("alpha\nbeta");
  const second = cache.lines("alpha\nbeta");
  const third = cache.lines("alpha\nbeta\ngamma");

  assertEquals(first, ["alpha", "beta"]);
  assertEquals(first === second, true);
  assertEquals(first === third, false);
  assertEquals(third, ["alpha", "beta", "gamma"]);
  assertEquals(cache.inspect(), { text: "alpha\nbeta\ngamma", lineCount: 3 });
});

Deno.test("TextBoxController edits multiline text and inspects cursor state", () => {
  const changes: string[] = [];
  const controller = new TextBoxController({
    text: "alpha\nbeta",
    cursorPosition: { x: 5, y: 0 },
    validator: /[a-z ]/,
    lineHighlighting: true,
    lineNumbering: true,
    onChange: (value) => void changes.push(value),
  });

  assertEquals(controller.handleKeyPress(keyPress("return")), "changed");
  assertEquals(controller.text.peek(), "alpha\n\nbeta");
  assertEquals(controller.insert("X"), false);
  assertEquals(controller.insert("g"), true);
  assertEquals(controller.inspect(), {
    text: "alpha\ng\nbeta",
    lines: ["alpha", "g", "beta"],
    lineCount: 3,
    cursorPosition: { x: 1, y: 1 },
    currentLine: "g",
    empty: false,
    valid: true,
    lineHighlighting: true,
    lineNumbering: true,
    wordWrap: false,
  });

  assertEquals(controller.handleKeyPress(keyPress("backspace")), "changed");
  assertEquals(controller.text.peek(), "alpha\n\nbeta");
  assertEquals(controller.handleKeyPress(keyPress("backspace")), "changed");
  assertEquals(controller.text.peek(), "alpha\nbeta");
  assertEquals(controller.cursorPosition.peek(), { x: 5, y: 0 });
  controller.end();
  assertEquals(controller.cursorPosition.peek(), { x: 5, y: 0 });
  controller.setText("one\ntwo", { x: 99, y: 99 });
  assertEquals(controller.cursorPosition.peek(), { x: 3, y: 1 });
  assertEquals(changes.at(-1), "one\ntwo");
  controller.dispose();
});

Deno.test("TextBoxController edits and validates whole graphemes on each logical line", () => {
  const value = "A😀e\u0301Z\ne\u0301";
  const cursor = new Signal({ x: 2, y: 0 }, { deepObserve: true });
  const controller = new TextBoxController({
    text: value,
    cursorPosition: cursor,
    multiCodePointSupport: true,
  });

  assertEquals(cursor.peek(), { x: 1, y: 0 });
  assertEquals(controller.moveCursor({ x: 1 }), { x: 3, y: 0 });
  assertEquals(controller.moveCursor({ x: 1 }), { x: 5, y: 0 });
  assertEquals(controller.backspace(), true);
  assertEquals(controller.text.peek(), "A😀Z\ne\u0301");
  assertEquals(controller.cursorPosition.peek(), { x: 3, y: 0 });
  assertEquals(controller.delete(), true);
  assertEquals(controller.text.peek(), "A😀\ne\u0301");

  cursor.value = { x: 1, y: 1 };
  assertEquals(cursor.peek(), { x: 0, y: 1 });
  assertEquals(controller.accepts("e\u0301"), true);
  assertEquals(controller.accepts("👩‍👩"), true);
  assertEquals(controller.accepts("ab"), false);
  controller.dispose();

  const singleCodePoint = new TextBoxController();
  assertEquals(singleCodePoint.accepts("é"), true);
  assertEquals(singleCodePoint.accepts("e\u0301"), false);
  assertEquals(singleCodePoint.accepts("😀"), false);
  singleCodePoint.dispose();

  const validated = new TextBoxController({
    text: "e\u0301e\u0301\ne\u0301",
    validator: /^e\u0301$/,
    multiCodePointSupport: true,
  });
  assertEquals(validated.inspect().valid, true);
  validated.dispose();

  const reactiveCursor = new Signal({ x: 0, y: 0 }, { deepObserve: true });
  const reactive = new TextBoxController({
    text: "A😀Z",
    cursorPosition: reactiveCursor,
    multiCodePointSupport: true,
  });
  const retainedRoot = reactiveCursor.peek();
  reactive.moveCursor({ x: 1 });
  reactive.moveCursor({ x: 1 });
  assertEquals(reactiveCursor.peek(), { x: 3, y: 0 });
  assertEquals(reactiveCursor.peek() === retainedRoot, true);
  const emitted: CursorPosition[] = [];
  reactiveCursor.subscribe((position) => emitted.push({ ...position }));
  reactiveCursor.value.x = 2;
  assertEquals(reactiveCursor.peek(), { x: 1, y: 0 });
  assertEquals(reactiveCursor.peek() === retainedRoot, true);
  assertEquals(emitted.at(-1), { x: 1, y: 0 });
  reactive.dispose();
});

Deno.test("TextBoxController exposes canonical directional multiline selection", () => {
  const controller = new TextBoxController({
    text: "A😀e\u0301Z\nsecond",
    multiCodePointSupport: true,
  });

  assertEquals(controller.setSelection({ x: 2, y: 0 }, { x: 3, y: 1 }), {
    anchor: { x: 1, y: 0 },
    focus: { x: 3, y: 1 },
  });
  assertEquals(controller.cursorPosition.peek(), { x: 3, y: 1 });
  assertEquals(controller.selectionRange(), {
    start: { x: 1, y: 0 },
    end: { x: 3, y: 1 },
  });
  assertEquals(controller.selectedText(), "😀e\u0301Z\nsec");
  assertEquals(controller.inspect().selection, {
    anchor: { x: 1, y: 0 },
    focus: { x: 3, y: 1 },
  });
  assertEquals(controller.inspect().selectedText, "😀e\u0301Z\nsec");

  assertEquals(controller.collapseSelection("start"), { x: 1, y: 0 });
  assertEquals(controller.selection.peek(), undefined);
  assertEquals(controller.inspect().selection, undefined);
  controller.selectAll();
  assertEquals(controller.selectedText(), controller.text.peek());
  controller.clearSelection();
  assertEquals(controller.selectionRange(), undefined);

  controller.selection.value = {
    anchor: { x: 4, y: 0 },
    focus: { x: 99, y: 1 },
  };
  assertEquals(controller.selection.peek(), {
    anchor: { x: 3, y: 0 },
    focus: { x: 6, y: 1 },
  });
  assertEquals(controller.cursorPosition.peek(), { x: 6, y: 1 });
  controller.dispose();
});

Deno.test("TextBoxController keyboard selection and editing replace one range", () => {
  const changes: string[] = [];
  const controller = new TextBoxController({
    text: "a😀b\ncd",
    multiCodePointSupport: true,
    onChange: (value) => void changes.push(value),
  });

  assertEquals(controller.handleKeyPress(keyPress("right", { shift: true })), "moved");
  assertEquals(controller.selectedText(), "a");
  controller.handleKeyPress(keyPress("right", { shift: true }));
  assertEquals(controller.selectedText(), "a😀");
  assertEquals(controller.cursorPosition.peek(), { x: 3, y: 0 });
  controller.handleKeyPress(keyPress("end", { shift: true }));
  assertEquals(controller.selectedText(), "a😀b");
  assertEquals(controller.handleKeyPress(keyPress("a", { ctrl: true })), "moved");
  assertEquals(controller.selectedText(), "a😀b\ncd");

  assertEquals(controller.handleKeyPress(keyPress("x")), "changed");
  assertEquals(controller.text.peek(), "x");
  assertEquals(controller.cursorPosition.peek(), { x: 1, y: 0 });
  assertEquals(controller.selection.peek(), undefined);
  assertEquals(changes, ["x"]);

  controller.setText("abcd", { x: 4, y: 0 });
  controller.handleKeyPress(keyPress("left", { shift: true }));
  controller.handleKeyPress(keyPress("left"));
  assertEquals(controller.cursorPosition.peek(), { x: 3, y: 0 });
  assertEquals(controller.selection.peek(), undefined);
  controller.dispose();
});

Deno.test("TextBoxController insertText atomically replaces multiline selections", () => {
  const changes: string[] = [];
  const controller = new TextBoxController({
    text: "one two three",
    multiCodePointSupport: true,
    onChange: (value) => void changes.push(value),
  });
  controller.setSelection({ x: 4, y: 0 }, { x: 7, y: 0 });

  assertEquals(controller.insertText("2\r\nβ"), true);
  assertEquals(controller.text.peek(), "one 2\nβ three");
  assertEquals(controller.cursorPosition.peek(), { x: 1, y: 1 });
  assertEquals(controller.selection.peek(), undefined);
  assertEquals(changes, ["one 2\nβ three"]);

  const validated = new TextBoxController({
    text: "A",
    cursorPosition: { x: 1, y: 0 },
    validator: /^[A-Z]$/,
  });
  assertEquals(validated.insertText("BC\nD"), true);
  assertEquals(validated.text.peek(), "ABC\nD");
  assertEquals(validated.insertText("β"), false);
  assertEquals(validated.text.peek(), "ABC\nD");
  validated.dispose();
  controller.dispose();
});

Deno.test("TextBoxController literal find counts boundary-aligned matches and wraps", () => {
  const controller = new TextBoxController({
    text: "e\u0301 x e\u0301",
    multiCodePointSupport: true,
  });
  const matches = controller.findAll("e\u0301");

  assertEquals(matches, [
    { start: { x: 0, y: 0 }, end: { x: 2, y: 0 } },
    { start: { x: 5, y: 0 }, end: { x: 7, y: 0 } },
  ]);
  assertEquals(structuredClone(matches), matches);
  assertEquals(controller.findAll("\u0301"), []);
  assertEquals(controller.findAll("E\u0301"), []);

  const first = controller.findNext("e\u0301");
  assertEquals(first, {
    query: "e\u0301",
    range: matches[0],
    index: 0,
    total: 2,
    wrapped: false,
  });
  assertEquals(controller.selectedText(), "e\u0301");
  assertEquals(controller.findNext("e\u0301")?.index, 1);
  const wrapped = controller.findNext("e\u0301");
  assertEquals({ index: wrapped?.index, total: wrapped?.total, wrapped: wrapped?.wrapped }, {
    index: 0,
    total: 2,
    wrapped: true,
  });
  const previous = controller.findNext("e\u0301", { direction: "backward" });
  assertEquals({ index: previous?.index, wrapped: previous?.wrapped }, { index: 1, wrapped: true });
  assertEquals(
    controller.find("e\u0301", { direction: "forward", from: { x: 7, y: 0 }, wrap: false }),
    undefined,
  );
  controller.dispose();
});

Deno.test("TextBoxController replaceSelection and replaceAll emit one change", () => {
  const selectionChanges: string[] = [];
  const selected = new TextBoxController({
    text: "A😀Z",
    multiCodePointSupport: true,
    onChange: (value) => void selectionChanges.push(value),
  });
  selected.setSelection({ x: 1, y: 0 }, { x: 3, y: 0 });
  assertEquals(selected.replaceSelection("e\u0301"), true);
  assertEquals(selected.text.peek(), "Ae\u0301Z");
  assertEquals(selectionChanges, ["Ae\u0301Z"]);
  selected.dispose();

  const changes: string[] = [];
  const controller = new TextBoxController({
    text: "😀x 😀x",
    multiCodePointSupport: true,
    onChange: (value) => void changes.push(value),
  });
  const result = controller.replaceAll("😀", "e\u0301");
  assertEquals(result, {
    matchCount: 2,
    replacements: 2,
    changed: true,
    limited: false,
    text: "e\u0301x e\u0301x",
    cursorPosition: { x: 6, y: 0 },
  });
  assertEquals(structuredClone(result), result);
  assertEquals(changes, ["e\u0301x e\u0301x"]);
  assertEquals(controller.replaceAll("\u0301", "x").replacements, 0);
  assertEquals(controller.replaceAll("e\u0301", "e\u0301"), {
    matchCount: 2,
    replacements: 2,
    changed: false,
    limited: false,
    text: "e\u0301x e\u0301x",
    cursorPosition: { x: 6, y: 0 },
  });
  assertEquals(changes, ["e\u0301x e\u0301x"]);
  controller.dispose();
});

Deno.test("TextBoxController rejects oversized edits and replace-all expansion without partial mutation", () => {
  const controller = new TextBoxController({ text: "aaaa", maxLength: 8 });

  assertEquals(controller.insertText("12345"), false);
  assertEquals(controller.text.peek(), "aaaa");
  assertEquals(controller.replaceAll("a", "123", { maxTextLength: 8 }), {
    matchCount: 4,
    replacements: 0,
    changed: false,
    limited: true,
    text: "aaaa",
    cursorPosition: { x: 0, y: 0 },
  });
  assertEquals(controller.replaceAll("a", "b", { maxReplacements: 3 }).limited, true);
  assertEquals(controller.text.peek(), "aaaa");
  assertEquals(controller.inspect().maxLength, 8);
  assertEquals(controller.inspect().valid, true);
  assertThrows(() => controller.setText("123456789"), RangeError);
  controller.dispose();
});

Deno.test("TextBox renders selection overlays across wrapped and unwrapped rows", async () => {
  const upper = (value: string) => value.toLocaleUpperCase("en-US");
  const wrapped = new TextBoxController({ text: "abcdefgh", wordWrap: true });
  const unwrapped = new TextBoxController({ text: "abcdef" });
  wrapped.setSelection({ x: 1, y: 0 }, { x: 7, y: 0 });
  unwrapped.setSelection({ x: 2, y: 0 }, { x: 4, y: 0 });
  const harness = await createTestTerminalApp({
    size: { columns: 8, rows: 5 },
    setup(app) {
      for (
        const [controller, rectangle] of [
          [wrapped, { column: 0, row: 0, width: 4, height: 2 }],
          [unwrapped, { column: 0, row: 3, width: 5, height: 1 }],
        ] as const
      ) {
        const textBox = new TextBox({
          parent: app.tui,
          controller,
          theme: {
            base: (value) => value,
            cursor: { base: (value) => value },
            selection: { base: upper },
          },
          zIndex: 1,
          rectangle,
        });
        app.registerComponent(textBox);
      }
    },
  });

  try {
    assertEquals(harness.pilot.snapshot(), "aBCD\nEFGh\n\nabCDe");
  } finally {
    harness.destroy();
    wrapped.dispose();
    unwrapped.dispose();
  }
});

Deno.test("TextBoxController exposes wrapped visual lines and cursor projection", () => {
  const lines = ["alpha beta gamma", "", "delta"];
  assertEquals(wrapTextBoxLines(lines, 7, { wordWrap: true }), [
    { lineIndex: 0, startColumn: 0, endColumn: 5, text: "alpha", continuation: false },
    { lineIndex: 0, startColumn: 6, endColumn: 10, text: "beta", continuation: true },
    { lineIndex: 0, startColumn: 11, endColumn: 16, text: "gamma", continuation: true },
    { lineIndex: 1, startColumn: 0, endColumn: 0, text: "", continuation: false },
    { lineIndex: 2, startColumn: 0, endColumn: 5, text: "delta", continuation: false },
  ]);
  assertEquals(textBoxVisualCursor(lines, { x: 8, y: 0 }, 7, { wordWrap: true }), {
    row: 1,
    column: 2,
    line: { lineIndex: 0, startColumn: 6, endColumn: 10, text: "beta", continuation: true },
  });
  assertEquals(wrapTextBoxLines(["alpha beta"], 20, { wordWrap: false }), [
    { lineIndex: 0, startColumn: 0, endColumn: 10, text: "alpha beta", continuation: false },
  ]);

  const unicodeLine = "e\u0301界x";
  assertEquals(wrapTextBoxLines([unicodeLine], 3, { wordWrap: true }), [
    { lineIndex: 0, startColumn: 0, endColumn: 3, text: "e\u0301界", continuation: false },
    { lineIndex: 0, startColumn: 3, endColumn: 4, text: "x", continuation: true },
  ]);
  assertEquals(textBoxVisualCursor([unicodeLine], { x: 2, y: 0 }, 3, { wordWrap: true }).column, 1);

  const reusable = wrapTextBoxLines(lines, 7, { wordWrap: true });
  const first = reusable[0];
  const secondPass = wrapTextBoxLinesInto(reusable, ["short"], 20, { wordWrap: false });
  assertEquals(secondPass === reusable, true);
  assertEquals(secondPass[0] === first, true);
  assertEquals(secondPass, [
    { lineIndex: 0, startColumn: 0, endColumn: 5, text: "short", continuation: false },
  ]);
  assertEquals(wrapTextBoxLinesInto(reusable, [], 10), [
    { lineIndex: 0, startColumn: 0, endColumn: 0, text: "", continuation: false },
  ]);

  assertEquals(wrapTextBoxLines(["😀e\u0301Z"], 1, { wordWrap: true }), [
    { lineIndex: 0, startColumn: 0, endColumn: 2, text: " ", continuation: false },
    { lineIndex: 0, startColumn: 2, endColumn: 4, text: "e\u0301", continuation: true },
    { lineIndex: 0, startColumn: 4, endColumn: 5, text: "Z", continuation: true },
  ]);

  const spaceWithCombiningMark = "a \u0301b";
  const spaceBoundaries = graphemeBoundaries(spaceWithCombiningMark);
  const spaceWrapped = wrapTextBoxLines([spaceWithCombiningMark], 2, { wordWrap: true });
  assertEquals(spaceWrapped, [
    { lineIndex: 0, startColumn: 0, endColumn: 3, text: "a \u0301", continuation: false },
    { lineIndex: 0, startColumn: 3, endColumn: 4, text: "b", continuation: true },
  ]);
  assertEquals(
    spaceWrapped.every((line) =>
      spaceBoundaries.includes(line.startColumn) && spaceBoundaries.includes(line.endColumn)
    ),
    true,
  );
});

Deno.test("textBoxCommands clear move cursor and set preset values", async () => {
  const controller = new TextBoxController({ text: "one\ntwo", cursorPosition: { x: 1, y: 1 } });
  const registry = new CommandRegistry();
  const dispose = bindTextBoxCommands(registry, controller, {
    id: "notes",
    idPrefix: "textbox.notes",
    group: "editor",
    includeValueCommands: true,
    values: ["todo", "done\nship"],
  });
  const actions: unknown[] = [];

  assertEquals(textBoxCommands(new TextBoxController()).map((command) => [command.id, commandDisabled(command)]), [
    ["textbox.clear", true],
    ["textbox.home", false],
    ["textbox.left", false],
    ["textbox.right", false],
    ["textbox.up", false],
    ["textbox.down", false],
    ["textbox.end", false],
  ]);
  assertEquals(registry.list("editor").map((command) => command.id), [
    "textbox.notes.clear",
    "textbox.notes.value.done%0Aship",
    "textbox.notes.value.todo",
    "textbox.notes.down",
    "textbox.notes.left",
    "textbox.notes.right",
    "textbox.notes.up",
    "textbox.notes.end",
    "textbox.notes.home",
  ]);

  assertEquals(await registry.execute("textbox.notes.up", (action) => void actions.push(action)), true);
  assertEquals(controller.cursorPosition.peek(), { x: 1, y: 0 });
  assertEquals(actions[0], {
    type: "textbox.cursorMoved",
    payload: { id: "notes", inspection: controller.inspect() },
  });
  assertEquals(await registry.execute("textbox.notes.value.done%0Aship", (action) => void actions.push(action)), true);
  assertEquals(controller.text.peek(), "done\nship");
  assertEquals(await registry.execute("textbox.notes.clear", (action) => void actions.push(action)), true);
  assertEquals(controller.inspect().empty, true);

  dispose();
  assertEquals(registry.list("editor"), []);
  controller.dispose();
});

Deno.test("keymap registry formats sorted bindings", () => {
  const registry = new KeymapRegistry();
  registry.register({ key: "p", description: "palette", ctrl: true, group: "global" });
  registry.register({ key: "q", description: "quit", group: "global" });

  assertEquals(formatKeyBinding({ key: "p", description: "palette", ctrl: true }), "C-p palette");
  assertEquals(renderKeyHelp(registry.list("global"), 40), "C-p palette  q quit");
  assertEquals(renderKeyHelp(registry.list("global"), 18), "C-p palette  q qui");
  assertEquals(renderKeyHelp(registry.list("global"), 0), "");
  assertEquals(registry.inspect("global"), {
    count: 2,
    groups: ["global"],
    bindings: [
      { id: "C-p", key: "p", description: "palette", ctrl: true, group: "global" },
      { id: "q", key: "q", description: "quit", group: "global" },
    ],
  });
});

Deno.test("keymap registry supports bulk registration replacement and clearing", () => {
  const registry = new KeymapRegistry();
  const disposeGlobal = registry.registerAll([
    { key: "q", description: "quit", group: "global" },
    { key: "s", description: "save", ctrl: true, group: "file" },
  ]);
  const disposeReplacement = registry.register({ key: "q", description: "quick open", group: "global" });

  assertEquals(registry.has({ key: "q" }), true);
  assertEquals(registry.get({ key: "q" })?.description, "quick open");
  assertEquals(registry.groups(), ["file", "global"]);

  disposeGlobal();
  assertEquals(registry.get({ key: "q" })?.description, "quick open");
  assertEquals(registry.has({ key: "s", ctrl: true }), false);

  disposeReplacement();
  assertEquals(registry.has({ key: "q" }), false);

  registry.registerAll([
    { key: "1", description: "one", group: "numbers" },
    { key: "2", description: "two", group: "numbers" },
    { key: "x", description: "exit", group: "global" },
  ]);
  registry.clear("numbers");
  assertEquals(registry.inspect(), {
    count: 1,
    groups: ["global"],
    bindings: [{ id: "x", key: "x", description: "exit", group: "global" }],
  });
  registry.clear();
  assertEquals(registry.inspect(), { count: 0, groups: [], bindings: [] });
});

function keyPress(key: Key, options: Partial<Omit<KeyPressEvent, "key" | "buffer">> = {}): KeyPressEvent {
  return {
    key,
    ctrl: options.ctrl ?? false,
    meta: options.meta ?? false,
    shift: options.shift ?? false,
    buffer: new Uint8Array(),
  };
}

function createFakeTui(): Tui {
  const root = {
    children: [] as Component[],
    components: new Set<Component>(),
    on: () => () => undefined,
    addChild(child: Component) {
      this.children.push(child);
      this.components.add(child);
    },
  };
  return root as unknown as Tui;
}

Deno.test("modalActionRects spreads one row when it fits and stacks when narrow", async () => {
  const { modalActionRects } = await import("../src/components/modal.ts");
  const wide = modalActionRects({ column: 10, row: 5, width: 50, height: 8 }, [10, 8]);
  assertEquals(wide.stacked, false);
  assertEquals(wide.rects.length, 2);
  assertEquals(wide.rects[0]!.row, wide.rects[1]!.row, "one bottom row");
  assertEquals(wide.rects[0]!.column, 12);
  assertEquals(wide.rects[1]!.column > wide.rects[0]!.column + 10, true, "slack spreads the buttons");

  // Too narrow for [10, 10, 13] + gaps: the buttons stack vertically so a
  // destructive choice is never an adjacent mis-hit target.
  const narrow = modalActionRects({ column: 0, row: 0, width: 20, height: 8 }, [10, 10, 13]);
  assertEquals(narrow.stacked, true);
  const rows = narrow.rects.map((rect) => rect.row);
  assertEquals(new Set(rows).size, 3, "one row per button");
  assertEquals(rows, [...rows].sort((a, b) => a - b), "stacked top to bottom");
  assertEquals(narrow.rects[0]!.column, 2);
});

Deno.test("ModalController arrows a stacked modal with up/down", async () => {
  const { ModalController } = await import("../src/components/modal.ts");
  const modal = new ModalController({
    title: "End session?",
    actions: [
      { id: "cancel", label: "Cancel" },
      { id: "detach", label: "Detach", default: true },
      { id: "terminate", label: "Terminate", destructive: true },
    ],
  });
  try {
    modal.open();
    assertEquals(modal.selectedAction()?.id, "detach");
    modal.handleKeyPress({ key: "down" });
    assertEquals(modal.selectedAction()?.id, "terminate");
    modal.handleKeyPress({ key: "up" });
    modal.handleKeyPress({ key: "up" });
    assertEquals(modal.selectedAction()?.id, "cancel");
  } finally {
    modal.dispose();
  }
});

Deno.test("contextMenuPlacement anchors at the cursor and clamps on screen", async () => {
  const { contextMenuPlacement } = await import("../src/components/context_menu.ts");
  const bounds = { column: 0, row: 0, width: 80, height: 24 };
  // Anchored well inside: the menu opens at the cursor.
  assertEquals(contextMenuPlacement(bounds, 20, 8, { column: 30, row: 10 }), {
    column: 30,
    row: 10,
    width: 20,
    height: 8,
  });
  // Anchored at the bottom-right corner: clamped fully on screen.
  assertEquals(contextMenuPlacement(bounds, 20, 8, { column: 75, row: 22 }), {
    column: 60,
    row: 16,
    width: 20,
    height: 8,
  });
  // No anchor: the caller's docked position, itself clamped.
  assertEquals(contextMenuPlacement(bounds, 20, 8, undefined, { column: 0, row: 1 }), {
    column: 0,
    row: 1,
    width: 20,
    height: 8,
  });
});

Deno.test("ContextMenu renders danger items and selection through itemStyle", async () => {
  const { ContextMenu } = await import("../src/components/context_menu.ts");
  const { WidgetSurface, widgetSurfaceCellData } = await import("../mod.app.ts");
  const { createAnsiStyle } = await import("../src/theme.ts");
  const base = createAnsiStyle({ foreground: [220, 220, 220], background: [20, 22, 30] });
  const danger = createAnsiStyle({ foreground: [240, 60, 60], background: [20, 22, 30], bold: true });
  const selected = createAnsiStyle({ foreground: [0, 0, 0], background: [120, 180, 250], bold: true });
  const surface = new WidgetSurface(20, 4);
  try {
    surface.mount((tui) => [
      new ContextMenu({
        parent: tui,
        zIndex: 1,
        rectangle: { column: 0, row: 0, width: 20, height: 4 },
        theme: { base },
        items: [
          { id: "new", label: "New terminal" },
          { id: "help", label: "Help" },
          { id: "quit", label: "Quit", danger: true },
        ],
        itemStyle: (item, isSelected) => isSelected ? selected : item.danger ? danger : base,
      }),
    ]);
    await surface.render();
    // Row 0 is the selection block, row 2 the danger-toned Quit.
    const selectedCell = widgetSurfaceCellData(surface.cellAt(0, 3));
    assertEquals(selectedCell?.background, [120, 180, 250]);
    const dangerCell = widgetSurfaceCellData(surface.cellAt(2, 3));
    assertEquals(dangerCell?.foreground, [240, 60, 60]);
    assertEquals(dangerCell?.bold, true);
    let quitRow = "";
    for (let column = 0; column < 20; column += 1) {
      quitRow += widgetSurfaceCellData(surface.cellAt(2, column))?.glyph ?? " ";
    }
    assertEquals(quitRow.includes("Quit"), true);
  } finally {
    surface.dispose();
  }
});
