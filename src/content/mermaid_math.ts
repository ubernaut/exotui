// Copyright 2023 Im-Beast. MIT license.

/** Native Unicode assemblies for stretched mathematical fences and accents. */
export function mathAssembly(value: string, stretch: "vertical" | "horizontal", length: number): string[] | undefined {
  if (!Number.isSafeInteger(length) || length < 1 || length > 4_000_000) {
    throw new RangeError("Native math assembly exceeds its budget.");
  }
  if (stretch === "horizontal") {
    if (["¯", "‾", "_"].includes(value)) return new Array(length).fill("─");
    if (value === "→") return [...new Array(Math.max(0, length - 1)).fill("─"), "→"];
    if (value === "←") return ["←", ...new Array(Math.max(0, length - 1)).fill("─")];
    if (value === "↔") return length < 2 ? ["↔"] : ["←", ...new Array(length - 2).fill("─"), "→"];
    return;
  }
  const glyphs: Record<string, readonly [string, string, string]> = {
    "(": ["⎛", "⎜", "⎝"],
    ")": ["⎞", "⎟", "⎠"],
    "[": ["⎡", "⎢", "⎣"],
    "]": ["⎤", "⎥", "⎦"],
    "{": ["⎧", "⎪", "⎩"],
    "}": ["⎫", "⎪", "⎭"],
    "|": ["│", "│", "│"],
    "‖": ["║", "║", "║"],
    "⌊": ["│", "│", "└"],
    "⌋": ["│", "│", "┘"],
    "⌈": ["┌", "│", "│"],
    "⌉": ["┐", "│", "│"],
  };
  const selected = glyphs[value];
  if (!selected) return;
  if (length < 2) return [value];
  const result = [selected[0], ...new Array(length - 2).fill(selected[1]), selected[2]];
  if ((value === "{" || value === "}") && length > 2) result[Math.floor(length / 2)] = value === "{" ? "⎨" : "⎬";
  return result;
}
