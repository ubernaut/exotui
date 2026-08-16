// Copyright 2023 Im-Beast. MIT license.
import {
  type ComputedLayoutStyle,
  defaultComputedLayoutStyle,
  type LayoutDisplay,
  type LayoutLengthValue,
} from "./style.ts";
import { type LayoutNode, walkLayoutNodes } from "./solver.ts";

/** Stable support levels used by layout-solver capability reports. */
export type LayoutSolverFieldSupport =
  | "supported"
  | "partial"
  | "metadata"
  | "outside-solver"
  | "unsupported"
  | "unknown";

/** Every normalized field that a layout solver can receive. */
export type LayoutStyleField = keyof ComputedLayoutStyle;

/** Built-in, optional, and planned solver identifiers known to the package. */
export type KnownLayoutSolverId = "simple" | "yoga" | "taffy";

/** Availability of a solver implementation in this package. */
export type LayoutSolverAvailability = "built-in" | "optional" | "planned" | "custom";

/** Exhaustive per-field capability map for one solver. */
export type LayoutSolverStyleCapabilities = Readonly<
  {
    [Field in LayoutStyleField]-?: LayoutSolverFieldSupport;
  }
>;

/** Frozen contract areas that every backend must classify. */
export type LayoutContractInvariantId =
  | "cell-rounding"
  | "overflow-inspection"
  | "intrinsic-measurement"
  | "hidden-nodes"
  | "absolute-children"
  | "min-max-constraints";

/** One backend's support for a frozen layout invariant. */
export interface LayoutContractInvariantCapability {
  readonly support: LayoutSolverFieldSupport;
  readonly detail: string;
}

/** Serializable capability profile attached to a layout solver. */
export interface LayoutSolverCapabilities {
  readonly schemaVersion: 1;
  readonly solverId: string;
  readonly availability: LayoutSolverAvailability;
  readonly style: LayoutSolverStyleCapabilities;
  readonly displayModes: Readonly<Record<LayoutDisplay, LayoutSolverFieldSupport>>;
  readonly lengthUnits: Readonly<Record<LayoutLengthValue["unit"], LayoutSolverFieldSupport>>;
  readonly invariants: Readonly<Record<LayoutContractInvariantId, LayoutContractInvariantCapability>>;
  readonly limitations: Readonly<Partial<Record<LayoutStyleField, readonly string[]>>>;
  readonly notes: readonly string[];
}

/** Complete machine-readable report for known layout backends. */
export interface LayoutSolverCapabilityReport {
  schemaVersion: 1;
  normalizedStyleFields: LayoutStyleField[];
  cssProperties: Record<string, LayoutStyleField[]>;
  invariantIds: LayoutContractInvariantId[];
  solvers: LayoutSolverCapabilities[];
}

/** Stable layout diagnostic codes emitted by capability validation. */
export type LayoutDiagnosticCode =
  | "unsupported-declaration"
  | "unsupported-by-solver"
  | "partial-solver-support"
  | "solver-fallback"
  | "solver-capabilities-unavailable";

/** Deterministic renderer-neutral diagnostic for layout authoring or solving. */
export interface LayoutDiagnostic {
  code: LayoutDiagnosticCode;
  severity: "warning";
  message: string;
  solverId: string;
  nodeId?: string;
  selector?: string;
  source?: "stylesheet" | "inline";
  property?: string;
  value?: string;
  field?: LayoutStyleField;
}

/** Explicit declaration provenance used to diagnose selected-solver support. */
export interface LayoutDeclarationInspection {
  nodeId: string;
  property: string;
  value: string;
  selector?: string;
  source?: "stylesheet" | "inline";
  fields?: readonly LayoutStyleField[];
  style?: ComputedLayoutStyle;
}

type KnownSolverFieldMatrix = Readonly<Record<KnownLayoutSolverId, LayoutSolverFieldSupport>>;

const fieldCapabilityMatrix = {
  display: field("supported", "partial"),
  position: field("partial", "supported"),
  flexDirection: field("supported", "partial"),
  flexWrap: field("partial", "supported"),
  flexGrow: field("partial", "supported"),
  flexShrink: field("partial", "supported"),
  flexBasis: field("partial", "partial"),
  order: field("supported", "supported"),
  alignItems: field("partial", "supported"),
  alignContent: field("partial", "unsupported"),
  justifyContent: field("partial", "partial"),
  alignSelf: field("partial", "unsupported"),
  justifySelf: field("supported", "unsupported"),
  gridTemplateColumns: field("supported", "unsupported"),
  gridTemplateRows: field("supported", "unsupported"),
  gridTemplateAreas: field("supported", "unsupported"),
  gridTemplateColumnsAutoRepeat: field("supported", "unsupported"),
  gridTemplateRowsAutoRepeat: field("supported", "unsupported"),
  gridAutoFlowDense: field("supported", "unsupported"),
  gridTemplateColumnsLineNames: field("supported", "unsupported"),
  gridTemplateRowsLineNames: field("supported", "unsupported"),
  gridAutoColumns: field("supported", "unsupported"),
  gridAutoRows: field("supported", "unsupported"),
  gridAutoFlow: field("supported", "unsupported"),
  gridColumn: field("partial", "unsupported"),
  gridRow: field("partial", "unsupported"),
  gridArea: field("supported", "unsupported"),
  width: field("partial", "partial"),
  height: field("partial", "partial"),
  minWidth: field("partial", "partial"),
  minHeight: field("partial", "partial"),
  maxWidth: field("partial", "partial"),
  maxHeight: field("partial", "partial"),
  aspectRatio: field("supported", "unsupported"),
  boxSizing: field("supported", "unsupported"),
  inset: field("partial", "partial"),
  margin: field("partial", "supported"),
  padding: field("supported", "partial"),
  border: field("supported", "supported"),
  gap: field("supported", "partial"),
  rowGap: field("partial", "partial"),
  columnGap: field("partial", "partial"),
  overflowX: field("metadata", "partial"),
  overflowY: field("metadata", "partial"),
  zIndex: field("metadata", "metadata"),
  // Visual offsets translate solved boxes in a solver-independent engine
  // post-pass, so every backend supports them.
  offsetX: { simple: "supported", yoga: "supported", taffy: "supported" },
  offsetY: { simple: "supported", yoga: "supported", taffy: "supported" },
  dock: field("supported", "unsupported"),
  // Layers resolve to z-order in a solver-independent engine post-pass.
  layers: { simple: "supported", yoga: "supported", taffy: "supported" },
  layer: { simple: "supported", yoga: "supported", taffy: "supported" },
  alignHorizontal: field("supported", "unsupported"),
  alignVertical: field("supported", "unsupported"),
  scrollbarColor: field("outside-solver", "outside-solver"),
  scrollbarBackgroundColor: field("outside-solver", "outside-solver"),
  scrollbarSize: field("outside-solver", "outside-solver"),
  borderTitle: field("outside-solver", "outside-solver"),
  borderSubtitle: field("outside-solver", "outside-solver"),
  borderTitleAlign: field("outside-solver", "outside-solver"),
  borderSubtitleAlign: field("outside-solver", "outside-solver"),
  opacity: field("outside-solver", "outside-solver"),
  tint: field("outside-solver", "outside-solver"),
  hatch: field("outside-solver", "outside-solver"),
  color: field("outside-solver", "outside-solver"),
  backgroundColor: field("outside-solver", "outside-solver"),
  borderColor: field("outside-solver", "outside-solver"),
  borderStyle: field("outside-solver", "outside-solver"),
  visibility: field("metadata", "metadata"),
  whiteSpace: field("partial", "partial"),
  overflowWrap: field("partial", "partial"),
  variables: field("outside-solver", "outside-solver"),
} as const satisfies Readonly<Record<LayoutStyleField, KnownSolverFieldMatrix>>;

/** Exhaustive, stable ordering of normalized style fields. */
export const NORMALIZED_LAYOUT_STYLE_FIELDS: readonly LayoutStyleField[] = Object.freeze(
  Object.keys(fieldCapabilityMatrix) as LayoutStyleField[],
);

/** Maps every accepted CSS-like declaration to the normalized fields it can change. */
export const LAYOUT_CSS_PROPERTY_FIELDS: Readonly<Record<string, readonly LayoutStyleField[]>> = {
  display: fields("display"),
  position: fields("position"),
  "flex-direction": fields("flexDirection"),
  "flex-wrap": fields("flexWrap"),
  "flex-flow": fields("flexDirection", "flexWrap"),
  "flex-grow": fields("flexGrow"),
  "flex-shrink": fields("flexShrink"),
  "flex-basis": fields("flexBasis"),
  flex: fields("flexGrow", "flexShrink", "flexBasis"),
  order: fields("order"),
  "align-items": fields("alignItems"),
  "align-content": fields("alignContent"),
  "justify-content": fields("justifyContent"),
  "align-self": fields("alignSelf"),
  "justify-self": fields("justifySelf"),
  "place-self": fields("alignSelf", "justifySelf"),
  "grid-template-columns": fields("gridTemplateColumns"),
  "grid-template-rows": fields("gridTemplateRows"),
  "grid-template-areas": fields("gridTemplateAreas"),
  "grid-auto-columns": fields("gridAutoColumns"),
  "grid-auto-rows": fields("gridAutoRows"),
  "grid-auto-flow": fields("gridAutoFlow"),
  "grid-column": fields("gridColumn"),
  "grid-row": fields("gridRow"),
  "grid-area": fields("gridArea"),
  "grid-column-start": fields("gridColumn"),
  "grid-column-end": fields("gridColumn"),
  "grid-row-start": fields("gridRow"),
  "grid-row-end": fields("gridRow"),
  width: fields("width"),
  height: fields("height"),
  "min-width": fields("minWidth"),
  "min-height": fields("minHeight"),
  "max-width": fields("maxWidth"),
  "max-height": fields("maxHeight"),
  "aspect-ratio": fields("aspectRatio"),
  "box-sizing": fields("boxSizing"),
  inset: fields("inset"),
  top: fields("inset"),
  right: fields("inset"),
  bottom: fields("inset"),
  left: fields("inset"),
  margin: fields("margin"),
  "margin-top": fields("margin"),
  "margin-right": fields("margin"),
  "margin-bottom": fields("margin"),
  "margin-left": fields("margin"),
  padding: fields("padding"),
  "padding-top": fields("padding"),
  "padding-right": fields("padding"),
  "padding-bottom": fields("padding"),
  "padding-left": fields("padding"),
  border: fields("border", "borderStyle", "borderColor"),
  "border-width": fields("border"),
  "border-top": fields("border"),
  "border-right": fields("border"),
  "border-bottom": fields("border"),
  "border-left": fields("border"),
  "border-style": fields("borderStyle"),
  "border-color": fields("borderColor"),
  gap: fields("gap", "rowGap", "columnGap"),
  "row-gap": fields("rowGap"),
  "column-gap": fields("columnGap"),
  overflow: fields("overflowX", "overflowY"),
  "overflow-x": fields("overflowX"),
  "overflow-y": fields("overflowY"),
  "z-index": fields("zIndex"),
  "offset": fields("offsetX", "offsetY"),
  "offset-x": fields("offsetX"),
  "offset-y": fields("offsetY"),
  dock: fields("dock"),
  layers: fields("layers"),
  layer: fields("layer"),
  align: fields("alignHorizontal", "alignVertical"),
  "align-horizontal": fields("alignHorizontal"),
  "align-vertical": fields("alignVertical"),
  "scrollbar-color": fields("scrollbarColor"),
  "scrollbar-background": fields("scrollbarBackgroundColor"),
  "scrollbar-size": fields("scrollbarSize"),
  "border-title": fields("borderTitle"),
  "border-subtitle": fields("borderSubtitle"),
  "border-title-align": fields("borderTitleAlign"),
  "border-subtitle-align": fields("borderSubtitleAlign"),
  opacity: fields("opacity"),
  tint: fields("tint"),
  hatch: fields("hatch"),
  color: fields("color"),
  background: fields("backgroundColor"),
  "background-color": fields("backgroundColor"),
  visibility: fields("visibility"),
  "white-space": fields("whiteSpace"),
  "overflow-wrap": fields("overflowWrap"),
  "word-wrap": fields("overflowWrap"),
};

/** Stable list of CSS-like properties recognized by the normalized style layer. */
export const SUPPORTED_LAYOUT_CSS_PROPERTIES: readonly string[] = Object.freeze(
  Object.keys(LAYOUT_CSS_PROPERTY_FIELDS),
);

/** Returns the normalized fields a supported declaration value actually writes. */
export function resolvedLayoutDeclarationFields(
  propertyName: string,
  rawValue: string,
): LayoutStyleField[] | undefined {
  const property = propertyName.trim().toLowerCase();
  if (property.startsWith("--")) return [];
  const mapped = LAYOUT_CSS_PROPERTY_FIELDS[property as keyof typeof LAYOUT_CSS_PROPERTY_FIELDS];
  if (!mapped) return undefined;
  if (layoutDeclarationValueIssue(property, rawValue)) return [];

  const words = rawValue.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (property === "flex") {
    if (words.length === 1 && words[0] !== "none" && words[0] !== "auto") return ["flexGrow"];
    if (words.length === 2) return ["flexGrow", "flexShrink"];
    return ["flexGrow", "flexShrink", "flexBasis"];
  }
  if (property === "flex-flow") {
    const output: LayoutStyleField[] = [];
    if (words.some((word) => oneOf(word, "row", "row-reverse", "column", "column-reverse"))) {
      output.push("flexDirection");
    }
    if (words.some((word) => oneOf(word, "nowrap", "wrap", "wrap-reverse"))) output.push("flexWrap");
    return output;
  }
  if (property === "border") {
    const output: LayoutStyleField[] = [];
    if (words.some(validCellScalar)) output.push("border");
    else if (words.length > 0 && words[0] !== "none") output.push("border");
    if (words.some((word) => oneOf(word, "none", "single", "double", "solid", "round", "heavy"))) {
      output.push("borderStyle");
    }
    if (words.some((word) => word.startsWith("#") || word.startsWith("rgb") || word.startsWith("var("))) {
      output.push("borderColor");
    }
    return output;
  }
  return [...mapped];
}

const invariantIds: LayoutContractInvariantId[] = [
  "cell-rounding",
  "overflow-inspection",
  "intrinsic-measurement",
  "hidden-nodes",
  "absolute-children",
  "min-max-constraints",
];

/** Dependency-free capability profile for the built-in solver. */
export const SIMPLE_LAYOUT_SOLVER_CAPABILITIES: LayoutSolverCapabilities = freezeCapabilities(
  createKnownCapabilities("simple", "built-in", {
    displayModes: {
      block: "supported",
      flex: "supported",
      grid: "supported",
      none: "supported",
    },
    lengthUnits: {
      auto: "supported",
      cell: "supported",
      percent: "partial",
      fr: "partial",
      vw: "supported",
      vh: "supported",
      pw: "supported",
      ph: "supported",
      calc: "supported",
      "min-content": "partial",
      "max-content": "partial",
      minmax: "partial",
      "fit-content": "partial",
    },
    invariants: {
      "cell-rounding": invariant(
        "supported",
        "Floors resolved lengths and distributes integer remainders deterministically.",
      ),
      "overflow-inspection": invariant("supported", "Uses the shared per-axis overflow inspection contract."),
      "intrinsic-measurement": invariant(
        "partial",
        "Measures terminal text, nested content, and partial LayoutNode.intrinsic overrides, but Flex text can be measured before its explicit inline size is final.",
      ),
      "hidden-nodes": invariant(
        "supported",
        "visibility:hidden retains geometry without hits; non-root display:none subtrees are omitted from solved output.",
      ),
      "absolute-children": invariant(
        "partial",
        "Absolute children leave normal flow and resolve terminal-cell or percentage insets against the content box; dual-edge auto sizing remains solver-specific.",
      ),
      "min-max-constraints": invariant(
        "partial",
        "Min/max values are clamped deterministically; Flex preserves explicit minimums and reports the resulting overflow, while Block children remain clipped to the containing width.",
      ),
    },
    limitations: {
      position: ["Absolute and relative positioning use the deterministic terminal-cell inset subset."],
      flexWrap: ["wrap-reverse has solver-specific ordering and placement semantics pending L1."],
      flexGrow: [
        "Integer-cell largest-remainder distribution: equal weights end within one cell of each other.",
      ],
      flexShrink: ["A zero shrink weight opts the item out of shrinking; unshrinkable content overflows."],
      flexBasis: ["fr is not a valid generic flex-basis unit; intrinsic-basis parity is deferred to L1."],
      alignItems: [
        "Applied to Flex containers; Grid container cross-axis distribution is deferred to L1.",
        "Baseline alignment is unsupported until intrinsic measurement exposes an ascent/baseline contract.",
      ],
      alignContent: [
        "Applied to wrapped Flex line collections; Grid track distribution is not implemented.",
        "Defaults to start to preserve the package's established terminal-cell line placement; stretch is explicit.",
      ],
      justifyContent: ["Applied to Flex containers; Grid container distribution is deferred to L1."],
      alignSelf: ["Applied to Grid items, not Flex items."],
      justifySelf: ["Applied to Grid items."],
      gridColumn: ["Positive numeric lines and spans only; named lines are unsupported."],
      gridRow: ["Positive numeric lines and spans only; named lines are unsupported."],
      width: ["fr is reliable only in Simple Grid tracks."],
      height: ["fr is reliable only in Simple Grid tracks."],
      minWidth: ["fr is unsupported outside Grid tracks."],
      minHeight: ["fr is unsupported outside Grid tracks."],
      maxWidth: ["fr is unsupported outside Grid tracks."],
      maxHeight: ["fr is unsupported outside Grid tracks."],
      aspectRatio: ["Derived axes are floored to whole terminal cells before allocation clipping."],
      boxSizing: ["Defaults to border-box for compatibility; content-box is available explicitly."],
      inset: ["fr insets are unsupported; when both relative edges are set, top and left take precedence."],
      margin: ["Root margins are ignored; Flex auto margins and Block inline-axis auto margins are supported."],
      overflowX: ["Produces overflow metadata; clipping and scroll ownership remain renderer/controller concerns."],
      overflowY: ["Produces overflow metadata; clipping and scroll ownership remain renderer/controller concerns."],
      whiteSpace: ["Terminal-cell text measurement subset, not browser inline layout."],
      overflowWrap: ["Terminal-cell word-breaking subset, not browser inline layout."],
    },
    notes: [
      "Block, Flex, and Grid refer to the documented terminal-cell subset, not browser layout parity.",
      "Percentage Flex sizing and one-cell remainder allocation remain explicit L1 conformance work.",
      "vw/vh resolve against the solve bounds and w/h (pw/ph) against the containing block; where an axis is not threaded they degrade to the local available size, never to zero.",
      "calc() is a bounded additive model: at most 8 signed cell/%/vw/vh/w/h terms, no nesting, multiplication, or fr.",
      "min-content/max-content/fit-content are exact on the width axis (longest word / unwrapped line) and a terminal subset on the height axis (the measured wrapped height); in flex-basis they behave as auto, while grid tracks measure span-1 content (columns via width intrinsics, rows via measured height at the resolved column width).",
      "Floats and full browser table layout are deliberately out of scope: evaluated August 2026, no concrete TUI use case justifies them, and no emulation path will be added without one.",
    ],
  }),
);

/** Dependency-free description of the optional Yoga adapter. */
export const YOGA_LAYOUT_SOLVER_CAPABILITIES: LayoutSolverCapabilities = freezeCapabilities(
  createKnownCapabilities("yoga", "optional", {
    displayModes: { block: "partial", flex: "supported", grid: "unsupported", none: "supported" },
    lengthUnits: {
      auto: "supported",
      cell: "supported",
      percent: "supported",
      fr: "unsupported",
      vw: "unsupported",
      vh: "unsupported",
      pw: "unsupported",
      ph: "unsupported",
      calc: "unsupported",
      "min-content": "unsupported",
      "max-content": "unsupported",
      minmax: "unsupported",
      "fit-content": "unsupported",
    },
    invariants: {
      "cell-rounding": invariant(
        "supported",
        "Rounds Yoga's computed floating-point edges and sizes to nearest cells.",
      ),
      "overflow-inspection": invariant(
        "supported",
        "Uses the shared per-axis overflow inspection contract after layout.",
      ),
      "intrinsic-measurement": invariant(
        "partial",
        "Measures text leaves or a supplied measureText callback; LayoutNode.intrinsic metadata is not mapped.",
      ),
      "hidden-nodes": invariant(
        "partial",
        "display:none leaves zero-sized invisible subtrees in solved output, while visibility and hit testing remain suppressed.",
      ),
      "absolute-children": invariant(
        "supported",
        "Yoga removes absolute children from Flex flow and resolves supported insets.",
      ),
      "min-max-constraints": invariant(
        "supported",
        "Yoga preserves explicit minimums even when the resulting content must overflow the allocation.",
      ),
    },
    limitations: {
      display: ["block is approximated by column Flex; grid falls back to column Flex and emits a diagnostic."],
      flexDirection: ["The adapter does not yet map row-reverse or column-reverse."],
      flexBasis: ["fr values are unsupported by the adapter."],
      alignContent: ["The current adapter does not map align-content."],
      justifyContent: ["The adapter does not yet map space-evenly."],
      alignSelf: ["The current adapter does not map align-self."],
      justifySelf: ["The current adapter does not map justify-self."],
      gridTemplateColumns: ["CSS Grid is not mapped by the Yoga adapter."],
      gridTemplateRows: ["CSS Grid is not mapped by the Yoga adapter."],
      gridTemplateAreas: ["CSS Grid is not mapped by the Yoga adapter."],
      gridAutoColumns: ["CSS Grid is not mapped by the Yoga adapter."],
      gridAutoRows: ["CSS Grid is not mapped by the Yoga adapter."],
      gridAutoFlow: ["CSS Grid is not mapped by the Yoga adapter."],
      gridColumn: ["CSS Grid is not mapped by the Yoga adapter."],
      gridRow: ["CSS Grid is not mapped by the Yoga adapter."],
      gridArea: ["CSS Grid is not mapped by the Yoga adapter."],
      width: ["fr values are unsupported by the adapter."],
      height: ["fr values are unsupported by the adapter."],
      minWidth: ["fr values are unsupported by the adapter."],
      minHeight: ["fr values are unsupported by the adapter."],
      maxWidth: ["fr values are unsupported by the adapter."],
      maxHeight: ["fr values are unsupported by the adapter."],
      inset: ["fr values are unsupported by the adapter."],
      aspectRatio: ["The current adapter does not map aspect-ratio."],
      boxSizing: ["The current adapter does not map box-sizing."],
      margin: ["Percentage and auto margins are not mapped by the current adapter."],
      padding: ["Percentage padding is not mapped by the current adapter."],
      rowGap: ["An explicit zero cannot override a nonzero gap shorthand in the current adapter."],
      columnGap: ["An explicit zero cannot override a nonzero gap shorthand in the current adapter."],
      overflowX: [
        "Yoga receives one combined visible/scroll mode; the result still preserves requested axis metadata.",
      ],
      overflowY: [
        "Yoga receives one combined visible/scroll mode; the result still preserves requested axis metadata.",
      ],
      whiteSpace: ["Affects leaf measurement only, not browser inline layout."],
      overflowWrap: ["Affects leaf measurement only, not browser inline layout."],
    },
    notes: [
      "The capability data is dependency-free; importing it does not load yoga-layout.",
      "The Yoga implementation remains opt-in through the ./layout/yoga package subpath.",
    ],
  }),
);

/** Planned profile used to prevent unimplemented Taffy support from being inferred. */
export const TAFFY_LAYOUT_SOLVER_CAPABILITIES: LayoutSolverCapabilities = freezeCapabilities(
  createKnownCapabilities("taffy", "planned", {
    displayModes: { block: "unsupported", flex: "unsupported", grid: "unsupported", none: "unsupported" },
    lengthUnits: {
      auto: "unsupported",
      cell: "unsupported",
      percent: "unsupported",
      fr: "unsupported",
      vw: "unsupported",
      vh: "unsupported",
      pw: "unsupported",
      ph: "unsupported",
      calc: "unsupported",
      "min-content": "unsupported",
      "max-content": "unsupported",
      minmax: "unsupported",
      "fit-content": "unsupported",
    },
    invariants: {
      "cell-rounding": invariant("unsupported", "No Taffy adapter is implemented; L2 must define this mapping."),
      "overflow-inspection": invariant("unsupported", "No Taffy adapter is implemented; L2 must define this mapping."),
      "intrinsic-measurement": invariant(
        "unsupported",
        "No Taffy adapter is implemented; L2 must define this mapping.",
      ),
      "hidden-nodes": invariant("unsupported", "No Taffy adapter is implemented; L2 must define this mapping."),
      "absolute-children": invariant("unsupported", "No Taffy adapter is implemented; L2 must define this mapping."),
      "min-max-constraints": invariant("unsupported", "No Taffy adapter is implemented; L2 must define this mapping."),
    },
    limitations: {},
    notes: ["Taffy is a planned L2 spike, not an available backend or a current parity claim."],
  }),
);

const knownCapabilities = {
  simple: SIMPLE_LAYOUT_SOLVER_CAPABILITIES,
  yoga: YOGA_LAYOUT_SOLVER_CAPABILITIES,
  taffy: TAFFY_LAYOUT_SOLVER_CAPABILITIES,
} as const satisfies Record<KnownLayoutSolverId, LayoutSolverCapabilities>;

/** Returns a fresh capability profile for one known solver id. */
export function knownLayoutSolverCapabilities(solverId: string): LayoutSolverCapabilities | undefined {
  const profile = knownCapabilities[solverId as KnownLayoutSolverId];
  return profile ? cloneCapabilities(profile) : undefined;
}

/** Returns an exhaustive unknown profile for a third-party solver without attached capability metadata. */
export function unknownLayoutSolverCapabilities(solverId: string): LayoutSolverCapabilities {
  const style = {} as Record<LayoutStyleField, LayoutSolverFieldSupport>;
  for (const fieldName of NORMALIZED_LAYOUT_STYLE_FIELDS) style[fieldName] = "unknown";
  return {
    schemaVersion: 1,
    solverId,
    availability: "custom",
    style,
    displayModes: { block: "unknown", flex: "unknown", grid: "unknown", none: "unknown" },
    lengthUnits: {
      auto: "unknown",
      cell: "unknown",
      percent: "unknown",
      fr: "unknown",
      vw: "unknown",
      vh: "unknown",
      pw: "unknown",
      ph: "unknown",
      calc: "unknown",
      "min-content": "unknown",
      "max-content": "unknown",
      minmax: "unknown",
      "fit-content": "unknown",
    },
    invariants: {
      "cell-rounding": invariant("unknown", "The solver did not publish capability metadata."),
      "overflow-inspection": invariant("unknown", "The solver did not publish capability metadata."),
      "intrinsic-measurement": invariant("unknown", "The solver did not publish capability metadata."),
      "hidden-nodes": invariant("unknown", "The solver did not publish capability metadata."),
      "absolute-children": invariant("unknown", "The solver did not publish capability metadata."),
      "min-max-constraints": invariant("unknown", "The solver did not publish capability metadata."),
    },
    limitations: {},
    notes: ["Attach LayoutSolver.capabilities to make selected-backend validation deterministic."],
  };
}

/** Returns a fresh complete report for tools, documentation, and future solver adapters. */
export function inspectLayoutSolverCapabilities(): LayoutSolverCapabilityReport {
  const cssProperties: Record<string, LayoutStyleField[]> = {};
  for (const [property, styleFields] of Object.entries(LAYOUT_CSS_PROPERTY_FIELDS)) {
    cssProperties[property] = [...styleFields];
  }
  return {
    schemaVersion: 1,
    normalizedStyleFields: [...NORMALIZED_LAYOUT_STYLE_FIELDS],
    cssProperties,
    invariantIds: [...invariantIds],
    solvers: [
      cloneCapabilities(SIMPLE_LAYOUT_SOLVER_CAPABILITIES),
      cloneCapabilities(YOGA_LAYOUT_SOLVER_CAPABILITIES),
      cloneCapabilities(TAFFY_LAYOUT_SOLVER_CAPABILITIES),
    ],
  };
}

/** Resolves attached, known, or explicit unknown capability metadata for a solver-like value. */
export function resolveLayoutSolverCapabilities(
  solver: { id: string; capabilities?: LayoutSolverCapabilities },
): LayoutSolverCapabilities {
  const capabilities = solver.capabilities ?? knownLayoutSolverCapabilities(solver.id) ??
    unknownLayoutSolverCapabilities(solver.id);
  return cloneCapabilities(capabilities);
}

/** Diagnoses one explicit CSS-like declaration for a selected solver. */
export function inspectLayoutDeclarationCompatibility(
  capabilities: LayoutSolverCapabilities,
  declaration: LayoutDeclarationInspection,
): LayoutDiagnostic[] {
  const property = declaration.property.trim().toLowerCase();
  if (property.startsWith("--")) return [];
  const mappedFields = LAYOUT_CSS_PROPERTY_FIELDS[property as keyof typeof LAYOUT_CSS_PROPERTY_FIELDS];
  if (!mappedFields) {
    return [diagnostic(capabilities.solverId, declaration, {
      code: "unsupported-declaration",
      message: `Layout declaration "${property}" is not recognized and was ignored.`,
    })];
  }

  const valueIssue = layoutDeclarationValueIssue(property, declaration.value);
  if (valueIssue) {
    return [diagnostic(capabilities.solverId, declaration, {
      code: "unsupported-declaration",
      message:
        `Layout declaration "${property}: ${declaration.value.trim()}" ${valueIssue} and was ignored or normalized.`,
    })];
  }

  const activeFields = declaration.fields ?? mappedFields;
  if (activeFields.length === 0) return [];

  if (
    capabilities.solverId === "yoga" && property === "display" &&
    declaration.value.trim().toLowerCase() === "grid" && activeFields.includes("display")
  ) {
    return [diagnostic(capabilities.solverId, declaration, {
      code: "solver-fallback",
      field: "display",
      message: "Yoga does not implement CSS Grid; display:grid is solved as column Flexbox.",
    })];
  }

  if (
    capabilities.solverId === "yoga" && property === "display" &&
    declaration.value.trim().toLowerCase() === "block" && activeFields.includes("display")
  ) {
    return [diagnostic(capabilities.solverId, declaration, {
      code: "solver-fallback",
      field: "display",
      message: "Yoga approximates display:block with column Flexbox.",
    })];
  }

  if (
    capabilities.solverId === "yoga" && activeFields.includes("flexDirection") &&
    declaration.value.trim().toLowerCase().split(/\s+/).some((word) =>
      word === "row-reverse" || word === "column-reverse"
    )
  ) {
    return [diagnostic(capabilities.solverId, declaration, {
      code: "partial-solver-support",
      field: "flexDirection",
      message: "The Yoga adapter does not yet map row-reverse or column-reverse.",
    })];
  }

  if (
    capabilities.solverId === "yoga" && property === "justify-content" &&
    declaration.value.trim().toLowerCase() === "space-evenly"
  ) {
    return [diagnostic(capabilities.solverId, declaration, {
      code: "partial-solver-support",
      field: "justifyContent",
      message: "The Yoga adapter does not yet map justify-content:space-evenly.",
    })];
  }

  const authoredNonCellField = yogaNonCellBoxField(property, declaration.value);
  if (capabilities.solverId === "yoga" && authoredNonCellField && activeFields.includes(authoredNonCellField)) {
    return [diagnostic(capabilities.solverId, declaration, {
      code: "partial-solver-support",
      field: authoredNonCellField,
      message:
        `The Yoga adapter does not map ${property} percentage/auto lengths; only terminal-cell values are portable.`,
    })];
  }

  const unsupportedFields = activeFields.filter((fieldName) => capabilities.style[fieldName] === "unsupported");
  if (unsupportedFields.length > 0) {
    return unsupportedFields.map((fieldName) =>
      diagnostic(capabilities.solverId, declaration, {
        code: "unsupported-by-solver",
        field: fieldName,
        message:
          `Normalized style field "${fieldName}" is unsupported by solver "${capabilities.solverId}" and was ignored.`,
      })
    );
  }

  if (
    genericLengthProperty(property) && /(?:^|\s|\()[-+]?\d*\.?\d+fr(?:\s|$|\))/.test(declaration.value.toLowerCase())
  ) {
    return [diagnostic(capabilities.solverId, declaration, {
      code: "unsupported-by-solver",
      field: property === "flex" ? "flexBasis" : activeFields[0],
      message: "The fr unit is only supported in Simple Grid tracks; this value was not applied portably.",
    })];
  }

  if (
    capabilities.solverId === "simple" && property === "flex-wrap" &&
    declaration.value.trim().toLowerCase() === "wrap-reverse"
  ) {
    return [diagnostic(capabilities.solverId, declaration, {
      code: "partial-solver-support",
      field: "flexWrap",
      message: "Simple solver wrap-reverse uses solver-specific terminal-cell ordering pending L1 conformance.",
    })];
  }

  if (
    capabilities.solverId === "simple" && property === "flex-shrink" &&
    Number.parseFloat(declaration.value) === 0
  ) {
    return [diagnostic(capabilities.solverId, declaration, {
      code: "partial-solver-support",
      field: "flexShrink",
      message: "Simple solver flex-shrink:0 is only partially honored by the current integer allocator.",
    })];
  }

  if (
    capabilities.solverId === "simple" && property === "flex" && activeFields.includes("flexShrink") &&
    declaration.style?.flexShrink === 0
  ) {
    return [diagnostic(capabilities.solverId, declaration, {
      code: "partial-solver-support",
      field: "flexShrink",
      message: "Simple solver flex-shrink:0 is only partially honored by the current integer allocator.",
    })];
  }

  const minimumField = activeFields.find((fieldName) => fieldName === "minWidth" || fieldName === "minHeight");
  if (capabilities.solverId === "simple" && minimumField) {
    return [diagnostic(capabilities.solverId, declaration, {
      code: "partial-solver-support",
      field: minimumField,
      message: "Simple solver may clip an explicit minimum to the available allocation instead of overflowing.",
    })];
  }

  if (
    capabilities.solverId === "yoga" && (property === "row-gap" || property === "column-gap") &&
    Number.parseFloat(declaration.value) === 0 &&
    (declaration.style?.gap ?? 0) > 0
  ) {
    return [diagnostic(capabilities.solverId, declaration, {
      code: "partial-solver-support",
      field: property === "row-gap" ? "rowGap" : "columnGap",
      message: `An explicit ${property}:0 cannot override a nonzero gap shorthand in the current solver.`,
    })];
  }

  return [];
}

/** Diagnoses active non-default style fields for programmatically constructed layout trees. */
export function inspectLayoutTreeCompatibility(
  root: LayoutNode,
  capabilities: LayoutSolverCapabilities,
): LayoutDiagnostic[] {
  if (NORMALIZED_LAYOUT_STYLE_FIELDS.every((fieldName) => capabilities.style[fieldName] === "unknown")) {
    return [{
      code: "solver-capabilities-unavailable",
      severity: "warning",
      solverId: capabilities.solverId,
      nodeId: root.id,
      message:
        `Layout solver "${capabilities.solverId}" did not publish capability metadata; compatibility was not validated.`,
    }];
  }

  const defaults = defaultComputedLayoutStyle();
  const diagnostics: LayoutDiagnostic[] = [];
  walkLayoutNodes(root, (node, ancestors) => {
    const parent = ancestors.at(-1);
    for (const fieldName of NORMALIZED_LAYOUT_STYLE_FIELDS) {
      if (!styleFieldChanged(node.style, defaults, fieldName)) continue;
      if (capabilities.solverId === "yoga" && fieldName === "display" && node.style.display === "grid") {
        diagnostics.push(
          fieldDiagnostic(
            capabilities.solverId,
            node.id,
            fieldName,
            "solver-fallback",
            "Yoga does not implement CSS Grid; display:grid is solved as column Flexbox.",
          ),
        );
        continue;
      }
      if (capabilities.style[fieldName] === "unsupported") {
        diagnostics.push(fieldDiagnostic(
          capabilities.solverId,
          node.id,
          fieldName,
          "unsupported-by-solver",
          `Normalized style field "${fieldName}" is unsupported by solver "${capabilities.solverId}" and was ignored.`,
        ));
        continue;
      }
      if (genericLengthField(fieldName) && containsFractionUnit(node.style[fieldName])) {
        diagnostics.push(fieldDiagnostic(
          capabilities.solverId,
          node.id,
          fieldName,
          "unsupported-by-solver",
          "The fr unit is only supported in Simple Grid tracks; this value was not applied portably.",
        ));
      }
      if (
        capabilities.solverId === "simple" && (fieldName === "minWidth" || fieldName === "minHeight")
      ) {
        diagnostics.push(fieldDiagnostic(
          capabilities.solverId,
          node.id,
          fieldName,
          "partial-solver-support",
          "Simple solver may clip an explicit minimum to the available allocation instead of overflowing.",
        ));
      }
    }

    if (capabilities.solverId === "simple") {
      if (ancestors.length === 0 && hasActiveMargin(node.style)) {
        diagnostics.push(fieldDiagnostic(
          capabilities.solverId,
          node.id,
          "margin",
          "unsupported-by-solver",
          "Simple solver ignores margins on the root layout node.",
        ));
      }
      if (parent?.style.display === "flex" && node.style.alignSelf !== defaults.alignSelf) {
        diagnostics.push(fieldDiagnostic(
          capabilities.solverId,
          node.id,
          "alignSelf",
          "unsupported-by-solver",
          "Simple solver alignSelf is applied to Grid items but not Flex items.",
        ));
      }
      if (parent?.style.display === "flex" && node.style.justifySelf !== defaults.justifySelf) {
        diagnostics.push(fieldDiagnostic(
          capabilities.solverId,
          node.id,
          "justifySelf",
          "unsupported-by-solver",
          "Simple solver justifySelf is applied to Grid items but not Flex items.",
        ));
      }
      if (node.style.display === "grid" && node.style.alignItems !== defaults.alignItems) {
        diagnostics.push(fieldDiagnostic(
          capabilities.solverId,
          node.id,
          "alignItems",
          "unsupported-by-solver",
          "Simple Grid does not apply alignItems to distribute items inside tracks; use per-item alignSelf.",
        ));
      }
      if (node.style.display === "grid" && node.style.alignContent !== defaults.alignContent) {
        diagnostics.push(fieldDiagnostic(
          capabilities.solverId,
          node.id,
          "alignContent",
          "unsupported-by-solver",
          "Simple Grid does not apply alignContent to distribute the track collection.",
        ));
      }
      if (node.style.display === "grid" && node.style.justifyContent !== defaults.justifyContent) {
        diagnostics.push(fieldDiagnostic(
          capabilities.solverId,
          node.id,
          "justifyContent",
          "unsupported-by-solver",
          "Simple Grid does not apply justifyContent to distribute the track collection.",
        ));
      }
      if (parent?.style.display === "flex" && node.style.flexShrink === 0) {
        diagnostics.push(fieldDiagnostic(
          capabilities.solverId,
          node.id,
          "flexShrink",
          "partial-solver-support",
          "Simple solver flex-shrink:0 is only partially honored by the current integer allocator.",
        ));
      }
      if (node.style.position === "absolute" && hasDualInset(node.style.inset)) {
        diagnostics.push(fieldDiagnostic(
          capabilities.solverId,
          node.id,
          "inset",
          "partial-solver-support",
          "Simple solver dual-edge absolute insets use solver-specific auto-size behavior pending L1.",
        ));
      }
      if (
        parent?.style.display === "flex" && node.text && node.children.length === 0 &&
        node.style.width.unit !== "auto" && node.style.height.unit === "auto"
      ) {
        diagnostics.push(fieldDiagnostic(
          capabilities.solverId,
          node.id,
          "height",
          "partial-solver-support",
          "Simple Flex may measure intrinsic text before the declared cross-axis constraint is final.",
        ));
      }
      if (node.style.flexWrap === "wrap-reverse") {
        diagnostics.push(fieldDiagnostic(
          capabilities.solverId,
          node.id,
          "flexWrap",
          "partial-solver-support",
          "Simple solver wrap-reverse uses solver-specific terminal-cell ordering pending L1 conformance.",
        ));
      }
    }
    if (capabilities.solverId === "yoga" && node.intrinsic) {
      diagnostics.push({
        code: "partial-solver-support",
        severity: "warning",
        solverId: capabilities.solverId,
        nodeId: node.id,
        message: "Yoga does not map LayoutNode.intrinsic metadata; provide measureText for text leaves instead.",
      });
    }
    if (
      capabilities.solverId === "yoga" &&
      (node.style.flexDirection === "row-reverse" || node.style.flexDirection === "column-reverse")
    ) {
      diagnostics.push(fieldDiagnostic(
        capabilities.solverId,
        node.id,
        "flexDirection",
        "partial-solver-support",
        "The Yoga adapter does not yet map row-reverse or column-reverse.",
      ));
    }
    if (capabilities.solverId === "yoga" && node.style.justifyContent === "space-evenly") {
      diagnostics.push(fieldDiagnostic(
        capabilities.solverId,
        node.id,
        "justifyContent",
        "partial-solver-support",
        "The Yoga adapter does not yet map justify-content:space-evenly.",
      ));
    }
    if (capabilities.solverId === "yoga" && node.style.display === "block" && node.children.length > 0) {
      diagnostics.push(fieldDiagnostic(
        capabilities.solverId,
        node.id,
        "display",
        "solver-fallback",
        "Yoga approximates display:block with column Flexbox.",
      ));
    }
  });
  return mergeLayoutDiagnostics(diagnostics);
}

/** Merges deterministic diagnostics without repeating the same node/property/field issue. */
export function mergeLayoutDiagnostics(...groups: readonly (readonly LayoutDiagnostic[])[]): LayoutDiagnostic[] {
  const merged: LayoutDiagnostic[] = [];
  const seenIssues = new Set<string>();
  for (const group of groups) {
    for (const entry of group) {
      const subject = entry.field
        ? `field:${entry.field}`
        : `property:${entry.property ?? ""}:${entry.selector ?? ""}:${entry.source ?? ""}:${entry.value ?? ""}`;
      const issueKey = [
        entry.code,
        entry.solverId,
        entry.nodeId,
        subject,
        entry.message,
      ].join("\u001f");
      if (seenIssues.has(issueKey)) continue;
      seenIssues.add(issueKey);
      merged.push({ ...entry });
    }
  }
  return merged;
}

function field(simple: LayoutSolverFieldSupport, yoga: LayoutSolverFieldSupport): KnownSolverFieldMatrix {
  return { simple, yoga, taffy: "unsupported" };
}

function fields(...values: LayoutStyleField[]): readonly LayoutStyleField[] {
  return values;
}

function invariant(support: LayoutSolverFieldSupport, detail: string): LayoutContractInvariantCapability {
  return { support, detail };
}

interface KnownCapabilityOptions {
  displayModes: Record<LayoutDisplay, LayoutSolverFieldSupport>;
  lengthUnits: Record<LayoutLengthValue["unit"], LayoutSolverFieldSupport>;
  invariants: Record<LayoutContractInvariantId, LayoutContractInvariantCapability>;
  limitations: Partial<Record<LayoutStyleField, readonly string[]>>;
  notes: readonly string[];
}

function createKnownCapabilities(
  solverId: KnownLayoutSolverId,
  availability: LayoutSolverAvailability,
  options: KnownCapabilityOptions,
): LayoutSolverCapabilities {
  const style = {} as Record<LayoutStyleField, LayoutSolverFieldSupport>;
  for (const fieldName of Object.keys(fieldCapabilityMatrix) as LayoutStyleField[]) {
    style[fieldName] = fieldCapabilityMatrix[fieldName][solverId];
  }
  return {
    schemaVersion: 1,
    solverId,
    availability,
    style,
    displayModes: { ...options.displayModes },
    lengthUnits: { ...options.lengthUnits },
    invariants: cloneInvariants(options.invariants),
    limitations: cloneLimitations(options.limitations),
    notes: [...options.notes],
  };
}

function freezeCapabilities(capabilities: LayoutSolverCapabilities): LayoutSolverCapabilities {
  Object.freeze(capabilities.style);
  Object.freeze(capabilities.displayModes);
  Object.freeze(capabilities.lengthUnits);
  for (const invariantCapability of Object.values(capabilities.invariants)) Object.freeze(invariantCapability);
  Object.freeze(capabilities.invariants);
  for (const entries of Object.values(capabilities.limitations)) Object.freeze(entries);
  Object.freeze(capabilities.limitations);
  Object.freeze(capabilities.notes);
  return Object.freeze(capabilities);
}

function cloneCapabilities(capabilities: LayoutSolverCapabilities): LayoutSolverCapabilities {
  return {
    schemaVersion: 1,
    solverId: capabilities.solverId,
    availability: capabilities.availability,
    style: { ...capabilities.style },
    displayModes: { ...capabilities.displayModes },
    lengthUnits: { ...capabilities.lengthUnits },
    invariants: cloneInvariants(capabilities.invariants),
    limitations: cloneLimitations(capabilities.limitations),
    notes: [...capabilities.notes],
  };
}

function cloneInvariants(
  invariants: Readonly<Record<LayoutContractInvariantId, LayoutContractInvariantCapability>>,
): Record<LayoutContractInvariantId, LayoutContractInvariantCapability> {
  const clone = {} as Record<LayoutContractInvariantId, LayoutContractInvariantCapability>;
  for (const id of invariantIds) clone[id] = { ...invariants[id] };
  return clone;
}

function cloneLimitations(
  limitations: Readonly<Partial<Record<LayoutStyleField, readonly string[]>>>,
): Partial<Record<LayoutStyleField, readonly string[]>> {
  const clone: Partial<Record<LayoutStyleField, readonly string[]>> = {};
  for (const fieldName of NORMALIZED_LAYOUT_STYLE_FIELDS) {
    const entries = limitations[fieldName];
    if (entries) clone[fieldName] = [...entries];
  }
  return clone;
}

function diagnostic(
  solverId: string,
  declaration: LayoutDeclarationInspection,
  issue: Pick<LayoutDiagnostic, "code" | "message"> & { field?: LayoutStyleField },
): LayoutDiagnostic {
  return {
    code: issue.code,
    severity: "warning",
    message: issue.message,
    solverId,
    nodeId: declaration.nodeId,
    selector: declaration.selector,
    source: declaration.source,
    property: declaration.property,
    value: declaration.value,
    field: issue.field,
  };
}

function fieldDiagnostic(
  solverId: string,
  nodeId: string,
  fieldName: LayoutStyleField,
  code: LayoutDiagnosticCode,
  message: string,
): LayoutDiagnostic {
  return { code, severity: "warning", solverId, nodeId, field: fieldName, message };
}

function styleFieldChanged(
  style: ComputedLayoutStyle,
  defaults: ComputedLayoutStyle,
  fieldName: LayoutStyleField,
): boolean {
  return JSON.stringify(style[fieldName]) !== JSON.stringify(defaults[fieldName]);
}

function genericLengthProperty(property: string): boolean {
  return [
    "width",
    "height",
    "min-width",
    "min-height",
    "max-width",
    "max-height",
    "flex",
    "flex-basis",
    "inset",
    "top",
    "right",
    "bottom",
    "left",
  ].includes(property);
}

function genericLengthField(fieldName: LayoutStyleField): boolean {
  return ["width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight", "flexBasis", "inset"].includes(
    fieldName,
  );
}

function containsFractionUnit(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if ("unit" in value && (value as LayoutLengthValue).unit === "fr") return true;
  return Object.values(value).some((entry) => containsFractionUnit(entry));
}

function hasDualInset(inset: ComputedLayoutStyle["inset"]): boolean {
  return (inset.left.unit !== "auto" && inset.right.unit !== "auto") ||
    (inset.top.unit !== "auto" && inset.bottom.unit !== "auto");
}

function hasActiveMargin(style: ComputedLayoutStyle): boolean {
  const edges = (style as ComputedLayoutStyle & {
    __layoutLengths?: { margin?: Record<"top" | "right" | "bottom" | "left", LayoutLengthValue> };
  }).__layoutLengths?.margin;
  if (!edges) {
    return style.margin.top !== 0 || style.margin.right !== 0 || style.margin.bottom !== 0 || style.margin.left !== 0;
  }
  return Object.values(edges).some((edge) => edge.unit === "auto" || edge.value !== 0);
}

function yogaNonCellBoxField(property: string, rawValue: string): LayoutStyleField | undefined {
  const value = rawValue.trim().toLowerCase();
  const hasPercent = /(?:^|\s)\.?\d+(?:\.\d+)?%(?:\s|$)/.test(value);
  if (property === "margin" || property.startsWith("margin-")) {
    return hasPercent || /(?:^|\s)auto(?:\s|$)/.test(value) ? "margin" : undefined;
  }
  if (property === "padding" || property.startsWith("padding-")) {
    return hasPercent ? "padding" : undefined;
  }
  if (property === "gap") return hasPercent ? "gap" : undefined;
  if (property === "row-gap") return hasPercent ? "rowGap" : undefined;
  if (property === "column-gap") return hasPercent ? "columnGap" : undefined;
  return undefined;
}

function layoutDeclarationValueIssue(property: string, rawValue: string): string | undefined {
  const value = rawValue.trim().toLowerCase();
  const words = value.split(/\s+/).filter(Boolean);
  let supported = true;

  switch (property) {
    case "display":
      supported = oneOf(value, "block", "flex", "grid", "none");
      break;
    case "position":
      supported = oneOf(value, "relative", "absolute");
      break;
    case "flex-direction":
      supported = oneOf(value, "row", "row-reverse", "column", "column-reverse");
      break;
    case "flex-wrap":
      supported = oneOf(value, "nowrap", "wrap", "wrap-reverse");
      break;
    case "flex-flow":
      supported = validFlexFlow(words);
      break;
    case "flex-grow":
    case "flex-shrink":
      supported = validNonnegativeNumber(value);
      break;
    case "flex-basis":
    case "width":
    case "height":
    case "min-width":
    case "min-height":
    case "max-width":
    case "max-height":
    case "top":
    case "right":
    case "bottom":
    case "left":
      supported = validLayoutLength(value);
      break;
    case "aspect-ratio":
      supported = validAspectRatio(value);
      break;
    case "box-sizing":
      supported = oneOf(value, "content-box", "border-box");
      break;
    case "flex":
      supported = validFlexShorthand(words);
      break;
    case "order":
    case "z-index":
      supported = validSignedNumber(value);
      break;
    case "align-items":
      supported = oneOf(value, "start", "end", "center", "stretch", "flex-start", "flex-end");
      break;
    case "align-content":
      supported = oneOf(
        value,
        "start",
        "end",
        "center",
        "stretch",
        "space-between",
        "space-around",
        "space-evenly",
        "flex-start",
        "flex-end",
      );
      break;
    case "justify-content":
      supported = oneOf(
        value,
        "start",
        "end",
        "center",
        "space-between",
        "space-around",
        "space-evenly",
        "flex-start",
        "flex-end",
      );
      break;
    case "align-self":
    case "justify-self":
      supported = validSelfAlignment(value);
      break;
    case "place-self":
      supported = words.length >= 1 && words.length <= 2 && words.every(validSelfAlignment);
      break;
    case "grid-template-columns":
    case "grid-template-rows":
      supported = validGridTrackList(value);
      break;
    case "grid-template-areas":
      supported = validGridTemplateAreas(rawValue.trim());
      break;
    case "grid-auto-columns":
    case "grid-auto-rows":
      supported = validLayoutLength(value);
      break;
    case "grid-auto-flow":
      supported = oneOf(value, "row", "column");
      break;
    case "grid-column":
    case "grid-row":
      supported = validGridPlacement(value);
      break;
    case "grid-column-start":
    case "grid-column-end":
    case "grid-row-start":
    case "grid-row-end":
      supported = validGridPlacementPart(value, true);
      break;
    case "grid-area":
      supported = value === "auto" || /^[a-z_][\w-]*$/i.test(value);
      break;
    case "inset":
      supported = words.length >= 1 && words.length <= 4 && words.every(validLayoutLength);
      break;
    case "margin":
      supported = validLengthBox(words, true);
      break;
    case "padding":
      supported = validLengthBox(words, false);
      break;
    case "border-width":
      supported = validCellBox(words);
      break;
    case "margin-top":
    case "margin-right":
    case "margin-bottom":
    case "margin-left":
      supported = validBoxLength(value, true);
      break;
    case "padding-top":
    case "padding-right":
    case "padding-bottom":
    case "padding-left":
      supported = validBoxLength(value, false);
      break;
    case "border-top":
    case "border-right":
    case "border-bottom":
    case "border-left":
    case "gap":
      supported = words.length >= 1 && words.length <= 2 && words.every(validGapLength);
      break;
    case "row-gap":
    case "column-gap":
      supported = validGapLength(value);
      break;
    case "border":
      supported = validBorderShorthand(words);
      break;
    case "border-style":
      supported = oneOf(value, "none", "single", "double", "solid", "round", "heavy");
      break;
    case "overflow":
    case "overflow-x":
    case "overflow-y":
      supported = oneOf(value, "visible", "hidden", "auto", "scroll");
      break;
    case "visibility":
      supported = oneOf(value, "visible", "hidden");
      break;
    case "white-space":
      supported = oneOf(value, "normal", "nowrap", "pre", "pre-wrap");
      break;
    case "overflow-wrap":
    case "word-wrap":
      supported = oneOf(value, "normal", "anywhere", "break-word");
      break;
    case "color":
    case "background":
    case "background-color":
    case "border-color":
      supported = rawValue.trim().length > 0;
      break;
  }

  return supported ? undefined : "uses a value outside the supported terminal-cell subset";
}

function oneOf(value: string, ...allowed: string[]): boolean {
  return allowed.includes(value);
}

function validNonnegativeNumber(value: string): boolean {
  return /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value);
}

function validSignedNumber(value: string): boolean {
  return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value);
}

function validCellScalar(value: string): boolean {
  return /^(?:\d+(?:\.\d+)?|\.\d+)(?:ch|cells?)?$/.test(value);
}

function validLayoutLength(value: string): boolean {
  return value === "auto" || /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) ||
    /^(?:\d+(?:\.\d+)?|\.\d+)(?:%|fr|ch|cells?)$/.test(value);
}

function validAspectRatio(value: string): boolean {
  if (value === "auto") return true;
  const parts = value.split("/").map((part) => part.trim());
  if (parts.length < 1 || parts.length > 2 || !parts.every(validPositiveNumber)) return false;
  return parts.every((part) => Number.parseFloat(part) > 0);
}

function validPositiveNumber(value: string): boolean {
  return /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value);
}

function validBoxLength(value: string, allowAuto: boolean): boolean {
  return allowAuto && value === "auto" || validCellScalar(value) || /^(?:\d+(?:\.\d+)?|\.\d+)%$/.test(value);
}

function validLengthBox(words: readonly string[], allowAuto: boolean): boolean {
  return words.length >= 1 && words.length <= 4 && words.every((word) => validBoxLength(word, allowAuto));
}

function validGapLength(value: string): boolean {
  return validCellScalar(value) || /^(?:\d+(?:\.\d+)?|\.\d+)%$/.test(value);
}

function validCellBox(words: readonly string[]): boolean {
  return words.length >= 1 && words.length <= 4 && words.every(validCellScalar);
}

function validFlexFlow(words: readonly string[]): boolean {
  if (words.length < 1 || words.length > 2) return false;
  let direction = false;
  let wrap = false;
  for (const word of words) {
    if (oneOf(word, "row", "row-reverse", "column", "column-reverse")) {
      if (direction) return false;
      direction = true;
    } else if (oneOf(word, "nowrap", "wrap", "wrap-reverse")) {
      if (wrap) return false;
      wrap = true;
    } else return false;
  }
  return direction || wrap;
}

function validFlexShorthand(words: readonly string[]): boolean {
  if (words.length === 1) return oneOf(words[0]!, "none", "auto") || validNonnegativeNumber(words[0]!);
  if (words.length === 2) return words.every(validNonnegativeNumber);
  return words.length === 3 && validNonnegativeNumber(words[0]!) && validNonnegativeNumber(words[1]!) &&
    validLayoutLength(words[2]!);
}

function validSelfAlignment(value: string): boolean {
  return oneOf(value, "auto", "start", "end", "center", "stretch", "flex-start", "flex-end");
}

function validGridTrackList(value: string): boolean {
  if (value === "none") return true;
  if (!value) return false;
  const tokens = value.match(/repeat\([^)]*\)|\S+/g) ?? [];
  if (tokens.join(" ").replaceAll(/\s+/g, " ") !== value.replaceAll(/\s+/g, " ").trim()) return false;
  return tokens.length > 0 && tokens.every((token) => {
    const repeat = token.match(/^repeat\(\s*\d+\s*,\s*([^)]+)\)$/);
    if (!repeat) return validLayoutLength(token);
    const repeatedTracks = repeat[1]!.trim().split(/\s+/);
    return repeatedTracks.length > 0 && repeatedTracks.every(validLayoutLength);
  });
}

function validGridTemplateAreas(value: string): boolean {
  if (value.toLowerCase() === "none") return true;
  const rows: string[][] = [];
  const remainder = value.replace(/"([^"]*)"|'([^']*)'/g, (_match, double: string, single: string) => {
    const cells = (double ?? single ?? "").trim().split(/\s+/).filter(Boolean);
    rows.push(cells);
    return "";
  });
  if (remainder.trim() || rows.length === 0 || rows[0]!.length === 0) return false;
  const width = rows[0]!.length;
  if (!rows.every((row) => row.length === width && row.every((cell) => cell === "." || /^[a-z_][\w-]*$/i.test(cell)))) {
    return false;
  }

  const names = new Set(rows.flat().filter((cell) => cell !== "."));
  for (const name of names) {
    let minRow = rows.length;
    let maxRow = -1;
    let minColumn = width;
    let maxColumn = -1;
    for (let row = 0; row < rows.length; row += 1) {
      for (let column = 0; column < width; column += 1) {
        if (rows[row]![column] !== name) continue;
        minRow = Math.min(minRow, row);
        maxRow = Math.max(maxRow, row);
        minColumn = Math.min(minColumn, column);
        maxColumn = Math.max(maxColumn, column);
      }
    }
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        if (rows[row]![column] !== name) return false;
      }
    }
  }
  return true;
}

function validGridPlacement(value: string): boolean {
  if (value === "auto") return true;
  const parts = value.split("/").map((part) => part.trim());
  return parts.length >= 1 && parts.length <= 2 && parts.every((part) => validGridPlacementPart(part, false));
}

function validGridPlacementPart(value: string, allowAuto: boolean): boolean {
  return (allowAuto && value === "auto") || /^[1-9]\d*$/.test(value) || /^span\s+[1-9]\d*$/.test(value);
}

function validBorderShorthand(words: readonly string[]): boolean {
  if (words.length === 1 && words[0] === "none") return true;
  if (words.length === 0) return false;
  let widths = 0;
  let styles = 0;
  let colors = 0;
  for (const word of words) {
    if (validCellScalar(word)) widths += 1;
    else if (oneOf(word, "none", "single", "double", "solid", "round", "heavy")) styles += 1;
    else if (word.startsWith("#") || word.startsWith("rgb") || word.startsWith("var(")) colors += 1;
    else return false;
  }
  return widths <= 1 && styles <= 1 && colors <= 1;
}
