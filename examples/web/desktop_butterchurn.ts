// Butterchurn's lazily loaded half: the preset catalog is megabytes of
// milkdrop equations, so it stays out of the landing bundle the way the
// three-ascii renderer does. The desktop dynamic-imports this module the
// first time the background is selected.

import { ExomuxButterchurnField } from "../../packages/exomux/butterchurn_background.ts";
import type { ExomuxAudioSource } from "../../packages/exomux/audio.ts";
import type { ShellAnimatedBackground } from "../../src/app/backgrounds/mod.ts";

/** The real field, constructed once the module has arrived. */
export function createButterchurnBackground(audio: ExomuxAudioSource): ShellAnimatedBackground {
  return new ExomuxButterchurnField({ audio, autoCycle: true }) as unknown as ShellAnimatedBackground;
}
