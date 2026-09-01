// Copyright 2023 Im-Beast. MIT license.

// The shell surface: one cell-composed application, any host.
//
// 0.6.0 shipped the presenter seam and its two hosts but kept them inside
// `src/`, so the only application that could use them was one living in this
// repository. This entrypoint publishes that surface.
//
// `ShellPresenter` is the seam — a live grid size, the key/pointer/wheel
// streams both hosts emit, one-shot frame scheduling, a named durable store,
// and a probed capability record. `runShellApp(presenter, app)` is the whole
// loop. The two implementations are reached from their own entrypoints:
// `consolePresenter` from `./runtime`, `webPresenter` from `./web`.
//
// Alongside the seam are the host-neutral pieces an application needs to look
// like a desktop rather than a grid of characters: the shell painters, the
// theme catalog, the window host, and the animated backgrounds. All of them
// produce cells and none of them know which host will show those cells, which
// is why they live here rather than under `./app` (terminal) or `./web`.

// Types that appear in this entrypoint's own signatures. Without them a caller
// cannot type a call to `handlePointer`, implement `ShellApp`, or name a
// `clientRect` -- and would have to reach into `./web` or `./app` for types
// this surface already uses, which is the door problem the seam was moved out
// of `./web` to solve.
export type { Rectangle } from "./src/types.ts";
export type { PointerInputEvent } from "./src/pointer_input.ts";
export type { KeyPressEvent, MouseScrollEvent } from "./src/input_reader/types.ts";

export * from "./src/app/shell_presenter.ts";
export * from "./src/app/workbench_shell.ts";
export * from "./src/app/shell_theme.ts";
export * from "./src/app/workbench_window_host.ts";
// Menu behaviour: activation and close keys, index movement, menu-bar hit
// layout and dropdown placement. `paintShellMenuPanel` above draws a menu;
// without these a consumer has to reimplement how one *behaves*, which is
// the half that is fiddly to get right and easy to get subtly wrong.
export * from "./src/app/workbench_menu.ts";
// The window host cannot be constructed without a workspace controller,
// so shipping one without the other leaves this entrypoint unusable on
// its own. `./app` also exports it, for terminal applications.
export * from "./src/layout/tiled_workspace.ts";
export * from "./src/app/backgrounds/mod.ts";
