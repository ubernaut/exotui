// Copyright 2023 Im-Beast. MIT license.
import type { ComponentOptions } from "../component.ts";
import { Box } from "./box.ts";

import type { BoxObject } from "../canvas/box.ts";
import { Label, type LabelAlign, type LabelRectangle } from "./label.ts";
import { Signal, type SignalOfObject } from "../signals/mod.ts";
import { signalify } from "../utils/signals.ts";

const centerAlign: LabelAlign = {
  horizontal: "center",
  vertical: "center",
};

/** Options for configuring button. */
export interface ButtonOptions extends ComponentOptions {
  label?: {
    text: string | Signal<string>;
    align?: LabelAlign | SignalOfObject<LabelAlign>;
  };
  disabled?: boolean | Signal<boolean>;
  controller?: ButtonController;
  onPress?: (inspection: ButtonInspection) => void | Promise<void>;
}

/** Options for configuring button Controller. */
export interface ButtonControllerOptions {
  label?: string | Signal<string>;
  disabled?: boolean | Signal<boolean>;
  onPress?: (inspection: ButtonInspection) => void | Promise<void>;
}

/** Serializable inspection snapshot for button. */
export interface ButtonInspection {
  label: string;
  disabled: boolean;
  pressCount: number;
  lastPressedAt?: number;
  lastMethod?: "keyboard" | "mouse";
}

/** State controller for button behavior. */
export class ButtonController {
  readonly label: Signal<string>;
  readonly disabled: Signal<boolean>;
  readonly pressCount: Signal<number> = new Signal(0);
  readonly lastPressedAt: Signal<number | undefined> = new Signal<number | undefined>(undefined);
  readonly lastMethod: Signal<"keyboard" | "mouse" | undefined> = new Signal<"keyboard" | "mouse" | undefined>(
    undefined,
  );
  readonly #ownsLabel: boolean;
  readonly #ownsDisabled: boolean;
  readonly #onPress?: (inspection: ButtonInspection) => void | Promise<void>;

  constructor(options: ButtonControllerOptions = {}) {
    this.#ownsLabel = !(options.label instanceof Signal);
    this.#ownsDisabled = !(options.disabled instanceof Signal);
    this.label = signalify(options.label ?? "");
    this.disabled = signalify(options.disabled ?? false);
    this.#onPress = options.onPress;
  }

  setLabel(label: string): string {
    this.label.value = label;
    return label;
  }

  setDisabled(disabled: boolean): boolean {
    this.disabled.value = disabled;
    return disabled;
  }

  enable(): boolean {
    return this.setDisabled(false);
  }

  disable(): boolean {
    return this.setDisabled(true);
  }

  press(method?: "keyboard" | "mouse", now: number = Date.now()): boolean {
    if (this.disabled.peek()) return false;
    this.pressCount.value++;
    this.lastPressedAt.value = now;
    this.lastMethod.value = method;
    void this.#onPress?.(this.inspect());
    return true;
  }

  inspect(): ButtonInspection {
    return {
      label: this.label.peek(),
      disabled: this.disabled.peek(),
      pressCount: this.pressCount.peek(),
      lastPressedAt: this.lastPressedAt.peek(),
      lastMethod: this.lastMethod.peek(),
    };
  }

  dispose(): void {
    if (this.#ownsLabel) this.label.dispose();
    if (this.#ownsDisabled) this.disabled.dispose();
    this.pressCount.dispose();
    this.lastPressedAt.dispose();
    this.lastMethod.dispose();
  }
}

/**
 * Component for creating interactive button
 *
 * @example
 * ```ts
 * new Button({
 *  parent: tui,
 *  label: { text: "click\nme" },
 *  theme: {
 *    base: crayon.bgGreen,
 *    focused: crayon.bgLightGreen,
 *    active: crayon.bgYellow,
 *  },
 *  rectangle: {
 *    column: 1,
 *    row: 1,
 *    height: 5,
 *    width: 10,
 *  },
 *  zIndex: 0,
 * });
 * ```
 */
export class Button extends Box {
  declare drawnObjects: { box: BoxObject };
  declare subComponents: { label?: Label };
  label: {
    text: Signal<string>;
    align: Signal<LabelAlign>;
  };
  readonly buttonController: ButtonController;
  readonly disabled: Signal<boolean>;
  readonly #syncLabel = () => this.#updateLabelSubcomponent();
  readonly #syncDisabledState = () => {
    if (this.disabled.peek()) {
      this.state.value = "disabled";
    } else if (this.state.peek() === "disabled") {
      this.state.value = "base";
    }
  };

  constructor(options: ButtonOptions) {
    const ownsController = !options.controller;
    const controller = options.controller ??
      new ButtonController({
        label: options.label?.text,
        disabled: options.disabled,
        onPress: options.onPress,
      });
    super(options);
    this.buttonController = controller;
    this.disabled = controller.disabled;

    let { label } = options;

    if (!label) {
      label = { text: "", align: centerAlign };
    }

    label.text = controller.label;
    label.align = signalify(label.align ?? centerAlign);

    this.label = label as this["label"];
    this.label.text.subscribe(this.#syncLabel);
    this.disabled.subscribe(this.#syncDisabledState);
    this.#syncDisabledState();
    // Space activates a focused button (standard button convention). Return
    // stays with keymaps/handleKeyboardControls so bindings do not double-fire.
    this.on("keyPress", ({ key, ctrl, meta, shift }) => {
      if (ctrl || meta || shift || this.disabled.peek()) return;
      if (key !== "space") return;
      // Demote a still-"active" button first so every Space press fires,
      // instead of alternating press/highlight through nextInteractionState.
      if (this.state.peek() === "active") this.state.value = "focused";
      this.interact("keyboard");
    });
    this.on("destroy", () => {
      this.label.text.unsubscribe(this.#syncLabel);
      this.disabled.unsubscribe(this.#syncDisabledState);
      if (ownsController) this.buttonController.dispose();
    });
  }

  override draw(): void {
    super.draw();
    this.#updateLabelSubcomponent();
  }

  override interact(method: "mouse" | "keyboard"): void {
    if (this.disabled.peek()) {
      this.state.value = "disabled";
      return;
    }

    this.state.value = this.nextInteractionState(method);
    super.interact(method);
    if (this.state.peek() === "active") this.buttonController.press(method, this.lastInteraction.time);
  }

  #updateLabelSubcomponent(): void {
    if (!this.label.text.value) {
      this.subComponents.label?.destroy();
      return;
    }

    if (this.subComponents.label) {
      return;
    }

    const label = new Label({
      parent: this,
      theme: this.theme,
      zIndex: this.zIndex,
      rectangle: this.rectangle as Signal<LabelRectangle>,
      overwriteRectangle: true,
      text: this.label.text,
      align: this.label.align,
    });

    label.state = this.state;
    label.style = this.style;

    label.subComponentOf = this;
    this.subComponents.label = label;
  }
}
