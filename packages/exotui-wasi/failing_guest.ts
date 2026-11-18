// @ts-ignore: WIT import supplied by the launcher.
import { write } from "exotui:host/terminal@0.1.0";

// Deliberately omits guest cleanup: the launcher must restore the PTY.
export const run = {
  run(): never {
    write(new TextEncoder().encode("\x1b[?1049h\x1b[?25lguest failure fixture"));
    throw new Error("intentional guest failure");
  },
};
