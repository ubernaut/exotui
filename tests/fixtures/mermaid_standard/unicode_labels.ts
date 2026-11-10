// Copyright 2023 Im-Beast. MIT license.
/** Valid source labels that exceed the former terminal sixteen-unit cap. */
export const longAccentLabel = "a" + "\u0301".repeat(20);
export const longKeycapLabel = "1️⃣" + "\u0301".repeat(20);

/** Assigned W/F scalars omitted by the legacy display-width approximation. */
export const unicodeWideLabels = ["⌚", "☕", "\u{1b132}"] as const;
