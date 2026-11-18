// Copyright 2023 Im-Beast. MIT license.

/** Keep colon subparameters atomic; a color channel or 4:0 is never a separate reset. */
export function sgrParameters(body: string): string[] {
  return body.split(";");
}

/** Decode a complete extended color, consuming even malformed channels without treating them as attributes. */
export function sgrColor(parameters: readonly string[], index: number): {
  consumed: number;
  rgb?: readonly [number, number, number];
  palette?: number;
} {
  const parts = parameters[index]!.split(":");
  const colon = parts.length > 1;
  const mode = Number(colon ? parts[1] : parameters[index + 1]);
  const consumed = colon ? 1 : Math.min(parameters.length - index, mode === 2 ? 5 : mode === 5 ? 3 : 2);
  const values = colon ? parts.slice(2) : parameters.slice(index + 2, index + consumed);
  if (mode === 2 && colon && values.length === 4) {
    // Only default RGB color space is supported, never silently reinterpret another space.
    if (values[0] !== "" && values[0] !== "0") return { consumed };
    values.shift();
  }
  const valid = values.every((value) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)));
  const byte = (value: string) => Math.max(0, Math.min(255, Number(value)));
  if (valid && mode === 2 && values.length === 3) {
    return { consumed, rgb: values.map(byte) as unknown as readonly [number, number, number] };
  }
  if (valid && mode === 5 && values.length === 1) return { consumed, palette: byte(values[0]!) };
  return { consumed };
}
