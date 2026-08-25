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

export * from "./src/app/shell_presenter.ts";
export * from "./src/app/workbench_shell.ts";
export * from "./src/app/shell_theme.ts";
export * from "./src/app/workbench_window_host.ts";
export * from "./src/app/backgrounds/mod.ts";
