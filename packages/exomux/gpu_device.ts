// Moved into the library (src/app/backgrounds/gpu_device.ts). This shim keeps
// the historical names and wires exomux's debug log into the library hook.

import { setShellGpuLog } from "@ubernaut/exotui";
import { exomuxDebugLog } from "./debug_log.ts";

setShellGpuLog(exomuxDebugLog);

export {
  destroyShellGpuDevice as destroyExomuxGpuDevice,
  resetShellGpuDevice as resetExomuxGpuDevice,
  shellGpuDevice as exomuxGpuDevice,
} from "@ubernaut/exotui";
