# API Reference

This document is generated from every public package entrypoint in the Deno export map. Entrypoint contracts remain
separate while shared module declarations are listed once with explicit entrypoint membership.

## Summary

- Entrypoints: 15
- Unique modules: 544
- Module visits: 1062
- Unique re-export declarations: 695
- Re-export declaration visits: 1062
- Unique symbol declarations: 4989
- Symbol declaration visits: 10032
- Documented symbol declarations: 4957
- Documentation coverage: 99.36%
- Duplicate symbol groups: 0
- Missing targets: 0

## Entrypoints

| Specifier             | Path                                 | Runtime  | Stability    | Modules | Symbols |    Docs |
| --------------------- | ------------------------------------ | -------- | ------------ | ------: | ------: | ------: |
| `.`                   | `./mod.ts`                           | terminal | stable       |     453 |    4348 | 100.00% |
| `./app`               | `./mod.app.ts`                       | terminal | beta         |      53 |     106 |  98.11% |
| `./web`               | `./mod.web.ts`                       | browser  | beta         |     363 |    3690 | 100.00% |
| `./remote`            | `./mod.remote.ts`                    | remote   | experimental |      14 |     127 |  99.21% |
| `./three-ascii`       | `./mod.three_ascii.ts`               | shared   | experimental |      13 |      83 | 100.00% |
| `./viz`               | `./src/viz/mod.ts`                   | shared   | beta         |      19 |     137 |  81.02% |
| `./viz/three`         | `./src/viz/three/mod.ts`             | shared   | experimental |       3 |      10 |  90.00% |
| `./showcase`          | `./src/showcase/mod.ts`              | shared   | beta         |       6 |      53 |  98.11% |
| `./theme`             | `./mod.theme.ts`                     | shared   | beta         |      16 |     264 | 100.00% |
| `./runtime`           | `./mod.runtime.ts`                   | shared   | beta         |      83 |     872 | 100.00% |
| `./terminal`          | `./mod.terminal.ts`                  | terminal | beta         |      19 |     203 |  99.51% |
| `./testing`           | `./mod.testing.ts`                   | terminal | beta         |      16 |     109 | 100.00% |
| `./layout/yoga`       | `./src/layout/solvers/yoga.ts`       | shared   | experimental |       1 |       4 | 100.00% |
| `./layout/taffy`      | `./src/layout/taffy.ts`              | shared   | experimental |       2 |      24 | 100.00% |
| `./layout/taffy-wasm` | `./src/layout/solvers/taffy_wasm.ts` | shared   | experimental |       1 |       2 | 100.00% |

## Entrypoint .

Full terminal package with core TUI runtime, widgets, app primitives, themes, runtime helpers, and demos.

- Path: `./mod.ts`
- Runtime: terminal
- Stability: stable
- Modules: 453
- Re-export declarations: 454
- Exported symbols: 4348
- Documented symbols: 4348
- Documentation coverage: 100.00%
- Duplicate symbols: 0
- Missing targets: 0

## Entrypoint ./app

Focused terminal application package with opinionated lifecycle wiring and curated widgets.

- Path: `./mod.app.ts`
- Runtime: terminal
- Stability: beta
- Modules: 53
- Re-export declarations: 62
- Exported symbols: 106
- Documented symbols: 104
- Documentation coverage: 98.11%
- Duplicate symbols: 0
- Missing targets: 0

## Entrypoint ./web

Standalone browser-safe package for shared controllers, themes, layout, canvas sinks, and web hosts.

- Path: `./mod.web.ts`
- Runtime: browser
- Stability: beta
- Modules: 363
- Re-export declarations: 365
- Exported symbols: 3690
- Documented symbols: 3690
- Documentation coverage: 100.00%
- Duplicate symbols: 0
- Missing targets: 0

## Entrypoint ./remote

Hosted terminal/client bridge protocol and browser WebSocket transport.

- Path: `./mod.remote.ts`
- Runtime: remote
- Stability: experimental
- Modules: 14
- Re-export declarations: 13
- Exported symbols: 127
- Documented symbols: 126
- Documentation coverage: 99.21%
- Duplicate symbols: 0
- Missing targets: 0

## Entrypoint ./three-ascii

Focused Three.js/WebGPU ASCII renderer package for glyph, block, mixed, and Kitty-capable scenes.

- Path: `./mod.three_ascii.ts`
- Runtime: shared
- Stability: experimental
- Modules: 13
- Re-export declarations: 12
- Exported symbols: 83
- Documented symbols: 83
- Documentation coverage: 100.00%
- Duplicate symbols: 0
- Missing targets: 0

## Entrypoint ./viz

Dimensional visualisations: data by rank and time, with streams, scaling and renderers.

- Path: `./src/viz/mod.ts`
- Runtime: shared
- Stability: beta
- Modules: 19
- Re-export declarations: 18
- Exported symbols: 137
- Documented symbols: 111
- Documentation coverage: 81.02%
- Duplicate symbols: 0
- Missing targets: 0

## Entrypoint ./viz/three

Optional Three.js-backed visualisation scenes, rendered through the ASCII pipeline.

- Path: `./src/viz/three/mod.ts`
- Runtime: shared
- Stability: experimental
- Modules: 3
- Re-export declarations: 2
- Exported symbols: 10
- Documented symbols: 9
- Documentation coverage: 90.00%
- Duplicate symbols: 0
- Missing targets: 0

## Entrypoint ./showcase

The showcase kernel: manifests, providers, sessions, and a terminal store for applications.

- Path: `./src/showcase/mod.ts`
- Runtime: shared
- Stability: beta
- Modules: 6
- Re-export declarations: 5
- Exported symbols: 53
- Documented symbols: 52
- Documentation coverage: 98.11%
- Duplicate symbols: 0
- Missing targets: 0

## Entrypoint ./theme

Focused theme engines, manifests, resolvers, galleries, and GrWizard-style theme packs.

- Path: `./mod.theme.ts`
- Runtime: shared
- Stability: beta
- Modules: 16
- Re-export declarations: 15
- Exported symbols: 264
- Documented symbols: 264
- Documentation coverage: 100.00%
- Duplicate symbols: 0
- Missing targets: 0

## Entrypoint ./runtime

Shared runtime primitives for scheduling, storage, workers, resources, diagnostics, and backends.

- Path: `./mod.runtime.ts`
- Runtime: shared
- Stability: beta
- Modules: 83
- Re-export declarations: 82
- Exported symbols: 872
- Documented symbols: 872
- Documentation coverage: 100.00%
- Duplicate symbols: 0
- Missing targets: 0

## Entrypoint ./terminal

Terminal parser, screen, shell, backend, PTY, workspace, and input-reader primitives.

- Path: `./mod.terminal.ts`
- Runtime: terminal
- Stability: beta
- Modules: 19
- Re-export declarations: 18
- Exported symbols: 203
- Documented symbols: 202
- Documentation coverage: 99.51%
- Duplicate symbols: 0
- Missing targets: 0

## Entrypoint ./testing

Headless terminal app pilot, snapshots, fake input events, stdout capture, and deterministic canvas helpers.

- Path: `./mod.testing.ts`
- Runtime: terminal
- Stability: beta
- Modules: 16
- Re-export declarations: 15
- Exported symbols: 109
- Documented symbols: 109
- Documentation coverage: 100.00%
- Duplicate symbols: 0
- Missing targets: 0

## Entrypoint ./layout/yoga

Optional Yoga-backed Flexbox solver for HTML/CSS-style layout trees.

- Path: `./src/layout/solvers/yoga.ts`
- Runtime: shared
- Stability: experimental
- Modules: 1
- Re-export declarations: 0
- Exported symbols: 4
- Documented symbols: 4
- Documentation coverage: 100.00%
- Duplicate symbols: 0
- Missing targets: 0

## Entrypoint ./layout/taffy

Validated opt-in adapter boundary for caller-supplied Taffy 0.12.x WASM bridges.

- Path: `./src/layout/taffy.ts`
- Runtime: shared
- Stability: experimental
- Modules: 2
- Re-export declarations: 1
- Exported symbols: 24
- Documented symbols: 24
- Documentation coverage: 100.00%
- Duplicate symbols: 0
- Missing targets: 0

## Entrypoint ./layout/taffy-wasm

Real Taffy WASM layout solver over the pinned npm:taffy-layout distribution.

- Path: `./src/layout/solvers/taffy_wasm.ts`
- Runtime: shared
- Stability: experimental
- Modules: 1
- Re-export declarations: 0
- Exported symbols: 2
- Documented symbols: 2
- Documentation coverage: 100.00%
- Duplicate symbols: 0
- Missing targets: 0

## Module Catalog

| Module                                                                                                | Entrypoints                             | Re-exports | Symbols | Documented |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------: | ------: | ---------: |
| [`mod.app.ts`](#mod-app-ts)                                                                           | `./app`                                 |         53 |       0 |          0 |
| [`mod.remote.ts`](#mod-remote-ts)                                                                     | `./remote`                              |         13 |       0 |          0 |
| [`mod.runtime.ts`](#mod-runtime-ts)                                                                   | `./runtime`                             |          1 |       0 |          0 |
| [`mod.terminal.ts`](#mod-terminal-ts)                                                                 | `./terminal`                            |         17 |       0 |          0 |
| [`mod.testing.ts`](#mod-testing-ts)                                                                   | `./testing`                             |         15 |       0 |          0 |
| [`mod.theme.ts`](#mod-theme-ts)                                                                       | `./theme`                               |         15 |       0 |          0 |
| [`mod.three_ascii.ts`](#mod-three-ascii-ts)                                                           | `./three-ascii`                         |          3 |       0 |          0 |
| [`mod.ts`](#mod-ts)                                                                                   | `.`                                     |         66 |       0 |          0 |
| [`mod.web.ts`](#mod-web-ts)                                                                           | `./web`                                 |         83 |       0 |          0 |
| [`src/api_stability.ts`](#src-api-stability-ts)                                                       | `.`, `./web`                            |          0 |      14 |         14 |
| [`src/app/accessibility_tree.ts`](#src-app-accessibility-tree-ts)                                     | `.`, `./web`                            |          0 |       7 |          7 |
| [`src/app/action_journal_checkpoints.ts`](#src-app-action-journal-checkpoints-ts)                     | `.`, `./web`                            |          0 |      24 |         24 |
| [`src/app/action_journal_retention.ts`](#src-app-action-journal-retention-ts)                         | `.`, `./web`                            |          0 |      21 |         21 |
| [`src/app/action_journal.ts`](#src-app-action-journal-ts)                                             | `.`, `./web`                            |          0 |      17 |         17 |
| [`src/app/action_policies.ts`](#src-app-action-policies-ts)                                           | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/app/actions.ts`](#src-app-actions-ts)                                                           | `.`, `./app`, `./web`                   |          0 |       7 |          7 |
| [`src/app/animated_background.ts`](#src-app-animated-background-ts)                                   | `.`, `./web`                            |          0 |      16 |         16 |
| [`src/app/app.ts`](#src-app-app-ts)                                                                   | `.`, `./web`                            |          0 |      13 |         13 |
| [`src/app/background_jobs.ts`](#src-app-background-jobs-ts)                                           | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/app/backgrounds/biomech_background.ts`](#src-app-backgrounds-biomech-background-ts)             | `.`, `./web`                            |          0 |       2 |          2 |
| [`src/app/backgrounds/circuit_background.ts`](#src-app-backgrounds-circuit-background-ts)             | `.`, `./web`                            |          0 |       8 |          8 |
| [`src/app/backgrounds/contract.ts`](#src-app-backgrounds-contract-ts)                                 | `.`, `./web`                            |          0 |      10 |         10 |
| [`src/app/backgrounds/fire_background.ts`](#src-app-backgrounds-fire-background-ts)                   | `.`, `./web`                            |          0 |       3 |          3 |
| [`src/app/backgrounds/gpu_device.ts`](#src-app-backgrounds-gpu-device-ts)                             | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/app/backgrounds/ivy_background.ts`](#src-app-backgrounds-ivy-background-ts)                     | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/backgrounds/jungle_background.ts`](#src-app-backgrounds-jungle-background-ts)               | `.`, `./web`                            |          0 |       1 |          1 |
| [`src/app/backgrounds/matrix_background.ts`](#src-app-backgrounds-matrix-background-ts)               | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/app/backgrounds/mod.ts`](#src-app-backgrounds-mod-ts)                                           | `.`, `./web`                            |         12 |       2 |          2 |
| [`src/app/backgrounds/rainy_windows_background.ts`](#src-app-backgrounds-rainy-windows-background-ts) | `.`, `./web`                            |          0 |       2 |          2 |
| [`src/app/backgrounds/skull_background.ts`](#src-app-backgrounds-skull-background-ts)                 | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/app/backgrounds/turbulence_background.ts`](#src-app-backgrounds-turbulence-background-ts)       | `.`, `./web`                            |          0 |       2 |          2 |
| [`src/app/backgrounds/vaporwave_background.ts`](#src-app-backgrounds-vaporwave-background-ts)         | `.`, `./web`                            |          0 |       3 |          3 |
| [`src/app/browser_editing.ts`](#src-app-browser-editing-ts)                                           | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/app/calendar.ts`](#src-app-calendar-ts)                                                         | `.`, `./web`                            |          0 |      12 |         12 |
| [`src/app/clipboard.ts`](#src-app-clipboard-ts)                                                       | `.`, `./web`                            |          0 |       7 |          7 |
| [`src/app/code_view.ts`](#src-app-code-view-ts)                                                       | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/app/command_aliases.ts`](#src-app-command-aliases-ts)                                           | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/app/command_arguments.ts`](#src-app-command-arguments-ts)                                       | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/app/command_bindings.ts`](#src-app-command-bindings-ts)                                         | `.`, `./web`                            |          0 |      26 |         26 |
| [`src/app/command_history.ts`](#src-app-command-history-ts)                                           | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/app/command_macros.ts`](#src-app-command-macros-ts)                                             | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/command_pipelines.ts`](#src-app-command-pipelines-ts)                                       | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/app/command_preview.ts`](#src-app-command-preview-ts)                                           | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/command_progress.ts`](#src-app-command-progress-ts)                                         | `.`, `./web`                            |          0 |       3 |          3 |
| [`src/app/command_search_index.ts`](#src-app-command-search-index-ts)                                 | `.`, `./web`                            |          0 |      11 |         11 |
| [`src/app/commands.ts`](#src-app-commands-ts)                                                         | `.`, `./app`, `./web`                   |          0 |       9 |          9 |
| [`src/app/component_commands.ts`](#src-app-component-commands-ts)                                     | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/app/compose_sequences.ts`](#src-app-compose-sequences-ts)                                       | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/app/composition.ts`](#src-app-composition-ts)                                                   | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/app/content_integrity.ts`](#src-app-content-integrity-ts)                                       | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/app/crash_recovery.ts`](#src-app-crash-recovery-ts)                                             | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/data_query_commands.ts`](#src-app-data-query-commands-ts)                                   | `.`, `./web`                            |          0 |      24 |         24 |
| [`src/app/data_table_commands.ts`](#src-app-data-table-commands-ts)                                   | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/app/diff_view.ts`](#src-app-diff-view-ts)                                                       | `.`, `./web`                            |          0 |       7 |          7 |
| [`src/app/disposables.ts`](#src-app-disposables-ts)                                                   | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/drag_drop.ts`](#src-app-drag-drop-ts)                                                       | `.`, `./web`                            |          0 |      10 |         10 |
| [`src/app/event_timeline.ts`](#src-app-event-timeline-ts)                                             | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/focus_announcements.ts`](#src-app-focus-announcements-ts)                                   | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/focus_commands.ts`](#src-app-focus-commands-ts)                                             | `.`, `./web`                            |          0 |       7 |          7 |
| [`src/app/form_async_validation.ts`](#src-app-form-async-validation-ts)                               | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/form_checkpoints.ts`](#src-app-form-checkpoints-ts)                                         | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/app/form_commands.ts`](#src-app-form-commands-ts)                                               | `.`, `./web`                            |          0 |       7 |          7 |
| [`src/app/form_dependencies.ts`](#src-app-form-dependencies-ts)                                       | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/app/form_drafts.ts`](#src-app-form-drafts-ts)                                                   | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/app/form_paths.ts`](#src-app-form-paths-ts)                                                     | `.`, `./web`                            |          0 |      23 |         23 |
| [`src/app/form_schema.ts`](#src-app-form-schema-ts)                                                   | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/form_server_errors.ts`](#src-app-form-server-errors-ts)                                     | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/app/form_submission.ts`](#src-app-form-submission-ts)                                           | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/form_validation_timing.ts`](#src-app-form-validation-timing-ts)                             | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/app/forms.ts`](#src-app-forms-ts)                                                               | `.`, `./web`                            |          0 |      35 |         35 |
| [`src/app/general_widgets.ts`](#src-app-general-widgets-ts)                                           | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/gestures.ts`](#src-app-gestures-ts)                                                         | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/app/hex_viewer.ts`](#src-app-hex-viewer-ts)                                                     | `.`, `./web`                            |          0 |       3 |          3 |
| [`src/app/history_branches.ts`](#src-app-history-branches-ts)                                         | `.`, `./web`                            |          0 |       3 |          3 |
| [`src/app/history.ts`](#src-app-history-ts)                                                           | `.`, `./web`                            |          0 |      37 |         37 |
| [`src/app/hit_targets.ts`](#src-app-hit-targets-ts)                                                   | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/app/input_commands.ts`](#src-app-input-commands-ts)                                             | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/journal_store.ts`](#src-app-journal-store-ts)                                               | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/kanban.ts`](#src-app-kanban-ts)                                                             | `.`, `./web`                            |          0 |       7 |          7 |
| [`src/app/list_commands.ts`](#src-app-list-commands-ts)                                               | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/log_viewer_commands.ts`](#src-app-log-viewer-commands-ts)                                   | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/menu_bar_commands.ts`](#src-app-menu-bar-commands-ts)                                       | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/metric_series_commands.ts`](#src-app-metric-series-commands-ts)                             | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/mod.ts`](#src-app-mod-ts)                                                                   | `.`, `./web`                            |        125 |       0 |          0 |
| [`src/app/mouse_bindings.ts`](#src-app-mouse-bindings-ts)                                             | `.`, `./web`                            |          0 |      14 |         14 |
| [`src/app/navigation_blockers.ts`](#src-app-navigation-blockers-ts)                                   | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/navigation_journal.ts`](#src-app-navigation-journal-ts)                                     | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/app/pad_commands.ts`](#src-app-pad-commands-ts)                                                 | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/paste_stream.ts`](#src-app-paste-stream-ts)                                                 | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/app/plugin_activation.ts`](#src-app-plugin-activation-ts)                                       | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/plugin_capabilities.ts`](#src-app-plugin-capabilities-ts)                                   | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/app/plugin_catalog.ts`](#src-app-plugin-catalog-ts)                                             | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/plugin_compat.ts`](#src-app-plugin-compat-ts)                                               | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/app/plugin_dependencies.ts`](#src-app-plugin-dependencies-ts)                                   | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/app/plugin_lifecycle.ts`](#src-app-plugin-lifecycle-ts)                                         | `.`, `./web`                            |          0 |       9 |          9 |
| [`src/app/plugin_manifest.ts`](#src-app-plugin-manifest-ts)                                           | `.`, `./web`                            |          0 |       8 |          8 |
| [`src/app/plugin_permission_diff.ts`](#src-app-plugin-permission-diff-ts)                             | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/app/plugin_rpc_proxies.ts`](#src-app-plugin-rpc-proxies-ts)                                     | `.`, `./web`                            |          0 |       9 |          9 |
| [`src/app/plugin_slot_adapters.ts`](#src-app-plugin-slot-adapters-ts)                                 | `.`, `./web`                            |          0 |      20 |         20 |
| [`src/app/plugin_slots.ts`](#src-app-plugin-slots-ts)                                                 | `.`, `./web`                            |          0 |      17 |         17 |
| [`src/app/plugin_state_migration.ts`](#src-app-plugin-state-migration-ts)                             | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/plugins.ts`](#src-app-plugins-ts)                                                           | `.`, `./app`, `./web`                   |          0 |      17 |         17 |
| [`src/app/pointer_gestures.ts`](#src-app-pointer-gestures-ts)                                         | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/preedit_provider.ts`](#src-app-preedit-provider-ts)                                         | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/app/property_grid.ts`](#src-app-property-grid-ts)                                               | `.`, `./web`                            |          0 |      11 |         11 |
| [`src/app/route_anchors.ts`](#src-app-route-anchors-ts)                                               | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/app/route_boundaries.ts`](#src-app-route-boundaries-ts)                                         | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/app/route_guards.ts`](#src-app-route-guards-ts)                                                 | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/app/route_loaders.ts`](#src-app-route-loaders-ts)                                               | `.`, `./web`                            |          0 |       3 |          3 |
| [`src/app/route_outlets.ts`](#src-app-route-outlets-ts)                                               | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/app/route_patterns.ts`](#src-app-route-patterns-ts)                                             | `.`, `./web`                            |          0 |      23 |         23 |
| [`src/app/route_prefetch.ts`](#src-app-route-prefetch-ts)                                             | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/app/router.ts`](#src-app-router-ts)                                                             | `.`, `./app`, `./web`                   |          0 |      27 |         27 |
| [`src/app/runtime_commands.ts`](#src-app-runtime-commands-ts)                                         | `.`, `./web`                            |          0 |      25 |         25 |
| [`src/app/screen_persistence.ts`](#src-app-screen-persistence-ts)                                     | `.`, `./web`                            |          0 |      19 |         19 |
| [`src/app/screen_router.ts`](#src-app-screen-router-ts)                                               | `.`, `./web`                            |          0 |      16 |         16 |
| [`src/app/screens.ts`](#src-app-screens-ts)                                                           | `.`, `./web`                            |          0 |      13 |         13 |
| [`src/app/scroll_area_commands.ts`](#src-app-scroll-area-commands-ts)                                 | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/selection_bindings.ts`](#src-app-selection-bindings-ts)                                     | `.`, `./web`                            |          0 |       8 |          8 |
| [`src/app/settings_bindings.ts`](#src-app-settings-bindings-ts)                                       | `.`, `./web`                            |          0 |      21 |         21 |
| [`src/app/settings.ts`](#src-app-settings-ts)                                                         | `.`, `./web`                            |          0 |      10 |         10 |
| [`src/app/shell_background.ts`](#src-app-shell-background-ts)                                         | `.`, `./web`                            |          0 |      10 |         10 |
| [`src/app/shell_presenter.ts`](#src-app-shell-presenter-ts)                                           | `.`, `./web`                            |          0 |      10 |         10 |
| [`src/app/shell_theme.ts`](#src-app-shell-theme-ts)                                                   | `.`, `./web`                            |          1 |       8 |          8 |
| [`src/app/software_cursor.ts`](#src-app-software-cursor-ts)                                           | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/split_pane_commands.ts`](#src-app-split-pane-commands-ts)                                   | `.`, `./web`                            |          0 |       7 |          7 |
| [`src/app/structure_inspector.ts`](#src-app-structure-inspector-ts)                                   | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/app/surface_transitions.ts`](#src-app-surface-transitions-ts)                                   | `./app`                                 |          0 |       9 |          7 |
| [`src/app/syntax_service.ts`](#src-app-syntax-service-ts)                                             | `.`, `./web`                            |          0 |       9 |          9 |
| [`src/app/table_commands.ts`](#src-app-table-commands-ts)                                             | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/tabs_commands.ts`](#src-app-tabs-commands-ts)                                               | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/terminal_app.ts`](#src-app-terminal-app-ts)                                                 | `./app`                                 |          0 |       6 |          6 |
| [`src/app/terminal_commands.ts`](#src-app-terminal-commands-ts)                                       | `.`, `./web`                            |          0 |      29 |         29 |
| [`src/app/terminal_input.ts`](#src-app-terminal-input-ts)                                             | `.`, `./web`                            |          0 |      17 |         17 |
| [`src/app/theme_commands.ts`](#src-app-theme-commands-ts)                                             | `.`, `./web`                            |          0 |      24 |         24 |
| [`src/app/theme_editor.ts`](#src-app-theme-editor-ts)                                                 | `.`, `./web`                            |          0 |       9 |          9 |
| [`src/app/theme_plugin.ts`](#src-app-theme-plugin-ts)                                                 | `.`, `./web`                            |          0 |      13 |         13 |
| [`src/app/time_picker.ts`](#src-app-time-picker-ts)                                                   | `.`, `./web`                            |          0 |      11 |         11 |
| [`src/app/toast_commands.ts`](#src-app-toast-commands-ts)                                             | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/token_editor.ts`](#src-app-token-editor-ts)                                                 | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/transfer_list.ts`](#src-app-transfer-list-ts)                                               | `.`, `./web`                            |          0 |       7 |          7 |
| [`src/app/tree_commands.ts`](#src-app-tree-commands-ts)                                               | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/tree_grid.ts`](#src-app-tree-grid-ts)                                                       | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/app/typed_commands.ts`](#src-app-typed-commands-ts)                                             | `.`, `./web`                            |          0 |       7 |          7 |
| [`src/app/widget_commands.ts`](#src-app-widget-commands-ts)                                           | `.`, `./web`                            |          0 |      48 |         48 |
| [`src/app/widget_surface.ts`](#src-app-widget-surface-ts)                                             | `./app`                                 |          0 |       4 |          4 |
| [`src/app/window_manager_commands.ts`](#src-app-window-manager-commands-ts)                           | `.`, `./web`                            |          0 |       8 |          8 |
| [`src/app/workbench_accessibility.ts`](#src-app-workbench-accessibility-ts)                           | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/app/workbench_ansi_screen.ts`](#src-app-workbench-ansi-screen-ts)                               | `.`, `./web`                            |          0 |       3 |          3 |
| [`src/app/workbench_button_style.ts`](#src-app-workbench-button-style-ts)                             | `.`, `./web`                            |          0 |      10 |         10 |
| [`src/app/workbench_control_layout.ts`](#src-app-workbench-control-layout-ts)                         | `.`, `./web`                            |          0 |      17 |         17 |
| [`src/app/workbench_frame.ts`](#src-app-workbench-frame-ts)                                           | `.`, `./web`                            |          0 |      30 |         30 |
| [`src/app/workbench_layout.ts`](#src-app-workbench-layout-ts)                                         | `.`, `./web`                            |          0 |      35 |         35 |
| [`src/app/workbench_menu.ts`](#src-app-workbench-menu-ts)                                             | `.`, `./web`                            |          0 |      39 |         39 |
| [`src/app/workbench_overlay.ts`](#src-app-workbench-overlay-ts)                                       | `.`, `./web`                            |          0 |      13 |         13 |
| [`src/app/workbench_panel_workspace_store.ts`](#src-app-workbench-panel-workspace-store-ts)           | `.`, `./web`                            |          0 |       8 |          8 |
| [`src/app/workbench_shelf.ts`](#src-app-workbench-shelf-ts)                                           | `.`, `./web`                            |          0 |      20 |         20 |
| [`src/app/workbench_shell.ts`](#src-app-workbench-shell-ts)                                           | `.`, `./web`                            |          0 |      24 |         24 |
| [`src/app/workbench_status.ts`](#src-app-workbench-status-ts)                                         | `.`, `./web`                            |          0 |      26 |         26 |
| [`src/app/workbench_terminal.ts`](#src-app-workbench-terminal-ts)                                     | `.`, `./web`                            |          0 |      66 |         66 |
| [`src/app/workbench_text.ts`](#src-app-workbench-text-ts)                                             | `.`, `./web`                            |          0 |      17 |         17 |
| [`src/app/workbench_three_terminal_pressure.ts`](#src-app-workbench-three-terminal-pressure-ts)       | `.`, `./web`                            |          0 |      25 |         25 |
| [`src/app/workbench_titlebar.ts`](#src-app-workbench-titlebar-ts)                                     | `.`, `./web`                            |          0 |      10 |         10 |
| [`src/app/workbench_window_host.ts`](#src-app-workbench-window-host-ts)                               | `.`, `./app`, `./web`                   |          0 |      17 |         17 |
| [`src/app/workbench_window_registry.ts`](#src-app-workbench-window-registry-ts)                       | `.`, `./web`                            |          0 |      27 |         27 |
| [`src/app/workbench_workspace_store.ts`](#src-app-workbench-workspace-store-ts)                       | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/app/workbench_workspace.ts`](#src-app-workbench-workspace-ts)                                   | `.`, `./web`                            |          0 |      19 |         19 |
| [`src/app/workbench/mod.ts`](#src-app-workbench-mod-ts)                                               | `.`, `./web`                            |         19 |       0 |          0 |
| [`src/app/worker_plugin_host.ts`](#src-app-worker-plugin-host-ts)                                     | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/canvas/box.ts`](#src-canvas-box-ts)                                                             | `.`, `./web`                            |          0 |       2 |          2 |
| [`src/canvas/canvas.ts`](#src-canvas-canvas-ts)                                                       | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/canvas/dirty_region.ts`](#src-canvas-dirty-region-ts)                                           | `.`, `./web`                            |          0 |       3 |          3 |
| [`src/canvas/draw_object.ts`](#src-canvas-draw-object-ts)                                             | `.`, `./web`                            |          0 |       2 |          2 |
| [`src/canvas/mod.ts`](#src-canvas-mod-ts)                                                             | `.`, `./web`                            |          8 |       0 |          0 |
| [`src/canvas/pixel_samplers.ts`](#src-canvas-pixel-samplers-ts)                                       | `.`, `./web`                            |          0 |      19 |         19 |
| [`src/canvas/sink.ts`](#src-canvas-sink-ts)                                                           | `.`, `./web`                            |          0 |       9 |          9 |
| [`src/canvas/spatial_index.ts`](#src-canvas-spatial-index-ts)                                         | `.`, `./web`                            |          0 |       2 |          2 |
| [`src/canvas/text.ts`](#src-canvas-text-ts)                                                           | `.`, `./web`                            |          0 |       3 |          3 |
| [`src/canvas/three_ascii.ts`](#src-canvas-three-ascii-ts)                                             | `./web`, `./three-ascii`                |          0 |       6 |          6 |
| [`src/component.ts`](#src-component-ts)                                                               | `.`                                     |          0 |       4 |          4 |
| [`src/components/box.ts`](#src-components-box-ts)                                                     | `.`, `./app`, `./web`                   |          0 |       1 |          1 |
| [`src/components/breadcrumbs.ts`](#src-components-breadcrumbs-ts)                                     | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/components/button.ts`](#src-components-button-ts)                                               | `.`, `./app`, `./web`                   |          0 |       5 |          5 |
| [`src/components/catalog.ts`](#src-components-catalog-ts)                                             | `.`, `./web`                            |          0 |      19 |         19 |
| [`src/components/chart.ts`](#src-components-chart-ts)                                                 | `.`, `./web`                            |          0 |       3 |          3 |
| [`src/components/checkbox.ts`](#src-components-checkbox-ts)                                           | `.`, `./app`, `./web`                   |          0 |       7 |          7 |
| [`src/components/color_picker.ts`](#src-components-color-picker-ts)                                   | `.`, `./web`                            |          0 |       9 |          9 |
| [`src/components/combobox.ts`](#src-components-combobox-ts)                                           | `.`, `./app`, `./web`                   |          0 |       7 |          7 |
| [`src/components/command_palette.ts`](#src-components-command-palette-ts)                             | `.`, `./app`, `./web`                   |          0 |      12 |         12 |
| [`src/components/context_menu.ts`](#src-components-context-menu-ts)                                   | `.`, `./app`, `./web`                   |          0 |      13 |         13 |
| [`src/components/cycler.ts`](#src-components-cycler-ts)                                               | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/components/data_table.ts`](#src-components-data-table-ts)                                       | `.`, `./web`                            |          0 |      16 |         16 |
| [`src/components/empty_state.ts`](#src-components-empty-state-ts)                                     | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/components/file_explorer.ts`](#src-components-file-explorer-ts)                                 | `.`, `./web`                            |          0 |       7 |          7 |
| [`src/components/frame.ts`](#src-components-frame-ts)                                                 | `.`, `./app`, `./web`                   |          0 |       4 |          4 |
| [`src/components/gauge.ts`](#src-components-gauge-ts)                                                 | `.`, `./web`                            |          0 |       3 |          3 |
| [`src/components/input.ts`](#src-components-input-ts)                                                 | `.`, `./app`, `./web`                   |          0 |       8 |          8 |
| [`src/components/interaction.ts`](#src-components-interaction-ts)                                     | `.`, `./web`                            |          0 |       7 |          7 |
| [`src/components/key_help.ts`](#src-components-key-help-ts)                                           | `.`, `./web`                            |          0 |       3 |          3 |
| [`src/components/label.ts`](#src-components-label-ts)                                                 | `.`, `./app`, `./web`                   |          0 |       6 |          6 |
| [`src/components/list.ts`](#src-components-list-ts)                                                   | `.`, `./app`, `./web`                   |          0 |      14 |         14 |
| [`src/components/log_viewer.ts`](#src-components-log-viewer-ts)                                       | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/components/markdown.ts`](#src-components-markdown-ts)                                           | `./app`                                 |          0 |       9 |          9 |
| [`src/components/menu_bar.ts`](#src-components-menu-bar-ts)                                           | `.`, `./web`                            |          0 |      10 |         10 |
| [`src/components/metric_series.ts`](#src-components-metric-series-ts)                                 | `.`, `./web`                            |          0 |      10 |         10 |
| [`src/components/mod.ts`](#src-components-mod-ts)                                                     | `.`, `./web`                            |         45 |       0 |          0 |
| [`src/components/modal.ts`](#src-components-modal-ts)                                                 | `.`, `./app`, `./web`                   |          0 |      13 |         13 |
| [`src/components/pad.ts`](#src-components-pad-ts)                                                     | `.`, `./web`                            |          0 |      13 |         13 |
| [`src/components/progressbar.ts`](#src-components-progressbar-ts)                                     | `.`, `./app`, `./web`                   |          0 |      15 |         15 |
| [`src/components/radio_group.ts`](#src-components-radio-group-ts)                                     | `.`, `./app`, `./web`                   |          0 |      11 |         11 |
| [`src/components/scroll_area.ts`](#src-components-scroll-area-ts)                                     | `.`, `./app`, `./web`                   |          0 |      13 |         13 |
| [`src/components/scroll_box_parity.ts`](#src-components-scroll-box-parity-ts)                         | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/components/slider.ts`](#src-components-slider-ts)                                               | `.`, `./app`, `./web`                   |          0 |      14 |         14 |
| [`src/components/sparkline.ts`](#src-components-sparkline-ts)                                         | `.`, `./web`                            |          0 |       3 |          3 |
| [`src/components/spinner.ts`](#src-components-spinner-ts)                                             | `.`, `./app`, `./web`                   |          0 |       6 |          6 |
| [`src/components/statusbar.ts`](#src-components-statusbar-ts)                                         | `.`, `./app`, `./web`                   |          0 |       4 |          4 |
| [`src/components/stepper.ts`](#src-components-stepper-ts)                                             | `.`, `./web`                            |          0 |      11 |         11 |
| [`src/components/table.ts`](#src-components-table-ts)                                                 | `.`, `./app`, `./web`                   |          0 |      13 |         13 |
| [`src/components/tabs.ts`](#src-components-tabs-ts)                                                   | `.`, `./app`, `./web`                   |          0 |      10 |         10 |
| [`src/components/terminal_output.ts`](#src-components-terminal-output-ts)                             | `.`, `./web`                            |          0 |       7 |          7 |
| [`src/components/terminal_screen.ts`](#src-components-terminal-screen-ts)                             | `.`, `./web`                            |          0 |       3 |          3 |
| [`src/components/text_area.ts`](#src-components-text-area-ts)                                         | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/components/text.ts`](#src-components-text-ts)                                                   | `.`, `./app`, `./web`                   |          0 |       2 |          2 |
| [`src/components/textbox.ts`](#src-components-textbox-ts)                                             | `.`, `./app`, `./web`                   |          0 |      23 |         23 |
| [`src/components/three_ascii.ts`](#src-components-three-ascii-ts)                                     | `./three-ascii`                         |          0 |       2 |          2 |
| [`src/components/toast.ts`](#src-components-toast-ts)                                                 | `.`, `./app`, `./web`                   |          0 |       8 |          8 |
| [`src/components/tree.ts`](#src-components-tree-ts)                                                   | `.`, `./app`, `./web`                   |          0 |      13 |         13 |
| [`src/components/virtual_list.ts`](#src-components-virtual-list-ts)                                   | `.`, `./app`, `./web`                   |          0 |       9 |          9 |
| [`src/content/markdown.ts`](#src-content-markdown-ts)                                                 | `./app`                                 |          0 |      14 |         14 |
| [`src/controls.ts`](#src-controls-ts)                                                                 | `.`                                     |          0 |       2 |          2 |
| [`src/event_emitter.ts`](#src-event-emitter-ts)                                                       | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/focus.ts`](#src-focus-ts)                                                                       | `.`, `./web`                            |          0 |      13 |         13 |
| [`src/grwizard_themes.ts`](#src-grwizard-themes-ts)                                                   | `.`, `./web`, `./theme`                 |          0 |       5 |          5 |
| [`src/i18n/formatters.ts`](#src-i18n-formatters-ts)                                                   | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/i18n/locale_scopes.ts`](#src-i18n-locale-scopes-ts)                                             | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/i18n/locale.ts`](#src-i18n-locale-ts)                                                           | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/i18n/message_format.ts`](#src-i18n-message-format-ts)                                           | `.`, `./web`                            |          0 |       9 |          9 |
| [`src/i18n/message_lint.ts`](#src-i18n-message-lint-ts)                                               | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/i18n/messages.ts`](#src-i18n-messages-ts)                                                       | `.`, `./web`                            |          0 |       8 |          8 |
| [`src/i18n/missing_translation_telemetry.ts`](#src-i18n-missing-translation-telemetry-ts)             | `.`, `./web`                            |          0 |       3 |          3 |
| [`src/i18n/mod.ts`](#src-i18n-mod-ts)                                                                 | `.`, `./web`                            |         10 |       0 |          0 |
| [`src/i18n/pseudo_locales.ts`](#src-i18n-pseudo-locales-ts)                                           | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/i18n/reactive_locale.ts`](#src-i18n-reactive-locale-ts)                                         | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/i18n/width_variants.ts`](#src-i18n-width-variants-ts)                                           | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/input_envelope.ts`](#src-input-envelope-ts)                                                     | `.`, `./web`                            |          0 |      28 |         28 |
| [`src/input_lifecycle.ts`](#src-input-lifecycle-ts)                                                   | `.`                                     |          0 |      24 |         24 |
| [`src/input_reader/mod.ts`](#src-input-reader-mod-ts)                                                 | `.`, `./terminal`                       |          1 |       2 |          2 |
| [`src/input_reader/types.ts`](#src-input-reader-types-ts)                                             | `.`, `./remote`, `./terminal`           |          0 |      12 |         12 |
| [`src/input.ts`](#src-input-ts)                                                                       | `.`                                     |          0 |       1 |          1 |
| [`src/key_sequences.ts`](#src-key-sequences-ts)                                                       | `.`, `./web`                            |          0 |      24 |         24 |
| [`src/keymap_layers.ts`](#src-keymap-layers-ts)                                                       | `.`, `./web`                            |          0 |      20 |         20 |
| [`src/keymap.ts`](#src-keymap-ts)                                                                     | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/layout/capabilities.ts`](#src-layout-capabilities-ts)                                           | `.`, `./web`                            |          0 |      26 |         26 |
| [`src/layout/engine.ts`](#src-layout-engine-ts)                                                       | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/layout/errors.ts`](#src-layout-errors-ts)                                                       | `.`, `./web`                            |          0 |       2 |          2 |
| [`src/layout/flex_layout.ts`](#src-layout-flex-layout-ts)                                             | `.`, `./web`                            |          0 |       3 |          3 |
| [`src/layout/grid_layout.ts`](#src-layout-grid-layout-ts)                                             | `.`, `./app`, `./web`                   |          0 |       3 |          3 |
| [`src/layout/horizontal_layout.ts`](#src-layout-horizontal-layout-ts)                                 | `.`, `./app`, `./web`                   |          0 |       1 |          1 |
| [`src/layout/measurement.ts`](#src-layout-measurement-ts)                                             | `.`, `./web`                            |          0 |       7 |          7 |
| [`src/layout/mod.ts`](#src-layout-mod-ts)                                                             | `.`, `./web`                            |         18 |       0 |          0 |
| [`src/layout/overlay.ts`](#src-layout-overlay-ts)                                                     | `.`, `./web`                            |          0 |      21 |         21 |
| [`src/layout/recipe.ts`](#src-layout-recipe-ts)                                                       | `.`, `./web`                            |          0 |      18 |         18 |
| [`src/layout/responsive.ts`](#src-layout-responsive-ts)                                               | `.`, `./web`                            |          0 |      14 |         14 |
| [`src/layout/solver.ts`](#src-layout-solver-ts)                                                       | `.`, `./web`                            |          0 |      13 |         13 |
| [`src/layout/solvers/simple.ts`](#src-layout-solvers-simple-ts)                                       | `.`, `./web`                            |          0 |       3 |          3 |
| [`src/layout/solvers/taffy_wasm.ts`](#src-layout-solvers-taffy-wasm-ts)                               | `./layout/taffy-wasm`                   |          0 |       2 |          2 |
| [`src/layout/solvers/taffy.ts`](#src-layout-solvers-taffy-ts)                                         | `./layout/taffy`                        |          0 |      24 |         24 |
| [`src/layout/solvers/yoga.ts`](#src-layout-solvers-yoga-ts)                                           | `./layout/yoga`                         |          0 |       4 |          4 |
| [`src/layout/split_pane.ts`](#src-layout-split-pane-ts)                                               | `.`, `./app`, `./web`                   |          0 |      10 |         10 |
| [`src/layout/style.ts`](#src-layout-style-ts)                                                         | `.`, `./web`                            |          0 |      55 |         55 |
| [`src/layout/taffy.ts`](#src-layout-taffy-ts)                                                         | `./layout/taffy`                        |          1 |       0 |          0 |
| [`src/layout/tiled_workspace.ts`](#src-layout-tiled-workspace-ts)                                     | `.`, `./app`, `./web`                   |          0 |      27 |         27 |
| [`src/layout/types.ts`](#src-layout-types-ts)                                                         | `.`, `./web`                            |          0 |       3 |          3 |
| [`src/layout/vertical_layout.ts`](#src-layout-vertical-layout-ts)                                     | `.`, `./app`, `./web`                   |          0 |       1 |          1 |
| [`src/layout/window_manager.ts`](#src-layout-window-manager-ts)                                       | `.`, `./web`                            |          0 |      10 |         10 |
| [`src/markup/cascade.ts`](#src-markup-cascade-ts)                                                     | `.`, `./web`                            |          0 |      10 |         10 |
| [`src/markup/css.ts`](#src-markup-css-ts)                                                             | `.`, `./web`                            |          0 |      11 |         11 |
| [`src/markup/demo_fixtures.ts`](#src-markup-demo-fixtures-ts)                                         | `.`, `./web`                            |          0 |       7 |          7 |
| [`src/markup/hot_reload.ts`](#src-markup-hot-reload-ts)                                               | `.`, `./web`                            |          0 |      12 |         12 |
| [`src/markup/html.ts`](#src-markup-html-ts)                                                           | `.`, `./web`                            |          0 |       3 |          3 |
| [`src/markup/hydrate.ts`](#src-markup-hydrate-ts)                                                     | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/markup/jsx.ts`](#src-markup-jsx-ts)                                                             | `.`, `./web`                            |          0 |       7 |          7 |
| [`src/markup/layout_worker.ts`](#src-markup-layout-worker-ts)                                         | `.`, `./web`                            |          0 |       7 |          7 |
| [`src/markup/live_dispatch.ts`](#src-markup-live-dispatch-ts)                                         | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/markup/live_host.ts`](#src-markup-live-host-ts)                                                 | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/markup/live_invalidation.ts`](#src-markup-live-invalidation-ts)                                 | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/markup/live_styling.ts`](#src-markup-live-styling-ts)                                           | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/markup/live_tree.ts`](#src-markup-live-tree-ts)                                                 | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/markup/mod.ts`](#src-markup-mod-ts)                                                             | `.`, `./web`                            |         19 |       0 |          0 |
| [`src/markup/rehydrate.ts`](#src-markup-rehydrate-ts)                                                 | `.`, `./web`                            |          0 |       2 |          2 |
| [`src/markup/support.ts`](#src-markup-support-ts)                                                     | `.`, `./web`                            |          0 |       2 |          2 |
| [`src/markup/widgets.ts`](#src-markup-widgets-ts)                                                     | `.`, `./web`                            |          0 |      16 |         16 |
| [`src/markup/window_history.ts`](#src-markup-window-history-ts)                                       | `.`, `./web`                            |          0 |      12 |         12 |
| [`src/markup/window_interactions.ts`](#src-markup-window-interactions-ts)                             | `.`, `./web`                            |          0 |      14 |         14 |
| [`src/markup/windows.ts`](#src-markup-windows-ts)                                                     | `.`, `./web`                            |          0 |      33 |         33 |
| [`src/perf/benchmark.ts`](#src-perf-benchmark-ts)                                                     | `.`, `./web`                            |          0 |      20 |         20 |
| [`src/perf/cache_budget.ts`](#src-perf-cache-budget-ts)                                               | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/perf/diff_planner.ts`](#src-perf-diff-planner-ts)                                               | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/perf/entrypoint_budget.ts`](#src-perf-entrypoint-budget-ts)                                     | `.`, `./web`                            |          0 |       7 |          7 |
| [`src/perf/frame_cadence.ts`](#src-perf-frame-cadence-ts)                                             | `.`, `./web`                            |          0 |       3 |          3 |
| [`src/perf/frame_packets.ts`](#src-perf-frame-packets-ts)                                             | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/perf/incremental_serialization.ts`](#src-perf-incremental-serialization-ts)                     | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/perf/layout_benchmarks.ts`](#src-perf-layout-benchmarks-ts)                                     | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/perf/pools.ts`](#src-perf-pools-ts)                                                             | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/perf/profile_tuner.ts`](#src-perf-profile-tuner-ts)                                             | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/perf/versioned_cache.ts`](#src-perf-versioned-cache-ts)                                         | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/perf/write_coalescer.ts`](#src-perf-write-coalescer-ts)                                         | `.`, `./web`                            |          0 |       4 |          4 |
| [`src/permissions.ts`](#src-permissions-ts)                                                           | `.`, `./web`                            |          0 |      23 |         23 |
| [`src/platform/types.ts`](#src-platform-types-ts)                                                     | `./web`                                 |          0 |      10 |         10 |
| [`src/pointer_input.ts`](#src-pointer-input-ts)                                                       | `.`, `./web`                            |          0 |      40 |         40 |
| [`src/remote/adaptive_quality.ts`](#src-remote-adaptive-quality-ts)                                   | `./remote`                              |          0 |       9 |          9 |
| [`src/remote/frame_codec.ts`](#src-remote-frame-codec-ts)                                             | `./remote`                              |          0 |      14 |         13 |
| [`src/remote/frame_flow.ts`](#src-remote-frame-flow-ts)                                               | `./remote`                              |          0 |       4 |          4 |
| [`src/remote/handshake.ts`](#src-remote-handshake-ts)                                                 | `./web`, `./remote`                     |          0 |      28 |         28 |
| [`src/remote/input_sequencing.ts`](#src-remote-input-sequencing-ts)                                   | `./remote`                              |          0 |       5 |          5 |
| [`src/remote/multi_client.ts`](#src-remote-multi-client-ts)                                           | `./remote`                              |          0 |       5 |          5 |
| [`src/remote/session_auth.ts`](#src-remote-session-auth-ts)                                           | `./remote`                              |          0 |       7 |          7 |
| [`src/remote/session_lifecycle.ts`](#src-remote-session-lifecycle-ts)                                 | `./remote`                              |          0 |       6 |          6 |
| [`src/remote/session_resume.ts`](#src-remote-session-resume-ts)                                       | `./remote`                              |          0 |       4 |          4 |
| [`src/remote/transport_policy.ts`](#src-remote-transport-policy-ts)                                   | `./remote`                              |          0 |       6 |          6 |
| [`src/runtime/async_channel.ts`](#src-runtime-async-channel-ts)                                       | `.`, `./runtime`                        |          0 |      23 |         23 |
| [`src/runtime/async_iterable.ts`](#src-runtime-async-iterable-ts)                                     | `.`, `./web`, `./runtime`               |          0 |      31 |         31 |
| [`src/runtime/cache_tags.ts`](#src-runtime-cache-tags-ts)                                             | `.`, `./runtime`                        |          0 |       3 |          3 |
| [`src/runtime/capabilities.ts`](#src-runtime-capabilities-ts)                                         | `.`, `./web`, `./runtime`               |          0 |      16 |         16 |
| [`src/runtime/cell_screen.ts`](#src-runtime-cell-screen-ts)                                           | `.`, `./runtime`                        |          0 |       6 |          6 |
| [`src/runtime/clock.ts`](#src-runtime-clock-ts)                                                       | `.`, `./web`, `./runtime`               |          0 |      23 |         23 |
| [`src/runtime/conflict_resolvers.ts`](#src-runtime-conflict-resolvers-ts)                             | `.`, `./runtime`                        |          0 |       9 |          9 |
| [`src/runtime/console_presenter.ts`](#src-runtime-console-presenter-ts)                               | `.`, `./runtime`                        |          0 |       3 |          3 |
| [`src/runtime/core_metrics.ts`](#src-runtime-core-metrics-ts)                                         | `.`, `./runtime`                        |          0 |       6 |          6 |
| [`src/runtime/data_pipeline_bindings.ts`](#src-runtime-data-pipeline-bindings-ts)                     | `.`, `./web`, `./runtime`               |          0 |       4 |          4 |
| [`src/runtime/data_pipeline.ts`](#src-runtime-data-pipeline-ts)                                       | `.`, `./web`, `./runtime`               |          0 |      19 |         19 |
| [`src/runtime/data_query.ts`](#src-runtime-data-query-ts)                                             | `.`, `./web`, `./runtime`               |          0 |      15 |         15 |
| [`src/runtime/deadline.ts`](#src-runtime-deadline-ts)                                                 | `.`, `./runtime`                        |          0 |      12 |         12 |
| [`src/runtime/diagnostics.ts`](#src-runtime-diagnostics-ts)                                           | `.`, `./runtime`                        |          0 |      12 |         12 |
| [`src/runtime/graphics_surface.ts`](#src-runtime-graphics-surface-ts)                                 | `.`, `./web`, `./runtime`               |          0 |      24 |         24 |
| [`src/runtime/health_snapshot.ts`](#src-runtime-health-snapshot-ts)                                   | `.`, `./runtime`                        |          0 |       5 |          5 |
| [`src/runtime/infinite_query.ts`](#src-runtime-infinite-query-ts)                                     | `.`, `./runtime`                        |          0 |       5 |          5 |
| [`src/runtime/kitty_graphics.ts`](#src-runtime-kitty-graphics-ts)                                     | `.`, `./web`, `./runtime`               |          0 |      25 |         25 |
| [`src/runtime/kitty_keyboard.ts`](#src-runtime-kitty-keyboard-ts)                                     | `.`, `./runtime`                        |          0 |       9 |          9 |
| [`src/runtime/kitty_passthrough.ts`](#src-runtime-kitty-passthrough-ts)                               | `.`, `./runtime`                        |          0 |       8 |          8 |
| [`src/runtime/line_attributes.ts`](#src-runtime-line-attributes-ts)                                   | `.`, `./runtime`                        |          0 |       5 |          5 |
| [`src/runtime/mod.ts`](#src-runtime-mod-ts)                                                           | `.`, `./runtime`                        |         80 |       0 |          0 |
| [`src/runtime/mutations.ts`](#src-runtime-mutations-ts)                                               | `.`, `./runtime`                        |          0 |       4 |          4 |
| [`src/runtime/observability_context.ts`](#src-runtime-observability-context-ts)                       | `.`, `./runtime`                        |          0 |       3 |          3 |
| [`src/runtime/observability.ts`](#src-runtime-observability-ts)                                       | `.`, `./runtime`                        |          0 |      15 |         15 |
| [`src/runtime/offline_queue.ts`](#src-runtime-offline-queue-ts)                                       | `.`, `./runtime`                        |          0 |       4 |          4 |
| [`src/runtime/offscreen_surface.ts`](#src-runtime-offscreen-surface-ts)                               | `.`, `./runtime`                        |          0 |       6 |          6 |
| [`src/runtime/permission_adapters.ts`](#src-runtime-permission-adapters-ts)                           | `.`, `./runtime`                        |          0 |      11 |         11 |
| [`src/runtime/priority_scheduler.ts`](#src-runtime-priority-scheduler-ts)                             | `.`, `./runtime`                        |          0 |       4 |          4 |
| [`src/runtime/process_session.ts`](#src-runtime-process-session-ts)                                   | `.`, `./runtime`, `./terminal`          |          0 |       9 |          9 |
| [`src/runtime/profiles.ts`](#src-runtime-profiles-ts)                                                 | `.`, `./web`, `./runtime`               |          0 |      24 |         24 |
| [`src/runtime/pty_backend.ts`](#src-runtime-pty-backend-ts)                                           | `.`, `./runtime`, `./terminal`          |          0 |      12 |         12 |
| [`src/runtime/rate_limiter.ts`](#src-runtime-rate-limiter-ts)                                         | `.`, `./runtime`                        |          0 |       6 |          6 |
| [`src/runtime/reflow_screen.ts`](#src-runtime-reflow-screen-ts)                                       | `.`, `./runtime`                        |          0 |       6 |          6 |
| [`src/runtime/render_accounting.ts`](#src-runtime-render-accounting-ts)                               | `.`, `./runtime`                        |          0 |       6 |          6 |
| [`src/runtime/render_loop.ts`](#src-runtime-render-loop-ts)                                           | `.`, `./web`, `./runtime`               |          0 |      14 |         14 |
| [`src/runtime/renderer_backends.ts`](#src-runtime-renderer-backends-ts)                               | `.`, `./web`, `./runtime`               |          0 |      24 |         24 |
| [`src/runtime/resource_bindings.ts`](#src-runtime-resource-bindings-ts)                               | `.`, `./web`, `./runtime`               |          0 |       4 |          4 |
| [`src/runtime/resource_cache_policy.ts`](#src-runtime-resource-cache-policy-ts)                       | `.`, `./web`, `./runtime`               |          0 |       4 |          4 |
| [`src/runtime/resource_cache.ts`](#src-runtime-resource-cache-ts)                                     | `.`, `./web`, `./runtime`               |          1 |      28 |         28 |
| [`src/runtime/resource_limits.ts`](#src-runtime-resource-limits-ts)                                   | `.`, `./runtime`                        |          0 |       6 |          6 |
| [`src/runtime/resource_loads.ts`](#src-runtime-resource-loads-ts)                                     | `.`, `./web`, `./runtime`               |          0 |      24 |         24 |
| [`src/runtime/resource.ts`](#src-runtime-resource-ts)                                                 | `.`, `./web`, `./runtime`               |          0 |      14 |         14 |
| [`src/runtime/retry_policy.ts`](#src-runtime-retry-policy-ts)                                         | `.`, `./runtime`                        |          0 |      10 |         10 |
| [`src/runtime/scheduler.ts`](#src-runtime-scheduler-ts)                                               | `.`, `./web`, `./runtime`               |          0 |      13 |         13 |
| [`src/runtime/screen_mode_policy.ts`](#src-runtime-screen-mode-policy-ts)                             | `.`, `./runtime`                        |          0 |       5 |          5 |
| [`src/runtime/selective_erase.ts`](#src-runtime-selective-erase-ts)                                   | `.`, `./runtime`                        |          0 |       6 |          6 |
| [`src/runtime/signal_exporters.ts`](#src-runtime-signal-exporters-ts)                                 | `.`, `./runtime`                        |          0 |       9 |          9 |
| [`src/runtime/signal_redaction.ts`](#src-runtime-signal-redaction-ts)                                 | `.`, `./runtime`                        |          0 |       4 |          4 |
| [`src/runtime/span_instrumentation.ts`](#src-runtime-span-instrumentation-ts)                         | `.`, `./runtime`                        |          0 |       4 |          4 |
| [`src/runtime/storage.ts`](#src-runtime-storage-ts)                                                   | `.`, `./web`, `./runtime`               |          0 |      10 |         10 |
| [`src/runtime/stream_ownership.ts`](#src-runtime-stream-ownership-ts)                                 | `.`, `./runtime`                        |          0 |       5 |          5 |
| [`src/runtime/stream_resource.ts`](#src-runtime-stream-resource-ts)                                   | `.`, `./runtime`                        |          0 |       6 |          6 |
| [`src/runtime/structured_logs.ts`](#src-runtime-structured-logs-ts)                                   | `.`, `./runtime`                        |          0 |       6 |          6 |
| [`src/runtime/supervisor.ts`](#src-runtime-supervisor-ts)                                             | `.`, `./runtime`                        |          0 |       6 |          6 |
| [`src/runtime/support_bundle.ts`](#src-runtime-support-bundle-ts)                                     | `.`, `./runtime`                        |          0 |       6 |          6 |
| [`src/runtime/task_context.ts`](#src-runtime-task-context-ts)                                         | `.`, `./runtime`                        |          0 |       3 |          3 |
| [`src/runtime/task_group.ts`](#src-runtime-task-group-ts)                                             | `.`, `./runtime`                        |          0 |      35 |         35 |
| [`src/runtime/telemetry.ts`](#src-runtime-telemetry-ts)                                               | `.`, `./web`, `./runtime`               |          0 |      15 |         15 |
| [`src/runtime/terminal_backend_registry.ts`](#src-runtime-terminal-backend-registry-ts)               | `.`, `./runtime`, `./terminal`          |          0 |       9 |          9 |
| [`src/runtime/terminal_backend.ts`](#src-runtime-terminal-backend-ts)                                 | `.`, `./runtime`, `./terminal`          |          0 |       9 |          9 |
| [`src/runtime/terminal_capabilities.ts`](#src-runtime-terminal-capabilities-ts)                       | `.`, `./runtime`, `./terminal`          |          0 |      27 |         27 |
| [`src/runtime/terminal_color.ts`](#src-runtime-terminal-color-ts)                                     | `./terminal`                            |          0 |       4 |          3 |
| [`src/runtime/terminal_margins.ts`](#src-runtime-terminal-margins-ts)                                 | `.`, `./runtime`                        |          0 |       2 |          2 |
| [`src/runtime/terminal_operations.ts`](#src-runtime-terminal-operations-ts)                           | `.`, `./runtime`                        |          0 |       5 |          5 |
| [`src/runtime/terminal_palette.ts`](#src-runtime-terminal-palette-ts)                                 | `.`, `./runtime`, `./terminal`          |          0 |       8 |          8 |
| [`src/runtime/terminal_parser.ts`](#src-runtime-terminal-parser-ts)                                   | `.`, `./runtime`                        |          0 |       5 |          5 |
| [`src/runtime/terminal_passthrough.ts`](#src-runtime-terminal-passthrough-ts)                         | `.`, `./runtime`                        |          0 |      11 |         11 |
| [`src/runtime/terminal_queries.ts`](#src-runtime-terminal-queries-ts)                                 | `.`, `./runtime`                        |          0 |       4 |          4 |
| [`src/runtime/terminal_sanitizer.ts`](#src-runtime-terminal-sanitizer-ts)                             | `.`, `./runtime`                        |          0 |       4 |          4 |
| [`src/runtime/terminal_screen.ts`](#src-runtime-terminal-screen-ts)                                   | `.`, `./web`, `./runtime`, `./terminal` |          0 |       6 |          6 |
| [`src/runtime/terminal_scrollback.ts`](#src-runtime-terminal-scrollback-ts)                           | `.`, `./web`, `./runtime`, `./terminal` |          0 |       6 |          6 |
| [`src/runtime/terminal_sequences.ts`](#src-runtime-terminal-sequences-ts)                             | `./terminal`                            |          0 |       3 |          3 |
| [`src/runtime/terminal_services.ts`](#src-runtime-terminal-services-ts)                               | `.`, `./runtime`                        |          0 |      32 |         32 |
| [`src/runtime/terminal_session.ts`](#src-runtime-terminal-session-ts)                                 | `.`, `./runtime`, `./terminal`          |          0 |       8 |          8 |
| [`src/runtime/terminal_shell_workspace.ts`](#src-runtime-terminal-shell-workspace-ts)                 | `.`, `./runtime`                        |          0 |       5 |          5 |
| [`src/runtime/terminal_shell.ts`](#src-runtime-terminal-shell-ts)                                     | `.`, `./runtime`, `./terminal`          |          0 |       3 |          3 |
| [`src/runtime/terminal_status.ts`](#src-runtime-terminal-status-ts)                                   | `.`, `./runtime`, `./terminal`          |          0 |      18 |         18 |
| [`src/runtime/terminal_templates.ts`](#src-runtime-terminal-templates-ts)                             | `.`, `./runtime`, `./terminal`          |          0 |      22 |         22 |
| [`src/runtime/terminal_workspace.ts`](#src-runtime-terminal-workspace-ts)                             | `.`, `./web`, `./runtime`, `./terminal` |          0 |      24 |         24 |
| [`src/runtime/timeline.ts`](#src-runtime-timeline-ts)                                                 | `.`, `./runtime`                        |          0 |       7 |          7 |
| [`src/runtime/trace_sampling.ts`](#src-runtime-trace-sampling-ts)                                     | `.`, `./runtime`                        |          0 |       6 |          6 |
| [`src/runtime/worker_pool.ts`](#src-runtime-worker-pool-ts)                                           | `.`, `./web`, `./runtime`               |          0 |      12 |         12 |
| [`src/runtime/worker_protocol.ts`](#src-runtime-worker-protocol-ts)                                   | `.`, `./runtime`                        |          0 |       5 |          5 |
| [`src/secrets.ts`](#src-secrets-ts)                                                                   | `.`                                     |          0 |      22 |         22 |
| [`src/selection.ts`](#src-selection-ts)                                                               | `.`, `./web`                            |          0 |      16 |         16 |
| [`src/showcase/kernel.ts`](#src-showcase-kernel-ts)                                                   | `./showcase`                            |          0 |       4 |          3 |
| [`src/showcase/manifest.ts`](#src-showcase-manifest-ts)                                               | `./showcase`                            |          0 |       9 |          9 |
| [`src/showcase/mod.ts`](#src-showcase-mod-ts)                                                         | `./showcase`                            |          5 |       0 |          0 |
| [`src/showcase/provider.ts`](#src-showcase-provider-ts)                                               | `./showcase`                            |          0 |      10 |         10 |
| [`src/showcase/session.ts`](#src-showcase-session-ts)                                                 | `./showcase`                            |          0 |      15 |         15 |
| [`src/showcase/terminal_store.ts`](#src-showcase-terminal-store-ts)                                   | `./showcase`                            |          0 |      15 |         15 |
| [`src/signals/computed.ts`](#src-signals-computed-ts)                                                 | `.`, `./app`, `./web`                   |          0 |       3 |          3 |
| [`src/signals/dependency_tracking.ts`](#src-signals-dependency-tracking-ts)                           | `.`, `./app`, `./web`                   |          0 |       3 |          3 |
| [`src/signals/effect.ts`](#src-signals-effect-ts)                                                     | `.`, `./app`, `./web`                   |          0 |       3 |          3 |
| [`src/signals/flusher.ts`](#src-signals-flusher-ts)                                                   | `.`, `./app`, `./web`                   |          0 |       1 |          1 |
| [`src/signals/lazy_computed.ts`](#src-signals-lazy-computed-ts)                                       | `.`, `./app`, `./web`                   |          0 |       1 |          1 |
| [`src/signals/lazy_effect.ts`](#src-signals-lazy-effect-ts)                                           | `.`, `./app`, `./web`                   |          0 |       1 |          1 |
| [`src/signals/mod.ts`](#src-signals-mod-ts)                                                           | `.`, `./app`, `./web`                   |          9 |       0 |          0 |
| [`src/signals/reactivity.ts`](#src-signals-reactivity-ts)                                             | `.`, `./app`, `./web`                   |          0 |      13 |         13 |
| [`src/signals/signal.ts`](#src-signals-signal-ts)                                                     | `.`, `./app`, `./web`                   |          0 |      11 |         11 |
| [`src/signals/types.ts`](#src-signals-types-ts)                                                       | `.`, `./app`, `./web`                   |          0 |       4 |          4 |
| [`src/surface_animation.ts`](#src-surface-animation-ts)                                               | `.`, `./web`                            |          0 |      14 |         14 |
| [`src/testing/app.ts`](#src-testing-app-ts)                                                           | `./testing`                             |          0 |      11 |         11 |
| [`src/testing/aria_apg_suites.ts`](#src-testing-aria-apg-suites-ts)                                   | `./testing`                             |          0 |       4 |          4 |
| [`src/testing/contract_tests.ts`](#src-testing-contract-tests-ts)                                     | `./testing`                             |          0 |       6 |          6 |
| [`src/testing/differential_terminal.ts`](#src-testing-differential-terminal-ts)                       | `./testing`                             |          0 |       6 |          6 |
| [`src/testing/fault_injection.ts`](#src-testing-fault-injection-ts)                                   | `./testing`                             |          0 |       6 |          6 |
| [`src/testing/flake_detection.ts`](#src-testing-flake-detection-ts)                                   | `./testing`                             |          0 |       7 |          7 |
| [`src/testing/input.ts`](#src-testing-input-ts)                                                       | `.`, `./testing`                        |          0 |       7 |          7 |
| [`src/testing/matrix.ts`](#src-testing-matrix-ts)                                                     | `./testing`                             |          0 |       6 |          6 |
| [`src/testing/model_testing.ts`](#src-testing-model-testing-ts)                                       | `./testing`                             |          0 |       8 |          8 |
| [`src/testing/mutation_testing.ts`](#src-testing-mutation-testing-ts)                                 | `./testing`                             |          0 |       6 |          6 |
| [`src/testing/plugin_test_host.ts`](#src-testing-plugin-test-host-ts)                                 | `./testing`                             |          0 |       6 |          6 |
| [`src/testing/record_replay.ts`](#src-testing-record-replay-ts)                                       | `./testing`                             |          0 |       7 |          7 |
| [`src/testing/scene.ts`](#src-testing-scene-ts)                                                       | `./testing`                             |          0 |       8 |          8 |
| [`src/testing/snapshot.ts`](#src-testing-snapshot-ts)                                                 | `.`, `./testing`                        |          0 |      15 |         15 |
| [`src/testing/visual_report.ts`](#src-testing-visual-report-ts)                                       | `./testing`                             |          0 |       6 |          6 |
| [`src/theme_binding.ts`](#src-theme-binding-ts)                                                       | `.`, `./web`, `./theme`                 |          0 |       8 |          8 |
| [`src/theme_contrast.ts`](#src-theme-contrast-ts)                                                     | `.`, `./web`, `./theme`                 |          0 |       7 |          7 |
| [`src/theme_controls.ts`](#src-theme-controls-ts)                                                     | `./theme`                               |          0 |      13 |         13 |
| [`src/theme_density.ts`](#src-theme-density-ts)                                                       | `.`, `./web`                            |          0 |       5 |          5 |
| [`src/theme_editor_model.ts`](#src-theme-editor-model-ts)                                             | `./theme`                               |          0 |      21 |         21 |
| [`src/theme_engine_cache.ts`](#src-theme-engine-cache-ts)                                             | `.`, `./web`, `./theme`                 |          0 |       6 |          6 |
| [`src/theme_engine_factory.ts`](#src-theme-engine-factory-ts)                                         | `.`, `./web`, `./theme`                 |          0 |      19 |         19 |
| [`src/theme_engine_pipeline.ts`](#src-theme-engine-pipeline-ts)                                       | `.`, `./web`, `./theme`                 |          0 |      12 |         12 |
| [`src/theme_expressions.ts`](#src-theme-expressions-ts)                                               | `.`, `./web`, `./theme`                 |          0 |       6 |          6 |
| [`src/theme_gallery.ts`](#src-theme-gallery-ts)                                                       | `.`, `./web`, `./theme`                 |          0 |      11 |         11 |
| [`src/theme_icons.ts`](#src-theme-icons-ts)                                                           | `.`, `./web`                            |          0 |       8 |          8 |
| [`src/theme_interchange.ts`](#src-theme-interchange-ts)                                               | `.`, `./web`, `./theme`                 |          0 |       9 |          9 |
| [`src/theme_motion.ts`](#src-theme-motion-ts)                                                         | `.`, `./web`                            |          0 |       7 |          7 |
| [`src/theme_oklch.ts`](#src-theme-oklch-ts)                                                           | `.`, `./web`, `./theme`                 |          0 |       9 |          9 |
| [`src/theme_quantize.ts`](#src-theme-quantize-ts)                                                     | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/theme_resolver.ts`](#src-theme-resolver-ts)                                                     | `.`, `./web`, `./theme`                 |          0 |      15 |         15 |
| [`src/theme_token_schemas.ts`](#src-theme-token-schemas-ts)                                           | `.`, `./web`                            |          0 |       7 |          7 |
| [`src/theme_tokens.ts`](#src-theme-tokens-ts)                                                         | `.`                                     |          0 |       6 |          6 |
| [`src/theme_workspace.ts`](#src-theme-workspace-ts)                                                   | `.`, `./web`, `./theme`                 |          0 |       7 |          7 |
| [`src/theme.ts`](#src-theme-ts)                                                                       | `.`, `./app`, `./web`, `./theme`        |          0 |     116 |        116 |
| [`src/three_ascii/AcerolaAsciiNode.ts`](#src-three-ascii-acerolaasciinode-ts)                         | `./web`, `./three-ascii`                |          0 |       3 |          3 |
| [`src/three_ascii/demo_presets.ts`](#src-three-ascii-demo-presets-ts)                                 | `./web`, `./three-ascii`                |          0 |      14 |         14 |
| [`src/three_ascii/frame_options.ts`](#src-three-ascii-frame-options-ts)                               | `./web`, `./three-ascii`                |          0 |       1 |          1 |
| [`src/three_ascii/glyphs.ts`](#src-three-ascii-glyphs-ts)                                             | `./web`, `./three-ascii`                |          0 |      13 |         13 |
| [`src/three_ascii/mod.ts`](#src-three-ascii-mod-ts)                                                   | `./web`, `./three-ascii`                |          7 |       0 |          0 |
| [`src/three_ascii/options.ts`](#src-three-ascii-options-ts)                                           | `./web`, `./three-ascii`                |          0 |      15 |         15 |
| [`src/three_ascii/performance.ts`](#src-three-ascii-performance-ts)                                   | `./web`, `./three-ascii`                |          0 |       1 |          1 |
| [`src/three_ascii/render_profile.ts`](#src-three-ascii-render-profile-ts)                             | `./web`, `./three-ascii`                |          0 |       3 |          3 |
| [`src/three_ascii/renderer.ts`](#src-three-ascii-renderer-ts)                                         | `./web`, `./three-ascii`                |          2 |      22 |         22 |
| [`src/three_ascii/webgpu_compat.ts`](#src-three-ascii-webgpu-compat-ts)                               | `./web`, `./three-ascii`                |          0 |       3 |          3 |
| [`src/tooling/attestations.ts`](#src-tooling-attestations-ts)                                         | `.`                                     |          0 |       8 |          8 |
| [`src/tooling/codemods.ts`](#src-tooling-codemods-ts)                                                 | `.`                                     |          0 |       5 |          5 |
| [`src/tooling/devtools.ts`](#src-tooling-devtools-ts)                                                 | `.`                                     |          0 |       9 |          9 |
| [`src/tooling/diagnostics_hub.ts`](#src-tooling-diagnostics-hub-ts)                                   | `.`                                     |          0 |       7 |          7 |
| [`src/tooling/example_registry.ts`](#src-tooling-example-registry-ts)                                 | `.`                                     |          0 |       4 |          4 |
| [`src/tooling/generators.ts`](#src-tooling-generators-ts)                                             | `.`                                     |          0 |       7 |          7 |
| [`src/tooling/init_templates.ts`](#src-tooling-init-templates-ts)                                     | `.`                                     |          0 |       5 |          5 |
| [`src/tooling/launcher_template.ts`](#src-tooling-launcher-template-ts)                               | `.`                                     |          0 |       1 |          1 |
| [`src/tooling/mod.ts`](#src-tooling-mod-ts)                                                           | `.`                                     |          9 |       0 |          0 |
| [`src/tooling/release_channels.ts`](#src-tooling-release-channels-ts)                                 | `.`                                     |          0 |       7 |          7 |
| [`src/tui.ts`](#src-tui-ts)                                                                           | `.`, `./app`                            |          0 |       3 |          3 |
| [`src/types.ts`](#src-types-ts)                                                                       | `.`, `./app`, `./remote`                |          0 |       8 |          8 |
| [`src/unicode/bidi.ts`](#src-unicode-bidi-ts)                                                         | `.`                                     |          0 |       5 |          5 |
| [`src/unicode/builtin.ts`](#src-unicode-builtin-ts)                                                   | `.`                                     |          0 |       4 |          4 |
| [`src/unicode/conformance.ts`](#src-unicode-conformance-ts)                                           | `.`                                     |          0 |       8 |          8 |
| [`src/unicode/confusables.ts`](#src-unicode-confusables-ts)                                           | `.`                                     |          0 |       6 |          6 |
| [`src/unicode/controls.ts`](#src-unicode-controls-ts)                                                 | `.`                                     |          0 |       7 |          7 |
| [`src/unicode/data_pack.ts`](#src-unicode-data-pack-ts)                                               | `.`                                     |          0 |      26 |         26 |
| [`src/unicode/emoji.ts`](#src-unicode-emoji-ts)                                                       | `.`                                     |          0 |       6 |          6 |
| [`src/unicode/grapheme.ts`](#src-unicode-grapheme-ts)                                                 | `.`                                     |          0 |      21 |         21 |
| [`src/unicode/hyphenation.ts`](#src-unicode-hyphenation-ts)                                           | `.`                                     |          0 |       7 |          7 |
| [`src/unicode/line_break.ts`](#src-unicode-line-break-ts)                                             | `.`                                     |          0 |       8 |          8 |
| [`src/unicode/mod.ts`](#src-unicode-mod-ts)                                                           | `.`                                     |         13 |       0 |          0 |
| [`src/unicode/source_display.ts`](#src-unicode-source-display-ts)                                     | `.`                                     |          0 |       5 |          5 |
| [`src/unicode/text_index.ts`](#src-unicode-text-index-ts)                                             | `.`                                     |          0 |       6 |          6 |
| [`src/unicode/width.ts`](#src-unicode-width-ts)                                                       | `.`, `./web`, `./terminal`              |          0 |      21 |         21 |
| [`src/utils/ansi_codes.ts`](#src-utils-ansi-codes-ts)                                                 | `.`                                     |          0 |      12 |         12 |
| [`src/utils/async.ts`](#src-utils-async-ts)                                                           | `.`, `./web`                            |          0 |       1 |          1 |
| [`src/utils/component.ts`](#src-utils-component-ts)                                                   | `.`                                     |          0 |       2 |          2 |
| [`src/utils/mod.ts`](#src-utils-mod-ts)                                                               | `.`                                     |          7 |       0 |          0 |
| [`src/utils/numbers.ts`](#src-utils-numbers-ts)                                                       | `.`, `./web`                            |          0 |       6 |          6 |
| [`src/utils/signals.ts`](#src-utils-signals-ts)                                                       | `.`                                     |          0 |       1 |          1 |
| [`src/utils/sorted_array.ts`](#src-utils-sorted-array-ts)                                             | `.`, `./web`                            |          0 |       2 |          2 |
| [`src/utils/strings.ts`](#src-utils-strings-ts)                                                       | `.`, `./web`                            |          0 |       9 |          9 |
| [`src/view.ts`](#src-view-ts)                                                                         | `.`, `./web`                            |          0 |       1 |          1 |
| [`src/viewport.ts`](#src-viewport-ts)                                                                 | `.`, `./web`                            |          0 |      18 |         18 |
| [`src/visual/annotations.ts`](#src-visual-annotations-ts)                                             | `.`                                     |          0 |       4 |          4 |
| [`src/visual/axes.ts`](#src-visual-axes-ts)                                                           | `.`                                     |          0 |       4 |          4 |
| [`src/visual/chart_export.ts`](#src-visual-chart-export-ts)                                           | `.`                                     |          0 |       7 |          7 |
| [`src/visual/downsample.ts`](#src-visual-downsample-ts)                                               | `.`, `./viz`                            |          0 |       6 |          6 |
| [`src/visual/heatmap.ts`](#src-visual-heatmap-ts)                                                     | `.`                                     |          0 |       6 |          6 |
| [`src/visual/interactions.ts`](#src-visual-interactions-ts)                                           | `.`                                     |          0 |       5 |          5 |
| [`src/visual/linked_charts.ts`](#src-visual-linked-charts-ts)                                         | `.`                                     |          0 |       4 |          4 |
| [`src/visual/marks.ts`](#src-visual-marks-ts)                                                         | `.`                                     |          0 |       7 |          7 |
| [`src/visual/mod.ts`](#src-visual-mod-ts)                                                             | `.`                                     |         11 |       0 |          0 |
| [`src/visual/raster.ts`](#src-visual-raster-ts)                                                       | `.`                                     |          0 |       3 |          3 |
| [`src/visual/scales.ts`](#src-visual-scales-ts)                                                       | `.`                                     |          0 |      11 |         11 |
| [`src/visual/series.ts`](#src-visual-series-ts)                                                       | `.`                                     |          0 |       5 |          5 |
| [`src/viz/axes.ts`](#src-viz-axes-ts)                                                                 | `./viz`                                 |          0 |       8 |          5 |
| [`src/viz/dashboard.ts`](#src-viz-dashboard-ts)                                                       | `./viz`                                 |          0 |       6 |          4 |
| [`src/viz/data.ts`](#src-viz-data-ts)                                                                 | `./viz`                                 |          0 |      17 |         16 |
| [`src/viz/draw.ts`](#src-viz-draw-ts)                                                                 | `./viz`                                 |          0 |      12 |         10 |
| [`src/viz/fit.ts`](#src-viz-fit-ts)                                                                   | `./viz`                                 |          0 |       5 |          5 |
| [`src/viz/mod.ts`](#src-viz-mod-ts)                                                                   | `./viz`                                 |         17 |       0 |          0 |
| [`src/viz/project.ts`](#src-viz-project-ts)                                                           | `./viz`                                 |          0 |       7 |          3 |
| [`src/viz/registry.ts`](#src-viz-registry-ts)                                                         | `./viz`                                 |          0 |       6 |          5 |
| [`src/viz/render.ts`](#src-viz-render-ts)                                                             | `./viz`                                 |          0 |      10 |          8 |
| [`src/viz/renderers_matrix.ts`](#src-viz-renderers-matrix-ts)                                         | `./viz`                                 |          0 |       6 |          5 |
| [`src/viz/renderers_scalar.ts`](#src-viz-renderers-scalar-ts)                                         | `./viz`                                 |          0 |      10 |         10 |
| [`src/viz/renderers_spatial.ts`](#src-viz-renderers-spatial-ts)                                       | `./viz`                                 |          0 |       5 |          5 |
| [`src/viz/renderers_vector.ts`](#src-viz-renderers-vector-ts)                                         | `./viz`                                 |          0 |       7 |          6 |
| [`src/viz/scale.ts`](#src-viz-scale-ts)                                                               | `./viz`                                 |          1 |       7 |          6 |
| [`src/viz/stream.ts`](#src-viz-stream-ts)                                                             | `./viz`                                 |          0 |       7 |          6 |
| [`src/viz/theme.ts`](#src-viz-theme-ts)                                                               | `./viz`                                 |          0 |       6 |          6 |
| [`src/viz/three/mod.ts`](#src-viz-three-mod-ts)                                                       | `./viz/three`                           |          2 |       0 |          0 |
| [`src/viz/three/scene.ts`](#src-viz-three-scene-ts)                                                   | `./viz/three`                           |          0 |       7 |          6 |
| [`src/viz/three/scenes.ts`](#src-viz-three-scenes-ts)                                                 | `./viz/three`                           |          0 |       3 |          3 |
| [`src/viz/tiles.ts`](#src-viz-tiles-ts)                                                               | `./viz`                                 |          0 |      13 |          8 |
| [`src/viz/view.ts`](#src-viz-view-ts)                                                                 | `./viz`                                 |          0 |       4 |          2 |
| [`src/web/cell_canvas_sink.ts`](#src-web-cell-canvas-sink-ts)                                         | `./web`                                 |          0 |       5 |          5 |
| [`src/web/dom_renderer.ts`](#src-web-dom-renderer-ts)                                                 | `./web`                                 |          0 |       7 |          7 |
| [`src/web/host.ts`](#src-web-host-ts)                                                                 | `./web`                                 |          0 |       5 |          5 |
| [`src/web/mod.ts`](#src-web-mod-ts)                                                                   | `./web`                                 |          6 |       0 |          0 |
| [`src/web/platform.ts`](#src-web-platform-ts)                                                         | `./web`                                 |          0 |       7 |          7 |
| [`src/web/remote_terminal.ts`](#src-web-remote-terminal-ts)                                           | `./web`, `./remote`                     |          0 |      33 |         33 |
| [`src/web/web_presenter.ts`](#src-web-web-presenter-ts)                                               | `./web`                                 |          0 |       4 |          4 |

## Module Details

### mod.app.ts

_Entrypoints: `./app`_

| Re-export Target                    | Kind  | Names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/terminal_app.ts`           | named | `TerminalApp`, `createTerminalApp`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/app/terminal_app.ts`           | named | `type TerminalAppBindings`, `type TerminalAppComponentOptions`, `type TerminalAppInputOptions`, `type TerminalAppOptions`                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/app/plugins.ts`                | named | `createAppPlugin`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/app/plugins.ts`                | named | `type AppPluginDefinition`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/app/actions.ts`                | named | `type Action`, `type ActionHandler`, `type ActionMiddleware`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/app/commands.ts`               | named | `type Command`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/app/router.ts`                 | named | `type Route`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/signals/mod.ts`                | named | `Computed`, `Effect`, `Signal`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/signals/mod.ts`                | named | `type SignalOfObject`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/theme.ts`                      | named | `ThemeEngine`, `createThemeEngine`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/tui.ts`                        | named | `Tui`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/tui.ts`                        | named | `type TuiOptions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/types.ts`                      | named | `type Rectangle`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/app/widget_surface.ts`         | named | `WidgetSurface`, `widgetSurfaceCellData`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/app/widget_surface.ts`         | named | `type WidgetSurfaceCell`, `type WidgetSurfaceCellData`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/layout/grid_layout.ts`         | named | `GridLayout`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/layout/horizontal_layout.ts`   | named | `HorizontalLayout`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/layout/split_pane.ts`          | named | `SplitPaneController`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/layout/tiled_workspace.ts`     | named | `TiledWorkspaceController`, `createTiledWorkspaceController`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/layout/tiled_workspace.ts`     | named | `type TiledWorkspaceControllerOptions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/layout/vertical_layout.ts`     | named | `VerticalLayout`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/app/workbench_window_host.ts`  | named | `WorkbenchWindowHostController`, `createWorkbenchWindowHostController`, `createWorkbenchWindowHostRoot`                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/app/workbench_window_host.ts`  | named | `type WorkbenchWindowChromeControl`, `type WorkbenchWindowChromeProjection`, `type WorkbenchWindowHostCommand`, `type WorkbenchWindowHostControllerOptions`, `type WorkbenchWindowHostDescriptor`, `type WorkbenchWindowHostInspection`, `type WorkbenchWindowHostProjection`, `type WorkbenchWindowHostProjectionOptions`, `type WorkbenchWindowHostResult`, `type WorkbenchWindowSemanticNode`, `type WorkbenchWindowSeparatorProjection`, `type WorkbenchWindowShelfItem`, `type WorkbenchWindowSnapPreview`, `type WorkbenchWindowSwitcherProjection` |
| `src/app/surface_transitions.ts`    | named | `DEFAULT_SURFACE_TRANSITION_SETTINGS`, `SURFACE_TRANSITION_BASE_DURATION_MS`, `SurfaceTransitionAnimator`, `createSurfaceTransitionAnimator`, `surfaceTransitionMotionToken`                                                                                                                                                                                                                                                                                                                                                                              |
| `src/app/surface_transitions.ts`    | named | `type BeginSurfaceTransitionOptions`, `type SurfaceTransitionAnimatorOptions`, `type SurfaceTransitionOverlay`, `type SurfaceTransitionSettings`                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/components/box.ts`             | named | `Box`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/components/button.ts`          | named | `Button`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/components/checkbox.ts`        | named | `CheckBox`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/components/combobox.ts`        | named | `ComboBox`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/components/command_palette.ts` | named | `CommandPalette`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/components/context_menu.ts`    | named | `ContextMenu`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/components/frame.ts`           | named | `Frame`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/components/input.ts`           | named | `Input`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/components/label.ts`           | named | `Label`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/components/list.ts`            | named | `List`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/components/modal.ts`           | named | `Modal`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/components/markdown.ts`        | named | `Markdown`, `MarkdownController`, `defaultMarkdownStyles`, `formatMarkdownRenderLine`                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/components/markdown.ts`        | named | `type MarkdownControllerOptions`, `type MarkdownInspection`, `type MarkdownOptions`, `type MarkdownStyleKey`, `type MarkdownStyles`                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/content/markdown.ts`           | named | `markdownRenderText`, `parseMarkdown`, `renderMarkdown`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/content/markdown.ts`           | named | `type MarkdownBlock`, `type MarkdownBlockKind`, `type MarkdownDocument`, `type MarkdownInlineMark`, `type MarkdownInlineSpan`, `type MarkdownParseOptions`, `type MarkdownRenderLine`, `type MarkdownRenderOptions`, `type MarkdownRenderRole`, `type MarkdownRenderSegment`, `type MarkdownTableCell`                                                                                                                                                                                                                                                    |
| `src/components/progressbar.ts`     | named | `ProgressBar`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/components/radio_group.ts`     | named | `RadioGroup`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/components/scroll_area.ts`     | named | `ScrollArea`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/components/slider.ts`          | named | `Slider`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/components/spinner.ts`         | named | `Spinner`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/components/statusbar.ts`       | named | `StatusBar`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/components/table.ts`           | named | `Table`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/components/tabs.ts`            | named | `Tabs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/components/text.ts`            | named | `Text`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/components/textbox.ts`         | named | `TextBox`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/components/toast.ts`           | named | `ToastStack`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/components/tree.ts`            | named | `Tree`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/components/virtual_list.ts`    | named | `VirtualList`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

_No direct exported symbols._

### mod.remote.ts

_Entrypoints: `./remote`_

| Re-export Target                  | Kind  | Names                                                                                                               |
| --------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------- |
| `src/web/remote_terminal.ts`      | star  | -                                                                                                                   |
| `src/remote/handshake.ts`         | star  | -                                                                                                                   |
| `src/remote/session_auth.ts`      | star  | -                                                                                                                   |
| `src/remote/adaptive_quality.ts`  | star  | -                                                                                                                   |
| `src/remote/frame_codec.ts`       | star  | -                                                                                                                   |
| `src/remote/frame_flow.ts`        | star  | -                                                                                                                   |
| `src/remote/session_resume.ts`    | star  | -                                                                                                                   |
| `src/remote/multi_client.ts`      | star  | -                                                                                                                   |
| `src/remote/session_lifecycle.ts` | star  | -                                                                                                                   |
| `src/remote/input_sequencing.ts`  | star  | -                                                                                                                   |
| `src/remote/transport_policy.ts`  | star  | -                                                                                                                   |
| `src/types.ts`                    | named | `type ConsoleSize`                                                                                                  |
| `src/input_reader/types.ts`       | named | `type KeyPressEvent`, `type MousePressEvent`, `type MouseScrollEvent`, `type PasteEvent`, `type TerminalFocusEvent` |

_No direct exported symbols._

### mod.runtime.ts

_Entrypoints: `./runtime`_

| Re-export Target     | Kind | Names |
| -------------------- | ---- | ----- |
| `src/runtime/mod.ts` | star | -     |

_No direct exported symbols._

### mod.terminal.ts

_Entrypoints: `./terminal`_

| Re-export Target                           | Kind | Names |
| ------------------------------------------ | ---- | ----- |
| `src/input_reader/mod.ts`                  | star | -     |
| `src/runtime/process_session.ts`           | star | -     |
| `src/runtime/pty_backend.ts`               | star | -     |
| `src/runtime/terminal_backend.ts`          | star | -     |
| `src/runtime/terminal_color.ts`            | star | -     |
| `src/runtime/terminal_backend_registry.ts` | star | -     |
| `src/runtime/terminal_capabilities.ts`     | star | -     |
| `src/runtime/terminal_palette.ts`          | star | -     |
| `src/runtime/terminal_screen.ts`           | star | -     |
| `src/runtime/terminal_scrollback.ts`       | star | -     |
| `src/runtime/terminal_sequences.ts`        | star | -     |
| `src/runtime/terminal_session.ts`          | star | -     |
| `src/runtime/terminal_shell.ts`            | star | -     |
| `src/runtime/terminal_status.ts`           | star | -     |
| `src/runtime/terminal_templates.ts`        | star | -     |
| `src/runtime/terminal_workspace.ts`        | star | -     |
| `src/unicode/width.ts`                     | star | -     |

_No direct exported symbols._

### mod.testing.ts

_Entrypoints: `./testing`_

| Re-export Target                       | Kind | Names |
| -------------------------------------- | ---- | ----- |
| `src/testing/input.ts`                 | star | -     |
| `src/testing/snapshot.ts`              | star | -     |
| `src/testing/scene.ts`                 | star | -     |
| `src/testing/visual_report.ts`         | star | -     |
| `src/testing/matrix.ts`                | star | -     |
| `src/testing/model_testing.ts`         | star | -     |
| `src/testing/aria_apg_suites.ts`       | star | -     |
| `src/testing/contract_tests.ts`        | star | -     |
| `src/testing/differential_terminal.ts` | star | -     |
| `src/testing/fault_injection.ts`       | star | -     |
| `src/testing/flake_detection.ts`       | star | -     |
| `src/testing/plugin_test_host.ts`      | star | -     |
| `src/testing/record_replay.ts`         | star | -     |
| `src/testing/mutation_testing.ts`      | star | -     |
| `src/testing/app.ts`                   | star | -     |

_No direct exported symbols._

### mod.theme.ts

_Entrypoints: `./theme`_

| Re-export Target               | Kind | Names |
| ------------------------------ | ---- | ----- |
| `src/theme.ts`                 | star | -     |
| `src/theme_binding.ts`         | star | -     |
| `src/theme_interchange.ts`     | star | -     |
| `src/theme_expressions.ts`     | star | -     |
| `src/theme_contrast.ts`        | star | -     |
| `src/theme_oklch.ts`           | star | -     |
| `src/theme_controls.ts`        | star | -     |
| `src/theme_editor_model.ts`    | star | -     |
| `src/theme_engine_cache.ts`    | star | -     |
| `src/theme_engine_factory.ts`  | star | -     |
| `src/theme_engine_pipeline.ts` | star | -     |
| `src/theme_gallery.ts`         | star | -     |
| `src/grwizard_themes.ts`       | star | -     |
| `src/theme_resolver.ts`        | star | -     |
| `src/theme_workspace.ts`       | star | -     |

_No direct exported symbols._

### mod.three_ascii.ts

_Entrypoints: `./three-ascii`_

| Re-export Target                | Kind | Names |
| ------------------------------- | ---- | ----- |
| `src/three_ascii/mod.ts`        | star | -     |
| `src/canvas/three_ascii.ts`     | star | -     |
| `src/components/three_ascii.ts` | star | -     |

_No direct exported symbols._

### mod.ts

_Entrypoints: `.`_

| Re-export Target                        | Kind | Names |
| --------------------------------------- | ---- | ----- |
| `src/component.ts`                      | star | -     |
| `src/controls.ts`                       | star | -     |
| `src/event_emitter.ts`                  | star | -     |
| `src/focus.ts`                          | star | -     |
| `src/input.ts`                          | star | -     |
| `src/input_envelope.ts`                 | star | -     |
| `src/input_lifecycle.ts`                | star | -     |
| `src/pointer_input.ts`                  | star | -     |
| `src/keymap.ts`                         | star | -     |
| `src/keymap_layers.ts`                  | star | -     |
| `src/key_sequences.ts`                  | star | -     |
| `src/selection.ts`                      | star | -     |
| `src/permissions.ts`                    | star | -     |
| `src/secrets.ts`                        | star | -     |
| `src/theme.ts`                          | star | -     |
| `src/theme_tokens.ts`                   | star | -     |
| `src/theme_token_schemas.ts`            | star | -     |
| `src/theme_expressions.ts`              | star | -     |
| `src/theme_contrast.ts`                 | star | -     |
| `src/theme_oklch.ts`                    | star | -     |
| `src/theme_quantize.ts`                 | star | -     |
| `src/theme_density.ts`                  | star | -     |
| `src/theme_motion.ts`                   | star | -     |
| `src/surface_animation.ts`              | star | -     |
| `src/theme_icons.ts`                    | star | -     |
| `src/theme_interchange.ts`              | star | -     |
| `src/theme_binding.ts`                  | star | -     |
| `src/theme_engine_cache.ts`             | star | -     |
| `src/theme_engine_factory.ts`           | star | -     |
| `src/theme_engine_pipeline.ts`          | star | -     |
| `src/theme_gallery.ts`                  | star | -     |
| `src/grwizard_themes.ts`                | star | -     |
| `src/theme_resolver.ts`                 | star | -     |
| `src/theme_workspace.ts`                | star | -     |
| `src/api_stability.ts`                  | star | -     |
| `src/types.ts`                          | star | -     |
| `src/unicode/mod.ts`                    | star | -     |
| `src/visual/mod.ts`                     | star | -     |
| `src/tooling/mod.ts`                    | star | -     |
| `src/i18n/mod.ts`                       | star | -     |
| `src/view.ts`                           | star | -     |
| `src/viewport.ts`                       | star | -     |
| `src/tui.ts`                            | star | -     |
| `src/signals/mod.ts`                    | star | -     |
| `src/layout/mod.ts`                     | star | -     |
| `src/markup/mod.ts`                     | star | -     |
| `src/components/mod.ts`                 | star | -     |
| `src/canvas/mod.ts`                     | star | -     |
| `src/utils/mod.ts`                      | star | -     |
| `src/input_reader/mod.ts`               | star | -     |
| `src/app/mod.ts`                        | star | -     |
| `src/runtime/mod.ts`                    | star | -     |
| `src/testing/input.ts`                  | star | -     |
| `src/testing/snapshot.ts`               | star | -     |
| `src/perf/benchmark.ts`                 | star | -     |
| `src/perf/layout_benchmarks.ts`         | star | -     |
| `src/perf/pools.ts`                     | star | -     |
| `src/perf/profile_tuner.ts`             | star | -     |
| `src/perf/cache_budget.ts`              | star | -     |
| `src/perf/diff_planner.ts`              | star | -     |
| `src/perf/frame_cadence.ts`             | star | -     |
| `src/perf/frame_packets.ts`             | star | -     |
| `src/perf/incremental_serialization.ts` | star | -     |
| `src/perf/write_coalescer.ts`           | star | -     |
| `src/perf/entrypoint_budget.ts`         | star | -     |
| `src/perf/versioned_cache.ts`           | star | -     |

_No direct exported symbols._

### mod.web.ts

_Entrypoints: `./web`_

| Re-export Target                        | Kind  | Names                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/event_emitter.ts`                  | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/focus.ts`                          | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/selection.ts`                      | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/theme.ts`                          | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/theme_binding.ts`                  | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/theme_contrast.ts`                 | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/theme_density.ts`                  | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/theme_expressions.ts`              | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/theme_icons.ts`                    | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/theme_interchange.ts`              | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/theme_motion.ts`                   | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/theme_oklch.ts`                    | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/theme_quantize.ts`                 | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/theme_token_schemas.ts`            | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/theme_engine_cache.ts`             | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/theme_engine_factory.ts`           | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/theme_engine_pipeline.ts`          | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/theme_gallery.ts`                  | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/grwizard_themes.ts`                | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/theme_resolver.ts`                 | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/theme_workspace.ts`                | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/api_stability.ts`                  | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/viewport.ts`                       | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/view.ts`                           | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/signals/mod.ts`                    | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/layout/mod.ts`                     | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/markup/mod.ts`                     | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/components/mod.ts`                 | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/platform/types.ts`                 | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/i18n/mod.ts`                       | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/key_sequences.ts`                  | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/keymap.ts`                         | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/keymap_layers.ts`                  | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/permissions.ts`                    | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/surface_animation.ts`              | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/input_envelope.ts`                 | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/pointer_input.ts`                  | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/web/mod.ts`                        | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/remote/handshake.ts`               | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/perf/benchmark.ts`                 | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/perf/cache_budget.ts`              | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/perf/diff_planner.ts`              | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/perf/entrypoint_budget.ts`         | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/perf/frame_cadence.ts`             | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/perf/frame_packets.ts`             | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/perf/incremental_serialization.ts` | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/perf/layout_benchmarks.ts`         | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/perf/pools.ts`                     | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/perf/profile_tuner.ts`             | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/perf/versioned_cache.ts`           | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/perf/write_coalescer.ts`           | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/unicode/width.ts`                  | named | `CJK_WIDE_WIDTH_PROFILE`, `DEFAULT_TERMINAL_WIDTH_PROFILE_REGISTRY`, `TERMINAL_WIDTH_PROFILE_LIMITS`, `TerminalWidthError`, `TerminalWidthProfileRegistry`, `UNICODE_NARROW_WIDTH_PROFILE`, `UnicodeTerminalWidthProfile`, `VISIBLE_COMBINING_WIDTH_PROFILE`, `terminalCodePointWidth`, `terminalTextWidth`                                                                                            |
| `src/unicode/width.ts`                  | named | `type EastAsianWidthProperty`, `type TerminalCellWidth`, `type TerminalCodePointWidthInspection`, `type TerminalTextWidthInspection`, `type TerminalWidthCategory`, `type TerminalWidthErrorCode`, `type TerminalWidthPolicy`, `type TerminalWidthProfileDefinition`, `type TerminalWidthProfileInspection`, `type TerminalWidthProfileRegistryInspection`, `type TerminalWidthProfileRegistryOptions` |
| `src/canvas/mod.ts`                     | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/canvas/three_ascii.ts`             | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/app/mod.ts`                        | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/capabilities.ts`           | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/async_iterable.ts`         | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/clock.ts`                  | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/data_pipeline.ts`          | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/data_pipeline_bindings.ts` | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/data_query.ts`             | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/graphics_surface.ts`       | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/kitty_graphics.ts`         | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/profiles.ts`               | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/renderer_backends.ts`      | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/resource.ts`               | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/resource_bindings.ts`      | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/resource_cache.ts`         | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/resource_loads.ts`         | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/render_loop.ts`            | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/scheduler.ts`              | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/storage.ts`                | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/telemetry.ts`              | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/terminal_screen.ts`        | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/terminal_scrollback.ts`    | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/terminal_workspace.ts`     | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/runtime/worker_pool.ts`            | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/three_ascii/mod.ts`                | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/utils/async.ts`                    | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/utils/numbers.ts`                  | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/utils/sorted_array.ts`             | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/utils/strings.ts`                  | star  | -                                                                                                                                                                                                                                                                                                                                                                                                      |

_No direct exported symbols._

### src/api_stability.ts

_Entrypoints: `.`, `./web`_

| Symbol                            | Kind      | Type Only | JSDoc |
| --------------------------------- | --------- | --------- | ----- |
| `ApiStabilityTier`                | type      | yes       | yes   |
| `apiSurfacePolicies`              | const     | no        | yes   |
| `ApiSurfacePolicy`                | interface | yes       | yes   |
| `ApiSurfacePolicyQuery`           | interface | yes       | yes   |
| `filterApiSurfacePolicies`        | function  | no        | yes   |
| `filterPackageEntrypoints`        | function  | no        | yes   |
| `formatPackageEntrypointMarkdown` | function  | no        | yes   |
| `packageEntrypointFor`            | function  | no        | yes   |
| `PackageEntrypointManifest`       | interface | yes       | yes   |
| `PackageEntrypointQuery`          | interface | yes       | yes   |
| `packageEntrypoints`              | const     | no        | yes   |
| `packageReleasePolicy`            | const     | no        | yes   |
| `PackageReleasePolicy`            | interface | yes       | yes   |
| `PackageRuntime`                  | type      | yes       | yes   |

### src/app/accessibility_tree.ts

_Entrypoints: `.`, `./web`_

| Symbol                            | Kind      | Type Only | JSDoc |
| --------------------------------- | --------- | --------- | ----- |
| `AccessibilityNode`               | interface | yes       | yes   |
| `AccessibilityRole`               | type      | yes       | yes   |
| `TERMINAL_EXPOSABLE_SEMANTICS`    | const     | no        | yes   |
| `TerminalAccessibilityProjection` | interface | yes       | yes   |
| `toAriaAttributes`                | function  | no        | yes   |
| `toAriaTree`                      | function  | no        | yes   |
| `toTerminalProjection`            | function  | no        | yes   |

### src/app/action_journal_checkpoints.ts

_Entrypoints: `.`, `./web`_

| Symbol                                         | Kind      | Type Only | JSDoc |
| ---------------------------------------------- | --------- | --------- | ----- |
| `ACTION_JOURNAL_CHECKPOINT_HASH_ALGORITHM`     | const     | no        | yes   |
| `ACTION_JOURNAL_CHECKPOINT_SCHEMA_VERSION`     | const     | no        | yes   |
| `ActionJournalCheckpointCausalPosition`        | interface | yes       | yes   |
| `ActionJournalCheckpointComponent`             | interface | yes       | yes   |
| `ActionJournalCheckpointComponentInspection`   | interface | yes       | yes   |
| `ActionJournalCheckpointComponentRegistration` | interface | yes       | yes   |
| `ActionJournalCheckpointComponentState`        | interface | yes       | yes   |
| `ActionJournalCheckpointDiagnostic`            | interface | yes       | yes   |
| `ActionJournalCheckpointDiagnosticCode`        | type      | yes       | yes   |
| `ActionJournalCheckpointError`                 | class     | no        | yes   |
| `ActionJournalCheckpointErrorCode`             | type      | yes       | yes   |
| `actionJournalCheckpointHash`                  | function  | no        | yes   |
| `ActionJournalCheckpointMigration`             | interface | yes       | yes   |
| `ActionJournalCheckpointOperation`             | type      | yes       | yes   |
| `ActionJournalCheckpointRecord`                | interface | yes       | yes   |
| `ActionJournalCheckpointRegistry`              | class     | no        | yes   |
| `ActionJournalCheckpointRegistryInspection`    | interface | yes       | yes   |
| `ActionJournalCheckpointRegistryOptions`       | interface | yes       | yes   |
| `ActionJournalCheckpointReplayResult`          | interface | yes       | yes   |
| `ActionJournalCheckpointSelection`             | interface | yes       | yes   |
| `canonicalActionJournalCheckpointJson`         | function  | no        | yes   |
| `CaptureActionJournalCheckpointOptions`        | interface | yes       | yes   |
| `normalizeActionJournalCheckpoint`             | function  | no        | yes   |
| `parseActionJournalCheckpoint`                 | function  | no        | yes   |

### src/app/action_journal_retention.ts

_Entrypoints: `.`, `./web`_

| Symbol                                              | Kind      | Type Only | JSDoc |
| --------------------------------------------------- | --------- | --------- | ----- |
| `ACTION_JOURNAL_RETENTION_SCHEMA_VERSION`           | const     | no        | yes   |
| `ActionJournalRetentionBundle`                      | interface | yes       | yes   |
| `actionJournalRetentionCheckpointId`                | function  | no        | yes   |
| `actionJournalRetentionCompatibilityFromInspection` | function  | no        | yes   |
| `ActionJournalRetentionComponentCompatibility`      | interface | yes       | yes   |
| `actionJournalRetentionEntryId`                     | function  | no        | yes   |
| `ActionJournalRetentionError`                       | class     | no        | yes   |
| `ActionJournalRetentionErrorCode`                   | type      | yes       | yes   |
| `ActionJournalRetentionInput`                       | interface | yes       | yes   |
| `ActionJournalRetentionPlan`                        | interface | yes       | yes   |
| `ActionJournalRetentionPlanStatus`                  | type      | yes       | yes   |
| `ActionJournalRetentionPolicy`                      | interface | yes       | yes   |
| `ActionJournalRetentionReason`                      | type      | yes       | yes   |
| `ActionJournalRetentionResult`                      | interface | yes       | yes   |
| `ActionJournalRetentionStats`                       | interface | yes       | yes   |
| `ActionJournalRetentionUnsatisfiedConstraint`       | interface | yes       | yes   |
| `ActionJournalRetentionUnsatisfiedKind`             | type      | yes       | yes   |
| `canonicalActionJournalUtf8Bytes`                   | function  | no        | yes   |
| `executeActionJournalRetention`                     | function  | no        | yes   |
| `planActionJournalRetention`                        | function  | no        | yes   |
| `retainActionJournal`                               | function  | no        | yes   |

### src/app/action_journal.ts

_Entrypoints: `.`, `./web`_

| Symbol                           | Kind      | Type Only | JSDoc |
| -------------------------------- | --------- | --------- | ----- |
| `ACTION_JOURNAL_SCHEMA_VERSION`  | const     | no        | yes   |
| `ActionJournal`                  | class     | no        | yes   |
| `ActionJournalAppendOptions`     | interface | yes       | yes   |
| `ActionJournalCausality`         | interface | yes       | yes   |
| `ActionJournalEntry`             | interface | yes       | yes   |
| `ActionJournalError`             | class     | no        | yes   |
| `ActionJournalErrorCode`         | type      | yes       | yes   |
| `ActionJournalInspection`        | interface | yes       | yes   |
| `ActionJournalJsonValue`         | type      | yes       | yes   |
| `ActionJournalOptions`           | interface | yes       | yes   |
| `ActionJournalReducer`           | type      | yes       | yes   |
| `ActionJournalReplayResult`      | interface | yes       | yes   |
| `ActionJournalSnapshot`          | interface | yes       | yes   |
| `canonicalActionJournalJson`     | function  | no        | yes   |
| `normalizeActionJournalSnapshot` | function  | no        | yes   |
| `parseActionJournal`             | function  | no        | yes   |
| `replayActionJournal`            | function  | no        | yes   |

### src/app/action_policies.ts

_Entrypoints: `.`, `./web`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `ActionPolicy`           | interface | yes       | yes   |
| `ActionPolicyGate`       | class     | no        | yes   |
| `ActionVerdict`          | type      | yes       | yes   |
| `createActionPolicyGate` | function  | no        | yes   |

### src/app/actions.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                | Kind      | Type Only | JSDoc |
| --------------------- | --------- | --------- | ----- |
| `Action`              | interface | yes       | yes   |
| `ActionBus`           | class     | no        | yes   |
| `ActionBusInspection` | interface | yes       | yes   |
| `ActionDispatch`      | type      | yes       | yes   |
| `ActionHandler`       | type      | yes       | yes   |
| `ActionMiddleware`    | type      | yes       | yes   |
| `ActionOfType`        | type      | yes       | yes   |

### src/app/animated_background.ts

_Entrypoints: `.`, `./web`_

| Symbol                             | Kind      | Type Only | JSDoc |
| ---------------------------------- | --------- | --------- | ----- |
| `AnimatedBackground`               | interface | yes       | yes   |
| `animatedBackgroundAcceptsPicks`   | function  | no        | yes   |
| `AnimatedBackgroundAdvanceOptions` | interface | yes       | yes   |
| `AnimatedBackgroundCell`           | interface | yes       | yes   |
| `animatedBackgroundHasOverlay`     | function  | no        | yes   |
| `animatedBackgroundHasPresets`     | function  | no        | yes   |
| `animatedBackgroundIsDisposable`   | function  | no        | yes   |
| `AnimatedBackgroundOverlayCell`    | interface | yes       | yes   |
| `AnimatedBackgroundPoint`          | interface | yes       | yes   |
| `AnimatedBackgroundRgb`            | type      | yes       | yes   |
| `DisposableAnimatedBackground`     | interface | yes       | yes   |
| `InteractiveAnimatedBackground`    | interface | yes       | yes   |
| `mixAnimatedBackgroundRgb`         | function  | no        | yes   |
| `OverlayAnimatedBackground`        | interface | yes       | yes   |
| `PresetAnimatedBackground`         | interface | yes       | yes   |
| `releaseIdleAnimatedBackgrounds`   | function  | no        | yes   |

### src/app/app.ts

_Entrypoints: `.`, `./web`_

| Symbol                 | Kind      | Type Only | JSDoc |
| ---------------------- | --------- | --------- | ----- |
| `AppCommandInspection` | interface | yes       | yes   |
| `AppKeymapInspection`  | interface | yes       | yes   |
| `AppPlugin`            | interface | yes       | yes   |
| `AppPluginDisposer`    | type      | yes       | yes   |
| `AppPluginFactory`     | type      | yes       | yes   |
| `AppPluginInspection`  | interface | yes       | yes   |
| `AppPluginInstaller`   | type      | yes       | yes   |
| `AppPluginUseOptions`  | interface | yes       | yes   |
| `AppRouteInspection`   | interface | yes       | yes   |
| `createApp`            | function  | no        | yes   |
| `TuiApp`               | class     | no        | yes   |
| `TuiAppInspection`     | interface | yes       | yes   |
| `TuiAppOptions`        | interface | yes       | yes   |

### src/app/background_jobs.ts

_Entrypoints: `.`, `./web`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `BackgroundJobBody`          | type      | yes       | yes   |
| `BackgroundJobHandle`        | interface | yes       | yes   |
| `BackgroundJobManager`       | class     | no        | yes   |
| `BackgroundJobState`         | type      | yes       | yes   |
| `createBackgroundJobManager` | function  | no        | yes   |

### src/app/backgrounds/biomech_background.ts

_Entrypoints: `.`, `./web`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `ShellBiomechField`        | class     | no        | yes   |
| `ShellBiomechFieldOptions` | interface | yes       | yes   |

### src/app/backgrounds/circuit_background.ts

_Entrypoints: `.`, `./web`_

| Symbol                           | Kind      | Type Only | JSDoc |
| -------------------------------- | --------- | --------- | ----- |
| `ShellCircuitChipSnapshot`       | interface | yes       | yes   |
| `ShellCircuitField`              | class     | no        | yes   |
| `ShellCircuitFieldOptions`       | interface | yes       | yes   |
| `ShellCircuitInspection`         | interface | yes       | yes   |
| `ShellCircuitLedSnapshot`        | interface | yes       | yes   |
| `ShellCircuitOscillatorSnapshot` | interface | yes       | yes   |
| `ShellCircuitRailSnapshot`       | interface | yes       | yes   |
| `ShellCircuitTraceSnapshot`      | interface | yes       | yes   |

### src/app/backgrounds/contract.ts

_Entrypoints: `.`, `./web`_

| Symbol                          | Kind     | Type Only | JSDoc |
| ------------------------------- | -------- | --------- | ----- |
| `mixShellRgb`                   | function | no        | yes   |
| `ShellAnimatedBackground`       | type     | yes       | yes   |
| `ShellBackgroundAdvanceOptions` | type     | yes       | yes   |
| `ShellBackgroundCell`           | type     | yes       | yes   |
| `ShellBackgroundPoint`          | type     | yes       | yes   |
| `ShellDisposableBackground`     | type     | yes       | yes   |
| `ShellInteractiveBackground`    | type     | yes       | yes   |
| `ShellOverlayBackground`        | type     | yes       | yes   |
| `ShellOverlayCell`              | type     | yes       | yes   |
| `ShellPresetBackground`         | type     | yes       | yes   |

### src/app/backgrounds/fire_background.ts

_Entrypoints: `.`, `./web`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `ShellFireField`        | class     | no        | yes   |
| `ShellFireFieldOptions` | interface | yes       | yes   |
| `ShellFireInspection`   | interface | yes       | yes   |

### src/app/backgrounds/gpu_device.ts

_Entrypoints: `.`, `./web`_

| Symbol                  | Kind     | Type Only | JSDoc |
| ----------------------- | -------- | --------- | ----- |
| `destroyShellGpuDevice` | function | no        | yes   |
| `resetShellGpuDevice`   | function | no        | yes   |
| `setShellGpuLog`        | function | no        | yes   |
| `shellGpuDevice`        | function | no        | yes   |

### src/app/backgrounds/ivy_background.ts

_Entrypoints: `.`, `./web`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `ShellIvyCellSnapshot`   | interface | yes       | yes   |
| `ShellIvyField`          | class     | no        | yes   |
| `ShellIvyFieldOptions`   | interface | yes       | yes   |
| `ShellIvyInspection`     | interface | yes       | yes   |
| `ShellIvyOrnament`       | type      | yes       | yes   |
| `ShellIvyStrandSnapshot` | interface | yes       | yes   |

### src/app/backgrounds/jungle_background.ts

_Entrypoints: `.`, `./web`_

| Symbol             | Kind  | Type Only | JSDoc |
| ------------------ | ----- | --------- | ----- |
| `ShellJungleField` | class | no        | yes   |

### src/app/backgrounds/matrix_background.ts

_Entrypoints: `.`, `./web`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `ShellMatrixRainDropSnapshot` | interface | yes       | yes   |
| `ShellMatrixRainField`        | class     | no        | yes   |
| `ShellMatrixRainFieldOptions` | interface | yes       | yes   |
| `ShellMatrixRainInspection`   | interface | yes       | yes   |

### src/app/backgrounds/mod.ts

_Entrypoints: `.`, `./web`_

| Re-export Target                                  | Kind | Names |
| ------------------------------------------------- | ---- | ----- |
| `src/app/backgrounds/contract.ts`                 | star | -     |
| `src/app/backgrounds/gpu_device.ts`               | star | -     |
| `src/app/backgrounds/matrix_background.ts`        | star | -     |
| `src/app/backgrounds/rainy_windows_background.ts` | star | -     |
| `src/app/backgrounds/circuit_background.ts`       | star | -     |
| `src/app/backgrounds/biomech_background.ts`       | star | -     |
| `src/app/backgrounds/jungle_background.ts`        | star | -     |
| `src/app/backgrounds/vaporwave_background.ts`     | star | -     |
| `src/app/backgrounds/skull_background.ts`         | star | -     |
| `src/app/backgrounds/ivy_background.ts`           | star | -     |
| `src/app/backgrounds/fire_background.ts`          | star | -     |
| `src/app/backgrounds/turbulence_background.ts`    | star | -     |

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `SHELL_BACKGROUND_FIELDS` | const     | no        | yes   |
| `ShellBackgroundEntry`    | interface | yes       | yes   |

### src/app/backgrounds/rainy_windows_background.ts

_Entrypoints: `.`, `./web`_

| Symbol                          | Kind      | Type Only | JSDoc |
| ------------------------------- | --------- | --------- | ----- |
| `ShellRainyWindowsField`        | class     | no        | yes   |
| `ShellRainyWindowsFieldOptions` | interface | yes       | yes   |

### src/app/backgrounds/skull_background.ts

_Entrypoints: `.`, `./web`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `ShellSkullEyeInspection` | interface | yes       | yes   |
| `ShellSkullField`         | class     | no        | yes   |
| `ShellSkullFieldOptions`  | interface | yes       | yes   |
| `ShellSkullInspection`    | interface | yes       | yes   |

### src/app/backgrounds/turbulence_background.ts

_Entrypoints: `.`, `./web`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `ShellTurbulenceField`        | class     | no        | yes   |
| `ShellTurbulenceFieldOptions` | interface | yes       | yes   |

### src/app/backgrounds/vaporwave_background.ts

_Entrypoints: `.`, `./web`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `ShellVaporwaveField`        | class     | no        | yes   |
| `ShellVaporwaveFieldOptions` | interface | yes       | yes   |
| `ShellVaporwaveInspection`   | interface | yes       | yes   |

### src/app/browser_editing.ts

_Entrypoints: `.`, `./web`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `BrowserEditingAdapter`       | class     | no        | yes   |
| `BrowserEditingEvent`         | interface | yes       | yes   |
| `CanonicalEditingAction`      | interface | yes       | yes   |
| `createBrowserEditingAdapter` | function  | no        | yes   |

### src/app/calendar.ts

_Entrypoints: `.`, `./web`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `addCivilDays`             | function  | no        | yes   |
| `CalendarCell`             | interface | yes       | yes   |
| `CalendarController`       | class     | no        | yes   |
| `CalendarOptions`          | interface | yes       | yes   |
| `CivilDate`                | interface | yes       | yes   |
| `CivilDateRange`           | interface | yes       | yes   |
| `civilToJdn`               | function  | no        | yes   |
| `civilWeekday`             | function  | no        | yes   |
| `compareCivilDates`        | function  | no        | yes   |
| `createCalendarController` | function  | no        | yes   |
| `jdnToCivil`               | function  | no        | yes   |
| `localeWeekStart`          | function  | no        | yes   |

### src/app/clipboard.ts

_Entrypoints: `.`, `./web`_

| Symbol                          | Kind      | Type Only | JSDoc |
| ------------------------------- | --------- | --------- | ----- |
| `ClipboardPort`                 | interface | yes       | yes   |
| `createBrowserClipboard`        | function  | no        | yes   |
| `createCrossContainerSelection` | function  | no        | yes   |
| `createOsc52Clipboard`          | function  | no        | yes   |
| `CrossContainerSelection`       | class     | no        | yes   |
| `SelectableRegion`              | interface | yes       | yes   |
| `SelectionPoint`                | interface | yes       | yes   |

### src/app/code_view.ts

_Entrypoints: `.`, `./web`_

| Symbol               | Kind      | Type Only | JSDoc |
| -------------------- | --------- | --------- | ----- |
| `CodeDiagnostic`     | interface | yes       | yes   |
| `CodeSegment`        | interface | yes       | yes   |
| `CodeViewController` | class     | no        | yes   |
| `CodeViewRow`        | interface | yes       | yes   |
| `ConcealRule`        | interface | yes       | yes   |

### src/app/command_aliases.ts

_Entrypoints: `.`, `./web`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `AliasDiagnostic`         | interface | yes       | yes   |
| `CommandAlias`            | interface | yes       | yes   |
| `CommandAliasStore`       | class     | no        | yes   |
| `createCommandAliasStore` | function  | no        | yes   |

### src/app/command_arguments.ts

_Entrypoints: `.`, `./web`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `CommandPrompt`             | interface | yes       | yes   |
| `createSchemaCommandBinder` | function  | no        | yes   |
| `SchemaCommand`             | interface | yes       | yes   |
| `SchemaCommandBinder`       | class     | no        | yes   |

### src/app/command_bindings.ts

_Entrypoints: `.`, `./web`_

| Symbol                              | Kind      | Type Only | JSDoc |
| ----------------------------------- | --------- | --------- | ----- |
| `bindCommandKeymap`                 | function  | no        | yes   |
| `bindCommandKeys`                   | function  | no        | yes   |
| `bindCommandSurface`                | function  | no        | yes   |
| `commandForKeyEvent`                | function  | no        | yes   |
| `CommandKeyBindingConflict`         | interface | yes       | yes   |
| `CommandKeyBindingInspection`       | interface | yes       | yes   |
| `CommandKeyBindingMarkdownOptions`  | interface | yes       | yes   |
| `CommandKeyBindingOptions`          | interface | yes       | yes   |
| `CommandKeyBindingReport`           | interface | yes       | yes   |
| `CommandKeyBindingReportInspection` | interface | yes       | yes   |
| `CommandKeyBindingReportOptions`    | interface | yes       | yes   |
| `CommandKeymapBindingOptions`       | interface | yes       | yes   |
| `CommandKeyTarget`                  | interface | yes       | yes   |
| `CommandSearchMatch`                | interface | yes       | yes   |
| `CommandSearchOptions`              | interface | yes       | yes   |
| `CommandSurfaceController`          | interface | yes       | yes   |
| `CommandSurfaceItem`                | interface | yes       | yes   |
| `commandSurfaceItems`               | function  | no        | yes   |
| `CommandSurfaceOptions`             | interface | yes       | yes   |
| `createCommandKeyBindingReport`     | function  | no        | yes   |
| `createCommandSurface`              | function  | no        | yes   |
| `executeCommandSurfaceItem`         | function  | no        | yes   |
| `formatCommandKeyBindingMarkdown`   | function  | no        | yes   |
| `inspectCommandKeyBindings`         | function  | no        | yes   |
| `rankCommandSurfaceItems`           | function  | no        | yes   |
| `searchCommandSurfaceItems`         | function  | no        | yes   |

### src/app/command_history.ts

_Entrypoints: `.`, `./web`_

| Symbol                           | Kind      | Type Only | JSDoc |
| -------------------------------- | --------- | --------- | ----- |
| `CommandArgumentClassification`  | interface | yes       | yes   |
| `CommandHistoryRecord`           | interface | yes       | yes   |
| `CommandInvocationHistory`       | class     | no        | yes   |
| `createCommandInvocationHistory` | function  | no        | yes   |

### src/app/command_macros.ts

_Entrypoints: `.`, `./web`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `CommandMacro`               | interface | yes       | yes   |
| `CommandMacroRecorder`       | class     | no        | yes   |
| `createCommandMacroRecorder` | function  | no        | yes   |
| `MacroPlaybackPreview`       | interface | yes       | yes   |
| `MacroPlaybackResult`        | interface | yes       | yes   |
| `MacroStep`                  | interface | yes       | yes   |

### src/app/command_pipelines.ts

_Entrypoints: `.`, `./web`_

| Symbol                  | Kind     | Type Only | JSDoc |
| ----------------------- | -------- | --------- | ----- |
| `CommandPipeline`       | class    | no        | yes   |
| `createCommandPipeline` | function | no        | yes   |
| `PipelineNode`          | type     | yes       | yes   |
| `PipelineOutcome`       | type     | yes       | yes   |

### src/app/command_preview.ts

_Entrypoints: `.`, `./web`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `CommandChange`            | interface | yes       | yes   |
| `CommandChangeSet`         | interface | yes       | yes   |
| `CommandPreview`           | interface | yes       | yes   |
| `CommandPreviewGate`       | class     | no        | yes   |
| `createCommandPreviewGate` | function  | no        | yes   |
| `PreviewableCommand`       | interface | yes       | yes   |

### src/app/command_progress.ts

_Entrypoints: `.`, `./web`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `CommandProgressEvent`  | interface | yes       | yes   |
| `CommandProgressScope`  | class     | no        | yes   |
| `createCommandProgress` | function  | no        | yes   |

### src/app/command_search_index.ts

_Entrypoints: `.`, `./web`_

| Symbol                            | Kind      | Type Only | JSDoc |
| --------------------------------- | --------- | --------- | ----- |
| `CommandSearchIndex`              | interface | yes       | yes   |
| `CommandSearchIndexEntry`         | interface | yes       | yes   |
| `CommandSearchIndexField`         | interface | yes       | yes   |
| `CommandSearchIndexInspection`    | interface | yes       | yes   |
| `CommandSearchIndexOptions`       | interface | yes       | yes   |
| `createCommandSearchIndex`        | function  | no        | yes   |
| `createIndexedCommandSurface`     | function  | no        | yes   |
| `IndexedCommandSearchOptions`     | interface | yes       | yes   |
| `IndexedCommandSurfaceController` | interface | yes       | yes   |
| `IndexedCommandSurfaceInspection` | interface | yes       | yes   |
| `searchCommandSearchIndex`        | function  | no        | yes   |

### src/app/commands.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `Command`                   | interface | yes       | yes   |
| `CommandActionFactory`      | type      | yes       | yes   |
| `CommandDispatch`           | type      | yes       | yes   |
| `CommandInspection`         | interface | yes       | yes   |
| `CommandProjection`         | interface | yes       | yes   |
| `CommandRegistry`           | class     | no        | yes   |
| `CommandRegistryInspection` | interface | yes       | yes   |
| `CommandRegistryListener`   | type      | yes       | yes   |
| `insertUniqueSortedString`  | function  | no        | yes   |

### src/app/component_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol                            | Kind      | Type Only | JSDoc |
| --------------------------------- | --------- | --------- | ----- |
| `bindComponentCatalogCommands`    | function  | no        | yes   |
| `ComponentCatalogCommandAction`   | type      | yes       | yes   |
| `ComponentCatalogCommandOptions`  | interface | yes       | yes   |
| `componentCatalogCommands`        | function  | no        | yes   |
| `inspectComponentCatalogCommands` | function  | no        | yes   |

### src/app/compose_sequences.ts

_Entrypoints: `.`, `./web`_

| Symbol                           | Kind      | Type Only | JSDoc |
| -------------------------------- | --------- | --------- | ----- |
| `ComposeResult`                  | interface | yes       | yes   |
| `ComposeSequence`                | type      | yes       | yes   |
| `ComposeSequenceOptions`         | interface | yes       | yes   |
| `ComposeSequenceProcessor`       | class     | no        | yes   |
| `createComposeSequenceProcessor` | function  | no        | yes   |

### src/app/composition.ts

_Entrypoints: `.`, `./web`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `CompositionController`       | class     | no        | yes   |
| `CompositionEvent`            | interface | yes       | yes   |
| `CompositionState`            | interface | yes       | yes   |
| `CompositionTransaction`      | interface | yes       | yes   |
| `createCompositionController` | function  | no        | yes   |

### src/app/content_integrity.ts

_Entrypoints: `.`, `./web`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `ContentIntegrityGate`       | class     | no        | yes   |
| `createContentIntegrityGate` | function  | no        | yes   |
| `IntegrityExpectation`       | interface | yes       | yes   |
| `IntegrityResult`            | type      | yes       | yes   |
| `SignatureVerifier`          | type      | yes       | yes   |

### src/app/crash_recovery.ts

_Entrypoints: `.`, `./web`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `parseRecoveryJournal`  | function  | no        | yes   |
| `RecoveryRecord`        | interface | yes       | yes   |
| `RecoveryReplayOptions` | interface | yes       | yes   |
| `RecoveryReport`        | interface | yes       | yes   |
| `RecoveryStop`          | interface | yes       | yes   |
| `replayRecoveryJournal` | function  | no        | yes   |

### src/app/data_query_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol                             | Kind      | Type Only | JSDoc |
| ---------------------------------- | --------- | --------- | ----- |
| `bindDataQueryCommands`            | function  | no        | yes   |
| `bindDataQueryParams`              | function  | no        | yes   |
| `bindDataQueryResult`              | function  | no        | yes   |
| `bindDataQueryTable`               | function  | no        | yes   |
| `createDataQueryPlugin`            | function  | no        | yes   |
| `DataQueryAppPlugin`               | interface | yes       | yes   |
| `DataQueryCommandAction`           | type      | yes       | yes   |
| `DataQueryCommandKind`             | type      | yes       | yes   |
| `DataQueryCommandOptions`          | interface | yes       | yes   |
| `DataQueryCommandPayload`          | interface | yes       | yes   |
| `dataQueryCommands`                | function  | no        | yes   |
| `DataQueryParamsBindingHandle`     | type      | yes       | yes   |
| `DataQueryParamsBindingInspection` | interface | yes       | yes   |
| `DataQueryParamsBindingOptions`    | interface | yes       | yes   |
| `DataQueryPluginInspection`        | interface | yes       | yes   |
| `DataQueryPluginInstallContext`    | interface | yes       | yes   |
| `DataQueryPluginOptions`           | interface | yes       | yes   |
| `DataQueryResultBindingHandle`     | type      | yes       | yes   |
| `DataQueryResultBindingInspection` | interface | yes       | yes   |
| `DataQueryResultBindingOptions`    | interface | yes       | yes   |
| `DataQuerySortCommand`             | interface | yes       | yes   |
| `DataQueryTableBindingHandle`      | type      | yes       | yes   |
| `DataQueryTableBindingInspection`  | interface | yes       | yes   |
| `DataQueryTableBindingOptions`     | interface | yes       | yes   |

### src/app/data_table_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `bindDataTableCommands`   | function  | no        | yes   |
| `DataTableCommandKind`    | type      | yes       | yes   |
| `DataTableCommandOptions` | interface | yes       | yes   |
| `dataTableCommands`       | function  | no        | yes   |

### src/app/diff_view.ts

_Entrypoints: `.`, `./web`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `diffLines`             | function  | no        | yes   |
| `DiffOp`                | interface | yes       | yes   |
| `formatLineNumber`      | function  | no        | yes   |
| `GutterCell`            | interface | yes       | yes   |
| `signGlyph`             | function  | no        | yes   |
| `SplitDiffController`   | class     | no        | yes   |
| `UnifiedDiffController` | class     | no        | yes   |

### src/app/disposables.ts

_Entrypoints: `.`, `./web`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `createDisposableStack`     | function  | no        | yes   |
| `DisposableStack`           | class     | no        | yes   |
| `DisposableStackInspection` | interface | yes       | yes   |
| `Disposer`                  | type      | yes       | yes   |
| `disposeReverse`            | function  | no        | yes   |
| `MaybeDisposer`             | type      | yes       | yes   |

### src/app/drag_drop.ts

_Entrypoints: `.`, `./web`_

| Symbol                 | Kind      | Type Only | JSDoc |
| ---------------------- | --------- | --------- | ----- |
| `AcceptedDrop`         | interface | yes       | yes   |
| `adaptBrowserDrop`     | function  | no        | yes   |
| `adaptTerminalDrop`    | function  | no        | yes   |
| `createDragDropRouter` | function  | no        | yes   |
| `DragDropEvent`        | interface | yes       | yes   |
| `DragDropRouter`       | class     | no        | yes   |
| `DragFileEntry`        | interface | yes       | yes   |
| `DragPayload`          | type      | yes       | yes   |
| `DropOutcome`          | type      | yes       | yes   |
| `DropPolicy`           | type      | yes       | yes   |

### src/app/event_timeline.ts

_Entrypoints: `.`, `./web`_

| Symbol                          | Kind      | Type Only | JSDoc |
| ------------------------------- | --------- | --------- | ----- |
| `createEventTimelineController` | function  | no        | yes   |
| `EventTimelineController`       | class     | no        | yes   |
| `EventTimelineOptions`          | interface | yes       | yes   |
| `TimelineEvent`                 | interface | yes       | yes   |
| `TimelineRow`                   | type      | yes       | yes   |
| `TimelineView`                  | interface | yes       | yes   |

### src/app/focus_announcements.ts

_Entrypoints: `.`, `./web`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `FOCUS_TRANSITION_SPEC` | const     | no        | yes   |
| `FocusRule`             | type      | yes       | yes   |
| `FocusTransitionKind`   | type      | yes       | yes   |
| `FocusTransitionSpec`   | interface | yes       | yes   |
| `ResolvedTransition`    | interface | yes       | yes   |
| `resolveTransition`     | function  | no        | yes   |

### src/app/focus_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol                | Kind      | Type Only | JSDoc |
| --------------------- | --------- | --------- | ----- |
| `bindFocusCommands`   | function  | no        | yes   |
| `FocusCommandAction`  | type      | yes       | yes   |
| `FocusCommandKind`    | type      | yes       | yes   |
| `FocusCommandOptions` | interface | yes       | yes   |
| `FocusCommandPayload` | interface | yes       | yes   |
| `focusCommands`       | function  | no        | yes   |
| `FocusCommandTarget`  | interface | yes       | yes   |

### src/app/form_async_validation.ts

_Entrypoints: `.`, `./web`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `AsyncFieldValidator`        | type      | yes       | yes   |
| `AsyncSchemaValidator`       | type      | yes       | yes   |
| `createFormAsyncValidation`  | function  | no        | yes   |
| `FormAsyncSettleResult`      | interface | yes       | yes   |
| `FormAsyncValidation`        | class     | no        | yes   |
| `FormAsyncValidationContext` | interface | yes       | yes   |

### src/app/form_checkpoints.ts

_Entrypoints: `.`, `./web`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `createFormCheckpointHistory` | function  | no        | yes   |
| `FormCheckpointHistory`       | class     | no        | yes   |
| `FormCheckpointOptions`       | interface | yes       | yes   |
| `FormEditKind`                | type      | yes       | yes   |

### src/app/form_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `bindFormCommands`           | function  | no        | yes   |
| `FormCommandAction`          | type      | yes       | yes   |
| `FormCommandKind`            | type      | yes       | yes   |
| `FormCommandOptions`         | interface | yes       | yes   |
| `formCommands`               | function  | no        | yes   |
| `FormCommandSnapshotPayload` | interface | yes       | yes   |
| `FormFieldCommandPayload`    | interface | yes       | yes   |

### src/app/form_dependencies.ts

_Entrypoints: `.`, `./web`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `createFormDependencyGraph` | function  | no        | yes   |
| `FormDependencyGraph`       | class     | no        | yes   |
| `FormDependencyUpdate`      | interface | yes       | yes   |
| `FormFieldRule`             | interface | yes       | yes   |
| `FormFieldUiState`          | interface | yes       | yes   |

### src/app/form_drafts.ts

_Entrypoints: `.`, `./web`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `createFormDraftAutosaver` | function  | no        | yes   |
| `DraftStorage`             | interface | yes       | yes   |
| `FormDraftAutosaver`       | class     | no        | yes   |
| `FormDraftOptions`         | interface | yes       | yes   |
| `RestoredDraft`            | interface | yes       | yes   |

### src/app/form_paths.ts

_Entrypoints: `.`, `./web`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `deleteFormPath`        | function  | no        | yes   |
| `DeleteFormPathOptions` | interface | yes       | yes   |
| `FORM_PATH_LIMITS`      | const     | no        | yes   |
| `formatFormPath`        | function  | no        | yes   |
| `FormFieldReference`    | type      | yes       | yes   |
| `FormFieldValue`        | type      | yes       | yes   |
| `formPath`              | function  | no        | yes   |
| `FormPath`              | interface | yes       | yes   |
| `FormPathBuilder`       | interface | yes       | yes   |
| `FormPathError`         | class     | no        | yes   |
| `FormPathErrorCode`     | type      | yes       | yes   |
| `formPathFor`           | function  | no        | yes   |
| `FormPathName`          | type      | yes       | yes   |
| `FormPathSegment`       | type      | yes       | yes   |
| `formPathSegments`      | function  | no        | yes   |
| `FormPathSegments`      | type      | yes       | yes   |
| `FormPathValue`         | type      | yes       | yes   |
| `FormValuesPatch`       | type      | yes       | yes   |
| `getFormPath`           | function  | no        | yes   |
| `hasFormPath`           | function  | no        | yes   |
| `isFormPath`            | function  | no        | yes   |
| `parseFormPath`         | function  | no        | yes   |
| `setFormPath`           | function  | no        | yes   |

### src/app/form_schema.ts

_Entrypoints: `.`, `./web`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `renderJsonSchemaForm`  | function  | no        | yes   |
| `SchemaDiagnostic`      | interface | yes       | yes   |
| `SchemaFormField`       | interface | yes       | yes   |
| `SchemaValidationError` | interface | yes       | yes   |
| `SchemaWidgetResolver`  | type      | yes       | yes   |
| `validateAgainstSchema` | function  | no        | yes   |

### src/app/form_server_errors.ts

_Entrypoints: `.`, `./web`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `focusNextFormError`     | function  | no        | yes   |
| `FormErrorFocusTarget`   | interface | yes       | yes   |
| `FormServerError`        | interface | yes       | yes   |
| `FormServerErrorMapping` | interface | yes       | yes   |
| `mapFormServerErrors`    | function  | no        | yes   |

### src/app/form_submission.ts

_Entrypoints: `.`, `./web`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `createFormSubmissionMachine` | function  | no        | yes   |
| `FormSubmissionMachine`       | class     | no        | yes   |
| `FormSubmissionOutcome`       | interface | yes       | yes   |
| `FormSubmissionState`         | type      | yes       | yes   |
| `FormSubmissionTransition`    | interface | yes       | yes   |
| `FormSubmitHandler`           | type      | yes       | yes   |

### src/app/form_validation_timing.ts

_Entrypoints: `.`, `./web`_

| Symbol                           | Kind      | Type Only | JSDoc |
| -------------------------------- | --------- | --------- | ----- |
| `createFormValidationScheduler`  | function  | no        | yes   |
| `FormValidationRun`              | interface | yes       | yes   |
| `FormValidationScheduler`        | class     | no        | yes   |
| `FormValidationSchedulerOptions` | interface | yes       | yes   |
| `FormValidationTiming`           | type      | yes       | yes   |

### src/app/forms.ts

_Entrypoints: `.`, `./web`_

| Symbol                             | Kind      | Type Only | JSDoc |
| ---------------------------------- | --------- | --------- | ----- |
| `bindFormField`                    | function  | no        | yes   |
| `FieldName`                        | type      | yes       | yes   |
| `FieldValidator`                   | type      | yes       | yes   |
| `FORM_FIELD_ARRAY_LIMITS`          | const     | no        | yes   |
| `FormController`                   | class     | no        | yes   |
| `FormControllerOptions`            | interface | yes       | yes   |
| `FormErrorSummaryItem`             | interface | yes       | yes   |
| `FormField`                        | interface | yes       | yes   |
| `FormFieldArrayChange`             | interface | yes       | yes   |
| `FormFieldArrayController`         | class     | no        | yes   |
| `FormFieldArrayDuplicateOptions`   | interface | yes       | yes   |
| `FormFieldArrayHistoryOptions`     | interface | yes       | yes   |
| `FormFieldArrayHistoryTransaction` | interface | yes       | yes   |
| `FormFieldArrayIdContext`          | interface | yes       | yes   |
| `FormFieldArrayIdProvider`         | type      | yes       | yes   |
| `FormFieldArrayIdReason`           | type      | yes       | yes   |
| `FormFieldArrayInspection`         | interface | yes       | yes   |
| `FormFieldArrayItemId`             | type      | yes       | yes   |
| `FormFieldArrayItemInspection`     | interface | yes       | yes   |
| `FormFieldArrayItemMetadata`       | interface | yes       | yes   |
| `FormFieldArrayItemMetadataPatch`  | interface | yes       | yes   |
| `FormFieldArrayOperation`          | type      | yes       | yes   |
| `FormFieldArrayOptions`            | interface | yes       | yes   |
| `FormFieldBindingOptions`          | interface | yes       | yes   |
| `FormFieldInspection`              | interface | yes       | yes   |
| `FormFieldState`                   | type      | yes       | yes   |
| `FormGroupInspection`              | interface | yes       | yes   |
| `FormInspection`                   | interface | yes       | yes   |
| `FormSchemaAdapter`                | interface | yes       | yes   |
| `FormSchemaValidationErrors`       | type      | yes       | yes   |
| `FormSnapshot`                     | interface | yes       | yes   |
| `FormSubmitResult`                 | interface | yes       | yes   |
| `FormValues`                       | type      | yes       | yes   |
| `minLength`                        | function  | no        | yes   |
| `required`                         | function  | no        | yes   |

### src/app/general_widgets.ts

_Entrypoints: `.`, `./web`_

| Symbol                      | Kind     | Type Only | JSDoc |
| --------------------------- | -------- | --------- | ----- |
| `CollapsibleController`     | class    | no        | yes   |
| `ContentSwitcherController` | class    | no        | yes   |
| `LoadingController`         | class    | no        | yes   |
| `MaskedInputController`     | class    | no        | yes   |
| `renderDigits`              | function | no        | yes   |
| `SelectionListController`   | class    | no        | yes   |

### src/app/gestures.ts

_Entrypoints: `.`, `./web`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `createGestureRecognizer` | function  | no        | yes   |
| `GestureEvent`            | type      | yes       | yes   |
| `GestureOptions`          | interface | yes       | yes   |
| `GesturePointerEvent`     | interface | yes       | yes   |
| `GestureRecognizer`       | class     | no        | yes   |

### src/app/hex_viewer.ts

_Entrypoints: `.`, `./web`_

| Symbol                | Kind      | Type Only | JSDoc |
| --------------------- | --------- | --------- | ----- |
| `HexRow`              | interface | yes       | yes   |
| `HexViewerController` | class     | no        | yes   |
| `HexViewOptions`      | interface | yes       | yes   |

### src/app/history_branches.ts

_Entrypoints: `.`, `./web`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `BranchingHistory`       | class     | no        | yes   |
| `createBranchingHistory` | function  | no        | yes   |
| `HistoryDivergence`      | interface | yes       | yes   |

### src/app/history.ts

_Entrypoints: `.`, `./web`_

| Symbol                                 | Kind      | Type Only | JSDoc |
| -------------------------------------- | --------- | --------- | ----- |
| `bindHistoryCommands`                  | function  | no        | yes   |
| `bindRouteHistory`                     | function  | no        | yes   |
| `HistoryBusyError`                     | class     | no        | yes   |
| `HistoryCoalescingMetadata`            | interface | yes       | yes   |
| `HistoryCoalescingOptions`             | interface | yes       | yes   |
| `HistoryCommandKind`                   | type      | yes       | yes   |
| `HistoryCommandOptions`                | interface | yes       | yes   |
| `historyCommands`                      | function  | no        | yes   |
| `HistoryCompensationFailureInspection` | interface | yes       | yes   |
| `HistoryEntryInspection`               | interface | yes       | yes   |
| `HistoryErrorCode`                     | type      | yes       | yes   |
| `HistoryErrorInspection`               | interface | yes       | yes   |
| `HistoryFailureInspection`             | interface | yes       | yes   |
| `HistoryInspection`                    | interface | yes       | yes   |
| `HistoryOperationDirection`            | type      | yes       | yes   |
| `HistoryOperationError`                | class     | no        | yes   |
| `HistoryOperationPhase`                | type      | yes       | yes   |
| `HistoryPoisonedError`                 | class     | no        | yes   |
| `HistoryPoisonInspection`              | interface | yes       | yes   |
| `HistoryPoisonReason`                  | type      | yes       | yes   |
| `HistoryPoisonRecoveryPolicy`          | type      | yes       | yes   |
| `HistoryReplayBarrierInspection`       | interface | yes       | yes   |
| `HistoryReplaySafetyError`             | class     | no        | yes   |
| `HistoryReplaySafetyMetadata`          | interface | yes       | yes   |
| `HistoryReplayStrategy`                | type      | yes       | yes   |
| `HistoryScopeError`                    | class     | no        | yes   |
| `HistoryStack`                         | class     | no        | yes   |
| `HistoryStackError`                    | class     | no        | yes   |
| `HistoryStackOptions`                  | interface | yes       | yes   |
| `HistoryTransaction`                   | interface | yes       | yes   |
| `HistoryTransactionAbortedError`       | class     | no        | yes   |
| `HistoryTransactionOptions`            | interface | yes       | yes   |
| `HistoryTransactionScope`              | interface | yes       | yes   |
| `HistoryTransactionScopeInspection`    | interface | yes       | yes   |
| `RouteHistoryBindingOptions`           | interface | yes       | yes   |
| `SynchronousHistoryTransaction`        | interface | yes       | yes   |
| `SynchronousHistoryTransactionScope`   | interface | yes       | yes   |

### src/app/hit_targets.ts

_Entrypoints: `.`, `./web`_

| Symbol       | Kind     | Type Only | JSDoc |
| ------------ | -------- | --------- | ----- |
| `clipRect`   | function | no        | yes   |
| `contains`   | function | no        | yes   |
| `inset`      | function | no        | yes   |
| `intersects` | function | no        | yes   |

### src/app/input_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol                | Kind      | Type Only | JSDoc |
| --------------------- | --------- | --------- | ----- |
| `bindInputCommands`   | function  | no        | yes   |
| `InputCommandAction`  | type      | yes       | yes   |
| `InputCommandKind`    | type      | yes       | yes   |
| `InputCommandOptions` | interface | yes       | yes   |
| `InputCommandPayload` | interface | yes       | yes   |
| `inputCommands`       | function  | no        | yes   |

### src/app/journal_store.ts

_Entrypoints: `.`, `./web`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `createRedactingJournalStore` | function  | no        | yes   |
| `JournalLoadReport`           | interface | yes       | yes   |
| `JournalSaveReport`           | interface | yes       | yes   |
| `JournalStoreIo`              | interface | yes       | yes   |
| `JournalStoreOptions`         | interface | yes       | yes   |
| `RedactingJournalStore`       | class     | no        | yes   |

### src/app/kanban.ts

_Entrypoints: `.`, `./web`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `CardPosition`           | interface | yes       | yes   |
| `createKanbanController` | function  | no        | yes   |
| `KanbanCard`             | interface | yes       | yes   |
| `KanbanColumn`           | interface | yes       | yes   |
| `KanbanController`       | class     | no        | yes   |
| `MoveHandle`             | interface | yes       | yes   |
| `MoveResult`             | type      | yes       | yes   |

### src/app/list_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol               | Kind      | Type Only | JSDoc |
| -------------------- | --------- | --------- | ----- |
| `bindListCommands`   | function  | no        | yes   |
| `ListCommandAction`  | type      | yes       | yes   |
| `ListCommandKind`    | type      | yes       | yes   |
| `ListCommandOptions` | interface | yes       | yes   |
| `ListCommandPayload` | interface | yes       | yes   |
| `listCommands`       | function  | no        | yes   |

### src/app/log_viewer_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `bindLogViewerCommands`   | function  | no        | yes   |
| `LogViewerCommandAction`  | type      | yes       | yes   |
| `LogViewerCommandKind`    | type      | yes       | yes   |
| `LogViewerCommandOptions` | interface | yes       | yes   |
| `LogViewerCommandPayload` | interface | yes       | yes   |
| `logViewerCommands`       | function  | no        | yes   |

### src/app/menu_bar_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `bindMenuBarCommands`   | function  | no        | yes   |
| `MenuBarCommandAction`  | type      | yes       | yes   |
| `MenuBarCommandKind`    | type      | yes       | yes   |
| `MenuBarCommandOptions` | interface | yes       | yes   |
| `MenuBarCommandPayload` | interface | yes       | yes   |
| `menuBarCommands`       | function  | no        | yes   |

### src/app/metric_series_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `bindMetricSeriesCommands`   | function  | no        | yes   |
| `MetricSeriesCommandAction`  | type      | yes       | yes   |
| `MetricSeriesCommandKind`    | type      | yes       | yes   |
| `MetricSeriesCommandOptions` | interface | yes       | yes   |
| `MetricSeriesCommandPayload` | interface | yes       | yes   |
| `metricSeriesCommands`       | function  | no        | yes   |

### src/app/mod.ts

_Entrypoints: `.`, `./web`_

| Re-export Target                        | Kind  | Names                                                                                                                                                                                                                                                                 |
| --------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/actions.ts`                    | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/action_journal.ts`             | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/action_journal_checkpoints.ts` | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/action_journal_retention.ts`   | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/app.ts`                        | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/component_commands.ts`         | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/command_bindings.ts`           | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/command_search_index.ts`       | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/commands.ts`                   | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/data_query_commands.ts`        | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/data_table_commands.ts`        | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/disposables.ts`                | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/browser_editing.ts`            | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/compose_sequences.ts`          | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/preedit_provider.ts`           | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/crash_recovery.ts`             | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/history_branches.ts`           | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/journal_store.ts`              | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/navigation_blockers.ts`        | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/navigation_journal.ts`         | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/route_anchors.ts`              | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/route_boundaries.ts`           | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/route_guards.ts`               | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/route_loaders.ts`              | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/route_outlets.ts`              | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/route_prefetch.ts`             | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/action_policies.ts`            | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/accessibility_tree.ts`         | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/focus_announcements.ts`        | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/workbench_accessibility.ts`    | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/workbench_shell.ts`            | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/shell_background.ts`           | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/shell_theme.ts`                | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/backgrounds/mod.ts`            | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/shell_presenter.ts`            | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/calendar.ts`                   | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/clipboard.ts`                  | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/general_widgets.ts`            | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/content_integrity.ts`          | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/time_picker.ts`                | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/token_editor.ts`               | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/transfer_list.ts`              | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/tree_grid.ts`                  | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/syntax_service.ts`             | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/code_view.ts`                  | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/diff_view.ts`                  | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/structure_inspector.ts`        | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/hex_viewer.ts`                 | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/background_jobs.ts`            | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/command_aliases.ts`            | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/command_arguments.ts`          | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/command_history.ts`            | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/command_macros.ts`             | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/command_pipelines.ts`          | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/command_preview.ts`            | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/command_progress.ts`           | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/typed_commands.ts`             | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/composition.ts`                | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/form_async_validation.ts`      | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/form_server_errors.ts`         | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/form_submission.ts`            | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/form_validation_timing.ts`     | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/form_commands.ts`              | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/form_dependencies.ts`          | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/form_checkpoints.ts`           | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/drag_drop.ts`                  | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/event_timeline.ts`             | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/kanban.ts`                     | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/gestures.ts`                   | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/form_drafts.ts`                | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/form_schema.ts`                | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/focus_commands.ts`             | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/form_paths.ts`                 | named | `FORM_PATH_LIMITS`, `FormPathError`, `deleteFormPath`, `formPath`, `formPathFor`, `formPathSegments`, `formatFormPath`, `getFormPath`, `hasFormPath`, `isFormPath`, `parseFormPath`, `setFormPath`                                                                    |
| `src/app/form_paths.ts`                 | named | `type DeleteFormPathOptions`, `type FormFieldReference`, `type FormFieldValue`, `type FormPath`, `type FormPathBuilder`, `type FormPathErrorCode`, `type FormPathName`, `type FormPathSegment`, `type FormPathSegments`, `type FormPathValue`, `type FormValuesPatch` |
| `src/app/forms.ts`                      | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/history.ts`                    | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/input_commands.ts`             | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/list_commands.ts`              | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/log_viewer_commands.ts`        | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/menu_bar_commands.ts`          | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/metric_series_commands.ts`     | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/mouse_bindings.ts`             | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/pointer_gestures.ts`           | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/theme_editor.ts`               | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/pad_commands.ts`               | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/plugins.ts`                    | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/plugin_slot_adapters.ts`       | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/plugin_activation.ts`          | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/plugin_catalog.ts`             | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/plugin_capabilities.ts`        | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/plugin_compat.ts`              | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/plugin_dependencies.ts`        | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/plugin_lifecycle.ts`           | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/plugin_state_migration.ts`     | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/plugin_rpc_proxies.ts`         | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/plugin_manifest.ts`            | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/plugin_permission_diff.ts`     | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/worker_plugin_host.ts`         | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/plugin_slots.ts`               | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/property_grid.ts`              | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/router.ts`                     | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/route_patterns.ts`             | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/runtime_commands.ts`           | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/screen_persistence.ts`         | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/screen_router.ts`              | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/screens.ts`                    | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/scroll_area_commands.ts`       | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/selection_bindings.ts`         | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/settings_bindings.ts`          | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/settings.ts`                   | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/split_pane_commands.ts`        | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/table_commands.ts`             | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/tabs_commands.ts`              | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/terminal_commands.ts`          | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/paste_stream.ts`               | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/terminal_input.ts`             | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/theme_commands.ts`             | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/theme_plugin.ts`               | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/toast_commands.ts`             | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/tree_commands.ts`              | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/window_manager_commands.ts`    | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/widget_commands.ts`            | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/workbench/mod.ts`              | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/software_cursor.ts`            | star  | -                                                                                                                                                                                                                                                                     |
| `src/app/animated_background.ts`        | star  | -                                                                                                                                                                                                                                                                     |

_No direct exported symbols._

### src/app/mouse_bindings.ts

_Entrypoints: `.`, `./web`_

| Symbol                             | Kind      | Type Only | JSDoc |
| ---------------------------------- | --------- | --------- | ----- |
| `bindMouseInteractions`            | function  | no        | yes   |
| `createMouseInteractionRouter`     | function  | no        | yes   |
| `MouseInteractionContext`          | interface | yes       | yes   |
| `MouseInteractionDispatchResult`   | interface | yes       | yes   |
| `MouseInteractionEvent`            | type      | yes       | yes   |
| `MouseInteractionHandler`          | type      | yes       | yes   |
| `MouseInteractionInspection`       | interface | yes       | yes   |
| `MouseInteractionKind`             | type      | yes       | yes   |
| `MouseInteractionRegionClassifier` | type      | yes       | yes   |
| `MouseInteractionResolution`       | interface | yes       | yes   |
| `MouseInteractionRouter`           | class     | no        | yes   |
| `MouseInteractionRouterOptions`    | interface | yes       | yes   |
| `MouseInteractionTarget`           | interface | yes       | yes   |
| `MouseInteractionTransform`        | type      | yes       | yes   |

### src/app/navigation_blockers.ts

_Entrypoints: `.`, `./web`_

| Symbol                            | Kind      | Type Only | JSDoc |
| --------------------------------- | --------- | --------- | ----- |
| `createNavigationBlockerRegistry` | function  | no        | yes   |
| `NavigationBlocker`               | type      | yes       | yes   |
| `NavigationBlockerRegistry`       | class     | no        | yes   |
| `NavigationBlockOutcome`          | interface | yes       | yes   |
| `NavigationBlockReason`           | interface | yes       | yes   |
| `NavigationConfirmer`             | type      | yes       | yes   |

### src/app/navigation_journal.ts

_Entrypoints: `.`, `./web`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `createNavigationJournal`  | function  | no        | yes   |
| `NavigationJournal`        | class     | no        | yes   |
| `NavigationJournalOptions` | interface | yes       | yes   |
| `NavigationLocation`       | interface | yes       | yes   |

### src/app/pad_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol              | Kind      | Type Only | JSDoc |
| ------------------- | --------- | --------- | ----- |
| `bindPadCommands`   | function  | no        | yes   |
| `PadCommandAction`  | type      | yes       | yes   |
| `PadCommandKind`    | type      | yes       | yes   |
| `PadCommandOptions` | interface | yes       | yes   |
| `PadCommandPayload` | interface | yes       | yes   |
| `padCommands`       | function  | no        | yes   |

### src/app/paste_stream.ts

_Entrypoints: `.`, `./web`_

| Symbol                          | Kind      | Type Only | JSDoc |
| ------------------------------- | --------- | --------- | ----- |
| `openTerminalPasteTransaction`  | function  | no        | yes   |
| `streamTerminalPaste`           | function  | no        | yes   |
| `TerminalPasteLimits`           | interface | yes       | yes   |
| `TerminalPasteStreamController` | class     | no        | yes   |
| `TerminalPasteTransaction`      | interface | yes       | yes   |

### src/app/plugin_activation.ts

_Entrypoints: `.`, `./web`_

| Symbol                              | Kind      | Type Only | JSDoc |
| ----------------------------------- | --------- | --------- | ----- |
| `ActivationEventKind`               | type      | yes       | yes   |
| `ActivationFireResult`              | interface | yes       | yes   |
| `ActivationState`                   | type      | yes       | yes   |
| `createPluginActivationCoordinator` | function  | no        | yes   |
| `LazyPlugin`                        | interface | yes       | yes   |
| `PluginActivationCoordinator`       | class     | no        | yes   |

### src/app/plugin_capabilities.ts

_Entrypoints: `.`, `./web`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `CapabilityPluginDefinition`   | interface | yes       | yes   |
| `createPluginCapabilityBroker` | function  | no        | yes   |
| `PluginCapabilityBroker`       | class     | no        | yes   |
| `PluginCapabilityName`         | type      | yes       | yes   |
| `PluginInstallResult`          | type      | yes       | yes   |

### src/app/plugin_catalog.ts

_Entrypoints: `.`, `./web`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `CatalogEntry`                | interface | yes       | yes   |
| `CatalogLoadResult`           | type      | yes       | yes   |
| `createPluginCatalogConsumer` | function  | no        | yes   |
| `PackageVerification`         | type      | yes       | yes   |
| `PluginCatalog`               | interface | yes       | yes   |
| `PluginCatalogConsumer`       | class     | no        | yes   |

### src/app/plugin_compat.ts

_Entrypoints: `.`, `./web`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `CandidateRejection`         | interface | yes       | yes   |
| `CompatResolution`           | type      | yes       | yes   |
| `HostEnvironment`            | interface | yes       | yes   |
| `PluginCandidate`            | interface | yes       | yes   |
| `resolvePluginCompatibility` | function  | no        | yes   |

### src/app/plugin_dependencies.ts

_Entrypoints: `.`, `./web`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `DependencyDiagnostic`      | interface | yes       | yes   |
| `DependencyResolution`      | interface | yes       | yes   |
| `PluginDependencyNode`      | interface | yes       | yes   |
| `resolvePluginDependencies` | function  | no        | yes   |

### src/app/plugin_lifecycle.ts

_Entrypoints: `.`, `./web`_

| Symbol                           | Kind      | Type Only | JSDoc |
| -------------------------------- | --------- | --------- | ----- |
| `createHostContributionRegistry` | function  | no        | yes   |
| `disablePlugin`                  | function  | no        | yes   |
| `enablePlugin`                   | function  | no        | yes   |
| `HostContributionRegistry`       | class     | no        | yes   |
| `installPlugin`                  | function  | no        | yes   |
| `LifecyclePlugin`                | interface | yes       | yes   |
| `LifecycleResult`                | type      | yes       | yes   |
| `PluginContribution`             | interface | yes       | yes   |
| `uninstallPlugin`                | function  | no        | yes   |

### src/app/plugin_manifest.ts

_Entrypoints: `.`, `./web`_

| Symbol                           | Kind      | Type Only | JSDoc |
| -------------------------------- | --------- | --------- | ----- |
| `hostApiSatisfies`               | function  | no        | yes   |
| `parsePluginManifest`            | function  | no        | yes   |
| `PLUGIN_MANIFEST_SCHEMA_VERSION` | const     | no        | yes   |
| `PluginContributions`            | interface | yes       | yes   |
| `PluginManifest`                 | interface | yes       | yes   |
| `PluginManifestError`            | class     | no        | yes   |
| `PluginStateFieldKind`           | type      | yes       | yes   |
| `validatePluginManifest`         | function  | no        | yes   |

### src/app/plugin_permission_diff.ts

_Entrypoints: `.`, `./web`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `createPluginPermissionLedger` | function  | no        | yes   |
| `PermissionApplyResult`        | type      | yes       | yes   |
| `PermissionDiff`               | interface | yes       | yes   |
| `PermissionDiffEntry`          | interface | yes       | yes   |
| `PluginPermissionLedger`       | class     | no        | yes   |

### src/app/plugin_rpc_proxies.ts

_Entrypoints: `.`, `./web`_

| Symbol                            | Kind      | Type Only | JSDoc |
| --------------------------------- | --------- | --------- | ----- |
| `ContributionFailure`             | interface | yes       | yes   |
| `ContributionKind`                | type      | yes       | yes   |
| `ContributionProxyRegistry`       | class     | no        | yes   |
| `ContributionRef`                 | interface | yes       | yes   |
| `ContributionRpcError`            | class     | no        | yes   |
| `ContributionTransport`           | type      | yes       | yes   |
| `createContributionProxy`         | function  | no        | yes   |
| `createContributionProxyRegistry` | function  | no        | yes   |
| `TypedContributionProxy`          | class     | no        | yes   |

### src/app/plugin_slot_adapters.ts

_Entrypoints: `.`, `./web`_

| Symbol                                   | Kind      | Type Only | JSDoc |
| ---------------------------------------- | --------- | --------- | ----- |
| `CorePluginSlotSource`                   | type      | yes       | yes   |
| `createPluginSlotSourceAdapter`          | function  | no        | yes   |
| `MarkupPluginSlotSource`                 | type      | yes       | yes   |
| `PluginSlotDataValue`                    | type      | yes       | yes   |
| `PluginSlotPayloadAdapter`               | interface | yes       | yes   |
| `PluginSlotSource`                       | type      | yes       | yes   |
| `PluginSlotSourceAdapter`                | class     | no        | yes   |
| `PluginSlotSourceAdapterInspection`      | interface | yes       | yes   |
| `PluginSlotSourceAdapterOptions`         | interface | yes       | yes   |
| `PluginSlotSourceBase`                   | interface | yes       | yes   |
| `PluginSlotSourceContext`                | interface | yes       | yes   |
| `PluginSlotSourceDiagnostic`             | interface | yes       | yes   |
| `PluginSlotSourceInspection`             | interface | yes       | yes   |
| `PluginSlotSourceKind`                   | type      | yes       | yes   |
| `PluginSlotSourceRegistration`           | interface | yes       | yes   |
| `PluginSlotSourceRegistrationInspection` | interface | yes       | yes   |
| `PluginSlotSourceRenderer`               | type      | yes       | yes   |
| `PluginSlotSourceRenderers`              | type      | yes       | yes   |
| `PluginSlotSourceValues`                 | type      | yes       | yes   |
| `ViewPluginSlotSource`                   | type      | yes       | yes   |

### src/app/plugin_slots.ts

_Entrypoints: `.`, `./web`_

| Symbol                           | Kind      | Type Only | JSDoc |
| -------------------------------- | --------- | --------- | ----- |
| `createPluginSlotRegistry`       | function  | no        | yes   |
| `PluginSlotEntry`                | interface | yes       | yes   |
| `PluginSlotErrorEvent`           | interface | yes       | yes   |
| `PluginSlotErrorInspection`      | interface | yes       | yes   |
| `PluginSlotErrorPhase`           | type      | yes       | yes   |
| `PluginSlotErrorReport`          | interface | yes       | yes   |
| `PluginSlotMode`                 | type      | yes       | yes   |
| `PluginSlotPlugin`               | interface | yes       | yes   |
| `PluginSlotPluginInspection`     | interface | yes       | yes   |
| `PluginSlotRegistry`             | class     | no        | yes   |
| `PluginSlotRegistryInspection`   | interface | yes       | yes   |
| `PluginSlotRegistryOptions`      | interface | yes       | yes   |
| `PluginSlotRenderedContribution` | interface | yes       | yes   |
| `PluginSlotRenderer`             | type      | yes       | yes   |
| `PluginSlotRenderers`            | type      | yes       | yes   |
| `PluginSlotRenderResult`         | interface | yes       | yes   |
| `RenderPluginSlotOptions`        | interface | yes       | yes   |

### src/app/plugin_state_migration.ts

_Entrypoints: `.`, `./web`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `ActivationVerdict`      | type      | yes       | yes   |
| `createPluginStateStore` | function  | no        | yes   |
| `PluginStateStore`       | class     | no        | yes   |
| `StateMigration`         | interface | yes       | yes   |
| `UpgradeResult`          | type      | yes       | yes   |
| `VersionedState`         | interface | yes       | yes   |

### src/app/plugins.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                                  | Kind      | Type Only | JSDoc |
| --------------------------------------- | --------- | --------- | ----- |
| `AppPluginCatalogInspection`            | interface | yes       | yes   |
| `AppPluginCatalogMarkdownOptions`       | interface | yes       | yes   |
| `AppPluginCatalogQuery`                 | interface | yes       | yes   |
| `AppPluginCatalogReport`                | interface | yes       | yes   |
| `AppPluginCatalogReportOptions`         | interface | yes       | yes   |
| `AppPluginDefinition`                   | interface | yes       | yes   |
| `AppPluginDefinitionInspection`         | interface | yes       | yes   |
| `AppPluginDefinitionRegistry`           | class     | no        | yes   |
| `AppPluginDefinitionRegistryInspection` | interface | yes       | yes   |
| `AppPluginRoute`                        | interface | yes       | yes   |
| `createAppPlugin`                       | function  | no        | yes   |
| `createAppPluginCatalogReport`          | function  | no        | yes   |
| `createAppPluginDefinitionRegistry`     | function  | no        | yes   |
| `formatAppPluginCatalogMarkdown`        | function  | no        | yes   |
| `inspectAppPluginCatalog`               | function  | no        | yes   |
| `inspectAppPluginDefinition`            | function  | no        | yes   |
| `queryAppPluginDefinitions`             | function  | no        | yes   |

### src/app/pointer_gestures.ts

_Entrypoints: `.`, `./web`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `createPointerGestureState` | function  | no        | yes   |
| `PointerGestureEvent`       | interface | yes       | yes   |
| `PointerGestureOptions`     | interface | yes       | yes   |
| `PointerGestureOutcome`     | type      | yes       | yes   |
| `PointerGestureState`       | interface | yes       | yes   |
| `reducePointerGesture`      | function  | no        | yes   |

### src/app/preedit_provider.ts

_Entrypoints: `.`, `./web`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `createTerminalPreeditBridge` | function  | no        | yes   |
| `TerminalPreeditBridge`       | class     | no        | yes   |
| `TerminalPreeditEvent`        | type      | yes       | yes   |
| `TerminalPreeditProvider`     | interface | yes       | yes   |

### src/app/property_grid.ts

_Entrypoints: `.`, `./web`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `createPropertyEditorRegistry` | function  | no        | yes   |
| `createPropertyGridController` | function  | no        | yes   |
| `PropertyEditor`               | interface | yes       | yes   |
| `PropertyEditorRegistry`       | class     | no        | yes   |
| `PropertyEditResult`           | type      | yes       | yes   |
| `PropertyGridController`       | class     | no        | yes   |
| `PropertyGridOptions`          | interface | yes       | yes   |
| `PropertyRow`                  | interface | yes       | yes   |
| `PropertySpec`                 | interface | yes       | yes   |
| `PropertyTransaction`          | interface | yes       | yes   |
| `PropertyValueSource`          | type      | yes       | yes   |

### src/app/route_anchors.ts

_Entrypoints: `.`, `./web`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `createRouteAnchorStore` | function  | no        | yes   |
| `RouteAnchor`            | interface | yes       | yes   |
| `RouteAnchorHost`        | interface | yes       | yes   |
| `RouteAnchorStore`       | class     | no        | yes   |
| `RouteRestoreReport`     | interface | yes       | yes   |

### src/app/route_boundaries.ts

_Entrypoints: `.`, `./web`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `createRouteBoundaryRegistry` | function  | no        | yes   |
| `RouteBoundaryOptions`        | interface | yes       | yes   |
| `RouteBoundaryRegistry`       | class     | no        | yes   |
| `RouteBoundaryState`          | interface | yes       | yes   |

### src/app/route_guards.ts

_Entrypoints: `.`, `./web`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `createRouteGuardPipeline` | function  | no        | yes   |
| `RouteGuard`               | type      | yes       | yes   |
| `RouteGuardOutcome`        | interface | yes       | yes   |
| `RouteGuardPipeline`       | class     | no        | yes   |
| `RouteGuardResult`         | type      | yes       | yes   |

### src/app/route_loaders.ts

_Entrypoints: `.`, `./web`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `createRouteLoaderScope` | function  | no        | yes   |
| `RouteLoaderScope`       | class     | no        | yes   |
| `RouteLoadResult`        | interface | yes       | yes   |

### src/app/route_outlets.ts

_Entrypoints: `.`, `./web`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `createRouteOutletTree` | function  | no        | yes   |
| `RouteActivation`       | interface | yes       | yes   |
| `RouteNode`             | interface | yes       | yes   |
| `RouteOutletTree`       | class     | no        | yes   |

### src/app/route_patterns.ts

_Entrypoints: `.`, `./web`_

| Symbol                                | Kind      | Type Only | JSDoc |
| ------------------------------------- | --------- | --------- | ----- |
| `CompiledRoutePattern`                | interface | yes       | yes   |
| `compileRoutePattern`                 | function  | no        | yes   |
| `defineRouteParameterCodec`           | function  | no        | yes   |
| `ROUTE_PATTERN_LIMITS`                | const     | no        | yes   |
| `routeBooleanParameterCodec`          | const     | no        | yes   |
| `routeIntegerParameterCodec`          | const     | no        | yes   |
| `RouteParameterCodec`                 | interface | yes       | yes   |
| `RouteParameterCodecMap`              | type      | yes       | yes   |
| `RouteParameterCodecValue`            | type      | yes       | yes   |
| `RouteParameterValue`                 | type      | yes       | yes   |
| `RoutePatternAmbiguityCandidate`      | interface | yes       | yes   |
| `RoutePatternCompileOptions`          | interface | yes       | yes   |
| `RoutePatternError`                   | class     | no        | yes   |
| `RoutePatternErrorCode`               | type      | yes       | yes   |
| `RoutePatternInspection`              | interface | yes       | yes   |
| `RoutePatternMatch`                   | interface | yes       | yes   |
| `RoutePatternParameters`              | type      | yes       | yes   |
| `RoutePatternRegistry`                | class     | no        | yes   |
| `RoutePatternRegistryEntryInspection` | interface | yes       | yes   |
| `RoutePatternRegistryInspection`      | interface | yes       | yes   |
| `RoutePatternResolution`              | interface | yes       | yes   |
| `RoutePatternSegmentKind`             | type      | yes       | yes   |
| `routeStringParameterCodec`           | const     | no        | yes   |

### src/app/route_prefetch.ts

_Entrypoints: `.`, `./web`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `createRoutePrefetcher` | function  | no        | yes   |
| `RoutePrefetcher`       | class     | no        | yes   |
| `RoutePrefetchIntent`   | type      | yes       | yes   |
| `RoutePrefetchOptions`  | interface | yes       | yes   |

### src/app/router.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `bindRouteCommands`         | function  | no        | yes   |
| `bindRouteIndex`            | function  | no        | yes   |
| `bindRouteSignal`           | function  | no        | yes   |
| `createRouteLocation`       | function  | no        | yes   |
| `formatRouteLocation`       | function  | no        | yes   |
| `parseRouteLocation`        | function  | no        | yes   |
| `Route`                     | interface | yes       | yes   |
| `ROUTE_LOCATION_LIMITS`     | const     | no        | yes   |
| `ROUTE_LOCATION_PREFIX`     | const     | no        | yes   |
| `ROUTE_LOCATION_VERSION`    | const     | no        | yes   |
| `RouteCommandKind`          | type      | yes       | yes   |
| `RouteCommandOptions`       | interface | yes       | yes   |
| `routeCommands`             | function  | no        | yes   |
| `RouteIdSource`             | type      | yes       | yes   |
| `RouteIndexBindingOptions`  | interface | yes       | yes   |
| `RouteInspection`           | interface | yes       | yes   |
| `RouteLocation`             | interface | yes       | yes   |
| `RouteLocationError`        | class     | no        | yes   |
| `RouteLocationErrorCode`    | type      | yes       | yes   |
| `RouteLocationInput`        | interface | yes       | yes   |
| `RouteLocationObservable`   | interface | yes       | yes   |
| `RouteLocationState`        | type      | yes       | yes   |
| `RouteManager`              | class     | no        | yes   |
| `RouteQueryValue`           | type      | yes       | yes   |
| `RouteRegisterOptions`      | interface | yes       | yes   |
| `RouteSignalBindingOptions` | interface | yes       | yes   |
| `RouteUnregisterOptions`    | interface | yes       | yes   |

### src/app/runtime_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol                                       | Kind      | Type Only | JSDoc |
| -------------------------------------------- | --------- | --------- | ----- |
| `bindRuntimeProfileCommands`                 | function  | no        | yes   |
| `bindRuntimeRendererBackendCommands`         | function  | no        | yes   |
| `bindRuntimeWorkloadCommands`                | function  | no        | yes   |
| `createRuntimeProfilePlugin`                 | function  | no        | yes   |
| `createRuntimeRendererBackendPlugin`         | function  | no        | yes   |
| `RuntimeProfileAppPlugin`                    | interface | yes       | yes   |
| `RuntimeProfileChangedPayload`               | interface | yes       | yes   |
| `RuntimeProfileCommandAction`                | type      | yes       | yes   |
| `RuntimeProfileCommandOptions`               | interface | yes       | yes   |
| `runtimeProfileCommands`                     | function  | no        | yes   |
| `RuntimeProfilePluginInspection`             | interface | yes       | yes   |
| `RuntimeProfilePluginInstallContext`         | interface | yes       | yes   |
| `RuntimeProfilePluginOptions`                | interface | yes       | yes   |
| `RuntimeRendererBackendAppPlugin`            | interface | yes       | yes   |
| `RuntimeRendererBackendChangedPayload`       | interface | yes       | yes   |
| `RuntimeRendererBackendCommandAction`        | type      | yes       | yes   |
| `RuntimeRendererBackendCommandOptions`       | interface | yes       | yes   |
| `runtimeRendererBackendCommands`             | function  | no        | yes   |
| `RuntimeRendererBackendPluginInspection`     | interface | yes       | yes   |
| `RuntimeRendererBackendPluginInstallContext` | interface | yes       | yes   |
| `RuntimeRendererBackendPluginOptions`        | interface | yes       | yes   |
| `RuntimeWorkloadCommandAction`               | type      | yes       | yes   |
| `RuntimeWorkloadCommandOptions`              | interface | yes       | yes   |
| `runtimeWorkloadCommands`                    | function  | no        | yes   |
| `RuntimeWorkloadReportedPayload`             | interface | yes       | yes   |

### src/app/screen_persistence.ts

_Entrypoints: `.`, `./web`_

| Symbol                            | Kind      | Type Only | JSDoc |
| --------------------------------- | --------- | --------- | ----- |
| `dryRunScreenStackRestore`        | function  | no        | yes   |
| `restoreScreenStackSnapshot`      | function  | no        | yes   |
| `SCREEN_STACK_SNAPSHOT_SCHEMA`    | const     | no        | yes   |
| `SCREEN_STACK_SNAPSHOT_VERSION`   | const     | no        | yes   |
| `ScreenPersistenceDiagnostic`     | interface | yes       | yes   |
| `ScreenPersistenceDiagnosticCode` | type      | yes       | yes   |
| `ScreenPersistenceOperation`      | type      | yes       | yes   |
| `ScreenPersistenceOptions`        | interface | yes       | yes   |
| `ScreenPersistenceResult`         | interface | yes       | yes   |
| `screenRegistrySnapshotMetadata`  | function  | no        | yes   |
| `ScreenRegistrySnapshotMetadata`  | interface | yes       | yes   |
| `ScreenRestorePolicy`             | interface | yes       | yes   |
| `ScreenRestoreTransition`         | interface | yes       | yes   |
| `ScreenStackMigrationContext`     | interface | yes       | yes   |
| `ScreenStackRestorePlan`          | interface | yes       | yes   |
| `ScreenStackRestoreResult`        | interface | yes       | yes   |
| `ScreenStackSnapshot`             | interface | yes       | yes   |
| `ScreenStackSnapshotMigration`    | interface | yes       | yes   |
| `snapshotScreenStack`             | function  | no        | yes   |

### src/app/screen_router.ts

_Entrypoints: `.`, `./web`_

| Symbol                              | Kind      | Type Only | JSDoc |
| ----------------------------------- | --------- | --------- | ----- |
| `createScreenRouterModeBinding`     | function  | no        | yes   |
| `ScreenRouteEnterOperation`         | type      | yes       | yes   |
| `ScreenRouteMappingDefinition`      | interface | yes       | yes   |
| `ScreenRouteMappingInactiveReason`  | type      | yes       | yes   |
| `ScreenRouteMappingInspection`      | interface | yes       | yes   |
| `ScreenRouteProjectionTransition`   | type      | yes       | yes   |
| `ScreenRouterDiagnostic`            | interface | yes       | yes   |
| `ScreenRouterDiagnosticCode`        | type      | yes       | yes   |
| `ScreenRouterModeBinding`           | class     | no        | yes   |
| `ScreenRouterModeBindingInspection` | interface | yes       | yes   |
| `ScreenRouterModeBindingOptions`    | interface | yes       | yes   |
| `ScreenRouterModeDefinition`        | interface | yes       | yes   |
| `ScreenRouterModeInspection`        | interface | yes       | yes   |
| `ScreenRouterStackChangeInspection` | interface | yes       | yes   |
| `ScreenRouterSyncResult`            | interface | yes       | yes   |
| `ScreenRouterSyncSource`            | type      | yes       | yes   |

### src/app/screens.ts

_Entrypoints: `.`, `./web`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `createScreenStack`         | function  | no        | yes   |
| `ScreenDefinition`          | interface | yes       | yes   |
| `ScreenEntryInspection`     | interface | yes       | yes   |
| `ScreenLifecycleEvent`      | interface | yes       | yes   |
| `ScreenLifecyclePhase`      | type      | yes       | yes   |
| `ScreenModalResultCallback` | type      | yes       | yes   |
| `ScreenStack`               | class     | no        | yes   |
| `ScreenStackChange`         | interface | yes       | yes   |
| `ScreenStackDiagnostic`     | interface | yes       | yes   |
| `ScreenStackDiagnosticCode` | type      | yes       | yes   |
| `ScreenStackInspection`     | interface | yes       | yes   |
| `ScreenStackOperation`      | type      | yes       | yes   |
| `ScreenStackOptions`        | interface | yes       | yes   |

### src/app/scroll_area_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `bindScrollAreaCommands`   | function  | no        | yes   |
| `ScrollAreaCommandAction`  | type      | yes       | yes   |
| `ScrollAreaCommandKind`    | type      | yes       | yes   |
| `ScrollAreaCommandOptions` | interface | yes       | yes   |
| `ScrollAreaCommandPayload` | interface | yes       | yes   |
| `scrollAreaCommands`       | function  | no        | yes   |

### src/app/selection_bindings.ts

_Entrypoints: `.`, `./web`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `bindSelectionCommands`        | function  | no        | yes   |
| `bindSelectionValue`           | function  | no        | yes   |
| `SelectionCommandKind`         | type      | yes       | yes   |
| `SelectionCommandOptions`      | interface | yes       | yes   |
| `selectionCommands`            | function  | no        | yes   |
| `SelectionItemsSource`         | type      | yes       | yes   |
| `SelectionPageSize`            | type      | yes       | yes   |
| `SelectionValueBindingOptions` | interface | yes       | yes   |

### src/app/settings_bindings.ts

_Entrypoints: `.`, `./web`_

| Symbol                                        | Kind      | Type Only | JSDoc |
| --------------------------------------------- | --------- | --------- | ----- |
| `bindDataQuerySetting`                        | function  | no        | yes   |
| `bindDataTableSetting`                        | function  | no        | yes   |
| `bindRouteSetting`                            | function  | no        | yes   |
| `bindRuntimeProfileSetting`                   | function  | no        | yes   |
| `bindRuntimeRendererBackendSetting`           | function  | no        | yes   |
| `bindSettingSignal`                           | function  | no        | yes   |
| `bindSplitPaneSetting`                        | function  | no        | yes   |
| `bindThemeLayerSetting`                       | function  | no        | yes   |
| `bindThemePipelineSetting`                    | function  | no        | yes   |
| `bindThemeSetting`                            | function  | no        | yes   |
| `DataQuerySettingBindingOptions`              | interface | yes       | yes   |
| `DataTableSettingBindingOptions`              | interface | yes       | yes   |
| `RouteSettingBindingOptions`                  | interface | yes       | yes   |
| `RuntimeProfileSettingBindingOptions`         | interface | yes       | yes   |
| `RuntimeRendererBackendSettingBindingOptions` | interface | yes       | yes   |
| `SettingBinding`                              | interface | yes       | yes   |
| `SettingSignalBindingOptions`                 | interface | yes       | yes   |
| `SplitPaneSettingBindingOptions`              | interface | yes       | yes   |
| `ThemeLayerSettingBindingOptions`             | interface | yes       | yes   |
| `ThemePipelineSettingBindingOptions`          | interface | yes       | yes   |
| `ThemeSettingBindingOptions`                  | interface | yes       | yes   |

### src/app/settings.ts

_Entrypoints: `.`, `./web`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `AppSettingDefinition`         | interface | yes       | yes   |
| `bindSettingsCommands`         | function  | no        | yes   |
| `createSettingsController`     | function  | no        | yes   |
| `SettingsCommandAction`        | type      | yes       | yes   |
| `SettingsCommandKind`          | type      | yes       | yes   |
| `SettingsCommandOptions`       | interface | yes       | yes   |
| `settingsCommands`             | function  | no        | yes   |
| `SettingsController`           | class     | no        | yes   |
| `SettingsControllerInspection` | interface | yes       | yes   |
| `SettingsControllerOptions`    | interface | yes       | yes   |

### src/app/shell_background.ts

_Entrypoints: `.`, `./web`_

| Symbol                             | Kind      | Type Only | JSDoc |
| ---------------------------------- | --------- | --------- | ----- |
| `SHELL_METABALL_FRAME_INTERVAL_MS` | const     | no        | yes   |
| `SHELL_METABALL_LEVELS`            | const     | no        | yes   |
| `ShellMetaballAdvanceOptions`      | interface | yes       | yes   |
| `ShellMetaballBackground`          | class     | no        | yes   |
| `ShellMetaballField`               | class     | no        | yes   |
| `ShellMetaballFieldOptions`        | interface | yes       | yes   |
| `shellMetaballGradientColors`      | function  | no        | yes   |
| `ShellMetaballInspection`          | interface | yes       | yes   |
| `shellMetaballPalette`             | function  | no        | yes   |
| `ShellMetaballPoint`               | interface | yes       | yes   |

### src/app/shell_presenter.ts

_Entrypoints: `.`, `./web`_

| Symbol                | Kind      | Type Only | JSDoc |
| --------------------- | --------- | --------- | ----- |
| `runShellApp`         | function  | no        | yes   |
| `ShellApp`            | interface | yes       | yes   |
| `ShellAppHandle`      | interface | yes       | yes   |
| `ShellCapabilities`   | interface | yes       | yes   |
| `shellCellsToAnsiRow` | function  | no        | yes   |
| `shellPresentedCell`  | function  | no        | yes   |
| `ShellPresentedCell`  | interface | yes       | yes   |
| `ShellPresentedFrame` | type      | yes       | yes   |
| `ShellPresenter`      | interface | yes       | yes   |
| `ShellPresenterSize`  | interface | yes       | yes   |

### src/app/shell_theme.ts

_Entrypoints: `.`, `./web`_

| Re-export Target             | Kind  | Names           |
| ---------------------------- | ----- | --------------- |
| `src/app/workbench_shell.ts` | named | `type ShellRgb` |

| Symbol                          | Kind      | Type Only | JSDoc |
| ------------------------------- | --------- | --------- | ----- |
| `SHELL_T2_SWATCHES`             | const     | no        | yes   |
| `SHELL_THEMES`                  | const     | no        | yes   |
| `shellActiveTitlebarForeground` | function  | no        | yes   |
| `shellControlColor`             | function  | no        | yes   |
| `shellRelativeLuminance`        | function  | no        | yes   |
| `shellThemeById`                | function  | no        | yes   |
| `ShellThemeSpec`                | interface | yes       | yes   |
| `ShellWorkbenchThemeId`         | type      | yes       | yes   |

### src/app/software_cursor.ts

_Entrypoints: `.`, `./web`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `AnyMotionTracking`        | interface | yes       | yes   |
| `AnyMotionTrackingOptions` | interface | yes       | yes   |
| `createAnyMotionTracking`  | function  | no        | yes   |
| `softwareCursorRender`     | function  | no        | yes   |
| `SoftwareCursorRender`     | interface | yes       | yes   |
| `windowResizeGlyphAt`      | function  | no        | yes   |

### src/app/split_pane_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `bindSplitPaneCommands`    | function  | no        | yes   |
| `SplitPaneBoundsSource`    | type      | yes       | yes   |
| `SplitPaneCommandAction`   | type      | yes       | yes   |
| `SplitPaneCommandKind`     | type      | yes       | yes   |
| `SplitPaneCommandOptions`  | interface | yes       | yes   |
| `splitPaneCommands`        | function  | no        | yes   |
| `SplitPaneSnapshotPayload` | interface | yes       | yes   |

### src/app/structure_inspector.ts

_Entrypoints: `.`, `./web`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `InspectorDocument`            | interface | yes       | yes   |
| `InspectorNode`                | interface | yes       | yes   |
| `InspectorSearchKind`          | type      | yes       | yes   |
| `parseToNodeTable`             | function  | no        | yes   |
| `StructureInspectorController` | class     | no        | yes   |

### src/app/surface_transitions.ts

_Entrypoints: `./app`_

| Symbol                                | Kind      | Type Only | JSDoc |
| ------------------------------------- | --------- | --------- | ----- |
| `BeginSurfaceTransitionOptions`       | interface | yes       | no    |
| `createSurfaceTransitionAnimator`     | function  | no        | yes   |
| `DEFAULT_SURFACE_TRANSITION_SETTINGS` | const     | no        | yes   |
| `SURFACE_TRANSITION_BASE_DURATION_MS` | const     | no        | yes   |
| `SurfaceTransitionAnimator`           | class     | no        | yes   |
| `SurfaceTransitionAnimatorOptions`    | interface | yes       | no    |
| `surfaceTransitionMotionToken`        | function  | no        | yes   |
| `SurfaceTransitionOverlay`            | interface | yes       | yes   |
| `SurfaceTransitionSettings`           | interface | yes       | yes   |

### src/app/syntax_service.ts

_Entrypoints: `.`, `./web`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `createLoopbackPorts`      | function  | no        | yes   |
| `createPatternHighlighter` | function  | no        | yes   |
| `createSyntaxWorkerHost`   | function  | no        | yes   |
| `Highlighter`              | interface | yes       | yes   |
| `HighlightSpan`            | interface | yes       | yes   |
| `SyntaxPort`               | interface | yes       | yes   |
| `SyntaxRequest`            | type      | yes       | yes   |
| `SyntaxResponse`           | type      | yes       | yes   |
| `SyntaxServiceClient`      | class     | no        | yes   |

### src/app/table_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol                | Kind      | Type Only | JSDoc |
| --------------------- | --------- | --------- | ----- |
| `bindTableCommands`   | function  | no        | yes   |
| `TableCommandAction`  | type      | yes       | yes   |
| `TableCommandKind`    | type      | yes       | yes   |
| `TableCommandOptions` | interface | yes       | yes   |
| `TableCommandPayload` | interface | yes       | yes   |
| `tableCommands`       | function  | no        | yes   |

### src/app/tabs_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol               | Kind      | Type Only | JSDoc |
| -------------------- | --------- | --------- | ----- |
| `bindTabsCommands`   | function  | no        | yes   |
| `TabsCommandAction`  | type      | yes       | yes   |
| `TabsCommandKind`    | type      | yes       | yes   |
| `TabsCommandOptions` | interface | yes       | yes   |
| `TabsCommandPayload` | interface | yes       | yes   |
| `tabsCommands`       | function  | no        | yes   |

### src/app/terminal_app.ts

_Entrypoints: `./app`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `createTerminalApp`           | function  | no        | yes   |
| `TerminalApp`                 | class     | no        | yes   |
| `TerminalAppBindings`         | interface | yes       | yes   |
| `TerminalAppComponentOptions` | interface | yes       | yes   |
| `TerminalAppInputOptions`     | interface | yes       | yes   |
| `TerminalAppOptions`          | interface | yes       | yes   |

### src/app/terminal_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol                                 | Kind      | Type Only | JSDoc |
| -------------------------------------- | --------- | --------- | ----- |
| `bindTerminalCommands`                 | function  | no        | yes   |
| `bindTerminalScrollbackCommands`       | function  | no        | yes   |
| `bindTerminalShellWorkspaceCommands`   | function  | no        | yes   |
| `bindTerminalWorkspaceCommands`        | function  | no        | yes   |
| `syncTerminalWindowLayout`             | function  | no        | yes   |
| `TerminalCommandAction`                | type      | yes       | yes   |
| `TerminalCommandKind`                  | type      | yes       | yes   |
| `TerminalCommandOptions`               | interface | yes       | yes   |
| `TerminalCommandPayload`               | interface | yes       | yes   |
| `terminalCommands`                     | function  | no        | yes   |
| `TerminalScrollbackCommandAction`      | type      | yes       | yes   |
| `TerminalScrollbackCommandKind`        | type      | yes       | yes   |
| `TerminalScrollbackCommandOptions`     | interface | yes       | yes   |
| `TerminalScrollbackCommandPayload`     | interface | yes       | yes   |
| `terminalScrollbackCommands`           | function  | no        | yes   |
| `TerminalShellWorkspaceCommandAction`  | type      | yes       | yes   |
| `TerminalShellWorkspaceCommandKind`    | type      | yes       | yes   |
| `TerminalShellWorkspaceCommandOptions` | interface | yes       | yes   |
| `TerminalShellWorkspaceCommandPayload` | interface | yes       | yes   |
| `terminalShellWorkspaceCommands`       | function  | no        | yes   |
| `TerminalWindowBinding`                | interface | yes       | yes   |
| `terminalWindowContentSize`            | function  | no        | yes   |
| `TerminalWindowLayoutSyncOptions`      | interface | yes       | yes   |
| `TerminalWindowLayoutSyncResult`       | interface | yes       | yes   |
| `TerminalWorkspaceCommandAction`       | type      | yes       | yes   |
| `TerminalWorkspaceCommandKind`         | type      | yes       | yes   |
| `TerminalWorkspaceCommandOptions`      | interface | yes       | yes   |
| `TerminalWorkspaceCommandPayload`      | interface | yes       | yes   |
| `terminalWorkspaceCommands`            | function  | no        | yes   |

### src/app/terminal_input.ts

_Entrypoints: `.`, `./web`_

| Symbol                                 | Kind      | Type Only | JSDoc |
| -------------------------------------- | --------- | --------- | ----- |
| `encodeTerminalKeyPress`               | function  | no        | yes   |
| `encodeTerminalMouse`                  | function  | no        | yes   |
| `encodeTerminalPaste`                  | function  | no        | yes   |
| `inspectTerminalPaste`                 | function  | no        | yes   |
| `isReservedTerminalKey`                | function  | no        | yes   |
| `routeTerminalKeyPress`                | function  | no        | yes   |
| `routeTerminalMouse`                   | function  | no        | yes   |
| `routeTerminalPaste`                   | function  | no        | yes   |
| `TerminalInputMode`                    | type      | yes       | yes   |
| `TerminalInputRouteDecision`           | interface | yes       | yes   |
| `TerminalInputRoutingOptions`          | interface | yes       | yes   |
| `TerminalInputTarget`                  | interface | yes       | yes   |
| `TerminalMouseInputEvent`              | interface | yes       | yes   |
| `terminalMouseRoutingFromPrivateModes` | function  | no        | yes   |
| `TerminalMouseTrackingMode`            | type      | yes       | yes   |
| `TerminalPasteConfirmationPolicy`      | type      | yes       | yes   |
| `TerminalPasteInspection`              | interface | yes       | yes   |

### src/app/theme_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol                            | Kind      | Type Only | JSDoc |
| --------------------------------- | --------- | --------- | ----- |
| `bindThemeCommands`               | function  | no        | yes   |
| `bindThemeEngineCommands`         | function  | no        | yes   |
| `bindThemePipelineCommands`       | function  | no        | yes   |
| `ThemeChangedPayload`             | interface | yes       | yes   |
| `ThemeCommandAction`              | type      | yes       | yes   |
| `ThemeCommandOptions`             | interface | yes       | yes   |
| `themeCommands`                   | function  | no        | yes   |
| `themeEngineCatalogCommands`      | function  | no        | yes   |
| `ThemeEngineCatalogPayload`       | interface | yes       | yes   |
| `ThemeEngineCommandAction`        | type      | yes       | yes   |
| `ThemeEngineCommandOptions`       | interface | yes       | yes   |
| `themeEngineCommands`             | function  | no        | yes   |
| `ThemeEngineCommandSource`        | type      | yes       | yes   |
| `themeEngineFactoryCommands`      | function  | no        | yes   |
| `ThemeEnginePreviewPayload`       | interface | yes       | yes   |
| `ThemeLayerChangedPayload`        | interface | yes       | yes   |
| `themeLayerCommands`              | function  | no        | yes   |
| `ThemePipelineCommandAction`      | type      | yes       | yes   |
| `ThemePipelineCommandOptions`     | interface | yes       | yes   |
| `themePipelineCommands`           | function  | no        | yes   |
| `ThemePipelineStepChangedPayload` | interface | yes       | yes   |
| `themePreviewCommands`            | function  | no        | yes   |
| `ThemePreviewPayload`             | interface | yes       | yes   |
| `themeSelectionCommands`          | function  | no        | yes   |

### src/app/theme_editor.ts

_Entrypoints: `.`, `./web`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `MemoryThemeStorage`    | class     | no        | yes   |
| `themeDocumentId`       | function  | no        | yes   |
| `ThemeEditorController` | class     | no        | yes   |
| `ThemeEditorInspection` | interface | yes       | yes   |
| `ThemeEditorOptions`    | interface | yes       | yes   |
| `ThemeLibrary`          | class     | no        | yes   |
| `ThemeLibraryEntry`     | interface | yes       | yes   |
| `ThemeLibraryOptions`   | interface | yes       | yes   |
| `ThemeStoragePort`      | interface | yes       | yes   |

### src/app/theme_plugin.ts

_Entrypoints: `.`, `./web`_

| Symbol                               | Kind      | Type Only | JSDoc |
| ------------------------------------ | --------- | --------- | ----- |
| `createThemePlugin`                  | function  | no        | yes   |
| `createThemeWorkspacePlugin`         | function  | no        | yes   |
| `ThemeAppPlugin`                     | interface | yes       | yes   |
| `ThemePluginInspection`              | interface | yes       | yes   |
| `ThemePluginInstallContext`          | interface | yes       | yes   |
| `ThemePluginOptions`                 | interface | yes       | yes   |
| `ThemePluginPipelineCommandOptions`  | type      | yes       | yes   |
| `ThemePluginPipelineSettingOption`   | type      | yes       | yes   |
| `ThemePluginPipelineSettingOptions`  | type      | yes       | yes   |
| `ThemeWorkspaceAppPlugin`            | interface | yes       | yes   |
| `ThemeWorkspacePluginInspection`     | interface | yes       | yes   |
| `ThemeWorkspacePluginInstallContext` | interface | yes       | yes   |
| `ThemeWorkspacePluginOptions`        | interface | yes       | yes   |

### src/app/time_picker.ts

_Entrypoints: `.`, `./web`_

| Symbol               | Kind      | Type Only | JSDoc |
| -------------------- | --------- | --------- | ----- |
| `chooseInstant`      | function  | no        | yes   |
| `CivilTime`          | interface | yes       | yes   |
| `formatDuration`     | function  | no        | yes   |
| `offsetMinutesAt`    | function  | no        | yes   |
| `parseDuration`      | function  | no        | yes   |
| `resolveWallTime`    | function  | no        | yes   |
| `stepTime`           | function  | no        | yes   |
| `TimeStepOptions`    | interface | yes       | yes   |
| `WallTimeChoice`     | type      | yes       | yes   |
| `WallTimeResolution` | type      | yes       | yes   |
| `ZonedInstant`       | interface | yes       | yes   |

### src/app/toast_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol                | Kind      | Type Only | JSDoc |
| --------------------- | --------- | --------- | ----- |
| `bindToastCommands`   | function  | no        | yes   |
| `ToastCommandAction`  | type      | yes       | yes   |
| `ToastCommandKind`    | type      | yes       | yes   |
| `ToastCommandOptions` | interface | yes       | yes   |
| `ToastCommandPayload` | interface | yes       | yes   |
| `toastCommands`       | function  | no        | yes   |

### src/app/token_editor.ts

_Entrypoints: `.`, `./web`_

| Symbol               | Kind      | Type Only | JSDoc |
| -------------------- | --------- | --------- | ----- |
| `createTokenEditor`  | function  | no        | yes   |
| `DuplicatePolicy`    | type      | yes       | yes   |
| `Token`              | interface | yes       | yes   |
| `TokenEditor`        | class     | no        | yes   |
| `TokenEditorOptions` | interface | yes       | yes   |
| `TokenSuggestions`   | interface | yes       | yes   |

### src/app/transfer_list.ts

_Entrypoints: `.`, `./web`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `createTransferListController` | function  | no        | yes   |
| `TransferItem`                 | interface | yes       | yes   |
| `TransferListController`       | class     | no        | yes   |
| `TransferListOptions`          | interface | yes       | yes   |
| `TransferPreview`              | interface | yes       | yes   |
| `TransferSide`                 | type      | yes       | yes   |
| `TransferView`                 | interface | yes       | yes   |

### src/app/tree_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol               | Kind      | Type Only | JSDoc |
| -------------------- | --------- | --------- | ----- |
| `bindTreeCommands`   | function  | no        | yes   |
| `TreeCommandAction`  | type      | yes       | yes   |
| `TreeCommandKind`    | type      | yes       | yes   |
| `TreeCommandOptions` | interface | yes       | yes   |
| `TreeCommandPayload` | interface | yes       | yes   |
| `treeCommands`       | function  | no        | yes   |

### src/app/tree_grid.ts

_Entrypoints: `.`, `./web`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `createTreeGridController` | function  | no        | yes   |
| `TreeGridColumn`           | interface | yes       | yes   |
| `TreeGridController`       | class     | no        | yes   |
| `TreeGridNode`             | interface | yes       | yes   |
| `TreeGridRow`              | interface | yes       | yes   |

### src/app/typed_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `CommandInvocationContext`   | interface | yes       | yes   |
| `CommandInvocationHandle`    | interface | yes       | yes   |
| `CommandOutcome`             | type      | yes       | yes   |
| `createTypedCommandRegistry` | function  | no        | yes   |
| `TypedCommand`               | interface | yes       | yes   |
| `TypedCommandDescriptor`     | interface | yes       | yes   |
| `TypedCommandRegistry`       | class     | no        | yes   |

### src/app/widget_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `bindButtonCommands`        | function  | no        | yes   |
| `bindCheckBoxCommands`      | function  | no        | yes   |
| `bindComboBoxCommands`      | function  | no        | yes   |
| `bindProgressBarCommands`   | function  | no        | yes   |
| `bindRadioGroupCommands`    | function  | no        | yes   |
| `bindSliderCommands`        | function  | no        | yes   |
| `bindStepperCommands`       | function  | no        | yes   |
| `bindTextBoxCommands`       | function  | no        | yes   |
| `ButtonCommandAction`       | type      | yes       | yes   |
| `ButtonCommandKind`         | type      | yes       | yes   |
| `ButtonCommandOptions`      | interface | yes       | yes   |
| `ButtonCommandPayload`      | interface | yes       | yes   |
| `buttonCommands`            | function  | no        | yes   |
| `CheckBoxCommandAction`     | type      | yes       | yes   |
| `CheckBoxCommandKind`       | type      | yes       | yes   |
| `CheckBoxCommandOptions`    | interface | yes       | yes   |
| `CheckBoxCommandPayload`    | interface | yes       | yes   |
| `checkBoxCommands`          | function  | no        | yes   |
| `ComboBoxCommandAction`     | type      | yes       | yes   |
| `ComboBoxCommandKind`       | type      | yes       | yes   |
| `ComboBoxCommandOptions`    | interface | yes       | yes   |
| `ComboBoxCommandPayload`    | interface | yes       | yes   |
| `comboBoxCommands`          | function  | no        | yes   |
| `ProgressBarCommandAction`  | type      | yes       | yes   |
| `ProgressBarCommandKind`    | type      | yes       | yes   |
| `ProgressBarCommandOptions` | interface | yes       | yes   |
| `ProgressBarCommandPayload` | interface | yes       | yes   |
| `progressBarCommands`       | function  | no        | yes   |
| `RadioGroupCommandAction`   | type      | yes       | yes   |
| `RadioGroupCommandKind`     | type      | yes       | yes   |
| `RadioGroupCommandOptions`  | interface | yes       | yes   |
| `RadioGroupCommandPayload`  | interface | yes       | yes   |
| `radioGroupCommands`        | function  | no        | yes   |
| `SliderCommandAction`       | type      | yes       | yes   |
| `SliderCommandKind`         | type      | yes       | yes   |
| `SliderCommandOptions`      | interface | yes       | yes   |
| `SliderCommandPayload`      | interface | yes       | yes   |
| `sliderCommands`            | function  | no        | yes   |
| `StepperCommandAction`      | type      | yes       | yes   |
| `StepperCommandKind`        | type      | yes       | yes   |
| `StepperCommandOptions`     | interface | yes       | yes   |
| `StepperCommandPayload`     | interface | yes       | yes   |
| `stepperCommands`           | function  | no        | yes   |
| `TextBoxCommandAction`      | type      | yes       | yes   |
| `TextBoxCommandKind`        | type      | yes       | yes   |
| `TextBoxCommandOptions`     | interface | yes       | yes   |
| `TextBoxCommandPayload`     | interface | yes       | yes   |
| `textBoxCommands`           | function  | no        | yes   |

### src/app/widget_surface.ts

_Entrypoints: `./app`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `WidgetSurface`         | class     | no        | yes   |
| `WidgetSurfaceCell`     | type      | yes       | yes   |
| `widgetSurfaceCellData` | function  | no        | yes   |
| `WidgetSurfaceCellData` | interface | yes       | yes   |

### src/app/window_manager_commands.ts

_Entrypoints: `.`, `./web`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `bindWindowManagerCommands`   | function  | no        | yes   |
| `WindowManagerCommandAction`  | type      | yes       | yes   |
| `WindowManagerCommandKind`    | type      | yes       | yes   |
| `WindowManagerCommandOptions` | interface | yes       | yes   |
| `WindowManagerCommandPayload` | interface | yes       | yes   |
| `windowManagerCommands`       | function  | no        | yes   |
| `WindowManagerRenameFactory`  | type      | yes       | yes   |
| `WindowManagerWindowFactory`  | type      | yes       | yes   |

### src/app/workbench_accessibility.ts

_Entrypoints: `.`, `./web`_

| Symbol                            | Kind     | Type Only | JSDoc |
| --------------------------------- | -------- | --------- | ----- |
| `COLOR_BLIND_SAFE_PALETTE`        | const    | no        | yes   |
| `createWorkbenchMotion`           | function | no        | yes   |
| `HIGH_CONTRAST_PALETTE`           | const    | no        | yes   |
| `WORKBENCH_CONTROL_ACCESSIBILITY` | const    | no        | yes   |

### src/app/workbench_ansi_screen.ts

_Entrypoints: `.`, `./web`_

| Symbol                           | Kind      | Type Only | JSDoc |
| -------------------------------- | --------- | --------- | ----- |
| `WorkbenchAnsiScreenFlushStats`  | interface | yes       | yes   |
| `WorkbenchAnsiScreenPainter`     | class     | no        | yes   |
| `writeWorkbenchAnsiScreenOutput` | function  | no        | yes   |

### src/app/workbench_button_style.ts

_Entrypoints: `.`, `./web`_

| Symbol                                    | Kind      | Type Only | JSDoc |
| ----------------------------------------- | --------- | --------- | ----- |
| `projectWorkbenchButton`                  | function  | no        | yes   |
| `projectWorkbenchButtonCommand`           | function  | no        | yes   |
| `WorkbenchButtonCommandProjectionOptions` | interface | yes       | yes   |
| `WorkbenchButtonContrast`                 | type      | yes       | yes   |
| `workbenchButtonPaintOptions`             | function  | no        | yes   |
| `WorkbenchButtonProjection`               | interface | yes       | yes   |
| `WorkbenchButtonProjectionOptions`        | interface | yes       | yes   |
| `WorkbenchButtonState`                    | type      | yes       | yes   |
| `WorkbenchButtonTheme`                    | interface | yes       | yes   |
| `WorkbenchButtonTone`                     | type      | yes       | yes   |

### src/app/workbench_control_layout.ts

_Entrypoints: `.`, `./web`_

| Symbol                                  | Kind      | Type Only | JSDoc |
| --------------------------------------- | --------- | --------- | ----- |
| `layoutWorkbenchButtonRow`              | function  | no        | yes   |
| `layoutWorkbenchButtonRowInto`          | function  | no        | yes   |
| `layoutWorkbenchControlButtonLine`      | function  | no        | yes   |
| `layoutWrappedControlOptions`           | function  | no        | yes   |
| `WorkbenchButtonRowItem`                | interface | yes       | yes   |
| `WorkbenchButtonRowLayout`              | interface | yes       | yes   |
| `WorkbenchButtonRowPlacement`           | interface | yes       | yes   |
| `WorkbenchButtonRowRenderCommand`       | interface | yes       | yes   |
| `workbenchButtonRowRenderCommandsInto`  | function  | no        | yes   |
| `WorkbenchControlButtonLineSegment`     | interface | yes       | yes   |
| `WorkbenchControlButtonLineSegmentKind` | type      | yes       | yes   |
| `WorkbenchControlOptionRow`             | interface | yes       | yes   |
| `WorkbenchControlOptionToken`           | interface | yes       | yes   |
| `WorkbenchMobileCommandAction`          | type      | yes       | yes   |
| `workbenchMobileCommandStripItemsInto`  | function  | no        | yes   |
| `WorkbenchMobileCommandStripOptions`    | interface | yes       | yes   |
| `wrappedControlOptionRowCount`          | function  | no        | yes   |

### src/app/workbench_frame.ts

_Entrypoints: `.`, `./web`_

| Symbol                              | Kind      | Type Only | JSDoc |
| ----------------------------------- | --------- | --------- | ----- |
| `blitWorkbenchFrameCells`           | function  | no        | yes   |
| `buttonText`                        | function  | no        | yes   |
| `centerCellText`                    | function  | no        | yes   |
| `cleanWorkbenchFrameRowFingerprint` | function  | no        | yes   |
| `contrastText`                      | function  | no        | yes   |
| `fillFrameRect`                     | function  | no        | yes   |
| `fillFrameRow`                      | function  | no        | yes   |
| `fillStringFrameRect`               | function  | no        | yes   |
| `fitCellText`                       | function  | no        | yes   |
| `markWorkbenchFrameRowRendered`     | function  | no        | yes   |
| `parseHexColor`                     | function  | no        | yes   |
| `prepareWorkbenchFrame`             | function  | no        | yes   |
| `prepareWorkbenchRows`              | function  | no        | yes   |
| `renderFrameRow`                    | function  | no        | yes   |
| `renderFrameSlice`                  | function  | no        | yes   |
| `toStyledCells`                     | function  | no        | yes   |
| `updateWorkbenchLineSignals`        | function  | no        | yes   |
| `updateWorkbenchStringLineSignals`  | function  | no        | yes   |
| `WorkbenchFrame`                    | type      | yes       | yes   |
| `WorkbenchFrameBoxLine`             | interface | yes       | yes   |
| `workbenchFrameBoxLinesInto`        | function  | no        | yes   |
| `workbenchFrameRowRenderedHint`     | function  | no        | yes   |
| `WorkbenchFrameStyle`               | type      | yes       | yes   |
| `WorkbenchLineSignal`               | interface | yes       | yes   |
| `WorkbenchLineSignalUpdateStats`    | interface | yes       | yes   |
| `writeFrame`                        | function  | no        | yes   |
| `writeFrameCell`                    | function  | no        | yes   |
| `writeFrameCells`                   | function  | no        | yes   |
| `writeFrameCellsUnchecked`          | function  | no        | yes   |
| `writeStringFrameRow`               | function  | no        | yes   |

### src/app/workbench_layout.ts

_Entrypoints: `.`, `./web`_

| Symbol                                          | Kind      | Type Only | JSDoc |
| ----------------------------------------------- | --------- | --------- | ----- |
| `clampWorkbenchTileDensity`                     | function  | no        | yes   |
| `featuredWorkbenchWindowLayout`                 | function  | no        | yes   |
| `WorkbenchActiveRevealOptions`                  | interface | yes       | yes   |
| `WorkbenchActiveRevealTracker`                  | class     | no        | yes   |
| `workbenchAdaptiveTileOptions`                  | function  | no        | yes   |
| `WorkbenchAdaptiveTileOptions`                  | interface | yes       | yes   |
| `workbenchAdaptiveWindowLayout`                 | function  | no        | yes   |
| `WorkbenchAdaptiveWindowLayoutManager`          | interface | yes       | yes   |
| `WorkbenchAdaptiveWindowLayoutOptions`          | interface | yes       | yes   |
| `workbenchContentViewport`                      | function  | no        | yes   |
| `WorkbenchContentViewportOptions`               | interface | yes       | yes   |
| `workbenchFullscreenWindowRect`                 | function  | no        | yes   |
| `workbenchHorizontalScrollbarCellsInto`         | function  | no        | yes   |
| `WorkbenchLayoutEntryShape`                     | interface | yes       | yes   |
| `WorkbenchLayoutShape`                          | interface | yes       | yes   |
| `workbenchRevealActiveRowOffset`                | function  | no        | yes   |
| `WorkbenchRevealActiveRowOptions`               | interface | yes       | yes   |
| `WorkbenchScrollbarAxis`                        | type      | yes       | yes   |
| `WorkbenchScrollbarCell`                        | interface | yes       | yes   |
| `WorkbenchScrollbarRenderCommand`               | interface | yes       | yes   |
| `workbenchVerticalScrollbarCellsInto`           | function  | no        | yes   |
| `workbenchVerticalScrollbarRect`                | function  | no        | yes   |
| `WorkbenchVerticalScrollbarRectOptions`         | interface | yes       | yes   |
| `workbenchVisibleWindowRectsInto`               | function  | no        | yes   |
| `WorkbenchVisibleWindowRectsOptions`            | interface | yes       | yes   |
| `workbenchWindowLayout`                         | function  | no        | yes   |
| `WorkbenchWindowLayout`                         | interface | yes       | yes   |
| `WorkbenchWindowScrollbarRectOptions`           | interface | yes       | yes   |
| `workbenchWindowScrollbarRects`                 | function  | no        | yes   |
| `WorkbenchWindowScrollbarRects`                 | interface | yes       | yes   |
| `workbenchWindowScrollbarRenderCommandsInto`    | function  | no        | yes   |
| `WorkbenchWorkspaceScrollAdapter`               | interface | yes       | yes   |
| `workbenchWorkspaceScrollbarRenderCommandsInto` | function  | no        | yes   |
| `WorkbenchWorkspaceViewportController`          | class     | no        | yes   |
| `WorkbenchWorkspaceViewportUpdate`              | interface | yes       | yes   |

### src/app/workbench_menu.ts

_Entrypoints: `.`, `./web`_

| Symbol                                           | Kind      | Type Only | JSDoc |
| ------------------------------------------------ | --------- | --------- | ----- |
| `isWorkbenchMenuActivationKey`                   | function  | no        | yes   |
| `isWorkbenchMenuCloseKey`                        | function  | no        | yes   |
| `layoutWorkbenchHeader`                          | function  | no        | yes   |
| `layoutWorkbenchHeaderInto`                      | function  | no        | yes   |
| `layoutWorkbenchMenuBarHits`                     | function  | no        | yes   |
| `layoutWorkbenchMenuBarHitsInto`                 | function  | no        | yes   |
| `layoutWorkbenchTopMenuItemRect`                 | function  | no        | yes   |
| `moveWorkbenchMenuIndex`                         | function  | no        | yes   |
| `MoveWorkbenchMenuIndexOptions`                  | interface | yes       | yes   |
| `projectWorkbenchStandardTopMenuState`           | function  | no        | yes   |
| `resolveWorkbenchGlobalKey`                      | function  | no        | yes   |
| `resolveWorkbenchMenuFocusKey`                   | function  | no        | yes   |
| `resolveWorkbenchScreenDropdownKey`              | function  | no        | yes   |
| `WorkbenchGlobalKey`                             | interface | yes       | yes   |
| `WorkbenchGlobalKeyAction`                       | type      | yes       | yes   |
| `WorkbenchHeaderLayout`                          | interface | yes       | yes   |
| `WorkbenchHeaderLayoutOptions`                   | interface | yes       | yes   |
| `WorkbenchMenuBarHitLayout`                      | interface | yes       | yes   |
| `WorkbenchMenuBarHitLayoutOptions`               | interface | yes       | yes   |
| `WorkbenchMenuBarItemShape`                      | interface | yes       | yes   |
| `WorkbenchMenuFocusKeyAction`                    | type      | yes       | yes   |
| `WorkbenchMenuKey`                               | interface | yes       | yes   |
| `WorkbenchScreenDropdownKey`                     | interface | yes       | yes   |
| `WorkbenchScreenDropdownKeyAction`               | type      | yes       | yes   |
| `WorkbenchScreenDropdownKeyOptions`              | interface | yes       | yes   |
| `WorkbenchStandardTopMenuDropdownEntry`          | interface | yes       | yes   |
| `workbenchStandardTopMenuDropdownOverlayInto`    | function  | no        | yes   |
| `WorkbenchStandardTopMenuDropdownOverlayOptions` | interface | yes       | yes   |
| `WorkbenchStandardTopMenuId`                     | type      | yes       | yes   |
| `workbenchStandardTopMenuIdForItem`              | function  | no        | yes   |
| `WorkbenchStandardTopMenuSignalState`            | interface | yes       | yes   |
| `WorkbenchTopMenuController`                     | class     | no        | yes   |
| `WorkbenchTopMenuControllerOptions`              | interface | yes       | yes   |
| `WorkbenchTopMenuDropdownOverlay`                | interface | yes       | yes   |
| `workbenchTopMenuDropdownOverlayInto`            | function  | no        | yes   |
| `WorkbenchTopMenuDropdownOverlayOptions`         | interface | yes       | yes   |
| `WorkbenchTopMenuInspection`                     | interface | yes       | yes   |
| `WorkbenchTopMenuItemRectOptions`                | interface | yes       | yes   |
| `WorkbenchTopMenuVisibleSlice`                   | interface | yes       | yes   |

### src/app/workbench_overlay.ts

_Entrypoints: `.`, `./web`_

| Symbol                                       | Kind      | Type Only | JSDoc |
| -------------------------------------------- | --------- | --------- | ----- |
| `layoutWorkbenchModal`                       | function  | no        | yes   |
| `layoutWorkbenchPopover`                     | function  | no        | yes   |
| `WorkbenchDropdownOverlayRenderCommand`      | interface | yes       | yes   |
| `workbenchDropdownOverlayRenderCommandsInto` | function  | no        | yes   |
| `WorkbenchDropdownOverlayRenderOptions`      | interface | yes       | yes   |
| `WorkbenchModalActionButtonOptions`          | interface | yes       | yes   |
| `workbenchModalActionButtonsInto`            | function  | no        | yes   |
| `WorkbenchModalLayout`                       | interface | yes       | yes   |
| `WorkbenchModalLayoutOptions`                | interface | yes       | yes   |
| `WorkbenchModalRowRenderCommand`             | interface | yes       | yes   |
| `workbenchModalRowRenderCommandsInto`        | function  | no        | yes   |
| `WorkbenchModalRowRenderOptions`             | interface | yes       | yes   |
| `WorkbenchPopoverLayoutOptions`              | interface | yes       | yes   |

### src/app/workbench_panel_workspace_store.ts

_Entrypoints: `.`, `./web`_

| Symbol                                       | Kind      | Type Only | JSDoc |
| -------------------------------------------- | --------- | --------- | ----- |
| `hydrateWorkbenchPanelWorkspaceStore`        | function  | no        | yes   |
| `HydrateWorkbenchPanelWorkspaceStoreOptions` | interface | yes       | yes   |
| `loadWorkbenchPanelWorkspaceCache`           | function  | no        | yes   |
| `LoadWorkbenchPanelWorkspaceCacheOptions`    | interface | yes       | yes   |
| `persistWorkbenchPanelWorkspaceState`        | function  | no        | yes   |
| `PersistWorkbenchPanelWorkspaceStateOptions` | interface | yes       | yes   |
| `WorkbenchPanelWorkspaceCache`               | interface | yes       | yes   |
| `WorkbenchPanelWorkspaceStorageDiagnostics`  | interface | yes       | yes   |

### src/app/workbench_shelf.ts

_Entrypoints: `.`, `./web`_

| Symbol                                | Kind      | Type Only | JSDoc |
| ------------------------------------- | --------- | --------- | ----- |
| `createWorkbenchShelfLayoutBuffers`   | function  | no        | yes   |
| `layoutWorkbenchShelf`                | function  | no        | yes   |
| `layoutWorkbenchShelfInto`            | function  | no        | yes   |
| `layoutWorkbenchTabs`                 | function  | no        | yes   |
| `layoutWorkbenchTabsInto`             | function  | no        | yes   |
| `WorkbenchShelfButton`                | interface | yes       | yes   |
| `WorkbenchShelfButtonRenderCommand`   | interface | yes       | yes   |
| `WorkbenchShelfButtonRowItem`         | interface | yes       | yes   |
| `workbenchShelfEntriesInto`           | function  | no        | yes   |
| `WorkbenchShelfLayout`                | interface | yes       | yes   |
| `WorkbenchShelfLayoutBuffers`         | interface | yes       | yes   |
| `WorkbenchShelfLayoutOptions`         | interface | yes       | yes   |
| `WorkbenchShelfPrefixRenderCommand`   | interface | yes       | yes   |
| `WorkbenchShelfRenderCommand`         | type      | yes       | yes   |
| `workbenchShelfRenderCommandsInto`    | function  | no        | yes   |
| `WorkbenchShelfSource`                | interface | yes       | yes   |
| `WorkbenchShelfWindowInspectionShape` | interface | yes       | yes   |
| `workbenchTabEntriesInto`             | function  | no        | yes   |
| `WorkbenchTabLayoutOptions`           | interface | yes       | yes   |
| `WorkbenchTabSource`                  | interface | yes       | yes   |

### src/app/workbench_shell.ts

_Entrypoints: `.`, `./web`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `borderBoxOnGround`        | function  | no        | yes   |
| `fillOnGround`             | function  | no        | yes   |
| `paintShellMenuPanel`      | function  | no        | yes   |
| `paintShellSwitcher`       | function  | no        | yes   |
| `paintShellTabStrip`       | function  | no        | yes   |
| `paintShellWindowChrome`   | function  | no        | yes   |
| `ShellBorderGlyphs`        | interface | yes       | yes   |
| `shellFitSpan`             | function  | no        | yes   |
| `shellFitText`             | function  | no        | yes   |
| `shellGlyphColumns`        | function  | no        | yes   |
| `ShellGround`              | type      | yes       | yes   |
| `ShellMenuPanelOptions`    | interface | yes       | yes   |
| `ShellMenuRow`             | interface | yes       | yes   |
| `ShellRgb`                 | type      | yes       | yes   |
| `ShellStyle`               | interface | yes       | yes   |
| `ShellSurface`             | interface | yes       | yes   |
| `ShellSwitcherColors`      | interface | yes       | yes   |
| `ShellSwitcherOptions`     | interface | yes       | yes   |
| `ShellTab`                 | interface | yes       | yes   |
| `ShellTabRect`             | interface | yes       | yes   |
| `ShellTabStripColors`      | interface | yes       | yes   |
| `ShellWindowChromeOptions` | interface | yes       | yes   |
| `solidGround`              | function  | no        | yes   |
| `writeOnGround`            | function  | no        | yes   |

### src/app/workbench_status.ts

_Entrypoints: `.`, `./web`_

| Symbol                                  | Kind      | Type Only | JSDoc |
| --------------------------------------- | --------- | --------- | ----- |
| `appendBoundedWorkbenchLogRow`          | function  | no        | yes   |
| `formatWorkbenchDiagnosticLogEntry`     | function  | no        | yes   |
| `formatWorkbenchDiagnosticStatus`       | function  | no        | yes   |
| `initialWorkbenchDiagnosticLogRows`     | function  | no        | yes   |
| `subscribeWorkbenchDiagnosticLog`       | function  | no        | yes   |
| `workbenchCompactStatusDiagnostics`     | function  | no        | yes   |
| `WorkbenchDiagnosticFormatOptions`      | interface | yes       | yes   |
| `workbenchEmptyWorkspaceMessage`        | function  | no        | yes   |
| `WorkbenchEmptyWorkspaceMessageOptions` | interface | yes       | yes   |
| `WorkbenchEmptyWorkspaceWindowState`    | interface | yes       | yes   |
| `workbenchHeaderHelp`                   | function  | no        | yes   |
| `WorkbenchHeaderHelpOptions`            | interface | yes       | yes   |
| `WorkbenchHelpProfile`                  | type      | yes       | yes   |
| `workbenchHelpRows`                     | function  | no        | yes   |
| `WorkbenchHelpRowsOptions`              | interface | yes       | yes   |
| `workbenchStatusLeft`                   | function  | no        | yes   |
| `WorkbenchStatusLeftOptions`            | interface | yes       | yes   |
| `workbenchStatusLine`                   | function  | no        | yes   |
| `WorkbenchStatusLineOptions`            | interface | yes       | yes   |
| `WorkbenchStatusShortcutProfile`        | type      | yes       | yes   |
| `workbenchStatusShortcuts`              | function  | no        | yes   |
| `WorkbenchStatusSnapshot`               | interface | yes       | yes   |
| `workbenchStatusSnapshotLine`           | function  | no        | yes   |
| `WorkbenchStatusSnapshotLineOptions`    | interface | yes       | yes   |
| `workbenchTileDensityLabel`             | function  | no        | yes   |
| `WorkbenchTileDensityLabel`             | type      | yes       | yes   |

### src/app/workbench_terminal.ts

_Entrypoints: `.`, `./web`_

| Symbol                                           | Kind      | Type Only | JSDoc |
| ------------------------------------------------ | --------- | --------- | ----- |
| `applyWorkbenchTerminalSearchPromptInput`        | function  | no        | yes   |
| `createWorkbenchShellSession`                    | function  | no        | yes   |
| `nextWorkbenchTerminalSessionId`                 | function  | no        | yes   |
| `resolveWorkbenchShellBackend`                   | function  | no        | yes   |
| `resolveWorkbenchTerminalInputModeToggle`        | function  | no        | yes   |
| `resolveWorkbenchTerminalOutputKeyAction`        | function  | no        | yes   |
| `resolveWorkbenchTerminalProcessInputModeToggle` | function  | no        | yes   |
| `resolveWorkbenchTerminalShellInputModeToggle`   | function  | no        | yes   |
| `resolveWorkbenchTerminalShellKeyAction`         | function  | no        | yes   |
| `WORKBENCH_TERMINAL_OUTPUT_TOOLBAR_ACTIONS`      | const     | no        | yes   |
| `WORKBENCH_TERMINAL_TOOLBAR_ACTIONS`             | const     | no        | yes   |
| `WorkbenchShellBackendResolution`                | interface | yes       | yes   |
| `WorkbenchShellBackendResolverOptions`           | interface | yes       | yes   |
| `WorkbenchShellSession`                          | interface | yes       | yes   |
| `WorkbenchShellSessionOptions`                   | interface | yes       | yes   |
| `WorkbenchTerminalCopyRowProjection`             | interface | yes       | yes   |
| `workbenchTerminalCopyRowsInto`                  | function  | no        | yes   |
| `WorkbenchTerminalCopyRowsOptions`               | interface | yes       | yes   |
| `WorkbenchTerminalCopySelection`                 | interface | yes       | yes   |
| `WorkbenchTerminalInputModeToggleOptions`        | interface | yes       | yes   |
| `WorkbenchTerminalInputModeToggleResult`         | interface | yes       | yes   |
| `WorkbenchTerminalKey`                           | interface | yes       | yes   |
| `workbenchTerminalOutputRowsInto`                | function  | no        | yes   |
| `WorkbenchTerminalOutputRowsOptions`             | interface | yes       | yes   |
| `WorkbenchTerminalOutputToolbarAction`           | type      | yes       | yes   |
| `WorkbenchTerminalOutputToolbarItemOptions`      | interface | yes       | yes   |
| `workbenchTerminalOutputToolbarItemsInto`        | function  | no        | yes   |
| `WorkbenchTerminalOutputToolbarState`            | interface | yes       | yes   |
| `WorkbenchTerminalOutputWindowRow`               | interface | yes       | yes   |
| `workbenchTerminalOutputWindowRowsInto`          | function  | no        | yes   |
| `WorkbenchTerminalOutputWindowRowsOptions`       | interface | yes       | yes   |
| `WorkbenchTerminalPaneProjection`                | interface | yes       | yes   |
| `WorkbenchTerminalPaneProjectionOptions`         | interface | yes       | yes   |
| `workbenchTerminalPaneProjectionsInto`           | function  | no        | yes   |
| `WorkbenchTerminalPaneTitleContrast`             | type      | yes       | yes   |
| `WorkbenchTerminalPaneTitleRenderCommand`        | interface | yes       | yes   |
| `workbenchTerminalPaneTitleRenderCommandsInto`   | function  | no        | yes   |
| `WorkbenchTerminalPaneTitleTheme`                | interface | yes       | yes   |
| `WorkbenchTerminalProtocolHeaderOptions`         | interface | yes       | yes   |
| `workbenchTerminalProtocolHeaderRowsInto`        | function  | no        | yes   |
| `workbenchTerminalSearchModalBody`               | function  | no        | yes   |
| `WorkbenchTerminalSearchModalBodyOptions`        | interface | yes       | yes   |
| `WorkbenchTerminalSearchModalScrollbackState`    | interface | yes       | yes   |
| `WorkbenchTerminalSearchPromptInputOptions`      | interface | yes       | yes   |
| `WorkbenchTerminalSessionIdOptions`              | interface | yes       | yes   |
| `WorkbenchTerminalSessionIdSource`               | interface | yes       | yes   |
| `WorkbenchTerminalSessionTab`                    | interface | yes       | yes   |
| `WorkbenchTerminalSessionTabOptions`             | interface | yes       | yes   |
| `WorkbenchTerminalSessionTabPlacement`           | interface | yes       | yes   |
| `WorkbenchTerminalSessionTabRenderCommand`       | interface | yes       | yes   |
| `workbenchTerminalSessionTabRenderCommandsInto`  | function  | no        | yes   |
| `workbenchTerminalSessionTabsInto`               | function  | no        | yes   |
| `WorkbenchTerminalSessionTabSource`              | interface | yes       | yes   |
| `workbenchTerminalSessionTabSourcesInto`         | function  | no        | yes   |
| `workbenchTerminalSessionTitleFromId`            | function  | no        | yes   |
| `WorkbenchTerminalSessionTitleOptions`           | interface | yes       | yes   |
| `WorkbenchTerminalShellHeaderRow`                | interface | yes       | yes   |
| `workbenchTerminalShellHeaderRowsInto`           | function  | no        | yes   |
| `WorkbenchTerminalShellHeaderRowsOptions`        | interface | yes       | yes   |
| `WorkbenchTerminalToolbarAction`                 | type      | yes       | yes   |
| `WorkbenchTerminalToolbarItemOptions`            | interface | yes       | yes   |
| `workbenchTerminalToolbarItemsInto`              | function  | no        | yes   |
| `WorkbenchTerminalToolbarScrollbackSource`       | interface | yes       | yes   |
| `WorkbenchTerminalToolbarState`                  | interface | yes       | yes   |
| `workbenchTerminalToolbarStateFromSnapshot`      | function  | no        | yes   |
| `WorkbenchTerminalToolbarStateSnapshot`          | interface | yes       | yes   |

### src/app/workbench_text.ts

_Entrypoints: `.`, `./web`_

| Symbol                             | Kind      | Type Only | JSDoc |
| ---------------------------------- | --------- | --------- | ----- |
| `applyWorkbenchTextPromptInput`    | function  | no        | yes   |
| `compactSpaces`                    | function  | no        | yes   |
| `dispatchWorkbenchTextPromptInput` | function  | no        | yes   |
| `maxTextWidth`                     | function  | no        | yes   |
| `maxTextWidthBy`                   | function  | no        | yes   |
| `maxTrimmedTextWidth`              | function  | no        | yes   |
| `visibleMenuSlice`                 | function  | no        | yes   |
| `VisibleMenuSlice`                 | interface | yes       | yes   |
| `visibleMenuSliceInto`             | function  | no        | yes   |
| `visibleProjectedMenuSliceInto`    | function  | no        | yes   |
| `WorkbenchTextPromptInputAction`   | type      | yes       | yes   |
| `WorkbenchTextPromptInputEvent`    | interface | yes       | yes   |
| `WorkbenchTextPromptInputHandlers` | interface | yes       | yes   |
| `WorkbenchTextPromptInputOptions`  | interface | yes       | yes   |
| `WorkbenchTextPromptInputResult`   | interface | yes       | yes   |
| `wrapPlainText`                    | function  | no        | yes   |
| `wrapPlainTextInto`                | function  | no        | yes   |

### src/app/workbench_three_terminal_pressure.ts

_Entrypoints: `.`, `./web`_

| Symbol                                            | Kind      | Type Only | JSDoc |
| ------------------------------------------------- | --------- | --------- | ----- |
| `createWorkbenchThreeTerminalPressureState`       | function  | no        | yes   |
| `formatWorkbenchThreeTerminalPressureUpdateLog`   | function  | no        | yes   |
| `resolveWorkbenchThreeTerminalPressureBudget`     | function  | no        | yes   |
| `resolveWorkbenchThreeTerminalPressureBudgetInto` | function  | no        | yes   |
| `resolveWorkbenchThreeTerminalPressureUpdate`     | function  | no        | yes   |
| `resolveWorkbenchThreeTerminalPressureUpdateInto` | function  | no        | yes   |
| `shouldApplyWorkbenchThreeTerminalPressureSample` | function  | no        | yes   |
| `shouldCountWorkbenchThreeGridPressure`           | function  | no        | yes   |
| `WorkbenchThreeCadenceWindow`                     | interface | yes       | yes   |
| `workbenchThreeFrameIntervalForCells`             | function  | no        | yes   |
| `WorkbenchThreeFrameIntervalOptions`              | interface | yes       | yes   |
| `WorkbenchThreeGridPressureTelemetry`             | interface | yes       | yes   |
| `WorkbenchThreeLiveCadenceOptions`                | interface | yes       | yes   |
| `WorkbenchThreePressureSampleScope`               | interface | yes       | yes   |
| `workbenchThreeShouldUseLiveCadence`              | function  | no        | yes   |
| `WorkbenchThreeTerminalByteRateOptions`           | interface | yes       | yes   |
| `workbenchThreeTerminalBytesPerSecond`            | function  | no        | yes   |
| `WorkbenchThreeTerminalPressureOptions`           | interface | yes       | yes   |
| `WorkbenchThreeTerminalPressureResult`            | interface | yes       | yes   |
| `WorkbenchThreeTerminalPressureState`             | interface | yes       | yes   |
| `WorkbenchThreeTerminalPressureUpdateLogOptions`  | interface | yes       | yes   |
| `WorkbenchThreeTerminalPressureUpdateOptions`     | interface | yes       | yes   |
| `WorkbenchThreeTerminalPressureUpdateResult`      | interface | yes       | yes   |
| `WorkbenchThreeWindowInteractivityOptions`        | interface | yes       | yes   |
| `workbenchThreeWindowIsInteractive`               | function  | no        | yes   |

### src/app/workbench_titlebar.ts

_Entrypoints: `.`, `./web`_

| Symbol                                      | Kind      | Type Only | JSDoc |
| ------------------------------------------- | --------- | --------- | ----- |
| `createWorkbenchTitlebarLayout`             | function  | no        | yes   |
| `layoutWorkbenchTitlebar`                   | function  | no        | yes   |
| `layoutWorkbenchTitlebarInto`               | function  | no        | yes   |
| `WorkbenchTitlebarButton`                   | interface | yes       | yes   |
| `WorkbenchTitlebarButtonKind`               | type      | yes       | yes   |
| `WorkbenchTitlebarButtonRenderCommand`      | interface | yes       | yes   |
| `workbenchTitlebarButtonRenderCommandsInto` | function  | no        | yes   |
| `WorkbenchTitlebarButtonTone`               | type      | yes       | yes   |
| `WorkbenchTitlebarLayout`                   | interface | yes       | yes   |
| `WorkbenchTitlebarLayoutOptions`            | interface | yes       | yes   |

### src/app/workbench_window_host.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                                 | Kind      | Type Only | JSDoc |
| -------------------------------------- | --------- | --------- | ----- |
| `createWorkbenchWindowHostController`  | function  | no        | yes   |
| `createWorkbenchWindowHostRoot`        | function  | no        | yes   |
| `WorkbenchWindowChromeControl`         | interface | yes       | yes   |
| `WorkbenchWindowChromeProjection`      | interface | yes       | yes   |
| `WorkbenchWindowHostCommand`           | type      | yes       | yes   |
| `WorkbenchWindowHostController`        | class     | no        | yes   |
| `WorkbenchWindowHostControllerOptions` | interface | yes       | yes   |
| `WorkbenchWindowHostDescriptor`        | interface | yes       | yes   |
| `WorkbenchWindowHostInspection`        | interface | yes       | yes   |
| `WorkbenchWindowHostProjection`        | interface | yes       | yes   |
| `WorkbenchWindowHostProjectionOptions` | interface | yes       | yes   |
| `WorkbenchWindowHostResult`            | interface | yes       | yes   |
| `WorkbenchWindowSemanticNode`          | interface | yes       | yes   |
| `WorkbenchWindowSeparatorProjection`   | interface | yes       | yes   |
| `WorkbenchWindowShelfItem`             | interface | yes       | yes   |
| `WorkbenchWindowSnapPreview`           | interface | yes       | yes   |
| `WorkbenchWindowSwitcherProjection`    | interface | yes       | yes   |

### src/app/workbench_window_registry.ts

_Entrypoints: `.`, `./web`_

| Symbol                                            | Kind      | Type Only | JSDoc |
| ------------------------------------------------- | --------- | --------- | ----- |
| `createWorkbenchVisualizationWindowOptions`       | function  | no        | yes   |
| `createWorkbenchWindowOptions`                    | function  | no        | yes   |
| `isWorkbenchVisualizationWindowId`                | function  | no        | yes   |
| `isWorkbenchWindowOptionLoaded`                   | function  | no        | yes   |
| `WorkbenchBuiltInWindowToggleOptions`             | interface | yes       | yes   |
| `workbenchBuiltInWindowTogglePlan`                | function  | no        | yes   |
| `WorkbenchBuiltInWindowTogglePlan`                | interface | yes       | yes   |
| `workbenchVisualizationIdFromWindowId`            | function  | no        | yes   |
| `WorkbenchVisualizationOptionSource`              | interface | yes       | yes   |
| `workbenchVisualizationWindowId`                  | function  | no        | yes   |
| `WorkbenchVisualizationWindowRegistration`        | interface | yes       | yes   |
| `WorkbenchVisualizationWindowRegistrationOptions` | interface | yes       | yes   |
| `workbenchVisualizationWindowRegistrationPlan`    | function  | no        | yes   |
| `WorkbenchVisualizationWindowRegistrationPlan`    | interface | yes       | yes   |
| `WorkbenchVisualizationWindowToggleOptions`       | interface | yes       | yes   |
| `workbenchVisualizationWindowTogglePlan`          | function  | no        | yes   |
| `WorkbenchVisualizationWindowTogglePlan`          | type      | yes       | yes   |
| `WorkbenchWindowOption`                           | interface | yes       | yes   |
| `WorkbenchWindowOptionCatalogInput`               | interface | yes       | yes   |
| `WorkbenchWindowOptionGroup`                      | type      | yes       | yes   |
| `workbenchWindowOptionMenuLabel`                  | function  | no        | yes   |
| `workbenchWindowOptionMenuLabelsInto`             | function  | no        | yes   |
| `workbenchWindowOptionMinimums`                   | function  | no        | yes   |
| `WorkbenchWindowOptionMinimums`                   | interface | yes       | yes   |
| `workbenchWindowOptionTogglePlan`                 | function  | no        | yes   |
| `WorkbenchWindowOptionTogglePlan`                 | type      | yes       | yes   |
| `workbenchWindowOptionWindowId`                   | function  | no        | yes   |

### src/app/workbench_workspace_store.ts

_Entrypoints: `.`, `./web`_

| Symbol                                    | Kind      | Type Only | JSDoc |
| ----------------------------------------- | --------- | --------- | ----- |
| `createWorkbenchWorkspaceStore`           | function  | no        | yes   |
| `loadWorkbenchWorkspaceStorage`           | function  | no        | yes   |
| `persistWorkbenchWorkspaceStorage`        | function  | no        | yes   |
| `WorkbenchWorkspaceStorageDiagnosticSink` | interface | yes       | yes   |
| `WorkbenchWorkspaceStorageOptions`        | interface | yes       | yes   |
| `WorkbenchWorkspaceStoreOptions`          | interface | yes       | yes   |

### src/app/workbench_workspace.ts

_Entrypoints: `.`, `./web`_

| Symbol                                         | Kind      | Type Only | JSDoc |
| ---------------------------------------------- | --------- | --------- | ----- |
| `defaultWorkbenchMinimizedState`               | function  | no        | yes   |
| `deleteWorkbenchWorkspace`                     | function  | no        | yes   |
| `findWorkbenchWorkspace`                       | function  | no        | yes   |
| `normalizeWorkbenchPanelWorkspaceState`        | function  | no        | yes   |
| `NormalizeWorkbenchPanelWorkspaceStateOptions` | interface | yes       | yes   |
| `normalizeWorkbenchWorkspaceName`              | function  | no        | yes   |
| `normalizeWorkbenchWorkspaces`                 | function  | no        | yes   |
| `NormalizeWorkbenchWorkspacesOptions`          | interface | yes       | yes   |
| `normalizeWorkbenchWorkspaceStorage`           | function  | no        | yes   |
| `renameWorkbenchWorkspace`                     | function  | no        | yes   |
| `serializeWorkbenchWorkspaces`                 | function  | no        | yes   |
| `upsertWorkbenchWorkspace`                     | function  | no        | yes   |
| `WORKBENCH_WORKSPACE_STORAGE_VERSION`          | const     | no        | yes   |
| `WorkbenchPanelWorkspaceState`                 | interface | yes       | yes   |
| `WorkbenchWorkspace`                           | interface | yes       | yes   |
| `WorkbenchWorkspaceManagedWindow`              | interface | yes       | yes   |
| `WorkbenchWorkspaceStorage`                    | interface | yes       | yes   |
| `WorkbenchWorkspaceWindow`                     | interface | yes       | yes   |
| `workbenchWorkspaceWindowEntries`              | function  | no        | yes   |

### src/app/workbench/mod.ts

_Entrypoints: `.`, `./web`_

| Re-export Target                               | Kind | Names |
| ---------------------------------------------- | ---- | ----- |
| `src/app/hit_targets.ts`                       | star | -     |
| `src/app/workbench_frame.ts`                   | star | -     |
| `src/app/workbench_ansi_screen.ts`             | star | -     |
| `src/app/workbench_button_style.ts`            | star | -     |
| `src/app/workbench_control_layout.ts`          | star | -     |
| `src/app/workbench_layout.ts`                  | star | -     |
| `src/app/workbench_menu.ts`                    | star | -     |
| `src/app/workbench_overlay.ts`                 | star | -     |
| `src/app/workbench_panel_workspace_store.ts`   | star | -     |
| `src/app/workbench_shelf.ts`                   | star | -     |
| `src/app/workbench_status.ts`                  | star | -     |
| `src/app/workbench_terminal.ts`                | star | -     |
| `src/app/workbench_titlebar.ts`                | star | -     |
| `src/app/workbench_text.ts`                    | star | -     |
| `src/app/workbench_three_terminal_pressure.ts` | star | -     |
| `src/app/workbench_window_registry.ts`         | star | -     |
| `src/app/workbench_window_host.ts`             | star | -     |
| `src/app/workbench_workspace.ts`               | star | -     |
| `src/app/workbench_workspace_store.ts`         | star | -     |

_No direct exported symbols._

### src/app/worker_plugin_host.ts

_Entrypoints: `.`, `./web`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `createWorkerPluginInstance` | function  | no        | yes   |
| `WorkerPluginInstance`       | class     | no        | yes   |
| `WorkerPluginLimits`         | interface | yes       | yes   |
| `WorkerRpcMethod`            | interface | yes       | yes   |
| `WorkerRpcOutcome`           | type      | yes       | yes   |

### src/canvas/box.ts

_Entrypoints: `.`, `./web`_

| Symbol             | Kind      | Type Only | JSDoc |
| ------------------ | --------- | --------- | ----- |
| `BoxObject`        | class     | no        | yes   |
| `BoxObjectOptions` | interface | yes       | yes   |

### src/canvas/canvas.ts

_Entrypoints: `.`, `./web`_

| Symbol              | Kind      | Type Only | JSDoc |
| ------------------- | --------- | --------- | ----- |
| `Canvas`            | class     | no        | yes   |
| `CanvasEventMap`    | type      | yes       | yes   |
| `CanvasOptions`     | interface | yes       | yes   |
| `CanvasRenderStats` | interface | yes       | yes   |

### src/canvas/dirty_region.ts

_Entrypoints: `.`, `./web`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `DirtyRegion`                  | class     | no        | yes   |
| `DirtyRowSegment`              | interface | yes       | yes   |
| `mergeDirtyRowSegmentsInPlace` | function  | no        | yes   |

### src/canvas/draw_object.ts

_Entrypoints: `.`, `./web`_

| Symbol              | Kind      | Type Only | JSDoc |
| ------------------- | --------- | --------- | ----- |
| `DrawObject`        | class     | no        | yes   |
| `DrawObjectOptions` | interface | yes       | yes   |

### src/canvas/mod.ts

_Entrypoints: `.`, `./web`_

| Re-export Target               | Kind | Names |
| ------------------------------ | ---- | ----- |
| `src/canvas/box.ts`            | star | -     |
| `src/canvas/text.ts`           | star | -     |
| `src/canvas/canvas.ts`         | star | -     |
| `src/canvas/dirty_region.ts`   | star | -     |
| `src/canvas/draw_object.ts`    | star | -     |
| `src/canvas/sink.ts`           | star | -     |
| `src/canvas/spatial_index.ts`  | star | -     |
| `src/canvas/pixel_samplers.ts` | star | -     |

_No direct exported symbols._

### src/canvas/pixel_samplers.ts

_Entrypoints: `.`, `./web`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `captureSampledFrame`     | function  | no        | yes   |
| `compareSqueezeSamplers`  | function  | no        | yes   |
| `createSamplerBackend`    | function  | no        | yes   |
| `DENSITY_RAMP`            | const     | no        | yes   |
| `orthographicCellFrustum` | function  | no        | yes   |
| `perspectiveCellAspect`   | function  | no        | yes   |
| `PIXEL_SAMPLER_LIMITS`    | const     | no        | yes   |
| `preSqueezePixels`        | function  | no        | yes   |
| `SampledCell`             | interface | yes       | yes   |
| `sampleDensityRamp`       | function  | no        | yes   |
| `SampledFrame`            | interface | yes       | yes   |
| `sampleQuadrants`         | function  | no        | yes   |
| `SAMPLER_FIXTURES`        | const     | no        | yes   |
| `SamplerBackend`          | interface | yes       | yes   |
| `samplerColorError`       | function  | no        | yes   |
| `SamplerGrid`             | interface | yes       | yes   |
| `SamplerMode`             | type      | yes       | yes   |
| `SamplerPixels`           | interface | yes       | yes   |
| `samplerStatistics`       | function  | no        | yes   |

### src/canvas/sink.ts

_Entrypoints: `.`, `./web`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `AnsiCanvasSink`          | class     | no        | yes   |
| `AnsiCanvasSinkOptions`   | interface | yes       | yes   |
| `AnsiFlushTelemetry`      | interface | yes       | yes   |
| `CanvasCellSink`          | interface | yes       | yes   |
| `CanvasCellUpdate`        | interface | yes       | yes   |
| `CanvasRowRangeUpdate`    | interface | yes       | yes   |
| `CanvasStdout`            | interface | yes       | yes   |
| `coalesceCanvasRowRanges` | function  | no        | yes   |
| `MemoryCanvasSink`        | class     | no        | yes   |

### src/canvas/spatial_index.ts

_Entrypoints: `.`, `./web`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `DrawObjectSpatialIndex`      | class     | no        | yes   |
| `DrawObjectSpatialIndexStats` | interface | yes       | yes   |

### src/canvas/text.ts

_Entrypoints: `.`, `./web`_

| Symbol              | Kind      | Type Only | JSDoc |
| ------------------- | --------- | --------- | ----- |
| `TextObject`        | class     | no        | yes   |
| `TextObjectOptions` | interface | yes       | yes   |
| `TextRectangle`     | type      | yes       | yes   |

### src/canvas/three_ascii.ts

_Entrypoints: `./web`, `./three-ascii`_

| Symbol                           | Kind      | Type Only | JSDoc |
| -------------------------------- | --------- | --------- | ----- |
| `buildFallbackGrid`              | function  | no        | yes   |
| `formatThreeAsciiFallbackDetail` | function  | no        | yes   |
| `ThreeAsciiGridRenderer`         | interface | yes       | yes   |
| `ThreeAsciiObject`               | class     | no        | yes   |
| `ThreeAsciiObjectOptions`        | interface | yes       | yes   |
| `ThreeAsciiRendererFactory`      | type      | yes       | yes   |

### src/component.ts

_Entrypoints: `.`_

| Symbol             | Kind      | Type Only | JSDoc |
| ------------------ | --------- | --------- | ----- |
| `Component`        | class     | no        | yes   |
| `ComponentOptions` | interface | yes       | yes   |
| `ComponentState`   | type      | yes       | yes   |
| `Interaction`      | interface | yes       | yes   |

### src/components/box.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol | Kind  | Type Only | JSDoc |
| ------ | ----- | --------- | ----- |
| `Box`  | class | no        | yes   |

### src/components/breadcrumbs.ts

_Entrypoints: `.`, `./web`_

| Symbol               | Kind      | Type Only | JSDoc |
| -------------------- | --------- | --------- | ----- |
| `BreadcrumbItem`     | interface | yes       | yes   |
| `Breadcrumbs`        | class     | no        | yes   |
| `BreadcrumbsOptions` | interface | yes       | yes   |
| `renderBreadcrumbs`  | function  | no        | yes   |

### src/components/button.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `Button`                  | class     | no        | yes   |
| `ButtonController`        | class     | no        | yes   |
| `ButtonControllerOptions` | interface | yes       | yes   |
| `ButtonInspection`        | interface | yes       | yes   |
| `ButtonOptions`           | interface | yes       | yes   |

### src/components/catalog.ts

_Entrypoints: `.`, `./web`_

| Symbol                            | Kind      | Type Only | JSDoc |
| --------------------------------- | --------- | --------- | ----- |
| `componentCapabilities`           | function  | no        | yes   |
| `ComponentCapability`             | type      | yes       | yes   |
| `componentCatalog`                | const     | no        | yes   |
| `ComponentCatalogEntry`           | interface | yes       | yes   |
| `ComponentCatalogInspection`      | interface | yes       | yes   |
| `ComponentCatalogMarkdownOptions` | interface | yes       | yes   |
| `ComponentCatalogQuery`           | interface | yes       | yes   |
| `ComponentCatalogReport`          | interface | yes       | yes   |
| `ComponentCatalogReportOptions`   | interface | yes       | yes   |
| `componentCategories`             | function  | no        | yes   |
| `ComponentCategory`               | type      | yes       | yes   |
| `componentsByCategory`            | function  | no        | yes   |
| `componentsWithCapability`        | function  | no        | yes   |
| `createComponentCatalogReport`    | function  | no        | yes   |
| `findComponent`                   | function  | no        | yes   |
| `formatComponentCatalogMarkdown`  | function  | no        | yes   |
| `inspectComponentCatalog`         | function  | no        | yes   |
| `listComponents`                  | function  | no        | yes   |
| `queryComponents`                 | function  | no        | yes   |

### src/components/chart.ts

_Entrypoints: `.`, `./web`_

| Symbol           | Kind      | Type Only | JSDoc |
| ---------------- | --------- | --------- | ----- |
| `Chart`          | class     | no        | yes   |
| `ChartOptions`   | interface | yes       | yes   |
| `renderBarChart` | function  | no        | yes   |

### src/components/checkbox.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `CheckBox`                  | class     | no        | yes   |
| `CheckBoxController`        | class     | no        | yes   |
| `CheckBoxControllerOptions` | interface | yes       | yes   |
| `CheckBoxInspection`        | interface | yes       | yes   |
| `CheckBoxOptions`           | interface | yes       | yes   |
| `Mark`                      | enum      | no        | yes   |
| `renderCheckBoxMark`        | function  | no        | yes   |

### src/components/color_picker.ts

_Entrypoints: `.`, `./web`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `COLOR_PICKER_AXIS_IDS`        | const     | no        | yes   |
| `ColorPicker`                  | class     | no        | yes   |
| `ColorPickerAxis`              | interface | yes       | yes   |
| `ColorPickerAxisId`            | type      | yes       | yes   |
| `ColorPickerController`        | class     | no        | yes   |
| `ColorPickerControllerOptions` | interface | yes       | yes   |
| `ColorPickerInspection`        | interface | yes       | yes   |
| `ColorPickerOptions`           | interface | yes       | yes   |
| `ColorPickerSwatch`            | interface | yes       | yes   |

### src/components/combobox.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `clampComboBoxIndex`        | function  | no        | yes   |
| `ComboBox`                  | class     | no        | yes   |
| `ComboBoxController`        | class     | no        | yes   |
| `ComboBoxControllerOptions` | interface | yes       | yes   |
| `ComboBoxInspection`        | interface | yes       | yes   |
| `comboBoxLabel`             | function  | no        | yes   |
| `ComboBoxOptions`           | interface | yes       | yes   |

### src/components/command_palette.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                            | Kind      | Type Only | JSDoc |
| --------------------------------- | --------- | --------- | ----- |
| `clampCommandPaletteSelection`    | function  | no        | yes   |
| `CommandPalette`                  | class     | no        | yes   |
| `CommandPaletteController`        | class     | no        | yes   |
| `CommandPaletteControllerOptions` | interface | yes       | yes   |
| `CommandPaletteInspection`        | interface | yes       | yes   |
| `CommandPaletteItem`              | interface | yes       | yes   |
| `CommandPaletteMatch`             | interface | yes       | yes   |
| `CommandPaletteOptions`           | interface | yes       | yes   |
| `filterCommandPaletteItems`       | function  | no        | yes   |
| `rankCommandPaletteItems`         | function  | no        | yes   |
| `renderCommandPaletteRows`        | function  | no        | yes   |
| `shiftCommandPaletteSelection`    | function  | no        | yes   |

### src/components/context_menu.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `clampContextMenuSelection`    | function  | no        | yes   |
| `ContextMenu`                  | class     | no        | yes   |
| `ContextMenuController`        | class     | no        | yes   |
| `ContextMenuControllerOptions` | interface | yes       | yes   |
| `ContextMenuInspection`        | interface | yes       | yes   |
| `ContextMenuItem`              | interface | yes       | yes   |
| `ContextMenuItemStyle`         | type      | yes       | yes   |
| `ContextMenuOptions`           | interface | yes       | yes   |
| `contextMenuPlacement`         | function  | no        | yes   |
| `ContextMenuRowMarker`         | type      | yes       | yes   |
| `renderContextMenuRows`        | function  | no        | yes   |
| `shiftContextMenuSelection`    | function  | no        | yes   |
| `visibleContextMenuItems`      | function  | no        | yes   |

### src/components/cycler.ts

_Entrypoints: `.`, `./web`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `Cycler`                  | class     | no        | yes   |
| `CyclerController`        | class     | no        | yes   |
| `CyclerControllerOptions` | interface | yes       | yes   |
| `CyclerInspection`        | interface | yes       | yes   |
| `CyclerOptions`           | interface | yes       | yes   |
| `renderCycler`            | function  | no        | yes   |

### src/components/data_table.ts

_Entrypoints: `.`, `./web`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `canSortColumn`              | function  | no        | yes   |
| `createDataTableView`        | function  | no        | yes   |
| `DataColumn`                 | interface | yes       | yes   |
| `DataSort`                   | interface | yes       | yes   |
| `DataTableController`        | class     | no        | yes   |
| `DataTableControllerOptions` | interface | yes       | yes   |
| `DataTableInspection`        | interface | yes       | yes   |
| `DataTableState`             | interface | yes       | yes   |
| `DataTableView`              | interface | yes       | yes   |
| `filterDataRows`             | function  | no        | yes   |
| `nextSort`                   | function  | no        | yes   |
| `renderDataTableHeader`      | function  | no        | yes   |
| `renderDataTableRows`        | function  | no        | yes   |
| `renderDataTableRowsInto`    | function  | no        | yes   |
| `sortDataRows`               | function  | no        | yes   |
| `SortDirection`              | type      | yes       | yes   |

### src/components/empty_state.ts

_Entrypoints: `.`, `./web`_

| Symbol              | Kind      | Type Only | JSDoc |
| ------------------- | --------- | --------- | ----- |
| `EmptyState`        | class     | no        | yes   |
| `EmptyStateContent` | interface | yes       | yes   |
| `EmptyStateOptions` | interface | yes       | yes   |
| `renderEmptyState`  | function  | no        | yes   |

### src/components/file_explorer.ts

_Entrypoints: `.`, `./web`_

| Symbol                          | Kind      | Type Only | JSDoc |
| ------------------------------- | --------- | --------- | ----- |
| `createFileExplorerTree`        | function  | no        | yes   |
| `FileExplorerController`        | class     | no        | yes   |
| `FileExplorerControllerOptions` | interface | yes       | yes   |
| `FileExplorerEntry`             | interface | yes       | yes   |
| `FileExplorerInspection`        | interface | yes       | yes   |
| `FileExplorerNode`              | interface | yes       | yes   |
| `FileExplorerNodeKind`          | type      | yes       | yes   |

### src/components/frame.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `Frame`                      | class     | no        | yes   |
| `FrameOptions`               | interface | yes       | yes   |
| `FrameUnicodeCharacters`     | const     | no        | yes   |
| `FrameUnicodeCharactersType` | type      | yes       | yes   |

### src/components/gauge.ts

_Entrypoints: `.`, `./web`_

| Symbol         | Kind      | Type Only | JSDoc |
| -------------- | --------- | --------- | ----- |
| `Gauge`        | class     | no        | yes   |
| `GaugeOptions` | interface | yes       | yes   |
| `renderGauge`  | function  | no        | yes   |

### src/components/input.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `Input`                  | class     | no        | yes   |
| `InputController`        | class     | no        | yes   |
| `InputControllerOptions` | interface | yes       | yes   |
| `InputEditResult`        | type      | yes       | yes   |
| `InputInspection`        | interface | yes       | yes   |
| `InputOptions`           | interface | yes       | yes   |
| `InputRectangle`         | interface | yes       | yes   |
| `InputTheme`             | interface | yes       | yes   |

### src/components/interaction.ts

_Entrypoints: `.`, `./web`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `hitTestWidgetRegions`    | function  | no        | yes   |
| `pointInWidgetRegion`     | function  | no        | yes   |
| `stackedRowHitRegions`    | function  | no        | yes   |
| `stackedRowIndexAt`       | function  | no        | yes   |
| `WidgetHit`               | interface | yes       | yes   |
| `WidgetHitRegion`         | interface | yes       | yes   |
| `WidgetInteractionMethod` | type      | yes       | yes   |

### src/components/key_help.ts

_Entrypoints: `.`, `./web`_

| Symbol           | Kind      | Type Only | JSDoc |
| ---------------- | --------- | --------- | ----- |
| `KeyHelp`        | class     | no        | yes   |
| `KeyHelpOptions` | interface | yes       | yes   |
| `renderKeyHelp`  | function  | no        | yes   |

### src/components/label.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol            | Kind      | Type Only | JSDoc |
| ----------------- | --------- | --------- | ----- |
| `Label`           | class     | no        | yes   |
| `LabelAlign`      | interface | yes       | yes   |
| `labelLineLayout` | function  | no        | yes   |
| `LabelLineLayout` | interface | yes       | yes   |
| `LabelOptions`    | interface | yes       | yes   |
| `LabelRectangle`  | type      | yes       | yes   |

### src/components/list.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `List`                  | class     | no        | yes   |
| `ListController`        | class     | no        | yes   |
| `ListControllerOptions` | interface | yes       | yes   |
| `ListInspection`        | interface | yes       | yes   |
| `ListOptions`           | interface | yes       | yes   |
| `ListRowMarker`         | type      | yes       | yes   |
| `ListRowStyle`          | type      | yes       | yes   |
| `ListScrollbar`         | interface | yes       | yes   |
| `listWindowFromTop`     | function  | no        | yes   |
| `padListRow`            | function  | no        | yes   |
| `VirtualRow`            | interface | yes       | yes   |
| `virtualRows`           | function  | no        | yes   |
| `visibleListRows`       | function  | no        | yes   |
| `visibleListRowsInto`   | function  | no        | yes   |

### src/components/log_viewer.ts

_Entrypoints: `.`, `./web`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `LogViewer`                  | class     | no        | yes   |
| `LogViewerController`        | class     | no        | yes   |
| `LogViewerControllerOptions` | interface | yes       | yes   |
| `LogViewerInspection`        | interface | yes       | yes   |
| `LogViewerOptions`           | interface | yes       | yes   |
| `visibleLogLines`            | function  | no        | yes   |

### src/components/markdown.ts

_Entrypoints: `./app`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `defaultMarkdownStyles`     | const     | no        | yes   |
| `formatMarkdownRenderLine`  | function  | no        | yes   |
| `Markdown`                  | class     | no        | yes   |
| `MarkdownController`        | class     | no        | yes   |
| `MarkdownControllerOptions` | interface | yes       | yes   |
| `MarkdownInspection`        | interface | yes       | yes   |
| `MarkdownOptions`           | interface | yes       | yes   |
| `MarkdownStyleKey`          | type      | yes       | yes   |
| `MarkdownStyles`            | type      | yes       | yes   |

### src/components/menu_bar.ts

_Entrypoints: `.`, `./web`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `clampMenuIndex`           | function  | no        | yes   |
| `MenuBar`                  | class     | no        | yes   |
| `MenuBarController`        | class     | no        | yes   |
| `MenuBarControllerOptions` | interface | yes       | yes   |
| `MenuBarInspection`        | interface | yes       | yes   |
| `MenuBarItem`              | interface | yes       | yes   |
| `MenuBarOptions`           | interface | yes       | yes   |
| `menuItemForIndex`         | function  | no        | yes   |
| `renderMenuBar`            | function  | no        | yes   |
| `shiftMenuIndex`           | function  | no        | yes   |

### src/components/metric_series.ts

_Entrypoints: `.`, `./web`_

| Symbol                          | Kind      | Type Only | JSDoc |
| ------------------------------- | --------- | --------- | ----- |
| `DEFAULT_METRIC_SERIES_LIMIT`   | const     | no        | yes   |
| `MetricClampRange`              | interface | yes       | yes   |
| `MetricSeriesController`        | class     | no        | yes   |
| `MetricSeriesControllerOptions` | interface | yes       | yes   |
| `MetricSeriesInspection`        | interface | yes       | yes   |
| `metricSeriesStats`             | function  | no        | yes   |
| `MetricSeriesStats`             | interface | yes       | yes   |
| `normalizeMetricLimit`          | function  | no        | yes   |
| `normalizeMetricValue`          | function  | no        | yes   |
| `pushMetricValue`               | function  | no        | yes   |

### src/components/mod.ts

_Entrypoints: `.`, `./web`_

| Re-export Target                      | Kind | Names |
| ------------------------------------- | ---- | ----- |
| `src/components/box.ts`               | star | -     |
| `src/components/breadcrumbs.ts`       | star | -     |
| `src/components/button.ts`            | star | -     |
| `src/components/catalog.ts`           | star | -     |
| `src/components/chart.ts`             | star | -     |
| `src/components/checkbox.ts`          | star | -     |
| `src/components/command_palette.ts`   | star | -     |
| `src/components/combobox.ts`          | star | -     |
| `src/components/context_menu.ts`      | star | -     |
| `src/components/cycler.ts`            | star | -     |
| `src/components/data_table.ts`        | star | -     |
| `src/components/empty_state.ts`       | star | -     |
| `src/components/file_explorer.ts`     | star | -     |
| `src/components/frame.ts`             | star | -     |
| `src/components/gauge.ts`             | star | -     |
| `src/components/input.ts`             | star | -     |
| `src/components/interaction.ts`       | star | -     |
| `src/components/label.ts`             | star | -     |
| `src/components/key_help.ts`          | star | -     |
| `src/components/list.ts`              | star | -     |
| `src/components/log_viewer.ts`        | star | -     |
| `src/components/menu_bar.ts`          | star | -     |
| `src/components/metric_series.ts`     | star | -     |
| `src/components/color_picker.ts`      | star | -     |
| `src/components/modal.ts`             | star | -     |
| `src/components/pad.ts`               | star | -     |
| `src/components/progressbar.ts`       | star | -     |
| `src/components/radio_group.ts`       | star | -     |
| `src/components/scroll_area.ts`       | star | -     |
| `src/components/scroll_box_parity.ts` | star | -     |
| `src/components/text_area.ts`         | star | -     |
| `src/components/slider.ts`            | star | -     |
| `src/components/sparkline.ts`         | star | -     |
| `src/components/spinner.ts`           | star | -     |
| `src/components/statusbar.ts`         | star | -     |
| `src/components/stepper.ts`           | star | -     |
| `src/components/table.ts`             | star | -     |
| `src/components/tabs.ts`              | star | -     |
| `src/components/terminal_output.ts`   | star | -     |
| `src/components/terminal_screen.ts`   | star | -     |
| `src/components/text.ts`              | star | -     |
| `src/components/textbox.ts`           | star | -     |
| `src/components/toast.ts`             | star | -     |
| `src/components/tree.ts`              | star | -     |
| `src/components/virtual_list.ts`      | star | -     |

_No direct exported symbols._

### src/components/modal.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `Modal`                  | class     | no        | yes   |
| `ModalAction`            | interface | yes       | yes   |
| `modalActionRects`       | function  | no        | yes   |
| `ModalActionRectsResult` | interface | yes       | yes   |
| `ModalContent`           | interface | yes       | yes   |
| `modalContentHeight`     | function  | no        | yes   |
| `ModalController`        | class     | no        | yes   |
| `ModalControllerOptions` | interface | yes       | yes   |
| `ModalInspection`        | interface | yes       | yes   |
| `ModalOptions`           | interface | yes       | yes   |
| `ModalTone`              | type      | yes       | yes   |
| `renderModalRows`        | function  | no        | yes   |
| `RenderModalRowsOptions` | interface | yes       | yes   |

### src/components/pad.ts

_Entrypoints: `.`, `./web`_

| Symbol                 | Kind      | Type Only | JSDoc |
| ---------------------- | --------- | --------- | ----- |
| `clampPadCursor`       | function  | no        | yes   |
| `measurePadContent`    | function  | no        | yes   |
| `normalizePadLines`    | function  | no        | yes   |
| `PadContent`           | type      | yes       | yes   |
| `PadContentSize`       | interface | yes       | yes   |
| `PadController`        | class     | no        | yes   |
| `PadControllerOptions` | interface | yes       | yes   |
| `PadCursor`            | interface | yes       | yes   |
| `PadInspection`        | interface | yes       | yes   |
| `PadRevealOptions`     | interface | yes       | yes   |
| `PadViewportRow`       | interface | yes       | yes   |
| `renderPadRows`        | function  | no        | yes   |
| `RenderPadRowsOptions` | interface | yes       | yes   |

### src/components/progressbar.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `clampProgressValue`           | function  | no        | yes   |
| `ProgressBar`                  | class     | no        | yes   |
| `progressBarCharMap`           | const     | no        | yes   |
| `ProgressBarCharMapType`       | type      | yes       | yes   |
| `ProgressBarController`        | class     | no        | yes   |
| `ProgressBarControllerOptions` | interface | yes       | yes   |
| `ProgressBarDirection`         | type      | yes       | yes   |
| `ProgressBarInspection`        | interface | yes       | yes   |
| `ProgressBarOptions`           | interface | yes       | yes   |
| `ProgressBarOrientation`       | type      | yes       | yes   |
| `ProgressBarTheme`             | interface | yes       | yes   |
| `ProgressBarTrackRectangle`    | interface | yes       | yes   |
| `progressRatio`                | function  | no        | yes   |
| `progressRectangle`            | function  | no        | yes   |
| `progressSmoothLine`           | function  | no        | yes   |

### src/components/radio_group.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `clampRadioIndex`             | function  | no        | yes   |
| `optionForValue`              | function  | no        | yes   |
| `RadioGroup`                  | class     | no        | yes   |
| `RadioGroupController`        | class     | no        | yes   |
| `RadioGroupControllerOptions` | interface | yes       | yes   |
| `RadioGroupInspection`        | interface | yes       | yes   |
| `RadioGroupOptions`           | interface | yes       | yes   |
| `RadioOption`                 | interface | yes       | yes   |
| `renderRadioGroupRows`        | function  | no        | yes   |
| `shiftRadioIndex`             | function  | no        | yes   |
| `visibleRadioOptions`         | function  | no        | yes   |

### src/components/scroll_area.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `clampScrollOffset`            | function  | no        | yes   |
| `maxScrollOffset`              | function  | no        | yes   |
| `ScrollArea`                   | class     | no        | yes   |
| `ScrollAreaController`         | class     | no        | yes   |
| `ScrollAreaControllerOptions`  | interface | yes       | yes   |
| `ScrollAreaInspection`         | interface | yes       | yes   |
| `ScrollAreaOptions`            | interface | yes       | yes   |
| `ScrollAreaOverflowInspection` | interface | yes       | yes   |
| `scrollbarGlyph`               | function  | no        | yes   |
| `scrollbarOffsetForPointer`    | function  | no        | yes   |
| `scrollbarThumb`               | function  | no        | yes   |
| `ScrollbarThumb`               | type      | yes       | yes   |
| `scrollOffsetBy`               | function  | no        | yes   |

### src/components/scroll_box_parity.ts

_Entrypoints: `.`, `./web`_

| Symbol                | Kind      | Type Only | JSDoc |
| --------------------- | --------- | --------- | ----- |
| `ContentRect`         | interface | yes       | yes   |
| `cullToViewport`      | function  | no        | yes   |
| `routeNestedScroll`   | function  | no        | yes   |
| `scrollChildIntoView` | function  | no        | yes   |
| `StickyEdgeScroll`    | class     | no        | yes   |
| `WheelAcceleration`   | class     | no        | yes   |

### src/components/slider.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `clampSliderValue`        | function  | no        | yes   |
| `Slider`                  | class     | no        | yes   |
| `SliderController`        | class     | no        | yes   |
| `SliderControllerOptions` | interface | yes       | yes   |
| `SliderInspection`        | interface | yes       | yes   |
| `SliderOptions`           | interface | yes       | yes   |
| `SliderOrientation`       | type      | yes       | yes   |
| `SliderTheme`             | interface | yes       | yes   |
| `sliderThumbRectangle`    | function  | no        | yes   |
| `SliderThumbRectangle`    | interface | yes       | yes   |
| `SliderTrackRectangle`    | interface | yes       | yes   |
| `sliderValueAt`           | function  | no        | yes   |
| `sliderValueBy`           | function  | no        | yes   |
| `snapSliderValue`         | function  | no        | yes   |

### src/components/sparkline.ts

_Entrypoints: `.`, `./web`_

| Symbol             | Kind      | Type Only | JSDoc |
| ------------------ | --------- | --------- | ----- |
| `renderSparkline`  | function  | no        | yes   |
| `Sparkline`        | class     | no        | yes   |
| `SparklineOptions` | interface | yes       | yes   |

### src/components/spinner.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `DEFAULT_SPINNER_FRAMES` | const     | no        | yes   |
| `renderSpinner`          | function  | no        | yes   |
| `Spinner`                | class     | no        | yes   |
| `spinnerGlyph`           | function  | no        | yes   |
| `SpinnerOptions`         | interface | yes       | yes   |
| `SpinnerStatus`          | type      | yes       | yes   |

### src/components/statusbar.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol              | Kind      | Type Only | JSDoc |
| ------------------- | --------- | --------- | ----- |
| `renderStatusBar`   | function  | no        | yes   |
| `StatusBar`         | class     | no        | yes   |
| `StatusBarOptions`  | interface | yes       | yes   |
| `StatusBarPriority` | type      | yes       | yes   |

### src/components/stepper.ts

_Entrypoints: `.`, `./web`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `clampStepperIndex`        | function  | no        | yes   |
| `renderStepper`            | function  | no        | yes   |
| `shiftStepperIndex`        | function  | no        | yes   |
| `stepForIndex`             | function  | no        | yes   |
| `Stepper`                  | class     | no        | yes   |
| `StepperController`        | class     | no        | yes   |
| `StepperControllerOptions` | interface | yes       | yes   |
| `StepperInspection`        | interface | yes       | yes   |
| `StepperOptions`           | interface | yes       | yes   |
| `StepperOrientation`       | type      | yes       | yes   |
| `StepperStep`              | interface | yes       | yes   |

### src/components/table.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `clampTableRow`              | function  | no        | yes   |
| `Table`                      | class     | no        | yes   |
| `tableAutoColumnWidths`      | function  | no        | yes   |
| `TableController`            | class     | no        | yes   |
| `TableControllerOptions`     | interface | yes       | yes   |
| `TableHeader`                | type      | yes       | yes   |
| `TableInspection`            | interface | yes       | yes   |
| `tableMaxOffset`             | function  | no        | yes   |
| `TableOptions`               | interface | yes       | yes   |
| `TableTheme`                 | interface | yes       | yes   |
| `TableUnicodeCharacters`     | const     | no        | yes   |
| `TableUnicodeCharactersType` | type      | yes       | yes   |
| `tableVisibleCapacity`       | function  | no        | yes   |

### src/components/tabs.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `clampTabIndex`         | function  | no        | yes   |
| `renderTabs`            | function  | no        | yes   |
| `shiftTabIndex`         | function  | no        | yes   |
| `tabForIndex`           | function  | no        | yes   |
| `TabItem`               | interface | yes       | yes   |
| `Tabs`                  | class     | no        | yes   |
| `TabsController`        | class     | no        | yes   |
| `TabsControllerOptions` | interface | yes       | yes   |
| `TabsInspection`        | interface | yes       | yes   |
| `TabsOptions`           | interface | yes       | yes   |

### src/components/terminal_output.ts

_Entrypoints: `.`, `./web`_

| Symbol                            | Kind      | Type Only | JSDoc |
| --------------------------------- | --------- | --------- | ----- |
| `formatTerminalOutputLine`        | function  | no        | yes   |
| `TerminalOutputController`        | class     | no        | yes   |
| `TerminalOutputControllerOptions` | interface | yes       | yes   |
| `TerminalOutputInspection`        | interface | yes       | yes   |
| `TerminalOutputLine`              | interface | yes       | yes   |
| `TerminalOutputSource`            | type      | yes       | yes   |
| `visibleTerminalOutputLines`      | function  | no        | yes   |

### src/components/terminal_screen.ts

_Entrypoints: `.`, `./web`_

| Symbol                           | Kind      | Type Only | JSDoc |
| -------------------------------- | --------- | --------- | ----- |
| `TerminalScreen`                 | class     | no        | yes   |
| `TerminalScreenColors`           | interface | yes       | yes   |
| `TerminalScreenComponentOptions` | interface | yes       | yes   |

### src/components/text_area.ts

_Entrypoints: `.`, `./web`_

| Symbol               | Kind      | Type Only | JSDoc |
| -------------------- | --------- | --------- | ----- |
| `TextAreaAction`     | type      | yes       | yes   |
| `TextAreaController` | class     | no        | yes   |
| `TextAreaRow`        | interface | yes       | yes   |
| `TextAreaWrapMode`   | type      | yes       | yes   |

### src/components/text.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol        | Kind      | Type Only | JSDoc |
| ------------- | --------- | --------- | ----- |
| `Text`        | class     | no        | yes   |
| `TextOptions` | interface | yes       | yes   |

### src/components/textbox.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `CursorPosition`           | interface | yes       | yes   |
| `TextBox`                  | class     | no        | yes   |
| `TextBoxChangeContext`     | interface | yes       | yes   |
| `TextBoxController`        | class     | no        | yes   |
| `TextBoxControllerOptions` | interface | yes       | yes   |
| `TextBoxEditResult`        | type      | yes       | yes   |
| `TextBoxFindDirection`     | type      | yes       | yes   |
| `TextBoxFindOptions`       | interface | yes       | yes   |
| `TextBoxFindResult`        | interface | yes       | yes   |
| `TextBoxInspection`        | interface | yes       | yes   |
| `TextBoxOptions`           | interface | yes       | yes   |
| `TextBoxRange`             | interface | yes       | yes   |
| `TextBoxReplaceAllOptions` | interface | yes       | yes   |
| `TextBoxReplaceAllResult`  | interface | yes       | yes   |
| `TextBoxSelection`         | interface | yes       | yes   |
| `TextBoxTheme`             | interface | yes       | yes   |
| `textBoxVisualCursor`      | function  | no        | yes   |
| `TextBoxVisualCursor`      | interface | yes       | yes   |
| `TextBoxVisualLine`        | interface | yes       | yes   |
| `TextLineCache`            | class     | no        | yes   |
| `TextLineCacheInspection`  | interface | yes       | yes   |
| `wrapTextBoxLines`         | function  | no        | yes   |
| `wrapTextBoxLinesInto`     | function  | no        | yes   |

### src/components/three_ascii.ts

_Entrypoints: `./three-ascii`_

| Symbol              | Kind      | Type Only | JSDoc |
| ------------------- | --------- | --------- | ----- |
| `ThreeAscii`        | class     | no        | yes   |
| `ThreeAsciiOptions` | interface | yes       | yes   |

### src/components/toast.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `renderToast`                 | function  | no        | yes   |
| `ToastLevel`                  | type      | yes       | yes   |
| `ToastMessage`                | interface | yes       | yes   |
| `ToastStack`                  | class     | no        | yes   |
| `ToastStackController`        | class     | no        | yes   |
| `ToastStackControllerOptions` | interface | yes       | yes   |
| `ToastStackInspection`        | interface | yes       | yes   |
| `ToastStackOptions`           | interface | yes       | yes   |

### src/components/tree.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `flattenTree`           | function  | no        | yes   |
| `flattenTreeRows`       | function  | no        | yes   |
| `inspectTreeRow`        | function  | no        | yes   |
| `Tree`                  | class     | no        | yes   |
| `TreeController`        | class     | no        | yes   |
| `TreeControllerOptions` | interface | yes       | yes   |
| `TreeInspection`        | interface | yes       | yes   |
| `TreeNode`              | interface | yes       | yes   |
| `TreeOptions`           | interface | yes       | yes   |
| `TreeRow`               | interface | yes       | yes   |
| `TreeRowInspection`     | interface | yes       | yes   |
| `TreeRowMarker`         | type      | yes       | yes   |
| `TreeRowStyle`          | type      | yes       | yes   |

### src/components/virtual_list.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `renderVirtualListRows`        | function  | no        | yes   |
| `renderVirtualListRowsInto`    | function  | no        | yes   |
| `VirtualList`                  | class     | no        | yes   |
| `VirtualListController`        | class     | no        | yes   |
| `VirtualListControllerOptions` | interface | yes       | yes   |
| `VirtualListInspection`        | interface | yes       | yes   |
| `VirtualListOptions`           | interface | yes       | yes   |
| `VirtualListRow`               | interface | yes       | yes   |
| `virtualListRows`              | function  | no        | yes   |

### src/content/markdown.ts

_Entrypoints: `./app`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `MarkdownBlock`         | interface | yes       | yes   |
| `MarkdownBlockKind`     | type      | yes       | yes   |
| `MarkdownDocument`      | interface | yes       | yes   |
| `MarkdownInlineMark`    | type      | yes       | yes   |
| `MarkdownInlineSpan`    | interface | yes       | yes   |
| `MarkdownParseOptions`  | interface | yes       | yes   |
| `MarkdownRenderLine`    | interface | yes       | yes   |
| `MarkdownRenderOptions` | interface | yes       | yes   |
| `MarkdownRenderRole`    | type      | yes       | yes   |
| `MarkdownRenderSegment` | interface | yes       | yes   |
| `markdownRenderText`    | function  | no        | yes   |
| `MarkdownTableCell`     | interface | yes       | yes   |
| `parseMarkdown`         | function  | no        | yes   |
| `renderMarkdown`        | function  | no        | yes   |

### src/controls.ts

_Entrypoints: `.`_

| Symbol                   | Kind     | Type Only | JSDoc |
| ------------------------ | -------- | --------- | ----- |
| `handleKeyboardControls` | function | no        | yes   |
| `handleMouseControls`    | function | no        | yes   |

### src/event_emitter.ts

_Entrypoints: `.`, `./web`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `EmitterEvent`           | type      | yes       | yes   |
| `EventEmitter`           | class     | no        | yes   |
| `EventEmitterInspection` | interface | yes       | yes   |
| `EventListener`          | type      | yes       | yes   |
| `EventRecord`            | type      | yes       | yes   |

### src/focus.ts

_Entrypoints: `.`, `./web`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `bindFocusNavigation`      | function  | no        | yes   |
| `bindModalFocus`           | function  | no        | yes   |
| `Focusable`                | interface | yes       | yes   |
| `FocusManager`             | class     | no        | yes   |
| `FocusManagerInspection`   | interface | yes       | yes   |
| `FocusNavigationOptions`   | interface | yes       | yes   |
| `FocusNavigationTarget`    | interface | yes       | yes   |
| `FocusScope`               | class     | no        | yes   |
| `isFocusDisabled`          | function  | no        | yes   |
| `ModalFocusBindingOptions` | interface | yes       | yes   |
| `resolveSelectionPaint`    | function  | no        | yes   |
| `SelectionPaintState`      | type      | yes       | yes   |
| `stateHoldsInput`          | function  | no        | yes   |

### src/grwizard_themes.ts

_Entrypoints: `.`, `./web`, `./theme`_

| Symbol                           | Kind      | Type Only | JSDoc |
| -------------------------------- | --------- | --------- | ----- |
| `grWizardThemeOptions`           | function  | no        | yes   |
| `grWizardThemePacks`             | const     | no        | yes   |
| `GrWizardThemePalette`           | interface | yes       | yes   |
| `grWizardThemePaletteDefinition` | function  | no        | yes   |
| `grWizardThemePalettes`          | const     | no        | yes   |

### src/i18n/formatters.ts

_Entrypoints: `.`, `./web`_

| Symbol                           | Kind      | Type Only | JSDoc |
| -------------------------------- | --------- | --------- | ----- |
| `createLocaleFormatterRegistry`  | function  | no        | yes   |
| `LocaleDurationValue`            | interface | yes       | yes   |
| `LocaleFormatterInspection`      | interface | yes       | yes   |
| `LocaleFormatterRegistry`        | class     | no        | yes   |
| `LocaleFormatterRegistryOptions` | interface | yes       | yes   |

### src/i18n/locale_scopes.ts

_Entrypoints: `.`, `./web`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `createLocaleScopeTree` | function  | no        | yes   |
| `LocaleScopeOverride`   | interface | yes       | yes   |
| `LocaleScopeTree`       | class     | no        | yes   |
| `ResolvedLocaleScope`   | interface | yes       | yes   |

### src/i18n/locale.ts

_Entrypoints: `.`, `./web`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `createUnicodeLocaleContext`  | function  | no        | yes   |
| `UnicodeLocaleContext`        | class     | no        | yes   |
| `UnicodeLocaleContextOptions` | interface | yes       | yes   |
| `unicodeLocaleFallbackChain`  | function  | no        | yes   |
| `UnicodeLocaleInvalidTag`     | interface | yes       | yes   |
| `UnicodeLocaleResolution`     | interface | yes       | yes   |

### src/i18n/message_format.ts

_Entrypoints: `.`, `./web`_

| Symbol                                | Kind      | Type Only | JSDoc |
| ------------------------------------- | --------- | --------- | ----- |
| `analyzeMessageFormat`                | function  | no        | yes   |
| `compileMessageFormat`                | function  | no        | yes   |
| `createMessageFormatFunctionRegistry` | function  | no        | yes   |
| `MessageFormat`                       | class     | no        | yes   |
| `MessageFormatAnalysis`               | interface | yes       | yes   |
| `MessageFormatFunction`               | type      | yes       | yes   |
| `MessageFormatFunctionRegistry`       | class     | no        | yes   |
| `MessageFormatPart`                   | interface | yes       | yes   |
| `MessageFormatValue`                  | interface | yes       | yes   |

### src/i18n/message_lint.ts

_Entrypoints: `.`, `./web`_

| Symbol                 | Kind      | Type Only | JSDoc |
| ---------------------- | --------- | --------- | ----- |
| `extractMessageUsages` | function  | no        | yes   |
| `lintMessages`         | function  | no        | yes   |
| `MessageLintFinding`   | interface | yes       | yes   |
| `MessageLintOptions`   | interface | yes       | yes   |
| `MessageUsage`         | interface | yes       | yes   |

### src/i18n/messages.ts

_Entrypoints: `.`, `./web`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `createMessageBundleRegistry`  | function  | no        | yes   |
| `MessageBundleChunk`           | interface | yes       | yes   |
| `MessageBundleDiagnostic`      | interface | yes       | yes   |
| `MessageBundleRegistry`        | class     | no        | yes   |
| `MessageBundleRegistryOptions` | interface | yes       | yes   |
| `MessageChunkLoader`           | type      | yes       | yes   |
| `MessageProvenance`            | type      | yes       | yes   |
| `MessageResolution`            | interface | yes       | yes   |

### src/i18n/missing_translation_telemetry.ts

_Entrypoints: `.`, `./web`_

| Symbol                              | Kind      | Type Only | JSDoc |
| ----------------------------------- | --------- | --------- | ----- |
| `createMissingTranslationTelemetry` | function  | no        | yes   |
| `MissingTranslationReport`          | interface | yes       | yes   |
| `MissingTranslationTelemetry`       | class     | no        | yes   |

### src/i18n/mod.ts

_Entrypoints: `.`, `./web`_

| Re-export Target                            | Kind | Names |
| ------------------------------------------- | ---- | ----- |
| `src/i18n/formatters.ts`                    | star | -     |
| `src/i18n/locale.ts`                        | star | -     |
| `src/i18n/locale_scopes.ts`                 | star | -     |
| `src/i18n/message_format.ts`                | star | -     |
| `src/i18n/message_lint.ts`                  | star | -     |
| `src/i18n/messages.ts`                      | star | -     |
| `src/i18n/missing_translation_telemetry.ts` | star | -     |
| `src/i18n/pseudo_locales.ts`                | star | -     |
| `src/i18n/reactive_locale.ts`               | star | -     |
| `src/i18n/width_variants.ts`                | star | -     |

_No direct exported symbols._

### src/i18n/pseudo_locales.ts

_Entrypoints: `.`, `./web`_

| Symbol               | Kind     | Type Only | JSDoc |
| -------------------- | -------- | --------- | ----- |
| `PSEUDO_LOCALE_TAGS` | const    | no        | yes   |
| `PseudoLocaleKind`   | type     | yes       | yes   |
| `pseudoLocaleLoader` | function | no        | yes   |
| `pseudoLocalizeText` | function | no        | yes   |

### src/i18n/reactive_locale.ts

_Entrypoints: `.`, `./web`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `createReactiveLocaleService`  | function  | no        | yes   |
| `LocaleSwitchReport`           | interface | yes       | yes   |
| `LocaleWorld`                  | interface | yes       | yes   |
| `ReactiveLocaleService`        | class     | no        | yes   |
| `ReactiveLocaleServiceOptions` | interface | yes       | yes   |

### src/i18n/width_variants.ts

_Entrypoints: `.`, `./web`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `clipToCells`           | function  | no        | yes   |
| `measureCells`          | function  | no        | yes   |
| `selectWidthVariant`    | function  | no        | yes   |
| `WidthVariant`          | interface | yes       | yes   |
| `WidthVariantSelection` | interface | yes       | yes   |

### src/input_envelope.ts

_Entrypoints: `.`, `./web`_

| Symbol                           | Kind      | Type Only | JSDoc |
| -------------------------------- | --------- | --------- | ----- |
| `adaptBrowserInput`              | function  | no        | yes   |
| `adaptRemoteInput`               | function  | no        | yes   |
| `adaptTerminalInput`             | function  | no        | yes   |
| `adaptTestInput`                 | function  | no        | yes   |
| `INPUT_ENVELOPE_SCHEMA_VERSION`  | const     | no        | yes   |
| `InputDeviceKind`                | type      | yes       | yes   |
| `InputEnvelope`                  | interface | yes       | yes   |
| `InputEnvelopeAdapterOptions`    | interface | yes       | yes   |
| `InputEnvelopeError`             | class     | no        | yes   |
| `InputEnvelopeErrorCode`         | type      | yes       | yes   |
| `InputEnvelopeFactory`           | class     | no        | yes   |
| `InputEnvelopeFactoryInspection` | interface | yes       | yes   |
| `InputEnvelopeFactoryOptions`    | interface | yes       | yes   |
| `InputEnvelopeJsonObject`        | interface | yes       | yes   |
| `InputEnvelopeJsonValue`         | type      | yes       | yes   |
| `InputEnvelopeLimits`            | interface | yes       | yes   |
| `InputEnvelopeRawPayload`        | interface | yes       | yes   |
| `InputModifierFlags`             | interface | yes       | yes   |
| `InputSemanticEventInput`        | interface | yes       | yes   |
| `InputSemanticKind`              | type      | yes       | yes   |
| `InputSequenceOverflowPolicy`    | type      | yes       | yes   |
| `InputSourceAdapterOptions`      | interface | yes       | yes   |
| `InputSourceKind`                | type      | yes       | yes   |
| `InputTrustLevel`                | type      | yes       | yes   |
| `normalizeInputEnvelope`         | function  | no        | yes   |
| `parseInputEnvelope`             | function  | no        | yes   |
| `ResolvedInputEnvelopeLimits`    | interface | yes       | yes   |
| `serializeInputEnvelope`         | function  | no        | yes   |

### src/input_lifecycle.ts

_Entrypoints: `.`_

| Symbol                                | Kind      | Type Only | JSDoc |
| ------------------------------------- | --------- | --------- | ----- |
| `InputLifecycleDiagnostic`            | interface | yes       | yes   |
| `InputLifecycleDragCancelEvent`       | interface | yes       | yes   |
| `InputLifecycleEnvelopeFactory`       | interface | yes       | yes   |
| `InputLifecycleError`                 | class     | no        | yes   |
| `InputLifecycleErrorCode`             | type      | yes       | yes   |
| `InputLifecycleGestureCancelEvent`    | interface | yes       | yes   |
| `InputLifecycleInspection`            | interface | yes       | yes   |
| `InputLifecycleInteractionInput`      | interface | yes       | yes   |
| `InputLifecycleInteractionInspection` | interface | yes       | yes   |
| `InputLifecycleInteractionPhase`      | type      | yes       | yes   |
| `InputLifecycleKeyInput`              | interface | yes       | yes   |
| `InputLifecycleKeyInspection`         | interface | yes       | yes   |
| `InputLifecycleKeyPhase`              | type      | yes       | yes   |
| `InputLifecycleKeyUpEvent`            | interface | yes       | yes   |
| `InputLifecycleListener`              | type      | yes       | yes   |
| `InputLifecyclePointerCancelEvent`    | interface | yes       | yes   |
| `InputLifecyclePointerInspection`     | interface | yes       | yes   |
| `InputLifecyclePointerReleaseEvent`   | interface | yes       | yes   |
| `InputLifecycleReason`                | type      | yes       | yes   |
| `InputLifecycleReconciler`            | class     | no        | yes   |
| `InputLifecycleReconcileResult`       | interface | yes       | yes   |
| `InputLifecycleReconcilerOptions`     | interface | yes       | yes   |
| `InputLifecycleScopeInspection`       | interface | yes       | yes   |
| `InputLifecycleSyntheticEvent`        | type      | yes       | yes   |

### src/input_reader/mod.ts

_Entrypoints: `.`, `./terminal`_

| Re-export Target            | Kind | Names |
| --------------------------- | ---- | ----- |
| `src/input_reader/types.ts` | star | -     |

| Symbol             | Kind     | Type Only | JSDoc |
| ------------------ | -------- | --------- | ----- |
| `emitInputEvents`  | function | no        | yes   |
| `InputEventRecord` | type     | yes       | yes   |

### src/input_reader/types.ts

_Entrypoints: `.`, `./remote`, `./terminal`_

| Symbol               | Kind      | Type Only | JSDoc |
| -------------------- | --------- | --------- | ----- |
| `Alphabet`           | type      | yes       | yes   |
| `Chars`              | type      | yes       | yes   |
| `InputEvent`         | type      | yes       | yes   |
| `Key`                | type      | yes       | yes   |
| `KeyPressEvent`      | interface | yes       | yes   |
| `MouseEvent`         | interface | yes       | yes   |
| `MousePressEvent`    | interface | yes       | yes   |
| `MouseScrollEvent`   | interface | yes       | yes   |
| `PasteEvent`         | interface | yes       | yes   |
| `SpecialKeys`        | type      | yes       | yes   |
| `TerminalApcEvent`   | interface | yes       | yes   |
| `TerminalFocusEvent` | interface | yes       | yes   |

### src/input.ts

_Entrypoints: `.`_

| Symbol        | Kind     | Type Only | JSDoc |
| ------------- | -------- | --------- | ----- |
| `handleInput` | function | no        | yes   |

### src/key_sequences.ts

_Entrypoints: `.`, `./web`_

| Symbol                             | Kind      | Type Only | JSDoc |
| ---------------------------------- | --------- | --------- | ----- |
| `createKeySequenceCoordinator`     | function  | no        | yes   |
| `DEFAULT_KEY_SEQUENCE_LEADER`      | const     | no        | yes   |
| `KeySequenceBindingDefinition`     | interface | yes       | yes   |
| `KeySequenceBindingInactiveReason` | type      | yes       | yes   |
| `KeySequenceBindingInspection`     | interface | yes       | yes   |
| `keySequenceChord`                 | function  | no        | yes   |
| `KeySequenceCommandContext`        | interface | yes       | yes   |
| `KeySequenceCommandDefinition`     | interface | yes       | yes   |
| `KeySequenceCommandInspection`     | interface | yes       | yes   |
| `KeySequenceCondition`             | type      | yes       | yes   |
| `KeySequenceConditionContext`      | interface | yes       | yes   |
| `KeySequenceConflictInspection`    | interface | yes       | yes   |
| `KeySequenceCoordinator`           | class     | no        | yes   |
| `KeySequenceCoordinatorInspection` | interface | yes       | yes   |
| `KeySequenceCoordinatorOptions`    | interface | yes       | yes   |
| `KeySequenceDispatchResult`        | interface | yes       | yes   |
| `KeySequenceErrorInspection`       | interface | yes       | yes   |
| `KeySequenceErrorPhase`            | type      | yes       | yes   |
| `KeySequenceMapDefinition`         | interface | yes       | yes   |
| `KeySequenceMapIssue`              | interface | yes       | yes   |
| `KeySequenceMapIssueCode`          | type      | yes       | yes   |
| `KeySequencePendingInspection`     | interface | yes       | yes   |
| `KeySequenceRemapResult`           | interface | yes       | yes   |
| `KeySequenceStrokeInput`           | type      | yes       | yes   |

### src/keymap_layers.ts

_Entrypoints: `.`, `./web`_

| Symbol                                   | Kind      | Type Only | JSDoc |
| ---------------------------------------- | --------- | --------- | ----- |
| `KeymapLayerDefinition`                  | interface | yes       | yes   |
| `KeymapLayerInspection`                  | interface | yes       | yes   |
| `KeymapLayerKind`                        | type      | yes       | yes   |
| `LayeredKeyBinding`                      | interface | yes       | yes   |
| `LayeredKeyBindingInspection`            | interface | yes       | yes   |
| `LayeredKeymapCondition`                 | type      | yes       | yes   |
| `LayeredKeymapConditionContext`          | interface | yes       | yes   |
| `LayeredKeymapConflictBindingInspection` | interface | yes       | yes   |
| `LayeredKeymapConflictInspection`        | interface | yes       | yes   |
| `LayeredKeymapDispatchContext`           | interface | yes       | yes   |
| `LayeredKeymapDispatchResult`            | interface | yes       | yes   |
| `LayeredKeymapErrorInspection`           | interface | yes       | yes   |
| `LayeredKeymapErrorPhase`                | type      | yes       | yes   |
| `LayeredKeymapHandler`                   | type      | yes       | yes   |
| `LayeredKeymapInactiveReason`            | type      | yes       | yes   |
| `LayeredKeymapInspection`                | interface | yes       | yes   |
| `LayeredKeymapKeyEvent`                  | type      | yes       | yes   |
| `LayeredKeymapRegistry`                  | class     | no        | yes   |
| `LayeredKeymapRegistryOptions`           | interface | yes       | yes   |
| `LayeredKeymapTarget`                    | interface | yes       | yes   |

### src/keymap.ts

_Entrypoints: `.`, `./web`_

| Symbol                 | Kind      | Type Only | JSDoc |
| ---------------------- | --------- | --------- | ----- |
| `bindingId`            | function  | no        | yes   |
| `formatKeyBinding`     | function  | no        | yes   |
| `KeyBinding`           | interface | yes       | yes   |
| `KeyBindingInspection` | interface | yes       | yes   |
| `KeymapInspection`     | interface | yes       | yes   |
| `KeymapRegistry`       | class     | no        | yes   |

### src/layout/capabilities.ts

_Entrypoints: `.`, `./web`_

| Symbol                                  | Kind      | Type Only | JSDoc |
| --------------------------------------- | --------- | --------- | ----- |
| `inspectLayoutDeclarationCompatibility` | function  | no        | yes   |
| `inspectLayoutSolverCapabilities`       | function  | no        | yes   |
| `inspectLayoutTreeCompatibility`        | function  | no        | yes   |
| `knownLayoutSolverCapabilities`         | function  | no        | yes   |
| `KnownLayoutSolverId`                   | type      | yes       | yes   |
| `LAYOUT_CSS_PROPERTY_FIELDS`            | const     | no        | yes   |
| `LayoutContractInvariantCapability`     | interface | yes       | yes   |
| `LayoutContractInvariantId`             | type      | yes       | yes   |
| `LayoutDeclarationInspection`           | interface | yes       | yes   |
| `LayoutDiagnostic`                      | interface | yes       | yes   |
| `LayoutDiagnosticCode`                  | type      | yes       | yes   |
| `LayoutSolverAvailability`              | type      | yes       | yes   |
| `LayoutSolverCapabilities`              | interface | yes       | yes   |
| `LayoutSolverCapabilityReport`          | interface | yes       | yes   |
| `LayoutSolverFieldSupport`              | type      | yes       | yes   |
| `LayoutSolverStyleCapabilities`         | type      | yes       | yes   |
| `LayoutStyleField`                      | type      | yes       | yes   |
| `mergeLayoutDiagnostics`                | function  | no        | yes   |
| `NORMALIZED_LAYOUT_STYLE_FIELDS`        | const     | no        | yes   |
| `resolvedLayoutDeclarationFields`       | function  | no        | yes   |
| `resolveLayoutSolverCapabilities`       | function  | no        | yes   |
| `SIMPLE_LAYOUT_SOLVER_CAPABILITIES`     | const     | no        | yes   |
| `SUPPORTED_LAYOUT_CSS_PROPERTIES`       | const     | no        | yes   |
| `TAFFY_LAYOUT_SOLVER_CAPABILITIES`      | const     | no        | yes   |
| `unknownLayoutSolverCapabilities`       | function  | no        | yes   |
| `YOGA_LAYOUT_SOLVER_CAPABILITIES`       | const     | no        | yes   |

### src/layout/engine.ts

_Entrypoints: `.`, `./web`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `createLayoutEngine`           | function  | no        | yes   |
| `LayoutEngine`                 | class     | no        | yes   |
| `LayoutEngineOptions`          | interface | yes       | yes   |
| `LayoutRunOptions`             | interface | yes       | yes   |
| `LayoutSolverUnsupportedError` | class     | no        | yes   |
| `layoutTree`                   | function  | no        | yes   |

### src/layout/errors.ts

_Entrypoints: `.`, `./web`_

| Symbol                              | Kind  | Type Only | JSDoc |
| ----------------------------------- | ----- | --------- | ----- |
| `LayoutInvalidElementsPatternError` | class | no        | yes   |
| `LayoutMissingElementError`         | class | no        | yes   |

### src/layout/flex_layout.ts

_Entrypoints: `.`, `./web`_

| Symbol          | Kind      | Type Only | JSDoc |
| --------------- | --------- | --------- | ----- |
| `FlexDirection` | type      | yes       | yes   |
| `FlexItem`      | interface | yes       | yes   |
| `flexRects`     | function  | no        | yes   |

### src/layout/grid_layout.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol              | Kind      | Type Only | JSDoc |
| ------------------- | --------- | --------- | ----- |
| `GridLayout`        | class     | no        | yes   |
| `GridLayoutElement` | interface | yes       | yes   |
| `GridLayoutOptions` | interface | yes       | yes   |

### src/layout/horizontal_layout.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol             | Kind  | Type Only | JSDoc |
| ------------------ | ----- | --------- | ----- |
| `HorizontalLayout` | class | no        | yes   |

### src/layout/measurement.ts

_Entrypoints: `.`, `./web`_

| Symbol                                    | Kind      | Type Only | JSDoc |
| ----------------------------------------- | --------- | --------- | ----- |
| `LayoutMeasurementCache`                  | class     | no        | yes   |
| `LayoutMeasurementCacheEntry`             | interface | yes       | yes   |
| `LayoutMeasurementCacheOptions`           | interface | yes       | yes   |
| `LayoutMeasurementCacheStats`             | interface | yes       | yes   |
| `measureTerminalTextIntrinsic`            | function  | no        | yes   |
| `measureTerminalTextMinContentWidth`      | function  | no        | yes   |
| `TerminalTextIntrinsicMeasurementOptions` | interface | yes       | yes   |

### src/layout/mod.ts

_Entrypoints: `.`, `./web`_

| Re-export Target                  | Kind | Names |
| --------------------------------- | ---- | ----- |
| `src/layout/errors.ts`            | star | -     |
| `src/layout/horizontal_layout.ts` | star | -     |
| `src/layout/types.ts`             | star | -     |
| `src/layout/vertical_layout.ts`   | star | -     |
| `src/layout/grid_layout.ts`       | star | -     |
| `src/layout/flex_layout.ts`       | star | -     |
| `src/layout/responsive.ts`        | star | -     |
| `src/layout/split_pane.ts`        | star | -     |
| `src/layout/recipe.ts`            | star | -     |
| `src/layout/window_manager.ts`    | star | -     |
| `src/layout/tiled_workspace.ts`   | star | -     |
| `src/layout/overlay.ts`           | star | -     |
| `src/layout/style.ts`             | star | -     |
| `src/layout/capabilities.ts`      | star | -     |
| `src/layout/solver.ts`            | star | -     |
| `src/layout/engine.ts`            | star | -     |
| `src/layout/measurement.ts`       | star | -     |
| `src/layout/solvers/simple.ts`    | star | -     |

_No direct exported symbols._

### src/layout/overlay.ts

_Entrypoints: `.`, `./web`_

| Symbol                                  | Kind      | Type Only | JSDoc |
| --------------------------------------- | --------- | --------- | ----- |
| `clampRectToBounds`                     | function  | no        | yes   |
| `hitTestOverlaySurfaces`                | function  | no        | yes   |
| `OverlayActiveIdSynchronizationOptions` | interface | yes       | yes   |
| `OverlayHit`                            | interface | yes       | yes   |
| `OverlayKind`                           | type      | yes       | yes   |
| `OverlayLayer`                          | type      | yes       | yes   |
| `overlayLayerZIndex`                    | function  | no        | yes   |
| `OverlayPoint`                          | interface | yes       | yes   |
| `OverlayPointerResult`                  | interface | yes       | yes   |
| `OverlaySize`                           | interface | yes       | yes   |
| `OverlayStackController`                | class     | no        | yes   |
| `OverlayStackInspection`                | interface | yes       | yes   |
| `OverlayStackMutationOptions`           | interface | yes       | yes   |
| `OverlayStackOptions`                   | interface | yes       | yes   |
| `OverlaySurface`                        | interface | yes       | yes   |
| `OverlaySurfaceInspection`              | interface | yes       | yes   |
| `placePopover`                          | function  | no        | yes   |
| `pointInRect`                           | function  | no        | yes   |
| `PopoverPlacement`                      | type      | yes       | yes   |
| `PopoverPlacementOptions`               | interface | yes       | yes   |
| `sortOverlaySurfaces`                   | function  | no        | yes   |

### src/layout/recipe.ts

_Entrypoints: `.`, `./web`_

| Symbol                             | Kind      | Type Only | JSDoc |
| ---------------------------------- | --------- | --------- | ----- |
| `createLayoutRecipeController`     | function  | no        | yes   |
| `formatLayoutRecipeMarkdown`       | function  | no        | yes   |
| `inspectLayoutRecipe`              | function  | no        | yes   |
| `LayoutRecipeBreakpointInspection` | interface | yes       | yes   |
| `LayoutRecipeController`           | class     | no        | yes   |
| `LayoutRecipeControllerInspection` | interface | yes       | yes   |
| `LayoutRecipeInspection`           | interface | yes       | yes   |
| `LayoutRecipeMarkdownOptions`      | interface | yes       | yes   |
| `layoutRecipeSlots`                | function  | no        | yes   |
| `LayoutRegion`                     | type      | yes       | yes   |
| `LayoutRegionDirection`            | type      | yes       | yes   |
| `LayoutRegionDock`                 | interface | yes       | yes   |
| `LayoutRegionEdge`                 | type      | yes       | yes   |
| `LayoutRegionLeaf`                 | interface | yes       | yes   |
| `LayoutRegionSplit`                | interface | yes       | yes   |
| `ResolvedLayoutRecipe`             | interface | yes       | yes   |
| `resolveLayoutRecipe`              | function  | no        | yes   |
| `ResponsiveLayoutRecipe`           | interface | yes       | yes   |

### src/layout/responsive.ts

_Entrypoints: `.`, `./web`_

| Symbol                 | Kind      | Type Only | JSDoc |
| ---------------------- | --------- | --------- | ----- |
| `adaptiveGrid`         | function  | no        | yes   |
| `AdaptiveGrid`         | interface | yes       | yes   |
| `adaptiveGridItemRect` | function  | no        | yes   |
| `AdaptiveGridOptions`  | interface | yes       | yes   |
| `adaptiveGridPage`     | function  | no        | yes   |
| `AdaptiveGridPage`     | interface | yes       | yes   |
| `Breakpoint`           | interface | yes       | yes   |
| `dockRect`             | function  | no        | yes   |
| `insetRect`            | function  | no        | yes   |
| `resolveBreakpoint`    | function  | no        | yes   |
| `splitRect`            | function  | no        | yes   |
| `TileLayout`           | interface | yes       | yes   |
| `TileLayoutOptions`    | interface | yes       | yes   |
| `tileRects`            | function  | no        | yes   |

### src/layout/solver.ts

_Entrypoints: `.`, `./web`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `cloneLayoutNode`            | function  | no        | yes   |
| `ComputedLayoutBox`          | interface | yes       | yes   |
| `computedLayoutBoxOverflow`  | function  | no        | yes   |
| `createLayoutNode`           | function  | no        | yes   |
| `flattenComputedLayoutBoxes` | function  | no        | yes   |
| `LayoutIntrinsicSize`        | interface | yes       | yes   |
| `LayoutNode`                 | interface | yes       | yes   |
| `LayoutNodeOptions`          | interface | yes       | yes   |
| `LayoutSolver`               | interface | yes       | yes   |
| `LayoutSolverInput`          | interface | yes       | yes   |
| `LayoutSolverResult`         | interface | yes       | yes   |
| `mapLayoutBoxes`             | function  | no        | yes   |
| `walkLayoutNodes`            | function  | no        | yes   |

### src/layout/solvers/simple.ts

_Entrypoints: `.`, `./web`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `simpleLayoutSolver`        | function  | no        | yes   |
| `SimpleLayoutSolver`        | class     | no        | yes   |
| `SimpleLayoutSolverOptions` | interface | yes       | yes   |

### src/layout/solvers/taffy_wasm.ts

_Entrypoints: `./layout/taffy-wasm`_

| Symbol                  | Kind     | Type Only | JSDoc |
| ----------------------- | -------- | --------- | ----- |
| `taffyWasmLayoutSolver` | function | no        | yes   |
| `TaffyWasmLayoutSolver` | class    | no        | yes   |

### src/layout/solvers/taffy.ts

_Entrypoints: `./layout/taffy`_

| Symbol                              | Kind      | Type Only | JSDoc |
| ----------------------------------- | --------- | --------- | ----- |
| `inspectTaffyBackendModule`         | function  | no        | yes   |
| `loadTaffyLayoutSolver`             | function  | no        | yes   |
| `TAFFY_BACKEND_PROTOCOL`            | const     | no        | yes   |
| `TAFFY_BACKEND_PROTOCOL_VERSION`    | const     | no        | yes   |
| `TAFFY_SUPPORTED_VERSION_SERIES`    | const     | no        | yes   |
| `TaffyAdapterError`                 | class     | no        | yes   |
| `TaffyAdapterErrorCode`             | type      | yes       | yes   |
| `TaffyAvailableSpace`               | type      | yes       | yes   |
| `TaffyBackend`                      | interface | yes       | yes   |
| `TaffyBackendLayoutNode`            | interface | yes       | yes   |
| `TaffyBackendManifest`              | interface | yes       | yes   |
| `TaffyBackendModule`                | interface | yes       | yes   |
| `TaffyBackendSolveRequest`          | interface | yes       | yes   |
| `TaffyBackendSolveResult`           | interface | yes       | yes   |
| `taffyLayoutSolver`                 | function  | no        | yes   |
| `TaffyLayoutSolver`                 | class     | no        | yes   |
| `TaffyLayoutSolverInspection`       | interface | yes       | yes   |
| `TaffyLayoutSolverLoader`           | class     | no        | yes   |
| `TaffyLayoutSolverLoaderInspection` | interface | yes       | yes   |
| `TaffyLayoutSolverLoaderOptions`    | interface | yes       | yes   |
| `TaffyLayoutSolverOptions`          | interface | yes       | yes   |
| `TaffyMeasureInput`                 | interface | yes       | yes   |
| `TaffyMeasureNode`                  | type      | yes       | yes   |
| `TaffyMeasureOutput`                | interface | yes       | yes   |

### src/layout/solvers/yoga.ts

_Entrypoints: `./layout/yoga`_

| Symbol                            | Kind      | Type Only | JSDoc |
| --------------------------------- | --------- | --------- | ----- |
| `YOGA_LAYOUT_SOLVER_CAPABILITIES` | const     | no        | yes   |
| `yogaLayoutSolver`                | function  | no        | yes   |
| `YogaLayoutSolver`                | class     | no        | yes   |
| `YogaLayoutSolverOptions`         | interface | yes       | yes   |

### src/layout/split_pane.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `createSplitPaneController`  | function  | no        | yes   |
| `resizeSplitPane`            | function  | no        | yes   |
| `resizeSplitPaneRatio`       | function  | no        | yes   |
| `SplitPaneController`        | class     | no        | yes   |
| `SplitPaneControllerOptions` | interface | yes       | yes   |
| `SplitPaneDirection`         | type      | yes       | yes   |
| `SplitPaneOptions`           | interface | yes       | yes   |
| `splitPaneRects`             | function  | no        | yes   |
| `SplitPaneRects`             | interface | yes       | yes   |
| `SplitPaneResizeMode`        | type      | yes       | yes   |

### src/layout/style.ts

_Entrypoints: `.`, `./web`_

| Symbol                           | Kind      | Type Only | JSDoc |
| -------------------------------- | --------- | --------- | ----- |
| `applyLayoutDeclaration`         | function  | no        | yes   |
| `applyLayoutDeclarations`        | function  | no        | yes   |
| `AUTO_LAYOUT_LENGTH`             | const     | no        | yes   |
| `autoLength`                     | function  | no        | yes   |
| `BoxEdges`                       | interface | yes       | yes   |
| `calcLength`                     | function  | no        | yes   |
| `cellLength`                     | function  | no        | yes   |
| `clampLayoutSize`                | function  | no        | yes   |
| `cloneComputedLayoutStyle`       | function  | no        | yes   |
| `ComputedLayoutStyle`            | interface | yes       | yes   |
| `defaultComputedLayoutStyle`     | function  | no        | yes   |
| `frLength`                       | function  | no        | yes   |
| `GRID_DENSE_PLACEMENT_SEMANTICS` | const     | no        | yes   |
| `isIntrinsicLayoutLengthUnit`    | function  | no        | yes   |
| `LAYOUT_CALC_TERM_LIMIT`         | const     | no        | yes   |
| `LAYOUT_HATCH_PATTERNS`          | const     | no        | yes   |
| `LayoutAlignContent`             | type      | yes       | yes   |
| `LayoutAlignItems`               | type      | yes       | yes   |
| `LayoutBoxSizing`                | type      | yes       | yes   |
| `LayoutCalcTerm`                 | interface | yes       | yes   |
| `LayoutCalcUnit`                 | type      | yes       | yes   |
| `LayoutDisplay`                  | type      | yes       | yes   |
| `LayoutDock`                     | type      | yes       | yes   |
| `LayoutFlexDirection`            | type      | yes       | yes   |
| `LayoutFlexWrap`                 | type      | yes       | yes   |
| `LayoutGridAutoFlow`             | type      | yes       | yes   |
| `LayoutGridAutoRepeat`           | interface | yes       | yes   |
| `LayoutGridPlacement`            | interface | yes       | yes   |
| `LayoutGridTrackTemplate`        | interface | yes       | yes   |
| `LayoutHatch`                    | interface | yes       | yes   |
| `LayoutHorizontalAlign`          | type      | yes       | yes   |
| `LayoutJustifyContent`           | type      | yes       | yes   |
| `LayoutLengthResolutionContext`  | interface | yes       | yes   |
| `LayoutLengthValue`              | interface | yes       | yes   |
| `LayoutOverflow`                 | type      | yes       | yes   |
| `LayoutOverflowWrap`             | type      | yes       | yes   |
| `LayoutPosition`                 | type      | yes       | yes   |
| `LayoutSelfAlignment`            | type      | yes       | yes   |
| `LayoutTitleAlign`               | type      | yes       | yes   |
| `LayoutVerticalAlign`            | type      | yes       | yes   |
| `LayoutVisibility`               | type      | yes       | yes   |
| `LayoutWhiteSpace`               | type      | yes       | yes   |
| `LOGICAL_EDGE_MODEL`             | const     | no        | yes   |
| `parseBoxEdges`                  | function  | no        | yes   |
| `parseGridPlacement`             | function  | no        | yes   |
| `parseGridTemplateTrackList`     | function  | no        | yes   |
| `parseGridTrackList`             | function  | no        | yes   |
| `parseLayoutInteger`             | function  | no        | yes   |
| `parseLayoutLength`              | function  | no        | yes   |
| `percentLength`                  | function  | no        | yes   |
| `resolveGridTemplateArea`        | function  | no        | yes   |
| `resolveLayoutLength`            | function  | no        | yes   |
| `resolveLogicalLayoutEdges`      | function  | no        | yes   |
| `resolveNamedGridPlacement`      | function  | no        | yes   |
| `ZERO_BOX_EDGES`                 | const     | no        | yes   |

### src/layout/taffy.ts

_Entrypoints: `./layout/taffy`_

| Re-export Target              | Kind | Names |
| ----------------------------- | ---- | ----- |
| `src/layout/solvers/taffy.ts` | star | -     |

_No direct exported symbols._

### src/layout/tiled_workspace.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                                       | Kind      | Type Only | JSDoc |
| -------------------------------------------- | --------- | --------- | ----- |
| `createTiledWorkspaceController`             | function  | no        | yes   |
| `createTiledWorkspaceControllerFromSnapshot` | function  | no        | yes   |
| `DockTiledWorkspaceOptions`                  | interface | yes       | yes   |
| `normalizeTiledWorkspaceLayout`              | function  | no        | yes   |
| `normalizeTiledWorkspaceSnapshot`            | function  | no        | yes   |
| `projectTiledWorkspaceLayout`                | function  | no        | yes   |
| `reconcileTiledWorkspaceLayout`              | function  | no        | yes   |
| `ReconcileTiledWorkspaceOptions`             | interface | yes       | yes   |
| `TILED_WORKSPACE_SNAPSHOT_VERSION`           | const     | no        | yes   |
| `TiledWorkspaceController`                   | class     | no        | yes   |
| `TiledWorkspaceControllerOptions`            | interface | yes       | yes   |
| `TiledWorkspaceDockEdge`                     | type      | yes       | yes   |
| `TiledWorkspaceInspection`                   | interface | yes       | yes   |
| `TiledWorkspaceLayoutInspection`             | interface | yes       | yes   |
| `TiledWorkspaceLayoutNode`                   | type      | yes       | yes   |
| `TiledWorkspaceLayoutOptions`                | interface | yes       | yes   |
| `TiledWorkspaceLayoutState`                  | interface | yes       | yes   |
| `tiledWorkspaceMinimumSize`                  | function  | no        | yes   |
| `TiledWorkspaceMinimumSize`                  | interface | yes       | yes   |
| `TiledWorkspacePaneLayout`                   | interface | yes       | yes   |
| `TiledWorkspacePaneNode`                     | interface | yes       | yes   |
| `TiledWorkspaceSeparatorAxis`                | type      | yes       | yes   |
| `TiledWorkspaceSeparatorLayout`              | interface | yes       | yes   |
| `TiledWorkspaceSnapshot`                     | interface | yes       | yes   |
| `TiledWorkspaceSplitDirection`               | type      | yes       | yes   |
| `TiledWorkspaceSplitNode`                    | interface | yes       | yes   |
| `TiledWorkspaceWindow`                       | interface | yes       | yes   |

### src/layout/types.ts

_Entrypoints: `.`, `./web`_

| Symbol          | Kind      | Type Only | JSDoc |
| --------------- | --------- | --------- | ----- |
| `Layout`        | interface | yes       | yes   |
| `LayoutElement` | interface | yes       | yes   |
| `LayoutOptions` | interface | yes       | yes   |

### src/layout/vertical_layout.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol           | Kind  | Type Only | JSDoc |
| ---------------- | ----- | --------- | ----- |
| `VerticalLayout` | class | no        | yes   |

### src/layout/window_manager.ts

_Entrypoints: `.`, `./web`_

| Symbol                          | Kind      | Type Only | JSDoc |
| ------------------------------- | --------- | --------- | ----- |
| `WINDOW_MANAGER_LAYER_Z_INDEX`  | const     | no        | yes   |
| `WindowManagerController`       | class     | no        | yes   |
| `WindowManagerLayer`            | type      | yes       | yes   |
| `WindowManagerLayoutInspection` | interface | yes       | yes   |
| `WindowManagerLayoutOptions`    | interface | yes       | yes   |
| `WindowManagerOptions`          | interface | yes       | yes   |
| `WindowManagerWindow`           | interface | yes       | yes   |
| `WindowManagerWindowInspection` | interface | yes       | yes   |
| `WindowManagerWindowState`      | type      | yes       | yes   |
| `windowManagerZOrder`           | function  | no        | yes   |

### src/markup/cascade.ts

_Entrypoints: `.`, `./web`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `AppliedTuiCssDeclaration` | interface | yes       | yes   |
| `applyCssCascade`          | function  | no        | yes   |
| `ApplyCssCascadeOptions`   | interface | yes       | yes   |
| `applyCssCascadeSubtree`   | function  | no        | yes   |
| `matchesCssMedia`          | function  | no        | yes   |
| `matchesCssSelector`       | function  | no        | yes   |
| `resolveCssVariables`      | function  | no        | yes   |
| `TuiCssEnvironment`        | interface | yes       | yes   |
| `TuiCssNodeState`          | type      | yes       | yes   |
| `TuiCssViewport`           | interface | yes       | yes   |

### src/markup/css.ts

_Entrypoints: `.`, `./web`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `cssSelectorSpecificity` | function  | no        | yes   |
| `parseCssDeclarations`   | function  | no        | yes   |
| `parseCssMediaQuery`     | function  | no        | yes   |
| `parseCssStylesheet`     | function  | no        | yes   |
| `selectorParts`          | function  | no        | yes   |
| `TuiCssDeclaration`      | interface | yes       | yes   |
| `TuiCssMediaCondition`   | interface | yes       | yes   |
| `TuiCssMediaFeature`     | type      | yes       | yes   |
| `TuiCssMediaQuery`       | interface | yes       | yes   |
| `TuiCssRule`             | interface | yes       | yes   |
| `TuiCssStylesheet`       | interface | yes       | yes   |

### src/markup/demo_fixtures.ts

_Entrypoints: `.`, `./web`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `createHtmlCssLayoutDemo`   | function  | no        | yes   |
| `HTML_CSS_LAYOUT_OPTION_ID` | const     | no        | yes   |
| `HTML_CSS_LAYOUT_WINDOW_ID` | const     | no        | yes   |
| `htmlCssLayoutDemoBoxLabel` | function  | no        | yes   |
| `htmlCssLayoutDemoCss`      | const     | no        | yes   |
| `htmlCssLayoutDemoMarkup`   | const     | no        | yes   |
| `HtmlCssLayoutDemoOptions`  | interface | yes       | yes   |

### src/markup/hot_reload.ts

_Entrypoints: `.`, `./web`_

| Symbol                             | Kind      | Type Only | JSDoc |
| ---------------------------------- | --------- | --------- | ----- |
| `cssHotReloadDiagnostics`          | function  | no        | yes   |
| `MarkupHotReloadController`        | class     | no        | yes   |
| `MarkupHotReloadControllerOptions` | interface | yes       | yes   |
| `MarkupHotReloadDiagnostic`        | interface | yes       | yes   |
| `markupHotReloadDiagnostics`       | function  | no        | yes   |
| `MarkupHotReloadInspection`        | interface | yes       | yes   |
| `MarkupHotReloadResult`            | interface | yes       | yes   |
| `MarkupHotReloadSource`            | interface | yes       | yes   |
| `MarkupHotReloadWatchIo`           | interface | yes       | yes   |
| `MarkupHotReloadWatchOptions`      | interface | yes       | yes   |
| `validateMarkupHotReloadSource`    | function  | no        | yes   |
| `watchMarkupHotReload`             | function  | no        | yes   |

### src/markup/html.ts

_Entrypoints: `.`, `./web`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `parseTuiMarkup`        | function  | no        | yes   |
| `TuiMarkupDocument`     | interface | yes       | yes   |
| `TuiMarkupParseOptions` | interface | yes       | yes   |

### src/markup/hydrate.ts

_Entrypoints: `.`, `./web`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `createMarkupLayout`       | function  | no        | yes   |
| `MarkupLayoutCache`        | class     | no        | yes   |
| `MarkupLayoutCacheOptions` | interface | yes       | yes   |
| `MarkupLayoutOptions`      | interface | yes       | yes   |
| `MarkupLayoutResult`       | interface | yes       | yes   |

### src/markup/jsx.ts

_Entrypoints: `.`, `./web`_

| Symbol                | Kind      | Type Only | JSDoc |
| --------------------- | --------- | --------- | ----- |
| `createJsxReconciler` | function  | no        | yes   |
| `Fragment`            | const     | no        | yes   |
| `h`                   | function  | no        | yes   |
| `jsx`                 | function  | no        | yes   |
| `JsxElement`          | interface | yes       | yes   |
| `JsxReconciler`       | class     | no        | yes   |
| `jsxs`                | const     | no        | yes   |

### src/markup/layout_worker.ts

_Entrypoints: `.`, `./web`_

| Symbol                             | Kind      | Type Only | JSDoc |
| ---------------------------------- | --------- | --------- | ----- |
| `createMarkupLayoutWorkerHandler`  | function  | no        | yes   |
| `MarkupLayoutWorkerCascadeOptions` | type      | yes       | yes   |
| `MarkupLayoutWorkerHandler`        | type      | yes       | yes   |
| `MarkupLayoutWorkerHandlerOptions` | interface | yes       | yes   |
| `MarkupLayoutWorkerPayload`        | interface | yes       | yes   |
| `MarkupLayoutWorkerResult`         | interface | yes       | yes   |
| `runMarkupLayoutInWorker`          | function  | no        | yes   |

### src/markup/live_dispatch.ts

_Entrypoints: `.`, `./web`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `createLiveMarkupDispatcher` | function  | no        | yes   |
| `LiveMarkupDispatcher`       | class     | no        | yes   |
| `LiveMarkupDispatchResult`   | interface | yes       | yes   |
| `LiveMarkupEvent`            | interface | yes       | yes   |
| `LiveMarkupEventContext`     | interface | yes       | yes   |
| `LiveMarkupHandler`          | type      | yes       | yes   |

### src/markup/live_host.ts

_Entrypoints: `.`, `./web`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `createLiveMarkupHost`   | function  | no        | yes   |
| `LiveMarkupCommit`       | interface | yes       | yes   |
| `LiveMarkupHost`         | class     | no        | yes   |
| `LiveMarkupHostDispatch` | interface | yes       | yes   |
| `LiveMarkupHostOptions`  | interface | yes       | yes   |

### src/markup/live_invalidation.ts

_Entrypoints: `.`, `./web`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `createLiveMarkupInvalidator` | function  | no        | yes   |
| `LiveMarkupDirtyReason`       | type      | yes       | yes   |
| `LiveMarkupDirtyRoot`         | interface | yes       | yes   |
| `LiveMarkupInvalidator`       | class     | no        | yes   |

### src/markup/live_styling.ts

_Entrypoints: `.`, `./web`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `createLiveMarkupStyler`     | function  | no        | yes   |
| `LiveMarkupRestyleResult`    | interface | yes       | yes   |
| `LiveMarkupStyler`           | class     | no        | yes   |
| `LiveMarkupStylerInspection` | interface | yes       | yes   |

### src/markup/live_tree.ts

_Entrypoints: `.`, `./web`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `createLiveMarkupTree`   | function  | no        | yes   |
| `LiveMarkupMutation`     | interface | yes       | yes   |
| `LiveMarkupQueryOptions` | interface | yes       | yes   |
| `LiveMarkupTree`         | class     | no        | yes   |
| `LiveMarkupTreeOptions`  | interface | yes       | yes   |

### src/markup/mod.ts

_Entrypoints: `.`, `./web`_

| Re-export Target                    | Kind | Names |
| ----------------------------------- | ---- | ----- |
| `src/markup/cascade.ts`             | star | -     |
| `src/markup/css.ts`                 | star | -     |
| `src/markup/demo_fixtures.ts`       | star | -     |
| `src/markup/hot_reload.ts`          | star | -     |
| `src/markup/html.ts`                | star | -     |
| `src/markup/jsx.ts`                 | star | -     |
| `src/markup/hydrate.ts`             | star | -     |
| `src/markup/layout_worker.ts`       | star | -     |
| `src/markup/live_dispatch.ts`       | star | -     |
| `src/markup/live_host.ts`           | star | -     |
| `src/markup/live_invalidation.ts`   | star | -     |
| `src/markup/live_styling.ts`        | star | -     |
| `src/markup/live_tree.ts`           | star | -     |
| `src/markup/rehydrate.ts`           | star | -     |
| `src/markup/support.ts`             | star | -     |
| `src/markup/widgets.ts`             | star | -     |
| `src/markup/window_history.ts`      | star | -     |
| `src/markup/window_interactions.ts` | star | -     |
| `src/markup/windows.ts`             | star | -     |

_No direct exported symbols._

### src/markup/rehydrate.ts

_Entrypoints: `.`, `./web`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `MarkupRehydrationResult` | interface | yes       | yes   |
| `rehydrateMarkupWidgets`  | function  | no        | yes   |

### src/markup/support.ts

_Entrypoints: `.`, `./web`_

| Symbol                 | Kind      | Type Only | JSDoc |
| ---------------------- | --------- | --------- | ----- |
| `inspectTuiCssSupport` | function  | no        | yes   |
| `TuiCssSupportReport`  | interface | yes       | yes   |

### src/markup/widgets.ts

_Entrypoints: `.`, `./web`_

| Symbol                              | Kind      | Type Only | JSDoc |
| ----------------------------------- | --------- | --------- | ----- |
| `createDefaultMarkupWidgetRegistry` | function  | no        | yes   |
| `defaultActionsForKind`             | function  | no        | yes   |
| `dispatchMarkupWidgetEvent`         | function  | no        | yes   |
| `HydratedMarkupWidget`              | interface | yes       | yes   |
| `HydratedMarkupWidgetInspection`    | interface | yes       | yes   |
| `hydrateMarkupWidgets`              | function  | no        | yes   |
| `MarkupWidgetController`            | type      | yes       | yes   |
| `MarkupWidgetDescriptor`            | interface | yes       | yes   |
| `MarkupWidgetEvent`                 | type      | yes       | yes   |
| `MarkupWidgetFactory`               | type      | yes       | yes   |
| `MarkupWidgetFactoryContext`        | interface | yes       | yes   |
| `MarkupWidgetHydration`             | class     | no        | yes   |
| `MarkupWidgetHydrationInspection`   | interface | yes       | yes   |
| `MarkupWidgetHydrationOptions`      | interface | yes       | yes   |
| `MarkupWidgetHydrationRegistry`     | class     | no        | yes   |
| `MarkupWidgetKind`                  | type      | yes       | yes   |

### src/markup/window_history.ts

_Entrypoints: `.`, `./web`_

| Symbol                                   | Kind      | Type Only | JSDoc |
| ---------------------------------------- | --------- | --------- | ----- |
| `createMarkupWindowHistoryAdapter`       | function  | no        | yes   |
| `MarkupWindowHistoryAction`              | type      | yes       | yes   |
| `MarkupWindowHistoryAdapter`             | class     | no        | yes   |
| `MarkupWindowHistoryAdapterOptions`      | interface | yes       | yes   |
| `MarkupWindowHistoryGesture`             | interface | yes       | yes   |
| `MarkupWindowHistoryGestureInspection`   | interface | yes       | yes   |
| `MarkupWindowHistoryGestureState`        | type      | yes       | yes   |
| `MarkupWindowHistoryInspection`          | interface | yes       | yes   |
| `MarkupWindowHistoryOperationInspection` | interface | yes       | yes   |
| `MarkupWindowHistoryRestoreError`        | class     | no        | yes   |
| `MarkupWindowHistoryRestoreFailure`      | type      | yes       | yes   |
| `MarkupWindowSnapshotRestorer`           | type      | yes       | yes   |

### src/markup/window_interactions.ts

_Entrypoints: `.`, `./web`_

| Symbol                                     | Kind      | Type Only | JSDoc |
| ------------------------------------------ | --------- | --------- | ----- |
| `createMarkupWindowInteractionController`  | function  | no        | yes   |
| `hitTestMarkupFloatingWindows`             | function  | no        | yes   |
| `MarkupWindowActiveInteractionInspection`  | interface | yes       | yes   |
| `MarkupWindowCellPoint`                    | interface | yes       | yes   |
| `MarkupWindowHitInspection`                | interface | yes       | yes   |
| `MarkupWindowHitRegion`                    | type      | yes       | yes   |
| `MarkupWindowHitTestOptions`               | interface | yes       | yes   |
| `MarkupWindowInteractionController`        | class     | no        | yes   |
| `MarkupWindowInteractionControllerOptions` | interface | yes       | yes   |
| `MarkupWindowInteractionInspection`        | interface | yes       | yes   |
| `MarkupWindowInteractionMode`              | type      | yes       | yes   |
| `MarkupWindowInteractionResult`            | interface | yes       | yes   |
| `MarkupWindowInteractionStatus`            | type      | yes       | yes   |
| `markupWindowSnapTargetAtPoint`            | function  | no        | yes   |

### src/markup/windows.ts

_Entrypoints: `.`, `./web`_

| Symbol                                | Kind      | Type Only | JSDoc |
| ------------------------------------- | --------- | --------- | ----- |
| `createMarkupWindowController`        | function  | no        | yes   |
| `MARKUP_WINDOW_SNAPSHOT_V1_VERSION`   | const     | no        | yes   |
| `MARKUP_WINDOW_SNAPSHOT_VERSION`      | const     | no        | yes   |
| `MarkupFloatingWindowProjection`      | interface | yes       | yes   |
| `MarkupModalInspection`               | interface | yes       | yes   |
| `MarkupModalSnapshot`                 | interface | yes       | yes   |
| `MarkupWindowAction`                  | type      | yes       | yes   |
| `MarkupWindowActionResult`            | interface | yes       | yes   |
| `MarkupWindowActionStatus`            | type      | yes       | yes   |
| `MarkupWindowCompactMode`             | type      | yes       | yes   |
| `MarkupWindowController`              | class     | no        | yes   |
| `MarkupWindowControllerInspection`    | interface | yes       | yes   |
| `MarkupWindowControllerOptions`       | interface | yes       | yes   |
| `MarkupWindowCorner`                  | type      | yes       | yes   |
| `MarkupWindowDiagnostic`              | interface | yes       | yes   |
| `MarkupWindowDiagnosticCode`          | type      | yes       | yes   |
| `MarkupWindowInspection`              | interface | yes       | yes   |
| `MarkupWindowLayoutLookup`            | interface | yes       | yes   |
| `MarkupWindowMoveDelta`               | interface | yes       | yes   |
| `MarkupWindowPlacement`               | type      | yes       | yes   |
| `MarkupWindowPlacementSnapshot`       | interface | yes       | yes   |
| `MarkupWindowProjection`              | interface | yes       | yes   |
| `MarkupWindowResizeEdge`              | type      | yes       | yes   |
| `MarkupWindowSnapshot`                | interface | yes       | yes   |
| `MarkupWindowSnapshotV1`              | interface | yes       | yes   |
| `MarkupWindowSnapTarget`              | type      | yes       | yes   |
| `MarkupWindowState`                   | type      | yes       | yes   |
| `normalizeMarkupWindowSnapshot`       | function  | no        | yes   |
| `NormalizeMarkupWindowSnapshotResult` | type      | yes       | yes   |
| `ProjectMarkupWindowsOptions`         | interface | yes       | yes   |
| `ReconcileMarkupWindowsOptions`       | interface | yes       | yes   |
| `RecoverMarkupWindowBoundsOptions`    | interface | yes       | yes   |
| `SetMarkupWindowPlacementOptions`     | interface | yes       | yes   |

### src/perf/benchmark.ts

_Entrypoints: `.`, `./web`_

| Symbol                            | Kind      | Type Only | JSDoc |
| --------------------------------- | --------- | --------- | ----- |
| `BenchmarkCase`                   | interface | yes       | yes   |
| `BenchmarkCaseInspection`         | interface | yes       | yes   |
| `BenchmarkCatalogInspection`      | interface | yes       | yes   |
| `BenchmarkCatalogMarkdownOptions` | interface | yes       | yes   |
| `BenchmarkCatalogQuery`           | interface | yes       | yes   |
| `BenchmarkCatalogReport`          | interface | yes       | yes   |
| `BenchmarkCatalogReportOptions`   | interface | yes       | yes   |
| `BenchmarkResult`                 | interface | yes       | yes   |
| `BenchmarkRunner`                 | class     | no        | yes   |
| `BenchmarkRunnerOptions`          | interface | yes       | yes   |
| `BenchmarkSummary`                | interface | yes       | yes   |
| `createBenchmarkCatalogReport`    | function  | no        | yes   |
| `formatBenchmarkCatalogMarkdown`  | function  | no        | yes   |
| `formatBenchmarkResults`          | function  | no        | yes   |
| `formatBenchmarkSummary`          | function  | no        | yes   |
| `inspectBenchmarkCase`            | function  | no        | yes   |
| `inspectBenchmarkCatalog`         | function  | no        | yes   |
| `queryBenchmarkCases`             | function  | no        | yes   |
| `summarizeBenchmarkResults`       | function  | no        | yes   |
| `summarizeBestBenchmarkSummaries` | function  | no        | yes   |

### src/perf/cache_budget.ts

_Entrypoints: `.`, `./web`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `BudgetedCache`                | interface | yes       | yes   |
| `CacheBudgetCoordinator`       | class     | no        | yes   |
| `ChargeResult`                 | type      | yes       | yes   |
| `createCacheBudgetCoordinator` | function  | no        | yes   |

### src/perf/diff_planner.ts

_Entrypoints: `.`, `./web`_

| Symbol          | Kind      | Type Only | JSDoc |
| --------------- | --------- | --------- | ----- |
| `DiffStrategy`  | type      | yes       | yes   |
| `FrameDiffPlan` | interface | yes       | yes   |
| `planFrameDiff` | function  | no        | yes   |
| `RowDiffPlan`   | interface | yes       | yes   |

### src/perf/entrypoint_budget.ts

_Entrypoints: `.`, `./web`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `BudgetBaseline`           | type      | yes       | yes   |
| `BudgetImprovement`        | interface | yes       | yes   |
| `BudgetIncrease`           | interface | yes       | yes   |
| `BudgetReport`             | interface | yes       | yes   |
| `compareEntrypointBudgets` | function  | no        | yes   |
| `EntrypointInventory`      | interface | yes       | yes   |
| `inventoryFromDenoInfo`    | function  | no        | yes   |

### src/perf/frame_cadence.ts

_Entrypoints: `.`, `./web`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `createFrameCadenceController` | function  | no        | yes   |
| `FrameCadenceController`       | class     | no        | yes   |
| `FrameCadenceOptions`          | interface | yes       | yes   |

### src/perf/frame_packets.ts

_Entrypoints: `.`, `./web`_

| Symbol              | Kind      | Type Only | JSDoc |
| ------------------- | --------- | --------- | ----- |
| `FramePacket`       | interface | yes       | yes   |
| `PackedCellInput`   | interface | yes       | yes   |
| `packFramePacket`   | function  | no        | yes   |
| `unpackFramePacket` | function  | no        | yes   |
| `UnpackResult`      | type      | yes       | yes   |

### src/perf/incremental_serialization.ts

_Entrypoints: `.`, `./web`_

| Symbol                 | Kind      | Type Only | JSDoc |
| ---------------------- | --------- | --------- | ----- |
| `decodeSerialized`     | function  | no        | yes   |
| `SerializedNode`       | interface | yes       | yes   |
| `SerializedSnapshot`   | type      | yes       | yes   |
| `serializeIncremental` | function  | no        | yes   |
| `serializeSnapshot`    | function  | no        | yes   |
| `SnapshotSections`     | interface | yes       | yes   |

### src/perf/layout_benchmarks.ts

_Entrypoints: `.`, `./web`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `buildBenchmarkTree`     | function  | no        | yes   |
| `LAYOUT_BENCHMARK_SUITE` | const     | no        | yes   |
| `LayoutBenchmarkResult`  | interface | yes       | yes   |
| `LayoutBenchmarkSpec`    | interface | yes       | yes   |
| `runLayoutBenchmark`     | function  | no        | yes   |

### src/perf/pools.ts

_Entrypoints: `.`, `./web`_

| Symbol               | Kind      | Type Only | JSDoc |
| -------------------- | --------- | --------- | ----- |
| `BufferPool`         | class     | no        | yes   |
| `createBufferPool`   | function  | no        | yes   |
| `PoolLease`          | interface | yes       | yes   |
| `PoolOwnershipError` | class     | no        | yes   |
| `PoolStats`          | interface | yes       | yes   |

### src/perf/profile_tuner.ts

_Entrypoints: `.`, `./web`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `createRuntimeProfileTuner` | function  | no        | yes   |
| `CurrentProfile`            | interface | yes       | yes   |
| `ProfileRecommendation`     | interface | yes       | yes   |
| `ProfileSample`             | interface | yes       | yes   |
| `RuntimeProfileTuner`       | class     | no        | yes   |

### src/perf/versioned_cache.ts

_Entrypoints: `.`, `./web`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `CacheMetrics`            | interface | yes       | yes   |
| `createMeasurementCaches` | function  | no        | yes   |
| `MeasurementCaches`       | interface | yes       | yes   |
| `VersionedCache`          | class     | no        | yes   |

### src/perf/write_coalescer.ts

_Entrypoints: `.`, `./web`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `createTerminalWriteCoalescer` | function  | no        | yes   |
| `TerminalWriteCoalescer`       | class     | no        | yes   |
| `WriteChunkKind`               | type      | yes       | yes   |
| `WriteSink`                    | interface | yes       | yes   |

### src/permissions.ts

_Entrypoints: `.`, `./web`_

| Symbol                                                 | Kind      | Type Only | JSDoc |
| ------------------------------------------------------ | --------- | --------- | ----- |
| `createRuntimePermissionActivationReport`              | function  | no        | yes   |
| `createRuntimePermissionActivationReportFromReporters` | function  | no        | yes   |
| `createRuntimePermissionManifest`                      | function  | no        | yes   |
| `inspectRuntimePermissionManifest`                     | function  | no        | yes   |
| `normalizeRuntimePermissionManifest`                   | function  | no        | yes   |
| `parseRuntimePermissionManifest`                       | function  | no        | yes   |
| `ResolvedRuntimePermissionManifestLimits`              | interface | yes       | yes   |
| `resolveRuntimePermissionManifestLimits`               | function  | no        | yes   |
| `RUNTIME_PERMISSION_KINDS`                             | const     | no        | yes   |
| `RUNTIME_PERMISSION_MANIFEST_SCHEMA_VERSION`           | const     | no        | yes   |
| `RuntimePermissionActivationReport`                    | interface | yes       | yes   |
| `RuntimePermissionKind`                                | type      | yes       | yes   |
| `RuntimePermissionManifest`                            | interface | yes       | yes   |
| `RuntimePermissionManifestError`                       | class     | no        | yes   |
| `RuntimePermissionManifestErrorCode`                   | type      | yes       | yes   |
| `RuntimePermissionManifestInput`                       | interface | yes       | yes   |
| `RuntimePermissionManifestLimits`                      | interface | yes       | yes   |
| `RuntimePermissionOperation`                           | type      | yes       | yes   |
| `RuntimePermissionOperations`                          | interface | yes       | yes   |
| `RuntimePermissionReportEntry`                         | type      | yes       | yes   |
| `RuntimePermissionReporter`                            | interface | yes       | yes   |
| `RuntimePermissionRequirement`                         | type      | yes       | yes   |
| `serializeRuntimePermissionManifest`                   | function  | no        | yes   |

### src/platform/types.ts

_Entrypoints: `./web`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `Disposable`              | interface | yes       | yes   |
| `InputSource`             | interface | yes       | yes   |
| `InputSourceInspection`   | interface | yes       | yes   |
| `LifecycleController`     | interface | yes       | yes   |
| `LifecycleInspection`     | interface | yes       | yes   |
| `NoopInputSource`         | class     | no        | yes   |
| `NoopLifecycleController` | class     | no        | yes   |
| `PlatformInputEmitter`    | type      | yes       | yes   |
| `PlatformInputEvents`     | interface | yes       | yes   |
| `TuiPlatform`             | interface | yes       | yes   |

### src/pointer_input.ts

_Entrypoints: `.`, `./web`_

| Symbol                               | Kind      | Type Only | JSDoc |
| ------------------------------------ | --------- | --------- | ----- |
| `adaptMousePointer`                  | function  | no        | yes   |
| `adaptPenPointer`                    | function  | no        | yes   |
| `adaptPointerEnvelope`               | function  | no        | yes   |
| `adaptTerminalMousePointer`          | function  | no        | yes   |
| `adaptTouchPointer`                  | function  | no        | yes   |
| `createPointerAdapterFrame`          | function  | no        | yes   |
| `dispatchPointerAdapterFrame`        | function  | no        | yes   |
| `normalizePointerInputEvent`         | function  | no        | yes   |
| `POINTER_INPUT_SCHEMA_VERSION`       | const     | no        | yes   |
| `PointerAdapterFrame`                | interface | yes       | yes   |
| `PointerAdapterInput`                | interface | yes       | yes   |
| `PointerCaptureChange`               | interface | yes       | yes   |
| `PointerCaptureChangeKind`           | type      | yes       | yes   |
| `PointerCaptureController`           | class     | no        | yes   |
| `PointerCaptureControllerOptions`    | interface | yes       | yes   |
| `PointerCaptureDiagnostic`           | interface | yes       | yes   |
| `PointerCaptureErrorSnapshot`        | interface | yes       | yes   |
| `PointerCaptureInspection`           | interface | yes       | yes   |
| `PointerCaptureInspectionEntry`      | interface | yes       | yes   |
| `PointerCaptureListener`             | type      | yes       | yes   |
| `PointerCaptureOwner`                | interface | yes       | yes   |
| `PointerCaptureOwnerHandle`          | interface | yes       | yes   |
| `PointerCaptureOwnerInspection`      | interface | yes       | yes   |
| `PointerContactGeometry`             | interface | yes       | yes   |
| `PointerCoordinate`                  | interface | yes       | yes   |
| `PointerCoordinates`                 | interface | yes       | yes   |
| `PointerCoordinateSpace`             | type      | yes       | yes   |
| `PointerInputDevice`                 | type      | yes       | yes   |
| `PointerInputError`                  | class     | no        | yes   |
| `PointerInputErrorCode`              | type      | yes       | yes   |
| `PointerInputEvent`                  | interface | yes       | yes   |
| `PointerInputKind`                   | type      | yes       | yes   |
| `PointerRouteContext`                | interface | yes       | yes   |
| `PointerRouteResult`                 | interface | yes       | yes   |
| `PointerSemanticController`          | interface | yes       | yes   |
| `pointerSemanticTransition`          | function  | no        | yes   |
| `PointerSemanticTransition`          | type      | yes       | yes   |
| `PointerWheelDelta`                  | interface | yes       | yes   |
| `TERMINAL_MOUSE_POINTER_ID`          | const     | no        | yes   |
| `TerminalMousePointerAdapterOptions` | interface | yes       | yes   |

### src/remote/adaptive_quality.ts

_Entrypoints: `./remote`_

| Symbol                            | Kind      | Type Only | JSDoc |
| --------------------------------- | --------- | --------- | ----- |
| `AdaptiveQualityController`       | class     | no        | yes   |
| `AdaptiveQualityOptions`          | interface | yes       | yes   |
| `createAdaptiveQualityController` | function  | no        | yes   |
| `DEFAULT_QUALITY_LADDER`          | const     | no        | yes   |
| `LinkSample`                      | interface | yes       | yes   |
| `QualityColorDepth`               | type      | yes       | yes   |
| `QualityFloors`                   | interface | yes       | yes   |
| `QualityLevel`                    | interface | yes       | yes   |
| `QualityTransition`               | interface | yes       | yes   |

### src/remote/frame_codec.ts

_Entrypoints: `./remote`_

| Symbol                 | Kind      | Type Only | JSDoc |
| ---------------------- | --------- | --------- | ----- |
| `applyCellFrameDelta`  | function  | no        | yes   |
| `CellFrame`            | interface | yes       | yes   |
| `CellRun`              | interface | yes       | yes   |
| `decodeCellFrame`      | function  | no        | yes   |
| `DecodeResult`         | type      | yes       | yes   |
| `DeltaSpan`            | interface | yes       | yes   |
| `encodeCellFrame`      | function  | no        | yes   |
| `encodeCellFrameDelta` | function  | no        | yes   |
| `EncodedDeltaFrame`    | interface | yes       | yes   |
| `EncodedFrame`         | type      | yes       | no    |
| `EncodedFullFrame`     | interface | yes       | yes   |
| `FRAME_CODEC_VERSION`  | const     | no        | yes   |
| `frameChecksum`        | function  | no        | yes   |
| `StyledCell`           | interface | yes       | yes   |

### src/remote/frame_flow.ts

_Entrypoints: `./remote`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `createFrameFlowController` | function  | no        | yes   |
| `FrameFlowController`       | class     | no        | yes   |
| `FrameFlowOptions`          | interface | yes       | yes   |
| `SequencedFrame`            | interface | yes       | yes   |

### src/remote/handshake.ts

_Entrypoints: `./web`, `./remote`_

| Symbol                                | Kind      | Type Only | JSDoc |
| ------------------------------------- | --------- | --------- | ----- |
| `createRemoteHandshakeRejection`      | function  | no        | yes   |
| `decodeRemoteHandshakeMessage`        | function  | no        | yes   |
| `encodeRemoteHandshakeMessage`        | function  | no        | yes   |
| `isRemoteHandshakeMessageType`        | function  | no        | yes   |
| `normalizeRemoteCapabilityManifest`   | function  | no        | yes   |
| `normalizeRemoteHandshakeMessage`     | function  | no        | yes   |
| `REMOTE_HANDSHAKE_SCHEMA_VERSION`     | const     | no        | yes   |
| `REMOTE_PROTOCOL_VERSION`             | const     | no        | yes   |
| `RemoteCapabilityHandshake`           | class     | no        | yes   |
| `RemoteCapabilityHandshakeInspection` | interface | yes       | yes   |
| `RemoteCapabilityHandshakeOptions`    | interface | yes       | yes   |
| `RemoteCapabilityManifest`            | interface | yes       | yes   |
| `RemoteHandshakeAck`                  | interface | yes       | yes   |
| `RemoteHandshakeError`                | class     | no        | yes   |
| `RemoteHandshakeErrorCode`            | type      | yes       | yes   |
| `RemoteHandshakeHello`                | interface | yes       | yes   |
| `RemoteHandshakeLimits`               | interface | yes       | yes   |
| `RemoteHandshakeMessage`              | type      | yes       | yes   |
| `RemoteHandshakeNegotiated`           | interface | yes       | yes   |
| `RemoteHandshakeReject`               | interface | yes       | yes   |
| `RemoteHandshakeRejection`            | interface | yes       | yes   |
| `RemoteHandshakeRejectionCode`        | type      | yes       | yes   |
| `RemoteHandshakeRole`                 | type      | yes       | yes   |
| `RemoteHandshakeState`                | type      | yes       | yes   |
| `RemoteHandshakeTransition`           | interface | yes       | yes   |
| `RemoteProtocolVersion`               | interface | yes       | yes   |
| `ResolvedRemoteHandshakeLimits`       | interface | yes       | yes   |
| `resolveRemoteHandshakeLimits`        | function  | no        | yes   |

### src/remote/input_sequencing.ts

_Entrypoints: `./remote`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `createRemoteInputSequencer` | function  | no        | yes   |
| `InputSequencerOptions`      | interface | yes       | yes   |
| `InputSubmissionOutcome`     | type      | yes       | yes   |
| `InputSubmissionReport`      | interface | yes       | yes   |
| `RemoteInputSequencer`       | class     | no        | yes   |

### src/remote/multi_client.ts

_Entrypoints: `./remote`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `createMultiClientSession` | function  | no        | yes   |
| `MultiClientPolicy`        | interface | yes       | yes   |
| `MultiClientSession`       | class     | no        | yes   |
| `Participant`              | interface | yes       | yes   |
| `SessionAnnouncement`      | interface | yes       | yes   |

### src/remote/session_auth.ts

_Entrypoints: `./remote`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `AuthDecision`                 | type      | yes       | yes   |
| `Authenticator`                | type      | yes       | yes   |
| `createRemoteSessionAuthority` | function  | no        | yes   |
| `RemoteSessionAuthority`       | class     | no        | yes   |
| `SessionCapability`            | type      | yes       | yes   |
| `SessionPrincipal`             | interface | yes       | yes   |
| `SessionRole`                  | type      | yes       | yes   |

### src/remote/session_lifecycle.ts

_Entrypoints: `./remote`_

| Symbol                          | Kind      | Type Only | JSDoc |
| ------------------------------- | --------- | --------- | ----- |
| `createSessionLifecycleManager` | function  | no        | yes   |
| `SessionBackend`                | interface | yes       | yes   |
| `SessionLifecycleManager`       | class     | no        | yes   |
| `SessionLifecyclePolicy`        | interface | yes       | yes   |
| `TerminationReason`             | type      | yes       | yes   |
| `TerminationRecord`             | interface | yes       | yes   |

### src/remote/session_resume.ts

_Entrypoints: `./remote`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `createSessionResumeManager` | function  | no        | yes   |
| `ResumeResult`               | type      | yes       | yes   |
| `SessionCheckpoint`          | interface | yes       | yes   |
| `SessionResumeManager`       | class     | no        | yes   |

### src/remote/transport_policy.ts

_Entrypoints: `./remote`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `createSecureTransportPolicy` | function  | no        | yes   |
| `SecureTransportPolicy`       | class     | no        | yes   |
| `TransportCandidate`          | interface | yes       | yes   |
| `TransportPolicyOptions`      | interface | yes       | yes   |
| `TransportVerdict`            | type      | yes       | yes   |
| `VerifiedTransportIdentity`   | interface | yes       | yes   |

### src/runtime/async_channel.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                              | Kind      | Type Only | JSDoc |
| ----------------------------------- | --------- | --------- | ----- |
| `AsyncChannel`                      | class     | no        | yes   |
| `AsyncChannelAbortedError`          | class     | no        | yes   |
| `AsyncChannelClosedError`           | class     | no        | yes   |
| `AsyncChannelDisposedError`         | class     | no        | yes   |
| `AsyncChannelDroppedInspection`     | interface | yes       | yes   |
| `AsyncChannelEndResult`             | interface | yes       | yes   |
| `AsyncChannelErrorInspection`       | interface | yes       | yes   |
| `AsyncChannelInspection`            | interface | yes       | yes   |
| `AsyncChannelIterator`              | interface | yes       | yes   |
| `AsyncChannelIteratorOptions`       | interface | yes       | yes   |
| `AsyncChannelOperationAbortedError` | class     | no        | yes   |
| `AsyncChannelOperationOptions`      | interface | yes       | yes   |
| `AsyncChannelOptions`               | interface | yes       | yes   |
| `AsyncChannelOverflowError`         | class     | no        | yes   |
| `AsyncChannelOverflowPolicy`        | type      | yes       | yes   |
| `AsyncChannelReceiveResult`         | type      | yes       | yes   |
| `AsyncChannelSendResult`            | interface | yes       | yes   |
| `AsyncChannelSendStatus`            | type      | yes       | yes   |
| `AsyncChannelSequenceOverflowError` | class     | no        | yes   |
| `AsyncChannelStatus`                | type      | yes       | yes   |
| `AsyncChannelValueResult`           | interface | yes       | yes   |
| `AsyncChannelWaiterLimitError`      | class     | no        | yes   |
| `createAsyncChannel`                | function  | no        | yes   |

### src/runtime/async_iterable.ts

_Entrypoints: `.`, `./web`, `./runtime`_

| Symbol                                    | Kind      | Type Only | JSDoc |
| ----------------------------------------- | --------- | --------- | ----- |
| `AsyncIterableMapper`                     | type      | yes       | yes   |
| `AsyncIterableOperatorAbortedError`       | class     | no        | yes   |
| `AsyncIterableOperatorConcurrencyError`   | class     | no        | yes   |
| `AsyncIterableOperatorConfigurationError` | class     | no        | yes   |
| `AsyncIterableOperatorDisposedError`      | class     | no        | yes   |
| `AsyncIterableOperatorErrorInspection`    | interface | yes       | yes   |
| `AsyncIterableOperatorInspection`         | interface | yes       | yes   |
| `AsyncIterableOperatorKind`               | type      | yes       | yes   |
| `AsyncIterableOperatorOptions`            | interface | yes       | yes   |
| `AsyncIterableOperatorPendingNextError`   | class     | no        | yes   |
| `AsyncIterableOperatorStatus`             | type      | yes       | yes   |
| `AsyncIterablePredicate`                  | type      | yes       | yes   |
| `AsyncIterableRetryContext`               | interface | yes       | yes   |
| `AsyncIterableRetryFactory`               | type      | yes       | yes   |
| `bufferAsyncIterable`                     | function  | no        | yes   |
| `BufferAsyncIterableOptions`              | interface | yes       | yes   |
| `debounceAsyncIterable`                   | function  | no        | yes   |
| `DebounceAsyncIterableOptions`            | interface | yes       | yes   |
| `DisposableAsyncIterable`                 | interface | yes       | yes   |
| `DisposableAsyncIterator`                 | interface | yes       | yes   |
| `filterAsyncIterable`                     | function  | no        | yes   |
| `mapAsyncIterable`                        | function  | no        | yes   |
| `MergeAsyncIterableOptions`               | interface | yes       | yes   |
| `mergeAsyncIterables`                     | function  | no        | yes   |
| `retryAsyncIterable`                      | function  | no        | yes   |
| `RetryAsyncIterableOptions`               | interface | yes       | yes   |
| `switchLatestAsyncIterable`               | function  | no        | yes   |
| `throttleAsyncIterable`                   | function  | no        | yes   |
| `ThrottleAsyncIterableOptions`            | interface | yes       | yes   |
| `windowAsyncIterable`                     | function  | no        | yes   |
| `WindowAsyncIterableOptions`              | interface | yes       | yes   |

### src/runtime/cache_tags.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `CacheInvalidationReport` | interface | yes       | yes   |
| `createTaggedCacheIndex`  | function  | no        | yes   |
| `TaggedCacheIndex`        | class     | no        | yes   |

### src/runtime/capabilities.ts

_Entrypoints: `.`, `./web`, `./runtime`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `createRuntimePlan`            | function  | no        | yes   |
| `detectRuntimeCapabilities`    | function  | no        | yes   |
| `formatRuntimeCapabilities`    | function  | no        | yes   |
| `formatRuntimePlan`            | function  | no        | yes   |
| `RuntimeCapabilities`          | interface | yes       | yes   |
| `runtimeCapabilityEntries`     | function  | no        | yes   |
| `RuntimeCapabilityEntry`       | interface | yes       | yes   |
| `RuntimeCapabilityId`          | type      | yes       | yes   |
| `RuntimeCapabilitySummary`     | interface | yes       | yes   |
| `RuntimePlan`                  | interface | yes       | yes   |
| `RuntimePlanDecision`          | interface | yes       | yes   |
| `RuntimePlanOptions`           | interface | yes       | yes   |
| `RuntimeRendererStrategy`      | type      | yes       | yes   |
| `RuntimeStorageStrategy`       | type      | yes       | yes   |
| `RuntimeWorkerStrategy`        | type      | yes       | yes   |
| `summarizeRuntimeCapabilities` | function  | no        | yes   |

### src/runtime/cell_screen.ts

_Entrypoints: `.`, `./runtime`_

| Symbol               | Kind      | Type Only | JSDoc |
| -------------------- | --------- | --------- | ----- |
| `CellAttributes`     | interface | yes       | yes   |
| `CellRect`           | interface | yes       | yes   |
| `CellScreen`         | class     | no        | yes   |
| `createCellScreen`   | function  | no        | yes   |
| `DEFAULT_ATTRIBUTES` | const     | no        | yes   |
| `ScreenCell`         | interface | yes       | yes   |

### src/runtime/clock.ts

_Entrypoints: `.`, `./web`, `./runtime`_

| Symbol                          | Kind      | Type Only | JSDoc |
| ------------------------------- | --------- | --------- | ----- |
| `createHostTimerScheduler`      | function  | no        | yes   |
| `createVirtualTimerScheduler`   | function  | no        | yes   |
| `HostTimerScheduler`            | class     | no        | yes   |
| `HostTimerSchedulerOptions`     | interface | yes       | yes   |
| `MAX_MONOTONIC_TIME`            | const     | no        | yes   |
| `MonotonicClock`                | interface | yes       | yes   |
| `MonotonicClockRegressionError` | class     | no        | yes   |
| `TimerAdvanceLimitError`        | class     | no        | yes   |
| `TimerCallback`                 | type      | yes       | yes   |
| `TimerHandle`                   | interface | yes       | yes   |
| `TimerInspection`               | interface | yes       | yes   |
| `TimerScheduler`                | interface | yes       | yes   |
| `TimerSchedulerDisposedError`   | class     | no        | yes   |
| `TimerSchedulerErrorContext`    | interface | yes       | yes   |
| `TimerSchedulerErrorPhase`      | type      | yes       | yes   |
| `TimerSchedulerInspection`      | interface | yes       | yes   |
| `TimerSchedulerOptions`         | interface | yes       | yes   |
| `TimerSchedulerReentrancyError` | class     | no        | yes   |
| `TimerStatus`                   | type      | yes       | yes   |
| `VirtualTimerAdvanceOptions`    | interface | yes       | yes   |
| `VirtualTimerAdvanceResult`     | interface | yes       | yes   |
| `VirtualTimerScheduler`         | class     | no        | yes   |
| `VirtualTimerSchedulerOptions`  | interface | yes       | yes   |

### src/runtime/conflict_resolvers.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                 | Kind      | Type Only | JSDoc |
| ---------------------- | --------- | --------- | ----- |
| `Conflict`             | interface | yes       | yes   |
| `ConflictLedger`       | class     | no        | yes   |
| `ConflictResolution`   | type      | yes       | yes   |
| `ConflictResolver`     | type      | yes       | yes   |
| `createConflictLedger` | function  | no        | yes   |
| `fieldMergeResolver`   | function  | no        | yes   |
| `lastWriteResolver`    | function  | no        | yes   |
| `rejectResolver`       | function  | no        | yes   |
| `threeWayResolver`     | function  | no        | yes   |

### src/runtime/console_presenter.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `consolePresenter`        | function  | no        | yes   |
| `ConsolePresenterOptions` | interface | yes       | yes   |
| `runConsoleShellApp`      | function  | no        | yes   |

### src/runtime/core_metrics.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                 | Kind      | Type Only | JSDoc |
| ---------------------- | --------- | --------- | ----- |
| `CORE_METRICS`         | const     | no        | yes   |
| `CoreMetricName`       | type      | yes       | yes   |
| `CoreMetrics`          | class     | no        | yes   |
| `CoreMetricsOptions`   | interface | yes       | yes   |
| `createCoreMetrics`    | function  | no        | yes   |
| `MetricAttributeError` | class     | no        | yes   |

### src/runtime/data_pipeline_bindings.ts

_Entrypoints: `.`, `./web`, `./runtime`_

| Symbol                          | Kind      | Type Only | JSDoc |
| ------------------------------- | --------- | --------- | ----- |
| `bindDataPipeline`              | function  | no        | yes   |
| `DataPipelineBinding`           | interface | yes       | yes   |
| `DataPipelineBindingInspection` | interface | yes       | yes   |
| `DataPipelineBindingOptions`    | interface | yes       | yes   |

### src/runtime/data_pipeline.ts

_Entrypoints: `.`, `./web`, `./runtime`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `CachedDataPipeline`           | class     | no        | yes   |
| `CachedDataPipelineInspection` | interface | yes       | yes   |
| `CachedDataPipelineOptions`    | interface | yes       | yes   |
| `createCachedDataPipeline`     | function  | no        | yes   |
| `DataPipelineAbortError`       | class     | no        | yes   |
| `DataPipelineCacheKey`         | type      | yes       | yes   |
| `DataPipelineContext`          | interface | yes       | yes   |
| `DataPipelineOptions`          | interface | yes       | yes   |
| `DataTransform`                | type      | yes       | yes   |
| `filterRows`                   | function  | no        | yes   |
| `LatestDataPipeline`           | class     | no        | yes   |
| `LatestPipelineResult`         | interface | yes       | yes   |
| `mapRows`                      | function  | no        | yes   |
| `runDataPipeline`              | function  | no        | yes   |
| `sliceRows`                    | function  | no        | yes   |
| `sortRows`                     | function  | no        | yes   |
| `WorkerPayloadMapper`          | type      | yes       | yes   |
| `WorkerTaskRunner`             | interface | yes       | yes   |
| `workerTransform`              | function  | no        | yes   |

### src/runtime/data_query.ts

_Entrypoints: `.`, `./web`, `./runtime`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `createDataQueryController`  | function  | no        | yes   |
| `DataQueryController`        | class     | no        | yes   |
| `DataQueryControllerOptions` | interface | yes       | yes   |
| `DataQueryFilters`           | type      | yes       | yes   |
| `DataQueryInspection`        | interface | yes       | yes   |
| `DataQueryParams`            | interface | yes       | yes   |
| `DataQueryResult`            | interface | yes       | yes   |
| `DataQuerySort`              | interface | yes       | yes   |
| `DataQuerySortDirection`     | type      | yes       | yes   |
| `LocalDataQueryOptions`      | interface | yes       | yes   |
| `nextDataQuerySort`          | function  | no        | yes   |
| `normalizeDataQueryParams`   | function  | no        | yes   |
| `NormalizedDataQueryParams`  | interface | yes       | yes   |
| `pageDataQueryRows`          | function  | no        | yes   |
| `queryLocalData`             | function  | no        | yes   |

### src/runtime/deadline.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                              | Kind      | Type Only | JSDoc |
| ----------------------------------- | --------- | --------- | ----- |
| `createDeadlineBudget`              | function  | no        | yes   |
| `DeadlineBudget`                    | class     | no        | yes   |
| `DeadlineBudgetCancellationError`   | class     | no        | yes   |
| `DeadlineBudgetCancellationSource`  | type      | yes       | yes   |
| `DeadlineBudgetChildOptions`        | interface | yes       | yes   |
| `DeadlineBudgetInspection`          | interface | yes       | yes   |
| `DeadlineBudgetOptions`             | interface | yes       | yes   |
| `DeadlineBudgetReasonInspection`    | interface | yes       | yes   |
| `DeadlineBudgetStatus`              | type      | yes       | yes   |
| `DeadlineExceededError`             | class     | no        | yes   |
| `isDeadlineBudgetCancellationError` | function  | no        | yes   |
| `isDeadlineExceededError`           | function  | no        | yes   |

### src/runtime/diagnostics.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                          | Kind      | Type Only | JSDoc |
| ------------------------------- | --------- | --------- | ----- |
| `DiagnosticEntry`               | interface | yes       | yes   |
| `DiagnosticInput`               | type      | yes       | yes   |
| `DiagnosticListener`            | type      | yes       | yes   |
| `DiagnosticsCollector`          | class     | no        | yes   |
| `DiagnosticSeverity`            | type      | yes       | yes   |
| `DiagnosticsInspection`         | interface | yes       | yes   |
| `DiagnosticStatusFormatOptions` | interface | yes       | yes   |
| `DiagnosticStatusSummary`       | interface | yes       | yes   |
| `formatDiagnostics`             | function  | no        | yes   |
| `formatDiagnosticsMarkdown`     | function  | no        | yes   |
| `formatDiagnosticStatus`        | function  | no        | yes   |
| `summarizeDiagnostics`          | function  | no        | yes   |

### src/runtime/graphics_surface.ts

_Entrypoints: `.`, `./web`, `./runtime`_

| Symbol                                          | Kind      | Type Only | JSDoc |
| ----------------------------------------------- | --------- | --------- | ----- |
| `createKittyGraphicsSurface`                    | function  | no        | yes   |
| `createNoopGraphicsSurface`                     | function  | no        | yes   |
| `CreateWorkbenchKittyGraphicsControllerOptions` | interface | yes       | yes   |
| `detectTmuxPassthroughAllowed`                  | function  | no        | yes   |
| `DetectTmuxPassthroughOptions`                  | interface | yes       | yes   |
| `formatWorkbenchKittyGraphicsStatus`            | function  | no        | yes   |
| `GraphicsClearScope`                            | type      | yes       | yes   |
| `GraphicsDeleteMode`                            | type      | yes       | yes   |
| `GraphicsHandle`                                | interface | yes       | yes   |
| `GraphicsImage`                                 | interface | yes       | yes   |
| `GraphicsImageEncoding`                         | type      | yes       | yes   |
| `GraphicsPlacement`                             | interface | yes       | yes   |
| `GraphicsSurface`                               | interface | yes       | yes   |
| `GraphicsSurfaceInspection`                     | interface | yes       | yes   |
| `GraphicsSurfaceKind`                           | type      | yes       | yes   |
| `GraphicsSurfaceWriter`                         | interface | yes       | yes   |
| `KittyGraphicsSurface`                          | class     | no        | yes   |
| `KittyGraphicsSurfaceOptions`                   | interface | yes       | yes   |
| `NoopGraphicsSurface`                           | class     | no        | yes   |
| `TmuxPassthroughProbeResult`                    | interface | yes       | yes   |
| `WorkbenchKittyGraphicsController`              | class     | no        | yes   |
| `WorkbenchKittyGraphicsControllerOptions`       | interface | yes       | yes   |
| `WorkbenchKittyGraphicsSelection`               | interface | yes       | yes   |
| `WorkbenchKittyGraphicsStatusOptions`           | interface | yes       | yes   |

### src/runtime/health_snapshot.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                | Kind      | Type Only | JSDoc |
| --------------------- | --------- | --------- | ----- |
| `ClassifiedFailure`   | interface | yes       | yes   |
| `createHealthMonitor` | function  | no        | yes   |
| `HealthMonitor`       | class     | no        | yes   |
| `HealthSnapshot`      | interface | yes       | yes   |
| `SubsystemHealth`     | interface | yes       | yes   |

### src/runtime/infinite_query.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                          | Kind      | Type Only | JSDoc |
| ------------------------------- | --------- | --------- | ----- |
| `createInfiniteQueryController` | function  | no        | yes   |
| `InfiniteQueryController`       | class     | no        | yes   |
| `InfiniteQueryFetcher`          | type      | yes       | yes   |
| `InfiniteQueryOptions`          | interface | yes       | yes   |
| `InfiniteQueryPage`             | interface | yes       | yes   |

### src/runtime/kitty_graphics.ts

_Entrypoints: `.`, `./web`, `./runtime`_

| Symbol                                | Kind      | Type Only | JSDoc |
| ------------------------------------- | --------- | --------- | ----- |
| `chunkKittyGraphicsCommand`           | function  | no        | yes   |
| `createKittyGraphicsDeleteCommand`    | function  | no        | yes   |
| `createKittyGraphicsTransmitCommands` | function  | no        | yes   |
| `detectKittyGraphicsCapability`       | function  | no        | yes   |
| `encodeKittyGraphicsCommand`          | function  | no        | yes   |
| `encodeKittyGraphicsControl`          | function  | no        | yes   |
| `encodeKittyGraphicsPayload`          | function  | no        | yes   |
| `inspectKittyGraphicsCommand`         | function  | no        | yes   |
| `KITTY_GRAPHICS_END`                  | const     | no        | yes   |
| `KITTY_GRAPHICS_START`                | const     | no        | yes   |
| `KittyGraphicsAction`                 | type      | yes       | yes   |
| `KittyGraphicsCapability`             | interface | yes       | yes   |
| `KittyGraphicsChunkOptions`           | interface | yes       | yes   |
| `KittyGraphicsCommandInspection`      | interface | yes       | yes   |
| `KittyGraphicsCommandOptions`         | interface | yes       | yes   |
| `KittyGraphicsControl`                | type      | yes       | yes   |
| `KittyGraphicsControlValue`           | type      | yes       | yes   |
| `KittyGraphicsDeleteOptions`          | interface | yes       | yes   |
| `KittyGraphicsDetectionOptions`       | interface | yes       | yes   |
| `KittyGraphicsFormat`                 | type      | yes       | yes   |
| `KittyGraphicsMode`                   | type      | yes       | yes   |
| `KittyGraphicsQuietMode`              | type      | yes       | yes   |
| `KittyGraphicsTransmissionMedium`     | type      | yes       | yes   |
| `KittyGraphicsTransmitOptions`        | interface | yes       | yes   |
| `wrapKittyGraphicsForTmux`            | function  | no        | yes   |

### src/runtime/kitty_keyboard.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `createKittyKeyboardDecoder` | function  | no        | yes   |
| `KITTY_KEYBOARD_APP_FLAGS`   | const     | no        | yes   |
| `KITTY_KEYBOARD_FLAGS`       | const     | no        | yes   |
| `kittyKeyboardEnterSequence` | function  | no        | yes   |
| `kittyKeyboardExitSequence`  | function  | no        | yes   |
| `kittyKeyboardQuerySequence` | function  | no        | yes   |
| `KittyKeyEvent`              | interface | yes       | yes   |
| `kittyShortcutKey`           | function  | no        | yes   |
| `parseKittyKey`              | function  | no        | yes   |

### src/runtime/kitty_passthrough.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `KittyGraphicsData`            | interface | yes       | yes   |
| `KittyPassthroughRelay`        | class     | no        | yes   |
| `KittyPassthroughRelayOptions` | interface | yes       | yes   |
| `KittyRelayCell`               | interface | yes       | yes   |
| `KittyRelayEmission`           | interface | yes       | yes   |
| `KittyRelayRect`               | interface | yes       | yes   |
| `parseKittyGraphicsData`       | function  | no        | yes   |
| `serializeKittyGraphicsData`   | function  | no        | yes   |

### src/runtime/line_attributes.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `createLineAttributeScreen` | function  | no        | yes   |
| `LineAttribute`             | type      | yes       | yes   |
| `LineAttributeScreen`       | class     | no        | yes   |
| `LogicalLine`               | interface | yes       | yes   |
| `RenderedLine`              | interface | yes       | yes   |

### src/runtime/mod.ts

_Entrypoints: `.`, `./runtime`_

| Re-export Target                           | Kind | Names |
| ------------------------------------------ | ---- | ----- |
| `src/runtime/async_channel.ts`             | star | -     |
| `src/runtime/async_iterable.ts`            | star | -     |
| `src/runtime/capabilities.ts`              | star | -     |
| `src/runtime/clock.ts`                     | star | -     |
| `src/runtime/data_pipeline.ts`             | star | -     |
| `src/runtime/data_pipeline_bindings.ts`    | star | -     |
| `src/runtime/data_query.ts`                | star | -     |
| `src/runtime/deadline.ts`                  | star | -     |
| `src/runtime/diagnostics.ts`               | star | -     |
| `src/runtime/graphics_surface.ts`          | star | -     |
| `src/runtime/kitty_graphics.ts`            | star | -     |
| `src/runtime/kitty_passthrough.ts`         | star | -     |
| `src/runtime/profiles.ts`                  | star | -     |
| `src/runtime/renderer_backends.ts`         | star | -     |
| `src/runtime/resource.ts`                  | star | -     |
| `src/runtime/resource_bindings.ts`         | star | -     |
| `src/runtime/resource_cache.ts`            | star | -     |
| `src/runtime/resource_loads.ts`            | star | -     |
| `src/runtime/render_loop.ts`               | star | -     |
| `src/runtime/scheduler.ts`                 | star | -     |
| `src/runtime/storage.ts`                   | star | -     |
| `src/runtime/telemetry.ts`                 | star | -     |
| `src/runtime/terminal_capabilities.ts`     | star | -     |
| `src/runtime/terminal_backend.ts`          | star | -     |
| `src/runtime/terminal_backend_registry.ts` | star | -     |
| `src/runtime/pty_backend.ts`               | star | -     |
| `src/runtime/terminal_templates.ts`        | star | -     |
| `src/runtime/terminal_status.ts`           | star | -     |
| `src/runtime/process_session.ts`           | star | -     |
| `src/runtime/terminal_palette.ts`          | star | -     |
| `src/runtime/terminal_screen.ts`           | star | -     |
| `src/runtime/terminal_scrollback.ts`       | star | -     |
| `src/runtime/terminal_shell.ts`            | star | -     |
| `src/runtime/terminal_shell_workspace.ts`  | star | -     |
| `src/runtime/terminal_session.ts`          | star | -     |
| `src/runtime/terminal_services.ts`         | star | -     |
| `src/runtime/cache_tags.ts`                | star | -     |
| `src/runtime/conflict_resolvers.ts`        | star | -     |
| `src/runtime/health_snapshot.ts`           | star | -     |
| `src/runtime/infinite_query.ts`            | star | -     |
| `src/runtime/mutations.ts`                 | star | -     |
| `src/runtime/core_metrics.ts`              | star | -     |
| `src/runtime/observability.ts`             | star | -     |
| `src/runtime/observability_context.ts`     | star | -     |
| `src/runtime/offline_queue.ts`             | star | -     |
| `src/runtime/priority_scheduler.ts`        | star | -     |
| `src/runtime/rate_limiter.ts`              | star | -     |
| `src/runtime/permission_adapters.ts`       | star | -     |
| `src/runtime/resource_limits.ts`           | star | -     |
| `src/runtime/cell_screen.ts`               | star | -     |
| `src/runtime/selective_erase.ts`           | star | -     |
| `src/runtime/line_attributes.ts`           | star | -     |
| `src/runtime/reflow_screen.ts`             | star | -     |
| `src/runtime/terminal_margins.ts`          | star | -     |
| `src/runtime/terminal_parser.ts`           | star | -     |
| `src/runtime/terminal_operations.ts`       | star | -     |
| `src/runtime/terminal_passthrough.ts`      | star | -     |
| `src/runtime/terminal_queries.ts`          | star | -     |
| `src/runtime/terminal_sanitizer.ts`        | star | -     |
| `src/runtime/retry_policy.ts`              | star | -     |
| `src/runtime/signal_exporters.ts`          | star | -     |
| `src/runtime/signal_redaction.ts`          | star | -     |
| `src/runtime/span_instrumentation.ts`      | star | -     |
| `src/runtime/stream_resource.ts`           | star | -     |
| `src/runtime/structured_logs.ts`           | star | -     |
| `src/runtime/supervisor.ts`                | star | -     |
| `src/runtime/support_bundle.ts`            | star | -     |
| `src/runtime/task_context.ts`              | star | -     |
| `src/runtime/timeline.ts`                  | star | -     |
| `src/runtime/trace_sampling.ts`            | star | -     |
| `src/runtime/worker_protocol.ts`           | star | -     |
| `src/runtime/task_group.ts`                | star | -     |
| `src/runtime/terminal_workspace.ts`        | star | -     |
| `src/runtime/worker_pool.ts`               | star | -     |
| `src/runtime/screen_mode_policy.ts`        | star | -     |
| `src/runtime/offscreen_surface.ts`         | star | -     |
| `src/runtime/kitty_keyboard.ts`            | star | -     |
| `src/runtime/render_accounting.ts`         | star | -     |
| `src/runtime/stream_ownership.ts`          | star | -     |
| `src/runtime/console_presenter.ts`         | star | -     |

_No direct exported symbols._

### src/runtime/mutations.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `createMutationResource` | function  | no        | yes   |
| `MutationOutcome`        | interface | yes       | yes   |
| `MutationRequest`        | interface | yes       | yes   |
| `MutationResource`       | class     | no        | yes   |

### src/runtime/observability_context.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `createObservabilityScope` | function  | no        | yes   |
| `ObservabilityResource`    | interface | yes       | yes   |
| `ObservabilityScope`       | class     | no        | yes   |

### src/runtime/observability.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `installObservabilityProvider` | function  | no        | yes   |
| `NOOP_OBSERVABILITY`           | const     | no        | yes   |
| `ObservabilityAttributes`      | type      | yes       | yes   |
| `ObservabilityCounter`         | interface | yes       | yes   |
| `ObservabilityGauge`           | interface | yes       | yes   |
| `ObservabilityHistogram`       | interface | yes       | yes   |
| `observabilityInstalled`       | function  | no        | yes   |
| `observabilityLogger`          | function  | no        | yes   |
| `ObservabilityLogger`          | interface | yes       | yes   |
| `observabilityMeter`           | function  | no        | yes   |
| `ObservabilityMeter`           | interface | yes       | yes   |
| `ObservabilityProvider`        | interface | yes       | yes   |
| `ObservabilitySpan`            | interface | yes       | yes   |
| `observabilityTracer`          | function  | no        | yes   |
| `ObservabilityTracer`          | interface | yes       | yes   |

### src/runtime/offline_queue.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `createOfflineMutationQueue` | function  | no        | yes   |
| `OfflineMutation`            | interface | yes       | yes   |
| `OfflineMutationQueue`       | class     | no        | yes   |
| `OfflineReplayResult`        | interface | yes       | yes   |

### src/runtime/offscreen_surface.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `createCodeSurfaceWriter`     | function  | no        | yes   |
| `createMarkdownSurfaceWriter` | function  | no        | yes   |
| `createProcessOutputWriter`   | function  | no        | yes   |
| `OffscreenSegment`            | interface | yes       | yes   |
| `OffscreenSnapshot`           | interface | yes       | yes   |
| `OffscreenSurface`            | class     | no        | yes   |

### src/runtime/permission_adapters.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                          | Kind      | Type Only | JSDoc |
| ------------------------------- | --------- | --------- | ----- |
| `BrokerAnswer`                  | type      | yes       | yes   |
| `BrokerPermissionAdapter`       | class     | no        | yes   |
| `combinePermissionDecisions`    | function  | no        | yes   |
| `createBrokerPermissionAdapter` | function  | no        | yes   |
| `createDenoPermissionAdapter`   | function  | no        | yes   |
| `denoDescriptorFor`             | function  | no        | yes   |
| `DenoPermissionAdapter`         | class     | no        | yes   |
| `DenoPermissionQuery`           | type      | yes       | yes   |
| `PermissionDecider`             | interface | yes       | yes   |
| `PermissionDecision`            | interface | yes       | yes   |
| `PermissionRevocation`          | interface | yes       | yes   |

### src/runtime/priority_scheduler.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `createPriorityScheduler`  | function  | no        | yes   |
| `PriorityScheduler`        | class     | no        | yes   |
| `PrioritySchedulerOptions` | interface | yes       | yes   |
| `PrioritySchedulerTask`    | interface | yes       | yes   |

### src/runtime/process_session.ts

_Entrypoints: `.`, `./runtime`, `./terminal`_

| Symbol                            | Kind      | Type Only | JSDoc |
| --------------------------------- | --------- | --------- | ----- |
| `formatProcessCommandLine`        | function  | no        | yes   |
| `ProcessSessionChild`             | interface | yes       | yes   |
| `ProcessSessionCommand`           | interface | yes       | yes   |
| `ProcessSessionController`        | class     | no        | yes   |
| `ProcessSessionControllerOptions` | interface | yes       | yes   |
| `ProcessSessionExit`              | interface | yes       | yes   |
| `ProcessSessionInspection`        | interface | yes       | yes   |
| `ProcessSessionSpawner`           | type      | yes       | yes   |
| `ProcessSessionStatus`            | type      | yes       | yes   |

### src/runtime/profiles.ts

_Entrypoints: `.`, `./web`, `./runtime`_

| Symbol                                 | Kind      | Type Only | JSDoc |
| -------------------------------------- | --------- | --------- | ----- |
| `createRuntimeProfile`                 | function  | no        | yes   |
| `createRuntimeProfileCatalogReport`    | function  | no        | yes   |
| `createRuntimeProfileController`       | function  | no        | yes   |
| `createRuntimeProfileRegistry`         | function  | no        | yes   |
| `findRuntimeProfile`                   | function  | no        | yes   |
| `formatRuntimeProfileCatalogMarkdown`  | function  | no        | yes   |
| `inspectRuntimeProfileCatalog`         | function  | no        | yes   |
| `queryRuntimeProfiles`                 | function  | no        | yes   |
| `RuntimeProfile`                       | class     | no        | yes   |
| `RuntimeProfileCatalogInspection`      | interface | yes       | yes   |
| `RuntimeProfileCatalogMarkdownOptions` | interface | yes       | yes   |
| `RuntimeProfileCatalogQuery`           | interface | yes       | yes   |
| `RuntimeProfileCatalogReport`          | interface | yes       | yes   |
| `RuntimeProfileCatalogReportOptions`   | interface | yes       | yes   |
| `RuntimeProfileController`             | class     | no        | yes   |
| `RuntimeProfileControllerInspection`   | interface | yes       | yes   |
| `RuntimeProfileControllerOptions`      | interface | yes       | yes   |
| `RuntimeProfileDefinition`             | interface | yes       | yes   |
| `runtimeProfileDefinitions`            | const     | no        | yes   |
| `RuntimeProfileInspection`             | interface | yes       | yes   |
| `RuntimeProfileNotFoundError`          | class     | no        | yes   |
| `RuntimeProfilePlanInspection`         | interface | yes       | yes   |
| `RuntimeProfileRegistry`               | class     | no        | yes   |
| `runtimeProfiles`                      | function  | no        | yes   |

### src/runtime/pty_backend.ts

_Entrypoints: `.`, `./runtime`, `./terminal`_

| Symbol                                         | Kind      | Type Only | JSDoc |
| ---------------------------------------------- | --------- | --------- | ----- |
| `createSigmaPtyTerminalBackend`                | function  | no        | yes   |
| `createSigmaPtyTerminalBackendFromConstructor` | function  | no        | yes   |
| `createSigmaPtyTerminalBackendProvider`        | function  | no        | yes   |
| `loadSigmaPtyModule`                           | function  | no        | yes   |
| `LoadSigmaPtyModuleOptions`                    | interface | yes       | yes   |
| `probeSigmaPtyAvailability`                    | function  | no        | yes   |
| `SigmaPtyCommandOptions`                       | interface | yes       | yes   |
| `SigmaPtyConstructor`                          | interface | yes       | yes   |
| `SigmaPtyLike`                                 | interface | yes       | yes   |
| `SigmaPtyModule`                               | interface | yes       | yes   |
| `SigmaPtySize`                                 | interface | yes       | yes   |
| `SigmaPtyTerminalBackendOptions`               | interface | yes       | yes   |

### src/runtime/rate_limiter.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `createLeakyBucketRateLimiter` | function  | no        | yes   |
| `createTokenBucketRateLimiter` | function  | no        | yes   |
| `LeakyBucketOptions`           | interface | yes       | yes   |
| `LeakyBucketRateLimiter`       | class     | no        | yes   |
| `TokenBucketOptions`           | interface | yes       | yes   |
| `TokenBucketRateLimiter`       | class     | no        | yes   |

### src/runtime/reflow_screen.ts

_Entrypoints: `.`, `./runtime`_

| Symbol               | Kind      | Type Only | JSDoc |
| -------------------- | --------- | --------- | ----- |
| `createReflowBuffer` | function  | no        | yes   |
| `DisplayRow`         | interface | yes       | yes   |
| `LogicalBufferLine`  | interface | yes       | yes   |
| `ReflowBuffer`       | class     | no        | yes   |
| `ScrollAnchor`       | interface | yes       | yes   |
| `StyledChar`         | interface | yes       | yes   |

### src/runtime/render_accounting.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `DebugOverlayOptions`      | interface | yes       | yes   |
| `RenderAccounting`         | class     | no        | yes   |
| `RenderAccountingStats`    | interface | yes       | yes   |
| `renderDebugOverlay`       | function  | no        | yes   |
| `SchedulerDiagnostics`     | class     | no        | yes   |
| `SchedulerQueueDiagnostic` | interface | yes       | yes   |

### src/runtime/render_loop.ts

_Entrypoints: `.`, `./web`, `./runtime`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `createRenderLoop`             | function  | no        | yes   |
| `defaultRenderLoopTimer`       | const     | no        | yes   |
| `FrameScheduler`               | class     | no        | yes   |
| `FrameSchedulerInspection`     | interface | yes       | yes   |
| `FrameSchedulerOptions`        | interface | yes       | yes   |
| `MicrotaskScheduler`           | class     | no        | yes   |
| `MicrotaskSchedulerInspection` | interface | yes       | yes   |
| `MicrotaskSchedulerOptions`    | interface | yes       | yes   |
| `nextFrameDelay`               | function  | no        | yes   |
| `RenderLoop`                   | class     | no        | yes   |
| `RenderLoopFrame`              | interface | yes       | yes   |
| `RenderLoopInspection`         | interface | yes       | yes   |
| `RenderLoopOptions`            | interface | yes       | yes   |
| `RenderLoopTimer`              | interface | yes       | yes   |

### src/runtime/renderer_backends.ts

_Entrypoints: `.`, `./web`, `./runtime`_

| Symbol                                        | Kind      | Type Only | JSDoc |
| --------------------------------------------- | --------- | --------- | ----- |
| `createRuntimeRendererBackend`                | function  | no        | yes   |
| `createRuntimeRendererBackendCatalogReport`   | function  | no        | yes   |
| `createRuntimeRendererBackendController`      | function  | no        | yes   |
| `createRuntimeRendererBackendRegistry`        | function  | no        | yes   |
| `formatRuntimeRendererBackendCatalogMarkdown` | function  | no        | yes   |
| `inspectRuntimeRendererBackendCatalog`        | function  | no        | yes   |
| `inspectRuntimeRendererBackends`              | function  | no        | yes   |
| `queryRuntimeRendererBackends`                | function  | no        | yes   |
| `RuntimeRendererBackend`                      | class     | no        | yes   |
| `RuntimeRendererBackendCatalogInspection`     | interface | yes       | yes   |
| `RuntimeRendererBackendCatalogOptions`        | interface | yes       | yes   |
| `RuntimeRendererBackendCatalogReport`         | interface | yes       | yes   |
| `RuntimeRendererBackendController`            | class     | no        | yes   |
| `RuntimeRendererBackendControllerInspection`  | interface | yes       | yes   |
| `RuntimeRendererBackendControllerOptions`     | interface | yes       | yes   |
| `RuntimeRendererBackendDefinition`            | interface | yes       | yes   |
| `runtimeRendererBackendDefinitions`           | const     | no        | yes   |
| `RuntimeRendererBackendInspection`            | interface | yes       | yes   |
| `RuntimeRendererBackendMarkdownOptions`       | interface | yes       | yes   |
| `RuntimeRendererBackendQuery`                 | interface | yes       | yes   |
| `RuntimeRendererBackendRegistry`              | class     | no        | yes   |
| `runtimeRendererBackends`                     | function  | no        | yes   |
| `RuntimeRendererBackendSelectionOptions`      | interface | yes       | yes   |
| `selectRuntimeRendererBackend`                | function  | no        | yes   |

### src/runtime/resource_bindings.ts

_Entrypoints: `.`, `./web`, `./runtime`_

| Symbol                            | Kind      | Type Only | JSDoc |
| --------------------------------- | --------- | --------- | ----- |
| `bindResourceParams`              | function  | no        | yes   |
| `ResourceParamsBindingHandle`     | type      | yes       | yes   |
| `ResourceParamsBindingInspection` | interface | yes       | yes   |
| `ResourceParamsBindingOptions`    | interface | yes       | yes   |

### src/runtime/resource_cache_policy.ts

_Entrypoints: `.`, `./web`, `./runtime`_

| Symbol                               | Kind      | Type Only | JSDoc |
| ------------------------------------ | --------- | --------- | ----- |
| `ResourceCacheEntryPolicyInspection` | interface | yes       | yes   |
| `ResourceCachePolicyInspection`      | interface | yes       | yes   |
| `ResourceCacheRefreshTrigger`        | type      | yes       | yes   |
| `ResourceCacheTemporalPolicyOptions` | interface | yes       | yes   |

### src/runtime/resource_cache.ts

_Entrypoints: `.`, `./web`, `./runtime`_

| Re-export Target                       | Kind  | Names                                                                                                                                                          |
| -------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/runtime/resource_cache_policy.ts` | named | `type ResourceCacheEntryPolicyInspection`, `type ResourceCachePolicyInspection`, `type ResourceCacheRefreshTrigger`, `type ResourceCacheTemporalPolicyOptions` |

| Symbol                                | Kind      | Type Only | JSDoc |
| ------------------------------------- | --------- | --------- | ----- |
| `canonicalResourceCacheKey`           | function  | no        | yes   |
| `createResourceCacheCoordinator`      | function  | no        | yes   |
| `ResolvedResourceCacheKeyLimits`      | interface | yes       | yes   |
| `ResourceCacheCapacityError`          | class     | no        | yes   |
| `ResourceCacheCoordinator`            | class     | no        | yes   |
| `ResourceCacheCoordinatorDiagnostic`  | interface | yes       | yes   |
| `ResourceCacheCoordinatorOptions`     | interface | yes       | yes   |
| `ResourceCacheDiagnosticError`        | class     | no        | yes   |
| `ResourceCacheDisposedError`          | class     | no        | yes   |
| `ResourceCacheEntryDiagnostic`        | interface | yes       | yes   |
| `ResourceCacheEntryEvent`             | interface | yes       | yes   |
| `ResourceCacheEntryInspection`        | interface | yes       | yes   |
| `ResourceCacheEntryStatus`            | type      | yes       | yes   |
| `ResourceCacheEventDrainLimitError`   | class     | no        | yes   |
| `ResourceCacheEventType`              | type      | yes       | yes   |
| `ResourceCacheHandle`                 | class     | no        | yes   |
| `ResourceCacheHandleReleasedError`    | class     | no        | yes   |
| `ResourceCacheInspection`             | interface | yes       | yes   |
| `ResourceCacheInspectionOptions`      | interface | yes       | yes   |
| `ResourceCacheKeyError`               | class     | no        | yes   |
| `ResourceCacheKeyErrorCode`           | type      | yes       | yes   |
| `ResourceCacheKeyLimits`              | interface | yes       | yes   |
| `ResourceCacheLimitError`             | class     | no        | yes   |
| `ResourceCacheListener`               | type      | yes       | yes   |
| `ResourceCacheListenerLimitError`     | class     | no        | yes   |
| `ResourceCacheRevisionExhaustedError` | class     | no        | yes   |
| `ResourceCacheSubscriptionOptions`    | interface | yes       | yes   |
| `ResourceCacheValueKind`              | type      | yes       | yes   |

### src/runtime/resource_limits.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `createResourceLimitRegistry` | function  | no        | yes   |
| `LimitBudgets`                | type      | yes       | yes   |
| `LimitDiagnostic`             | interface | yes       | yes   |
| `LimitDimension`              | type      | yes       | yes   |
| `LimitState`                  | type      | yes       | yes   |
| `ResourceLimitRegistry`       | class     | no        | yes   |

### src/runtime/resource_loads.ts

_Entrypoints: `.`, `./web`, `./runtime`_

| Symbol                                 | Kind      | Type Only | JSDoc |
| -------------------------------------- | --------- | --------- | ----- |
| `createResourceLoadCoordinator`        | function  | no        | yes   |
| `ResourceLoadCancelledError`           | class     | no        | yes   |
| `ResourceLoadCapacityError`            | class     | no        | yes   |
| `ResourceLoadConfigurationError`       | class     | no        | yes   |
| `ResourceLoadCoordinator`              | class     | no        | yes   |
| `ResourceLoadCoordinatorDisposedError` | class     | no        | yes   |
| `ResourceLoadCoordinatorInspection`    | interface | yes       | yes   |
| `ResourceLoadCoordinatorOptions`       | interface | yes       | yes   |
| `ResourceLoadDiagnostic`               | interface | yes       | yes   |
| `ResourceLoadDiagnosticCode`           | type      | yes       | yes   |
| `ResourceLoader`                       | type      | yes       | yes   |
| `ResourceLoaderContext`                | interface | yes       | yes   |
| `ResourceLoadGenerationExhaustedError` | class     | no        | yes   |
| `ResourceLoadGenerationInspection`     | interface | yes       | yes   |
| `ResourceLoadHandle`                   | class     | no        | yes   |
| `ResourceLoadHandleInspection`         | interface | yes       | yes   |
| `ResourceLoadHandleLimitError`         | class     | no        | yes   |
| `ResourceLoadHandleStatus`             | type      | yes       | yes   |
| `ResourceLoadOptions`                  | interface | yes       | yes   |
| `ResourceLoadPolicy`                   | type      | yes       | yes   |
| `ResourceLoadPublicationError`         | class     | no        | yes   |
| `ResourceLoadRequestError`             | class     | no        | yes   |
| `ResourceLoadSnapshotLimits`           | interface | yes       | yes   |
| `ResourceLoadSupersededError`          | class     | no        | yes   |

### src/runtime/resource.ts

_Entrypoints: `.`, `./web`, `./runtime`_

| Symbol                          | Kind      | Type Only | JSDoc |
| ------------------------------- | --------- | --------- | ----- |
| `AsyncResource`                 | class     | no        | yes   |
| `AsyncResourceCacheKey`         | type      | yes       | yes   |
| `AsyncResourceContext`          | interface | yes       | yes   |
| `AsyncResourceInspection`       | interface | yes       | yes   |
| `AsyncResourceLoader`           | type      | yes       | yes   |
| `AsyncResourceOptions`          | interface | yes       | yes   |
| `AsyncResourceParamsError`      | class     | no        | yes   |
| `AsyncResourceState`            | interface | yes       | yes   |
| `AsyncResourceStatus`           | type      | yes       | yes   |
| `CachedAsyncResource`           | class     | no        | yes   |
| `CachedAsyncResourceInspection` | interface | yes       | yes   |
| `CachedAsyncResourceOptions`    | interface | yes       | yes   |
| `createAsyncResource`           | function  | no        | yes   |
| `createCachedAsyncResource`     | function  | no        | yes   |

### src/runtime/retry_policy.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `CircuitBreakerOptions`        | interface | yes       | yes   |
| `CircuitBreakerRegistry`       | class     | no        | yes   |
| `CircuitState`                 | type      | yes       | yes   |
| `createCircuitBreakerRegistry` | function  | no        | yes   |
| `createRetryPolicy`            | function  | no        | yes   |
| `RetryClassification`          | type      | yes       | yes   |
| `RetryClassifier`              | type      | yes       | yes   |
| `RetryDecision`                | interface | yes       | yes   |
| `RetryPolicy`                  | class     | no        | yes   |
| `RetryPolicyOptions`           | interface | yes       | yes   |

### src/runtime/scheduler.ts

_Entrypoints: `.`, `./web`, `./runtime`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `AsyncScheduler`           | class     | no        | yes   |
| `AsyncSchedulerInspection` | interface | yes       | yes   |
| `nextFrame`                | function  | no        | yes   |
| `runTaskBatch`             | function  | no        | yes   |
| `ScheduledTask`            | type      | yes       | yes   |
| `ScheduledTaskHandle`      | interface | yes       | yes   |
| `ScheduledTaskInspection`  | interface | yes       | yes   |
| `ScheduledTaskOptions`     | interface | yes       | yes   |
| `ScheduledTaskStatus`      | type      | yes       | yes   |
| `SchedulerOptions`         | interface | yes       | yes   |
| `TaskBatchItem`            | interface | yes       | yes   |
| `TaskBatchOptions`         | interface | yes       | yes   |
| `TaskBatchResult`          | interface | yes       | yes   |

### src/runtime/screen_mode_policy.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `createScreenModePolicy` | function  | no        | yes   |
| `SCREEN_MODE_LIMITS`     | const     | no        | yes   |
| `ScreenMode`             | type      | yes       | yes   |
| `ScreenModeOptions`      | interface | yes       | yes   |
| `ScreenModePolicy`       | interface | yes       | yes   |

### src/runtime/selective_erase.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                  | Kind     | Type Only | JSDoc |
| ----------------------- | -------- | --------- | ----- |
| `eraseDisplay`          | function | no        | yes   |
| `eraseLine`             | function | no        | yes   |
| `EraseMode`             | type     | yes       | yes   |
| `selectiveEraseDisplay` | function | no        | yes   |
| `selectiveEraseLine`    | function | no        | yes   |
| `writeProtected`        | function | no        | yes   |

### src/runtime/signal_exporters.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `createCallbackExporter` | function  | no        | yes   |
| `createConsoleExporter`  | function  | no        | yes   |
| `createInMemoryExporter` | function  | no        | yes   |
| `createOtlpHttpExporter` | function  | no        | yes   |
| `ExportableSignal`       | interface | yes       | yes   |
| `ExporterDeclaration`    | interface | yes       | yes   |
| `ExporterSink`           | type      | yes       | yes   |
| `SignalExporter`         | class     | no        | yes   |
| `SignalExporterOptions`  | interface | yes       | yes   |

### src/runtime/signal_redaction.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                          | Kind      | Type Only | JSDoc |
| ------------------------------- | --------- | --------- | ----- |
| `createSignalRedactionPipeline` | function  | no        | yes   |
| `RedactedSignal`                | interface | yes       | yes   |
| `SignalRedactionPipeline`       | class     | no        | yes   |
| `SignalSchema`                  | interface | yes       | yes   |

### src/runtime/span_instrumentation.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `createSpanInstrumentation` | function  | no        | yes   |
| `RecordedSpan`              | interface | yes       | yes   |
| `SpanInstrumentation`       | class     | no        | yes   |
| `SpanKind`                  | type      | yes       | yes   |

### src/runtime/storage.ts

_Entrypoints: `.`, `./web`, `./runtime`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `AsyncStore`              | interface | yes       | yes   |
| `createPersistentSignal`  | function  | no        | yes   |
| `createRuntimeStore`      | function  | no        | yes   |
| `IndexedDbStore`          | class     | no        | yes   |
| `IndexedDbStoreOptions`   | interface | yes       | yes   |
| `JsonFileStore`           | class     | no        | yes   |
| `MemoryStore`             | class     | no        | yes   |
| `PersistentSignal`        | class     | no        | yes   |
| `PersistentSignalOptions` | interface | yes       | yes   |
| `RuntimeStoreOptions`     | interface | yes       | yes   |

### src/runtime/stream_ownership.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `isStreamActionAllowed`     | function  | no        | yes   |
| `STREAM_OWNERSHIP_CONTRACT` | const     | no        | yes   |
| `StreamActor`               | type      | yes       | yes   |
| `StreamOwnershipContract`   | interface | yes       | yes   |
| `StreamTransport`           | type      | yes       | yes   |

### src/runtime/stream_resource.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `consumeIterableStream` | function  | no        | yes   |
| `consumePushStream`     | function  | no        | yes   |
| `PullSource`            | type      | yes       | yes   |
| `PushSource`            | type      | yes       | yes   |
| `StreamResource`        | class     | no        | yes   |
| `StreamResourceOptions` | interface | yes       | yes   |

### src/runtime/structured_logs.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `createStructuredLogSource`  | function  | no        | yes   |
| `LegacyDiagnosticEvent`      | interface | yes       | yes   |
| `LogSeverity`                | type      | yes       | yes   |
| `StructuredLogRecord`        | interface | yes       | yes   |
| `StructuredLogSource`        | class     | no        | yes   |
| `StructuredLogSourceOptions` | interface | yes       | yes   |

### src/runtime/supervisor.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                | Kind      | Type Only | JSDoc |
| --------------------- | --------- | --------- | ----- |
| `createSupervisor`    | function  | no        | yes   |
| `SupervisedChildSpec` | interface | yes       | yes   |
| `Supervisor`          | class     | no        | yes   |
| `SupervisorFailure`   | interface | yes       | yes   |
| `SupervisorOptions`   | interface | yes       | yes   |
| `SupervisorStrategy`  | type      | yes       | yes   |

### src/runtime/support_bundle.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `createSupportBundleBuilder` | function  | no        | yes   |
| `SafeBundleSection`          | type      | yes       | yes   |
| `SensitiveBundleSection`     | type      | yes       | yes   |
| `SupportBundleBuilder`       | class     | no        | yes   |
| `SupportBundleInputs`        | interface | yes       | yes   |
| `SupportBundleManifest`      | interface | yes       | yes   |

### src/runtime/task_context.ts

_Entrypoints: `.`, `./runtime`_

| Symbol              | Kind     | Type Only | JSDoc |
| ------------------- | -------- | --------- | ----- |
| `createTaskContext` | function | no        | yes   |
| `TaskContext`       | class    | no        | yes   |
| `TaskContextValues` | type     | yes       | yes   |

### src/runtime/task_group.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `createTaskGroup`              | function  | no        | yes   |
| `ImmutableTaskGroupContext`    | type      | yes       | yes   |
| `isTaskGroupCancellationError` | function  | no        | yes   |
| `SupervisedTask`               | interface | yes       | yes   |
| `SupervisedTaskSettlement`     | interface | yes       | yes   |
| `TaskCancelledResult`          | interface | yes       | yes   |
| `TaskExecutionContext`         | interface | yes       | yes   |
| `TaskFailedResult`             | interface | yes       | yes   |
| `TaskFulfilledResult`          | interface | yes       | yes   |
| `TaskGroup`                    | class     | no        | yes   |
| `TaskGroupAggregateError`      | class     | no        | yes   |
| `TaskGroupCancellationError`   | class     | no        | yes   |
| `TaskGroupCancellationSource`  | type      | yes       | yes   |
| `TaskGroupChildInspection`     | interface | yes       | yes   |
| `TaskGroupChildOptions`        | interface | yes       | yes   |
| `TaskGroupClosedError`         | class     | no        | yes   |
| `TaskGroupContextValue`        | type      | yes       | yes   |
| `TaskGroupCounts`              | interface | yes       | yes   |
| `TaskGroupDiagnostic`          | interface | yes       | yes   |
| `TaskGroupErrorInspection`     | interface | yes       | yes   |
| `TaskGroupFailure`             | interface | yes       | yes   |
| `TaskGroupFailureInspection`   | interface | yes       | yes   |
| `TaskGroupFailurePolicy`       | type      | yes       | yes   |
| `TaskGroupInspection`          | interface | yes       | yes   |
| `TaskGroupOptions`             | interface | yes       | yes   |
| `TaskGroupResult`              | interface | yes       | yes   |
| `TaskGroupStatus`              | type      | yes       | yes   |
| `TaskGroupTask`                | type      | yes       | yes   |
| `TaskHandle`                   | interface | yes       | yes   |
| `TaskHandleInspection`         | interface | yes       | yes   |
| `TaskResult`                   | type      | yes       | yes   |
| `TaskSpawnOptions`             | interface | yes       | yes   |
| `TaskStatus`                   | type      | yes       | yes   |
| `TaskSupervisor`               | interface | yes       | yes   |
| `TaskSupervisorInspection`     | interface | yes       | yes   |

### src/runtime/telemetry.ts

_Entrypoints: `.`, `./web`, `./runtime`_

| Symbol                              | Kind      | Type Only | JSDoc |
| ----------------------------------- | --------- | --------- | ----- |
| `createRuntimeWorkloadRegistry`     | function  | no        | yes   |
| `createRuntimeWorkloadReport`       | function  | no        | yes   |
| `formatRuntimeWorkloadMarkdown`     | function  | no        | yes   |
| `inspectRuntimeWorkload`            | function  | no        | yes   |
| `inspectRuntimeWorkloadReport`      | function  | no        | yes   |
| `RuntimeWorkloadInspection`         | interface | yes       | yes   |
| `RuntimeWorkloadKind`               | type      | yes       | yes   |
| `RuntimeWorkloadMarkdownOptions`    | interface | yes       | yes   |
| `RuntimeWorkloadRegistry`           | class     | no        | yes   |
| `RuntimeWorkloadRegistryInspection` | interface | yes       | yes   |
| `RuntimeWorkloadReport`             | interface | yes       | yes   |
| `RuntimeWorkloadReportInspection`   | interface | yes       | yes   |
| `RuntimeWorkloadReportOptions`      | interface | yes       | yes   |
| `RuntimeWorkloadSource`             | interface | yes       | yes   |
| `RuntimeWorkloadState`              | type      | yes       | yes   |

### src/runtime/terminal_backend_registry.ts

_Entrypoints: `.`, `./runtime`, `./terminal`_

| Symbol                                  | Kind      | Type Only | JSDoc |
| --------------------------------------- | --------- | --------- | ----- |
| `createDefaultTerminalBackendRegistry`  | function  | no        | yes   |
| `createProcessTerminalBackendProvider`  | function  | no        | yes   |
| `DefaultTerminalBackendRegistryOptions` | interface | yes       | yes   |
| `probeTerminalBackendProvider`          | function  | no        | yes   |
| `TerminalBackendAvailability`           | interface | yes       | yes   |
| `TerminalBackendProvider`               | interface | yes       | yes   |
| `TerminalBackendProviderInspection`     | interface | yes       | yes   |
| `TerminalBackendRegistry`               | class     | no        | yes   |
| `TerminalBackendResolveOptions`         | interface | yes       | yes   |

### src/runtime/terminal_backend.ts

_Entrypoints: `.`, `./runtime`, `./terminal`_

| Symbol                            | Kind      | Type Only | JSDoc |
| --------------------------------- | --------- | --------- | ----- |
| `createProcessTerminalBackend`    | function  | no        | yes   |
| `ProcessTerminalBackend`          | class     | no        | yes   |
| `ProcessTerminalBackendOptions`   | interface | yes       | yes   |
| `TerminalBackend`                 | interface | yes       | yes   |
| `TerminalBackendAttachOptions`    | interface | yes       | yes   |
| `TerminalBackendSpawnOptions`     | interface | yes       | yes   |
| `TerminalDetachedSession`         | interface | yes       | yes   |
| `TerminalSessionHandle`           | interface | yes       | yes   |
| `TerminalSessionHandleInspection` | interface | yes       | yes   |

### src/runtime/terminal_capabilities.ts

_Entrypoints: `.`, `./runtime`, `./terminal`_

| Symbol                               | Kind      | Type Only | JSDoc |
| ------------------------------------ | --------- | --------- | ----- |
| `createTerminalPlan`                 | function  | no        | yes   |
| `createTerminalPortabilityReport`    | function  | no        | yes   |
| `detectTerminalCapabilities`         | function  | no        | yes   |
| `detectTerminalEnvironment`          | function  | no        | yes   |
| `formatTerminalCapabilities`         | function  | no        | yes   |
| `formatTerminalEnvironment`          | function  | no        | yes   |
| `formatTerminalPlan`                 | function  | no        | yes   |
| `formatTerminalPortabilityReport`    | function  | no        | yes   |
| `summarizeTerminalCapabilities`      | function  | no        | yes   |
| `TerminalCapabilities`               | interface | yes       | yes   |
| `TerminalCapabilityDetectionOptions` | interface | yes       | yes   |
| `terminalCapabilityEntries`          | function  | no        | yes   |
| `TerminalCapabilityEntry`            | interface | yes       | yes   |
| `TerminalCapabilityId`               | type      | yes       | yes   |
| `TerminalCapabilitySummary`          | interface | yes       | yes   |
| `TerminalColorDepth`                 | type      | yes       | yes   |
| `TerminalDiagnostic`                 | interface | yes       | yes   |
| `TerminalDiagnosticSeverity`         | type      | yes       | yes   |
| `TerminalEnvironment`                | interface | yes       | yes   |
| `terminalEnvironmentDiagnostics`     | function  | no        | yes   |
| `TerminalMouseProtocol`              | type      | yes       | yes   |
| `TerminalMultiplexer`                | type      | yes       | yes   |
| `TerminalPlan`                       | interface | yes       | yes   |
| `TerminalPlanOptions`                | interface | yes       | yes   |
| `TerminalPortabilityReport`          | interface | yes       | yes   |
| `TerminalPortabilityReportOptions`   | interface | yes       | yes   |
| `TerminalTextMode`                   | type      | yes       | yes   |

### src/runtime/terminal_color.ts

_Entrypoints: `./terminal`_

| Symbol                       | Kind     | Type Only | JSDoc |
| ---------------------------- | -------- | --------- | ----- |
| `DecodedTerminalColor`       | type     | yes       | no    |
| `decodeTerminalColor`        | function | no        | yes   |
| `encodeTerminalIndexedColor` | function | no        | yes   |
| `encodeTerminalRgbColor`     | function | no        | yes   |

### src/runtime/terminal_margins.ts

_Entrypoints: `.`, `./runtime`_

| Symbol               | Kind     | Type Only | JSDoc |
| -------------------- | -------- | --------- | ----- |
| `createMarginScreen` | function | no        | yes   |
| `MarginScreen`       | class    | no        | yes   |

### src/runtime/terminal_operations.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                             | Kind      | Type Only | JSDoc |
| ---------------------------------- | --------- | --------- | ----- |
| `createTerminalOperationDecoder`   | function  | no        | yes   |
| `OperationClassification`          | type      | yes       | yes   |
| `TERMINAL_OPERATION_EVENT_VERSION` | const     | no        | yes   |
| `TerminalOperationDecoder`         | class     | no        | yes   |
| `TerminalOperationEvent`           | interface | yes       | yes   |

### src/runtime/terminal_palette.ts

_Entrypoints: `.`, `./runtime`, `./terminal`_

| Symbol                          | Kind      | Type Only | JSDoc |
| ------------------------------- | --------- | --------- | ----- |
| `mixTerminalRgb`                | function  | no        | yes   |
| `ResolvedTerminalCellStyle`     | interface | yes       | yes   |
| `resolveTerminalCellStyle`      | function  | no        | yes   |
| `TerminalCellStyleOptions`      | interface | yes       | yes   |
| `terminalContrastRatio`         | function  | no        | yes   |
| `terminalPaletteRgb`            | function  | no        | yes   |
| `terminalReadableForegroundRgb` | function  | no        | yes   |
| `TerminalRgb`                   | type      | yes       | yes   |

### src/runtime/terminal_parser.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                            | Kind      | Type Only | JSDoc |
| --------------------------------- | --------- | --------- | ----- |
| `createIncrementalTerminalParser` | function  | no        | yes   |
| `IncrementalTerminalParser`       | class     | no        | yes   |
| `TerminalParserBreach`            | type      | yes       | yes   |
| `TerminalParserLimits`            | interface | yes       | yes   |
| `TerminalToken`                   | type      | yes       | yes   |

### src/runtime/terminal_passthrough.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `decodeScreenPassthrough` | function  | no        | yes   |
| `decodeTmuxPassthrough`   | function  | no        | yes   |
| `diagnosePassthrough`     | function  | no        | yes   |
| `encodeScreenPassthrough` | function  | no        | yes   |
| `encodeTmuxPassthrough`   | function  | no        | yes   |
| `PassthroughDiagnostic`   | interface | yes       | yes   |
| `PassthroughError`        | class     | no        | yes   |
| `PassthroughLayer`        | type      | yes       | yes   |
| `SCREEN_CHUNK_BYTES`      | const     | no        | yes   |
| `unwrapPassthrough`       | function  | no        | yes   |
| `wrapPassthrough`         | function  | no        | yes   |

### src/runtime/terminal_queries.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `createTerminalQueryBroker` | function  | no        | yes   |
| `IssuedQuery`               | interface | yes       | yes   |
| `TerminalQueryBroker`       | class     | no        | yes   |
| `TerminalQueryKind`         | type      | yes       | yes   |

### src/runtime/terminal_sanitizer.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                             | Kind      | Type Only | JSDoc |
| ---------------------------------- | --------- | --------- | ----- |
| `createStreamingTerminalSanitizer` | function  | no        | yes   |
| `SanitizerDropReport`              | interface | yes       | yes   |
| `StreamingTerminalSanitizer`       | class     | no        | yes   |
| `TerminalSanitizerProfile`         | type      | yes       | yes   |

### src/runtime/terminal_screen.ts

_Entrypoints: `.`, `./web`, `./runtime`, `./terminal`_

| Symbol                            | Kind      | Type Only | JSDoc |
| --------------------------------- | --------- | --------- | ----- |
| `TerminalScreenCell`              | interface | yes       | yes   |
| `TerminalScreenController`        | class     | no        | yes   |
| `TerminalScreenControllerOptions` | interface | yes       | yes   |
| `TerminalScreenCursor`            | interface | yes       | yes   |
| `TerminalScreenCursorStyle`       | interface | yes       | yes   |
| `TerminalScreenInspection`        | interface | yes       | yes   |

### src/runtime/terminal_scrollback.ts

_Entrypoints: `.`, `./web`, `./runtime`, `./terminal`_

| Symbol                                 | Kind      | Type Only | JSDoc |
| -------------------------------------- | --------- | --------- | ----- |
| `TerminalScrollbackController`         | class     | no        | yes   |
| `TerminalScrollbackControllerOptions`  | interface | yes       | yes   |
| `TerminalScrollbackInspection`         | interface | yes       | yes   |
| `TerminalScrollbackMode`               | type      | yes       | yes   |
| `TerminalScrollbackSelection`          | interface | yes       | yes   |
| `TerminalScrollbackViewportInspection` | interface | yes       | yes   |

### src/runtime/terminal_sequences.ts

_Entrypoints: `./terminal`_

| Symbol                          | Kind      | Type Only | JSDoc |
| ------------------------------- | --------- | --------- | ----- |
| `ParsedTerminalControlSequence` | interface | yes       | yes   |
| `parseTerminalControlSequence`  | function  | no        | yes   |
| `parseTerminalParams`           | function  | no        | yes   |

### src/runtime/terminal_services.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                              | Kind      | Type Only | JSDoc |
| ----------------------------------- | --------- | --------- | ----- |
| `createTerminalOscRouter`           | function  | no        | yes   |
| `createTerminalOscService`          | function  | no        | yes   |
| `createTerminalThemeProbe`          | function  | no        | yes   |
| `disabledTerminalOscPolicy`         | const     | no        | yes   |
| `parseTerminalOscColorResponse`     | function  | no        | yes   |
| `parseTerminalOscMessage`           | function  | no        | yes   |
| `sanitizeTerminalOscText`           | function  | no        | yes   |
| `TerminalClipboardSelection`        | type      | yes       | yes   |
| `terminalClipboardSequence`         | function  | no        | yes   |
| `terminalColorQuerySequence`        | function  | no        | yes   |
| `terminalDynamicColorSequence`      | function  | no        | yes   |
| `terminalNotificationSequence`      | function  | no        | yes   |
| `TerminalOscActionResult`           | interface | yes       | yes   |
| `TerminalOscCapability`             | type      | yes       | yes   |
| `TerminalOscColorResponse`          | interface | yes       | yes   |
| `TerminalOscHandler`                | type      | yes       | yes   |
| `TerminalOscMessage`                | interface | yes       | yes   |
| `TerminalOscPolicy`                 | type      | yes       | yes   |
| `TerminalOscRouter`                 | class     | no        | yes   |
| `TerminalOscRouterInspection`       | interface | yes       | yes   |
| `TerminalOscRouterOptions`          | interface | yes       | yes   |
| `terminalOscSequence`               | function  | no        | yes   |
| `TerminalOscService`                | class     | no        | yes   |
| `TerminalOscServiceInspection`      | interface | yes       | yes   |
| `TerminalOscServiceOptions`         | interface | yes       | yes   |
| `TerminalOscTerminator`             | type      | yes       | yes   |
| `terminalResetDynamicColorSequence` | function  | no        | yes   |
| `TerminalThemeAppearance`           | type      | yes       | yes   |
| `TerminalThemeProbe`                | class     | no        | yes   |
| `TerminalThemeProbeInspection`      | interface | yes       | yes   |
| `TerminalThemeProbeOptions`         | interface | yes       | yes   |
| `terminalTitleSequence`             | function  | no        | yes   |

### src/runtime/terminal_session.ts

_Entrypoints: `.`, `./runtime`, `./terminal`_

| Symbol                            | Kind      | Type Only | JSDoc |
| --------------------------------- | --------- | --------- | ----- |
| `createTerminalSessionController` | function  | no        | yes   |
| `terminalMouseSequences`          | function  | no        | yes   |
| `TerminalSessionController`       | class     | no        | yes   |
| `TerminalSessionInspection`       | interface | yes       | yes   |
| `TerminalSessionOptions`          | interface | yes       | yes   |
| `terminalSessionSequences`        | function  | no        | yes   |
| `TerminalSessionSequences`        | interface | yes       | yes   |
| `TerminalSessionWriter`           | interface | yes       | yes   |

### src/runtime/terminal_shell_workspace.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                                    | Kind      | Type Only | JSDoc |
| ----------------------------------------- | --------- | --------- | ----- |
| `AddTerminalShellWorkspaceSessionOptions` | interface | yes       | yes   |
| `TerminalShellWorkspaceController`        | class     | no        | yes   |
| `TerminalShellWorkspaceControllerOptions` | interface | yes       | yes   |
| `TerminalShellWorkspaceInspection`        | interface | yes       | yes   |
| `TerminalShellWorkspaceSessionInspection` | interface | yes       | yes   |

### src/runtime/terminal_shell.ts

_Entrypoints: `.`, `./runtime`, `./terminal`_

| Symbol                           | Kind      | Type Only | JSDoc |
| -------------------------------- | --------- | --------- | ----- |
| `TerminalShellController`        | class     | no        | yes   |
| `TerminalShellControllerOptions` | interface | yes       | yes   |
| `TerminalShellInspection`        | interface | yes       | yes   |

### src/runtime/terminal_status.ts

_Entrypoints: `.`, `./runtime`, `./terminal`_

| Symbol                             | Kind      | Type Only | JSDoc |
| ---------------------------------- | --------- | --------- | ----- |
| `formatTerminalOutputHint`         | function  | no        | yes   |
| `formatTerminalOutputWindowTitle`  | function  | no        | yes   |
| `formatTerminalShellHint`          | function  | no        | yes   |
| `formatTerminalShellStatusLine`    | function  | no        | yes   |
| `formatTerminalShellWindowTitle`   | function  | no        | yes   |
| `summarizeTerminalStatus`          | function  | no        | yes   |
| `terminalBackendKindLabel`         | function  | no        | yes   |
| `terminalInputModeDisplayLabel`    | function  | no        | yes   |
| `TerminalOutputWindowTitleOptions` | interface | yes       | yes   |
| `TerminalShellHintOptions`         | interface | yes       | yes   |
| `TerminalShellStatusLineOptions`   | interface | yes       | yes   |
| `TerminalShellWindowTitleOptions`  | interface | yes       | yes   |
| `terminalStatusFields`             | function  | no        | yes   |
| `TerminalStatusSource`             | type      | yes       | yes   |
| `TerminalStatusSummary`            | interface | yes       | yes   |
| `TerminalStatusSummaryOptions`     | interface | yes       | yes   |
| `terminalStatusTone`               | function  | no        | yes   |
| `TerminalStatusTone`               | type      | yes       | yes   |

### src/runtime/terminal_templates.ts

_Entrypoints: `.`, `./runtime`, `./terminal`_

| Symbol                                 | Kind      | Type Only | JSDoc |
| -------------------------------------- | --------- | --------- | ----- |
| `attachTerminalTemplate`               | function  | no        | yes   |
| `AttachTerminalTemplate`               | interface | yes       | yes   |
| `commandTerminalTemplate`              | function  | no        | yes   |
| `CommandTerminalTemplateOptions`       | interface | yes       | yes   |
| `createTerminalTemplateSession`        | function  | no        | yes   |
| `CreateTerminalTemplateSessionOptions` | interface | yes       | yes   |
| `denoTaskTerminalTemplate`             | function  | no        | yes   |
| `DenoTaskTerminalTemplateOptions`      | interface | yes       | yes   |
| `describeAttachTerminalTemplate`       | function  | no        | yes   |
| `describeTerminalTemplateSession`      | function  | no        | yes   |
| `isSpawnTerminalTemplate`              | function  | no        | yes   |
| `projectTaskTerminalTemplate`          | function  | no        | yes   |
| `shellTerminalTemplate`                | function  | no        | yes   |
| `ShellTerminalTemplateOptions`         | interface | yes       | yes   |
| `SpawnTerminalTemplate`                | interface | yes       | yes   |
| `SpawnTerminalTemplateKind`            | type      | yes       | yes   |
| `TerminalRestartPolicy`                | type      | yes       | yes   |
| `TerminalSessionDescriptor`            | interface | yes       | yes   |
| `TerminalTemplate`                     | type      | yes       | yes   |
| `TerminalTemplateOptions`              | interface | yes       | yes   |
| `TerminalTemplateSession`              | interface | yes       | yes   |
| `terminalTemplateToSpawnOptions`       | function  | no        | yes   |

### src/runtime/terminal_workspace.ts

_Entrypoints: `.`, `./web`, `./runtime`, `./terminal`_

| Symbol                                          | Kind      | Type Only | JSDoc |
| ----------------------------------------------- | --------- | --------- | ----- |
| `AddTerminalWorkspaceSessionOptions`            | interface | yes       | yes   |
| `createTerminalWorkspaceController`             | function  | no        | yes   |
| `createTerminalWorkspaceControllerFromSnapshot` | function  | no        | yes   |
| `DuplicateTerminalWorkspaceSessionOptions`      | interface | yes       | yes   |
| `normalizeTerminalWorkspaceSnapshot`            | function  | no        | yes   |
| `snapshotTerminalWorkspace`                     | function  | no        | yes   |
| `SplitTerminalWorkspacePaneOptions`             | interface | yes       | yes   |
| `TERMINAL_WORKSPACE_SNAPSHOT_VERSION`           | const     | no        | yes   |
| `TerminalWorkspaceController`                   | class     | no        | yes   |
| `TerminalWorkspaceControllerOptions`            | interface | yes       | yes   |
| `TerminalWorkspaceInspection`                   | interface | yes       | yes   |
| `TerminalWorkspaceLayoutInspection`             | interface | yes       | yes   |
| `TerminalWorkspaceLayoutNode`                   | type      | yes       | yes   |
| `TerminalWorkspaceLayoutState`                  | interface | yes       | yes   |
| `TerminalWorkspacePaneInspection`               | interface | yes       | yes   |
| `TerminalWorkspacePaneNode`                     | interface | yes       | yes   |
| `TerminalWorkspacePanePlacement`                | type      | yes       | yes   |
| `TerminalWorkspacePaneRect`                     | interface | yes       | yes   |
| `TerminalWorkspacePaneRectOptions`              | interface | yes       | yes   |
| `terminalWorkspacePaneRects`                    | function  | no        | yes   |
| `TerminalWorkspaceSnapshot`                     | interface | yes       | yes   |
| `TerminalWorkspaceSplitDirection`               | type      | yes       | yes   |
| `TerminalWorkspaceSplitNode`                    | interface | yes       | yes   |
| `UpsertTerminalWorkspaceSessionOptions`         | interface | yes       | yes   |

### src/runtime/timeline.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                 | Kind      | Type Only | JSDoc |
| ---------------------- | --------- | --------- | ----- |
| `createTimeline`       | function  | no        | yes   |
| `Timeline`             | class     | no        | yes   |
| `TimelineEasing`       | type      | yes       | yes   |
| `TimelineInspection`   | interface | yes       | yes   |
| `TimelineTween`        | interface | yes       | yes   |
| `TimelineTweenOptions` | interface | yes       | yes   |
| `TimelineValue`        | type      | yes       | yes   |

### src/runtime/trace_sampling.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `createMetricExemplarHook` | function  | no        | yes   |
| `createTraceSampler`       | function  | no        | yes   |
| `MetricExemplar`           | interface | yes       | yes   |
| `MetricExemplarHook`       | class     | no        | yes   |
| `SamplingStrategy`         | type      | yes       | yes   |
| `TraceSampler`             | class     | no        | yes   |

### src/runtime/worker_pool.ts

_Entrypoints: `.`, `./web`, `./runtime`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `installWorkerHandler`      | function  | no        | yes   |
| `runWorkerBatch`            | function  | no        | yes   |
| `WorkerBatchOptions`        | interface | yes       | yes   |
| `WorkerBatchResult`         | interface | yes       | yes   |
| `WorkerFactory`             | type      | yes       | yes   |
| `WorkerHandler`             | type      | yes       | yes   |
| `WorkerLike`                | interface | yes       | yes   |
| `WorkerPool`                | class     | no        | yes   |
| `WorkerPoolInspection`      | interface | yes       | yes   |
| `WorkerPoolOptions`         | interface | yes       | yes   |
| `WorkerPoolRunOptions`      | interface | yes       | yes   |
| `WorkerPoolTerminatedError` | class     | no        | yes   |

### src/runtime/worker_protocol.ts

_Entrypoints: `.`, `./runtime`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `createVersionedWorkerRouter` | function  | no        | yes   |
| `ProtocolWorkerLike`          | interface | yes       | yes   |
| `VersionedWorkerRouter`       | class     | no        | yes   |
| `WorkerDeadlineError`         | class     | no        | yes   |
| `WorkerHandshake`             | interface | yes       | yes   |

### src/secrets.ts

_Entrypoints: `.`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `formatRedactedError`     | function  | no        | yes   |
| `inspectRedactedError`    | function  | no        | yes   |
| `inspectSecret`           | function  | no        | yes   |
| `isSecret`                | function  | no        | yes   |
| `RedactedJsonValue`       | type      | yes       | yes   |
| `redactForHistory`        | function  | no        | yes   |
| `redactForLog`            | function  | no        | yes   |
| `redactForPersistence`    | function  | no        | yes   |
| `RedactionAction`         | type      | yes       | yes   |
| `RedactionLimits`         | interface | yes       | yes   |
| `RedactionPathSegment`    | type      | yes       | yes   |
| `RedactionRule`           | interface | yes       | yes   |
| `RedactionSchema`         | interface | yes       | yes   |
| `redactStructured`        | function  | no        | yes   |
| `RedactStructuredOptions` | interface | yes       | yes   |
| `secret`                  | function  | no        | yes   |
| `Secret`                  | class     | no        | yes   |
| `SECRET_REDACTED_MARKER`  | const     | no        | yes   |
| `SecretError`             | class     | no        | yes   |
| `SecretErrorCode`         | type      | yes       | yes   |
| `SecretInspection`        | interface | yes       | yes   |
| `stringifyRedacted`       | function  | no        | yes   |

### src/selection.ts

_Entrypoints: `.`, `./web`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `clampSelectionIndex`        | function  | no        | yes   |
| `createSelection`            | function  | no        | yes   |
| `moveSelection`              | function  | no        | yes   |
| `normalizeSelection`         | function  | no        | yes   |
| `selectedValues`             | function  | no        | yes   |
| `selectIndex`                | function  | no        | yes   |
| `SelectionController`        | class     | no        | yes   |
| `SelectionControllerOptions` | interface | yes       | yes   |
| `selectionFromValues`        | function  | no        | yes   |
| `SelectionMode`              | type      | yes       | yes   |
| `SelectionMoveOptions`       | interface | yes       | yes   |
| `SelectionState`             | interface | yes       | yes   |
| `SelectionValueOptions`      | interface | yes       | yes   |
| `selectionWindow`            | function  | no        | yes   |
| `selectRange`                | function  | no        | yes   |
| `toggleSelection`            | function  | no        | yes   |

### src/showcase/kernel.ts

_Entrypoints: `./showcase`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `ShowcaseKernel`            | class     | no        | no    |
| `ShowcaseKernelInspection`  | interface | yes       | yes   |
| `ShowcaseKernelOptions`     | interface | yes       | yes   |
| `ShowcasePersistenceStatus` | type      | yes       | yes   |

### src/showcase/manifest.ts

_Entrypoints: `./showcase`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `defineShowcaseManifest`    | function  | no        | yes   |
| `normalizeShowcaseManifest` | function  | no        | yes   |
| `SHOWCASE_MANIFEST_SCHEMA`  | const     | no        | yes   |
| `SHOWCASE_MANIFEST_VERSION` | const     | no        | yes   |
| `ShowcaseManifest`          | interface | yes       | yes   |
| `ShowcaseManifestError`     | class     | no        | yes   |
| `ShowcaseManifestHosts`     | interface | yes       | yes   |
| `ShowcaseManifestInput`     | interface | yes       | yes   |
| `ShowcaseRouteManifest`     | interface | yes       | yes   |

### src/showcase/mod.ts

_Entrypoints: `./showcase`_

| Re-export Target                 | Kind | Names |
| -------------------------------- | ---- | ----- |
| `src/showcase/kernel.ts`         | star | -     |
| `src/showcase/manifest.ts`       | star | -     |
| `src/showcase/provider.ts`       | star | -     |
| `src/showcase/session.ts`        | star | -     |
| `src/showcase/terminal_store.ts` | star | -     |

_No direct exported symbols._

### src/showcase/provider.ts

_Entrypoints: `./showcase`_

| Symbol                              | Kind      | Type Only | JSDoc |
| ----------------------------------- | --------- | --------- | ----- |
| `preflightShowcaseProvider`         | function  | no        | yes   |
| `ShowcaseCapabilityStatus`          | type      | yes       | yes   |
| `ShowcaseDiagnosticReporter`        | interface | yes       | yes   |
| `ShowcaseProvider`                  | interface | yes       | yes   |
| `ShowcaseProviderActivationContext` | interface | yes       | yes   |
| `ShowcaseProviderActivationResult`  | interface | yes       | yes   |
| `ShowcaseProviderCapability`        | interface | yes       | yes   |
| `ShowcaseProviderDiagnosticInput`   | interface | yes       | yes   |
| `ShowcaseProviderPreflight`         | interface | yes       | yes   |
| `ShowcaseProviderStatus`            | type      | yes       | yes   |

### src/showcase/session.ts

_Entrypoints: `./showcase`_

| Symbol                                | Kind      | Type Only | JSDoc |
| ------------------------------------- | --------- | --------- | ----- |
| `cloneShowcaseJsonValue`              | function  | no        | yes   |
| `createShowcaseSession`               | function  | no        | yes   |
| `CreateShowcaseSessionInput`          | interface | yes       | yes   |
| `createShowcaseWindowingSnapshot`     | function  | no        | yes   |
| `normalizeShowcaseSession`            | function  | no        | yes   |
| `parseShowcaseSession`                | function  | no        | yes   |
| `SHOWCASE_SESSION_SCHEMA`             | const     | no        | yes   |
| `SHOWCASE_SESSION_V1_VERSION`         | const     | no        | yes   |
| `SHOWCASE_SESSION_VERSION`            | const     | no        | yes   |
| `ShowcaseJsonValue`                   | type      | yes       | yes   |
| `ShowcaseSession`                     | interface | yes       | yes   |
| `ShowcaseSessionError`                | class     | no        | yes   |
| `ShowcaseSessionNormalizationOptions` | interface | yes       | yes   |
| `ShowcaseWindowingSnapshot`           | type      | yes       | yes   |
| `stringifyShowcaseSession`            | function  | no        | yes   |

### src/showcase/terminal_store.ts

_Entrypoints: `./showcase`_

| Symbol                                          | Kind      | Type Only | JSDoc |
| ----------------------------------------------- | --------- | --------- | ----- |
| `createShowcaseTerminalStore`                   | function  | no        | yes   |
| `CreateShowcaseTerminalStoreOptions`            | interface | yes       | yes   |
| `createShowcaseTerminalStorePermissionManifest` | function  | no        | yes   |
| `SHOWCASE_TERMINAL_STORE_ADAPTER_ID`            | const     | no        | yes   |
| `SHOWCASE_TERMINAL_STORE_MAX_BYTES`             | const     | no        | yes   |
| `ShowcaseTerminalFileAdapter`                   | interface | yes       | yes   |
| `ShowcaseTerminalJsonStore`                     | class     | no        | yes   |
| `ShowcaseTerminalJsonStoreOptions`              | interface | yes       | yes   |
| `ShowcaseTerminalPermissionGateway`             | interface | yes       | yes   |
| `ShowcaseTerminalPermissionQuery`               | interface | yes       | yes   |
| `ShowcaseTerminalPermissionState`               | type      | yes       | yes   |
| `ShowcaseTerminalStoreError`                    | class     | no        | yes   |
| `ShowcaseTerminalStoreInspection`               | interface | yes       | yes   |
| `ShowcaseTerminalStoreMode`                     | type      | yes       | yes   |
| `ShowcaseTerminalStoreSelection`                | interface | yes       | yes   |

### src/signals/computed.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `Computable`            | interface | yes       | yes   |
| `Computed`              | class     | no        | yes   |
| `ComputedReadOnlyError` | class     | no        | yes   |

### src/signals/dependency_tracking.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                 | Kind     | Type Only | JSDoc |
| ---------------------- | -------- | --------- | ----- |
| `activeSignals`        | variable | no        | yes   |
| `optimizeDependencies` | function | no        | yes   |
| `trackDependencies`    | function | no        | yes   |

### src/signals/effect.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `Effect`                  | class     | no        | yes   |
| `Effectable`              | interface | yes       | yes   |
| `EffectPausedUpdateError` | class     | no        | yes   |

### src/signals/flusher.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol    | Kind  | Type Only | JSDoc |
| --------- | ----- | --------- | ----- |
| `Flusher` | class | no        | yes   |

### src/signals/lazy_computed.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol         | Kind  | Type Only | JSDoc |
| -------------- | ----- | --------- | ----- |
| `LazyComputed` | class | no        | yes   |

### src/signals/lazy_effect.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol       | Kind  | Type Only | JSDoc |
| ------------ | ----- | --------- | ----- |
| `LazyEffect` | class | no        | yes   |

### src/signals/mod.ts

_Entrypoints: `.`, `./app`, `./web`_

| Re-export Target                     | Kind | Names |
| ------------------------------------ | ---- | ----- |
| `src/signals/signal.ts`              | star | -     |
| `src/signals/computed.ts`            | star | -     |
| `src/signals/effect.ts`              | star | -     |
| `src/signals/flusher.ts`             | star | -     |
| `src/signals/lazy_computed.ts`       | star | -     |
| `src/signals/lazy_effect.ts`         | star | -     |
| `src/signals/dependency_tracking.ts` | star | -     |
| `src/signals/reactivity.ts`          | star | -     |
| `src/signals/types.ts`               | star | -     |

_No direct exported symbols._

### src/signals/reactivity.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                           | Kind     | Type Only | JSDoc |
| -------------------------------- | -------- | --------- | ----- |
| `CONNECTED_SIGNAL`               | const    | no        | yes   |
| `getConnectedSignal`             | function | no        | yes   |
| `getOriginalRef`                 | function | no        | yes   |
| `IS_REACTIVE`                    | const    | no        | yes   |
| `isReactive`                     | function | no        | yes   |
| `makeArrayMethodsReactive`       | function | no        | yes   |
| `makeMapMethodsReactive`         | function | no        | yes   |
| `makeObjectPropertiesReactive`   | function | no        | yes   |
| `makeSetMethodsReactive`         | function | no        | yes   |
| `ORIGINAL_REF`                   | const    | no        | yes   |
| `Reactive`                       | type     | yes       | yes   |
| `ReactiveOriginalRefAccessError` | class    | no        | yes   |
| `ReactiveSignalAccessError`      | class    | no        | yes   |

### src/signals/signal.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol                           | Kind      | Type Only | JSDoc |
| -------------------------------- | --------- | --------- | ----- |
| `batchSignalUpdates`             | function  | no        | yes   |
| `isSignalBatching`               | function  | no        | yes   |
| `Signal`                         | class     | no        | yes   |
| `SignalBatchScheduler`           | class     | no        | yes   |
| `SignalBatchSchedulerInspection` | interface | yes       | yes   |
| `SignalBatchSchedulerOptions`    | interface | yes       | yes   |
| `SignalDeepObserveTypeofError`   | class     | no        | yes   |
| `SignalInspection`               | interface | yes       | yes   |
| `SignalOfObject`                 | type      | yes       | yes   |
| `SignalOptions`                  | interface | yes       | yes   |
| `SignalRecursiveUpdateError`     | class     | no        | yes   |

### src/signals/types.ts

_Entrypoints: `.`, `./app`, `./web`_

| Symbol          | Kind      | Type Only | JSDoc |
| --------------- | --------- | --------- | ----- |
| `Dependant`     | interface | yes       | yes   |
| `Dependency`    | interface | yes       | yes   |
| `LazyDependant` | interface | yes       | yes   |
| `Subscription`  | interface | yes       | yes   |

### src/surface_animation.ts

_Entrypoints: `.`, `./web`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `createSurfaceAnimation`      | function  | no        | yes   |
| `PlacedSurfaceAnimationCell`  | interface | yes       | yes   |
| `resolveSurfaceAnimationKind` | function  | no        | yes   |
| `SURFACE_ANIMATION_KINDS`     | const     | no        | yes   |
| `SurfaceAnimation`            | class     | no        | yes   |
| `SurfaceAnimationChoice`      | type      | yes       | yes   |
| `SurfaceAnimationFrame`       | interface | yes       | yes   |
| `SurfaceAnimationKind`        | type      | yes       | yes   |
| `SurfaceAnimationOptions`     | interface | yes       | yes   |
| `SurfaceAnimationOverflow`    | interface | yes       | yes   |
| `SurfaceAnimationSpeed`       | type      | yes       | yes   |
| `surfaceAnimationSpeedScale`  | function  | no        | yes   |
| `SurfaceTransition`           | type      | yes       | yes   |
| `surfaceTransitionDirection`  | function  | no        | yes   |

### src/testing/app.ts

_Entrypoints: `./testing`_

| Symbol                           | Kind      | Type Only | JSDoc |
| -------------------------------- | --------- | --------- | ----- |
| `createTestTerminalApp`          | function  | no        | yes   |
| `TerminalAppPilot`               | class     | no        | yes   |
| `TerminalAppPilotClickResult`    | interface | yes       | yes   |
| `TerminalAppPilotDragOptions`    | interface | yes       | yes   |
| `TerminalAppPilotDragResult`     | interface | yes       | yes   |
| `TerminalAppPilotPointerOptions` | interface | yes       | yes   |
| `TerminalAppPilotSettleOptions`  | interface | yes       | yes   |
| `TerminalAppPilotWaitOptions`    | interface | yes       | yes   |
| `TestTerminalAppHarness`         | interface | yes       | yes   |
| `TestTerminalAppOptions`         | type      | yes       | yes   |
| `TestTerminalAppTuiOptions`      | type      | yes       | yes   |

### src/testing/aria_apg_suites.ts

_Entrypoints: `./testing`_

| Symbol                | Kind      | Type Only | JSDoc |
| --------------------- | --------- | --------- | ----- |
| `AriaCheck`           | interface | yes       | yes   |
| `AriaPattern`         | type      | yes       | yes   |
| `AriaPatternReport`   | interface | yes       | yes   |
| `runAriaPatternSuite` | function  | no        | yes   |

### src/testing/contract_tests.ts

_Entrypoints: `./testing`_

| Symbol               | Kind      | Type Only | JSDoc |
| -------------------- | --------- | --------- | ----- |
| `ConformanceReport`  | interface | yes       | yes   |
| `ContractCheck`      | interface | yes       | yes   |
| `runBackendContract` | function  | no        | yes   |
| `runPluginContract`  | function  | no        | yes   |
| `runSolverContract`  | function  | no        | yes   |
| `runThemeContract`   | function  | no        | yes   |

### src/testing/differential_terminal.ts

_Entrypoints: `./testing`_

| Symbol                 | Kind      | Type Only | JSDoc |
| ---------------------- | --------- | --------- | ----- |
| `DifferentialReport`   | interface | yes       | yes   |
| `DocumentedDivergence` | interface | yes       | yes   |
| `runDifferential`      | function  | no        | yes   |
| `runOperationCore`     | function  | no        | yes   |
| `runReferenceCore`     | function  | no        | yes   |
| `TerminalDivergence`   | interface | yes       | yes   |

### src/testing/fault_injection.ts

_Entrypoints: `./testing`_

| Symbol             | Kind      | Type Only | JSDoc |
| ------------------ | --------- | --------- | ----- |
| `FaultInjected`    | class     | no        | yes   |
| `FaultInjector`    | interface | yes       | yes   |
| `FaultSubject`     | interface | yes       | yes   |
| `FaultSweepReport` | interface | yes       | yes   |
| `InjectionReport`  | interface | yes       | yes   |
| `sweepFaults`      | function  | no        | yes   |

### src/testing/flake_detection.ts

_Entrypoints: `./testing`_

| Symbol                | Kind      | Type Only | JSDoc |
| --------------------- | --------- | --------- | ----- |
| `createFlakeDetector` | function  | no        | yes   |
| `FlakeArtifact`       | interface | yes       | yes   |
| `FlakeDetector`       | class     | no        | yes   |
| `FlakeReport`         | interface | yes       | yes   |
| `FlakeSubject`        | interface | yes       | yes   |
| `QuarantineLabel`     | interface | yes       | yes   |
| `TimingDistribution`  | interface | yes       | yes   |

### src/testing/input.ts

_Entrypoints: `.`, `./testing`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `createTestFocusable`   | function  | no        | yes   |
| `createTestKeyPress`    | function  | no        | yes   |
| `createTestMousePress`  | function  | no        | yes   |
| `createTestMouseScroll` | function  | no        | yes   |
| `TestKeyPressOptions`   | interface | yes       | yes   |
| `TestKeyPressTarget`    | class     | no        | yes   |
| `TestMouseTarget`       | class     | no        | yes   |

### src/testing/matrix.ts

_Entrypoints: `./testing`_

| Symbol                | Kind      | Type Only | JSDoc |
| --------------------- | --------- | --------- | ----- |
| `PilotMatrixCell`     | interface | yes       | yes   |
| `PilotMatrixEntry`    | interface | yes       | yes   |
| `PilotMatrixKey`      | type      | yes       | yes   |
| `PilotMatrixOptions`  | interface | yes       | yes   |
| `PilotMatrixSequence` | interface | yes       | yes   |
| `runPilotMatrix`      | function  | no        | yes   |

### src/testing/model_testing.ts

_Entrypoints: `./testing`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `formatModelTestFailure` | function  | no        | yes   |
| `ModelCommand`           | interface | yes       | yes   |
| `ModelStep`              | interface | yes       | yes   |
| `ModelTestFailure`       | interface | yes       | yes   |
| `ModelTestOptions`       | interface | yes       | yes   |
| `ModelTestResult`        | type      | yes       | yes   |
| `runModelTest`           | function  | no        | yes   |
| `seededRandom`           | function  | no        | yes   |

### src/testing/mutation_testing.ts

_Entrypoints: `./testing`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `formatMutationSurvivors` | function  | no        | yes   |
| `Mutant`                  | interface | yes       | yes   |
| `MutantOutcome`           | interface | yes       | yes   |
| `MutantSet`               | interface | yes       | yes   |
| `MutationReport`          | interface | yes       | yes   |
| `runMutationCampaign`     | function  | no        | yes   |

### src/testing/plugin_test_host.ts

_Entrypoints: `./testing`_

| Symbol                 | Kind      | Type Only | JSDoc |
| ---------------------- | --------- | --------- | ----- |
| `createPluginTestHost` | function  | no        | yes   |
| `LifecyclePhase`       | type      | yes       | yes   |
| `LifecycleRunReport`   | interface | yes       | yes   |
| `PhaseReport`          | interface | yes       | yes   |
| `PluginTestHost`       | class     | no        | yes   |
| `ScriptedTransport`    | interface | yes       | yes   |

### src/testing/record_replay.ts

_Entrypoints: `./testing`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `CheckpointRecord`      | interface | yes       | yes   |
| `DeterministicRuntime`  | class     | no        | yes   |
| `JournalEntry`          | interface | yes       | yes   |
| `JournalKind`           | type      | yes       | yes   |
| `ReplayDivergenceError` | class     | no        | yes   |
| `RunJournal`            | interface | yes       | yes   |
| `RuntimeSources`        | interface | yes       | yes   |

### src/testing/scene.ts

_Entrypoints: `./testing`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `captureLayoutTree`     | function  | no        | yes   |
| `captureStyledSpans`    | function  | no        | yes   |
| `captureTerminalScene`  | function  | no        | yes   |
| `TerminalCursorCapture` | interface | yes       | yes   |
| `TerminalLayoutNode`    | interface | yes       | yes   |
| `TerminalSceneCapture`  | interface | yes       | yes   |
| `TerminalSceneSources`  | interface | yes       | yes   |
| `TerminalStyledSpan`    | interface | yes       | yes   |

### src/testing/snapshot.ts

_Entrypoints: `.`, `./testing`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `assertTerminalSnapshot`      | function  | no        | yes   |
| `canvasRowText`               | function  | no        | yes   |
| `canvasSnapshot`              | function  | no        | yes   |
| `compareTerminalSnapshot`     | function  | no        | yes   |
| `createTestCanvas`            | function  | no        | yes   |
| `createTestStdout`            | function  | no        | yes   |
| `formatTerminalSnapshotDiff`  | function  | no        | yes   |
| `frameBufferToSnapshot`       | function  | no        | yes   |
| `normalizeTerminalSnapshot`   | function  | no        | yes   |
| `stripAnsi`                   | function  | no        | yes   |
| `TerminalSnapshotComparison`  | interface | yes       | yes   |
| `TerminalSnapshotDiffOptions` | interface | yes       | yes   |
| `TerminalSnapshotMismatch`    | interface | yes       | yes   |
| `TestCanvasOptions`           | interface | yes       | yes   |
| `TestStdout`                  | interface | yes       | yes   |

### src/testing/visual_report.ts

_Entrypoints: `./testing`_

| Symbol                  | Kind      | Type Only | JSDoc |
| ----------------------- | --------- | --------- | ----- |
| `renderSceneDiffReport` | function  | no        | yes   |
| `renderSceneHtml`       | function  | no        | yes   |
| `renderSceneSvg`        | function  | no        | yes   |
| `SceneDiffReport`       | interface | yes       | yes   |
| `SgrCss`                | interface | yes       | yes   |
| `sgrToCss`              | function  | no        | yes   |

### src/theme_binding.ts

_Entrypoints: `.`, `./web`, `./theme`_

| Symbol                                 | Kind      | Type Only | JSDoc |
| -------------------------------------- | --------- | --------- | ----- |
| `bindComponentTheme`                   | function  | no        | yes   |
| `bindComponentThemes`                  | function  | no        | yes   |
| `ComponentThemeBindingEntry`           | interface | yes       | yes   |
| `ComponentThemeBindingGroup`           | class     | no        | yes   |
| `ComponentThemeBindingGroupInspection` | interface | yes       | yes   |
| `ComponentThemeBindingInspection`      | interface | yes       | yes   |
| `ComponentThemeBindingOptions`         | interface | yes       | yes   |
| `ThemeBindable`                        | interface | yes       | yes   |

### src/theme_contrast.ts

_Entrypoints: `.`, `./web`, `./theme`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `ContrastConstraint`         | interface | yes       | yes   |
| `contrastRatio`              | function  | no        | yes   |
| `ContrastRepair`             | interface | yes       | yes   |
| `ContrastReport`             | interface | yes       | yes   |
| `ContrastViolation`          | interface | yes       | yes   |
| `enforceContrastConstraints` | function  | no        | yes   |
| `relativeLuminance`          | function  | no        | yes   |

### src/theme_controls.ts

_Entrypoints: `./theme`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `CONTROL_TOKEN_GROUP_IDS`    | const     | no        | yes   |
| `CONTROL_TOKEN_GROUP_LABELS` | const     | no        | yes   |
| `CONTROL_TOKENS`             | const     | no        | yes   |
| `controlToken`               | function  | no        | yes   |
| `controlTokenChain`          | function  | no        | yes   |
| `ControlTokenGroup`          | interface | yes       | yes   |
| `ControlTokenGroupId`        | type      | yes       | yes   |
| `controlTokenGroups`         | function  | no        | yes   |
| `controlTokenRegistry`       | function  | no        | yes   |
| `ControlTokenRole`           | type      | yes       | yes   |
| `ControlTokenSpec`           | interface | yes       | yes   |
| `resolveControlToken`        | function  | no        | yes   |
| `resolveControlTokens`       | function  | no        | yes   |

### src/theme_density.ts

_Entrypoints: `.`, `./web`_

| Symbol                 | Kind      | Type Only | JSDoc |
| ---------------------- | --------- | --------- | ----- |
| `createDensityContext` | function  | no        | yes   |
| `DENSITY_PROFILES`     | const     | no        | yes   |
| `DensityContext`       | class     | no        | yes   |
| `DensityProfileName`   | type      | yes       | yes   |
| `DensityTokens`        | interface | yes       | yes   |

### src/theme_editor_model.ts

_Entrypoints: `./theme`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `clearThemeToken`         | function  | no        | yes   |
| `createThemeDocument`     | function  | no        | yes   |
| `duplicateThemeDocument`  | function  | no        | yes   |
| `formatHexColor`          | function  | no        | yes   |
| `missingCoreTokens`       | function  | no        | yes   |
| `parseHexColor`           | function  | no        | yes   |
| `renameThemeDocument`     | function  | no        | yes   |
| `setThemeToken`           | function  | no        | yes   |
| `THEME_CONTRAST_AA`       | const     | no        | yes   |
| `THEME_CONTRAST_AA_LARGE` | const     | no        | yes   |
| `themeContrastFailures`   | function  | no        | yes   |
| `themeContrastReport`     | function  | no        | yes   |
| `ThemeContrastVerdict`    | interface | yes       | yes   |
| `themeDocumentIsComplete` | function  | no        | yes   |
| `ThemeEditorEntry`        | interface | yes       | yes   |
| `ThemeEditorGroup`        | interface | yes       | yes   |
| `themeEditorGroups`       | function  | no        | yes   |
| `themeEntry`              | function  | no        | yes   |
| `themeOverrides`          | function  | no        | yes   |
| `ThemeSwatch`             | interface | yes       | yes   |
| `themeSwatches`           | function  | no        | yes   |

### src/theme_engine_cache.ts

_Entrypoints: `.`, `./web`, `./theme`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `createThemeEngineCache`       | function  | no        | yes   |
| `createThemeProviderCache`     | function  | no        | yes   |
| `ThemeEngineCache`             | class     | no        | yes   |
| `ThemeEngineCacheInspection`   | interface | yes       | yes   |
| `ThemeProviderCache`           | class     | no        | yes   |
| `ThemeProviderCacheInspection` | interface | yes       | yes   |

### src/theme_engine_factory.ts

_Entrypoints: `.`, `./web`, `./theme`_

| Symbol                                     | Kind      | Type Only | JSDoc |
| ------------------------------------------ | --------- | --------- | ----- |
| `createThemeEngineFactory`                 | function  | no        | yes   |
| `createThemeEngineFactoryCatalogReport`    | function  | no        | yes   |
| `createThemeEngineFactoryRegistry`         | function  | no        | yes   |
| `formatThemeEngineFactoryCatalogMarkdown`  | function  | no        | yes   |
| `inspectThemeEngineFactoryCatalog`         | function  | no        | yes   |
| `prewarmThemeEngines`                      | function  | no        | yes   |
| `queryThemeEngineFactories`                | function  | no        | yes   |
| `ThemeEngineFactory`                       | class     | no        | yes   |
| `ThemeEngineFactoryBuildResult`            | interface | yes       | yes   |
| `ThemeEngineFactoryCatalogInspection`      | interface | yes       | yes   |
| `ThemeEngineFactoryCatalogMarkdownOptions` | interface | yes       | yes   |
| `ThemeEngineFactoryCatalogQuery`           | interface | yes       | yes   |
| `ThemeEngineFactoryCatalogReport`          | interface | yes       | yes   |
| `ThemeEngineFactoryCatalogReportOptions`   | interface | yes       | yes   |
| `ThemeEngineFactoryDefinition`             | interface | yes       | yes   |
| `ThemeEngineFactoryInspection`             | interface | yes       | yes   |
| `ThemeEngineFactoryNotFoundError`          | class     | no        | yes   |
| `ThemeEngineFactoryRegistry`               | class     | no        | yes   |
| `ThemeEnginePrewarmOptions`                | interface | yes       | yes   |

### src/theme_engine_pipeline.ts

_Entrypoints: `.`, `./web`, `./theme`_

| Symbol                              | Kind      | Type Only | JSDoc |
| ----------------------------------- | --------- | --------- | ----- |
| `createThemeEnginePipeline`         | function  | no        | yes   |
| `prewarmThemeEnginePipelines`       | function  | no        | yes   |
| `ThemeEnginePipeline`               | class     | no        | yes   |
| `ThemeEnginePipelineBuildResult`    | interface | yes       | yes   |
| `ThemeEnginePipelineContext`        | interface | yes       | yes   |
| `ThemeEnginePipelineDefinition`     | interface | yes       | yes   |
| `ThemeEnginePipelineInspection`     | interface | yes       | yes   |
| `ThemeEnginePipelineListener`       | type      | yes       | yes   |
| `ThemeEnginePipelinePrewarmOptions` | interface | yes       | yes   |
| `ThemeEnginePipelineStepDefinition` | interface | yes       | yes   |
| `ThemeEnginePipelineStepInspection` | interface | yes       | yes   |
| `ThemeEnginePipelineTransform`      | type      | yes       | yes   |

### src/theme_expressions.ts

_Entrypoints: `.`, `./web`, `./theme`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `ColorDepth`               | type      | yes       | yes   |
| `ColorExpression`          | type      | yes       | yes   |
| `CompiledThemeExpressions` | interface | yes       | yes   |
| `compileThemeExpressions`  | function  | no        | yes   |
| `Rgb`                      | type      | yes       | yes   |
| `ThemeExpressionError`     | class     | no        | yes   |

### src/theme_gallery.ts

_Entrypoints: `.`, `./web`, `./theme`_

| Symbol                              | Kind      | Type Only | JSDoc |
| ----------------------------------- | --------- | --------- | ----- |
| `createThemeGallery`                | function  | no        | yes   |
| `filterThemeGalleryItems`           | function  | no        | yes   |
| `rankThemeGalleryItems`             | function  | no        | yes   |
| `selectThemeGalleryItem`            | function  | no        | yes   |
| `ThemeGallery`                      | interface | yes       | yes   |
| `ThemeGalleryComponentStatePreview` | interface | yes       | yes   |
| `ThemeGalleryItem`                  | interface | yes       | yes   |
| `ThemeGalleryMatch`                 | interface | yes       | yes   |
| `ThemeGalleryOptions`               | interface | yes       | yes   |
| `ThemeGallerySelection`             | interface | yes       | yes   |
| `ThemeGalleryTokenPreview`          | interface | yes       | yes   |

### src/theme_icons.ts

_Entrypoints: `.`, `./web`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `createIconRegistry`       | function  | no        | yes   |
| `IconContractViolation`    | interface | yes       | yes   |
| `IconDefinition`           | interface | yes       | yes   |
| `IconPack`                 | interface | yes       | yes   |
| `IconRegistry`             | class     | no        | yes   |
| `ResolvedIcon`             | interface | yes       | yes   |
| `SUPPORTED_WIDTH_PROFILES` | const     | no        | yes   |
| `validateIconPack`         | function  | no        | yes   |

### src/theme_interchange.ts

_Entrypoints: `.`, `./web`, `./theme`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `exportThemeDocument`       | function  | no        | yes   |
| `importThemeDocument`       | function  | no        | yes   |
| `migrateThemeDocument`      | function  | no        | yes   |
| `SUPPORTED_THEME_FEATURES`  | const     | no        | yes   |
| `THEME_INTERCHANGE_VERSION` | const     | no        | yes   |
| `ThemeDocument`             | interface | yes       | yes   |
| `ThemeInterchangeError`     | class     | no        | yes   |
| `ThemeMigrationEntry`       | interface | yes       | yes   |
| `validateThemeDocument`     | function  | no        | yes   |

### src/theme_motion.ts

_Entrypoints: `.`, `./web`_

| Symbol                | Kind      | Type Only | JSDoc |
| --------------------- | --------- | --------- | ----- |
| `createMotionContext` | function  | no        | yes   |
| `easingValue`         | function  | no        | yes   |
| `MotionContext`       | class     | no        | yes   |
| `MotionEasing`        | type      | yes       | yes   |
| `MotionToken`         | interface | yes       | yes   |
| `ResolvedMotion`      | type      | yes       | yes   |
| `StaticBehavior`      | type      | yes       | yes   |

### src/theme_oklch.ts

_Entrypoints: `.`, `./web`, `./theme`_

| Symbol                 | Kind      | Type Only | JSDoc |
| ---------------------- | --------- | --------- | ----- |
| `generateTonalPalette` | function  | no        | yes   |
| `Oklch`                | interface | yes       | yes   |
| `oklchInGamut`         | function  | no        | yes   |
| `oklchToRgb`           | function  | no        | yes   |
| `rgbToOklch`           | function  | no        | yes   |
| `surfaceLadder`        | function  | no        | yes   |
| `SurfaceLadder`        | interface | yes       | yes   |
| `TONAL_STOPS`          | const     | no        | yes   |
| `TonalPalette`         | interface | yes       | yes   |

### src/theme_quantize.ts

_Entrypoints: `.`, `./web`_

| Symbol               | Kind      | Type Only | JSDoc |
| -------------------- | --------- | --------- | ----- |
| `perceptualDistance` | function  | no        | yes   |
| `QuantizeCollision`  | interface | yes       | yes   |
| `QuantizedToken`     | interface | yes       | yes   |
| `quantizePalette`    | function  | no        | yes   |
| `QuantizeReport`     | interface | yes       | yes   |
| `QuantizeTarget`     | type      | yes       | yes   |

### src/theme_resolver.ts

_Entrypoints: `.`, `./web`, `./theme`_

| Symbol                           | Kind      | Type Only | JSDoc |
| -------------------------------- | --------- | --------- | ----- |
| `componentThemeStyleRequests`    | function  | no        | yes   |
| `createThemeEngineResolver`      | function  | no        | yes   |
| `createThemeProviderResolver`    | function  | no        | yes   |
| `createThemeResolutionSnapshot`  | function  | no        | yes   |
| `formatThemeResolutionMarkdown`  | function  | no        | yes   |
| `ThemeEngineResolver`            | class     | no        | yes   |
| `ThemeProviderResolver`          | class     | no        | yes   |
| `ThemeResolutionSnapshot`        | interface | yes       | yes   |
| `ThemeResolutionSnapshotOptions` | interface | yes       | yes   |
| `ThemeResolver`                  | interface | yes       | yes   |
| `ThemeResolverMarkdownOptions`   | interface | yes       | yes   |
| `ThemeStyleRequest`              | interface | yes       | yes   |
| `ThemeStyleResolution`           | interface | yes       | yes   |
| `ThemeTokenRequest`              | interface | yes       | yes   |
| `ThemeTokenResolution`           | interface | yes       | yes   |

### src/theme_token_schemas.ts

_Entrypoints: `.`, `./web`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `ComponentTokenSchema`       | interface | yes       | yes   |
| `resolveComponentToken`      | function  | no        | yes   |
| `ThemeStateValues`           | type      | yes       | yes   |
| `TokenCoverageIssue`         | interface | yes       | yes   |
| `TokenCoverageReport`        | interface | yes       | yes   |
| `TokenRequirement`           | interface | yes       | yes   |
| `validateThemeTokenCoverage` | function  | no        | yes   |

### src/theme_tokens.ts

_Entrypoints: `.`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `CoreThemeTokenName`          | type      | yes       | yes   |
| `createSemanticTokenRegistry` | function  | no        | yes   |
| `NamespacedThemeTokenName`    | type      | yes       | yes   |
| `SemanticTokenDeclaration`    | interface | yes       | yes   |
| `SemanticTokenRegistry`       | class     | no        | yes   |
| `SemanticTokenValues`         | type      | yes       | yes   |

### src/theme_workspace.ts

_Entrypoints: `.`, `./web`, `./theme`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `createThemeWorkspace`         | function  | no        | yes   |
| `ThemeWorkspace`               | class     | no        | yes   |
| `ThemeWorkspaceEngineOptions`  | interface | yes       | yes   |
| `ThemeWorkspaceInspection`     | interface | yes       | yes   |
| `ThemeWorkspaceOptions`        | interface | yes       | yes   |
| `ThemeWorkspacePrewarmOptions` | interface | yes       | yes   |
| `ThemeWorkspacePrewarmResult`  | interface | yes       | yes   |

### src/theme.ts

_Entrypoints: `.`, `./app`, `./web`, `./theme`_

| Symbol                                    | Kind      | Type Only | JSDoc |
| ----------------------------------------- | --------- | --------- | ----- |
| `AnsiColor`                               | type      | yes       | yes   |
| `AnsiColorName`                           | type      | yes       | yes   |
| `AnsiRgbColor`                            | type      | yes       | yes   |
| `AnsiStyleSpec`                           | type      | yes       | yes   |
| `AnsiThemeTokenSpecs`                     | type      | yes       | yes   |
| `assertThemeOptions`                      | function  | no        | yes   |
| `compileThemeManifestOptions`             | function  | no        | yes   |
| `compileThemeManifestStateDefinition`     | function  | no        | yes   |
| `compileThemeManifestStyleReference`      | function  | no        | yes   |
| `ComponentThemeDefinition`                | interface | yes       | yes   |
| `composeStandardThemeOptions`             | function  | no        | yes   |
| `composeStyles`                           | function  | no        | yes   |
| `composeThemeOptions`                     | function  | no        | yes   |
| `createAnsiStyle`                         | function  | no        | yes   |
| `createAnsiThemeTokens`                   | function  | no        | yes   |
| `createStandardComponentThemeDefinitions` | function  | no        | yes   |
| `createTheme`                             | function  | no        | yes   |
| `createThemeCatalog`                      | function  | no        | yes   |
| `createThemeEngine`                       | function  | no        | yes   |
| `createThemeEngineFromManifest`           | function  | no        | yes   |
| `createThemeEngineFromPalette`            | function  | no        | yes   |
| `createThemeLayerStack`                   | function  | no        | yes   |
| `createThemePaletteRegistry`              | function  | no        | yes   |
| `createThemeProvider`                     | function  | no        | yes   |
| `createThemeProviderReport`               | function  | no        | yes   |
| `createThemeRegistry`                     | function  | no        | yes   |
| `createThemeRegistryFromManifests`        | function  | no        | yes   |
| `defaultThemePacks`                       | const     | no        | yes   |
| `defaultThemePaletteDefinitions`          | function  | no        | yes   |
| `diffThemeEngines`                        | function  | no        | yes   |
| `emptyStyle`                              | const     | no        | yes   |
| `formatThemeProviderReportMarkdown`       | function  | no        | yes   |
| `hierarchizeTheme`                        | function  | no        | yes   |
| `inspectThemeCoverage`                    | function  | no        | yes   |
| `inspectThemeManifest`                    | function  | no        | yes   |
| `inspectThemeStandardization`             | function  | no        | yes   |
| `mergeComponentThemeDefinition`           | function  | no        | yes   |
| `previewThemeManifest`                    | function  | no        | yes   |
| `previewThemeProvider`                    | function  | no        | yes   |
| `replaceEmptyStyle`                       | function  | no        | yes   |
| `resolveThemeStateDefinition`             | function  | no        | yes   |
| `resolveThemeStyleReference`              | function  | no        | yes   |
| `StandardComponentThemeOptions`           | interface | yes       | yes   |
| `standardThemeComponentNames`             | function  | no        | yes   |
| `Style`                                   | type      | yes       | yes   |
| `Theme`                                   | interface | yes       | yes   |
| `ThemeCatalog`                            | interface | yes       | yes   |
| `ThemeCatalogComponent`                   | interface | yes       | yes   |
| `ThemeCatalogLayer`                       | interface | yes       | yes   |
| `ThemeCatalogTheme`                       | interface | yes       | yes   |
| `ThemeComponentCoverageInspection`        | interface | yes       | yes   |
| `ThemeComponentInspection`                | interface | yes       | yes   |
| `ThemeComponentStateDiff`                 | interface | yes       | yes   |
| `ThemeCoverageInspection`                 | interface | yes       | yes   |
| `ThemeCoverageOptions`                    | interface | yes       | yes   |
| `ThemeEngine`                             | class     | no        | yes   |
| `ThemeEngineDiff`                         | interface | yes       | yes   |
| `ThemeEngineDiffOptions`                  | interface | yes       | yes   |
| `ThemeEngineOptions`                      | interface | yes       | yes   |
| `ThemeInheritanceError`                   | class     | no        | yes   |
| `ThemeInspection`                         | interface | yes       | yes   |
| `ThemeLayer`                              | interface | yes       | yes   |
| `ThemeLayerInspection`                    | interface | yes       | yes   |
| `ThemeLayerStack`                         | class     | no        | yes   |
| `ThemeManifestComponentDefinition`        | interface | yes       | yes   |
| `ThemeManifestComponentInspection`        | interface | yes       | yes   |
| `ThemeManifestComponentStatePreview`      | interface | yes       | yes   |
| `ThemeManifestInspection`                 | interface | yes       | yes   |
| `ThemeManifestOptions`                    | interface | yes       | yes   |
| `ThemeManifestPreview`                    | interface | yes       | yes   |
| `ThemeManifestPreviewOptions`             | interface | yes       | yes   |
| `ThemeManifestStateDefinition`            | type      | yes       | yes   |
| `ThemeManifestStyleReference`             | type      | yes       | yes   |
| `ThemeManifestTokenPreview`               | interface | yes       | yes   |
| `ThemeManifestVariantInspection`          | interface | yes       | yes   |
| `ThemePack`                               | interface | yes       | yes   |
| `themePackFromManifest`                   | function  | no        | yes   |
| `ThemePackInspection`                     | interface | yes       | yes   |
| `ThemePackManifest`                       | interface | yes       | yes   |
| `ThemePackNotFoundError`                  | class     | no        | yes   |
| `ThemePalette`                            | interface | yes       | yes   |
| `ThemePaletteInspection`                  | interface | yes       | yes   |
| `ThemePaletteName`                        | type      | yes       | yes   |
| `ThemePaletteNotFoundError`               | class     | no        | yes   |
| `ThemePaletteReference`                   | type      | yes       | yes   |
| `ThemePaletteRegistry`                    | class     | no        | yes   |
| `themePalettes`                           | const     | no        | yes   |
| `ThemeProvider`                           | class     | no        | yes   |
| `ThemeProviderComponentStatePreview`      | interface | yes       | yes   |
| `ThemeProviderInspection`                 | interface | yes       | yes   |
| `ThemeProviderOptions`                    | interface | yes       | yes   |
| `ThemeProviderPreview`                    | interface | yes       | yes   |
| `ThemeProviderPreviewOptions`             | interface | yes       | yes   |
| `ThemeProviderReport`                     | interface | yes       | yes   |
| `ThemeProviderReportIssue`                | interface | yes       | yes   |
| `ThemeProviderReportIssueSource`          | type      | yes       | yes   |
| `ThemeProviderReportOptions`              | interface | yes       | yes   |
| `ThemeProviderReportSummary`              | interface | yes       | yes   |
| `ThemeProviderTokenPreview`               | interface | yes       | yes   |
| `ThemeRegistry`                           | class     | no        | yes   |
| `ThemeStandardizationInspection`          | interface | yes       | yes   |
| `ThemeState`                              | type      | yes       | yes   |
| `ThemeStateDefinition`                    | type      | yes       | yes   |
| `themeStates`                             | const     | no        | yes   |
| `ThemeStylePreview`                       | interface | yes       | yes   |
| `ThemeStyleReference`                     | type      | yes       | yes   |
| `ThemeTokenDiff`                          | interface | yes       | yes   |
| `ThemeTokenName`                          | type      | yes       | yes   |
| `themeTokenNames`                         | const     | no        | yes   |
| `ThemeTokens`                             | interface | yes       | yes   |
| `ThemeValidationError`                    | class     | no        | yes   |
| `ThemeValidationIssue`                    | interface | yes       | yes   |
| `ThemeValidationIssueKind`                | type      | yes       | yes   |
| `ThemeVariantCoverageInspection`          | interface | yes       | yes   |
| `validateThemeOptions`                    | function  | no        | yes   |
| `withFocusCue`                            | function  | no        | yes   |

### src/three_ascii/AcerolaAsciiNode.ts

_Entrypoints: `./web`, `./three-ascii`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `AcerolaAsciiNode`          | class     | no        | yes   |
| `AcerolaAsciiNodeOptions`   | interface | yes       | yes   |
| `AcerolaAsciiRenderProfile` | interface | yes       | yes   |

### src/three_ascii/demo_presets.ts

_Entrypoints: `./web`, `./three-ascii`_

| Symbol                          | Kind      | Type Only | JSDoc |
| ------------------------------- | --------- | --------- | ----- |
| `ASCII_DEMO_PRESETS`            | const     | no        | yes   |
| `ASCII_NUMERIC_CONTROLS`        | const     | no        | yes   |
| `ASCII_TOGGLE_CONTROLS`         | const     | no        | yes   |
| `AsciiDemoPreset`               | interface | yes       | yes   |
| `asciiDemoPresetIds`            | function  | no        | yes   |
| `asciiDemoPresets`              | function  | no        | yes   |
| `asciiDemoPresetSummaries`      | function  | no        | yes   |
| `AsciiDemoPresetSummary`        | interface | yes       | yes   |
| `AsciiNumericControlDefinition` | interface | yes       | yes   |
| `AsciiNumericControlKey`        | type      | yes       | yes   |
| `AsciiToggleControlDefinition`  | interface | yes       | yes   |
| `AsciiToggleControlKey`         | type      | yes       | yes   |
| `DEFAULT_ASCII_DEMO_EFFECT`     | const     | no        | yes   |
| `findAsciiDemoPreset`           | function  | no        | yes   |

### src/three_ascii/frame_options.ts

_Entrypoints: `./web`, `./three-ascii`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `ThreeAsciiRenderFrameOptions` | interface | yes       | yes   |

### src/three_ascii/glyphs.ts

_Entrypoints: `./web`, `./three-ascii`_

| Symbol                      | Kind     | Type Only | JSDoc |
| --------------------------- | -------- | --------- | ----- |
| `ASCII_FILL_GLYPHS`         | const    | no        | yes   |
| `BLOCK_FILL_GLYPHS`         | const    | no        | yes   |
| `blockFillGlyphForBucket`   | function | no        | yes   |
| `bucketAsciiLuminance`      | function | no        | yes   |
| `classifyEdgeDirection`     | function | no        | yes   |
| `EDGE_GLYPHS`               | const    | no        | yes   |
| `EdgeDirection`             | type     | yes       | yes   |
| `FILL_GLYPHS`               | const    | no        | yes   |
| `glyphForTile`              | function | no        | yes   |
| `pickDominantEdgeDirection` | function | no        | yes   |
| `TERMINAL_GLYPH_STYLES`     | const    | no        | yes   |
| `TERMINAL_GLYPHS`           | const    | no        | yes   |
| `TerminalGlyphStyle`        | type     | yes       | yes   |

### src/three_ascii/mod.ts

_Entrypoints: `./web`, `./three-ascii`_

| Re-export Target                      | Kind | Names |
| ------------------------------------- | ---- | ----- |
| `src/three_ascii/AcerolaAsciiNode.ts` | star | -     |
| `src/three_ascii/demo_presets.ts`     | star | -     |
| `src/three_ascii/glyphs.ts`           | star | -     |
| `src/three_ascii/options.ts`          | star | -     |
| `src/three_ascii/render_profile.ts`   | star | -     |
| `src/three_ascii/renderer.ts`         | star | -     |
| `src/three_ascii/webgpu_compat.ts`    | star | -     |

_No direct exported symbols._

### src/three_ascii/options.ts

_Entrypoints: `./web`, `./three-ascii`_

| Symbol                              | Kind      | Type Only | JSDoc |
| ----------------------------------- | --------- | --------- | ----- |
| `applyAsciiPreset`                  | function  | no        | yes   |
| `asciiControlValues`                | function  | no        | yes   |
| `asciiEffectOptions`                | function  | no        | yes   |
| `asciiPresetLabel`                  | function  | no        | yes   |
| `buildAsciiOptionsFromPreset`       | function  | no        | yes   |
| `clampAsciiControlValue`            | function  | no        | yes   |
| `cloneAsciiOptions`                 | function  | no        | yes   |
| `createDefaultAsciiOptions`         | function  | no        | yes   |
| `formatAsciiControlValue`           | function  | no        | yes   |
| `normalizeAsciiOptions`             | function  | no        | yes   |
| `terminalGlyphStyleLabel`           | function  | no        | yes   |
| `THREE_ASCII_BORDER_MODES`          | const     | no        | yes   |
| `ThreeAsciiBorderMode`              | type      | yes       | yes   |
| `ThreeAsciiConfigOptions`           | interface | yes       | yes   |
| `ThreeAsciiOptionNumericControlKey` | type      | yes       | yes   |

### src/three_ascii/performance.ts

_Entrypoints: `./web`, `./three-ascii`_

| Symbol                          | Kind      | Type Only | JSDoc |
| ------------------------------- | --------- | --------- | ----- |
| `ThreeAsciiRendererPerformance` | interface | yes       | yes   |

### src/three_ascii/render_profile.ts

_Entrypoints: `./web`, `./three-ascii`_

| Symbol                               | Kind      | Type Only | JSDoc |
| ------------------------------------ | --------- | --------- | ----- |
| `resolveThreeAsciiRenderProfile`     | function  | no        | yes   |
| `resolveThreeAsciiRenderProfileInto` | function  | no        | yes   |
| `ThreeAsciiRenderProfileInput`       | interface | yes       | yes   |

### src/three_ascii/renderer.ts

_Entrypoints: `./web`, `./three-ascii`_

| Re-export Target                   | Kind  | Names                                |
| ---------------------------------- | ----- | ------------------------------------ |
| `src/three_ascii/frame_options.ts` | named | `type ThreeAsciiRenderFrameOptions`  |
| `src/three_ascii/performance.ts`   | named | `type ThreeAsciiRendererPerformance` |

| Symbol                                        | Kind      | Type Only | JSDoc |
| --------------------------------------------- | --------- | --------- | ----- |
| `buildThreeAsciiAnsiGrid`                     | function  | no        | yes   |
| `computeThreeAsciiCameraAspect`               | function  | no        | yes   |
| `handleThreeAsciiDeferredReadbackFailure`     | function  | no        | yes   |
| `readThreeAsciiImageFrame`                    | function  | no        | yes   |
| `resolveThreeAsciiDeferredReadbackSubmission` | function  | no        | yes   |
| `shouldUpdateThreeAsciiCameraAspect`          | function  | no        | yes   |
| `THREE_ASCII_CAMERA_ASPECT_EPSILON`           | const     | no        | yes   |
| `ThreeAsciiAnsiGridAssembler`                 | class     | no        | yes   |
| `ThreeAsciiAnsiGridInput`                     | interface | yes       | yes   |
| `ThreeAsciiCameraAspectInput`                 | interface | yes       | yes   |
| `ThreeAsciiDeferredReadbackFailureQueue`      | interface | yes       | yes   |
| `ThreeAsciiDeferredReadbackFailureResult`     | interface | yes       | yes   |
| `ThreeAsciiDeferredReadbackSubmission`        | interface | yes       | yes   |
| `ThreeAsciiImageFrame`                        | interface | yes       | yes   |
| `ThreeAsciiImageFrameSource`                  | interface | yes       | yes   |
| `ThreeAsciiMappedReadbackBuffer`              | interface | yes       | yes   |
| `ThreeAsciiMappedReadbackOptions`             | interface | yes       | yes   |
| `ThreeAsciiReadbackError`                     | class     | no        | yes   |
| `ThreeAsciiRenderer`                          | class     | no        | yes   |
| `ThreeAsciiRendererOptions`                   | interface | yes       | yes   |
| `ThreeAsciiRenderFrame`                       | interface | yes       | yes   |
| `withThreeAsciiMappedReadback`                | function  | no        | yes   |

### src/three_ascii/webgpu_compat.ts

_Entrypoints: `./web`, `./three-ascii`_

| Symbol                             | Kind     | Type Only | JSDoc |
| ---------------------------------- | -------- | --------- | ----- |
| `getCompatibleWebGPUDevice`        | function | no        | yes   |
| `probeCompatibleWebGPUDevice`      | function | no        | yes   |
| `resetCompatibleWebGPUDeviceCache` | function | no        | yes   |

### src/tooling/attestations.ts

_Entrypoints: `.`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `AttestationVerification` | type      | yes       | yes   |
| `buildProvenance`         | function  | no        | yes   |
| `buildSpdxDocument`       | function  | no        | yes   |
| `DependencyEntry`         | interface | yes       | yes   |
| `ProvenanceStatement`     | interface | yes       | yes   |
| `sha256Hex`               | function  | no        | yes   |
| `SpdxDocument`            | interface | yes       | yes   |
| `verifyAttestations`      | function  | no        | yes   |

### src/tooling/codemods.ts

_Entrypoints: `.`_

| Symbol              | Kind      | Type Only | JSDoc |
| ------------------- | --------- | --------- | ----- |
| `Codemod`           | interface | yes       | yes   |
| `CodemodResult`     | interface | yes       | yes   |
| `CodemodRule`       | type      | yes       | yes   |
| `runCodemod`        | function  | no        | yes   |
| `UnsupportedSyntax` | interface | yes       | yes   |

### src/tooling/devtools.ts

_Entrypoints: `.`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `ConsoleEntry`              | interface | yes       | yes   |
| `FilteredConsoleController` | class     | no        | yes   |
| `HotReloadErrorSurface`     | class     | no        | yes   |
| `KeyDiagnosticRecord`       | interface | yes       | yes   |
| `KeyDiagnosticsController`  | class     | no        | yes   |
| `LayoutInspection`          | interface | yes       | yes   |
| `LayoutInspectorController` | class     | no        | yes   |
| `WorkerResourceRow`         | interface | yes       | yes   |
| `workerResourceRows`        | function  | no        | yes   |

### src/tooling/diagnostics_hub.ts

_Entrypoints: `.`_

| Symbol                 | Kind      | Type Only | JSDoc |
| ---------------------- | --------- | --------- | ----- |
| `CellDiffStats`        | interface | yes       | yes   |
| `createDiagnosticsHub` | function  | no        | yes   |
| `DiagnosticsHub`       | class     | no        | yes   |
| `DiagnosticsSnapshot`  | interface | yes       | yes   |
| `FrameTimingStats`     | interface | yes       | yes   |
| `InvalidationRecord`   | interface | yes       | yes   |
| `ResourceRecord`       | interface | yes       | yes   |

### src/tooling/example_registry.ts

_Entrypoints: `.`_

| Symbol                 | Kind      | Type Only | JSDoc |
| ---------------------- | --------- | --------- | ----- |
| `buildExampleRegistry` | function  | no        | yes   |
| `entryForExample`      | function  | no        | yes   |
| `ExampleEntry`         | interface | yes       | yes   |
| `ExampleRegistry`      | interface | yes       | yes   |

### src/tooling/generators.ts

_Entrypoints: `.`_

| Symbol                 | Kind      | Type Only | JSDoc |
| ---------------------- | --------- | --------- | ----- |
| `applyPlan`            | function  | no        | yes   |
| `ArtifactKind`         | type      | yes       | yes   |
| `generateArtifact`     | function  | no        | yes   |
| `GeneratedArtifact`    | interface | yes       | yes   |
| `planGeneration`       | function  | no        | yes   |
| `PlannedFile`          | type      | yes       | yes   |
| `validateArtifactName` | function  | no        | yes   |

### src/tooling/init_templates.ts

_Entrypoints: `.`_

| Symbol             | Kind     | Type Only | JSDoc |
| ------------------ | -------- | --------- | ----- |
| `generateTemplate` | function | no        | yes   |
| `TEMPLATE_KINDS`   | const    | no        | yes   |
| `TEMPLATE_VERSION` | const    | no        | yes   |
| `TemplateFiles`    | type     | yes       | yes   |
| `TemplateKind`     | type     | yes       | yes   |

### src/tooling/launcher_template.ts

_Entrypoints: `.`_

| Symbol                     | Kind     | Type Only | JSDoc |
| -------------------------- | -------- | --------- | ----- |
| `generateLauncherTemplate` | function | no        | yes   |

### src/tooling/mod.ts

_Entrypoints: `.`_

| Re-export Target                   | Kind | Names |
| ---------------------------------- | ---- | ----- |
| `src/tooling/codemods.ts`          | star | -     |
| `src/tooling/example_registry.ts`  | star | -     |
| `src/tooling/generators.ts`        | star | -     |
| `src/tooling/init_templates.ts`    | star | -     |
| `src/tooling/launcher_template.ts` | star | -     |
| `src/tooling/attestations.ts`      | star | -     |
| `src/tooling/release_channels.ts`  | star | -     |
| `src/tooling/diagnostics_hub.ts`   | star | -     |
| `src/tooling/devtools.ts`          | star | -     |

_No direct exported symbols._

### src/tooling/release_channels.ts

_Entrypoints: `.`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `ChannelDeclaration`       | interface | yes       | yes   |
| `createReleaseTagRegistry` | function  | no        | yes   |
| `PublishResult`            | type      | yes       | yes   |
| `RELEASE_CHANNELS`         | const     | no        | yes   |
| `ReleaseChannel`           | type      | yes       | yes   |
| `ReleaseTagRegistry`       | class     | no        | yes   |
| `UpgradeDiagnostic`        | interface | yes       | yes   |

### src/tui.ts

_Entrypoints: `.`, `./app`_

| Symbol                                  | Kind      | Type Only | JSDoc |
| --------------------------------------- | --------- | --------- | ----- |
| `shouldUseRecentlyVerifiedTerminalSize` | function  | no        | yes   |
| `Tui`                                   | class     | no        | yes   |
| `TuiOptions`                            | interface | yes       | yes   |

### src/types.ts

_Entrypoints: `.`, `./app`, `./remote`_

| Symbol        | Kind      | Type Only | JSDoc |
| ------------- | --------- | --------- | ----- |
| `ConsoleSize` | type      | yes       | yes   |
| `DeepPartial` | type      | yes       | yes   |
| `Margin`      | interface | yes       | yes   |
| `Offset`      | interface | yes       | yes   |
| `Range`       | type      | yes       | yes   |
| `Rectangle`   | interface | yes       | yes   |
| `Stdin`       | type      | yes       | yes   |
| `Stdout`      | type      | yes       | yes   |

### src/unicode/bidi.ts

_Entrypoints: `.`_

| Symbol                | Kind      | Type Only | JSDoc |
| --------------------- | --------- | --------- | ----- |
| `bidiParagraph`       | function  | no        | yes   |
| `BidiParagraph`       | interface | yes       | yes   |
| `bidiParagraphOfText` | function  | no        | yes   |
| `BidiRun`             | interface | yes       | yes   |
| `lookupBidiClass`     | function  | no        | yes   |

### src/unicode/builtin.ts

_Entrypoints: `.`_

| Symbol                                 | Kind  | Type Only | JSDoc |
| -------------------------------------- | ----- | --------- | ----- |
| `BUILTIN_UNICODE_DATA_PACK`            | const | no        | yes   |
| `BUILTIN_UNICODE_DATA_PACK_INSPECTION` | const | no        | yes   |
| `DEFAULT_UNICODE_DATA_PACK_REGISTRY`   | const | no        | yes   |
| `UNICODE_DATA_VERSION`                 | const | no        | yes   |

### src/unicode/conformance.ts

_Entrypoints: `.`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `ConformanceGateResult`   | interface | yes       | yes   |
| `EMOJI_SAMPLE`            | const     | no        | yes   |
| `runBidiConformance`      | function  | no        | yes   |
| `runEmojiConformance`     | function  | no        | yes   |
| `runGraphemeConformance`  | function  | no        | yes   |
| `runLineBreakConformance` | function  | no        | yes   |
| `runWidthConformance`     | function  | no        | yes   |
| `WIDTH_TAILORING_SAMPLE`  | const     | no        | yes   |

### src/unicode/confusables.ts

_Entrypoints: `.`_

| Symbol                          | Kind      | Type Only | JSDoc |
| ------------------------------- | --------- | --------- | ----- |
| `confusableSkeleton`            | function  | no        | yes   |
| `createIdentifierSecurityGuard` | function  | no        | yes   |
| `IdentifierSecurityGuard`       | class     | no        | yes   |
| `IdentifierWarning`             | interface | yes       | yes   |
| `restrictionLevel`              | function  | no        | yes   |
| `RestrictionLevel`              | type      | yes       | yes   |

### src/unicode/controls.ts

_Entrypoints: `.`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `ControlExpandedCell`     | interface | yes       | yes   |
| `ControlExpansion`        | interface | yes       | yes   |
| `ControlExpansionOptions` | interface | yes       | yes   |
| `ControlRenderMode`       | type      | yes       | yes   |
| `expandTerminalControls`  | function  | no        | yes   |
| `nextTerminalTabStop`     | function  | no        | yes   |
| `TerminalTabStops`        | interface | yes       | yes   |

### src/unicode/data_pack.ts

_Entrypoints: `.`_

| Symbol                              | Kind      | Type Only | JSDoc |
| ----------------------------------- | --------- | --------- | ----- |
| `fingerprintUnicodeDataPackContent` | function  | no        | yes   |
| `hasEmojiProperty`                  | function  | no        | yes   |
| `inspectUnicodeDataPack`            | function  | no        | yes   |
| `lookupEastAsianWidthProperty`      | function  | no        | yes   |
| `lookupEmojiProperties`             | function  | no        | yes   |
| `lookupGraphemeBreakProperty`       | function  | no        | yes   |
| `serializeUnicodeDataPack`          | function  | no        | yes   |
| `UNICODE_DATA_PACK_LIMITS`          | const     | no        | yes   |
| `UNICODE_DATA_PACK_SCHEMA`          | const     | no        | yes   |
| `UNICODE_DATA_PACK_SCHEMA_VERSION`  | const     | no        | yes   |
| `UnicodeBinaryPropertyRanges`       | interface | yes       | yes   |
| `UnicodeCodePointRange`             | interface | yes       | yes   |
| `UnicodeDataPack`                   | interface | yes       | yes   |
| `UnicodeDataPackContent`            | interface | yes       | yes   |
| `UnicodeDataPackInspection`         | interface | yes       | yes   |
| `UnicodeDataPackNotFoundError`      | class     | no        | yes   |
| `UnicodeDataPackRegistry`           | class     | no        | yes   |
| `UnicodeDataPackRegistryInspection` | interface | yes       | yes   |
| `UnicodeDataPackRegistryOptions`    | interface | yes       | yes   |
| `UnicodeDataPackSelector`           | interface | yes       | yes   |
| `UnicodeDataPackSource`             | interface | yes       | yes   |
| `UnicodeDataPackTables`             | interface | yes       | yes   |
| `UnicodeDataPackValidationError`    | class     | no        | yes   |
| `unicodeDataSha256`                 | function  | no        | yes   |
| `UnicodeValuedRange`                | interface | yes       | yes   |
| `validateUnicodeDataPack`           | function  | no        | yes   |

### src/unicode/emoji.ts

_Entrypoints: `.`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `classifyEmojiSequence`  | function  | no        | yes   |
| `emojiAwareTextWidth`    | function  | no        | yes   |
| `EmojiAwareWidthOptions` | interface | yes       | yes   |
| `EmojiSequenceKind`      | type      | yes       | yes   |
| `EmojiSequenceSpan`      | interface | yes       | yes   |
| `segmentEmojiSequences`  | function  | no        | yes   |

### src/unicode/grapheme.ts

_Entrypoints: `.`_

| Symbol                               | Kind      | Type Only | JSDoc |
| ------------------------------------ | --------- | --------- | ----- |
| `coveringGraphemeRange`              | function  | no        | yes   |
| `DEFAULT_UNICODE_GRAPHEME_SEGMENTER` | const     | no        | yes   |
| `graphemeBoundaries`                 | function  | no        | yes   |
| `GraphemeBoundaryBias`               | type      | yes       | yes   |
| `GraphemeBoundaryRange`              | interface | yes       | yes   |
| `GraphemeBreakProperty`              | type      | yes       | yes   |
| `GraphemeCluster`                    | interface | yes       | yes   |
| `IndicConjunctBreakProperty`         | type      | yes       | yes   |
| `isGraphemeBoundary`                 | function  | no        | yes   |
| `iterateGraphemes`                   | function  | no        | yes   |
| `lookupIndicConjunctBreakProperty`   | function  | no        | yes   |
| `nextGraphemeBoundary`               | function  | no        | yes   |
| `previousGraphemeBoundary`           | function  | no        | yes   |
| `resolveGraphemeBoundary`            | function  | no        | yes   |
| `segmentGraphemes`                   | function  | no        | yes   |
| `truncateGraphemeClusters`           | function  | no        | yes   |
| `truncateGraphemeUtf16`              | function  | no        | yes   |
| `UnicodeGraphemeChunkSegmenter`      | class     | no        | yes   |
| `UnicodeGraphemeDataError`           | class     | no        | yes   |
| `UnicodeGraphemeSegmenter`           | class     | no        | yes   |
| `UnicodeGraphemeSegmenterInspection` | interface | yes       | yes   |

### src/unicode/hyphenation.ts

_Entrypoints: `.`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `breakWordForDisplay`       | function  | no        | yes   |
| `createHyphenationRegistry` | function  | no        | yes   |
| `HyphenatedBreak`           | interface | yes       | yes   |
| `HyphenationOpportunity`    | interface | yes       | yes   |
| `HyphenationProvider`       | interface | yes       | yes   |
| `HyphenationRegistry`       | class     | no        | yes   |
| `stripSoftHyphens`          | function  | no        | yes   |

### src/unicode/line_break.ts

_Entrypoints: `.`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `LineBreakClass`         | type      | yes       | yes   |
| `lineBreakOpportunities` | function  | no        | yes   |
| `LineBreakOpportunity`   | interface | yes       | yes   |
| `LineBreakOptions`       | interface | yes       | yes   |
| `lookupLineBreakClass`   | function  | no        | yes   |
| `TerminalWrapOptions`    | interface | yes       | yes   |
| `TerminalWrappedLine`    | interface | yes       | yes   |
| `wrapTerminalText`       | function  | no        | yes   |

### src/unicode/mod.ts

_Entrypoints: `.`_

| Re-export Target                | Kind | Names |
| ------------------------------- | ---- | ----- |
| `src/unicode/data_pack.ts`      | star | -     |
| `src/unicode/bidi.ts`           | star | -     |
| `src/unicode/conformance.ts`    | star | -     |
| `src/unicode/builtin.ts`        | star | -     |
| `src/unicode/grapheme.ts`       | star | -     |
| `src/unicode/width.ts`          | star | -     |
| `src/unicode/emoji.ts`          | star | -     |
| `src/unicode/text_index.ts`     | star | -     |
| `src/unicode/confusables.ts`    | star | -     |
| `src/unicode/controls.ts`       | star | -     |
| `src/unicode/hyphenation.ts`    | star | -     |
| `src/unicode/line_break.ts`     | star | -     |
| `src/unicode/source_display.ts` | star | -     |

_No direct exported symbols._

### src/unicode/source_display.ts

_Entrypoints: `.`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `analyzeSourceLine`      | function  | no        | yes   |
| `renderSourceLineSafely` | function  | no        | yes   |
| `SourceAtom`             | interface | yes       | yes   |
| `SourceDisplayFinding`   | interface | yes       | yes   |
| `tokenizeSourceLine`     | function  | no        | yes   |

### src/unicode/text_index.ts

_Entrypoints: `.`_

| Symbol                         | Kind      | Type Only | JSDoc |
| ------------------------------ | --------- | --------- | ----- |
| `createUnicodeTextIndex`       | function  | no        | yes   |
| `UNICODE_TEXT_INDEX_MAX_UTF16` | const     | no        | yes   |
| `UnicodeTextIndex`             | class     | no        | yes   |
| `UnicodeTextPosition`          | interface | yes       | yes   |
| `UnicodeTextResolution`        | type      | yes       | yes   |
| `UnicodeTextUnit`              | type      | yes       | yes   |

### src/unicode/width.ts

_Entrypoints: `.`, `./web`, `./terminal`_

| Symbol                                    | Kind      | Type Only | JSDoc |
| ----------------------------------------- | --------- | --------- | ----- |
| `CJK_WIDE_WIDTH_PROFILE`                  | const     | no        | yes   |
| `DEFAULT_TERMINAL_WIDTH_PROFILE_REGISTRY` | const     | no        | yes   |
| `EastAsianWidthProperty`                  | type      | yes       | yes   |
| `TERMINAL_WIDTH_PROFILE_LIMITS`           | const     | no        | yes   |
| `TerminalCellWidth`                       | type      | yes       | yes   |
| `terminalCodePointWidth`                  | function  | no        | yes   |
| `TerminalCodePointWidthInspection`        | interface | yes       | yes   |
| `terminalTextWidth`                       | function  | no        | yes   |
| `TerminalTextWidthInspection`             | interface | yes       | yes   |
| `TerminalWidthCategory`                   | type      | yes       | yes   |
| `TerminalWidthError`                      | class     | no        | yes   |
| `TerminalWidthErrorCode`                  | type      | yes       | yes   |
| `TerminalWidthPolicy`                     | interface | yes       | yes   |
| `TerminalWidthProfileDefinition`          | interface | yes       | yes   |
| `TerminalWidthProfileInspection`          | interface | yes       | yes   |
| `TerminalWidthProfileRegistry`            | class     | no        | yes   |
| `TerminalWidthProfileRegistryInspection`  | interface | yes       | yes   |
| `TerminalWidthProfileRegistryOptions`     | interface | yes       | yes   |
| `UNICODE_NARROW_WIDTH_PROFILE`            | const     | no        | yes   |
| `UnicodeTerminalWidthProfile`             | class     | no        | yes   |
| `VISIBLE_COMBINING_WIDTH_PROFILE`         | const     | no        | yes   |

### src/utils/ansi_codes.ts

_Entrypoints: `.`_

| Symbol                    | Kind     | Type Only | JSDoc |
| ------------------------- | -------- | --------- | ----- |
| `CLEAR_SCREEN`            | const    | no        | yes   |
| `DISABLE_BRACKETED_PASTE` | const    | no        | yes   |
| `DISABLE_FOCUS_EVENTS`    | const    | no        | yes   |
| `DISABLE_MOUSE`           | const    | no        | yes   |
| `ENABLE_BRACKETED_PASTE`  | const    | no        | yes   |
| `ENABLE_FOCUS_EVENTS`     | const    | no        | yes   |
| `ENABLE_MOUSE`            | const    | no        | yes   |
| `HIDE_CURSOR`             | const    | no        | yes   |
| `moveCursor`              | function | no        | yes   |
| `SHOW_CURSOR`             | const    | no        | yes   |
| `USE_PRIMARY_BUFFER`      | const    | no        | yes   |
| `USE_SECONDARY_BUFFER`    | const    | no        | yes   |

### src/utils/async.ts

_Entrypoints: `.`, `./web`_

| Symbol  | Kind     | Type Only | JSDoc |
| ------- | -------- | --------- | ----- |
| `sleep` | function | no        | yes   |

### src/utils/component.ts

_Entrypoints: `.`_

| Symbol                               | Kind     | Type Only | JSDoc |
| ------------------------------------ | -------- | --------- | ----- |
| `getComponentClosestToTopLeftCorner` | function | no        | yes   |
| `isInteractable`                     | function | no        | yes   |

### src/utils/mod.ts

_Entrypoints: `.`_

| Re-export Target            | Kind | Names |
| --------------------------- | ---- | ----- |
| `src/utils/ansi_codes.ts`   | star | -     |
| `src/utils/async.ts`        | star | -     |
| `src/utils/numbers.ts`      | star | -     |
| `src/utils/sorted_array.ts` | star | -     |
| `src/utils/strings.ts`      | star | -     |
| `src/utils/component.ts`    | star | -     |
| `src/utils/signals.ts`      | star | -     |

_No direct exported symbols._

### src/utils/numbers.ts

_Entrypoints: `.`, `./web`_

| Symbol                  | Kind     | Type Only | JSDoc |
| ----------------------- | -------- | --------- | ----- |
| `clamp`                 | function | no        | yes   |
| `fits`                  | function | no        | yes   |
| `fitsInRectangle`       | function | no        | yes   |
| `normalize`             | function | no        | yes   |
| `rectangleEquals`       | function | no        | yes   |
| `rectangleIntersection` | function | no        | yes   |

### src/utils/signals.ts

_Entrypoints: `.`_

| Symbol      | Kind     | Type Only | JSDoc |
| ----------- | -------- | --------- | ----- |
| `signalify` | function | no        | yes   |

### src/utils/sorted_array.ts

_Entrypoints: `.`, `./web`_

| Symbol        | Kind  | Type Only | JSDoc |
| ------------- | ----- | --------- | ----- |
| `CompareFn`   | type  | yes       | yes   |
| `SortedArray` | class | no        | yes   |

### src/utils/strings.ts

_Entrypoints: `.`, `./web`_

| Symbol                        | Kind     | Type Only | JSDoc |
| ----------------------------- | -------- | --------- | ----- |
| `capitalize`                  | function | no        | yes   |
| `characterWidth`              | function | no        | yes   |
| `cropToWidth`                 | function | no        | yes   |
| `getMultiCodePointCharacters` | function | no        | yes   |
| `insertAt`                    | function | no        | yes   |
| `isFinalAnsiByte`             | function | no        | yes   |
| `stripStyles`                 | function | no        | yes   |
| `textWidth`                   | function | no        | yes   |
| `UNICODE_CHAR_REGEXP`         | const    | no        | yes   |

### src/view.ts

_Entrypoints: `.`, `./web`_

| Symbol | Kind  | Type Only | JSDoc |
| ------ | ----- | --------- | ----- |
| `View` | class | no        | yes   |

### src/viewport.ts

_Entrypoints: `.`, `./web`_

| Symbol                        | Kind      | Type Only | JSDoc |
| ----------------------------- | --------- | --------- | ----- |
| `clampViewportOffset`         | function  | no        | yes   |
| `inspectViewport`             | function  | no        | yes   |
| `inspectViewportAxisOverflow` | function  | no        | yes   |
| `inspectViewportOverflow`     | function  | no        | yes   |
| `maxViewportOffset`           | function  | no        | yes   |
| `ViewportAxisOverflow`        | interface | yes       | yes   |
| `ViewportAxisOverflowOptions` | interface | yes       | yes   |
| `ViewportInspection`          | interface | yes       | yes   |
| `viewportOffsetBy`            | function  | no        | yes   |
| `viewportOffsetForPointer`    | function  | no        | yes   |
| `ViewportOverflowInspection`  | interface | yes       | yes   |
| `ViewportOverflowMode`        | type      | yes       | yes   |
| `ViewportOverflowOptions`     | interface | yes       | yes   |
| `viewportThumb`               | function  | no        | yes   |
| `ViewportThumb`               | interface | yes       | yes   |
| `viewportThumbGlyph`          | function  | no        | yes   |
| `viewportWindow`              | function  | no        | yes   |
| `ViewportWindow`              | interface | yes       | yes   |

### src/visual/annotations.ts

_Entrypoints: `.`_

| Symbol                    | Kind      | Type Only | JSDoc |
| ------------------------- | --------- | --------- | ----- |
| `AnnotationLayoutOptions` | interface | yes       | yes   |
| `ChartAnnotation`         | type      | yes       | yes   |
| `layoutAnnotations`       | function  | no        | yes   |
| `PlacedAnnotation`        | interface | yes       | yes   |

### src/visual/axes.ts

_Entrypoints: `.`_

| Symbol        | Kind      | Type Only | JSDoc |
| ------------- | --------- | --------- | ----- |
| `AxisLayout`  | interface | yes       | yes   |
| `AxisOptions` | interface | yes       | yes   |
| `AxisTick`    | interface | yes       | yes   |
| `buildAxis`   | function  | no        | yes   |

### src/visual/chart_export.ts

_Entrypoints: `.`_

| Symbol                   | Kind      | Type Only | JSDoc |
| ------------------------ | --------- | --------- | ----- |
| `buildChartSnapshot`     | function  | no        | yes   |
| `ChartSnapshot`          | interface | yes       | yes   |
| `exportChartCells`       | function  | no        | yes   |
| `exportChartData`        | function  | no        | yes   |
| `exportChartDescription` | function  | no        | yes   |
| `exportChartSvg`         | function  | no        | yes   |
| `SnapshotSeries`         | interface | yes       | yes   |

### src/visual/downsample.ts

_Entrypoints: `.`, `./viz`_

| Symbol                       | Kind      | Type Only | JSDoc |
| ---------------------------- | --------- | --------- | ----- |
| `createStreamingDownsampler` | function  | no        | yes   |
| `DataPoint`                  | interface | yes       | yes   |
| `lttbDownsample`             | function  | no        | yes   |
| `minMaxDownsample`           | function  | no        | yes   |
| `resampleToWidth`            | function  | no        | yes   |
| `StreamingDownsampler`       | class     | no        | yes   |

### src/visual/heatmap.ts

_Entrypoints: `.`_

| Symbol               | Kind      | Type Only | JSDoc |
| -------------------- | --------- | --------- | ----- |
| `HeatmapCell`        | interface | yes       | yes   |
| `HeatmapLegendEntry` | interface | yes       | yes   |
| `HeatmapOptions`     | interface | yes       | yes   |
| `HeatmapRender`      | interface | yes       | yes   |
| `HeatmapTarget`      | type      | yes       | yes   |
| `renderHeatmap`      | function  | no        | yes   |

### src/visual/interactions.ts

_Entrypoints: `.`_

| Symbol                             | Kind      | Type Only | JSDoc |
| ---------------------------------- | --------- | --------- | ----- |
| `BrushSelection`                   | interface | yes       | yes   |
| `ChartInteractionController`       | class     | no        | yes   |
| `ChartInteractionOptions`          | interface | yes       | yes   |
| `createChartInteractionController` | function  | no        | yes   |
| `CrosshairState`                   | interface | yes       | yes   |

### src/visual/linked_charts.ts

_Entrypoints: `.`_

| Symbol                 | Kind      | Type Only | JSDoc |
| ---------------------- | --------- | --------- | ----- |
| `ChartLinkGroup`       | class     | no        | yes   |
| `createChartLinkGroup` | function  | no        | yes   |
| `LinkedChartState`     | interface | yes       | yes   |
| `LinkUpdate`           | interface | yes       | yes   |

### src/visual/marks.ts

_Entrypoints: `.`_

| Symbol               | Kind      | Type Only | JSDoc |
| -------------------- | --------- | --------- | ----- |
| `createMarkCanvas`   | function  | no        | yes   |
| `GlyphCapabilities`  | interface | yes       | yes   |
| `MarkBackend`        | type      | yes       | yes   |
| `MarkCanvas`         | class     | no        | yes   |
| `markGeometry`       | function  | no        | yes   |
| `MarkRender`         | interface | yes       | yes   |
| `resolveMarkBackend` | function  | no        | yes   |

### src/visual/mod.ts

_Entrypoints: `.`_

| Re-export Target              | Kind | Names |
| ----------------------------- | ---- | ----- |
| `src/visual/annotations.ts`   | star | -     |
| `src/visual/chart_export.ts`  | star | -     |
| `src/visual/axes.ts`          | star | -     |
| `src/visual/downsample.ts`    | star | -     |
| `src/visual/heatmap.ts`       | star | -     |
| `src/visual/interactions.ts`  | star | -     |
| `src/visual/linked_charts.ts` | star | -     |
| `src/visual/marks.ts`         | star | -     |
| `src/visual/raster.ts`        | star | -     |
| `src/visual/scales.ts`        | star | -     |
| `src/visual/series.ts`        | star | -     |

_No direct exported symbols._

### src/visual/raster.ts

_Entrypoints: `.`_

| Symbol          | Kind      | Type Only | JSDoc |
| --------------- | --------- | --------- | ----- |
| `CellPoint`     | interface | yes       | yes   |
| `polylineCells` | function  | no        | yes   |
| `segmentCells`  | function  | no        | yes   |

### src/visual/scales.ts

_Entrypoints: `.`_

| Symbol            | Kind      | Type Only | JSDoc |
| ----------------- | --------- | --------- | ----- |
| `Band`            | interface | yes       | yes   |
| `bandScale`       | function  | no        | yes   |
| `BandScale`       | interface | yes       | yes   |
| `ContinuousScale` | interface | yes       | yes   |
| `linearScale`     | function  | no        | yes   |
| `logScale`        | function  | no        | yes   |
| `ordinalScale`    | function  | no        | yes   |
| `OrdinalScale`    | interface | yes       | yes   |
| `symlogScale`     | function  | no        | yes   |
| `timeScale`       | function  | no        | yes   |
| `toCell`          | function  | no        | yes   |

### src/visual/series.ts

_Entrypoints: `.`_

| Symbol                | Kind      | Type Only | JSDoc |
| --------------------- | --------- | --------- | ----- |
| `renderSeries`        | function  | no        | yes   |
| `renderStackedArea`   | function  | no        | yes   |
| `SeriesKind`          | type      | yes       | yes   |
| `SeriesPoint`         | interface | yes       | yes   |
| `SeriesRenderOptions` | interface | yes       | yes   |

### src/viz/axes.ts

_Entrypoints: `./viz`_

| Symbol              | Kind      | Type Only | JSDoc |
| ------------------- | --------- | --------- | ----- |
| `drawLegend`        | function  | no        | yes   |
| `drawTimeAxis`      | function  | no        | yes   |
| `drawValueAxis`     | function  | no        | yes   |
| `LegendEntry`       | interface | yes       | no    |
| `TimeAxisOptions`   | interface | yes       | no    |
| `valueAxisGridRows` | function  | no        | yes   |
| `ValueAxisOptions`  | interface | yes       | no    |
| `valueAxisWidth`    | function  | no        | yes   |

### src/viz/dashboard.ts

_Entrypoints: `./viz`_

| Symbol              | Kind      | Type Only | JSDoc |
| ------------------- | --------- | --------- | ----- |
| `blitFrame`         | function  | no        | yes   |
| `drawTileFrame`     | function  | no        | yes   |
| `drawTileLabel`     | function  | no        | yes   |
| `screenFrame`       | function  | no        | yes   |
| `TileChromeOptions` | interface | yes       | no    |
| `TileLabelOptions`  | interface | yes       | no    |

### src/viz/data.ts

_Entrypoints: `./viz`_

| Symbol         | Kind      | Type Only | JSDoc |
| -------------- | --------- | --------- | ----- |
| `acceptedKind` | function  | no        | yes   |
| `DATA_KINDS`   | const     | no        | no    |
| `DataKind`     | type      | yes       | yes   |
| `DataRank`     | type      | yes       | yes   |
| `extentOf`     | function  | no        | yes   |
| `isTemporal`   | function  | no        | yes   |
| `kindFor`      | function  | no        | yes   |
| `Matrix`       | type      | yes       | yes   |
| `rankOf`       | function  | no        | yes   |
| `rankOfValue`  | function  | no        | yes   |
| `Reading`      | type      | yes       | yes   |
| `Sample`       | interface | yes       | yes   |
| `satisfies`    | function  | no        | yes   |
| `Scalar`       | type      | yes       | yes   |
| `shapeOf`      | function  | no        | yes   |
| `Vector`       | type      | yes       | yes   |
| `Volume`       | type      | yes       | yes   |

### src/viz/draw.ts

_Entrypoints: `./viz`_

| Symbol        | Kind      | Type Only | JSDoc |
| ------------- | --------- | --------- | ----- |
| `ArcOptions`  | interface | yes       | no    |
| `AUTO_GLYPH`  | const     | no        | yes   |
| `DotPainter`  | class     | no        | yes   |
| `drawArc`     | function  | no        | yes   |
| `drawEllipse` | function  | no        | yes   |
| `drawLine`    | function  | no        | yes   |
| `drawPath`    | function  | no        | yes   |
| `drawRect`    | function  | no        | yes   |
| `DrawStyle`   | interface | yes       | no    |
| `fillRect`    | function  | no        | yes   |
| `lineGlyph`   | function  | no        | yes   |
| `plot`        | function  | no        | yes   |

### src/viz/fit.ts

_Entrypoints: `./viz`_

| Symbol         | Kind      | Type Only | JSDoc |
| -------------- | --------- | --------- | ----- |
| `entriesOf`    | function  | no        | yes   |
| `rankFits`     | function  | no        | yes   |
| `scoreFit`     | function  | no        | yes   |
| `VizDataShape` | interface | yes       | yes   |
| `VizFit`       | interface | yes       | yes   |

### src/viz/mod.ts

_Entrypoints: `./viz`_

| Re-export Target               | Kind | Names |
| ------------------------------ | ---- | ----- |
| `src/viz/data.ts`              | star | -     |
| `src/viz/stream.ts`            | star | -     |
| `src/viz/scale.ts`             | star | -     |
| `src/viz/theme.ts`             | star | -     |
| `src/viz/render.ts`            | star | -     |
| `src/viz/renderers_scalar.ts`  | star | -     |
| `src/viz/renderers_vector.ts`  | star | -     |
| `src/viz/renderers_matrix.ts`  | star | -     |
| `src/viz/fit.ts`               | star | -     |
| `src/viz/registry.ts`          | star | -     |
| `src/viz/axes.ts`              | star | -     |
| `src/viz/draw.ts`              | star | -     |
| `src/viz/project.ts`           | star | -     |
| `src/viz/renderers_spatial.ts` | star | -     |
| `src/viz/tiles.ts`             | star | -     |
| `src/viz/dashboard.ts`         | star | -     |
| `src/viz/view.ts`              | star | -     |

_No direct exported symbols._

### src/viz/project.ts

_Entrypoints: `./viz`_

| Symbol          | Kind      | Type Only | JSDoc |
| --------------- | --------- | --------- | ----- |
| `camera`        | function  | no        | yes   |
| `Camera`        | interface | yes       | no    |
| `CameraOptions` | interface | yes       | no    |
| `depthFade`     | function  | no        | yes   |
| `Point3`        | interface | yes       | no    |
| `Projected`     | interface | yes       | no    |
| `toUnit`        | function  | no        | yes   |

### src/viz/registry.ts

_Entrypoints: `./viz`_

| Symbol              | Kind     | Type Only | JSDoc |
| ------------------- | -------- | --------- | ----- |
| `bestVisualization` | function | no        | yes   |
| `drawStream`        | function | no        | yes   |
| `fitVisualizations` | function | no        | yes   |
| `visualizationById` | function | no        | no    |
| `VISUALIZATIONS`    | const    | no        | yes   |
| `visualizationsFor` | function | no        | yes   |

### src/viz/render.ts

_Entrypoints: `./viz`_

| Symbol          | Kind      | Type Only | JSDoc |
| --------------- | --------- | --------- | ----- |
| `blankFrame`    | function  | no        | yes   |
| `fits`          | function  | no        | yes   |
| `frameToText`   | function  | no        | yes   |
| `groundless`    | function  | no        | yes   |
| `Visualization` | interface | yes       | yes   |
| `VizCell`       | interface | yes       | no    |
| `VizContext`    | interface | yes       | yes   |
| `VizFrame`      | type      | yes       | yes   |
| `VizSize`       | interface | yes       | no    |
| `writeText`     | function  | no        | yes   |

### src/viz/renderers_matrix.ts

_Entrypoints: `./viz`_

| Symbol                  | Kind  | Type Only | JSDoc |
| ----------------------- | ----- | --------- | ----- |
| `heatmap`               | const | no        | yes   |
| `lattice`               | const | no        | yes   |
| `MATRIX_VISUALIZATIONS` | const | no        | no    |
| `overlay`               | const | no        | yes   |
| `scatter`               | const | no        | yes   |
| `volumeProjection`      | const | no        | yes   |

### src/viz/renderers_scalar.ts

_Entrypoints: `./viz`_

| Symbol                  | Kind  | Type Only | JSDoc |
| ----------------------- | ----- | --------- | ----- |
| `area`                  | const | no        | yes   |
| `dial`                  | const | no        | yes   |
| `meter`                 | const | no        | yes   |
| `odometer`              | const | no        | yes   |
| `psychograph`           | const | no        | yes   |
| `PsychographInput`      | type  | yes       | yes   |
| `readout`               | const | no        | yes   |
| `SCALAR_VISUALIZATIONS` | const | no        | yes   |
| `sparkline`             | const | no        | yes   |
| `strip`                 | const | no        | yes   |

### src/viz/renderers_spatial.ts

_Entrypoints: `./viz`_

| Symbol                   | Kind  | Type Only | JSDoc |
| ------------------------ | ----- | --------- | ----- |
| `pointCloud`             | const | no        | yes   |
| `ringVolume`             | const | no        | yes   |
| `SPATIAL_VISUALIZATIONS` | const | no        | yes   |
| `surface`                | const | no        | yes   |
| `vectorField`            | const | no        | yes   |

### src/viz/renderers_vector.ts

_Entrypoints: `./viz`_

| Symbol                  | Kind  | Type Only | JSDoc |
| ----------------------- | ----- | --------- | ----- |
| `bars`                  | const | no        | yes   |
| `hexgrid`               | const | no        | yes   |
| `rack`                  | const | no        | yes   |
| `scope`                 | const | no        | yes   |
| `statusGrid`            | const | no        | yes   |
| `VECTOR_VISUALIZATIONS` | const | no        | no    |
| `waterfall`             | const | no        | yes   |

### src/viz/scale.ts

_Entrypoints: `./viz`_

| Re-export Target           | Kind  | Names             |
| -------------------------- | ----- | ----------------- |
| `src/visual/downsample.ts` | named | `resampleToWidth` |

| Symbol           | Kind      | Type Only | JSDoc |
| ---------------- | --------- | --------- | ----- |
| `baselineDomain` | function  | no        | yes   |
| `Domain`         | interface | yes       | no    |
| `domainOf`       | function  | no        | yes   |
| `domainOfAll`    | function  | no        | yes   |
| `normalize`      | function  | no        | yes   |
| `safeDomain`     | function  | no        | yes   |
| `TrackingDomain` | class     | no        | yes   |

### src/viz/stream.ts

_Entrypoints: `./viz`_

| Symbol              | Kind      | Type Only | JSDoc |
| ------------------- | --------- | --------- | ----- |
| `DataStream`        | class     | no        | yes   |
| `DataStreamOptions` | interface | yes       | no    |
| `DEFAULT_CAPACITY`  | const     | no        | yes   |
| `matrixStream`      | function  | no        | yes   |
| `scalarStream`      | function  | no        | yes   |
| `vectorStream`      | function  | no        | yes   |
| `volumeStream`      | function  | no        | yes   |

### src/viz/theme.ts

_Entrypoints: `./viz`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `defaultVisualizationTheme` | function  | no        | yes   |
| `mixColor`                  | function  | no        | yes   |
| `rampColor`                 | function  | no        | yes   |
| `rampGradient`              | function  | no        | yes   |
| `resolveVisualizationTheme` | function  | no        | yes   |
| `VisualizationTheme`        | interface | yes       | yes   |

### src/viz/three/mod.ts

_Entrypoints: `./viz/three`_

| Re-export Target          | Kind | Names |
| ------------------------- | ---- | ----- |
| `src/viz/three/scene.ts`  | star | -     |
| `src/viz/three/scenes.ts` | star | -     |

_No direct exported symbols._

### src/viz/three/scene.ts

_Entrypoints: `./viz/three`_

| Symbol              | Kind      | Type Only | JSDoc |
| ------------------- | --------- | --------- | ----- |
| `DATA_SCENES`       | const     | no        | yes   |
| `DataScene`         | interface | yes       | yes   |
| `dataSceneById`     | function  | no        | no    |
| `DataSceneContext`  | interface | yes       | yes   |
| `DataSceneInstance` | interface | yes       | yes   |
| `fitDataScenes`     | function  | no        | yes   |
| `themeColor`        | function  | no        | yes   |

### src/viz/three/scenes.ts

_Entrypoints: `./viz/three`_

| Symbol         | Kind  | Type Only | JSDoc |
| -------------- | ----- | --------- | ----- |
| `latticeScene` | const | no        | yes   |
| `ringScene`    | const | no        | yes   |
| `surfaceScene` | const | no        | yes   |

### src/viz/tiles.ts

_Entrypoints: `./viz`_

| Symbol             | Kind      | Type Only | JSDoc |
| ------------------ | --------- | --------- | ----- |
| `chartRectFor`     | function  | no        | yes   |
| `gridFor`          | function  | no        | yes   |
| `isFramed`         | function  | no        | yes   |
| `MIN_TILE_HEIGHT`  | const     | no        | no    |
| `MIN_TILE_WIDTH`   | const     | no        | yes   |
| `MINIMUM_CROWDING` | const     | no        | yes   |
| `placeTiles`       | function  | no        | yes   |
| `planTiles`        | function  | no        | yes   |
| `PlanTilesOptions` | interface | yes       | no    |
| `TileGrid`         | interface | yes       | no    |
| `TileLayout`       | interface | yes       | no    |
| `TileSource`       | interface | yes       | yes   |
| `VizTile`          | interface | yes       | no    |

### src/viz/view.ts

_Entrypoints: `./viz`_

| Symbol                     | Kind      | Type Only | JSDoc |
| -------------------------- | --------- | --------- | ----- |
| `framesToRuns`             | function  | no        | yes   |
| `VisualizationView`        | class     | no        | no    |
| `VisualizationViewOptions` | interface | yes       | no    |
| `VizRun`                   | interface | yes       | yes   |

### src/web/cell_canvas_sink.ts

_Entrypoints: `./web`_

| Symbol                            | Kind      | Type Only | JSDoc |
| --------------------------------- | --------- | --------- | ----- |
| `BrowserCellCanvasSink`           | class     | no        | yes   |
| `BrowserCellCanvasSinkInspection` | interface | yes       | yes   |
| `BrowserCellCanvasSinkOptions`    | interface | yes       | yes   |
| `parseAnsiCell`                   | function  | no        | yes   |
| `ParsedAnsiCell`                  | interface | yes       | yes   |

### src/web/dom_renderer.ts

_Entrypoints: `./web`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `applyCssVariables`         | function  | no        | yes   |
| `DomNodeStyle`              | type      | yes       | yes   |
| `DomRenderNode`             | interface | yes       | yes   |
| `DomRenderTarget`           | class     | no        | yes   |
| `DomRenderTargetInspection` | interface | yes       | yes   |
| `renderDomNodeToHtml`       | function  | no        | yes   |
| `themeTokensToCssVariables` | function  | no        | yes   |

### src/web/host.ts

_Entrypoints: `./web`_

| Symbol                 | Kind      | Type Only | JSDoc |
| ---------------------- | --------- | --------- | ----- |
| `createWebTui`         | function  | no        | yes   |
| `WebTuiHost`           | class     | no        | yes   |
| `WebTuiHostEvents`     | type      | yes       | yes   |
| `WebTuiHostInspection` | interface | yes       | yes   |
| `WebTuiHostOptions`    | interface | yes       | yes   |

### src/web/mod.ts

_Entrypoints: `./web`_

| Re-export Target              | Kind | Names |
| ----------------------------- | ---- | ----- |
| `src/web/cell_canvas_sink.ts` | star | -     |
| `src/web/dom_renderer.ts`     | star | -     |
| `src/web/host.ts`             | star | -     |
| `src/web/platform.ts`         | star | -     |
| `src/web/remote_terminal.ts`  | star | -     |
| `src/web/web_presenter.ts`    | star | -     |

_No direct exported symbols._

### src/web/platform.ts

_Entrypoints: `./web`_

| Symbol                      | Kind      | Type Only | JSDoc |
| --------------------------- | --------- | --------- | ----- |
| `BrowserFrameScheduler`     | interface | yes       | yes   |
| `BrowserInputSource`        | class     | no        | yes   |
| `BrowserInputSourceOptions` | interface | yes       | yes   |
| `BrowserPlatform`           | class     | no        | yes   |
| `BrowserPlatformOptions`    | interface | yes       | yes   |
| `BrowserTextInputMode`      | type      | yes       | yes   |
| `createBrowserPlatform`     | function  | no        | yes   |

### src/web/remote_terminal.ts

_Entrypoints: `./web`, `./remote`_

| Symbol                                          | Kind      | Type Only | JSDoc |
| ----------------------------------------------- | --------- | --------- | ----- |
| `createNegotiatedRemoteTerminalBridge`          | function  | no        | yes   |
| `createNegotiatedRemoteTerminalClient`          | function  | no        | yes   |
| `createRemoteTerminalBridge`                    | function  | no        | yes   |
| `createRemoteTerminalClient`                    | function  | no        | yes   |
| `createWebSocketNegotiatedRemoteTerminalClient` | function  | no        | yes   |
| `createWebSocketRemoteTerminalClient`           | function  | no        | yes   |
| `decodeRemoteTerminalClientMessage`             | function  | no        | yes   |
| `decodeRemoteTerminalServerMessage`             | function  | no        | yes   |
| `DEFAULT_REMOTE_TERMINAL_CAPABILITY_MANIFEST`   | const     | no        | yes   |
| `encodeRemoteTerminalInput`                     | function  | no        | yes   |
| `encodeRemoteTerminalMessage`                   | function  | no        | yes   |
| `encodeRemoteTerminalServerMessage`             | function  | no        | yes   |
| `NegotiatedRemoteTerminalBridge`                | class     | no        | yes   |
| `NegotiatedRemoteTerminalBridgeInspection`      | interface | yes       | yes   |
| `NegotiatedRemoteTerminalBridgeOptions`         | interface | yes       | yes   |
| `NegotiatedRemoteTerminalClient`                | class     | no        | yes   |
| `NegotiatedRemoteTerminalClientEvents`          | type      | yes       | yes   |
| `NegotiatedRemoteTerminalClientInspection`      | interface | yes       | yes   |
| `REMOTE_TERMINAL_CAPABILITIES`                  | const     | no        | yes   |
| `RemoteTerminalBridge`                          | class     | no        | yes   |
| `RemoteTerminalBridgeInspection`                | interface | yes       | yes   |
| `RemoteTerminalBridgeOptions`                   | interface | yes       | yes   |
| `RemoteTerminalClient`                          | class     | no        | yes   |
| `RemoteTerminalClientEvents`                    | type      | yes       | yes   |
| `RemoteTerminalClientInspection`                | interface | yes       | yes   |
| `RemoteTerminalClientMessage`                   | type      | yes       | yes   |
| `RemoteTerminalInputEvent`                      | type      | yes       | yes   |
| `RemoteTerminalNegotiationError`                | class     | no        | yes   |
| `RemoteTerminalNegotiationErrorCode`            | type      | yes       | yes   |
| `RemoteTerminalNegotiationOptions`              | interface | yes       | yes   |
| `RemoteTerminalServerMessage`                   | type      | yes       | yes   |
| `RemoteTerminalTransport`                       | interface | yes       | yes   |
| `WebSocketRemoteTerminalTransport`              | class     | no        | yes   |

### src/web/web_presenter.ts

_Entrypoints: `./web`_

| Symbol                | Kind      | Type Only | JSDoc |
| --------------------- | --------- | --------- | ----- |
| `runWebShellApp`      | function  | no        | yes   |
| `webPresenter`        | function  | no        | yes   |
| `WebPresenterOptions` | interface | yes       | yes   |
| `WebShellPresenter`   | interface | yes       | yes   |
