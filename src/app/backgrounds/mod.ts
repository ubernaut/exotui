// Copyright 2023 Im-Beast. MIT license.

// Every background field the library ships, in exomux's stable cycle order.
// Each entry is a factory: fields keep internal state and one desktop wants
// its own instance. The GPU-dependent and host-dependent backgrounds
// (butterchurn, image) remain application-side hosts; everything here runs
// wherever cells and (for turbulence) WebGPU exist — a terminal on Deno or a
// browser canvas alike.

import type { ShellAnimatedBackground } from "./contract.ts";
import { ShellMetaballBackground } from "../shell_background.ts";
import { ShellMatrixRainField } from "./matrix_background.ts";
import { ShellRainyWindowsField } from "./rainy_windows_background.ts";
import { ShellCircuitField } from "./circuit_background.ts";
import { ShellBiomechField } from "./biomech_background.ts";
import { ShellJungleField } from "./jungle_background.ts";
import { ShellVaporwaveField } from "./vaporwave_background.ts";
import { ShellSkullField } from "./skull_background.ts";
import { ShellIvyField } from "./ivy_background.ts";
import { ShellFireField } from "./fire_background.ts";
import { ShellTurbulenceField } from "./turbulence_background.ts";

export * from "./contract.ts";
export * from "./gpu_device.ts";
export * from "./matrix_background.ts";
export * from "./rainy_windows_background.ts";
export * from "./circuit_background.ts";
export * from "./biomech_background.ts";
export * from "./jungle_background.ts";
export * from "./vaporwave_background.ts";
export * from "./skull_background.ts";
export * from "./ivy_background.ts";
export * from "./fire_background.ts";
export * from "./turbulence_background.ts";

/** One selectable background: a stable id, a label, and a fresh field. */
export interface ShellBackgroundEntry {
  readonly id: string;
  readonly label: string;
  readonly create: () => ShellAnimatedBackground;
  /** Preferred advance rate; hosts default to a calm 8 when absent. */
  readonly fps?: number;
}

/** The portable catalog, in exomux's stable cycle order. */
export const SHELL_BACKGROUND_FIELDS: readonly ShellBackgroundEntry[] = [
  { id: "metaballs", label: "metaballs", create: () => new ShellMetaballBackground() },
  { id: "matrix", label: "matrix", create: () => new ShellMatrixRainField() },
  { id: "rainy windows", label: "rainy windows", create: () => new ShellRainyWindowsField() },
  { id: "circuit", label: "circuit", create: () => new ShellCircuitField() },
  { id: "biomech", label: "biomech", create: () => new ShellBiomechField() },
  { id: "jungle", label: "jungle", create: () => new ShellJungleField() },
  { id: "vaporwave", label: "vaporwave", create: () => new ShellVaporwaveField() },
  { id: "skull", label: "skull", create: () => new ShellSkullField() },
  { id: "ivy", label: "ivy", create: () => new ShellIvyField() },
  { id: "fire", label: "fire", create: () => new ShellFireField() },
  { id: "turbulence", label: "turbulence", create: () => new ShellTurbulenceField() },
];
