// The metaball field moved into the library (src/app/shell_background.ts) so
// the web desktop can run the same simulation. This shim keeps exomux's names;
// everything here is a re-export.

export {
  SHELL_METABALL_FRAME_INTERVAL_MS as EXOMUX_METABALL_FRAME_INTERVAL_MS,
  SHELL_METABALL_LEVELS as EXOMUX_METABALL_LEVELS,
  ShellMetaballField as ExomuxMetaballField,
} from "@ubernaut/exotui";
export type {
  ShellMetaballAdvanceOptions as ExomuxMetaballAdvanceOptions,
  ShellMetaballFieldOptions as ExomuxMetaballFieldOptions,
  ShellMetaballInspection as ExomuxMetaballInspection,
  ShellMetaballPoint as ExomuxMetaballPoint,
} from "@ubernaut/exotui";
