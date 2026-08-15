// Copyright 2023 Im-Beast. MIT license.
import {
  inspectLayoutSolverCapabilities,
  type LayoutSolverCapabilityReport,
  SUPPORTED_LAYOUT_CSS_PROPERTIES,
} from "../layout/capabilities.ts";

/** Serializable report describing the supported HTML/CSS-style TUI authoring subset. */
export interface TuiCssSupportReport {
  layoutDisplays: string[];
  selectors: string[];
  pseudoStates: string[];
  mediaFeatures: string[];
  properties: string[];
  lengthUnits: string[];
  markupTags: string[];
  hydratedWidgetTags: string[];
  solverCapabilities: LayoutSolverCapabilityReport;
  unsupported: string[];
}

const supportedHydratedWidgetTags = [
  "button",
  "checkbox",
  "combo-box",
  "combobox",
  "div",
  "form",
  "input",
  "menu-bar",
  "panel",
  "radio-group",
  "scroll-area",
  "select",
  "slider",
  "statusbar",
  "tabs",
  "text-box",
  "textarea",
  "textbox",
  "toolbar",
  "tree",
] as const;

/** Returns the stable supported subset and known gaps for the HTML/CSS-style layout engine. */
export function inspectTuiCssSupport(): TuiCssSupportReport {
  return {
    layoutDisplays: ["block", "flex", "grid", "none"],
    selectors: [
      "tag",
      ".class",
      "#id",
      "[attr]",
      "[attr=value]",
      "*",
      "child >",
      "descendant",
      "selector lists",
      ":first-child",
      ":last-child",
      ":only-child",
      ":nth-child(number|odd|even)",
    ],
    pseudoStates: ["active", "disabled", "focus", "hover"],
    mediaFeatures: ["min-width", "max-width", "min-height", "max-height"],
    properties: [...SUPPORTED_LAYOUT_CSS_PROPERTIES],
    lengthUnits: ["cells", "%", "fr", "auto"],
    markupTags: [
      "window",
      "div",
      "panel",
      "toolbar",
      "menu-bar",
      "statusbar",
      "scroll-area",
      "form",
      "button",
      "input",
      "checkbox",
      "radio-group",
      "select",
      "combo-box",
      "combobox",
      "slider",
      "textarea",
      "text-box",
      "textbox",
      "table",
      "tree",
      "tabs",
      "modal",
      "three-ascii",
    ],
    hydratedWidgetTags: [...supportedHydratedWidgetTags],
    solverCapabilities: inspectLayoutSolverCapabilities(),
    unsupported: [
      "browser CSS parser parity",
      "em/rem/container-query units",
      "multiplicative or nested calc() expressions (the additive subset is supported)",
      "floats",
      "transforms",
      "animations and transitions",
      "shadows, filters, gradients, and compositing effects",
      "advanced nth-child an+b formulas, complex pseudo classes, and pseudo elements",
      "named grid lines",
      "Yoga solver CSS Grid support",
      "subgrid",
      "dense browser Grid packing parity",
      "full browser intrinsic sizing and baseline alignment",
    ],
  };
}
