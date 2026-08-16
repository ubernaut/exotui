// Copyright 2023 Im-Beast. MIT license.
import { ButtonController } from "../components/button.ts";
import { CheckBoxController } from "../components/checkbox.ts";
import { ComboBoxController } from "../components/combobox.ts";
import { InputController } from "../components/input.ts";
import { RadioGroupController, type RadioOption } from "../components/radio_group.ts";
import { ScrollAreaController } from "../components/scroll_area.ts";
import { SliderController, type SliderOrientation, type SliderTrackRectangle } from "../components/slider.ts";
import { type TabItem, TabsController } from "../components/tabs.ts";
import { TextBoxController } from "../components/textbox.ts";
import { TreeController, type TreeNode } from "../components/tree.ts";
import type { KeyPressEvent } from "../input_reader/types.ts";
import type { ComputedLayoutBox, LayoutNode, LayoutSolverResult } from "../layout/solver.ts";
import { walkLayoutNodes } from "../layout/solver.ts";

/** Public type alias for markup widget kinds understood by the default hydration registry. */
export type MarkupWidgetKind =
  | "button"
  | "checkbox"
  | "combobox"
  | "container"
  | "input"
  | "radio-group"
  | "scroll-area"
  | "slider"
  | "tabs"
  | "textbox"
  | "tree"
  | "window";

/** Public type alias for controllers produced by markup widget hydration. */
export type MarkupWidgetController =
  | ButtonController
  | CheckBoxController
  | ComboBoxController
  | InputController
  | RadioGroupController
  | ScrollAreaController
  | SliderController
  | TabsController
  | TextBoxController
  | TreeController;

/** Public interface describing an event routed to a hydrated markup widget. */
export type MarkupWidgetEvent =
  | { type: "input"; id: string; value: string }
  | { type: "key"; id: string; key: string; ctrl?: boolean; meta?: boolean; shift?: boolean; height?: number }
  | { type: "pointer"; id: string; column: number; row: number; track?: SliderTrackRectangle }
  | { type: "press"; id: string; method?: "keyboard" | "mouse"; now?: number }
  | { type: "scroll"; id: string; columns?: number; rows?: number }
  | { type: "select"; id: string; index?: number; value?: string }
  | { type: "set-value"; id: string; value: number }
  | { type: "toggle"; id: string };

/** Public interface describing a widget created from markup. */
export interface HydratedMarkupWidget {
  id: string;
  tag: string;
  kind: MarkupWidgetKind;
  node: LayoutNode;
  box?: ComputedLayoutBox;
  controller?: MarkupWidgetController;
  focusable: boolean;
  actions: readonly MarkupWidgetEvent["type"][];
}

/** Public interface describing a serializable hydrated widget snapshot. */
export interface HydratedMarkupWidgetInspection {
  id: string;
  tag: string;
  kind: MarkupWidgetKind;
  focusable: boolean;
  actions: readonly MarkupWidgetEvent["type"][];
  controller: string | undefined;
}

/** Public interface describing a serializable hydration snapshot. */
export interface MarkupWidgetHydrationInspection {
  widgetCount: number;
  focusOrder: string[];
  widgets: HydratedMarkupWidgetInspection[];
}

/** Public interface passed to markup widget factories. */
export interface MarkupWidgetFactoryContext {
  layout?: LayoutSolverResult;
  registry: MarkupWidgetHydrationRegistry;
}

/** Public interface returned by markup widget factories. */
export interface MarkupWidgetDescriptor {
  kind: MarkupWidgetKind;
  controller?: MarkupWidgetController;
  focusable?: boolean;
  actions?: readonly MarkupWidgetEvent["type"][];
}

/** Public type alias for a markup widget factory. */
export type MarkupWidgetFactory = (
  node: LayoutNode,
  context: MarkupWidgetFactoryContext,
) => MarkupWidgetDescriptor | undefined;

/** Options for hydrating markup widgets. */
export interface MarkupWidgetHydrationOptions {
  registry?: MarkupWidgetHydrationRegistry;
  layout?: LayoutSolverResult;
}

/** Registry that maps markup tags to controller factories. */
export class MarkupWidgetHydrationRegistry {
  readonly #factories = new Map<string, MarkupWidgetFactory>();

  register(tag: string, factory: MarkupWidgetFactory): this {
    this.#factories.set(normalizeTag(tag), factory);
    return this;
  }

  factoryFor(tag: string): MarkupWidgetFactory | undefined {
    return this.#factories.get(normalizeTag(tag));
  }

  hydrateNode(node: LayoutNode, context: MarkupWidgetFactoryContext): MarkupWidgetDescriptor | undefined {
    return this.factoryFor(node.tag)?.(node, context);
  }
}

/** Hydrated widget set with lookup, event dispatch, inspection, and disposal helpers. */
export class MarkupWidgetHydration {
  readonly widgets: HydratedMarkupWidget[];
  readonly byId: Map<string, HydratedMarkupWidget>;
  readonly focusOrder: string[];

  constructor(widgets: readonly HydratedMarkupWidget[]) {
    this.widgets = new Array<HydratedMarkupWidget>(widgets.length);
    this.byId = new Map<string, HydratedMarkupWidget>();
    const focusEntries: Array<{ id: string; tabIndex: number; order: number }> = [];
    for (let index = 0; index < widgets.length; index += 1) {
      const widget = widgets[index]!;
      this.widgets[index] = widget;
      this.byId.set(widget.id, widget);
      if (widget.focusable) {
        const tabIndex = tabIndexForWidget(widget);
        if (tabIndex >= 0) focusEntries.push({ id: widget.id, tabIndex, order: index });
      }
    }
    focusEntries.sort((left, right) => {
      const leftPositive = left.tabIndex > 0;
      const rightPositive = right.tabIndex > 0;
      if (leftPositive && rightPositive && left.tabIndex !== right.tabIndex) return left.tabIndex - right.tabIndex;
      if (leftPositive !== rightPositive) return leftPositive ? -1 : 1;
      return left.order - right.order;
    });
    const focusOrder = new Array<string>(focusEntries.length);
    for (let index = 0; index < focusEntries.length; index += 1) {
      focusOrder[index] = focusEntries[index]!.id;
    }
    this.focusOrder = focusOrder;
  }

  dispatch(event: MarkupWidgetEvent): boolean {
    const widget = this.byId.get(event.id);
    if (!widget) return false;
    return dispatchMarkupWidgetEvent(widget, event);
  }

  inspect(): MarkupWidgetHydrationInspection {
    const focusOrder = new Array<string>(this.focusOrder.length);
    for (let index = 0; index < this.focusOrder.length; index += 1) {
      focusOrder[index] = this.focusOrder[index]!;
    }
    const widgets = new Array<MarkupWidgetHydrationInspection["widgets"][number]>(this.widgets.length);
    for (let index = 0; index < this.widgets.length; index += 1) {
      const widget = this.widgets[index]!;
      const actions = new Array<MarkupWidgetEvent["type"]>(widget.actions.length);
      for (let actionIndex = 0; actionIndex < widget.actions.length; actionIndex += 1) {
        actions[actionIndex] = widget.actions[actionIndex]!;
      }
      widgets[index] = {
        id: widget.id,
        tag: widget.tag,
        kind: widget.kind,
        focusable: widget.focusable,
        actions,
        controller: widget.controller?.constructor.name,
      };
    }
    return {
      widgetCount: this.widgets.length,
      focusOrder,
      widgets,
    };
  }

  dispose(): void {
    for (const widget of this.widgets) {
      widget.controller?.dispose();
    }
  }
}

/** Creates the default registry for HTML-like TUI controls. */
export function createDefaultMarkupWidgetRegistry(): MarkupWidgetHydrationRegistry {
  const registry = new MarkupWidgetHydrationRegistry();
  registry
    .register("button", buttonWidget)
    .register("checkbox", checkboxWidget)
    .register("combo-box", comboboxWidget)
    .register("combobox", comboboxWidget)
    .register("div", containerWidget)
    .register("form", containerWidget)
    .register("input", inputWidget)
    .register("menu-bar", containerWidget)
    .register("panel", containerWidget)
    .register("radio-group", radioGroupWidget)
    .register("scroll-area", scrollAreaWidget)
    .register("select", comboboxWidget)
    .register("slider", sliderWidget)
    .register("statusbar", containerWidget)
    .register("tabs", tabsWidget)
    .register("text-box", textBoxWidget)
    .register("textarea", textBoxWidget)
    .register("textbox", textBoxWidget)
    .register("toolbar", containerWidget)
    .register("tree", treeWidget)
    .register("window", windowWidget);
  return registry;
}

/** Creates controllers for supported widgets in a layout tree. */
export function hydrateMarkupWidgets(
  root: LayoutNode,
  options: MarkupWidgetHydrationOptions = {},
): MarkupWidgetHydration {
  const registry = options.registry ?? createDefaultMarkupWidgetRegistry();
  const widgets: HydratedMarkupWidget[] = [];
  const context: MarkupWidgetFactoryContext = { layout: options.layout, registry };

  walkLayoutNodes(root, (node) => {
    const descriptor = registry.hydrateNode(node, context);
    if (!descriptor) return;
    widgets.push({
      id: node.id,
      tag: node.tag,
      kind: descriptor.kind,
      node,
      box: options.layout?.byId.get(node.id),
      controller: descriptor.controller,
      focusable: descriptor.focusable ?? Boolean(descriptor.controller),
      actions: descriptor.actions ?? defaultActionsForKind(descriptor.kind),
    });
  });

  return new MarkupWidgetHydration(widgets);
}

/** Dispatches one event to one hydrated markup widget. */
export function dispatchMarkupWidgetEvent(widget: HydratedMarkupWidget, event: MarkupWidgetEvent): boolean {
  const controller = widget.controller;
  if (!controller) return false;

  if (event.type === "press") {
    if (controller instanceof ButtonController) return controller.press(event.method, event.now);
    if (controller instanceof CheckBoxController) {
      controller.toggle();
      return true;
    }
    if (controller instanceof ComboBoxController) {
      controller.toggle();
      return true;
    }
    if (controller instanceof TreeController) {
      return Boolean(controller.selectActive());
    }
    return false;
  }

  if (event.type === "input") {
    if (controller instanceof InputController) {
      controller.setText(event.value);
      return true;
    }
    if (controller instanceof TextBoxController) {
      controller.setText(event.value);
      return true;
    }
    return false;
  }

  if (event.type === "key") {
    return dispatchKeyEvent(controller, event);
  }

  if (event.type === "pointer") {
    if (!(controller instanceof SliderController)) return false;
    const track = event.track ?? boxAsSliderTrack(widget.box, controller.orientation.peek());
    if (!track) return false;
    controller.handlePointer(track, event.column, event.row);
    return true;
  }

  if (event.type === "scroll") {
    const columns = event.columns ?? 0;
    const rows = event.rows ?? 0;
    if (controller instanceof ScrollAreaController) {
      controller.scrollBy(columns, rows);
      return true;
    }
    if (controller instanceof SliderController) {
      controller.handleScroll(rows || columns);
      return true;
    }
    return false;
  }

  if (event.type === "select") {
    return dispatchSelectEvent(controller, event);
  }

  if (event.type === "set-value") {
    if (!(controller instanceof SliderController)) return false;
    controller.setValue(event.value);
    return true;
  }

  if (event.type === "toggle") {
    if (controller instanceof CheckBoxController) {
      controller.toggle();
      return true;
    }
    if (controller instanceof ComboBoxController) {
      controller.toggle();
      return true;
    }
    if (controller instanceof TreeController) {
      return Boolean(controller.toggleActive());
    }
  }

  return false;
}

function dispatchKeyEvent(
  controller: MarkupWidgetController,
  event: Extract<MarkupWidgetEvent, { type: "key" }>,
): boolean {
  const keyEvent: KeyPressEvent = {
    key: event.key as KeyPressEvent["key"],
    ctrl: Boolean(event.ctrl),
    meta: Boolean(event.meta),
    shift: Boolean(event.shift),
    buffer: new Uint8Array(),
  };
  if (controller instanceof ButtonController) {
    if (event.key !== "return" && event.key !== "space") return false;
    return controller.press("keyboard");
  }
  if (controller instanceof CheckBoxController) {
    if (event.key !== "return" && event.key !== "space") return false;
    controller.toggle();
    return true;
  }
  if (controller instanceof InputController) return controller.handleKeyPress(keyEvent) !== "ignored";
  if (controller instanceof TextBoxController) return controller.handleKeyPress(keyEvent) !== "ignored";
  if (controller instanceof SliderController) {
    controller.handleKeyPress(keyEvent);
    return true;
  }
  if (controller instanceof ComboBoxController) {
    controller.handleKeyPress(keyEvent);
    return true;
  }
  if (controller instanceof RadioGroupController) {
    controller.handleKeyPress(keyEvent);
    return true;
  }
  if (controller instanceof TabsController) {
    controller.handleKeyPress(keyEvent);
    return true;
  }
  if (controller instanceof TreeController) {
    controller.handleKeyPress(keyEvent, event.height);
    return true;
  }
  if (controller instanceof ScrollAreaController) {
    if (event.key === "up") controller.scrollBy(0, -1);
    else if (event.key === "down") controller.scrollBy(0, 1);
    else if (event.key === "left") controller.scrollBy(-1, 0);
    else if (event.key === "right") controller.scrollBy(1, 0);
    else if (event.key === "home") controller.scrollTo(0, 0);
    else if (event.key === "end") controller.scrollTo(0, controller.maxOffset().rows);
    else if (event.key === "pageup") controller.scrollBy(0, -Math.max(1, controller.viewportHeight.peek() - 1));
    else if (event.key === "pagedown") controller.scrollBy(0, Math.max(1, controller.viewportHeight.peek() - 1));
    else return false;
    return true;
  }
  return false;
}

function dispatchSelectEvent(
  controller: MarkupWidgetController,
  event: Extract<MarkupWidgetEvent, { type: "select" }>,
): boolean {
  if (controller instanceof ComboBoxController) {
    const index = event.index ?? indexOfString(controller.inspect().items, event.value);
    if (index === undefined) return false;
    return controller.selectIndex(index) !== undefined;
  }
  if (controller instanceof RadioGroupController) {
    if (event.index !== undefined) return controller.selectIndex(event.index) !== undefined;
    return controller.selectValue(event.value) !== undefined;
  }
  if (controller instanceof TabsController) {
    if (event.index !== undefined) return controller.setActive(event.index) !== undefined;
    const index = controller.inspect().tabs.findIndex((tab) => tab.id === event.value || tab.label === event.value);
    return index >= 0 && controller.setActive(index) !== undefined;
  }
  if (controller instanceof TreeController) {
    const rows = controller.visibleRows();
    const index = event.index ?? rows.findIndex((row) => row.id === event.value || row.label === event.value);
    if (index === undefined || index < 0) return false;
    controller.setSelectedIndex(index);
    return Boolean(controller.selectActive());
  }
  return false;
}

function buttonWidget(node: LayoutNode): MarkupWidgetDescriptor {
  return {
    kind: "button",
    controller: new ButtonController({
      label: labelForNode(node),
      disabled: booleanAttr(node.attributes, "disabled"),
    }),
  };
}

function checkboxWidget(node: LayoutNode): MarkupWidgetDescriptor {
  return {
    kind: "checkbox",
    controller: new CheckBoxController({ checked: booleanAttr(node.attributes, "checked") }),
  };
}

function comboboxWidget(node: LayoutNode): MarkupWidgetDescriptor {
  const options = optionNodes(node);
  const items = new Array<string>(options.length);
  for (let index = 0; index < options.length; index += 1) {
    items[index] = labelForNode(options[index]!);
  }
  const selectedIndex = selectedOptionIndex(node, options);
  return {
    kind: "combobox",
    controller: new ComboBoxController({
      items,
      selectedIndex,
      expanded: booleanAttr(node.attributes, "expanded"),
      placeholder: stringAttr(node.attributes, "placeholder", ""),
    }),
  };
}

function containerWidget(node: LayoutNode): MarkupWidgetDescriptor | undefined {
  if (node.tag === "div" && !node.attributes.role) return undefined;
  return { kind: "container", focusable: false, actions: [] };
}

function inputWidget(node: LayoutNode): MarkupWidgetDescriptor {
  const type = stringAttr(node.attributes, "type", "text").toLowerCase();
  if (type === "checkbox") return checkboxWidget(node);
  if (type === "range") return sliderWidget(node);
  return {
    kind: "input",
    controller: new InputController({
      text: stringAttr(node.attributes, "value", node.text ?? ""),
      cursorPosition: numberAttr(node.attributes, "cursor-position", undefined),
      password: type === "password" || booleanAttr(node.attributes, "password"),
      placeholder: stringAttr(node.attributes, "placeholder", undefined),
      multiCodePointSupport: booleanAttr(node.attributes, "multi-code-point-support"),
    }),
  };
}

function radioGroupWidget(node: LayoutNode): MarkupWidgetDescriptor {
  const optionNodeList = optionNodes(node, ["option", "radio"]);
  const options = new Array<RadioOption>(optionNodeList.length);
  for (let index = 0; index < optionNodeList.length; index += 1) {
    options[index] = radioOptionForNode(optionNodeList[index]!);
  }
  const selectedValue = node.attributes["selected-value"] ?? node.attributes.value;
  return {
    kind: "radio-group",
    controller: new RadioGroupController({
      options,
      selectedValue,
      activeIndex: numberAttr(node.attributes, "active-index", 0),
    }),
  };
}

function scrollAreaWidget(node: LayoutNode, context: MarkupWidgetFactoryContext): MarkupWidgetDescriptor {
  const box = context.layout?.byId.get(node.id);
  const viewportWidth = numberAttr(
    node.attributes,
    "viewport-width",
    box?.overflow.columns.viewportLength ?? box?.contentRect.width ?? box?.rect.width ?? 0,
  );
  const viewportHeight = numberAttr(
    node.attributes,
    "viewport-height",
    box?.overflow.rows.viewportLength ?? box?.contentRect.height ?? box?.rect.height ?? 0,
  );
  return {
    kind: "scroll-area",
    controller: new ScrollAreaController({
      contentWidth: numberAttr(
        node.attributes,
        "content-width",
        Math.max(viewportWidth, box?.overflow.columns.contentLength ?? box?.scrollWidth ?? 0),
      ),
      contentHeight: numberAttr(
        node.attributes,
        "content-height",
        Math.max(viewportHeight, box?.overflow.rows.contentLength ?? box?.scrollHeight ?? 0),
      ),
      viewportWidth,
      viewportHeight,
      offset: {
        columns: numberAttr(node.attributes, "offset-columns", 0),
        rows: numberAttr(node.attributes, "offset-rows", 0),
      },
      showScrollbar: booleanAttr(node.attributes, "show-scrollbar", true),
    }),
  };
}

function sliderWidget(node: LayoutNode): MarkupWidgetDescriptor {
  const min = numberAttr(node.attributes, "min", 0);
  const max = numberAttr(node.attributes, "max", 100);
  return {
    kind: "slider",
    controller: new SliderController({
      min,
      max,
      step: numberAttr(node.attributes, "step", 1),
      value: numberAttr(node.attributes, "value", min),
      orientation: orientationAttr(node.attributes, "orientation", "horizontal"),
      adjustThumbSize: booleanAttr(node.attributes, "adjust-thumb-size"),
    }),
  };
}

function tabsWidget(node: LayoutNode): MarkupWidgetDescriptor {
  const tabNodes = childNodesForTags(node, ["tab"]);
  const tabs = new Array<TabItem>(tabNodes.length);
  for (let index = 0; index < tabNodes.length; index += 1) {
    tabs[index] = tabForNode(tabNodes[index]!);
  }
  return {
    kind: "tabs",
    controller: new TabsController({
      tabs,
      activeIndex: numberAttr(node.attributes, "active-index", selectedTabIndex(tabs)),
    }),
  };
}

function textBoxWidget(node: LayoutNode): MarkupWidgetDescriptor {
  return {
    kind: "textbox",
    controller: new TextBoxController({
      text: stringAttr(node.attributes, "value", node.text ?? ""),
      lineHighlighting: booleanAttr(node.attributes, "line-highlighting"),
      lineNumbering: booleanAttr(node.attributes, "line-numbering"),
      multiCodePointSupport: booleanAttr(node.attributes, "multi-code-point-support"),
      wordWrap: booleanAttr(node.attributes, "word-wrap", true),
    }),
  };
}

function treeWidget(node: LayoutNode): MarkupWidgetDescriptor {
  return {
    kind: "tree",
    controller: new TreeController({
      nodes: treeNodesForChildren(node.children),
      selectedIndex: numberAttr(node.attributes, "selected-index", 0),
    }),
  };
}

function windowWidget(): MarkupWidgetDescriptor {
  return { kind: "window", focusable: false, actions: [] };
}

export function defaultActionsForKind(kind: MarkupWidgetKind): readonly MarkupWidgetEvent["type"][] {
  if (kind === "button") return ["press", "key"];
  if (kind === "checkbox") return ["toggle", "press", "key"];
  if (kind === "combobox") return ["toggle", "select", "key"];
  if (kind === "input") return ["input", "key"];
  if (kind === "radio-group") return ["select", "key"];
  if (kind === "scroll-area") return ["scroll", "key"];
  if (kind === "slider") return ["set-value", "pointer", "scroll", "key"];
  if (kind === "tabs") return ["select", "key"];
  if (kind === "textbox") return ["input", "key"];
  if (kind === "tree") return ["select", "toggle", "key"];
  return [];
}

function optionNodes(node: LayoutNode, tags = ["option"]): LayoutNode[] {
  return childNodesForTags(node, tags);
}

function radioOptionForNode(node: LayoutNode): RadioOption {
  const label = labelForNode(node);
  return {
    value: stringAttr(node.attributes, "value", node.id),
    label,
    disabled: booleanAttr(node.attributes, "disabled"),
  };
}

function tabForNode(node: LayoutNode): TabItem {
  return {
    id: stringAttr(node.attributes, "value", node.id),
    label: labelForNode(node),
    disabled: booleanAttr(node.attributes, "disabled"),
  };
}

function treeNodeForNode(node: LayoutNode): TreeNode {
  const children = treeNodesForChildren(node.children);
  return {
    id: stringAttr(node.attributes, "value", node.id),
    label: labelForNode(node),
    expanded: booleanAttr(node.attributes, "expanded"),
    children: children.length > 0 ? children : undefined,
  };
}

function childNodesForTags(node: LayoutNode, tags: readonly string[]): LayoutNode[] {
  const nodes: LayoutNode[] = [];
  for (const child of node.children) {
    for (const tag of tags) {
      if (child.tag !== tag) continue;
      nodes.push(child);
      break;
    }
  }
  return nodes;
}

function treeNodesForChildren(children: readonly LayoutNode[]): TreeNode[] {
  const nodes: TreeNode[] = [];
  for (const child of children) {
    if (child.tag === "tree-node") nodes.push(treeNodeForNode(child));
  }
  return nodes;
}

function selectedOptionIndex(node: LayoutNode, options: readonly LayoutNode[] = optionNodes(node)): number | undefined {
  const explicit = numberAttr(node.attributes, "selected-index", undefined);
  if (explicit !== undefined) return explicit;
  const value = node.attributes.value ?? node.attributes["selected-value"];
  if (value !== undefined) {
    let index = -1;
    for (let optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
      const option = options[optionIndex]!;
      if (option.attributes.value === value || labelForNode(option) === value) {
        index = optionIndex;
        break;
      }
    }
    if (index >= 0) return index;
  }
  for (let optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
    if (booleanAttr(options[optionIndex]!.attributes, "selected")) return optionIndex;
  }
  return undefined;
}

function selectedTabIndex(tabs: readonly TabItem[]): number {
  const index = tabs.findIndex((tab) => !tab.disabled);
  return index < 0 ? 0 : index;
}

function labelForNode(node: LayoutNode): string {
  const text = textForNode(node);
  return node.attributes.label ?? (text ? text : node.attributes.value ?? node.id);
}

function textForNode(node: LayoutNode): string {
  if (node.text !== undefined) return node.text;
  let text = "";
  for (const child of node.children) {
    const childText = textForNode(child);
    if (!childText) continue;
    if (text) text += " ";
    text += childText;
  }
  return text.trim();
}

function boxAsSliderTrack(
  box: ComputedLayoutBox | undefined,
  _orientation: SliderOrientation,
): SliderTrackRectangle | undefined {
  if (!box) return undefined;
  const rect = box.contentRect;
  return {
    column: rect.column,
    row: rect.row,
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height),
  };
}

function indexOfString(items: readonly string[], value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const index = items.indexOf(value);
  return index < 0 ? undefined : index;
}

function orientationAttr(
  attributes: Record<string, string>,
  name: string,
  fallback: SliderOrientation,
): SliderOrientation {
  const value = stringAttr(attributes, name, fallback).toLowerCase();
  return value === "vertical" ? "vertical" : "horizontal";
}

function booleanAttr(attributes: Record<string, string>, name: string, fallback = false): boolean {
  if (!(name in attributes)) return fallback;
  const value = attributes[name]?.trim().toLowerCase();
  return value !== "false" && value !== "0" && value !== "no" && value !== "off";
}

function numberAttr(
  attributes: Record<string, string>,
  name: string,
  fallback: number,
): number;
function numberAttr(
  attributes: Record<string, string>,
  name: string,
  fallback?: undefined,
): number | undefined;
function numberAttr(
  attributes: Record<string, string>,
  name: string,
  fallback?: number,
): number | undefined {
  const value = attributes[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringAttr(
  attributes: Record<string, string>,
  name: string,
  fallback: string,
): string;
function stringAttr(
  attributes: Record<string, string>,
  name: string,
  fallback?: undefined,
): string | undefined;
function stringAttr(
  attributes: Record<string, string>,
  name: string,
  fallback?: string,
): string | undefined {
  return attributes[name] ?? fallback;
}

function tabIndexForWidget(widget: HydratedMarkupWidget): number {
  const value = widget.node.attributes.tabindex ?? widget.node.attributes.tabIndex;
  if (value === undefined) return 0;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}
