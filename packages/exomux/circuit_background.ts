// Moved into the library (src/app/backgrounds/). This shim keeps the
// historical exomux names; everything here is a re-export.

export { ShellCircuitField as ExomuxCircuitField } from "@ubernaut/exotui";
export type {
  ShellCircuitChipSnapshot as ExomuxCircuitChipSnapshot,
  ShellCircuitFieldOptions as ExomuxCircuitFieldOptions,
  ShellCircuitInspection as ExomuxCircuitInspection,
  ShellCircuitLedSnapshot as ExomuxCircuitLedSnapshot,
  ShellCircuitOscillatorSnapshot as ExomuxCircuitOscillatorSnapshot,
  ShellCircuitRailSnapshot as ExomuxCircuitRailSnapshot,
  ShellCircuitTraceSnapshot as ExomuxCircuitTraceSnapshot,
} from "@ubernaut/exotui";
