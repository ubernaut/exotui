// Copyright 2023 Im-Beast. MIT license.

const ESCAPE = String.fromCharCode(27);
const ANSI_PATTERN = new RegExp(
  `${ESCAPE}(?:\\[[0-?]*[ -/]*[@-~]|\\][^\\x07${ESCAPE}]*(?:\\x07|${ESCAPE}\\\\))`,
  "g",
);

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}

export function ansiCubeLevel(value: number): number {
  return value === 0 ? 0 : 55 + value * 40;
}

export function readCsiSequenceAt(value: string, start: number): string | undefined {
  if (value.charCodeAt(start) !== 0x1b || value[start + 1] !== "[") return undefined;
  let index = start + 2;
  while (index < value.length) {
    const code = value.charCodeAt(index);
    if (code >= 0x30 && code <= 0x3f) {
      index += 1;
      continue;
    }
    break;
  }
  while (index < value.length) {
    const code = value.charCodeAt(index);
    if (code >= 0x20 && code <= 0x2f) {
      index += 1;
      continue;
    }
    break;
  }
  const finalCode = value.charCodeAt(index);
  if (!(finalCode >= 0x40 && finalCode <= 0x7e)) return undefined;
  return value.slice(start, index + 1);
}

/** Reads an OSC 8 hyperlink sequence (`ESC ] 8 ; params ; uri (BEL | ST)`) at `start`. */
export function readOsc8SequenceAt(
  value: string,
  start: number,
): { readonly length: number; readonly uri: string } | undefined {
  if (
    value.charCodeAt(start) !== 0x1b || value[start + 1] !== "]" ||
    value[start + 2] !== "8" || value[start + 3] !== ";"
  ) {
    return undefined;
  }
  let bodyEnd = -1;
  let end = -1;
  for (let index = start + 4; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x07) {
      bodyEnd = index;
      end = index + 1;
      break;
    }
    if (code === 0x1b && value[index + 1] === "\\") {
      bodyEnd = index;
      end = index + 2;
      break;
    }
  }
  if (bodyEnd < 0) return undefined;
  const separator = value.indexOf(";", start + 4);
  if (separator < 0 || separator >= bodyEnd) return undefined;
  return { length: end - start, uri: value.slice(separator + 1, bodyEnd) };
}
