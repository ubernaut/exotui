# World-Class TUI Feature Program

Status: active follow-on to [035-textual-opentui-feature-parity.md](./035-textual-opentui-feature-parity.md), authorized
July 16, 2026. This document contains exactly 200 implementation-grade features that extend the current repository and
the 023 roadmap. They are executed as dependency-ordered, verified batches rather than one unreviewable change.

## Scope And Ground Rules

- The live repository and ICC architecture pack were inspected on July 17, 2026. Existing controllers, widgets,
  terminal/web hosts, tiled window manager, Three ASCII renderer, layout solvers, testing helpers, themes, resources,
  workers, storage, remote terminal bridge, and release tooling are treated as the baseline.
- Features already implemented or already specified by an open checkbox in 023 are omitted. Dependencies written as
  023:ID intentionally build on that roadmap instead of restating it.
- Every item has a stable ID, priority, explicit dependency set, and a testable acceptance statement. A dash in the
  dependency field means that the current baseline is sufficient.
- P0 protects correctness or establishes a shared contract; P1 unlocks major product capability; P2 adds breadth or
  ecosystem leverage; P3 is an evidence-driven optimization or specialist surface.
- All remote, plugin, diagnostic, and support features must be explicit, consent-based, least-privilege, and
  content-redacting by default. Hidden monitoring, credential collection, coercive tooling, and surveillance are out of
  scope.

## Progress Snapshot

As of Aug 16, 2026, 105 of 200 features are verified and checked. Landed Aug 16: TXT-004 through TXT-010, LOC-001
through LOC-009, INP-002 through INP-005, INP-007, INP-008, INP-009, FRM-003 through FRM-010, ASY-002, ASY-004, ASY-007,
ASY-009, DAT-004 through DAT-010, NAV-003 through NAV-010, HIS-005, HIS-008, HIS-010, AUT-001, AUT-003, AUT-004, and
AUT-007. Earlier: TXT-001 through TXT-003, INP-001, INP-006, INP-010, DAT-001 through DAT-003, FRM-001, FRM-002,
NAV-001, NAV-002, HIS-001 through HIS-004, HIS-006, HIS-007, HIS-009, ASY-001, ASY-003, ASY-005, ASY-006, ASY-010,
SEC-001, SEC-006 through SEC-008, and REM-001. The remaining 95 items stay open below; a checked box means its
implementation, focused tests, public export review, and relevant repository gates passed.

## Feature Backlog

### Unicode Text And Cell Semantics

- [x] **TXT-001 (P0; deps: —)** Add a generated, version-pinned Unicode data pack with its Unicode version exposed at
      runtime and an update command that produces a reviewed data diff. **Accept:** a fixture can select the old or new
      pack deterministically, and CI rejects unreviewed table drift.
- [x] **TXT-002 (P0; deps: TXT-001)** Implement UAX #29 extended-grapheme segmentation as the sole cursor, deletion,
      selection, and truncation boundary primitive. **Accept:** the official GraphemeBreakTest corpus passes and no
      editing operation splits a cluster.
- [x] **TXT-003 (P0; deps: TXT-001, TXT-002)** Introduce named terminal-width profiles that tailor UAX #11 ambiguous,
      combining, private-use, and unassigned characters without mutating global state. **Accept:** each profile reports
      its policy and passes a shared width corpus in terminal and browser hosts.
- [x] **TXT-004 (P0; deps: TXT-001, TXT-002, TXT-003)** Resolve complete UTS #51 emoji sequences, variation selectors,
      keycaps, flags, tag sequences, and ZWJ families as one measured cell span. **Accept:** emoji-test data yields
      stable cluster counts and configured widths across chunk boundaries.
- [x] **TXT-005 (P0; deps: TXT-002, TXT-003)** Add an immutable text index mapping UTF-16 offsets, code points,
      graphemes, cells, and source byte offsets. **Accept:** every conversion round-trips where representable and
      returns an explicit boundary result otherwise.
- [x] **TXT-006 (P1; deps: TXT-001, TXT-002, TXT-003)** Implement UAX #14 line-break opportunities with locale-tailoring
      hooks and terminal-specific emergency wrapping. **Accept:** LineBreakTest passes, forced breaks remain lossless,
      and wrapping never separates a grapheme.
- [x] **TXT-007 (P2; deps: TXT-006, LOC-001)** Define a lazy hyphenation-provider interface with language tags,
      soft-hyphen preservation, and a no-dictionary fallback. **Accept:** providers can be unloaded, line measurement
      remains deterministic, and copied text reconstructs the original string.
- [x] **TXT-008 (P1; deps: TXT-001, TXT-002, TXT-005, 023:L1)** Add UAX #9 paragraph layout that preserves logical
      storage while exposing visual runs and hit-test mappings. **Accept:** official bidi fixtures and mixed RTL/LTR
      selection tests round-trip logical and visual positions.
- [x] **TXT-009 (P1; deps: TXT-008)** Add a UTS #55 source-code display mode that isolates lexical atoms and visibly
      diagnoses bidi controls, confusables, and disguised line breaks. **Accept:** security fixtures cannot make
      distinct token streams render as an indistinguishable line without a warning.
- [x] **TXT-010 (P1; deps: TXT-002, TXT-003, TXT-005)** Replace ad hoc tab/control handling with configurable tab stops,
      visible-control renderers, and reversible cell mappings. **Accept:** cursor movement, selection, wrapping, and
      copy agree for default and custom tab-stop sets.

### Localization And Locale Services

- [x] **LOC-001 (P1; deps: TXT-001)** Add an immutable locale context with canonicalization, requested/supported
      negotiation, fallback chains, time zone, numbering system, and calendar. **Accept:** resolution is deterministic
      for malformed, partial, and region-specific tags and is inspectable without loading UI code.
- [x] **LOC-002 (P1; deps: LOC-001)** Add namespaced, versioned message-bundle loading with lazy locale chunks and
      explicit fallback provenance. **Accept:** duplicate keys, incompatible bundle versions, and fallback hits produce
      structured diagnostics.
- [x] **LOC-003 (P1; deps: LOC-001, LOC-002)** Compile and render Unicode MessageFormat 2 messages, including selectors,
      plural categories, local variables, and safe custom-function registration. **Accept:** conformance fixtures
      produce stable parts and unregistered functions fail before rendering.
- [x] **LOC-004 (P1; deps: LOC-001)** Provide cached locale-aware number, date/time, relative-time, duration, list,
      unit, and display-name formatters behind one disposable registry. **Accept:** cache keys include every semantic
      option and formatter output matches the host Intl implementation.
- [x] **LOC-005 (P2; deps: LOC-002, LOC-003, LOC-004, TXT-003)** Support long, short, and narrow localized variants
      selected by measured cell width rather than string length. **Accept:** resize tests choose the widest fitting
      variant without oscillation or mid-cluster clipping.
- [x] **LOC-006 (P1; deps: LOC-001, LOC-002, LOC-003)** Make locale changes reactive and transactional across messages,
      formatters, layout measurement, and widget state. **Accept:** one locale switch produces one coherent frame and
      preserves focus, selection, and form values.
- [x] **LOC-007 (P2; deps: LOC-001, TXT-008, 023:L1)** Allow a subtree to override language, locale, and base direction
      while inheriting unspecified preferences. **Accept:** nested locale fixtures isolate formatting and direction
      without changing sibling layout.
- [x] **LOC-008 (P1; deps: LOC-002, LOC-003)** Add extraction and validation tooling for message IDs, parameters,
      selector exhaustiveness, stale keys, and untranslated defaults. **Accept:** CI emits source locations and fails on
      parameter-shape drift.
- [x] **LOC-009 (P1; deps: LOC-006, LOC-008, TXT-008)** Ship expansion, accented, mirrored-RTL, and mixed-script
      pseudo-locales for layout and bidi stress testing. **Accept:** every workbench surface runs under each
      pseudo-locale with no missing-key fallback.
- [x] **LOC-010 (P2; deps: LOC-002, OBS-004, SEC-008)** Add privacy-safe missing-translation telemetry containing key,
      locale, bundle version, and fallback path but never runtime parameter values. **Accept:** redaction tests prove
      user-supplied message data cannot enter reports.

### Composition, Pointer, And Rich Input

- [x] **INP-001 (P0; deps: —)** Define a canonical input envelope with monotonic sequence, timestamp, source kind,
      device kind, trust level, modifiers, and optional raw payload. **Accept:** terminal, browser, remote, and test
      adapters serialize to the same versioned shape.
- [x] **INP-002 (P0; deps: TXT-002, TXT-005, INP-001)** Add composition start/update/commit/cancel events and a preedit
      range that never mutates the committed value prematurely. **Accept:** cancelled and committed compositions
      preserve grapheme boundaries and undo as one transaction.
- [x] **INP-003 (P1; deps: INP-002)** Map browser beforeinput, input, composition, and selection events into the
      canonical editing transaction order. **Accept:** Chromium/WebKit-compatible fixture traces do not double-insert
      committed IME text.
- [x] **INP-004 (P2; deps: INP-002)** Define a terminal preedit provider boundary for hosts that can supply IME state,
      with an explicit unsupported fallback for ordinary TTYs. **Accept:** the core never claims terminal IME support
      without a provider and provider disposal clears preedit state.
- [x] **INP-005 (P1; deps: INP-001, INP-002, TXT-002)** Add dead-key and configurable compose-sequence processing before
      command dispatch. **Accept:** timeout, cancellation, invalid sequence, and successful composition fixtures yield
      deterministic text and key events.
- [x] **INP-006 (P1; deps: INP-001)** Normalize mouse, touch, pen, pressure, buttons, and coordinates into a pointer
      event contract with capture ownership. **Accept:** equivalent mouse and touch interactions drive the same
      controller state in browser tests.
- [x] **INP-007 (P2; deps: INP-006)** Add bounded tap, long-press, pan, and pinch recognizers that emit semantic
      gestures without hiding raw pointer events. **Accept:** thresholds are configurable, cancellation releases
      capture, and mouse fallback remains intact.
- [x] **INP-008 (P2; deps: INP-001, INP-006, SEC-001)** Add typed drag-and-drop payloads for text, files, and
      application data with host policy checks before reads. **Accept:** denied files expose metadata only, accepted
      drops are cancellable, and browser/Kitty-capable adapters share events.
- [x] **INP-009 (P1; deps: INP-001, TXT-002)** Stream large pastes through configurable byte, line, and rate limits
      while preserving one logical paste transaction. **Accept:** oversized input is rejected or truncated by declared
      policy without freezing the render loop.
- [x] **INP-010 (P0; deps: INP-001, INP-006)** Reconcile focus loss, transport disconnect, and capture disposal by
      synthesizing only the required release/cancel events. **Accept:** no key, pointer button, gesture, or drag remains
      stuck after every lifecycle path.

### Query, Cache, Mutation, And Offline Data

- [x] **DAT-001 (P0; deps: —)** Add a process-local resource cache coordinator with structural keys, ownership counts,
      subscriptions, and inspectable entries. **Accept:** equivalent requests share one entry and the last owner
      releases it without invalidating active readers.
- [x] **DAT-002 (P1; deps: DAT-001)** Add stale time, retention time, refresh-on-focus/reconnect, and
      stale-while-revalidate policies driven by an injectable clock. **Accept:** virtual-time tests prove each
      transition and never replace usable data with a transient loading blank.
- [x] **DAT-003 (P1; deps: DAT-001)** Deduplicate concurrent loads and expose join, supersede, and force-new policies.
      **Accept:** N identical callers invoke one loader, receive independently cancellable handles, and settle
      consistently.
- [x] **DAT-004 (P1; deps: DAT-001, ASY-003, ASY-004)** Add retry classification, exponential backoff with jitter,
      retry-after support, and a per-origin circuit breaker. **Accept:** permanent errors do not retry, deadlines stop
      retries, and circuit state is observable.
- [x] **DAT-005 (P1; deps: DAT-001, HIS-003)** Add typed mutation resources with optimistic patches, server
      reconciliation, and automatic rollback. **Accept:** overlapping mutation fixtures preserve ordering and a failed
      mutation reverts only its own patch.
- [x] **DAT-006 (P1; deps: DAT-001, DAT-005)** Add hierarchical cache tags and predicate invalidation with batch
      notifications. **Accept:** invalidating one tag refreshes exactly the matching live entries in a single state
      transaction.
- [x] **DAT-007 (P1; deps: DAT-001, DAT-003)** Add cursor-based and bidirectional infinite-query controllers alongside
      page-number queries. **Accept:** duplicate cursors are suppressed, page order is stable, and evicted pages restore
      scroll anchors.
- [x] **DAT-008 (P2; deps: DAT-001, ASY-005, ASY-006)** Consume AsyncIterable and push subscriptions as resources with
      bounded buffering and reconnect hooks. **Accept:** slow consumers apply the configured loss/backpressure policy
      and cancellation closes the producer.
- [x] **DAT-009 (P2; deps: DAT-005, DAT-008, SEC-001)** Add an encrypted-capable offline mutation queue with idempotency
      keys, dependency ordering, and explicit user review. **Accept:** reconnect replay is deterministic, duplicate
      acknowledgements are harmless, and sensitive payloads are not persisted by default.
- [x] **DAT-010 (P2; deps: DAT-005, DAT-009)** Define pluggable conflict resolvers for reject, last-write, field merge,
      and application-owned three-way merge. **Accept:** every conflict retains both versions until a declared
      resolution succeeds.

### Advanced Forms And Schema-Driven Editing

- [x] **FRM-001 (P1; deps: —)** Extend field names into typed nested object paths with immutable get/set helpers and
      path-aware diagnostics. **Accept:** registration, errors, dirty state, reset, and serialization work for nested
      records.
- [x] **FRM-002 (P1; deps: FRM-001, HIS-001)** Add field arrays with stable item IDs and insert, remove, move,
      duplicate, and reset operations. **Accept:** reordering preserves touched/errors/focus by item ID and participates
      in one undo transaction.
- [x] **FRM-003 (P1; deps: FRM-001, ASY-003)** Add abortable asynchronous field and schema validators with revision
      guards. **Accept:** stale completions cannot overwrite newer results and submit waits only for the active
      revision.
- [x] **FRM-004 (P1; deps: FRM-001, FRM-003)** Build an explicit field-dependency graph for conditional visibility,
      enablement, derived values, and revalidation. **Accept:** cycles are diagnosed and a source edit recomputes each
      affected field at most once.
- [x] **FRM-005 (P2; deps: FRM-003)** Support per-field validation timing policies for change, blur, idle, submit, and
      manual modes. **Accept:** fake-clock tests observe exactly the configured validation schedule.
- [x] **FRM-006 (P1; deps: FRM-003, ASY-001)** Add a submission state machine covering validating, submitting,
      succeeded, failed, cancelled, and resubmitting with double-submit prevention. **Accept:** every transition is
      inspectable and cancellation restores a submittable state.
- [x] **FRM-007 (P1; deps: FRM-001, FRM-006)** Map structured server errors to fields, groups, and form-level summaries
      while preserving unknown errors. **Accept:** focus-next-error visits visible enabled fields in deterministic order
      and keeps a form-level fallback.
- [x] **FRM-008 (P2; deps: FRM-001, DAT-002, SEC-008)** Add versioned draft autosave with debounce, migrations,
      expiration, and explicit handling for sensitive fields. **Accept:** corrupt or old drafts never overwrite live
      values and secret fields default to excluded.
- [x] **FRM-009 (P2; deps: FRM-001, HIS-001, HIS-002)** Provide field and form checkpoints with undo/redo coalescing
      tailored to text edits and structural changes. **Accept:** one typing burst undoes coherently while paste and
      field-array operations remain atomic.
- [x] **FRM-010 (P2; deps: FRM-001, FRM-002, FRM-004)** Render a bounded JSON Schema 2020-12 subset into existing
      controllers through an overridable widget registry. **Accept:** unsupported vocabulary emits source-located
      diagnostics and schema validation matches submitted values.

### Typed Routing And Navigation Workflows

- [x] **NAV-001 (P1; deps: —)** Replace string-only route identity with a serializable location containing route ID,
      path params, query, fragment, and typed state. **Accept:** parsing and formatting round-trip reserved characters
      in terminal and browser hosts.
- [x] **NAV-002 (P1; deps: NAV-001)** Add compiled route patterns with typed parameter codecs, ranking, and ambiguity
      diagnostics. **Accept:** a static route beats a parameter route and invalid parameters cannot activate a route.
- [x] **NAV-003 (P1; deps: NAV-001, NAV-002, 023:W1)** Add nested route trees and named outlets without creating a
      second screen stack. **Accept:** parent lifecycle and outlet focus order remain deterministic during child
      replacement.
- [x] **NAV-004 (P1; deps: NAV-001, ASY-001)** Add ordered synchronous/asynchronous guards that can allow, cancel, or
      redirect with loop detection. **Accept:** concurrent navigation aborts obsolete guards and a redirect cycle yields
      one structured error.
- [x] **NAV-005 (P1; deps: NAV-001, DAT-001, ASY-001)** Add route-owned abortable loaders and actions whose resources
      dispose with the route scope. **Accept:** leaving a route cancels work and late results cannot update the new
      route.
- [x] **NAV-006 (P1; deps: NAV-003, NAV-005)** Add route-level error and not-found boundaries with retry and parent
      fallback. **Accept:** one failing outlet does not destroy sibling state or the global window layout.
- [x] **NAV-007 (P2; deps: NAV-002, NAV-005, DAT-002)** Prefetch route code and data from explicit intent signals such
      as focus, hover, or command search. **Accept:** prefetch obeys budget/cancellation policy and activation reuses
      valid results.
- [x] **NAV-008 (P1; deps: NAV-004, FRM-006)** Add composable unsaved-change blockers that return an inspectable reason
      and use the existing modal stack for confirmation. **Accept:** multiple blockers resolve in stable order and
      forced teardown never awaits UI.
- [x] **NAV-009 (P1; deps: NAV-001, TXT-005, 023:W1)** Restore route-owned focus, selection, and scroll anchors after
      back/forward and screen-mode transitions. **Accept:** missing targets fall back safely and hidden/minimized
      windows never receive focus.
- [x] **NAV-010 (P2; deps: NAV-001, NAV-009, HIS-006)** Add a versioned navigation journal that can map browser URLs and
      terminal deep-link strings to the same location. **Accept:** private state is excluded by schema and old entries
      migrate or fail closed.

### Transactional History And Deterministic Replay

- [x] **HIS-001 (P0; deps: —)** Add nestable transaction scopes that commit a group atomically or discard it without
      exposing partial history. **Accept:** nested sync/async operations produce one entry and disposal without commit
      leaves both stacks unchanged.
- [x] **HIS-002 (P1; deps: HIS-001)** Add configurable coalescing by key, idle interval, and semantic boundary.
      **Accept:** typing, resize drags, and repeated increments each coalesce independently under a fake clock.
- [x] **HIS-003 (P0; deps: HIS-001)** Make apply, undo, and redo failure-atomic with compensation and a poisoned-state
      diagnostic when compensation also fails. **Accept:** injected failures never silently advance a stack.
- [x] **HIS-004 (P1; deps: HIS-001, HIS-003)** Define side-effect barriers that require external operations to supply
      idempotency, compensation, or an explicit non-replayable marker. **Accept:** unsafe transactions cannot enter
      replayable history accidentally.
- [x] **HIS-005 (P2; deps: HIS-001)** Support named history branches and checkpoints for exploring alternatives without
      destroying redo state. **Accept:** switching branches restores the exact checkpoint and exposes divergent entry
      IDs.
- [x] **HIS-006 (P1; deps: —)** Add a versioned action journal with monotonic revisions, causal metadata, and
      deterministic serialization. **Accept:** replaying pure actions from the same initial snapshot yields
      byte-identical state.
- [x] **HIS-007 (P2; deps: HIS-006)** Add opt-in state snapshots at journal checkpoints with component-owned
      serializers. **Accept:** snapshot plus tail replay equals full replay and unsupported state is reported rather
      than guessed.
- [x] **HIS-008 (P2; deps: HIS-006, HIS-007, SEC-008)** Persist journals through a redaction-aware store with schema
      migrations and application-defined retention. **Accept:** sensitive fields are excluded before serialization and
      migration failure preserves the original bytes.
- [x] **HIS-009 (P1; deps: HIS-001, HIS-006)** Enforce count, byte, and age budgets with checkpoint-aware pruning.
      **Accept:** pruning never removes the base needed by retained entries and reports reclaimed cost.
- [x] **HIS-010 (P2; deps: HIS-003, HIS-006, HIS-007, HIS-008)** Add crash-recovery replay that stops at the first
      invalid or non-idempotent action and offers a safe partial restore. **Accept:** torn-write fixtures cannot
      duplicate external effects or corrupt the saved journal.

### Scientific And Operational Visualization

- [x] **VIS-001 (P1; deps: TXT-003)** Add reusable linear, log, symmetric-log, time, ordinal, and band scales with
      invert and nice-domain operations. **Accept:** scale/property tests cover degenerate domains, negative values,
      resize, and cell rounding.
- [ ] **VIS-002 (P1; deps: VIS-001, LOC-004)** Add collision-aware axes, ticks, grid lines, and locale-aware labels
      measured in terminal cells. **Accept:** labels never split graphemes and deterministic thinning preserves
      endpoints.
- [ ] **VIS-003 (P1; deps: VIS-001, VIS-002)** Add line, stepped-line, area, stacked-area, and scatter series to the
      existing chart surface. **Accept:** clipping, missing values, multiple scales, and zero-sized viewports have
      golden fixtures.
- [ ] **VIS-004 (P2; deps: VIS-001, THEM-006)** Add heatmap and matrix rendering with quantized color scales and
      explicit missing/outlier cells. **Accept:** truecolor, 256-color, 16-color, and monochrome outputs preserve the
      configured ordering.
- [ ] **VIS-005 (P2; deps: TXT-003, VIS-001)** Add braille, sextant, quadrant, and full-cell 2D mark backends selected
      independently from Three ASCII sampling. **Accept:** identical points map to identical logical coordinates and
      unsupported glyph sets degrade explicitly.
- [ ] **VIS-006 (P1; deps: VIS-001, ASY-008)** Add streaming min/max and LTTB-style downsampling with worker offload and
      visible-range caches. **Accept:** million-point fixtures stay within declared frame and memory budgets while
      preserving extrema.
- [ ] **VIS-007 (P1; deps: VIS-001, INP-006)** Add keyboard/pointer crosshair, nearest-point inspection, pan, zoom, and
      rectangular brushing. **Accept:** interactions are reversible, scale-aware, and expose semantic selected data
      rather than only cells.
- [ ] **VIS-008 (P2; deps: VIS-001, VIS-002)** Add annotations, threshold bands, event markers, and reference lines with
      collision policies. **Accept:** annotations remain attached through resize, pan, zoom, and data-window changes.
- [ ] **VIS-009 (P2; deps: VIS-007, DAT-008)** Link multiple charts through shared domains, cursors, brushes, and
      selection signals without cyclic updates. **Accept:** one interaction produces one revision across all linked
      views.
- [ ] **VIS-010 (P2; deps: VIS-001, VIS-003, VIS-004)** Export a chart as data, deterministic ANSI cells, SVG, and a
      structured description through one snapshot model. **Accept:** all formats declare scale/domain metadata and match
      the rendered series revision.

### High-Value Productivity Widgets

- [x] **WID-001 (P1; deps: LOC-001, LOC-004, INP-006)** Add calendar and date-range controllers with locale week rules,
      min/max dates, disabled dates, and keyboard range selection. **Accept:** daylight-saving boundaries cannot change
      the selected civil date.
- [x] **WID-002 (P2; deps: LOC-004, FRM-001)** Add time, duration, and time-zone pickers with step constraints and
      ambiguous/nonexistent local-time handling. **Accept:** DST gaps and folds require an explicit resolution and
      round-trip to a typed value.
- [x] **WID-003 (P1; deps: TXT-002, FRM-002)** Add a token/tag editor with quoted parsing, async suggestions, duplicate
      policy, reordering, and per-token validation. **Accept:** all editing and selection operations are grapheme-safe
      and undoable.
- [x] **WID-004 (P1; deps: INP-006, HIS-001)** Add a virtualized transfer-list controller with search, bulk selection,
      reorder, and move previews. **Accept:** moving filtered items preserves source order and stable IDs across both
      lists.
- [x] **WID-005 (P1; deps: FRM-001, FRM-004)** Add a property-grid widget with grouped rows, inline editors,
      reset-to-inherited, validation, and change provenance. **Accept:** editor choice is registry-driven and one
      property edit is one history transaction.
- [ ] **WID-006 (P1; deps: VIS-001, 023:T3)** Add a virtualized tree-grid combining hierarchy with sortable/resizable
      columns and pinned hierarchy cells. **Accept:** expansion, column operations, focus, and selection preserve row
      IDs over data refresh.
- [ ] **WID-007 (P1; deps: TXT-005, 023:V1)** Add a lazy JSON/YAML structured inspector with path copy, type-aware
      search, folding, and reference-cycle markers. **Accept:** large documents parse off-thread and never stringify
      cycles implicitly.
- [ ] **WID-008 (P2; deps: TXT-005, 023:V1)** Add a virtualized hex/binary viewer with byte/word grouping, endian
      interpretation, offset navigation, diff overlays, and bounded edits. **Accept:** edits map exactly to source
      offsets and cannot extend data without explicit policy.
- [ ] **WID-009 (P2; deps: INP-006, HIS-001, 023:W2)** Add a virtualized kanban board with keyboard/pointer card
      movement, swimlanes, WIP limits, and optimistic move hooks. **Accept:** rejected moves return cards to stable
      positions without losing focus.
- [ ] **WID-010 (P2; deps: VIS-001, DAT-008)** Add a virtualized event-timeline/feed widget with grouping, sticky time
      headers, live-tail policy, and jump-to-event. **Accept:** out-of-order events insert deterministically without
      moving a user who paused live-tail.

### Terminal Model Completeness And Hardening

- [x] **TERM-001 (P0; deps: TXT-001, TXT-002)** Replace chunk-local terminal decoding with an incremental UTF-8/control
      parser that preserves incomplete bytes and escape sequences between writes. **Accept:** every split point of a
      corpus produces the same screen as one contiguous write.
- [x] **TERM-002 (P0; deps: TERM-001)** Enforce configurable bounds for control-string bytes, parameters, nesting, and
      incomplete-sequence lifetime. **Accept:** adversarial streams have linear processing cost and recover to ground
      state with a diagnostic.
- [ ] **TERM-003 (P1; deps: TERM-001, TERM-002)** Expose parsed, unsupported, malformed, and ignored ECMA-48/DEC
      operations as versioned events before screen application. **Accept:** consumers can audit behavior without
      reparsing raw bytes and unknown controls remain lossless.
- [ ] **TERM-004 (P1; deps: TERM-001, TXT-003, TXT-005)** Track soft-wrap and logical-line metadata and reflow it on
      resize while preserving hard breaks and cell styles. **Accept:** shrinking then expanding reconstructs logical
      lines and stable scrollback anchors.
- [ ] **TERM-005 (P2; deps: TERM-001)** Implement protected cells and selective erase semantics independently from
      ordinary erase. **Accept:** DECSCA/DECSED/DECSEL fixtures preserve protected content exactly.
- [ ] **TERM-006 (P2; deps: TERM-001)** Implement bounded rectangular copy, fill, erase, attribute-change, and
      reverse-attribute operations. **Accept:** overlapping copy and clipped rectangle cases match DEC operation
      fixtures.
- [ ] **TERM-007 (P2; deps: TERM-001)** Add left/right margins and origin-mode interactions alongside top/bottom scroll
      regions. **Accept:** cursor addressing, insert/delete, wrap, and scrolling respect both margins.
- [ ] **TERM-008 (P3; deps: TERM-001, TXT-003)** Model double-width and double-height line attributes with explicit
      degradation in cell-only renderers. **Accept:** screen inspection retains logical attributes even when a host
      renders a documented fallback.
- [ ] **TERM-009 (P1; deps: TERM-003, ASY-003)** Add a correlated terminal query broker for DECRQSS, XTGETTCAP, device
      attributes, colors, and cell metrics with deadlines and reply ownership. **Accept:** interleaved replies resolve
      only their matching request and unsolicited input is not consumed.
- [ ] **TERM-010 (P1; deps: TERM-003)** Add tmux/screen/SSH-safe passthrough encoders with nesting limits and exact
      capability diagnostics. **Accept:** golden streams round-trip through simulated multiplexer layers without double
      escaping.

### Design Tokens And Theme Engineering

- [x] **THEM-001 (P1; deps: —)** Replace the closed semantic-token union with a typed registry that retains the seven
      existing tokens as a compatibility profile. **Accept:** packages can declare namespaced tokens without weakening
      type checking or changing old themes.
- [x] **THEM-002 (P1; deps: THEM-001)** Let components publish required/optional token schemas, defaults, and state
      coverage. **Accept:** theme validation identifies every missing token with component and state provenance.
- [x] **THEM-003 (P2; deps: THEM-001)** Add bounded computed-token expressions for reference, mix, alpha,
      lighten/darken, and conditional terminal color depth. **Accept:** cycles and unsupported functions fail during
      compilation, not during render.
- [x] **THEM-004 (P1; deps: THEM-001, THEM-003)** Add contrast constraints between semantic foreground/background token
      pairs with error and auto-repair modes. **Accept:** repairs are deterministic, reported as a diff, and never alter
      locked brand tokens.
- [x] **THEM-005 (P2; deps: THEM-001, THEM-004)** Generate tonal palettes in OKLCH from seed hues with light/dark
      surface ladders and gamut mapping. **Accept:** generated colors are in gamut and meet declared contrast
      constraints in truecolor output.
- [x] **THEM-006 (P1; deps: THEM-001, THEM-005)** Quantize semantic palettes to ANSI-256, ANSI-16, and monochrome by
      minimizing perceptual and role-collision error. **Accept:** the report lists per-token error and critical roles
      never collapse to the same style without a fallback marker.
- [x] **THEM-007 (P2; deps: THEM-001, 023:C1)** Add density and scale tokens for compact, comfortable, and
      touch-oriented component geometry. **Accept:** switching density changes declared spacing/hit targets without
      mutating application state.
- [x] **THEM-008 (P2; deps: THEM-001, 023:C1)** Add motion tokens for durations, easing, delay, and reduced-motion
      substitution. **Accept:** reduced motion resolves every nonessential transition to its declared static behavior.
- [x] **THEM-009 (P2; deps: THEM-001, TXT-003, TXT-004)** Add named icon/glyph packs with width contracts, ASCII
      fallbacks, and terminal-profile validation. **Accept:** every icon occupies its declared cells under all supported
      width profiles.
- [x] **THEM-010 (P1; deps: THEM-001, THEM-002, THEM-003)** Define a versioned JSON theme interchange schema with
      migrations and canonical formatting. **Accept:** export/import is stable, unknown required fields fail closed, and
      old manifests migrate with a reviewable report.

### Typed Commands And Safe Automation

- [x] **AUT-001 (P1; deps: —)** Extend commands with generic input, progress, result, and error types plus runtime
      descriptors for tooling. **Accept:** registry inspection exposes descriptors and invocation rejects incompatible
      input before executing.
- [x] **AUT-002 (P1; deps: AUT-001, FRM-010)** Let commands declare JSON-Schema-compatible argument definitions and
      render prompts through the form registry. **Accept:** validated prompt output is assignable to the command input
      and headless callers use the same validator.
- [x] **AUT-003 (P1; deps: AUT-001)** Add structured progress events for phases, determinate work, indeterminate work,
      messages, and nested child operations. **Accept:** progress is monotonic per phase and late events after
      settlement are ignored.
- [x] **AUT-004 (P0; deps: AUT-001, ASY-001)** Give every invocation an AbortSignal, deadline, disposal scope, and
      explicit cancellation outcome. **Accept:** cancelling a command releases owned resources and cannot be reported as
      success.
- [x] **AUT-005 (P2; deps: AUT-001, AUT-004)** Compose commands into typed sequential, parallel, conditional, and
      fan-out pipelines. **Accept:** incompatible edges fail at construction and pipeline cancellation reaches every
      active branch.
- [x] **AUT-006 (P2; deps: AUT-005, HIS-001, SEC-001)** Record reusable declarative macros from allowlisted command IDs
      and validated arguments, never arbitrary code. **Accept:** playback previews required permissions and stops
      atomically at a failed transactional step.
- [x] **AUT-007 (P1; deps: AUT-001, HIS-001)** Add dry-run/preview hooks that return a structured change set before
      mutating state or external resources. **Accept:** commands marked destructive cannot run from automation without
      preview acknowledgement or explicit host override.
- [x] **AUT-008 (P1; deps: AUT-003, AUT-004, ASY-002)** Add a background-job manager with attach/detach, pause when
      supported, retry, cancellation, and completion notifications. **Accept:** jobs survive route/window disposal only
      when explicitly detached and remain inspectable.
- [x] **AUT-009 (P2; deps: AUT-001, SEC-008)** Persist a bounded invocation history with duration, outcome, and redacted
      arguments. **Accept:** command authors must classify sensitive fields and unclassified complex inputs default to
      omitted.
- [x] **AUT-010 (P2; deps: AUT-001, AUT-009)** Add user aliases and favorites as references to command IDs plus
      validated partial arguments. **Accept:** renamed/removed commands produce migration diagnostics rather than
      executing a different command.

### Structured Concurrency And Stream Processing

- [x] **ASY-001 (P0; deps: —)** Add structured task groups with parent-child cancellation, join, fail-fast/fail-late
      policy, and deterministic disposal. **Accept:** no child outlives its group unless explicitly detached to a
      supervisor.
- [x] **ASY-002 (P1; deps: ASY-001)** Add supervisor strategies for stop, resume, restart-one, and restart-all with
      bounded restart intensity. **Accept:** repeated failure trips the configured limit and exposes the causal error
      chain.
- [x] **ASY-003 (P0; deps: ASY-001)** Add deadlines and timeout budgets that propagate remaining time through nested
      tasks and resources. **Accept:** child work cannot extend a parent deadline and fake-clock tests contain no
      wall-clock sleeps.
- [x] **ASY-004 (P1; deps: ASY-003)** Add token-bucket and leaky-bucket rate limiters with fair queued acquisition and
      abort support. **Accept:** virtual-time tests prove burst, refill, fairness, and cancellation behavior.
- [x] **ASY-005 (P0; deps: ASY-001)** Add bounded async channels with block, drop-newest, drop-oldest, conflate, and
      error overflow policies. **Accept:** producers and consumers close cleanly and inspection reports capacity, depth,
      and dropped counts.
- [x] **ASY-006 (P1; deps: ASY-005)** Add disposable AsyncIterable operators for map, filter, merge, switch-latest,
      debounce, throttle, buffer, window, and retry. **Accept:** operator cancellation closes upstream iterators and
      ordering semantics have marble tests.
- [x] **ASY-007 (P2; deps: ASY-001)** Add scheduler priority aging and optional priority inheritance for tasks blocking
      higher-priority dependants. **Accept:** low-priority work cannot starve and inheritance is removed when the
      dependency settles.
- [x] **ASY-008 (P1; deps: ASY-001, ASY-005)** Version the worker request protocol and support transfer lists, worker
      affinity, load-aware routing, and per-task deadlines. **Accept:** incompatible workers are rejected before
      dispatch and transferred buffers are not copied.
- [x] **ASY-009 (P2; deps: ASY-001)** Add task-local immutable context for trace IDs, locale, permissions, and request
      metadata. **Accept:** context follows awaited work but cannot leak into unrelated sibling tasks.
- [x] **ASY-010 (P0; deps: —)** Introduce an injectable monotonic clock and timer scheduler shared by debounce, retries,
      animations, resources, and tests. **Accept:** core timing behavior can run deterministically without replacing
      global timers.

### Open Observability And Supportability

- [x] **OBS-001 (P1; deps: ASY-009)** Define a dependency-free OpenTelemetry-shaped API boundary whose default
      implementation is a true no-op. **Accept:** importing instrumentation adds no exporter, network, timer, or
      permission side effect.
- [x] **OBS-002 (P1; deps: OBS-001, ASY-009)** Instrument application actions, resource loads, command invocations,
      worker tasks, layout, and render frames as correlated spans. **Accept:** parentage survives async boundaries and
      span attributes exclude content by default.
- [x] **OBS-003 (P1; deps: OBS-001)** Publish low-cardinality counters, histograms, and gauges for frames, cell diffs,
      queues, caches, errors, and lifecycle. **Accept:** metric names/units are stable and unbounded IDs cannot become
      attribute values.
- [x] **OBS-004 (P1; deps: OBS-001, ASY-009)** Add structured log records with timestamp, observed timestamp, severity,
      event name, resource, and trace context. **Accept:** legacy diagnostic events map losslessly to the normalized
      record.
- [x] **OBS-005 (P1; deps: OBS-001, OBS-002, OBS-003, OBS-004)** Provide one context/resource model shared by traces,
      metrics, and logs. **Accept:** the same runtime/session identifiers correlate all three signals without global
      mutable metadata.
- [x] **OBS-006 (P2; deps: OBS-001, SEC-001)** Add host-owned exporter adapters for OTLP HTTP, console, in-memory tests,
      and application callbacks. **Accept:** exporters declare permissions, apply backpressure, and flush with a bounded
      shutdown deadline.
- [x] **OBS-007 (P2; deps: OBS-002, OBS-003)** Add head, parent-based, and deterministic ratio sampling plus metric
      exemplar hooks. **Accept:** sampling decisions are stable per trace and never change application control flow.
- [x] **OBS-008 (P0; deps: OBS-004, SEC-008)** Apply schema-based allowlists, redaction, hashing, truncation, and
      cardinality limits before any signal leaves the process. **Accept:** adversarial secret fixtures are absent from
      exporter captures.
- [x] **OBS-009 (P1; deps: OBS-003, OBS-004)** Add a renderer-neutral health snapshot covering lifecycle, backlogs,
      saturation, storage, capabilities, and recent classified failures. **Accept:** snapshot creation is bounded and
      succeeds even while optional subsystems are degraded.
- [x] **OBS-010 (P2; deps: OBS-008, OBS-009)** Build an explicit opt-in support bundle containing configuration schemas,
      versions, health, and selected redacted diagnostics with a preview manifest. **Accept:** no screen text, form
      value, environment value, path, or terminal output is included unless separately approved.

### Least-Privilege Security And Trust

- [x] **SEC-001 (P0; deps: —)** Define a runtime permission manifest for read, write, network, environment, subprocess,
      FFI, clipboard, notifications, and remote-session operations. **Accept:** every adapter can report
      required/optional grants before activation.
- [x] **SEC-002 (P1; deps: SEC-001)** Add a Deno permission adapter and external permission-broker adapter with deny
      precedence and fail-closed disconnect behavior. **Accept:** permission tests cover prompt, granted, denied,
      revoked, and broker failure states.
- [x] **SEC-003 (P0; deps: SEC-001, 023:K1)** Give plugins per-instance capability grants instead of inheriting the host
      application's full service registry. **Accept:** an undeclared capability cannot be discovered through typed
      slots, commands, or install hooks.
- [x] **SEC-004 (P1; deps: SEC-001, SEC-003, ASY-008)** Add an isolated worker-plugin host with a schema-validated RPC
      surface, message limits, deadlines, and termination. **Accept:** plugin code cannot receive host object references
      or permissions outside its worker configuration.
- [x] **SEC-005 (P0; deps: TERM-001, TERM-002)** Add a streaming sanitizer for untrusted terminal text with allowlist
      profiles for SGR, links, cursor movement, and plain text. **Accept:** OSC/DCS/APC injection fixtures cannot change
      title, clipboard, input modes, or graphics under the default profile.
- [x] **SEC-006 (P1; deps: SEC-001)** Add URL/action policies for schemes, hosts, file paths, and command launch with
      visible confirmation of normalized targets. **Accept:** confusable or control-bearing targets are rejected before
      any host API call.
- [x] **SEC-007 (P1; deps: TXT-001, TXT-009)** Expose UTS #39 confusable skeletons, mixed-script restriction levels, and
      identifier warnings to file, command, route, and plugin registries. **Accept:** collisions are diagnosed without
      banning ordinary multilingual display text.
- [x] **SEC-008 (P0; deps: —)** Add opaque secret values and schema annotations that redact display, inspection,
      logging, persistence, history, and error formatting by default. **Accept:** converting a secret to a string yields
      a redacted marker and explicit reveal never propagates implicitly.
- [x] **SEC-009 (P1; deps: SEC-001, ASY-003, ASY-004)** Enforce per-subsystem limits for memory estimates, queued work,
      output bytes, control strings, cache entries, and restart rate. **Accept:** limit breaches degrade or stop only
      the owning scope and emit a classified diagnostic.
- [x] **SEC-010 (P2; deps: SEC-001, SEC-008)** Add content-integrity verification for fetched bundles, themes, plugins,
      and cached artifacts using host-supplied hashes/signatures. **Accept:** verification occurs before
      parsing/execution and mismatch never falls back to unsigned content silently.

### Resumable And Consentful Remote Sessions

- [x] **REM-001 (P0; deps: —)** Add a version/capability handshake before remote terminal traffic, with
      mandatory/optional feature negotiation. **Accept:** incompatible major versions close with a machine-readable
      reason before accepting input.
- [x] **REM-002 (P0; deps: REM-001, SEC-001)** Add an authentication/authorization adapter that yields a short-lived
      session principal and explicit roles. **Accept:** the protocol carries no credential material after setup and role
      changes revoke capabilities immediately.
- [x] **REM-003 (P0; deps: REM-001, REM-002)** Require a secure-transport policy and expose verified transport
      identity/channel-binding metadata to the host. **Accept:** production policy rejects plaintext or unverifiable
      transports while tests can install an explicit fake.
- [x] **REM-004 (P1; deps: REM-001, TXT-003)** Add a versioned cell-frame codec with palette tables, run-length/span
      encoding, checksums, and full-frame fallback. **Accept:** decoding a delta plus its base yields the exact styled
      cell frame or requests resync.
- [x] **REM-005 (P0; deps: REM-004, ASY-005)** Add frame sequence numbers, acknowledgements, bounded send windows, and
      slow-client backpressure. **Accept:** a stalled client cannot grow host memory and resumes from the newest valid
      base.
- [x] **REM-006 (P1; deps: REM-004, REM-005, HIS-007)** Add reconnect tokens and bounded session resume from a
      checkpoint plus frame/input sequence. **Accept:** expired or replayed tokens fail, and successful resume neither
      duplicates input nor loses acknowledged output.
- [x] **REM-007 (P0; deps: REM-001, INP-001)** Add input sequence acknowledgement, deduplication, gap detection, and
      role checks. **Accept:** reordered/replayed input cannot execute twice and missing input forces an explicit
      recovery policy.
- [x] **REM-008 (P2; deps: REM-004, REM-005, OBS-003)** Adapt frame rate, color depth, compression, and optional
      graphics to measured latency/bandwidth under host-set quality floors. **Accept:** adaptation is hysteretic,
      inspectable, and never changes logical layout.
- [x] **REM-009 (P2; deps: REM-002, REM-007, SEC-008)** Support explicitly consented multi-client sessions with visible
      participant indicators and viewer/controller/moderator roles; hidden spectators are forbidden. **Accept:** joining
      and control transfer require host policy, are announced to all participants, and are revocable.
- [x] **REM-010 (P1; deps: REM-002, REM-005, SEC-009)** Add session lifecycle policy for idle expiry, absolute lifetime,
      tenant quotas, detach behavior, and graceful drain. **Accept:** each termination reason is deterministic and
      disposal releases the terminal backend exactly once.

### Governed Plugin Ecosystem

- [x] **PLG-001 (P1; deps: 023:K1)** Define a versioned plugin manifest covering identity, package version, host API
      range, entrypoints, contributions, permissions, and state schema. **Accept:** manifests validate without importing
      plugin code.
- [x] **PLG-002 (P1; deps: PLG-001)** Add host/plugin compatibility resolution with SemVer ranges, feature requirements,
      and explainable rejection. **Accept:** resolution is deterministic and never chooses an incompatible plugin
      because it is newest.
- [x] **PLG-003 (P1; deps: PLG-001, PLG-002)** Resolve plugin dependencies and optional peer capabilities as a DAG with
      cycle and version-conflict diagnostics. **Accept:** activation order is stable and one failed optional peer does
      not block unrelated plugins.
- [x] **PLG-004 (P0; deps: PLG-001, SEC-003)** Present a permission diff on install/update and require host approval for
      newly requested capabilities. **Accept:** an update cannot retain a grant that the new manifest no longer
      declares.
- [x] **PLG-005 (P1; deps: PLG-001, SEC-004)** Provide typed RPC proxies for isolated plugin commands, data sources,
      themes, and widgets with cancellation and schema validation. **Accept:** malformed or late replies fail only the
      calling contribution.
- [x] **PLG-006 (P2; deps: PLG-001, PLG-003)** Add lazy activation events for command, route, file type, language, and
      explicit startup while enforcing one activation attempt at a time. **Accept:** unrelated plugins are not loaded
      and a failed activation can be retried only by policy.
- [x] **PLG-007 (P1; deps: PLG-003, PLG-004, HIS-003)** Make plugin install/enable/disable/uninstall transactional with
      rollback of every contribution. **Accept:** fault injection at each lifecycle step leaves the host registry
      identical to a known state.
- [x] **PLG-008 (P2; deps: PLG-001, PLG-007)** Add versioned plugin-state migrations and a hot-upgrade protocol that can
      decline and request restart. **Accept:** migration runs before activation, retains a backup, and failure restores
      the prior plugin/state pair.
- [ ] **PLG-009 (P2; deps: PLG-001, SEC-010, PKG-009)** Consume signed catalog metadata with package digests, provenance
      links, revocations, and offline snapshots. **Accept:** catalog compromise cannot substitute bytes without an
      integrity failure and no install is automatic.
- [x] **PLG-010 (P1; deps: PLG-001, PLG-005, QAL-001)** Ship a headless plugin test host with fake capabilities,
      lifecycle fault injection, RPC assertions, and manifest contract tests. **Accept:** plugin authors can verify
      install-to-dispose with zero ambient Deno permissions.

### Distribution And Developer Experience

- [ ] **PKG-001 (P1; deps: —)** Add a deno-tui init command that creates terminal, browser, remote-client, and library
      templates from versioned built-in assets. **Accept:** every generated template formats, type-checks, tests, and
      uses only declared permissions.
- [ ] **PKG-002 (P2; deps: PKG-001)** Add generators for widgets, controllers, commands, routes, themes, workers, tests,
      and examples that update exports intentionally. **Accept:** generated code passes API policy and never overwrites
      an edited file without a diff/confirmation.
- [ ] **PKG-003 (P1; deps: —)** Publish versioned AST codemods for deprecated API migrations with dry-run and
      idempotence checks. **Accept:** running a migration twice produces no second diff and unsupported syntax is
      reported with locations.
- [ ] **PKG-004 (P1; deps: PKG-001)** Create a machine-readable example registry and local playground launcher with
      capability/permission declarations. **Accept:** docs embed only examples that compile against the current public
      entrypoint.
- [ ] **PKG-005 (P1; deps: QAL-001)** Publish a downstream contract-test package for third-party backends, solvers,
      widgets, themes, and plugins. **Accept:** adapters receive a stable conformance report without importing internal
      tests.
- [ ] **PKG-006 (P2; deps: —)** Generate and verify browser/npm-compatible ESM artifacts and declarations from the same
      source while retaining JSR as canonical. **Accept:** Deno, Node, bundler, and browser smoke projects import only
      supported subpaths.
- [ ] **PKG-007 (P2; deps: PKG-001, SEC-001)** Provide a compiled-launcher template that embeds app code but
      externalizes user data and prints its required permission manifest. **Accept:** Linux, macOS, and Windows smoke
      binaries restore terminal state and locate assets deterministically.
- [ ] **PKG-008 (P2; deps: PKG-003)** Define stable, beta, canary, and compatibility-test release channels with
      machine-readable support windows. **Accept:** prerelease artifacts cannot overwrite stable tags and upgrade
      diagnostics name the selected channel.
- [ ] **PKG-009 (P1; deps: SEC-010)** Generate SPDX SBOMs and OIDC-backed build provenance for release artifacts and
      link them from release metadata. **Accept:** a clean consumer can verify artifact digest, source revision, builder
      identity, and dependency inventory.
- [ ] **PKG-010 (P1; deps: SEC-001)** Report per-entrypoint bundle size, dependency graph, startup imports, required
      permissions, and unstable-runtime APIs against checked-in budgets. **Accept:** CI attributes every budget increase
      to a changed dependency or module path.

### Verification And Conformance Engineering

- [x] **QAL-001 (P0; deps: —)** Add model-based state-machine tests for each controller, deriving random command
      sequences and invariants from a compact reference model. **Accept:** failures retain seed, shrunk sequence,
      initial state, and final inspection.
- [x] **QAL-002 (P0; deps: TERM-001, TERM-002)** Fuzz terminal parsing with arbitrary byte chunks, control nesting,
      malformed UTF-8, and resize interleavings. **Accept:** sanitizer builds show no crash/hang and every case respects
      parser budgets.
- [ ] **QAL-003 (P0; deps: TXT-001, TXT-002, TXT-003, TXT-004, TXT-006, TXT-008)** Vendor versioned Unicode conformance
      inputs and run segmentation, width tailoring, emoji, line-break, and bidi gates. **Accept:** an update requires an
      explicit expected-diff report by rule/data version.
- [ ] **QAL-004 (P1; deps: 023:T3, WID-006)** Build reusable ARIA APG keyboard/role/state test suites for
      browser-rendered composites. **Accept:** each supported pattern declares deviations and passes automated
      accessible-name/focus assertions.
- [ ] **QAL-005 (P1; deps: ASY-001, HIS-003)** Add deterministic fault injection for allocation proxies, storage,
      workers, transports, clocks, permissions, and every lifecycle hook. **Accept:** each injected failure proves
      cleanup and a classified user-visible outcome.
- [ ] **QAL-006 (P0; deps: ASY-010, HIS-006)** Add a test runtime that records/replays time, random values, input,
      resource completions, and resize events. **Accept:** a captured failing run reproduces byte-identical state/frame
      checkpoints offline.
- [ ] **QAL-007 (P2; deps: QAL-001)** Add targeted mutation testing for parsers, layout invariants, selection, history,
      security policies, and protocol codecs. **Accept:** surviving mutations are reported by owning feature ID and
      never auto-waived.
- [ ] **QAL-008 (P1; deps: PKG-005)** Run a downstream compatibility matrix against pinned example applications and
      third-party adapter fixtures. **Accept:** public API/behavior changes produce a migration report before baseline
      updates.
- [ ] **QAL-009 (P2; deps: TERM-003, 023:T1)** Differentially run protocol/render fixtures through supported terminal
      emulators or their headless cores and preserve normalized divergences. **Accept:** CI distinguishes framework
      regressions from documented emulator differences.
- [ ] **QAL-010 (P1; deps: —)** Add repeated-run flake detection with timing distributions, resource snapshots, and
      deterministic-seed rotation; quarantine may label but never silently pass a required gate. **Accept:** a flaky
      test retains all failing artifacts and a named owner/review date.

### Measured Performance Architecture

- [ ] **PER-001 (P2; deps: OBS-003)** Add size-classed pools for cell buffers, row spans, and transient frame packets
      with zeroing and ownership assertions. **Accept:** benchmarks show allocation reduction and tests detect
      use-after-release/double-release.
- [ ] **PER-002 (P1; deps: TXT-002, TXT-003, SEC-009)** Add bounded caches for grapheme segmentation, width, styled-run
      measurement, and locale formatting keyed by data/profile version. **Accept:** hit/miss/eviction metrics are
      exposed and version changes cannot reuse stale entries.
- [ ] **PER-003 (P1; deps: OBS-003)** Implement a measured diff planner that chooses cell, span, row, region-clear, or
      full-frame output by encoded byte cost. **Accept:** it never emits more bytes than the existing strategy beyond a
      declared fixed tolerance.
- [ ] **PER-004 (P1; deps: PER-003, ASY-005)** Coalesce terminal writes under stream backpressure while preserving
      synchronization boundaries and urgent cursor teardown. **Accept:** partial-write fixtures reconstruct exact output
      and memory stays bounded for a stalled sink.
- [ ] **PER-005 (P2; deps: ASY-008, REM-004)** Define transferable frame packets with packed glyph/style tables for
      worker and remote boundaries. **Accept:** browser worker traces transfer ownership with no structured-clone copy
      of the cell payload.
- [ ] **PER-006 (P2; deps: OBS-002, OBS-003, ASY-010)** Adapt frame cadence to dirty work, input latency, background
      state, and sink pressure within configured latency/fps limits. **Accept:** a synthetic workload meets
      input-latency floors and becomes idle without polling.
- [ ] **PER-007 (P1; deps: SEC-009, OBS-003)** Add one hierarchical cache budget coordinator with priority, pinning,
      cost estimation, and eviction callbacks. **Accept:** aggregate cache use respects its cap and active frame
      resources cannot be evicted.
- [ ] **PER-008 (P2; deps: HIS-007, REM-004)** Add incremental, schema-aware serialization for workspace, journal,
      frame, and cache snapshots. **Accept:** unchanged subtrees reuse prior bytes/hashes and full decode matches
      canonical serialization.
- [ ] **PER-009 (P3; deps: TXT-001, QAL-003, PKG-010)** Evaluate optional WASM/SIMD kernels for Unicode scans, color
      quantization, and frame diffing behind pure TypeScript fallbacks. **Accept:** adoption requires corpus equality,
      browser/Deno portability, and an end-to-end win after boundary overhead.
- [ ] **PER-010 (P3; deps: OBS-003, PER-002, PER-003, PER-006, SEC-009)** Add a bounded runtime-profile tuner that
      recommends, but does not silently persist, cache/frame/diff settings from local measurements. **Accept:**
      recommendations include evidence, confidence, rollback values, and never transmit measurements.

## Recommended Execution Sequence

1. **Correctness foundation:** TXT-001 through TXT-006, TXT-010, ASY-001, ASY-003, ASY-005, ASY-006, ASY-008, ASY-010,
   TERM-001, TERM-002, SEC-001, SEC-005, SEC-008, QAL-001 through QAL-003, and QAL-006.
2. **Application data foundation:** ASY-002, DAT-001 through DAT-006, FRM-001 through FRM-007, HIS-001 through HIS-004,
   HIS-006, HIS-009, and NAV-001 through NAV-006. Land each family as its own ICC task.
3. **International product surface:** LOC-001 through LOC-010, TXT-007 through TXT-009, INP-001 through INP-010, FRM-008
   through FRM-010, and NAV-007 through NAV-010. Complete 023:L1 and 023:T3 prerequisites first.
4. **Terminal and design-system depth:** TERM-003 through TERM-010 and THEM-001 through THEM-010, followed by the 023:C1
   integration points.
5. **End-user differentiation:** VIS-001 through VIS-010, WID-001 through WID-010, AUT-001 through AUT-010, DAT-007
   through DAT-010, and HIS-005, HIS-008, HIS-010, HIS-007, HIS-008, HIS-010.
6. **Trustworthy extensibility:** ASY-004, ASY-007, ASY-009, OBS-001 through OBS-010, LOC-010, SEC-002 through SEC-004,
   SEC-006, SEC-007, SEC-009, SEC-010, then PLG-001 through PLG-008 and PLG-010 after 023:K1.
7. **Distributed and packaged runtime:** REM-001 through REM-010, PKG-001 through PKG-010, then PLG-009 after PKG-009.
   Do not enable remote sharing or plugin catalogs before security gates pass.
8. **Optimization only after evidence:** QAL-004, QAL-005, QAL-007 through QAL-010 and PER-001 through PER-010. Each
   optimization needs a checked-in before/after benchmark and a fallback path.

## Program Acceptance Gates

- Every implementation task names its feature IDs, public contract, owning module, migration impact, permission impact,
  and terminal/browser parity expectation.
- Focused tests, full repository checks, relevant live probes, package checks, and the ICC
  guard/readiness/completion/audit gates pass before an item is checked.
- Protocol and Unicode implementations pin the exact standard/data version and retain upstream conformance inputs or
  reproducible fetch metadata.
- New optional integrations remain out of default import graphs and have dependency, bundle, startup, permission, and
  disposal evidence.
- Remote, support, telemetry, plugin, automation, and persistence surfaces redact content by default and include
  explicit consent/retention controls.
- Performance work demonstrates an end-to-end improvement on representative workloads; microbenchmark wins alone do not
  justify added complexity.

## Primary Research Sources

The successor roadmap inherits the first-party Textual, OpenTUI, Taffy, and repository sources recorded in 023.
Additional primary references used here:

- Unicode 17: [UAX #9 Bidirectional Algorithm](https://www.unicode.org/reports/tr9/),
  [UAX #11 East Asian Width](https://www.unicode.org/reports/tr11/),
  [UAX #14 Line Breaking](https://www.unicode.org/reports/tr14/),
  [UAX #29 Text Segmentation](https://www.unicode.org/reports/tr29/),
  [UTS #39 Security Mechanisms](https://www.unicode.org/reports/tr39/),
  [UTS #51 Emoji](https://www.unicode.org/reports/tr51/), and
  [UTS #55 Source Code Handling](https://www.unicode.org/reports/tr55/).
- Unicode localization: [UTS #35 LDML](https://www.unicode.org/reports/tr35/), its MessageFormat specification, and
  current CLDR plural/format data.
- Terminal behavior: [ECMA-48](https://ecma-international.org/publications-and-standards/standards/ecma-48/),
  [XTerm control sequences](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html), and Kitty's
  [keyboard](https://sw.kovidgoyal.net/kitty/keyboard-protocol/),
  [graphics](https://sw.kovidgoyal.net/kitty/graphics-protocol/), and
  [protocol-extension](https://sw.kovidgoyal.net/kitty/protocol-extensions/) specifications.
- Accessibility: [WCAG 2.2](https://www.w3.org/TR/WCAG22/),
  [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/patterns/), and
  [Accessible Name and Description Computation 1.2](https://www.w3.org/TR/accname-1.2/).
- Runtime and packaging: Deno's [security and permissions](https://docs.deno.com/runtime/fundamentals/security/),
  [stability policy](https://docs.deno.com/runtime/fundamentals/stability_and_releases/), and
  [JSR publishing/provenance](https://jsr.io/docs/publishing-packages).
- Interchange and operations: [JSON Schema 2020-12](https://json-schema.org/draft/2020-12),
  [OpenTelemetry specification](https://opentelemetry.io/docs/specs/otel/overview/), and
  [SLSA provenance](https://slsa.dev/spec/v1.2/).
- Independent TUI implementation references: [Ratatui rendering](https://ratatui.rs/concepts/rendering/under-the-hood/),
  [Notcurses planes](https://notcurses.com/notcurses_plane.3.html),
  [Bubble Tea](https://github.com/charmbracelet/bubbletea), and [Ink](https://github.com/vadimdemedes/ink).
