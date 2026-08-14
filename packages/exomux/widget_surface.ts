// Copyright 2023 Im-Beast. MIT license.

// The off-screen component host is now a first-class exotui primitive
// (`WidgetSurface`, promoted from this file — WS-001). Exomux consumes it under
// its existing names so the settings/background surfaces and composited fields
// are unchanged; any other app can use `WidgetSurface` from `@ubernaut/deno-tui/app`
// to composite real components into its own hand-painted grid the same way.

import { WidgetSurface, type WidgetSurfaceCell } from "@ubernaut/deno-tui/app";

/** One styled cell from the surface, or undefined for an untouched cell. */
export type ExomuxWidgetCell = WidgetSurfaceCell;

/** An off-screen Tui whose rendered cells can be composited into a window. */
export { WidgetSurface as ExomuxWidgetSurface };
