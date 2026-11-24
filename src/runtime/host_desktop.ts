// Copyright 2023 Im-Beast. MIT license.
import { runtimeHost } from "./host.ts";
import { normalizeTerminalLink } from "./terminal_links.ts";

const DEFAULT_MAX_CLIPBOARD_BYTES = 65_524;
const DEFAULT_CLIPBOARD_TIMEOUT_MS = 750;

/** Options for reading bounded UTF-8 text from the local operating system clipboard. */
export interface ReadLocalHostClipboardOptions {
  /** Maximum accepted UTF-8 payload size in bytes (default 65,524). */
  readonly maxBytes?: number;
  /** Per-command timeout in milliseconds (default 750). */
  readonly timeoutMs?: number;
}

/**
 * Reads bounded UTF-8 text from the local host OS clipboard (`pbpaste`,
 * `powershell.exe`, `wl-paste`, or `xclip`). Returns `undefined` when no
 * adapter succeeds, the read times out, or the payload exceeds `maxBytes`.
 */
export async function readLocalHostClipboard(
  options: ReadLocalHostClipboardOptions = {},
): Promise<string | undefined> {
  const maxBytes = Math.max(0, Math.floor(options.maxBytes ?? DEFAULT_MAX_CLIPBOARD_BYTES));
  const timeoutMs = Math.max(50, Math.floor(options.timeoutMs ?? DEFAULT_CLIPBOARD_TIMEOUT_MS));
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
        signal: AbortSignal.timeout(timeoutMs),
      }).spawn();
      const reader = child.stdout.getReader();
      const decoder = new TextDecoder();
      let text = "";
      let size = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) return undefined;
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

/**
 * Normalizes line endings, strips C0/C1 control characters (preventing escape
 * injection or bracketed-paste breakout), and enforces `maxBytes` on pasted text.
 */
export function sanitizeTerminalClipboardPaste(
  text: string,
  maxBytes = DEFAULT_MAX_CLIPBOARD_BYTES,
): string | undefined {
  const limit = Math.max(0, Math.floor(maxBytes));
  // deno-lint-ignore no-control-regex
  const cleaned = text.replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
  return new TextEncoder().encode(cleaned).byteLength <= limit ? cleaned : undefined;
}

/**
 * Opens a validated terminal link (`http:`, `https:`, or `mailto:`) on the
 * local host desktop via `open`, `rundll32.exe`, or `xdg-open`, never invoking
 * a shell or routing through a child PTY.
 */
export async function openLocalTerminalLink(value: string): Promise<void> {
  const url = normalizeTerminalLink(value);
  if (!url) throw new TypeError("Unsupported terminal link");
  const [command, ...args] = runtimeHost.build.os === "darwin"
    ? ["open", url]
    : runtimeHost.build.os === "windows"
    ? ["rundll32.exe", "url.dll,FileProtocolHandler", url]
    : ["xdg-open", url];
  const child = new runtimeHost.Command(command!, { args, stdin: "null", stdout: "null", stderr: "null" }).spawn();
  const status = await child.status;
  if (!status.success) throw new Error(`Local link opener exited with status ${status.code}`);
}
