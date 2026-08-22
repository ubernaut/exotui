// Moved into the library (src/app/backgrounds/). This shim keeps the
// historical exomux names; everything here is a re-export.

export { ShellIvyField as ExomuxIvyField } from "@ubernaut/exotui";
export type {
  ShellIvyCellSnapshot as ExomuxIvyCellSnapshot,
  ShellIvyFieldOptions as ExomuxIvyFieldOptions,
  ShellIvyInspection as ExomuxIvyInspection,
  ShellIvyOrnament as ExomuxIvyOrnament,
  ShellIvyStrandSnapshot as ExomuxIvyStrandSnapshot,
} from "@ubernaut/exotui";
