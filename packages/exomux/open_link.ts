// Copyright 2023 Im-Beast. MIT license.
import { normalizeTerminalLink } from "@ubernaut/exotui";

/** Opens a validated link on the client computer, never through the child PTY or a shell. */
export async function openExomuxLocalLink(value: string): Promise<void> {
  const url = normalizeTerminalLink(value);
  if (!url) throw new TypeError("Unsupported terminal link");
  const [command, ...args] = Deno.build.os === "darwin"
    ? ["open", url]
    : Deno.build.os === "windows"
    ? ["rundll32.exe", "url.dll,FileProtocolHandler", url]
    : ["xdg-open", url];
  const child = new Deno.Command(command!, { args, stdin: "null", stdout: "null", stderr: "null" }).spawn();
  const status = await child.status;
  if (!status.success) throw new Error(`Local link opener exited with status ${status.code}`);
}
