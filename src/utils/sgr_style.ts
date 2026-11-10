// Copyright 2023 Im-Beast. MIT license.
import { readCsiSequenceAt } from "./ansi_text.ts";
import { sgrColor, sgrParameters } from "./sgr_parameters.ts";

interface SgrStyleState {
  bold: boolean;
  italic: boolean;
  underline: string;
  underlineColor: string[];
  overline: boolean;
  inverse: boolean;
  foreground: string[];
  background: string[];
  extra: string[];
}

/** Merges an SGR escape sequence into an existing compact SGR style prefix. */
export function mergeSgrStyle(currentStyle: string, sequence: string): string {
  const state: SgrStyleState = {
    bold: false,
    italic: false,
    underline: "",
    underlineColor: [],
    overline: false,
    inverse: false,
    foreground: [],
    background: [],
    extra: [],
  };
  applySgrSequences(state, currentStyle);
  applySgrSequence(state, sequence);
  return formatSgrStyleState(state);
}

export function isSgrReset(sequence: string): boolean {
  return sgrParameters(sequence.slice(2, -1)).every((value) => value === "" || /^0+$/.test(value));
}

function applySgrSequences(state: SgrStyleState, style: string): void {
  for (let index = 0; index < style.length;) {
    const sequence = readCsiSequenceAt(style, index);
    if (!sequence || !sequence.endsWith("m")) {
      index += 1;
      continue;
    }
    applySgrSequence(state, sequence);
    index += sequence.length;
  }
}

function applySgrSequence(state: SgrStyleState, sequence: string): void {
  const params = sgrParameters(sequence.slice(2, -1));
  for (let index = 0; index < params.length; index += 1) {
    const encoded = params[index]!, parts = encoded.split(":"), value = Number(parts[0]);
    if (parts.length > 1 && value === 4) {
      if (parts.length === 2 && /^[0-5]$/.test(parts[1]!)) {
        state.underline = parts[1] === "0" ? "" : parts[1] === "1" ? "4" : encoded;
      }
      continue;
    }
    if (value === 38 || value === 48 || value === 58) {
      const color = sgrColor(params, index);
      const target = value === 38 ? state.foreground : value === 48 ? state.background : state.underlineColor;
      if (color.rgb || color.palette !== undefined) {
        target.length = 0;
        target.push(String(value), color.rgb ? "2" : "5", ...(color.rgb ?? [color.palette!]).map(String));
      }
      index += color.consumed - 1;
      continue;
    }
    if (parts.length > 1) {
      if (!state.extra.includes(encoded)) state.extra.push(encoded);
      continue;
    }
    if (value === 0) {
      resetSgrStyleState(state);
      continue;
    }
    if (value === 1) {
      state.bold = true;
    } else if (value === 22) {
      state.bold = false;
      state.extra = state.extra.filter((part) => part !== "2");
    } else if (value === 3) {
      state.italic = true;
    } else if (value === 23) {
      state.italic = false;
    } else if (value === 4) {
      state.underline = "4";
    } else if (value === 21) {
      state.underline = "4:2";
    } else if (value === 24) {
      state.underline = "";
    } else if (value === 29) {
      state.extra = state.extra.filter((part) => part !== "9");
    } else if (value === 53) {
      state.overline = true;
    } else if (value === 55) {
      state.overline = false;
    } else if (value === 59) {
      state.underlineColor = [];
    } else if (value === 7) {
      state.inverse = true;
    } else if (value === 27) {
      state.inverse = false;
    } else if ((value >= 30 && value <= 37) || (value >= 90 && value <= 97)) {
      state.foreground = [String(value)];
    } else if ((value >= 40 && value <= 47) || (value >= 100 && value <= 107)) {
      state.background = [String(value)];
    } else if (value === 39) {
      state.foreground = [];
    } else if (value === 49) {
      state.background = [];
    } else {
      if (Number.isSafeInteger(value) && value >= 0 && !state.extra.includes(encoded)) state.extra.push(encoded);
    }
  }
}

function resetSgrStyleState(state: SgrStyleState): void {
  state.bold = false;
  state.italic = false;
  state.underline = "";
  state.underlineColor = [];
  state.overline = false;
  state.inverse = false;
  state.foreground = [];
  state.background = [];
  state.extra = [];
}

function formatSgrStyleState(state: SgrStyleState): string {
  const params: string[] = [];
  if (state.bold) params.push("1");
  if (state.italic) params.push("3");
  if (state.underline) params.push(state.underline);
  if (state.overline) params.push("53");
  if (state.inverse) params.push("7");
  params.push(...state.foreground, ...state.background, ...state.underlineColor, ...state.extra);
  return params.length ? `\x1b[${params.join(";")}m` : "";
}
