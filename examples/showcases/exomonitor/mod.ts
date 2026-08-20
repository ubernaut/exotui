// Copyright 2023 Im-Beast. MIT license.

/**
 * exomonitor — the worked example for `@ubernaut/exotui/viz`.
 *
 * A system monitor is the honest test of a visualisation layer: real data of
 * several shapes, arriving at different rates, on a terminal whose size nobody
 * controls. Everything here except `view.ts` is pure and tested without a
 * terminal, which is the shape the library is meant to make possible.
 */
export * from "./compose.ts";
export * from "./config.ts";
export * from "./feeds.ts";
export * from "./sampler.ts";
export * from "./settings.ts";
export * from "./theme.ts";
export * from "./tiles.ts";
export * from "./view.ts";
