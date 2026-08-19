// Copyright 2023 Im-Beast. MIT license.
import type { Component, ComponentState } from "./component.ts";
import { DisposableStack } from "./app/disposables.ts";
import { markFocusNavigationEvent } from "./focus_navigation_events.ts";
import type { KeyPressEvent } from "./input_reader/types.ts";
import type { Signal } from "./signals/mod.ts";

/** Public interface describing a focusable. */
export interface Focusable {
  state: Component["state"];
}

/**
 * How one row of a collection should be painted, once focus and selection are
 * told apart.
 *
 * `selected` is the current item of a collection that holds the keyboard;
 * `selected-unfocused` is the current item of a collection that does not.
 * Painting both with the accent is what makes a screen with three lists look
 * like it has three cursors.
 */
export type SelectionPaintState = "selected" | "selected-unfocused" | "unselected";

/** Resolves one row's paint state from the two facts that decide it. */
export function resolveSelectionPaint(
  options: { readonly selected: boolean; readonly collectionFocused: boolean },
): SelectionPaintState {
  if (!options.selected) return "unselected";
  return options.collectionFocused ? "selected" : "selected-unfocused";
}

/**
 * True when a component in this state is the one receiving input. `active`
 * counts with `focused`: that is already the rule `Component` uses to decide
 * whether a key press, mouse press or scroll reaches it.
 */
export function stateHoldsInput(state: ComponentState): boolean {
  return state === "focused" || state === "active";
}

/** True when the focusable cannot take the keyboard. */
export function isFocusDisabled(item: Focusable): boolean {
  return item.state.peek() === "disabled";
}

/** Serializable inspection snapshot for focus Manager. */
export interface FocusManagerInspection {
  count: number;
  index: number;
  hasFocus: boolean;
}

/** Public class implementing a focus Manager. */
export class FocusManager {
  readonly items: Focusable[] = [];
  index = -1;

  register(component: Focusable): () => void {
    if (this.items.includes(component)) {
      return () => undefined;
    }
    this.items.push(component);
    return () => this.unregister(component);
  }

  registerAll(components: Iterable<Focusable>): () => void {
    return DisposableStack.collect((stack) => {
      for (const component of components) stack.defer(this.register(component));
    });
  }

  unregister(component: Focusable): void {
    const index = this.items.indexOf(component);
    if (index < 0) return;
    const wasCurrent = index === this.index;
    this.items.splice(index, 1);
    if (!isFocusDisabled(component)) component.state.value = "base";

    if (this.items.length === 0) {
      this.index = -1;
    } else if (wasCurrent) {
      this.index = Math.min(index, this.items.length - 1);
    } else if (index < this.index) {
      this.index -= 1;
    } else if (this.index >= this.items.length) {
      this.index = this.items.length - 1;
    }
    this.applyFocus();
  }

  clear(): void {
    for (const item of this.items) {
      if (!isFocusDisabled(item)) item.state.value = "base";
    }
    this.items.length = 0;
    this.index = -1;
  }

  current(): Focusable | undefined {
    return this.index < 0 ? undefined : this.items[this.index];
  }

  focus(component: Focusable): void {
    if (isFocusDisabled(component)) return;
    const index = this.items.indexOf(component);
    if (index < 0) {
      this.register(component);
      this.index = this.items.length - 1;
    } else {
      this.index = index;
    }
    this.applyFocus();
  }

  next(): Focusable | undefined {
    if (this.items.length === 0) return undefined;
    const target = this.seek(1);
    if (target < 0) return this.current();
    this.index = target;
    this.applyFocus();
    return this.current();
  }

  previous(): Focusable | undefined {
    if (this.items.length === 0) return undefined;
    const target = this.seek(-1);
    if (target < 0) return this.current();
    this.index = target;
    this.applyFocus();
    return this.current();
  }

  inspect(): FocusManagerInspection {
    return {
      count: this.items.length,
      index: this.index,
      hasFocus: this.current() !== undefined,
    };
  }

  /** True when this item is the one currently holding the keyboard. */
  isFocused(item: Focusable): boolean {
    return this.current() === item;
  }

  private applyFocus(): void {
    for (let itemIndex = 0; itemIndex < this.items.length; itemIndex += 1) {
      const item = this.items[itemIndex]!;
      // A disabled control keeps its own look; focus never paints over it.
      if (isFocusDisabled(item)) continue;
      item.state.value = itemIndex === this.index ? "focused" : "base";
    }
  }

  /**
   * Steps `step` positions from the current index, skipping disabled items and
   * wrapping. Returns -1 when every item is disabled, so a screen of disabled
   * controls cannot spin here.
   */
  private seek(step: number): number {
    const count = this.items.length;
    for (let offset = 1; offset <= count; offset += 1) {
      const candidate = (this.index + step * offset + count * offset) % count;
      if (!isFocusDisabled(this.items[candidate]!)) return candidate;
    }
    return -1;
  }
}

/** Public interface describing a focus Navigation Target. */
export interface FocusNavigationTarget {
  on(type: "keyPress", listener: (event: KeyPressEvent) => void | Promise<void>): () => void;
}

/** Options for configuring focus Navigation. */
export interface FocusNavigationOptions {
  key?: KeyPressEvent["key"];
  reverseWithShift?: boolean;
  items?: readonly Focusable[];
}

/** Options for configuring modal Focus Binding. */
export interface ModalFocusBindingOptions {
  initialIndex?: number;
  closeOnEscape?: boolean;
}

/** Binds focus Navigation behavior and returns a disposer when applicable. */
export function bindFocusNavigation(
  target: FocusNavigationTarget,
  manager: FocusManager,
  options: FocusNavigationOptions = {},
): () => void {
  for (const item of options.items ?? []) {
    manager.register(item);
  }

  const key = options.key ?? "tab";
  const reverseWithShift = options.reverseWithShift ?? true;
  return target.on("keyPress", (event) => {
    if (event.ctrl || event.meta || event.key !== key) return;
    markFocusNavigationEvent(event);
    if (reverseWithShift && event.shift) {
      manager.previous();
    } else {
      manager.next();
    }
  });
}

/** Public class implementing a focus Scope. */
export class FocusScope {
  private previous?: Focusable;
  private previousItems: Focusable[] = [];
  private previousIndex = -1;

  constructor(
    readonly manager: FocusManager,
    readonly items: readonly Focusable[],
  ) {}

  enter(initialIndex = 0): Focusable | undefined {
    this.previous = this.manager.current();
    this.previousItems = new Array<Focusable>(this.manager.items.length);
    for (let index = 0; index < this.manager.items.length; index += 1) {
      this.previousItems[index] = this.manager.items[index]!;
    }
    this.previousIndex = this.manager.index;
    for (const item of this.previousItems) {
      item.state.value = "base";
    }
    this.manager.items.splice(0, this.manager.items.length, ...this.items);
    this.manager.index = -1;

    const item = this.items[Math.max(0, Math.min(this.items.length - 1, initialIndex))];
    if (item) {
      this.manager.focus(item);
    }
    return item;
  }

  exit(): void {
    for (const item of this.items) {
      item.state.value = "base";
    }
    this.manager.items.splice(0, this.manager.items.length, ...this.previousItems);
    this.manager.index = this.previousIndex;

    if (this.previous) {
      this.manager.focus(this.previous);
    }
  }
}

/** Binds modal Focus behavior and returns a disposer when applicable. */
export function bindModalFocus(
  target: FocusNavigationTarget,
  visible: Signal<boolean>,
  manager: FocusManager,
  items: readonly Focusable[],
  options: ModalFocusBindingOptions = {},
): () => void {
  const scope = new FocusScope(manager, items);
  const initialIndex = options.initialIndex ?? 0;
  const closeOnEscape = options.closeOnEscape ?? true;
  let active = false;

  const sync = (nextVisible: boolean) => {
    if (nextVisible && !active) {
      scope.enter(initialIndex);
      active = true;
    } else if (!nextVisible && active) {
      scope.exit();
      active = false;
    }
  };

  const unbindKeys = target.on("keyPress", (event) => {
    if (!closeOnEscape || event.ctrl || event.meta || event.key !== "escape" || !visible.peek()) return;
    visible.value = false;
  });

  sync(visible.peek());
  visible.subscribe(sync);

  return () => {
    unbindKeys();
    visible.unsubscribe(sync);
    if (active) {
      scope.exit();
      active = false;
    }
  };
}
