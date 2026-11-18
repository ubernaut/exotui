// Copyright 2026 ubernaut. MIT license.
import { runtimeHost } from "@ubernaut/exotui/runtime";
import { EXOMUX_PROTOCOL_LIMITS } from "./protocol.ts";

const MAX_CLIPBOARD_BYTES = EXOMUX_PROTOCOL_LIMITS.inputBytes - 12;

/** Reads the clipboard of the machine running the viewer, not the daemon. */
export async function readExomuxLocalClipboard(): Promise<string | undefined> {
  const commands: [string, string[]][] = [];
  if (runtimeHost.build.os === "darwin") commands.push(["pbpaste", []]);
  if (runtimeHost.build.os === "windows") {
    commands.push(["powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "[Console]::OutputEncoding = [Text.Encoding]::UTF8; [Console]::Write((Get-Clipboard -Raw))",
    ]]);
  }
  if (runtimeHost.build.os === "linux") {
    if (runtimeHost.env.get("WAYLAND_DISPLAY")) commands.push(["wl-paste", ["--no-newline", "--type", "text"]]);
    if (runtimeHost.env.get("DISPLAY")) commands.push(["xclip", ["-selection", "clipboard", "-out"]]);
  }
  for (const [command, args] of commands) {
    try {
      const child = new runtimeHost.Command(command, {
        args,
        stdin: "null",
        stdout: "piped",
        stderr: "null",
        signal: AbortSignal.timeout(750),
      }).spawn();
      const reader = child.stdout.getReader();
      const decoder = new TextDecoder();
      let text = "", size = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_CLIPBOARD_BYTES) return undefined;
          text += decoder.decode(value, { stream: true });
        }
        if ((await child.status).success) return text + decoder.decode();
      } finally {
        await reader.cancel().catch(() => undefined);
      }
    } catch {
      // Missing helper, unsupported display, or denied access; try the next adapter.
    }
  }
  return undefined;
}

/** Keep pasted text bounded and prevent it from closing bracketed-paste mode. */
export function sanitizeExomuxClipboard(text: string): string | undefined {
  // deno-lint-ignore no-control-regex
  const cleaned = text.replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
  return new TextEncoder().encode(cleaned).byteLength <= MAX_CLIPBOARD_BYTES ? cleaned : undefined;
}
