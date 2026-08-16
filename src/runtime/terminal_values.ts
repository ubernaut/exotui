// Copyright 2023 Im-Beast. MIT license.

interface TerminalCommandValue {
  command: string;
  args?: readonly string[];
  cwd?: string;
  env?: Record<string, string>;
}

export function cloneTerminalCommand(command: TerminalCommandValue): TerminalCommandValue {
  return {
    command: command.command,
    args: command.args ? [...command.args] : undefined,
    cwd: command.cwd,
    env: command.env ? { ...command.env } : undefined,
  };
}

export function normalizeTerminalDimension(value: number | undefined): number | undefined;
export function normalizeTerminalDimension(value: number | undefined, fallback: number): number;
export function normalizeTerminalDimension(value: number | undefined, fallback?: number): number | undefined {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value!));
}

export function detectTerminalMultiplexer(
  term: string,
  env: (name: string) => string | undefined,
): "none" | "tmux" | "screen" | "zellij" {
  if (env("ZELLIJ")) return "zellij";
  if (env("TMUX") || /^tmux/i.test(term)) return "tmux";
  if (env("STY") || /^screen/i.test(term)) return "screen";
  return "none";
}
