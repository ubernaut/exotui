import { crayon } from "crayon";
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshPhongMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  TorusKnotGeometry,
} from "three";

import { handleInput } from "../src/input.ts";
import { handleKeyboardControls, handleMouseControls } from "../src/controls.ts";
import { Box } from "../src/components/box.ts";
import { Frame } from "../src/components/frame.ts";
import { Text } from "../src/components/text.ts";
import type { TextRectangle } from "../src/canvas/text.ts";
import { ThreeAscii } from "../src/components/three_ascii.ts";
import { emptyStyle } from "../src/theme.ts";
import { ASCII_DEMO_PRESETS, ASCII_NUMERIC_CONTROLS, ASCII_TOGGLE_CONTROLS } from "../src/three_ascii/demo_presets.ts";
import {
  applyAsciiPreset,
  asciiEffectOptions,
  createDefaultAsciiOptions,
  type ThreeAsciiConfigOptions,
} from "../src/three_ascii/options.ts";
import { TERMINAL_GLYPH_STYLES, type TerminalGlyphStyle } from "../src/three_ascii/glyphs.ts";
import { requireInteractiveTerminal } from "../app/styles.ts";
import {
  layoutThreeAsciiDemoWindow,
  threeAsciiDemoBodyRect,
  threeAsciiDemoControlRect,
  threeAsciiDemoControlText,
  threeAsciiDemoSidePanelVisible,
  threeAsciiDemoTitlebarControlAt,
  threeAsciiDemoTitleRect,
} from "../app/types.ts";
import { Computed, Signal, Tui } from "../mod.ts";

const showControlsAtStartup = !Deno.args.some((arg) => arg === "--no-controls" || arg === "--hide-controls");

requireInteractiveTerminal("deno task three-ascii");

const tui = new Tui({
  style: crayon.bgBlack,
  refreshRate: 1000 / 30,
  enableMouse: true,
});

handleInput(tui);
handleKeyboardControls(tui);
handleMouseControls(tui);
tui.dispatch();
tui.run();

const scene = new Scene();
scene.background = new Color("#071017");

const camera = new PerspectiveCamera(42, 1, 0.1, 40);
camera.position.set(0, 1.4, 7);

scene.add(new AmbientLight(new Color("#71828a"), 1.5));

const keyLight = new DirectionalLight(new Color("#fff1c4"), 2.6);
keyLight.position.set(5, 6, 3);
scene.add(keyLight);

const fillLight = new DirectionalLight(new Color("#7fc0ff"), 1.1);
fillLight.position.set(-4, 2, 5);
scene.add(fillLight);

const rimLight = new DirectionalLight(new Color("#ff4fd8"), 0.85);
rimLight.position.set(-3, 4, -2);
scene.add(rimLight);

const stage = new Group();
scene.add(stage);

const torus = new Mesh(
  new TorusKnotGeometry(1.25, 0.45, 256, 36),
  new MeshPhongMaterial({
    color: new Color("#9cff3a"),
    emissive: new Color("#163a05"),
    shininess: 60,
    specular: new Color("#ffffff"),
  }),
);
torus.position.set(-1.35, 1.3, 0.2);
stage.add(torus);

const sphere = new Mesh(
  new SphereGeometry(0.9, 64, 64),
  new MeshPhongMaterial({
    color: new Color("#1ee7d2"),
    emissive: new Color("#052f2a"),
    shininess: 100,
    specular: new Color("#d7f6ff"),
  }),
);
sphere.position.set(1.9, 0.7, -0.6);
stage.add(sphere);

const block = new Mesh(
  new BoxGeometry(1.2, 1.2, 1.2),
  new MeshPhongMaterial({
    color: new Color("#ff4fd8"),
    emissive: new Color("#3a042e"),
    shininess: 48,
  }),
);
block.position.set(0.4, 2.55, -1.9);
block.rotation.set(0.5, 0.4, 0.2);
stage.add(block);

const floor = new Mesh(
  new PlaneGeometry(18, 18, 1, 1),
  new MeshPhongMaterial({
    color: new Color("#12212a"),
    specular: new Color("#0f4039"),
    shininess: 14,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.45;
scene.add(floor);

new Text({
  parent: tui,
  theme: { base: crayon.white },
  text: "three_ascii demo | M controls | Esc / Ctrl+C to exit",
  rectangle: {
    column: 2,
    row: 0,
  },
  zIndex: 2,
});

const menuVisible = new Signal(showControlsAtStartup);
const renderMinimized = new Signal(false);
const renderMaximized = new Signal(false);
const selectedRow = new Signal(0);
const menuWidth = 34;
const panelOuterWidth = menuWidth + 2;
const panelGap = 2;
const asciiOptions = createDefaultAsciiOptions();
const sidePanelVisible = new Computed(() =>
  threeAsciiDemoSidePanelVisible({
    menuVisible: menuVisible.value,
    minimized: renderMinimized.value,
    maximized: renderMaximized.value,
  })
);

const renderWindowRectangle = new Computed(() =>
  layoutThreeAsciiDemoWindow({
    terminalWidth: tui.rectangle.value.width,
    terminalHeight: tui.rectangle.value.height,
    menuVisible: menuVisible.value,
    minimized: renderMinimized.value,
    maximized: renderMaximized.value,
    menuOuterWidth: panelOuterWidth,
    panelGap,
  })
);

const renderBodyRectangle = new Computed(() => threeAsciiDemoBodyRect(renderWindowRectangle.value));

const ascii = new ThreeAscii({
  parent: tui,
  theme: { base: emptyStyle },
  rectangle: renderBodyRectangle,
  visible: new Computed(() => !renderMinimized.value),
  zIndex: 1,
  scene,
  camera,
  effect: asciiEffectOptions(asciiOptions),
  terminalGlyphStyle: asciiOptions.terminalGlyphStyle,
  terminalEdgeBias: asciiOptions.terminalEdgeBias,
  onFrame: (deltaTime) => {
    stage.rotation.y += deltaTime * 0.22;
    torus.rotation.x += deltaTime * 0.28;
    torus.rotation.y += deltaTime * 0.44;
    sphere.position.y = 0.7 + Math.sin(performance.now() * 0.0011) * 0.26;
    sphere.rotation.y += deltaTime * 0.55;
    block.rotation.x += deltaTime * 0.35;
    block.rotation.z += deltaTime * 0.25;
  },
});

type ToggleKey = (typeof ASCII_TOGGLE_CONTROLS)[number]["key"];
type NumericKey = (typeof ASCII_NUMERIC_CONTROLS)[number]["key"];

interface ToggleRow {
  type: "toggle";
  key: ToggleKey;
  label: string;
}

interface NumericRow {
  type: "numeric";
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
}

interface PresetRow {
  type: "preset";
  label: string;
}

interface GlyphStyleRow {
  type: "glyphStyle";
  label: string;
}

interface EdgeBiasRow {
  type: "terminalEdgeBias";
  label: string;
  min: number;
  max: number;
  step: number;
}

type MenuRow = PresetRow | GlyphStyleRow | ToggleRow | NumericRow | EdgeBiasRow;

const panelRows: readonly MenuRow[] = [
  { type: "preset", label: "Preset" },
  { type: "glyphStyle", label: "Glyph style" },
  ...ASCII_TOGGLE_CONTROLS.map((control) => ({ type: "toggle", key: control.key, label: control.label }) as ToggleRow),
  ...ASCII_NUMERIC_CONTROLS.map((control) =>
    ({
      type: "numeric",
      key: control.key,
      label: control.label,
      min: control.min,
      max: control.max,
      step: control.step,
      format: control.format,
    }) as NumericRow
  ),
  { type: "terminalEdgeBias", label: "Terminal edge bias", min: 0.6, max: 1.8, step: 0.05 },
] as const;
const menuLines = panelRows.map(() => new Signal(""));
const menuSubtitle = new Signal(`Arrows tune | 1-${ASCII_DEMO_PRESETS.length} presets`);
const activePresetId = new Signal(asciiOptions.preset);

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const getAsciiObject = () => ascii.drawnObjects.three_ascii;

function applyRendererOptions(): void {
  const object = getAsciiObject();
  object?.setEffectOptions(asciiEffectOptions(asciiOptions));
  object?.setTerminalEdgeBias(asciiOptions.terminalEdgeBias);
  object?.setTerminalGlyphStyle(asciiOptions.terminalGlyphStyle);
}

function markCustomConfig(): void {
  asciiOptions.preset = "custom";
  activePresetId.value = "";
}

function applyEffectPatch(patch: Partial<ThreeAsciiConfigOptions>): void {
  Object.assign(asciiOptions, patch);
  getAsciiObject()?.setEffectOptions(asciiEffectOptions(asciiOptions));
}

function applyTerminalEdgeBias(value: number): void {
  asciiOptions.terminalEdgeBias = clamp(value, 0.6, 1.8);
  getAsciiObject()?.setTerminalEdgeBias(asciiOptions.terminalEdgeBias);
}

function applyTerminalGlyphStyle(style: TerminalGlyphStyle): void {
  asciiOptions.terminalGlyphStyle = style;
  getAsciiObject()?.setTerminalGlyphStyle(style);
}

new Box({
  parent: tui,
  theme: { base: crayon.bgBlack },
  rectangle: renderWindowRectangle,
  zIndex: 0,
});

new Frame({
  parent: tui,
  theme: { base: crayon.white },
  rectangle: renderWindowRectangle,
  zIndex: 3,
  charMap: "rounded",
});

new Text({
  parent: tui,
  theme: { base: crayon.bgBlack.white.bold },
  text: new Computed<string>(() => {
    const label = renderMinimized.value ? "THREE ASCII RENDERER · MINIMIZED" : "THREE ASCII RENDERER";
    return ` ${label} `.slice(0, threeAsciiDemoTitleRect(renderWindowRectangle.value).width);
  }),
  rectangle: new Computed<TextRectangle>(() => threeAsciiDemoTitleRect(renderWindowRectangle.value)),
  zIndex: 12,
});

new Text({
  parent: tui,
  theme: { base: crayon.bgWhite.black.bold },
  text: new Computed<string>(() => threeAsciiDemoControlText(renderWindowRectangle.value)),
  rectangle: new Computed<TextRectangle>(() => threeAsciiDemoControlRect(renderWindowRectangle.value)),
  zIndex: 13,
});

function applyPresetByIndex(index: number): void {
  const preset = ASCII_DEMO_PRESETS[(index + ASCII_DEMO_PRESETS.length) % ASCII_DEMO_PRESETS.length];
  applyAsciiPreset(asciiOptions, preset.id);
  applyRendererOptions();
  activePresetId.value = asciiOptions.preset;
  refreshMenu();
}

function cyclePreset(delta: number): void {
  const currentIndex = Math.max(0, ASCII_DEMO_PRESETS.findIndex((preset) => preset.id === activePresetId.peek()));
  applyPresetByIndex(currentIndex + delta);
}

function refreshMenu(): void {
  const activePreset = ASCII_DEMO_PRESETS.find((preset) => preset.id === activePresetId.peek());
  menuSubtitle.value = activePreset
    ? `${activePreset.label} | arrows | 1-${ASCII_DEMO_PRESETS.length}`
    : `Custom | arrows | 1-${ASCII_DEMO_PRESETS.length}`;

  panelRows.forEach((row, index) => {
    const marker = selectedRow.peek() === index ? ">" : " ";
    let value = "";

    if (row.type === "preset") {
      value = activePreset?.label ?? "Custom";
    } else if (row.type === "glyphStyle") {
      value = asciiOptions.terminalGlyphStyle;
    } else if (row.type === "toggle") {
      value = asciiOptions[row.key] ? "on" : "off";
    } else if (row.type === "numeric") {
      const numericValue = asciiOptions[row.key];
      value = row.format ? row.format(numericValue) : numericValue.toString();
    } else {
      value = asciiOptions.terminalEdgeBias.toFixed(2);
    }

    // Right-align values inside the panel interior so long values
    // ("OpenTUI Blocks") never run through the frame's right border.
    const interior = menuWidth - 1;
    const left = `${marker} ${row.label}`;
    const gap = Math.max(1, interior - left.length - value.length);
    menuLines[index].value = `${left}${" ".repeat(gap)}${value}`.slice(0, interior);
  });
}

function adjustSelected(delta: number): void {
  const row = panelRows[selectedRow.peek()];
  if (!row) {
    return;
  }

  if (row.type === "preset") {
    cyclePreset(delta);
    return;
  }

  if (row.type === "toggle") {
    applyEffectPatch({ [row.key]: !asciiOptions[row.key] });
    markCustomConfig();
    refreshMenu();
    return;
  }

  if (row.type === "glyphStyle") {
    const currentIndex = TERMINAL_GLYPH_STYLES.indexOf(asciiOptions.terminalGlyphStyle);
    const nextIndex = (currentIndex + delta + TERMINAL_GLYPH_STYLES.length) % TERMINAL_GLYPH_STYLES.length;
    applyTerminalGlyphStyle(TERMINAL_GLYPH_STYLES[nextIndex]);
    markCustomConfig();
    refreshMenu();
    return;
  }

  if (row.type === "numeric") {
    const nextValue = clamp(asciiOptions[row.key] + delta * row.step, row.min, row.max);
    applyEffectPatch({ [row.key]: nextValue });
    markCustomConfig();
    refreshMenu();
    return;
  }

  applyTerminalEdgeBias(asciiOptions.terminalEdgeBias + delta * row.step);
  markCustomConfig();
  refreshMenu();
}

const panelRectangle = new Computed(() => ({
  column: Math.max(3, tui.rectangle.value.width - menuWidth - 4),
  row: 3,
  width: menuWidth,
  height: panelRows.length + 2,
}));

new Box({
  parent: tui,
  theme: { base: crayon.bgBlack.white },
  rectangle: panelRectangle,
  visible: sidePanelVisible,
  zIndex: 5,
});

new Frame({
  parent: tui,
  theme: { base: crayon.white },
  rectangle: panelRectangle,
  visible: sidePanelVisible,
  zIndex: 6,
  charMap: "rounded",
});

new Text({
  parent: tui,
  theme: { base: crayon.white },
  text: "ASCII Controls",
  rectangle: new Computed(() => ({
    column: panelRectangle.value.column + 1,
    row: panelRectangle.value.row,
  })),
  visible: sidePanelVisible,
  zIndex: 7,
});

new Text({
  parent: tui,
  theme: { base: crayon.lightBlack },
  text: menuSubtitle,
  rectangle: new Computed(() => ({
    column: panelRectangle.value.column + 1,
    row: panelRectangle.value.row + 1,
  })),
  visible: sidePanelVisible,
  zIndex: 7,
});

menuLines.forEach((line, index) => {
  new Text({
    parent: tui,
    theme: { base: crayon.white },
    text: line,
    rectangle: new Computed(() => ({
      column: panelRectangle.value.column + 1,
      row: panelRectangle.value.row + 2 + index,
    })),
    visible: sidePanelVisible,
    zIndex: 7,
  });
});

tui.on("keyPress", ({ key, ctrl, meta }) => {
  if (ctrl || meta) {
    return;
  }
  // Shifted letters arrive as their uppercase code; the header advertises
  // plain letters, so both cases must work.
  const lower = key.length === 1 ? key.toLowerCase() : key;

  if (lower === "escape" || lower === "x") {
    tui.emit("destroy");
    return;
  }

  if (lower === "m") {
    menuVisible.value = !menuVisible.peek();
    return;
  }

  if (lower === "f") {
    renderMaximized.value = !renderMaximized.peek();
    if (renderMaximized.peek()) renderMinimized.value = false;
    return;
  }

  if (lower === "r") {
    renderMinimized.value = false;
    renderMaximized.value = false;
    return;
  }

  if (lower >= "1" && lower <= String(Math.min(ASCII_DEMO_PRESETS.length, 9))) {
    applyPresetByIndex(Number(lower) - 1);
    return;
  }

  if (!menuVisible.peek()) {
    return;
  }

  if (key === "up") {
    selectedRow.value = (selectedRow.peek() + panelRows.length - 1) % panelRows.length;
    refreshMenu();
    return;
  }

  if (key === "down") {
    selectedRow.value = (selectedRow.peek() + 1) % panelRows.length;
    refreshMenu();
    return;
  }

  if (key === "left") {
    adjustSelected(-1);
    return;
  }

  if (key === "right" || key === "return") {
    adjustSelected(1);
  }
});

tui.on("mousePress", ({ x, y, release, drag, ctrl, meta, shift }) => {
  if (release || drag || ctrl || meta || shift) return;
  const hit = threeAsciiDemoTitlebarControlAt(renderWindowRectangle.peek(), x, y);
  if (!hit) return;
  if (hit === "minimize") {
    renderMinimized.value = true;
    renderMaximized.value = false;
  } else if (hit === "maximize") {
    renderMaximized.value = true;
    renderMinimized.value = false;
  } else if (hit === "restore") {
    renderMinimized.value = false;
    renderMaximized.value = false;
  } else {
    tui.emit("destroy");
  }
});

refreshMenu();
