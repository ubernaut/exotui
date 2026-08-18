// Copyright 2023 Im-Beast. MIT license.

// Plan 042 slice E. The bridge between the ten colours exomux paints from and
// the theme document the editor edits.
//
// exomux's spec is a flat ten-field record because that is what a painter
// wants sixty times a second. The editor's document is a sparse map of named
// tokens because that is what a person wants to edit. Neither is wrong, so
// this converts between them: a spec becomes a document by naming what each
// field means, and a document becomes a spec by resolving those names back —
// carrying the whole resolved control map along, so a painter can reach the
// finer tokens (an active title bar, a scrollbar thumb) that ten fields cannot
// express.

import {
  createThemeDocument,
  resolveControlToken,
  resolveControlTokens,
  setThemeToken,
  type ThemeDocument,
} from "@ubernaut/deno-tui/theme";
import { exomuxRelativeLuminance, type ExomuxRgb, type ExomuxThemeSpec } from "./model.ts";

/**
 * What each field of the ten-colour spec means, as a control token. Written
 * down once so the two directions cannot drift: the document keeps the names,
 * the spec keeps the speed.
 */
export const EXOMUX_THEME_TOKEN_MAP = Object.freeze(
  {
    background: "desktop:background",
    surface: "chrome:background",
    surfaceStrong: "window:titlebar-background",
    border: "chrome:line",
    text: "chrome:foreground",
    muted: "chrome:muted",
    accent: "chrome:accent",
    success: "status:success",
    warning: "status:warning",
    danger: "status:danger",
  } as const satisfies Readonly<Record<string, string>>,
);

/**
 * A theme as an editable document: the seven core colours, plus a control
 * token wherever the spec says something the seven cannot.
 */
export function exomuxThemeDocument(theme: ExomuxThemeSpec): ThemeDocument {
  let document = createThemeDocument(theme.label, {
    foreground: theme.text,
    muted: theme.muted,
    accent: theme.accent,
    success: theme.success,
    warning: theme.warning,
    danger: theme.danger,
    surface: theme.surface,
  });
  for (const [field, token] of Object.entries(EXOMUX_THEME_TOKEN_MAP)) {
    const color = theme[field as keyof ExomuxThemeSpec] as ExomuxRgb | undefined;
    if (!Array.isArray(color)) continue;
    // Only record what the core seven do not already say, so a document stays
    // as small as the theme actually is and inheritance keeps working.
    if (resolveControlToken(token, document.tokens)?.join() === color.join()) continue;
    document = setThemeToken(document, token, [color[0], color[1], color[2]]);
  }
  // Text on an accent fill is a judgement the ten fields never carried: exomux
  // decided it at paint time from the accent's brightness. Write it down, so
  // the editor can show it and the user can overrule it.
  const onAccent: ExomuxRgb = exomuxRelativeLuminance(theme.accent) < 0.3 ? [255, 255, 255] : [0, 0, 0];
  document = setThemeToken(document, "chrome:on-accent", [onAccent[0], onAccent[1], onAccent[2]]);
  // Any control the theme already overrides travels as-is.
  for (const [token, color] of Object.entries(theme.controls ?? {})) {
    document = setThemeToken(document, token, [color[0], color[1], color[2]]);
  }
  return document;
}

/**
 * A document as a paintable theme. The ten fields come back from the tokens
 * they map to, and `controls` carries every resolved token for the painters
 * that want more than ten.
 */
export function exomuxThemeSpecFromDocument(
  id: string,
  document: ThemeDocument,
  fallback: ExomuxThemeSpec,
): ExomuxThemeSpec {
  const color = (token: string, spare: ExomuxRgb): ExomuxRgb => {
    const resolved = resolveControlToken(token, document.tokens);
    return resolved ? [resolved[0], resolved[1], resolved[2]] : spare;
  };
  const controls: Record<string, ExomuxRgb> = {};
  for (const [token, rgb] of Object.entries(resolveControlTokens(document.tokens))) {
    controls[token] = [rgb[0], rgb[1], rgb[2]];
  }
  return Object.freeze({
    id,
    label: document.name,
    background: color(EXOMUX_THEME_TOKEN_MAP.background, fallback.background),
    surface: color(EXOMUX_THEME_TOKEN_MAP.surface, fallback.surface),
    surfaceStrong: color(EXOMUX_THEME_TOKEN_MAP.surfaceStrong, fallback.surfaceStrong),
    border: color(EXOMUX_THEME_TOKEN_MAP.border, fallback.border),
    text: color(EXOMUX_THEME_TOKEN_MAP.text, fallback.text),
    muted: color(EXOMUX_THEME_TOKEN_MAP.muted, fallback.muted),
    accent: color(EXOMUX_THEME_TOKEN_MAP.accent, fallback.accent),
    success: color(EXOMUX_THEME_TOKEN_MAP.success, fallback.success),
    warning: color(EXOMUX_THEME_TOKEN_MAP.warning, fallback.warning),
    danger: color(EXOMUX_THEME_TOKEN_MAP.danger, fallback.danger),
    controls: Object.freeze(controls),
  });
}
