# Production Demo Application Showcase Program

Status: **on hiatus as of Aug 14 2026** (user decision) — parked until the widget-sync program (031) has landed the
components these showcases would build on. Previously: implementation in progress, specified July 17 and updated July
18, 2026. This roadmap turns the ten approved
demo concepts into credible applications that exercise the library as a system instead of presenting isolated widget
toys. It is a companion to [036-textual-opentui-feature-parity.md](../036-textual-opentui-feature-parity.md) and
[037-world-class-tui-features.md](../037-world-class-tui-features.md); it does not silently mark open work in either
roadmap as complete.

## Scope And Evidence Rules

The live repository, ICC architecture memory, current public barrels, 39-entry component catalog, workbench examples,
and the 023/024 roadmap state were inspected before this plan was written. Every feature below uses one of these labels:

- **Core** — a current public library capability can carry the feature.
- **Compose** — current primitives are sufficient, but the showcase must provide domain logic or a reusable adapter.
- **Host** — an explicitly permissioned operating-system, browser, device, protocol, or service integration is needed.
- **Gap** — the polished experience depends on unfinished roadmap work or a new core capability. The closest roadmap ID
  is named when one exists.

These labels are product boundaries, not priorities. A host adapter is not automatically a library defect, and a
fixture-backed showcase must never claim to be live merely because its UI is convincing.

A production-shaped showcase must have all of the following:

- one coherent end-to-end job with meaningful state, not a gallery of disconnected controls;
- deterministic offline fixtures, plus optional live providers where the host can grant the required permissions;
- cancellable loading and background work, bounded queues, useful empty/error/recovery states, and visible diagnostics;
- persistent settings, durable workspace restoration, versioned snapshots, and undo/redo where the action is genuinely
  reversible;
- keyboard-first operation, pointer parity, compact-terminal behavior, responsive resize behavior, and no workflow that
  relies on color alone;
- terminal and browser coverage when the underlying capability exists in both hosts, with an explicit capability screen
  for unavailable features;
- a scripted hero scenario, controller tests, terminal snapshots, provider fault tests, and a representative performance
  fixture;
- least-privilege manifests, redaction at persistence/log/history boundaries, and no hidden telemetry, credential
  capture, or access to resources the user did not select.

## Verified Library Surface To Showcase

| Domain               | Current public building blocks                                                                                                                                                             | Primary showcases                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Application shell    | `TuiApp`, `ActionBus`, `CommandRegistry`, command search/bindings, menus, palette, key help                                                                                                | All ten                                                   |
| Navigation/lifecycle | `RouteManager`, compiled route patterns, `ScreenStack`, router-mode binding, typed modals, screen persistence                                                                              | Pathfinder, QueryFoundry, Inkstone, DungeonOS             |
| Windows/overlays     | `TiledWorkspaceController`, `WindowManagerController`, `MarkupWindowController`, `WorkbenchWindowHostController`, window history, shared chrome/shelf/switcher, split panes, overlay stack | NeonAmp, Pathfinder, Orbital Command, FlowPlant, Inkstone |
| Authored layout      | solver-neutral styles, Block/Flex/Grid, responsive recipes, HTML-like markup, CSS parsing, widget hydration                                                                                | NeonAmp, QueryFoundry, Inkstone, all compact layouts      |
| Input/focus          | canonical input envelopes, layered keymaps, leader/chord sequences, focus scopes, selection, mouse/touch/pen normalization, pointer capture                                                | GlyphForge, FlowPlant, DungeonOS, all ten                 |
| Forms/history        | nested form paths, stable field arrays, validation, settings bindings, transactional history, compensation, action journal/checkpoints                                                     | NeonAmp, Pathfinder, QueryFoundry, FlowPlant              |
| Data/resources       | query controllers, table bindings, latest/cached pipelines, async resources, shared cache/load coordination                                                                                | Pathfinder, PacketGlass, QueryFoundry, Orbital Command    |
| Concurrency/streams  | `TaskGroup`, deadlines, schedulers, workers, bounded `AsyncChannel`, AsyncIterable operators                                                                                               | PacketGlass, MetroOps, Orbital Command, FlowPlant         |
| Persistence          | memory/JSON/IndexedDB stores, `PersistentSignal`, versioned screen and workspace snapshots                                                                                                 | All ten                                                   |
| Rendering/graphics   | Canvas objects, dirty regions, spatial index, `GraphicsSurface`, Kitty graphics, `ThreeAscii`, renderer profiles/backends                                                                  | GlyphForge, Orbital Command, DungeonOS, NeonAmp           |
| Terminal/processes   | PTY/backend registry, process sessions, terminal screen/scrollback/services/workspaces                                                                                                     | Pathfinder, QueryFoundry, FlowPlant                       |
| Themes               | theme engine/provider/registry, palettes, layers, manifests, gallery/resolver/workspace, theme bindings                                                                                    | NeonAmp, GlyphForge, Inkstone, DungeonOS                  |
| Extension/security   | app plugins, typed UI slots/adapters, permission manifests, `Secret`, structured redaction                                                                                                 | QueryFoundry, FlowPlant, PacketGlass, NeonAmp             |
| Remote/web           | browser hosts/renderers, negotiated remote terminal bridge, WebSocket transport                                                                                                            | Orbital Command, MetroOps, DungeonOS, all read-only views |
| Verification         | `TerminalAppPilot`, synthetic input, virtual clocks, snapshots, diagnostics, workload registry, benchmarks                                                                                 | All ten                                                   |

Important truth-in-advertising boundaries:

- the window stack supports tiled workspaces, docking, split resizing, minimize/maximize, ordering, persistence, undo,
  durable floating geometry, eight-edge resize, snap targets, groups, focus tiers, bounds recovery, snapshot migration,
  and one-gesture history. `WorkbenchWindowHostController` now composes that state into shared chrome, titlebar/edge and
  separator gestures, a shelf, task switcher, snap preview, semantics, and terminal/browser-neutral input adapters;
  Inkstone is the first production-shaped terminal adopter. `WindowManagerController.move()` intentionally remains
  traversal-order movement. A browser-rendered production consumer, accessibility/performance acceptance, and the
  NeonAmp/FlowPlant/Orbital flagship matrix remain open under SHR-006 and SHOW-WIN-001;
- `FileExplorerController` is a path-aware tree controller, not an operating-system filesystem service;
- `RuntimePermissionManifest` describes and reports requirements; it does not grant permissions or perform operations;
- `ProcessSessionController` can supervise a process, but it is not an audio decoder or media engine;
- `Chart` is a compact text bar chart, not the unfinished scientific visualization suite in 024:VIS-001 through VIS-010;
- the renderer backend catalog does not give `ThreeAscii` an equivalent CPU/WebGL scene renderer when WebGPU is absent;
- the experimental Taffy boundary is not a shipped Taffy runtime; Simple Grid and Simple/Yoga Flex capability reports
  remain the honest authoring targets;
- Markdown is public through `mod.app.ts`; richer streaming code/diff/Markdown surfaces in 023:V1 are still open.

## Shared Showcase Platform

These items are built once and reused. They are part of the showcase program, not copied into ten example directories.

- [ ] **SHR-001 (Core/Compose)** Build a `ShowcaseAppShell` that owns the action bus, command registry and search index,
      menu bar, command palette, layered keymaps, focus scopes, route/screen lifecycle, modal stack, toast stack, key
      help, status bar, theme binding, plugin lifecycle, and deterministic disposal.
- [ ] **SHR-002 (Core/Compose)** Define a versioned showcase manifest with identity, routes, default layout, fixture
      packs, provider capabilities, permission requirements, hero scenario, and browser/terminal support metadata.
- [ ] **SHR-003 (Core/Compose)** Add a launcher that can open every application, inspect its requirements, select a
      fixture or live provider, report unavailable capabilities, and return without leaking resources.
- [ ] **SHR-004 (Core/Compose)** Create one persistent workspace service around tiled/markup window snapshots, named
      screen persistence, app settings, safe migrations, reset, export, and corrupt-state recovery.
- [ ] **SHR-005 (Core/Compose)** Standardize tiled window chrome, keyboard layout mode, separator dragging, dock/swap,
      minimize/maximize/restore/close, compact projection, focus restoration, and layout-operation undo/redo. Shared
      host chrome, separator gestures, lifecycle controls, compact projection, focus restoration, and history are
      landed; this broader item remains open for swap/layout-mode adoption and cross-host acceptance.
- [ ] **SHR-006 (Gap: windowing adoption follow-up)** Complete the remaining production browser renderer,
      keyboard/pointer/accessibility and performance acceptance, and flagship adoption for the floating geometry,
      title-bar/edge gestures, snap, groups, z-order/always-on-top policy, bounds recovery, and persistence delivered by
      ADV-WIN-V1. The shared host and Inkstone terminal reference are complete under one workspace state owner.
- [ ] **SHR-007 (Core/Compose)** Ship shared responsive markup/CSS recipes for wide, medium, narrow, and one-pane modes,
      with solver capability diagnostics and terminal/browser rectangle parity.
- [ ] **SHR-008 (Core/Compose)** Define injected provider contracts for fixture/live data, cancellation, health,
      capability inspection, redacted diagnostics, versioning, and disposal. Every live provider must have a
      deterministic synthetic counterpart.
- [ ] **SHR-009 (Core)** Standardize background work on task groups, deadline budgets, bounded channels, schedulers,
      async-iterable operators, resource loads/cache, workers, and visible queue-pressure diagnostics.
- [ ] **SHR-010 (Core/Compose)** Add shared loading, empty, stale, partial, disconnected, permission-denied, retryable,
      terminal-error, and recovery surfaces using `EmptyState`, `Spinner`, progress, modals, logs, and toasts.
- [ ] **SHR-011 (Core/Compose)** Add a capability and permission preflight that aggregates manifests before activating
      filesystem, process, network, graphics, audio, database, or packet-capture providers and explains every fallback.
- [ ] **SHR-012 (Core)** Apply `Secret` and structured redaction to settings, action journal entries, persisted state,
      logs, exports, remote frames, diagnostics, and errors; fixture secrets must be obviously synthetic.
- [ ] **SHR-013 (Core/Compose)** Build a reusable diagnostics window for runtime workloads, channels, tasks, resources,
      cache entries, renderer timings, terminal capabilities, recent errors, copyable redacted reports, and safe
      recovery commands.
- [ ] **SHR-014 (Core/Compose)** Build a shared graphics/preview facade that selects text, ANSI cells, Kitty raster, or
      explicit fallback output by capability instead of coupling showcase code to one host.
- [ ] **SHR-015 (Core/Compose)** Provide theme packs for classic desktop, high contrast, low color, monochrome, and each
      showcase's identity; preserve semantic tokens so changing a skin never destroys status meaning.
- [ ] **SHR-016 (Core/Compose)** Provide typed plugin slots for toolbar actions, inspectors, data sources, exporters,
      renderers, and status items while preserving host fallback UI and isolating contribution failures.
- [ ] **SHR-017 (Core/Compose)** Build common import/export helpers with schemas, version checks, atomic save where the
      provider supports it, preview/dry-run, cancellation, progress, and redacted failure reports.
- [ ] **SHR-018 (Core/Compose)** Create a shared testing kit with synthetic providers, virtual time, stable random
      seeds, fake keyboard/pointer input, resize matrices, snapshot normalization, fault injection, and hero-scenario
      pilots.
- [ ] **SHR-019 (Core/Compose)** Add representative small/large/stress fixture tiers and benchmark budgets for startup,
      interaction latency, resize, memory, frame time, queue pressure, cancellation, and clean shutdown.
- [ ] **SHR-020 (Gap: 023:T3)** Define browser semantics, keyboard-only acceptance, focus announcements, reduced-motion
      behavior, high-contrast checks, and honest terminal accessibility documentation for every shared control.

### Advanced windowing delivery progress

- [x] **ADV-WIN-V1 (Core foundation)** Extend the single renderer-neutral markup workspace owner with latent tiled and
      durable floating placement, finite min/max-constrained rectangles, deterministic focus and normal/always-on-top
      z-order, grouped movement, eight-edge resize, workspace/corner/dock snap, maximize/minimize/restore/close,
      compact-bounds recovery, strict V1-to-V2 snapshots, exact one-entry gesture history, shared-overlay isolation, and
      a content-free runnable demo. The legacy tiled ordering API is unchanged.
- [x] **ADV-WIN-HOST-TERM (Shared host and terminal reference)** Compose the core through one renderer-neutral host with
      titlebar controls, dynamic z-order hit testing, move/resize/separator capture, snap preview, task shelf,
      projection-aware MRU switching, semantic nodes, exact history, normalized terminal/browser pointer adapters, and
      committed-only session persistence. Adopt it in Inkstone with responsive focus parity, row-level pointer targets,
      V1-to-V2 session migration, and terminal acceptance coverage.
- [ ] **SHR-006 / SHOW-WIN-001 adoption closeout:** bind the landed shared-host projection to a production browser
      renderer; complete browser keyboard/pointer and accessibility acceptance, performance budgets, and the NeonAmp,
      FlowPlant, and Orbital Command matrices. Shared host semantics, terminal wiring, drag/snap indicators,
      shelf/task-switcher affordances, compact policy, durable migration, and the Inkstone terminal reference are
      landed, but the flagship desktop experience is not yet claimed complete.

## 1. NeonAmp — Skinnable Desktop Audio Workstation

**Product outcome:** a Winamp-inspired player whose library, queue, equalizer, visualizer, lyrics, and diagnostics are
real cooperating windows. The deterministic provider makes the full workflow demonstrable everywhere; permissioned
terminal and browser providers can add actual playback.

**Hero workflow:** scan or open a fixture library, find an album, build and reorder a playlist, play and seek, tune an
equalizer preset, switch the visualizer and skin, rearrange the window suite, simulate an output failure, recover, quit,
and restore the exact queue, track position, theme, and workspace.

- [ ] **AMP-001 (Compose/Host)** Define a versioned `MediaProvider` for catalog scan, metadata, playback state, seek,
      volume, equalizer bands, analyser frames, album art, and lifecycle. Ship a timed synthetic provider, an optional
      supervised `mpv` provider for terminal hosts, and a browser Web Audio provider only when implemented and tested.
- [ ] **AMP-002 (Core/Compose)** Build a virtualized media library with artist/album/genre trees, searchable and
      sortable track table, cover grid fallback, favorites, ratings, recently played, duplicate detection, and
      cancellable scans using file-explorer/tree, data query/table, workers, cache, and progress components.
- [ ] **AMP-003 (Core/Compose)** Build stable-ID playlists and a play queue with multi/range selection, insert, remove,
      move, duplicate, clear-played, shuffle preview, smart filters, undo/redo, import/export, and recovery from missing
      files using virtual lists, field arrays, selection, history, and journal checkpoints.
- [ ] **AMP-004 (Core/Host)** Add play/pause/stop/previous/next, seek, volume, mute, balance, repeat, shuffle, playback
      speed, A/B loop, sleep timer, and visible buffering/output-device state. Commands, keys, buttons, sliders, and
      status remain Core; audible results are Host.
- [ ] **AMP-005 (Core/Host)** Build a ten-band equalizer with preamp, presets, per-output state, reset/compare,
      validated numeric editing, and persistent settings. Applying filters belongs to the provider.
- [ ] **AMP-006 (Core/Compose)** Create spectrum, waveform, stereo VU, peak-hold, history, and frame/underrun views from
      `MetricSeriesController`, sparkline/gauge/chart primitives, Canvas, bounded analyser channels, and render-loop
      inspection; label richer FFT plots as a 024:VIS gap until landed.
- [ ] **AMP-007 (Core/Compose)** Make player, playlist, library, equalizer, visualizer, lyrics, metadata, and
      diagnostics independent tiled windows with dock/swap, splitter resize, minimize, maximize/restore, compact
      projection, snapshots, and layout history.
- [ ] **AMP-008 (Gap: SHR-006)** Add an optional classic desktop mode with floating rectangles, title-bar dragging,
      magnetic edge snapping, grouped movement, always-on-top mini-player policy, and safe viewport recovery. Do not
      fake this by describing tiled ordering as XY movement.
- [ ] **AMP-009 (Core/Compose)** Build a semantic skin system over theme manifests, palette/layer tokens, responsive
      markup/CSS, Simple Grid, optional Yoga Flex, live capability diagnostics, and preview/reset; ship classic, modern,
      monochrome, high-contrast, and low-color skins.
- [ ] **AMP-010 (Core/Host)** Add an album/track metadata editor with nested fields, stable artist/genre arrays,
      validation, dirty/error summaries, before/after preview, atomic save where supported, and a non-replayable
      boundary around external tag writes.
- [ ] **AMP-011 (Core/Compose/Host)** Add album art and synchronized/static lyrics with text, Markdown, Kitty raster,
      browser, and explicit fallback profiles. Image decode/tag extraction and lyric lookup are provider work; a generic
      cross-backend image component remains a gap.
- [ ] **AMP-012 (Core/Host)** Add radio/podcast feeds, episodes, resume positions, download queue, retry/reconnect,
      buffering and cache inspection through resource loads, channels, stream operators, deadlines, tasks, and redacted
      network errors. Decode, range streaming, and feed protocols stay in providers.
- [ ] **AMP-013 (Core/Compose)** Add media keys and configurable keyboard modes through layered global/focus/modal maps,
      leader sequences, conflict inspection, remapping, command palette parity, and an always-visible key-help view.
- [ ] **AMP-014 (Core/Compose)** Add typed slots for visualizers, library sources, metadata panels, exporters, and theme
      packs. A future DSP slot must define buffer ownership, deadlines, isolation, and permission policy before
      accepting third-party code.
- [ ] **AMP-015 (Core/Compose)** Add a remote/browser controller that can browse, enqueue, and control the trusted host
      without sending secrets, arbitrary filesystem paths, or analyser data unless the user opts in.
- [ ] **AMP-016 (Core/Compose)** Test full queue/history persistence, rapid seek supersession, output loss/reconnect,
      bounded analyser pressure, narrow layouts, keyboard/pointer parity, skin token coverage, teardown, and
      fixture/live capability reporting.

**Library spotlight:** buttons, inputs, checkboxes, combo boxes, sliders, radio groups, virtual lists, data tables,
trees, tabs, menu bar, palette, context menu, modals, toasts, progress, status, charts, gauges, sparklines, logs,
Markdown, graphics surfaces, themes, windowing, CSS authoring, commands, forms, history, resources, processes, and
remote hosts.

**Useful precedents:** `examples/dashboard.ts`, `examples/theme_gallery.ts`, `examples/form_workflow.ts`,
`examples/window_manager_demo.ts`, `examples/web/api_workbench_page.ts`, and `examples/cached_resource.ts`.

## 2. Pathfinder — Dual-Pane File And Workspace Explorer

**Product outcome:** a keyboard-first file manager that can navigate huge trees, preview content, run cancellable file
jobs with conflict policy, recover safe operations, open terminals, and host local or remote filesystem providers.

**Hero workflow:** open two locations, search a large directory, multi-select results, inspect text/image/metadata
previews, dry-run a copy, resolve a collision, cancel and resume the job, undo a compensatable move, open a terminal at
the destination, close, and restore both panes, tabs, filters, selections, jobs, and layout.

- [ ] **PATH-001 (Compose/Host)** Define a bounded `FileSystemProvider` for roots, lazy children, stat, streams, watch,
      search, free space, copy/move/rename/trash/remove, atomic replace, links, and capability/error inspection. Ship an
      in-memory fixture provider before a least-privilege Deno provider.
- [ ] **PATH-002 (Core/Compose)** Build a dual-pane navigator with independent tabs, roots, histories, tree/detail
      modes, breadcrumbs, path editing, hidden-file policy, sort/filter state, focus transfer, synchronized compare
      mode, and responsive one-pane projection.
- [ ] **PATH-003 (Core/Compose)** Support million-entry fixtures through lazy tree expansion, virtualized keyed rows,
      async paging, stable multi/range selection, refresh reconciliation, selection anchors, and explicit partial/error
      rows. A reusable lazy-async tree contract is a shared gap.
- [ ] **PATH-004 (Core/Host)** Add recursive name/content/metadata search with ignore rules, scopes, cancellation,
      workers, latest-only results, cached indexes, match previews, saved queries, and watch invalidation.
- [ ] **PATH-005 (Core/Compose/Host)** Build previews for plain text, Markdown, terminal output, metadata, ANSI, and
      capability-selected images; stream bounded large files and surface encoding/binary detection rather than freezing.
- [ ] **PATH-006 (Gap: 024:WID-008, 023:V1)** Add reusable hex/binary and highlighted code/diff previews with linked
      offsets, selection/copy, gutters, horizontal scrolling, and synchronized split comparison.
- [ ] **PATH-007 (Core/Host)** Create a background job queue for copy, move, rename, trash, delete, checksum, archive,
      and search with bounded concurrency, per-job cancellation, phase/bytes progress, ETA, throughput, logs, retry, and
      clean shutdown.
- [ ] **PATH-008 (Core/Compose)** Provide dry-run operation plans and collision workflows for overwrite, skip, rename,
      merge, compare, and apply-to-all through forms, radio groups, checkboxes, steppers, typed modals, and redacted
      action-journal records.
- [ ] **PATH-009 (Core/Host)** Classify operations as replay-safe, compensatable, or non-replayable. Undo rename/move
      only after validating external state; undo deletion only through an implemented trash/recovery provider; poison
      history rather than pretending a failed compensation succeeded.
- [ ] **PATH-010 (Core/Compose)** Add bookmarks, recent locations, back/forward history, saved searches, workspace
      sessions, directory-specific view settings, and versioned restore through routes, settings, persistent signals,
      and screen/window snapshots.
- [ ] **PATH-011 (Core/Host)** Add archive, SFTP, object-store, Git-tree, and read-only fixture roots as provider
      plugins with per-provider capability reports, permission manifests, secrets, caching, reconnect, and safe mount
      disposal.
- [ ] **PATH-012 (Core/Host)** Integrate `TerminalShellWorkspaceController` and process sessions for “terminal here,”
      checksums, Git status, external editor/diff, and user-defined tools with explicit command preview and permissions.
- [ ] **PATH-013 (Core/Compose)** Add command palette, context menu, layered Norton-style keyboard mode, remapping,
      selection commands, quick filter, batch rename form, properties modal, and complete key-help discoverability.
- [ ] **PATH-014 (Gap: 024:INP-008)** Add typed internal/external drag-and-drop with file metadata policy, drag ghost,
      target validation, auto-scroll, cancellation, and browser/terminal parity; keep command-based move/copy as the
      supported initial path.
- [ ] **PATH-015 (Core/Compose)** Add a job/status dashboard with selected counts and sizes, queue depth, bytes/second,
      free space, provider health, watcher state, permission diagnostics, resource/cache inspection, and recovery
      actions.
- [ ] **PATH-016 (Core/Compose)** Test symlink cycles, permission denial, disappearing files, partial writes,
      collisions, cancellation, disconnect/reconnect, compensation failure, huge directories, narrow resize, workspace
      migration, and deterministic in-memory runs before enabling destructive live-provider tests.

**Library spotlight:** split panes, tiled windows, file explorer, tree, breadcrumbs, tabs, virtual list, data table,
selection, scroll area, Pad, Markdown, terminal output, Kitty graphics, forms, stepper, overlays, structured
concurrency, workers, resources, history/journal, permissions, plugins, PTY/terminal workspace, persistence, and
diagnostics.

**Useful precedents:** `examples/windowing_system_launcher.ts`, `examples/window_manager_demo.ts`,
`examples/table_selection_workflow.ts`, `examples/data_query.ts`, `examples/terminal_app.ts`,
`examples/terminal_command_workflow.ts`, and `examples/worker_pool.ts`.

## 3. Orbital Command — ASCII 3D Observatory And Mission Console

**Product outcome:** an operational observatory that links a real color ASCII 3D scene to object catalogs, simulation
time, telemetry, alert handling, planning, renderer diagnostics, and deterministic scenario replay.

**Hero workflow:** load a seeded orbital catalog, select a spacecraft from the tree and scene, accelerate and scrub
time, inspect predicted passes and live telemetry, acknowledge a conjunction alert, simulate a maneuver plan, compare
before/after state, switch rendering profiles, replay the session, and restore the observatory workspace.

- [ ] **ORBIT-001 (Core/Compose)** Render bodies, spacecraft, stations, orbit lines, lighting, labels, and selection
      emphasis with `ThreeAscii` block/glyph/mixed profiles, resize-aware camera aspect, effects, deferred readback, and
      visible performance/fallback inspection.
- [ ] **ORBIT-002 (Core/Compose)** Provide an explicit renderer capability screen and selectable quality/readback/color
      profiles. If WebGPU is unavailable, show a useful catalog/telemetry fallback without claiming equivalent CPU or
      WebGL Three scene rendering.
- [ ] **ORBIT-003 (Compose/Gap)** Build reusable orbit/pan/zoom/focus camera commands with keyboard and captured pointer
      input, configurable speed/FOV, reset/bookmarks, and inspection. Gesture recognition remains 024:INP-007.
- [ ] **ORBIT-004 (Compose/Gap)** Map terminal cells to scene coordinates for Three.js raycasting, linked scene/tree
      selection, hover/focus details, occlusion-aware labels, and keyboard cycling. Promote a general scene picking
      contract only after terminal/browser behavior agrees.
- [ ] **ORBIT-005 (Core/Compose)** Build searchable solar-system, mission, station, and spacecraft trees plus paged
      object tables, stable selection, bookmarks, typed deep links, and cached metadata resources.
- [ ] **ORBIT-006 (Core/Compose/Host)** Define catalog, ephemeris, telemetry, and event providers with deterministic
      fixtures; optional live network/import providers own protocol, authentication, time/reference-frame, and dataset
      validity concerns.
- [ ] **ORBIT-007 (Core/Compose)** Add pause, step, wall-clock, simulated clock, time multipliers, scrub, bookmarks, and
      deterministic playback using host/virtual timer schedulers and a render loop.
- [ ] **ORBIT-008 (Core/Compose)** Offload propagation, visibility, pass prediction, conjunction analysis, and scenario
      scoring to workers with deadlines, latest-only pipelines, shared cache, cancellation, and stale-result guards.
- [ ] **ORBIT-009 (Core/Compose)** Build linked telemetry windows for altitude, velocity, range, link margin, thermal
      state, frame time, GPU/readback pressure, alerts, and raw logs using data tables, metric series, gauges,
      sparklines, charts, and bounded channels.
- [ ] **ORBIT-010 (Gap: 024:VIS-001..010)** Add scientific scales, axes, line/scatter/area series, downsampling,
      crosshairs, zoom, annotations, linked domains/cursors, and deterministic export before advertising full mission
      plotting.
- [ ] **ORBIT-011 (Core/Compose)** Add conjunction/system alert rules, severity, acknowledgement, snooze, assignment,
      correlation, escalation modal, status/toast/log surfaces, and journal evidence without presenting demo thresholds
      as authoritative safety guidance.
- [ ] **ORBIT-012 (Core/Compose)** Build an object inspector with Overview, Orbit, Telemetry, Events, Notes, and
      Missions tabs, Markdown references, nested forms, validation, clear simulated/authoritative provenance, and key
      help.
- [ ] **ORBIT-013 (Core/Compose)** Build a multi-step observation/maneuver planner with stable-ID steps, reorder,
      duplicate, constraints, dry-run analysis, comparison, atomic undo, checkpoints, and cancellable worker execution.
- [ ] **ORBIT-014 (Core/Compose)** Make viewport, catalog, inspector, timeline, telemetry, alerts, planner, and
      diagnostics persistent dockable windows with compact policies, exact maximize/restore, layout history, and focused
      fullscreen presentation mode.
- [ ] **ORBIT-015 (Core/Compose/Gap)** Bridge still image frames to the graphics-surface facade for supported Kitty and
      browser paths with rate/backpressure limits. Continuous high-resolution raster transport and a general image
      component remain separate work.
- [ ] **ORBIT-016 (Core/Compose)** Record timestamped provider frames and control actions, checkpoint long sessions,
      replay them on virtual time, and test fixed-time controller/cell snapshots separately from capability-gated GPU
      golden images.

**Library spotlight:** Three ASCII, Canvas/graphics surfaces, renderer profiles, trees, data tables, tabs, forms, field
arrays, sliders/steppers, telemetry widgets, logs/toasts/modals, windows/overlays, workers, streams, resources, virtual
clocks, routes, journal/checkpoints, plugins, browser/remote rendering, and diagnostics.

**Useful precedents:** `examples/three_ascii.ts`, `examples/web/three_ascii_page.ts`, `examples/dashboard.ts`,
`examples/runtime_workloads.ts`, `examples/cached_pipeline.ts`, and `examples/web/api_workbench_page.ts`.

## 4. PacketGlass — Defensive Network Protocol Analyzer

**Product outcome:** an analyst workbench for captures and explicitly authorized live sources, designed around sustained
ingest, visible overload behavior, linked protocol/byte inspection, stream reconstruction, evidence annotations, and
reopenable cases. It must not collect credentials, scan targets, or activate capture sources without the user's explicit
provider choice and host permissions.

**Hero workflow:** replay a saturated fixture or connect to an authorized capture provider, watch queue/drop metrics,
apply capture and display filters, select a packet, follow linked protocol fields into the byte view, reconstruct an
HTTP conversation, inspect endpoint metrics/topology, annotate evidence, export a redacted case, close, and reopen it
with the same workspace and selection.

- [ ] **PACKET-001 (Compose/Host)** Define versioned local-capture, remote-agent, and file-import providers with health,
      link metadata, pause/resume, statistics, cancellation, permissions, secrets, and disposal. Ship PCAP fixtures;
      libpcap/tshark/agent connectors and PCAP codecs are host/domain adapters.
- [ ] **PACKET-002 (Core/Compose)** Build sustained ingest on bounded `AsyncChannel`s, stream transforms, task groups,
      deadlines, scheduler priorities, and decoder workers with selectable block/drop/conflate policies and
      always-visible queue depth, lag, decoded rate, dropped frames, and worker saturation.
- [ ] **PACKET-003 (Core/Compose)** Model capture sessions with start/pause/stop/rotate, source metadata, filters,
      timestamps, bookmarks, decoder versions, notes, save/reopen, provider disconnect recovery, and explicit incomplete
      capture markers.
- [ ] **PACKET-004 (Core/Compose/Gap)** Build a keyed, virtualized packet browser with async page/filter/sort, stable
      selection, column profiles, frozen time/source columns, live-tail/copy modes, and scroll-anchor preservation.
      Cursor queries and advanced column virtualization/management remain 024:DAT/WID follow-ups.
- [ ] **PACKET-005 (Core/Compose)** Add capture/display filter editors with history, completion surface, validation
      diagnostics, saved filters, command access, and modal keymaps. BPF/Wireshark grammar and compilation are adapters.
- [ ] **PACKET-006 (Core/Compose)** Add a lazy protocol decode tree with breadcrumbs, expandable fields, value/meaning,
      offsets/lengths, expert warnings, cross-pane focus, context actions, and decoder provenance.
- [ ] **PACKET-007 (Gap: 024:WID-008)** Build a reusable virtualized hex/raw-byte inspector with byte/word groupings,
      endian and text views, search, range selection, keyboard/pointer navigation, linked field highlights, copy/export,
      and bounded large-buffer behavior.
- [ ] **PACKET-008 (Compose/Host)** Reassemble TCP/application streams with direction styling, gaps/retransmissions,
      search, encoding selection, Markdown/text/hex rendering, export, and resource cancellation. Protocol parsers and
      any user-supplied TLS key-log use stay adapter-owned, opt-in, secret-redacted, and case-local.
- [ ] **PACKET-009 (Core/Compose)** Build endpoint, conversation, DNS, HTTP, TLS-metadata, latency, throughput, error,
      and retransmission tables with linked filters, drill-down routes, metric histories, sparklines, gauges, and
      alerts.
- [ ] **PACKET-010 (Gap: 024:VIS-001..010)** Add histograms, heatmaps, time-series scales, downsampling, linked cursors,
      selection brushes, annotations, and deterministic export before calling the dashboard a full plotting system.
- [ ] **PACKET-011 (Compose/Gap)** Build a service/topology view on Canvas with selectable nodes/edges, grouping,
      minimap, filter linkage, dirty-region rendering, and spatial picking. Graph layout, routing, clustering, and
      large-graph virtualization are reusable core candidates.
- [ ] **PACKET-012 (Core/Compose)** Add bookmarks, evidence annotations, alert acknowledgement, tags, analyst notes,
      screenshots/exports metadata, journal checkpoints, retention, and clear replay barriers around
      capture/network/file side effects.
- [ ] **PACKET-013 (Core/Compose/Host)** Save and reopen bounded cases with versioned metadata, provider/decoder
      provenance, workspace state, filters, annotations, and redacted reports; stream PCAPNG/CSV/JSON/Markdown exports
      through cancellable adapters instead of buffering unbounded files.
- [ ] **PACKET-014 (Core/Compose)** Make packet list, protocol tree, bytes, streams, conversations, topology, metrics,
      source status, case notes, and diagnostics dockable persistent windows with narrow-screen focus projection.
- [ ] **PACKET-015 (Core/Compose/Host)** Support remote/browser analysis with capture and privileged decoding on the
      trusted host, negotiated input/capabilities, reconnect, session consent, and content-redacted diagnostics.
- [ ] **PACKET-016 (Core/Compose)** Test malformed/truncated packets, decoder failure isolation, sustained overload,
      every channel policy, pause/copy/live transitions, cancellation, reconnect, secret redaction, million-row
      fixtures, linked selection, resize/focus restore, deterministic replay, and clean provider shutdown.

**Library spotlight:** plugins/slots, permissions/secrets, async channels and operators, tasks/deadlines/schedulers,
workers, data query/table/virtual list, trees/breadcrumbs, TextBox/input, layered keymaps, hex-ready retained cells,
Canvas/spatial index, metrics/logs, windows, persistence, remote hosts, Markdown reports, and test pilots.

**Useful precedents:** `examples/data_query.ts`, `examples/dashboard.ts`, `examples/runtime_workloads.ts`,
`examples/window_manager_demo.ts`, `examples/html_css_workbench.ts`, and `examples/cached_pipeline.ts`.

## 5. GlyphForge — ANSI Art And Animation Studio

**Product outcome:** a multi-document cell-art studio with serious editing tools, layers, palettes, animation, color and
width compatibility previews, atomic stroke history, extensible codecs, recovery, and efficient dirty-cell rendering.

**Hero workflow:** open a versioned multi-frame project, paint with mouse and keyboard, select and transform a region,
reorder and lock layers, edit the palette, scrub an onion-skinned animation, preview monochrome/16/256/truecolor/browser
profiles side by side, undo a whole stroke atomically, recover a checkpoint, and export ANSI plus raster variants.

- [ ] **GLYPH-001 (Compose)** Define a versioned project schema for documents, cell grids, frames, durations, layers,
      groups, palette, metadata, guides, profile targets, plugin data, migrations, and deterministic fixtures.
- [ ] **GLYPH-002 (Core/Compose)** Build a dockable multi-document studio with canvas, layers, timeline, palette, glyph
      browser, inspector, preview, history, and diagnostics windows; persist tabs, tools, zoom/viewport, selections, and
      layout with responsive compact modes.
- [ ] **GLYPH-003 (Compose/Gap)** Build an editable styled-cell canvas over retained frames, Canvas draw objects, dirty
      regions, spatial indexing, differential ANSI painting, browser/memory sinks, z-order, clipping, and cursor reveal.
      Promote a first-class `CellCanvas` only after performance and selection contracts stabilize.
- [ ] **GLYPH-004 (Core/Compose)** Implement pencil, eraser, fill, line, rectangle, ellipse, text, stamp, eyedropper,
      replace-color, pan, zoom, and tool-option state machines with captured mouse/touch/pen input, keyboard modes,
      lifecycle cancellation, hit targets, and contextual commands.
- [ ] **GLYPH-005 (Compose/Gap)** Add rectangular/lasso selection, add/subtract/intersect, marching ants, move, crop,
      flip, rotate, tile, clear, rectangular clipboard, cross-frame/document paste, keyboard nudging, and selection-edge
      auto-scroll; reusable 2D selection is new core work.
- [ ] **GLYPH-006 (Core/Compose)** Add layer/group trees with stable IDs, visibility, locking, reorder, duplicate,
      rename, opacity, flatten/merge preview, per-frame/shared layers, and safe missing-plugin fallback.
- [ ] **GLYPH-007 (Core/Compose/Gap)** Build a palette laboratory with swatches, foreground/background linking, RGB/HSL
      editors, ramps, named/theme colors, import, replace/remap, contrast and gamut warnings. HSV/HSL picker and
      perceptual quantization are reusable widget/algorithm gaps.
- [ ] **GLYPH-008 (Core/Compose)** Add a searchable Unicode/glyph browser with width/profile diagnostics, recent and
      favorite glyphs, categories, combining-character warnings, copy/insert, font/terminal notes, and explicit handling
      of unresolved 024:TXT emoji/bidi semantics.
- [ ] **GLYPH-009 (Core/Compose)** Make every drag stroke, fill, transform, palette remap, layer operation, and frame
      edit an atomic/coalesced history unit; journal durable edits, checkpoint autosaves, cap retention, and exclude
      hover, preview playback, and cursor movement.
- [ ] **GLYPH-010 (Core/Compose/Gap)** Build a frame timeline with stable frames, duration editing, duplicate/reorder,
      range playback, loop/ping-pong, onion skin, markers, virtual-time tests, and frame export. Keyframes, easing,
      tweening, and audio synchronization remain animation/timeline gaps.
- [ ] **GLYPH-011 (Core/Compose)** Render side-by-side compatibility previews for truecolor, ANSI-256, ANSI-16,
      monochrome, selected width profiles, terminal, browser, and Kitty raster; show degradation metrics and never imply
      identical glyph metrics across unknown terminals.
- [ ] **GLYPH-012 (Compose/Host)** Implement bounded, cancellable ANSI dialect, plain text, JSON project, XBIN, SVG,
      PNG, GIF/APNG, and image-to-glyph codec adapters with worker offload, progress, version/provenance, color
      quantization, and preview before overwrite. Kitty image placement is not image encoding.
- [ ] **GLYPH-013 (Core/Compose)** Add theme packs, semantic tool/status colors, custom checker/background surfaces,
      high-contrast selection, low-color operation, color-blind-safe status markers, and a skin preview/reset workflow.
- [ ] **GLYPH-014 (Core/Compose)** Add typed plugin slots for tools, importers, exporters, palettes, glyph sets,
      inspectors, and preview profiles with failure isolation, capability/permission reports, and host fallback
      contributions.
- [ ] **GLYPH-015 (Core/Gap)** Support deterministic action replay and consentful remote viewing/control, but do not
      call that multi-user collaboration; presence, CRDT/OT merging, conflict resolution, and authorship are future
      work.
- [ ] **GLYPH-016 (Core/Compose)** Test wide/combining glyphs, clipped layers, huge sparse canvases, rapid strokes,
      pointer cancellation, undo after resize, palette degradation, dirty-region correctness, animation virtual time,
      corrupt recovery, codec limits, terminal/browser snapshot parity, and frame-time budgets.

**Library spotlight:** retained cells, differential painters, Canvas, dirty regions, spatial index, terminal/browser
sinks, themes and ANSI colors, Unicode-aware text, canonical pointer input/capture, layered modes, trees/lists/forms,
windows, render loop/clocks, history/journal, storage, graphics surfaces, plugins, workers, and snapshots.

**Useful precedents:** `examples/window_manager_demo.ts`, `examples/theme_gallery.ts`, the workbench frame/painter
paths, Canvas snapshot tests, `examples/runtime_workloads.ts`, and `examples/form_workflow.ts`.

## 6. QueryFoundry — Multi-Database Engineering Workbench

**Product outcome:** a credential-conscious, driver-extensible SQL workbench with schema exploration, cancellable
parameterized execution, huge results, explicit transactions, staged editing, plans, diffs, monitoring, export, and
durable multi-script workspaces.

**Hero workflow:** open a redacted fixture connection profile, browse a lazily loaded schema, edit a parameterized query
with modal keys, cancel a slow execution, inspect a million-row paged result, stage an edit inside an explicit
transaction, compare an explain plan and schema diff, export safely, then reopen the exact tabs, routes, selections, and
window layout through a remote client.

- [ ] **QUERY-001 (Core/Compose)** Build connection-profile forms with nested options, stable host arrays, validation,
      password/masked fields, test-connection, capability/permission preview, redacted diagnostics, import/export, and
      safe persistence that never mistakes `Secret` redaction for encryption.
- [ ] **QUERY-002 (Compose/Host)** Define typed driver/dialect plugins for connect, metadata, prepare/execute/cancel,
      transactions, paging/streaming, mutation, explain, monitoring, health, and disposal. Ship an in-memory fixture
      database; PostgreSQL/MySQL/SQLite clients, pools, tunnels, and dialects are adapters.
- [ ] **QUERY-003 (Core/Compose)** Supervise connection/session state with task groups, deadlines, scheduler priority,
      resource load join/supersede, cache policy, cancellation, health inspection, reconnect commands, and bounded logs.
- [ ] **QUERY-004 (Core/Compose/Gap)** Build a schema/object browser for databases, schemas, tables, views, columns,
      indexes, constraints, routines, and dependencies with breadcrumbs, context actions, refresh, cache invalidation,
      errors, and selection. Lazy async tree loading remains a reusable gap.
- [ ] **QUERY-005 (Core/Gap: 023:V1)** Build a multi-tab SQL editor on `TextBoxController` with line numbers, grapheme
      safety, wrap modes, modal/layered keymaps, command palette, find/replace, selection/clipboard, Tree-sitter syntax,
      diagnostics, completion, signature help, formatting, gutters, and large-document scrolling; distinguish baseline
      editing from the unfinished rich editor features.
- [ ] **QUERY-006 (Core/Compose)** Persist named scripts, dirty state, tabs, split views, routes, cursor/scroll
      positions, selected connection, query history, snippets, saved searches, workspace windows, versioned migrations,
      and unsaved-change/recovery flows.
- [ ] **QUERY-007 (Core/Compose/Host)** Run parameterized statements with generated nested forms, driver type hints,
      validation, preview, task deadline/cancel, elapsed/progress state, messages/notices, row counts, and clear replay
      barriers around database side effects.
- [ ] **QUERY-008 (Core/Compose/Gap)** Explore huge results with async paging, filter/sort, stable row keys and
      selection, virtualized vertical rendering, copy, cell inspection, null/type styling, and cache inspection.
      Cursor/infinite queries, streamed rows, horizontal virtualization, multi-sort, resizable/reorderable/frozen
      columns, and rich cell renderers remain gaps.
- [ ] **QUERY-009 (Core/Compose/Host)** Add explicit begin/savepoint/commit/rollback controls, pinned connection state,
      idle/failed transaction warnings, confirmation, SQL/event log, and recovery. Journal intent/outcome but never make
      a commit replayable.
- [ ] **QUERY-010 (Core/Compose/Gap)** Add staged row insert/update/delete forms, before/after diff, validation, batch
      preview, optimistic local state, rollback, and transaction integration. Server async validation, mutation
      resources, JSON/date/binary editors, and reusable diff forms remain 024:DAT/FRM/WID work.
- [ ] **QUERY-011 (Core/Compose/Gap)** Render explain plans as a tree with costs/rows/timing, linked SQL ranges and
      metric tables; add a graph/DAG and heatmap only when reusable graph and 024:VIS primitives exist.
- [ ] **QUERY-012 (Compose/Gap)** Build schema compare and migration authoring with canonical snapshots, structural
      diff, dependency ordering, Markdown summary, generated SQL preview, dry-run, and explicit apply. SQL parsing,
      diff/editor, and migration safety are domain/core gaps.
- [ ] **QUERY-013 (Core/Compose/Host)** Add query/session/lock/activity monitoring with live tables, bounded metric
      series, gauges/sparklines/charts, alerts, provider health, cancellation/kill confirmation, and redacted workload
      diagnostics; database-specific metrics stay in drivers.
- [ ] **QUERY-014 (Core/Compose/Host)** Export bounded or streaming CSV, JSON, Markdown, and driver/plugin formats with
      selected/all-page choice, column policy, progress, cancellation, backpressure, secret/PII warning, preview, and
      large-result limits.
- [ ] **QUERY-015 (Core/Compose)** Run browser/remote views against a trusted database host with negotiated
      capabilities, consent, reconnect, canonical input, permission reports, and no raw credential transfer to an
      untrusted client.
- [ ] **QUERY-016 (Core/Compose)** Test cancel/reconnect, stale metadata suppression, result paging/cache, million-row
      navigation, transaction confirmation, failed rollback, secret redaction in every sink, driver disposal, unsaved
      recovery, narrow workspace restore, browser/terminal parity, and deterministic fixture plans.

**Library spotlight:** forms and field arrays, secrets/permissions, plugins/slots, tasks/deadlines/resources/cache,
TextBox and modal keymaps, tree/breadcrumbs, data query/table/virtual list, tabs/routes/screens, windows,
terminal/process surfaces, metrics/logs, Markdown, persistence, history/journal, remote hosts, and test doubles.

**Useful precedents:** `examples/app_shell.ts`, `examples/form_workflow.ts`, `examples/data_query.ts`,
`examples/cached_resource.ts`, `examples/window_manager_demo.ts`, `examples/html_css_workbench.ts`, and
`app/api_workbench.ts`.

## 7. FlowPlant — Visual Automation And Workflow Studio

**Product outcome:** a versioned workflow editor whose graph is executable, debuggable, inspectable, permission-aware,
and recoverable. The graph, inspector, run console, metrics, and history must share one state model instead of behaving
like a draggable diagram mockup.

**Hero workflow:** import a production-sized fixture, search for a node, dock the inspector and run console beside the
graph, edit and reuse a subflow, validate types and permissions, dry-run, execute parallel branches with a breakpoint,
inspect live values and backpressure, retry a failure, undo structural edits, and replay the run from a checkpoint.

- [ ] **FLOW-001 (Compose)** Define versioned projects containing workflows, stable node/port/edge IDs, typed values,
      subflows, variables, secrets references, layout, annotations, plugin versions, migrations, fixtures, and
      import/export with corrupt-state recovery.
- [ ] **FLOW-002 (Compose/Gap)** Build a world-coordinate graph canvas with z-ordered nodes, typed ports, routed edges,
      selection halos, viewport clipping, pan/zoom, snap grid, guides, groups, annotations, minimap, dirty-region
      repaint, spatial picking, and keyboard navigation. Canvas primitives exist; a first-class graph editor does not.
- [ ] **FLOW-003 (Core/Compose/Gap)** Add node move/resize, port connection drag, edge reconnect, lasso/multi-selection,
      copy/paste, align/distribute, duplicate, delete, auto-scroll, and cancellation using canonical pointer input,
      capture, lifecycle reconciliation, hit targets, layered modes, and key sequences. Gestures/DnD remain
      024:INP-007/008.
- [ ] **FLOW-004 (Core/Compose)** Build a searchable node catalog with categories, compatibility filters, favorites,
      templates, recent nodes, keyboard insertion, context menus, command palette access, and plugin contributions with
      host fallback.
- [ ] **FLOW-005 (Core/Compose/Gap)** Build a property inspector with nested forms, stable array fields, enum/boolean/
      numeric/text editors, expression mode, validation summaries, dirty/touched state, atomic apply/revert, and linked
      selection. A reusable property grid and async/dependency-aware validation remain 024:WID-005/FRM-003/004.
- [ ] **FLOW-006 (Compose)** Add static graph validation for missing inputs, incompatible types, illegal cycles,
      unreachable nodes, invalid subflow contracts, secret/permission requirements, plugin availability, and migration
      warnings with clickable diagnostics.
- [ ] **FLOW-007 (Core/Compose)** Make every structural/property operation a history transaction; coalesce drags,
      checkpoint milestones, retain causal journal records, and restore graph plus workspace while excluding transient
      hover and live execution values.
- [ ] **FLOW-008 (Core/Compose)** Implement a fixture workflow runtime with sequential/parallel/conditional branches,
      bounded streams, cancellation, deadlines, cached inputs, worker transforms, latest-run suppression, typed results,
      deterministic virtual time, and explicit node ownership/disposal.
- [ ] **FLOW-009 (Core/Compose/Gap)** Add dry-run change/resource plans, structured phase/node progress, pause/resume,
      retry, attach/detach, and background execution. Existing primitives carry an initial runtime; reusable typed
      command progress/jobs/pipelines remain 024:AUT-001 through AUT-008.
- [ ] **FLOW-010 (Core/Compose)** Add breakpoints, single-step, run-to-node, live port values, watch expressions,
      execution-path emphasis, failure focus, retry-from-checkpoint, and deterministic replay without replaying unsafe
      external effects.
- [ ] **FLOW-011 (Core/Compose)** Build dockable per-node and aggregate logs, active-run table, history table,
      throughput, latency, queue pressure, retry/error metrics, terminal output, and runtime workload/resource
      diagnostics.
- [ ] **FLOW-012 (Core/Compose)** Add reusable subflows, typed input/output contracts, template gallery, references,
      dependency tree, semantic version constraints, upgrade preview, and migration records.
- [ ] **FLOW-013 (Core/Compose)** Support deep links such as `/flows/:flowId/runs/:runId?`, editor/run/detail screens,
      typed result modals, focus restoration, command/keymap parity, persistent tiled layouts, and compact
      graph/inspector projection.
- [ ] **FLOW-014 (Core/Compose/Gap)** Define slots for node types, value editors, credentials, data sources, inspectors,
      exporters, and execution backends with permission diffs, secrets, failure isolation, and provenance. Plugin
      manifests, isolation, grants, and hot upgrades remain 024:PLG/SEC work.
- [ ] **FLOW-015 (Core/Compose/Host)** Add optional schedule/webhook/queue/process/database adapters only behind
      explicit permissions and dry-run; ship deterministic sources/sinks and redacted payloads so the showcase remains
      complete without external infrastructure.
- [ ] **FLOW-016 (Core/Compose)** Test graph migration, large layouts, selection/picking, pointer cancellation, cyclic
      and invalid graphs, parallel failure policy, bounded stream overload, deadlines, breakpoint replay, unsafe-action
      barriers, plugin failure, workspace restore, terminal/browser parity, and runtime disposal.

**Library spotlight:** Canvas/draw objects/dirty regions/spatial index, canonical pointer capture and layered modes,
commands/palette/context menu, trees/tabs, forms/field arrays/history, windows/routes/screens, task groups/deadlines/
channels/workers/resources/pipelines, logs/metrics/terminal output, persistence/journal, plugins/slots, permissions,
secrets, and deterministic testing.

**Useful precedents:** `examples/cached_pipeline.ts`, `examples/runtime_workloads.ts`, `examples/form_workflow.ts`,
`examples/window_manager_demo.ts`, and `examples/app_shell.ts`.

## 8. MetroOps — Public Transit Operations Simulator

**Product outcome:** a control-room simulator that ingests or replays vehicle feeds, renders a selectable network,
tracks service health, manages incidents and dispatch actions, compares scenarios, and preserves an auditable operator
workspace.

**Hero workflow:** run the seeded peak hour at 8x speed, follow a late vehicle, inspect its trip and crowding,
acknowledge a service alert, create an incident, dispatch a short turn, compare predicted headway recovery with the
untouched baseline, replay operator actions, and restore the control-room layout.

- [ ] **METRO-001 (Compose/Host)** Define schedule, vehicle-position, alert, ridership, and operations providers with
      source health, snapshots, incremental events, reconnect, cancellation, permissions, provenance, and deterministic
      GTFS-shaped fixtures. GTFS/GTFS-Realtime and agency integrations are adapters.
- [ ] **METRO-002 (Core/Compose)** Ingest live or simulated feeds with bounded channels, conflation for positions,
      buffering for events, merge/filter/throttle/debounce/window/retry transforms, task ownership, deadlines, and
      visible lag/drop/reconnect diagnostics.
- [ ] **METRO-003 (Compose/Gap)** Build an interactive network-map Canvas with lines, stops, vehicles, labels,
      disruptions, layers, viewport clipping, pan/zoom, selection, follow mode, hit testing, minimap, and dirty-region
      repaint. Projection, route polylines, spatial indexing policy, and semantic map controls are domain/core work.
- [ ] **METRO-004 (Core/Compose)** Build linked, virtualized operations tables for routes, trips, stops, vehicles,
      blocks, operators, headways, loads, alerts, and incidents with async query, filters, sorting, paging, stable
      selection, saved views, and map focus.
- [ ] **METRO-005 (Core/Compose)** Add a deterministic simulation clock with live/pause/step, multipliers, scrub,
      scenario start/end, seeded randomness, bounded callbacks, time bookmarks, and virtual-time controller tests.
- [ ] **METRO-006 (Core/Compose)** Offload arrival prediction, headway/crowding aggregation, vehicle assignment,
      disruption propagation, and scenario scoring to workers with deadlines, latest-only pipelines, cache,
      cancellation, and stale-result guards.
- [ ] **METRO-007 (Core/Compose)** Build rolling dashboards for on-time performance, headway regularity, crowding,
      missed trips, dwell, throughput, prediction error, provider/runtime health, and event logs with metric series,
      gauges, sparklines, charts, alerts, and status items.
- [ ] **METRO-008 (Gap: 024:VIS-001..010)** Add time/scalar scales, axes, line/area/scatter/heatmap views, streaming
      downsampling, crosshair, pan/zoom, threshold bands, incident annotations, linked cursors/brushes, and exports
      before claiming operations-grade analytical plotting.
- [ ] **METRO-009 (Core/Compose)** Build an incident workflow with severity, affected services, owner, notes,
      attachments metadata, response checklist, staged resolution, typed modals, notifications, history transaction, and
      action journal evidence.
- [ ] **METRO-010 (Core/Compose/Host)** Add dispatch commands for hold, short turn, skip stop, swap vehicle, add trip,
      reroute, operator message, and alert publication with role/capability checks, structured preview, confirmation,
      simulation-first mode, and non-replayable live-provider boundaries.
- [ ] **METRO-011 (Core/Compose)** Add branchable scenarios with injected incidents, parameter forms, baseline clone,
      action timeline, checkpoints, side-by-side metrics, outcome summary, export, and deterministic replay.
- [ ] **METRO-012 (Gap: 024:WID-010)** Add a virtualized operational timeline linking feed events, incidents, dispatch
      actions, alerts, predicted milestones, and journal checkpoints to map/table selections.
- [ ] **METRO-013 (Core/Compose)** Make map, service board, incident queue, vehicle/trip inspector, metrics, timetable,
      event log, simulation controls, and diagnostics persistent dockable windows with multi-role layouts and compact
      focus modes.
- [ ] **METRO-014 (Core/Compose)** Add audit-safe operator identities from the selected fixture/provider, causal action
      IDs, explicit permissions, redacted notes/exports, provider capability reports, acknowledgement state, and bounded
      retention without implementing hidden personnel monitoring.
- [ ] **METRO-015 (Core/Compose/Gap)** Add plugin slots for feeds, predictions, map layers, alerts, dispatch commands,
      exporters, and status items. Locale/time-zone formatting and full observability/health snapshots remain
      024:LOC/OBS gaps and must be visible in the capability report.
- [ ] **METRO-016 (Core/Compose)** Test bursty/out-of-order feeds, overload policy, reconnect, time jumps, stale
      prediction suppression, incident/dispatch replay barriers, huge tables, map picking, scenario determinism, narrow
      control rooms, provider denial, redaction, browser/terminal parity, and shutdown.

**Library spotlight:** async streams/channels, virtual clocks, workers/pipelines/cache, Canvas/spatial input, data
queries/tables/virtual lists, forms/modals/screens, metrics/charts/logs/toasts, window workspaces, history/journal,
permissions, plugins, responsive markup, remote/browser hosts, and diagnostics.

**Useful precedents:** `app/system_metrics.ts`, `app/visualization_system.ts`, `examples/data_query.ts`,
`examples/dashboard.ts`, `examples/runtime_workloads.ts`, and `examples/window_manager_demo.ts`.

## 9. Inkstone — Writing And Knowledge Workspace

**Product outcome:** a durable Markdown knowledge workbench with a large-vault navigator, serious text workflow, linked
preview, outline/backlinks/search, metadata, revision recovery, optional Git/build tools, and a graph that reflects the
same indexed document model.

**Hero workflow:** open a large Unicode-heavy fixture vault, find and edit a note beside live Markdown preview, follow a
link and backlink, update tags/frontmatter, inspect the knowledge graph, recover an earlier checkpoint, run an
explicitly approved Git/build command in a docked terminal, export the note, close, and restore the exact editing
workspace.

- [ ] **INK-001 (Compose/Host)** Define a bounded vault provider for list/read/write/watch/search/atomic
      replace/conflict, metadata, attachments, and health with an in-memory fixture, permissioned Deno filesystem
      provider, and optional sync/Git adapters. `FileExplorerController` itself performs no I/O.
- [ ] **INK-002 (Core/Compose)** Build vault explorer, recent files, favorites, folders/tags trees, document tabs, dirty
      markers, breadcrumbs, back/forward history, typed note routes, focus restoration, reopen state, and persistent
      split/tiled layouts.
- [ ] **INK-003 (Core/Gap: 023:V1)** Build a grapheme-safe Markdown editor with line numbers, selectable ranges,
      soft/character/no-wrap modes, selection-edge auto-scroll, find/replace, integrated clipboard, editing aliases,
      optional syntax highlighting, diagnostics, gutters, and responsive large-document scrolling.
- [ ] **INK-004 (Core/Compose)** Build reactive Markdown preview with headings, lists, task items, quotes, fences,
      links, tables, semantic theme roles, scroll, source/preview synchronization, link activation, safe external-link
      policy, and explicit loading/error states.
- [ ] **INK-005 (Core/Compose)** Generate outline, backlinks, outgoing links, tags, tasks, citations, unresolved links,
      and search results through trees, virtual lists, data queries, cached worker pipelines, stable selections, and
      linked navigation.
- [ ] **INK-006 (Compose/Gap)** Build an incremental vault index for Markdown, wiki links, frontmatter, citations,
      headings, tags, tasks, and aliases with watch invalidation, cancellation, diagnostics, schema/version provenance,
      and bounded persistence. Parser/index semantics remain app infrastructure.
- [ ] **INK-007 (Core/Compose)** Add a metadata/frontmatter inspector with nested fields, stable tag/alias/author
      arrays, validation, source synchronization, before/after preview, dirty/error summaries, and atomic history
      transactions.
- [ ] **INK-008 (Core/Compose)** Coalesce typing bursts into sensible undo units, keep structural edits atomic, journal
      durable revisions, checkpoint milestones/autosaves, cap retention, restore earlier versions, and clearly separate
      editor undo from external filesystem/Git operations.
- [ ] **INK-009 (Core/Compose/Gap)** Add debounced autosave, supersede on rapid navigation, stale/conflict detection,
      compare/keep/merge/reload recovery, crash-recovery drafts, JSON/IndexedDB fallback, and storage diagnostics. Full
      draft/crash persistence aligns with 024:FRM-008/009 and HIS-008/010.
- [ ] **INK-010 (Compose/Gap)** Build a knowledge-graph Canvas with linked document/tag nodes, filters, selection,
      focus, neighborhood expansion, minimap, layout worker, dirty regions, and navigation. Graph layout/routing and
      accessible semantic traversal are reusable gaps.
- [ ] **INK-011 (Core/Compose)** Add task and citation workspaces with queryable tables, due/status/project filters,
      backlink context, batch edits, bibliography/footnote previews, saved views, and Markdown export.
- [ ] **INK-012 (Core/Host)** Add optional gated Git, formatter, static-site, pandoc, spell/lint, and user-tool commands
      through process/terminal workspaces with command preview, permissions, cancellation, logs, status, and
      non-replayable side-effect boundaries.
- [ ] **INK-013 (Core/Compose/Host)** Export selected notes or vault reports to Markdown, plain text, HTML and plugin
      formats with link rewriting, assets policy, preview, worker offload, progress, cancellation, and redacted
      diagnostics; sync providers require explicit conflict/security design.
- [ ] **INK-014 (Core/Compose)** Add distraction-free/focus layouts, semantic writer themes, low-color/high-contrast
      profiles, modal and conventional keymaps, leader sequences, remapping/conflict inspection, command palette, menus,
      context actions, key help, OSC clipboard/notifications only under policy, and compact-screen modes.
- [ ] **INK-015 (Core/Compose/Gap)** Add typed slots for indexers, linters, preview panels, exporters, commands, and
      theme packs with fallback UI. Treat plugins as trusted/in-process until 024:PLG isolation and permission grants
      land.
- [ ] **INK-016 (Core/Compose)** Test huge vaults/documents, Unicode width/grapheme cases, rapid navigation, watch
      races, autosave conflicts, corrupt drafts, link/index consistency, history recovery, command denial/cancel, secret
      redaction, narrow editor/preview layouts, terminal/browser snapshots, and clean provider disposal.

**Library spotlight:** FileExplorer/tree/tabs/breadcrumbs, TextBox, public Markdown, data query/virtual lists/tables,
forms/field arrays, routes/screens/modals, tiled windows, history/journal/checkpoints, workers/cache/resources,
persistent stores, process/PTY terminal workspaces, themes, keymaps/commands, Canvas, plugins, permissions, and tests.

**Useful precedents:** the Markdown example in `README.md`, `examples/app_shell.ts`, `examples/theme_workspace.ts`,
`examples/cached_resource.ts`, and the terminal workspace in `app/api_workbench.ts`.

### Inkstone delivery progress

- [x] **Fixture-first vertical slice:** the initial implementation under `examples/showcases/inkstone/` covers the
      reusable showcase manifest/provider/session boundary, a deterministic in-memory vault, note tabs and navigation,
      guarded editing with undo/redo and optimistic saves, Markdown preview, outline/backlink/link indexing, search,
      diagnostics, responsive tiled terminal composition, and pilot-driven tests.
- [x] **Editor and durable-recovery v2 bounded slice:** `TextBox` now provides visible grapheme-safe ranges,
      selection-aware atomic edits, terminal-cell-aware Unicode projection, and resource-bounded literal current-note
      find/replace; Inkstone composes the APIs into a focused find/replace bar, transient per-tab selection, atomic
      history boundaries, latest-wins persistence coalescing, explicit permission-declared primary/temp/backup JSON
      terminal sessions, deterministic memory fallback, awaited shutdown, visible persistence status, and redacted draft
      recovery/conflict diagnostics.
- [x] **Advanced-window terminal reference slice:** Inkstone now renders its responsive tiled and floating windows from
      the shared host, including titlebar controls, captured move/resize and separator gestures, detach/dock,
      minimize/shelf restore, always-on-top, window-only undo/redo, projection-aware task switching, compact route
      policy, bidirectional host/component focus, row-level pointer targets, and committed-only Session V2 restoration.
- [ ] **Still required for INK-001 through INK-016:** live permissioned filesystem/watch adapters, browser-host proof, a
      full clipboard/selection-edge-scroll/syntax/gutter editor, preview link activation and source synchronization,
      incremental/worker indexing, structured metadata forms, debounced autosave plus compare/merge/reload UI,
      graph/task/citation workspaces, gated Git/build/export tools, plugin/theme packs, and
      large-vault/performance/accessibility coverage. Keep these gaps explicit; the fixture provider and durable session
      adapter are real reference paths, not claims that the live vault or full INK-003/INK-009 contracts are complete.
      Browser window rendering and the remaining flagship acceptance matrix stay open under SHR-006 and SHOW-WIN-001.

## 10. DungeonOS — Deterministic Roguelike Command Center

**Product outcome:** a complete, seeded turn-based game whose world, modal workflows, inventory, quests, combat log,
replay/checkpoints, optional 3D ASCII bestiary, mods, themes, and spectator view stress the application framework
without requiring a network service.

**Hero workflow:** resume a migrated save, traverse a large dungeon with keyboard or pointer targeting, open inventory
and quest windows during combat, craft and equip an item, inspect a boss in the 3D ASCII bestiary, finish the encounter,
rewind and replay it turn by turn from a checkpoint, branch the saved scenario, and open a read-only spectator view.

- [ ] **DUNGEON-001 (Compose)** Define a deterministic, versioned campaign model with stable entity IDs, seeded random
      streams, maps, turns, player/party, inventory, equipment, skills, quests, encounters, effects, content packs,
      migrations, save slots, and fixture campaigns.
- [ ] **DUNGEON-002 (Core/Compose)** Render a large scrolling map with layered terrain, entities, items, fog,
      visibility, targeting/path overlays, effects, viewport clipping, minimap, dirty-region updates, spatial picking,
      and keyboard cursor using Canvas, custom draw objects, `View`, and spatial indexing.
- [ ] **DUNGEON-003 (Core/Compose)** Implement exploration, targeting, inventory, dialogue, shop, crafting, and debug
      input modes with layered/modal keymaps, leader sequences, pointer capture, lifecycle reconciliation, focus scopes,
      command palette parity, remapping/conflict inspection, and contextual key help.
- [ ] **DUNGEON-004 (Core/Compose)** Offload procedural generation, pathfinding, field of view, AI planning, loot
      tables, and simulation previews to workers/tasks/deadlines with deterministic inputs, cancellation, latest-result
      guards, and workload diagnostics.
- [ ] **DUNGEON-005 (Core/Compose)** Build turn-based movement/combat with explicit action costs, previews, targeting,
      damage/status resolution, AI turns, interruption/cancel rules, log messages, toasts, metric series, animation
      policy, and invariant checks.
- [ ] **DUNGEON-006 (Core/Compose)** Build character, equipment, inventory, crafting, skills/spells, quests, journal,
      bestiary, map legend, and party workspaces from tables, virtual lists, trees, tabs, forms, field arrays, progress,
      gauges, combo/radio/check controls, and context menus.
- [ ] **DUNGEON-007 (Core/Compose)** Use screens and typed modal results for dialogue, shops, level transitions,
      character creation, confirmations, rewards, game over, settings, help, and save/load while preserving focus and
      deterministic suspend/resume order.
- [ ] **DUNGEON-008 (Core/Compose)** Make map, inventory, character, quests, bestiary, combat log, minimap, inspector,
      metrics, and diagnostics persistent dockable windows with layout undo, fullscreen focus, compact projection, and
      role-specific saved layouts.
- [ ] **DUNGEON-009 (Core/Compose)** Journal every accepted game command with causal/turn metadata, checkpoint campaign
      state, enforce retention, verify replay hashes, expose turn-by-turn replay controls, and treat UI-only state as
      separate from authoritative simulation state.
- [ ] **DUNGEON-010 (Compose/Gap)** Add branch-from-checkpoint, compare outcomes, named timelines, replay export/import,
      and divergence diagnostics. General branching history is a candidate gap; the initial implementation can clone a
      versioned campaign snapshot explicitly.
- [ ] **DUNGEON-011 (Core/Compose)** Add optional `ThreeAscii` boss, artifact, and environment previews with
      block/glyph/ mixed profiles, effects, resize/fullscreen/minimize handling, renderer diagnostics, and useful
      non-WebGPU fallback.
- [ ] **DUNGEON-012 (Core/Compose)** Add semantic theme packs and content skins, high-contrast/low-color/monochrome
      modes, reduced-motion setting, non-color status markers, configurable animation speed, and optional provider-owned
      audio without making sound necessary for play.
- [ ] **DUNGEON-013 (Core/Compose/Gap)** Define mod slots for encounters, items, quests, commands, inspectors,
      renderers, and themes with deterministic ordering, provenance, fallback content, save compatibility, and failure
      isolation. Keep mods trusted/in-process until 024:PLG/SEC isolation and grants land.
- [ ] **DUNGEON-014 (Core/Compose)** Add a consentful read-only browser/remote spectator with capability negotiation,
      selected public panels, reconnect, bounded frames, no secret/debug state, and host-controlled input promotion; do
      not claim multiplayer synchronization.
- [ ] **DUNGEON-015 (Core/Compose)** Add developer diagnostics for seed, turn, entity counts, worker/task ownership,
      cache, render/frame/dirty-region statistics, replay hash, recent errors, and optional terminal console without
      leaking controls into ordinary player mode.
- [ ] **DUNGEON-016 (Core/Compose)** Pilot complete seeded battles and test save migrations, replay equality, pointer/
      keyboard targeting, focus traps, worker cancellation, huge maps/inventories, mod failure/missing content, renderer
      fallback, compact layouts, spectator redaction, terminal/browser snapshots, performance, and disposal.

**Library spotlight:** Canvas/dirty regions/spatial index, all input/focus/keymap layers, commands, screens/typed
modals, windows/overlays, tables/lists/trees/tabs/forms/feedback, logs/metrics, Three ASCII, themes,
workers/tasks/virtual clocks, history/journal/checkpoints/persistence, plugins, remote/browser hosts, and deterministic
pilots.

**Useful precedents:** `examples/window_manager_demo.ts`, `examples/three_ascii.ts`, `app/neon_three.ts`,
`examples/runtime_workloads.ts`, and the action-journal/checkpoint tests.

## Component Coverage Ledger

Every component in the generated 39-entry catalog has a meaningful job below. `Markdown` and `TerminalOutput` are also
included because they are public app surfaces even though they are not currently catalog entries.

| Public component | Non-token use in the showcase program                                                        |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `Box`            | panel backgrounds, selected regions, map/graph nodes, tool surfaces in every app             |
| `Label`          | form labels, metric/status captions, inspectors, window chrome in every app                  |
| `Text`           | retained styled text, canvas annotations, raw cell content in GlyphForge and all workbenches |
| `Button`         | transports, job actions, query controls, incident/dispatch actions, modal decisions          |
| `CheckBox`       | file conflict policy, layer visibility, filter toggles, playlist/query/incident options      |
| `ComboBox`       | devices/presets, provider/root selection, render profiles, SQL types, node options           |
| `Input`          | paths, filters, search, names, parameters, coordinates, command arguments                    |
| `TextBox`        | filters, SQL, Markdown, notes, expressions, annotations, logs/search details                 |
| `Slider`         | volume/EQ/seek, camera/time, zoom, opacity, simulation speed, animation scrub                |
| `RadioGroup`     | overwrite policy, render/profile choice, transaction/dispatch modes, game options            |
| `List`           | compact queues, recent items, command/source lists, small inventories                        |
| `VirtualList`    | huge playlists/directories/packets/results/nodes/search results/inventories                  |
| `Table`          | scrollable operational, telemetry, metadata, and result surfaces                             |
| `DataTable`      | filtering/sorting/paging/keyed selection in Pathfinder, PacketGlass, QueryFoundry, MetroOps  |
| `Tree`           | media/schema/protocol/layer/workflow/vault/quest/object hierarchies                          |
| `FileExplorer`   | media/vault/path fixture presentation in NeonAmp, Pathfinder, and Inkstone                   |
| `LogViewer`      | jobs, decoder events, query notices, workflow runs, transit dispatch, combat/runtime logs    |
| `MetricSeries`   | audio meters, capture rate, query/runtime health, transit KPIs, workflow/game/render metrics |
| `Tabs`           | documents, inspectors, streams, query results, object views, game workspaces                 |
| `Breadcrumbs`    | filesystem, schema, route, protocol field, vault note, and workflow navigation               |
| `Stepper`        | conflict resolution, connection/setup, mission plans, incident response, character creation  |
| `MenuBar`        | complete discoverable top-level command surface in the shared shell                          |
| `KeyHelp`        | active global/focus/modal/leader bindings and mode hints in every app                        |
| `CommandPalette` | searchable command parity, navigation, saved objects, tools, and recovery actions            |
| `ContextMenu`    | row/tree/canvas/window-specific commands with keyboard and pointer parity                    |
| `Modal`          | typed confirmations, results, forms, escalations, conflicts, dialogue, and errors            |
| `ToastStack`     | non-blocking completion, warning, alert, disconnect, and recovery notifications              |
| `EmptyState`     | no data, loading, permission denied, unsupported capability, disconnected, and error states  |
| `Spinner`        | indeterminate scan/connect/decode/query/index/analyse/import work                            |
| `ProgressBar`    | seek/buffering, file/export jobs, scans, workflow nodes, scenario/turn progress              |
| `StatusBar`      | focused object, mode, selection, provider health, permission, queue, route, and key state    |
| `Sparkline`      | audio, packet, query, workflow, transit, orbital, and renderer trends                        |
| `Gauge`          | VU/load/capacity/health/progress/character statistics                                        |
| `Chart`          | honest compact bar summaries while 024:VIS owns richer analytical plots                      |
| `ThreeAscii`     | Orbital Command's primary scene and optional DungeonOS/NeonAmp visualizers                   |
| `Frame`          | titled/bordered panels, inspectors, previews, status and modal composition                   |
| `WindowManager`  | persistent multi-panel workspaces, focus/order/fullscreen/chrome across flagship apps        |
| `ScrollArea`     | preview, help, Markdown, forms, long inspectors, timelines, and report surfaces              |
| `Pad`            | large off-screen text/cell viewports, terminal output, hex/code/preview foundations          |
| `Markdown`       | lyrics, reports, notes, docs, query/schema summaries, case evidence, help                    |
| `TerminalOutput` | jobs/tools, query notices, workflow runs, Git/build tools, diagnostics and developer console |

## Consolidated Gap And Adapter Register

This register prevents showcase work from either overstating current support or scattering the same missing primitive
through several applications.

| ID                 | Class               | Honest current boundary                                                                                                                                                                                                                                                                                | Roadmap / promotion rule                                                                                                        | Affected apps                                                 |
| ------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `SHOW-WIN-001`     | Adoption gap        | Floating geometry, resize, snap, groups, focus tiers, recovery, V2 persistence, gesture history, shared chrome/shelf/switcher semantics, normalized input, and the Inkstone terminal reference work under one markup workspace owner; production browser rendering and flagship acceptance remain open | Close after browser keyboard/pointer/accessibility coverage, performance budgets, and NeonAmp/FlowPlant/Orbital acceptance land | NeonAmp, FlowPlant, Orbital Command                           |
| `SHOW-DND-001`     | Core gap            | Pointer capture exists; semantic typed DnD, drag ghost, target policy, and auto-scroll do not                                                                                                                                                                                                          | 024:INP-008                                                                                                                     | Pathfinder, FlowPlant, GlyphForge                             |
| `SHOW-GESTURE-001` | Core gap            | Raw mouse/touch/pen events and capture exist; pan/pinch/tap recognizers do not                                                                                                                                                                                                                         | 024:INP-007                                                                                                                     | FlowPlant, MetroOps, Orbital Command, GlyphForge              |
| `SHOW-EDITOR-001`  | Core gap            | `TextBox` and Markdown are usable; full editor selection/clipboard/scrolling, Tree-sitter, gutters, code/diff remain incomplete                                                                                                                                                                        | 023:V1 plus 024:TXT/INP                                                                                                         | Inkstone, QueryFoundry, Pathfinder                            |
| `SHOW-HEX-001`     | Core gap            | Retained styled cells, Pad, hit targets, and pointer capture are foundations; reusable linked byte inspection is absent                                                                                                                                                                                | 024:WID-008                                                                                                                     | PacketGlass, Pathfinder, QueryFoundry                         |
| `SHOW-VIS-001`     | Core gap            | metric history, sparkline/gauge/basic bar chart work; scientific scales/series/interaction/export do not                                                                                                                                                                                               | 024:VIS-001..010                                                                                                                | Orbital Command, PacketGlass, MetroOps, NeonAmp, QueryFoundry |
| `SHOW-GRAPH-001`   | Candidate core gap  | Canvas, dirty regions, spatial index, and custom draw objects work; graph model/layout/routing/picking/minimap do not                                                                                                                                                                                  | Prove a shared contract in FlowPlant, then reuse in MetroOps, PacketGlass, Inkstone before promotion                            | FlowPlant, MetroOps, PacketGlass, Inkstone                    |
| `SHOW-CELLS-001`   | Candidate core gap  | Retained frames and differential sinks work; editable layered cell grid and 2D selection/composition do not                                                                                                                                                                                            | Prove in GlyphForge; promote only reusable rendering/selection pieces                                                           | GlyphForge, DungeonOS                                         |
| `SHOW-DATA-001`    | Core gap            | page queries, keyed tables, vertical virtual lists work; cursor/infinite streams and advanced grid columns do not                                                                                                                                                                                      | 024:DAT-007/008 and productivity-widget follow-ups                                                                              | PacketGlass, QueryFoundry, Pathfinder, MetroOps               |
| `SHOW-TREE-001`    | Candidate core gap  | supplied hierarchical rows work; reusable async lazy-child loading/error/refresh does not                                                                                                                                                                                                              | Prove identical needs across Pathfinder, QueryFoundry, PacketGlass                                                              | Pathfinder, QueryFoundry, PacketGlass, Inkstone               |
| `SHOW-IMAGE-001`   | Candidate core gap  | Kitty graphics and raw image frames exist; one cross-backend image component/codec surface does not                                                                                                                                                                                                    | Start with the shared preview facade; promote only after terminal/browser capability policy is clear                            | NeonAmp, Pathfinder, GlyphForge, Orbital Command              |
| `SHOW-ANIM-001`    | Core gap            | render loops and timers work; reusable numeric/color/offset timelines and keyframes do not                                                                                                                                                                                                             | 023:C1                                                                                                                          | GlyphForge, DungeonOS, NeonAmp, MetroOps                      |
| `SHOW-JOBS-001`    | Core gap            | tasks, deadlines, schedulers, channels, progress widgets, and commands compose an initial solution                                                                                                                                                                                                     | 024:AUT-001..010 for typed invocation/progress/dry-run/background jobs                                                          | Pathfinder, FlowPlant, QueryFoundry, GlyphForge               |
| `SHOW-PLUGIN-001`  | Core gap            | app plugins and typed host-owned slots work in-process                                                                                                                                                                                                                                                 | 024:PLG/SEC for manifests, permission diff/grants, isolation, migrations, signed catalogs                                       | FlowPlant, QueryFoundry, DungeonOS, GlyphForge                |
| `SHOW-A11Y-001`    | Core gap            | keyboard/focus behavior is substantial; formal semantics, announcements, contrast/reduced-motion gates are incomplete                                                                                                                                                                                  | 023:T3                                                                                                                          | All ten                                                       |
| `SHOW-TAFFY-001`   | Not a blocker       | an experimental protocol adapter/probe exists; no maintained compatible runtime ships                                                                                                                                                                                                                  | 023:L2; use Simple and optional Yoga until every adoption gate passes                                                           | Shared authored layouts                                       |
| `ADAPT-FS-001`     | Host adapter        | no core filesystem enumeration/watch/mutation service                                                                                                                                                                                                                                                  | Keep provider contracts demo-side until multiple adopters prove a stable abstraction                                            | Pathfinder, Inkstone, NeonAmp                                 |
| `ADAPT-AUDIO-001`  | Host adapter        | no audio device, decoder, analyser, Web Audio, or media-session abstraction                                                                                                                                                                                                                            | Synthetic provider first; `mpv`/Web Audio behind explicit capabilities                                                          | NeonAmp                                                       |
| `ADAPT-PCAP-001`   | Host/domain adapter | no libpcap/raw-socket/PCAP codec/protocol-decoder API                                                                                                                                                                                                                                                  | Permissioned providers and fixture codecs; do not turn core UI into a capture stack                                             | PacketGlass                                                   |
| `ADAPT-DB-001`     | Host/domain adapter | no SQL drivers, pools, dialect/parser, schema, or transaction abstraction                                                                                                                                                                                                                              | Typed driver slots and fixture DB; keep dialect semantics outside generic widgets                                               | QueryFoundry                                                  |
| `ADAPT-DOMAIN-001` | Domain adapter      | orbital physics, workflow semantics, transit models, and roguelike rules are intentionally absent                                                                                                                                                                                                      | Keep domain code in its showcase unless independent adopters demonstrate reuse                                                  | Orbital Command, FlowPlant, MetroOps, DungeonOS               |

## Recommended Delivery Sequence

The sequence optimizes reusable learning, not which idea is most exciting. Each application first ships a fixture-backed
vertical slice using current Core capabilities; live providers and Gap-dependent polish follow without blocking the
offline hero scenario.

### Phase 0 — Showcase Kernel And Contracts

1. Implement SHR-001 through SHR-005 and SHR-007 through SHR-019.
2. Freeze manifest/provider/persistence envelopes, shared responsive shell, capability/permission screen, diagnostics,
   fixture conventions, and the hero-scenario test harness.
3. Keep the remaining SHR-006 browser/flagship window adoption and SHR-020 accessibility contract as visible parallel
   tracks, not hidden prerequisites.

### Phase 1 — Mature-Surface Reference Applications

1. **Inkstone** first: validates shell, routes/screens, TextBox/Markdown, provider boundaries, persistence, history, and
   terminal tools with relatively little custom drawing.
2. **Pathfinder**: hardens provider contracts, virtualized data, selection, background jobs, permissions, compensation,
   terminal workspaces, and dual-pane/window behavior.
3. **QueryFoundry**: hardens plugin/secret contracts, forms, tasks/resources, paged data, explicit side-effect barriers,
   remote use, and long-lived multi-tab workspaces.
4. **Orbital Command**: validates Three ASCII, renderer capability honesty, workers/streams, simulation time, telemetry,
   and persistent high-frequency dashboards.

### Phase 2 — Reusable Spatial And Streaming Surfaces

1. **GlyphForge**: proves the retained editable-cell, 2D selection, dirty-region, color-profile, timeline, and codec
   seams.
2. **FlowPlant**: proves shared spatial graph selection, routing, property editing, execution, debugging, and typed
   extension seams.
3. **MetroOps**: reuses spatial interaction and adds high-rate stream ingestion, linked operational data, scenario
   comparison, and visualization pressure.
4. **PacketGlass**: reuses stream/data/graph work and proves overload reporting, linked tree/hex selection, evidence
   cases, and defensive remote workflows.

### Phase 3 — Flagships And Capstone

1. **NeonAmp**: combine the hardened shell, themes, media provider, graphs/visualization, remote control, and the
   explicit floating-window track into the most visually distinctive flagship.
2. **DungeonOS**: finish as the capstone after spatial rendering, deterministic replay, plugins, themes, Three ASCII,
   remote viewing, and all shared app lifecycle contracts have been exercised elsewhere.
3. Promote `SHOW-*` candidates to core only with evidence from at least two applications or an independent adopter;
   leave audio, PCAP, SQL, orbital, transit, automation, and game semantics in providers/domain packages.

## Proposed Source Shape

Keep application code separate from reusable showcase infrastructure and from promoted library primitives:

```text
examples/showcases/
  shared/                 # shell, manifest, providers, persistence, diagnostics, testing
  neon_amp/
  pathfinder/
  orbital_command/
  packet_glass/
  glyph_forge/
  query_foundry/
  flow_plant/
  metro_ops/
  inkstone/
  dungeon_os/
tests/showcases/          # hero scenarios, fixtures, snapshots, fault and performance tests
```

No showcase should import another showcase's domain model. Shared code moves into `examples/showcases/shared/`; only a
well-tested, renderer-neutral, adopter-relevant contract moves into `src/` and a public barrel.

## Definition Of Done For Each Showcase

- [ ] Its complete hero workflow runs with deterministic fixtures and no network, device, database, or destructive
      filesystem permission.
- [ ] Every optional live provider declares requirements, reports capability denial, redacts sensitive values, cancels
      cleanly, and disposes all resources.
- [ ] Every command is accessible from an appropriate menu/palette/key surface; every active mode has key help; pointer
      operation has a keyboard path.
- [ ] Wide, medium, narrow, and minimum-supported layouts preserve focus, hit regions, essential content, and a recovery
      route; workspace restore is versioned and corrupt state is recoverable.
- [ ] Loading, empty, stale, partial, disconnected, permission-denied, retryable, and fatal states are intentionally
      rendered and tested.
- [ ] History records only genuinely replay-safe or compensatable work; external effects declare replay barriers and
      failed compensation is visible.
- [ ] Settings, state, journal, logs, exports, diagnostics, and remote views pass secret/redaction fixtures.
- [ ] Controller/unit tests, `TerminalAppPilot` hero tests, resize/input matrices, terminal snapshots, browser coverage,
      provider fault tests, virtual-time tests, and representative performance fixtures pass.
- [ ] The generated component catalog and app/plugin documentation identify which components and systems the showcase
      exercises, with direct links from the launcher and gallery.
- [ ] `deno check` passes for the showcase entry point, its focused `deno test` set passes, applicable web/remote checks
      pass, and benchmark/visual evidence is reviewed in proportion to renderer risk.
- [ ] Unsupported features remain labeled Host or Gap in UI and docs; no fixture, fallback, Taffy probe, permission
      manifest, process wrapper, or basic chart is advertised as a capability it is not.

## Program Acceptance

The program is complete only when all ten fixture-backed hero scenarios pass, the shared shell and providers are used
rather than cloned, every current catalog component has a meaningful exercised path, high-value gaps have either landed
or have honest fallbacks, terminal/browser capability differences are explicit, and the demos collectively provide
credible evidence for application lifecycle, windowing, layout/CSS, input, data, concurrency, rendering, themes,
security, persistence, remote operation, diagnostics, accessibility, and testing.
