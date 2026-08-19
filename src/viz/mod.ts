// Copyright 2023 Im-Beast. MIT license.

/**
 * Dimensional visualisations.
 *
 * Data is described by rank and time — `0d` a scalar, `0dt` its history, `1d`
 * an array now, `1dt` that array over time, and so on. A visualisation declares
 * the kind it draws, a stream declares the kind it carries, and the registry
 * refuses the pairings that cannot work.
 */

export * from "./data.ts";
export * from "./stream.ts";
export * from "./scale.ts";
export * from "./theme.ts";
export * from "./render.ts";
export * from "./renderers_scalar.ts";
export * from "./renderers_vector.ts";
export * from "./renderers_matrix.ts";
export * from "./fit.ts";
export * from "./registry.ts";
export * from "./view.ts";
