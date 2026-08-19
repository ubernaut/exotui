// Copyright 2023 Im-Beast. MIT license.

import {
  type AsyncStore,
  Computed,
  createFileExplorerTree,
  DataQueryController,
  type DiagnosticsCollector,
  FileExplorerController,
  formatRouteLocation,
  HistoryStack,
  parseRouteLocation,
  queryLocalData,
  Signal,
  TabsController,
  type TextBoxChangeContext,
  TextBoxController,
  type TextBoxSelection,
  TILED_WORKSPACE_SNAPSHOT_VERSION,
} from "../../../mod.ts";
import { MarkdownController, parseMarkdown } from "../../../mod.app.ts";
import { ShowcaseKernel } from "../../../src/showcase/mod.ts";
import { createInkstoneFixtures, INKSTONE_MANIFEST } from "./fixtures.ts";
import { InMemoryInkstoneVaultProvider } from "./fixture_provider.ts";
import {
  INKSTONE_SESSION_SCHEMA_VERSION,
  INKSTONE_VAULT_SCHEMA_VERSION,
  type InkstoneBacklink,
  type InkstoneConflict,
  type InkstoneControllerInspection,
  type InkstoneDraftSnapshot,
  type InkstoneEditorFindResult,
  type InkstoneEditorReplaceResult,
  type InkstoneHeading,
  type InkstoneIndexedNote,
  type InkstoneLink,
  type InkstoneMetadataPatch,
  type InkstoneNote,
  type InkstoneNoteId,
  type InkstoneNoteMetadata,
  type InkstoneNoteSummary,
  type InkstoneSavedNoteOverride,
  type InkstoneSaveResult,
  type InkstoneSearchFilters,
  type InkstoneSearchRow,
  type InkstoneSessionState,
  type InkstoneStatus,
  type InkstoneStorageMode,
  type InkstoneUnresolvedLink,
  InkstoneVaultConflictError,
  type InkstoneVaultIndex,
  type InkstoneVaultSnapshot,
} from "./model.ts";

const MAX_OPEN_NOTES = 32;
const MAX_SESSION_QUERY = 512;
const MAX_SESSION_TAG = 128;
const MAX_SESSION_SOURCE = 1_000_000;
// Worst-case JSON string escaping is six bytes per UTF-16 unit, keeping the
// complete accepted source budget below the terminal store's 8 MB byte cap.
const MAX_SESSION_TOTAL_SOURCE = 1_000_000;
const MAX_METADATA_VALUE = 256;
const MAX_EDITOR_REPLACEMENT = 16_384;
const NOTE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const EMPTY_INDEX: InkstoneVaultIndex = Object.freeze({
  schemaVersion: 1,
  revision: 0,
  notes: Object.freeze([]),
  backlinks: Object.freeze({}),
  unresolved: Object.freeze([]),
});

interface InkstoneDraft {
  noteId: InkstoneNoteId;
  baseRevision: number;
  savedSource: string;
  source: string;
  cursor: { x: number; y: number };
  selection?: TextBoxSelection;
  history: HistoryStack;
}

interface ParsedFrontmatter {
  metadata: InkstoneNoteMetadata;
  bodyStart: number;
}

interface ScannedNote {
  note: InkstoneNote;
  metadata: InkstoneNoteMetadata;
  headings: InkstoneHeading[];
  links: InkstoneLink[];
  tags: string[];
  wordCount: number;
  searchableBody: string;
}

/** Construction options for the deterministic Inkstone controller. */
export interface InkstoneControllerOptions {
  readonly provider?: InMemoryInkstoneVaultProvider;
  readonly store?: AsyncStore<unknown>;
  readonly storageKey?: string;
  readonly diagnostics?: DiagnosticsCollector;
  readonly storageMode?: InkstoneStorageMode;
  readonly now?: () => number;
  readonly persistenceDebounceMs?: number;
}

/** Renderer-neutral controller for the fixture-backed Inkstone vertical slice. */
export class InkstoneController {
  readonly manifest = INKSTONE_MANIFEST;
  readonly provider: InMemoryInkstoneVaultProvider;
  readonly kernel: ShowcaseKernel<InkstoneSessionState, InMemoryInkstoneVaultProvider>;
  readonly diagnostics: ShowcaseKernel<InkstoneSessionState>["diagnostics"];
  readonly storageMode: InkstoneStorageMode;
  readonly ready: Promise<void>;

  readonly status = new Signal<InkstoneStatus>("idle");
  readonly activeNoteId = new Signal<InkstoneNoteId | undefined>(undefined);
  readonly dirtyNoteIds = new Signal<InkstoneNoteId[]>([], { deepObserve: true });
  readonly conflict = new Signal<InkstoneConflict | undefined>(undefined);
  readonly notes = new Signal<InkstoneNoteSummary[]>([], { deepObserve: true });
  readonly index = new Signal<InkstoneVaultIndex>(EMPTY_INDEX);

  readonly editorSource = new Signal("");
  readonly editor: TextBoxController;
  readonly markdown: MarkdownController;
  readonly explorer: FileExplorerController;
  readonly tabs: TabsController;
  readonly outline = new Signal<InkstoneHeading[]>([], { deepObserve: true });
  readonly backlinks = new Signal<InkstoneBacklink[]>([], { deepObserve: true });

  readonly searchRows = new Signal<InkstoneSearchRow[]>([], { deepObserve: true });
  readonly searchQuery = new Signal("");
  readonly search: DataQueryController<InkstoneSearchRow, InkstoneSearchFilters>;
  readonly searchResults: Computed<readonly InkstoneSearchRow[]>;

  readonly #baseNotes = new Map<InkstoneNoteId, InkstoneNote>();
  readonly #drafts = new Map<InkstoneNoteId, InkstoneDraft>();
  readonly #pathToId = new Map<string, InkstoneNoteId>();
  readonly #now: () => number;
  #initialized = false;
  #disposed = false;
  #programmaticEdit = false;
  #programmaticTab = false;
  #indexRevision = 0;
  #recoveredDraftCount = 0;
  #recoveryConflictCount = 0;
  #searchTag: string | undefined;
  #initializePromise?: Promise<void>;
  #disposePromise?: Promise<void>;

  constructor(options: InkstoneControllerOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.storageMode = options.storageMode ?? "memory";
    this.provider = options.provider ?? new InMemoryInkstoneVaultProvider(createInkstoneFixtures(), { now: this.#now });
    const initialState = initialInkstoneSession(this.provider.snapshot());
    this.kernel = new ShowcaseKernel({
      manifest: this.manifest,
      provider: this.provider,
      initialState,
      normalizeState: normalizeInkstoneSessionState,
      store: options.store,
      storageKey: options.storageKey ?? "showcase:inkstone:workspace",
      diagnostics: options.diagnostics,
      now: this.#now,
      persistenceDebounceMs: options.persistenceDebounceMs,
      workspace: { gap: 1 },
      advancedWindows: {
        windows: [
          { id: "vault", title: "Vault", minWidth: 16, minHeight: 8 },
          { id: "editor", title: "Editor", minWidth: 24, minHeight: 8 },
          {
            id: "preview",
            title: "Markdown Preview",
            minWidth: 24,
            minHeight: 8,
            maxWidth: 120,
            maxHeight: 50,
            floatingRect: { column: 48, row: 5, width: 46, height: 20 },
          },
          { id: "inspector", title: "Inspector", minWidth: 18, minHeight: 8 },
        ],
        compactMode: "auto",
        initialWorkspace: {
          version: TILED_WORKSPACE_SNAPSHOT_VERSION,
          gap: 1,
          layout: {
            activePaneId: "inkstone-pane-editor",
            root: {
              kind: "split",
              id: "inkstone-split-vault",
              direction: "row",
              ratio: 0.2,
              first: { kind: "pane", id: "inkstone-pane-vault", windowId: "vault", minWidth: 16, minHeight: 8 },
              second: {
                kind: "split",
                id: "inkstone-split-inspector",
                direction: "row",
                ratio: 0.78,
                first: {
                  kind: "split",
                  id: "inkstone-split-writing",
                  direction: "row",
                  ratio: 0.52,
                  first: {
                    kind: "pane",
                    id: "inkstone-pane-editor",
                    windowId: "editor",
                    minWidth: 24,
                    minHeight: 8,
                  },
                  second: {
                    kind: "pane",
                    id: "inkstone-pane-preview",
                    windowId: "preview",
                    minWidth: 24,
                    minHeight: 8,
                  },
                },
                second: {
                  kind: "pane",
                  id: "inkstone-pane-inspector",
                  windowId: "inspector",
                  minWidth: 18,
                  minHeight: 8,
                },
              },
            },
          },
        },
      },
    });
    this.diagnostics = this.kernel.diagnostics;

    this.editor = new TextBoxController({
      text: this.editorSource,
      maxLength: MAX_SESSION_SOURCE,
      multiCodePointSupport: true,
      lineHighlighting: true,
      lineNumbering: true,
      wordWrap: true,
      onChange: (value, context) => this.#acceptEditorChange(value, context),
    });
    this.markdown = new MarkdownController({ source: this.editorSource });
    this.explorer = new FileExplorerController({
      root: [],
      onOpen: (entry) => {
        const noteId = this.#pathToId.get(normalizePathKey(entry.path));
        if (noteId) void this.openNote(noteId);
      },
    });
    this.tabs = new TabsController({
      tabs: [],
      onChange: (tab) => {
        if (!this.#programmaticTab) void this.openNote(tab.id);
      },
    });
    this.search = new DataQueryController<InkstoneSearchRow, InkstoneSearchFilters>({
      initialParams: { query: "", filters: {}, page: 0, pageSize: 100 },
      keepPreviousData: true,
      loader: ({ params, signal }) => {
        assertNotAborted(signal);
        const rows = this.searchRows.peek();
        return queryLocalData(rows, params, {
          searchable: (row) => [row.searchable],
          filter: (row, filters) => {
            const tag = normalizedSearchTag(filters.tag);
            return !tag || row.tags.some((candidate) => normalizeLookup(candidate) === normalizeLookup(tag));
          },
        });
      },
    });
    this.searchResults = new Computed<readonly InkstoneSearchRow[]>(() => this.search.result.value.rows);
    this.ready = this.initialize();
  }

  /** Initializes provider state, the vault index, open drafts, and persisted search state exactly once. */
  initialize(): Promise<void> {
    this.#initializePromise ??= this.#initialize();
    return this.#initializePromise;
  }

  /** Opens or activates one known note and navigates to the note route. */
  async openNote(noteId: InkstoneNoteId): Promise<boolean> {
    if (!this.#initialized) await this.ready;
    this.#assertUsable();
    if (!this.#baseNotes.has(noteId)) return false;
    this.#ensureDraft(noteId);
    this.#activateNote(noteId, true);
    return true;
  }

  /** Closes a note. Dirty drafts are retained unless the caller explicitly forces loss. */
  closeNote(noteId: InkstoneNoteId, options: { force?: boolean } = {}): boolean {
    this.#assertUsable();
    const draft = this.#drafts.get(noteId);
    if (!draft || !this.tabs.tabs.peek().some((tab) => tab.id === noteId)) return false;
    if (isDraftDirty(draft) && options.force !== true) return false;

    this.#stashActiveCursor();
    const tabs = this.tabs.tabs.peek();
    const closedIndex = tabs.findIndex((tab) => tab.id === noteId);
    const nextTabs = tabs.filter((tab) => tab.id !== noteId);
    this.tabs.tabs.value = nextTabs;
    this.#drafts.delete(noteId);

    if (this.activeNoteId.peek() === noteId) {
      const fallback = nextTabs[Math.min(Math.max(0, closedIndex), Math.max(0, nextTabs.length - 1))]?.id;
      if (fallback) this.#activateNote(fallback, true);
      else this.#clearActiveNote();
    } else {
      this.#syncTabs();
      this.#syncDirtyState();
      this.#persistState();
    }
    this.#rebuildIndex();
    return true;
  }

  /** Saves the active dirty draft through one optimistic provider write. */
  async saveActive(): Promise<InkstoneSaveResult> {
    if (!this.#initialized) await this.ready;
    this.#assertUsable();
    const noteId = this.activeNoteId.peek();
    if (!noteId) return Object.freeze({ status: "no-active-note" });
    const draft = this.#drafts.get(noteId);
    if (!draft || !isDraftDirty(draft)) return Object.freeze({ status: "clean" });

    this.#stashActiveCursor();
    this.status.value = "saving";
    try {
      const saved = await this.provider.write({
        noteId,
        source: draft.source,
        expectedRevision: draft.baseRevision,
      }, { signal: this.kernel.signal });
      this.#baseNotes.set(noteId, saved);
      draft.baseRevision = saved.revision;
      draft.savedSource = saved.source;
      draft.source = saved.source;
      draft.history.markCoalescingBoundary();
      this.conflict.value = undefined;
      this.status.value = "ready";
      this.#syncDirtyState();
      this.#syncTabs();
      this.#rebuildIndex();
      this.#persistState();
      return Object.freeze({ status: "saved", noteId, revision: saved.revision });
    } catch (error) {
      if (error instanceof InkstoneVaultConflictError) {
        const conflict = Object.freeze({
          noteId: error.noteId,
          expectedRevision: error.expectedRevision,
          actualRevision: error.actualRevision,
        });
        this.conflict.value = conflict;
        this.status.value = "conflict";
        this.#report("save-conflict", "warning", { actualRevision: error.actualRevision });
        this.#persistState();
        return Object.freeze({ status: "conflict", conflict });
      }
      if (!this.#disposed && !this.kernel.signal.aborted) {
        this.status.value = "error";
        this.#report("save-failed", "error");
      }
      return Object.freeze({ status: "error" });
    }
  }

  /** Undoes one active-note editing transaction. */
  async undo(): Promise<boolean> {
    if (!this.#initialized) await this.ready;
    this.#assertUsable();
    const history = this.#activeDraft()?.history;
    return history ? await history.undo() : false;
  }

  /** Redoes one active-note editing transaction. */
  async redo(): Promise<boolean> {
    if (!this.#initialized) await this.ready;
    this.#assertUsable();
    const history = this.#activeDraft()?.history;
    return history ? await history.redo() : false;
  }

  /** Selects the next or previous literal current-note match. Query text is never persisted or inspected. */
  findInActiveEditor(
    query: string,
    direction: "forward" | "backward" = "forward",
  ): InkstoneEditorFindResult {
    this.#assertUsable();
    if (typeof query !== "string" || query.length > MAX_SESSION_QUERY) {
      this.editor.clearSelection();
      return Object.freeze({ status: "limited", matchCount: 0, matchIndex: -1, wrapped: false });
    }
    const normalized = query;
    if (!normalized) {
      this.editor.clearSelection();
      return Object.freeze({ status: "empty", matchCount: 0, matchIndex: -1, wrapped: false });
    }
    const result = this.editor.findNext(normalized, { direction, wrap: true });
    if (!result) {
      this.editor.clearSelection();
      return Object.freeze({ status: "not-found", matchCount: 0, matchIndex: -1, wrapped: false });
    }
    return Object.freeze({
      status: "match",
      matchCount: result.total,
      matchIndex: result.index,
      wrapped: result.wrapped,
    });
  }

  /** Replaces the selected literal match as one explicit history boundary. */
  replaceInActiveEditor(query: string, replacement: string): InkstoneEditorReplaceResult {
    this.#assertUsable();
    if (
      typeof query !== "string" || query.length > MAX_SESSION_QUERY || typeof replacement !== "string" ||
      replacement.length > MAX_EDITOR_REPLACEMENT
    ) {
      return Object.freeze({ replacements: 0, remainingMatches: 0, truncated: true });
    }
    const normalizedQuery = query;
    const normalizedReplacement = replacement.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
    if (!normalizedQuery || this.editor.selectedText() !== normalizedQuery) {
      const found = normalizedQuery ? this.findInActiveEditor(normalizedQuery) : undefined;
      return Object.freeze({
        replacements: 0,
        remainingMatches: found?.status === "match" ? found.matchCount : 0,
        truncated: false,
      });
    }
    const history = this.#activeDraft()?.history;
    const selectedLength = this.editor.selectedText().length;
    if (this.editor.text.peek().length - selectedLength + normalizedReplacement.length > MAX_SESSION_SOURCE) {
      return Object.freeze({
        replacements: 0,
        remainingMatches: this.editor.countMatches(normalizedQuery),
        truncated: true,
      });
    }
    history?.markCoalescingBoundary();
    const changed = this.editor.replaceSelection(normalizedReplacement);
    history?.markCoalescingBoundary();
    const remainingMatches = this.editor.countMatches(normalizedQuery);
    if (remainingMatches > 0) this.editor.findNext(normalizedQuery, { direction: "forward", wrap: true });
    return Object.freeze({ replacements: changed ? 1 : 0, remainingMatches, truncated: false });
  }

  /** Replaces all literal current-note matches in one editor mutation and history transaction. */
  replaceAllInActiveEditor(query: string, replacement: string): InkstoneEditorReplaceResult {
    this.#assertUsable();
    if (
      typeof query !== "string" || query.length > MAX_SESSION_QUERY || typeof replacement !== "string" ||
      replacement.length > MAX_EDITOR_REPLACEMENT
    ) {
      return Object.freeze({ replacements: 0, remainingMatches: 0, truncated: true });
    }
    const normalizedQuery = query;
    const normalizedReplacement = replacement;
    if (!normalizedQuery) return Object.freeze({ replacements: 0, remainingMatches: 0, truncated: false });
    const history = this.#activeDraft()?.history;
    history?.markCoalescingBoundary();
    const result = this.editor.replaceAll(normalizedQuery, normalizedReplacement, {
      maxTextLength: MAX_SESSION_SOURCE,
    });
    history?.markCoalescingBoundary();
    return Object.freeze({
      replacements: result.replacements,
      remainingMatches: this.editor.countMatches(normalizedQuery),
      truncated: result.limited,
    });
  }

  /** Executes a deterministic local search and optional exact tag filter. */
  async setSearch(query: string, tag?: string): Promise<readonly InkstoneSearchRow[]> {
    if (!this.#initialized) await this.ready;
    this.#assertUsable();
    const normalizedQuery = boundedText(query, MAX_SESSION_QUERY, "search query");
    this.#searchTag = normalizedSearchTag(tag);
    this.searchQuery.value = normalizedQuery;
    const result = await this.search.load({
      query: normalizedQuery,
      filters: this.#searchTag ? { tag: this.#searchTag } : {},
      page: 0,
      pageSize: 100,
    });
    if (normalizedQuery || this.#searchTag) this.kernel.navigate("search");
    this.#persistState();
    return Object.freeze(result.rows.slice());
  }

  /** Follows an indexed internal link, alias, path, title, or stable note id. */
  async followLink(link: InkstoneLink | string): Promise<boolean> {
    if (!this.#initialized) await this.ready;
    this.#assertUsable();
    let resolved: InkstoneLink | undefined;
    if (typeof link === "string") {
      const indexed = this.#activeIndexedNote();
      const key = normalizeLookup(link);
      resolved = indexed?.outgoing.find((candidate) =>
        normalizeLookup(candidate.target) === key || normalizeLookup(candidate.label) === key ||
        candidate.resolvedNoteId === link
      );
      if (!resolved && this.#baseNotes.has(link)) {
        return await this.openNote(link);
      }
      if (!resolved) {
        const candidate = this.index.peek().notes.find((note) =>
          normalizeLookup(note.title) === key || normalizeLookup(note.path) === key ||
          note.metadata.aliases.some((alias) => normalizeLookup(alias) === key)
        );
        if (candidate) return await this.openNote(candidate.noteId);
      }
    } else {
      resolved = link;
    }
    if (!resolved?.resolvedNoteId || resolved.external) return false;
    const opened = await this.openNote(resolved.resolvedNoteId);
    if (!opened || !resolved.fragment) return opened;
    const heading = this.outline.peek().find((candidate) => candidate.id === slugify(resolved!.fragment!));
    if (heading) this.editor.setCursorPosition({ x: 0, y: heading.line });
    return opened;
  }

  /** Rewrites the bounded fixture frontmatter as one atomic editor history boundary. */
  updateMetadata(patch: InkstoneMetadataPatch): boolean {
    this.#assertUsable();
    const draft = this.#activeDraft();
    if (!draft) return false;
    const note = this.#baseNotes.get(draft.noteId)!;
    const next = updateInkstoneFrontmatter(draft.source, note.path, patch);
    if (next === draft.source) return false;
    draft.history.markCoalescingBoundary();
    this.editor.setText(next, this.editor.cursorPosition.peek());
    draft.history.markCoalescingBoundary();
    return true;
  }

  /** Returns a detached app-state snapshot suitable for ShowcaseKernel persistence. */
  snapshot(): InkstoneSessionState {
    this.#stashActiveCursor();
    return normalizeInkstoneSessionState(this.#snapshotState());
  }

  /** Returns content-minimized operational diagnostics. */
  inspect(): InkstoneControllerInspection {
    const editor = this.editor.inspect();
    const markdown = this.markdown.inspect(80, 24);
    const history = this.#activeDraft()?.history.inspect();
    return Object.freeze({
      status: this.status.peek(),
      initialized: this.#initialized,
      disposed: this.#disposed,
      noteCount: this.notes.peek().length,
      indexedNoteCount: this.index.peek().notes.length,
      openTabCount: this.tabs.tabs.peek().length,
      dirtyCount: this.dirtyNoteIds.peek().length,
      activeNoteId: this.activeNoteId.peek(),
      queryLength: this.searchQuery.peek().length,
      searchResultCount: this.search.result.peek().rows.length,
      unresolvedLinkCount: this.index.peek().unresolved.length,
      editorLineCount: editor.lineCount,
      editorCursor: Object.freeze({ ...editor.cursorPosition }),
      previewBlocks: markdown.blocks,
      previewLinks: markdown.links,
      historyUndoDepth: history?.undoDepth ?? 0,
      historyRedoDepth: history?.redoDepth ?? 0,
      recoveredDraftCount: this.#recoveredDraftCount,
      recoveryConflictCount: this.#recoveryConflictCount,
      storageMode: this.storageMode,
      persistenceStatus: this.kernel.persistenceStatus.peek(),
      conflict: this.conflict.peek() ? Object.freeze({ ...this.conflict.peek()! }) : undefined,
      provider: this.provider.inspect(),
      diagnosticCount: this.diagnostics.inspect().count,
    });
  }

  /** Flushes the final session and disposes the controller and shared kernel exactly once. */
  dispose(): Promise<void> {
    this.#disposePromise ??= this.#dispose();
    return this.#disposePromise;
  }

  async #initialize(): Promise<void> {
    this.status.value = "loading";
    try {
      await this.kernel.ready;
      if (this.kernel.providerStatus.peek() === "blocked" || this.kernel.providerStatus.peek() === "failed") {
        this.status.value = "error";
        this.#report("provider-unavailable", "error");
        return;
      }

      const session = normalizeInkstoneSessionState(this.kernel.appState.peek());
      this.provider.restore(session.vault);
      const summaries = await this.provider.list({ signal: this.kernel.signal });
      const loaded = await Promise.all(
        summaries.map((summary) => this.provider.read(summary.id, { signal: this.kernel.signal })),
      );
      assertNotAborted(this.kernel.signal);

      this.#baseNotes.clear();
      this.#pathToId.clear();
      for (const note of loaded) {
        this.#baseNotes.set(note.id, note);
        this.#pathToId.set(normalizePathKey(note.path), note.id);
      }
      this.notes.value = summaries.slice();
      this.explorer.root.value = createFileExplorerTree(summaries.map((note) => note.path));

      this.#restoreDrafts(session);
      this.#rebuildIndex();
      const openIds = uniqueKnownIds(session.openNoteIds, this.#baseNotes).slice(0, MAX_OPEN_NOTES);
      const defaultNote = summaries.find((note) => note.id === "welcome") ?? summaries[0];
      if (openIds.length === 0 && defaultNote) openIds.push(defaultNote.id);
      for (const noteId of openIds) this.#ensureDraft(noteId);
      this.tabs.tabs.value = openIds.map((noteId) => ({ id: noteId, label: this.#tabLabel(noteId) }));

      const activeId = session.activeNoteId && openIds.includes(session.activeNoteId)
        ? session.activeNoteId
        : openIds[0];
      if (activeId) this.#activateNote(activeId, false);
      else this.#clearActiveNote();

      // The kernel's outer route is canonical. The inner wire location retains
      // note parameters, but must not overwrite a route-only menu change that
      // the kernel already restored from its versioned session envelope.
      parseRouteLocation(session.route);
      this.#searchTag = normalizedSearchTag(session.search.tag);
      this.searchQuery.value = session.search.query;
      await this.search.load({
        query: session.search.query,
        filters: this.#searchTag ? { tag: this.#searchTag } : {},
        page: 0,
        pageSize: 100,
      });
      this.#initialized = true;
      this.status.value = this.conflict.peek() ? "conflict" : "ready";
      if (this.index.peek().unresolved.length > 0) {
        this.#report("index-unresolved-links", "info", { count: this.index.peek().unresolved.length });
      }
      this.#persistState();
    } catch {
      if (!this.#disposed && !this.kernel.signal.aborted) {
        this.status.value = "error";
        this.#report("initialization-failed", "error");
      }
    }
  }

  #restoreDrafts(session: InkstoneSessionState): void {
    this.#drafts.clear();
    this.#recoveredDraftCount = 0;
    this.#recoveryConflictCount = 0;
    for (const snapshot of session.drafts) {
      const saved = this.#baseNotes.get(snapshot.noteId);
      if (!saved) continue;
      const draft: InkstoneDraft = {
        noteId: snapshot.noteId,
        baseRevision: snapshot.baseRevision,
        savedSource: saved.source,
        source: snapshot.source,
        cursor: { ...snapshot.cursor },
        selection: undefined,
        history: this.#newHistory(),
      };
      this.#drafts.set(snapshot.noteId, draft);
      if (snapshot.source !== saved.source) this.#recoveredDraftCount += 1;
      if (snapshot.baseRevision !== saved.revision && !this.conflict.peek()) {
        this.#recoveryConflictCount += 1;
        this.conflict.value = Object.freeze({
          noteId: snapshot.noteId,
          expectedRevision: snapshot.baseRevision,
          actualRevision: saved.revision,
        });
      } else if (snapshot.baseRevision !== saved.revision) {
        this.#recoveryConflictCount += 1;
      }
    }
    if (this.#recoveredDraftCount > 0) {
      this.#report("drafts-recovered", "info", { count: this.#recoveredDraftCount });
    }
    if (this.#recoveryConflictCount > 0) {
      this.#report("restored-draft-conflict", "warning", { count: this.#recoveryConflictCount });
    }
  }

  #ensureDraft(noteId: InkstoneNoteId): InkstoneDraft {
    let draft = this.#drafts.get(noteId);
    if (draft) return draft;
    const note = this.#baseNotes.get(noteId);
    if (!note) throw new TypeError(`Unknown note id: ${noteId}.`);
    draft = {
      noteId,
      baseRevision: note.revision,
      savedSource: note.source,
      source: note.source,
      cursor: { x: 0, y: 0 },
      selection: undefined,
      history: this.#newHistory(),
    };
    this.#drafts.set(noteId, draft);
    return draft;
  }

  #newHistory(): HistoryStack {
    return new HistoryStack({
      capacity: 200,
      coalescing: { idleIntervalMs: 750, now: this.#now },
    });
  }

  #activateNote(noteId: InkstoneNoteId, navigate: boolean): void {
    this.#stashActiveCursor();
    const draft = this.#ensureDraft(noteId);
    const currentTabs = this.tabs.tabs.peek();
    if (!currentTabs.some((tab) => tab.id === noteId)) {
      this.tabs.tabs.value = [...currentTabs, { id: noteId, label: this.#tabLabel(noteId) }];
    }
    this.activeNoteId.value = noteId;
    this.#programmaticEdit = true;
    try {
      this.editor.setText(draft.source, draft.cursor);
      if (draft.selection) this.editor.setSelection(draft.selection.anchor, draft.selection.focus);
    } finally {
      this.#programmaticEdit = false;
    }
    this.#programmaticTab = true;
    try {
      this.tabs.setActive(this.tabs.tabs.peek().findIndex((tab) => tab.id === noteId));
    } finally {
      this.#programmaticTab = false;
    }
    this.#syncDerivedForActive();
    this.#syncDirtyState();
    this.#syncTabs();
    if (navigate) this.kernel.navigate("note");
    this.#persistState();
  }

  #clearActiveNote(): void {
    this.activeNoteId.value = undefined;
    this.#programmaticEdit = true;
    try {
      this.editor.setText("", { x: 0, y: 0 });
    } finally {
      this.#programmaticEdit = false;
    }
    this.outline.value = [];
    this.backlinks.value = [];
    this.conflict.value = undefined;
    this.kernel.navigate("vault");
    this.#syncDirtyState();
    this.#persistState();
  }

  #acceptEditorChange(value: string, context: TextBoxChangeContext): void {
    if (this.#programmaticEdit || this.#disposed) return;
    const draft = this.#activeDraft();
    if (!draft || value === draft.source) return;
    const before = draft.source;
    const beforeCursor = { ...context.previousCursorPosition };
    const afterCursor = { ...this.editor.cursorPosition.peek() };
    draft.source = value;
    draft.cursor = afterCursor;
    draft.history.push({
      id: `inkstone.edit.${draft.noteId}`,
      label: `Edit ${this.#baseNotes.get(draft.noteId)?.path ?? draft.noteId}`,
      group: "inkstone-editor",
      coalesce: { key: `inkstone.edit.${draft.noteId}`, boundary: `${draft.baseRevision}` },
      undo: () => this.#applyDraftSource(draft.noteId, before, beforeCursor),
      redo: () => this.#applyDraftSource(draft.noteId, value, afterCursor),
    });
    this.conflict.value = this.conflict.peek()?.noteId === draft.noteId ? this.conflict.peek() : undefined;
    if (!this.conflict.peek()) this.status.value = "ready";
    this.#syncDirtyState();
    this.#syncTabs();
    this.#rebuildIndex();
    this.#persistState();
  }

  #applyDraftSource(noteId: InkstoneNoteId, source: string, cursor: { x: number; y: number }): void {
    const draft = this.#drafts.get(noteId);
    if (!draft) return;
    draft.source = source;
    draft.cursor = { ...cursor };
    draft.selection = undefined;
    if (this.activeNoteId.peek() === noteId) {
      this.#programmaticEdit = true;
      try {
        this.editor.setText(source, cursor);
      } finally {
        this.#programmaticEdit = false;
      }
    }
    this.#syncDirtyState();
    this.#syncTabs();
    this.#rebuildIndex();
    this.#persistState();
  }

  #rebuildIndex(): void {
    const notes = this.#notesWithDrafts();
    const index = buildInkstoneIndex(notes, ++this.#indexRevision);
    this.index.value = index;
    this.searchRows.value = buildInkstoneSearchRows(notes, index);
    this.#syncDerivedForActive();
    if (this.#initialized && (this.searchQuery.peek() || this.#searchTag)) {
      void this.search.load({
        query: this.searchQuery.peek(),
        filters: this.#searchTag ? { tag: this.#searchTag } : {},
        page: 0,
        pageSize: 100,
      });
    }
  }

  #notesWithDrafts(): InkstoneNote[] {
    const notes: InkstoneNote[] = [];
    for (const base of this.#baseNotes.values()) {
      const draft = this.#drafts.get(base.id);
      notes.push(Object.freeze({ ...base, source: draft?.source ?? base.source }));
    }
    return notes.sort((left, right) => compareText(left.path, right.path));
  }

  #syncDerivedForActive(): void {
    const active = this.#activeIndexedNote();
    this.outline.value = active ? active.headings.map((heading) => ({ ...heading })) : [];
    const noteId = active?.noteId;
    this.backlinks.value = noteId
      ? (this.index.peek().backlinks[noteId] ?? []).map((backlink) => ({ ...backlink }))
      : [];
  }

  #activeIndexedNote(): InkstoneIndexedNote | undefined {
    const noteId = this.activeNoteId.peek();
    return noteId ? this.index.peek().notes.find((note) => note.noteId === noteId) : undefined;
  }

  #activeDraft(): InkstoneDraft | undefined {
    const noteId = this.activeNoteId.peek();
    return noteId ? this.#drafts.get(noteId) : undefined;
  }

  #stashActiveCursor(): void {
    const draft = this.#activeDraft();
    if (!draft) return;
    draft.source = this.editorSource.peek();
    draft.cursor = { ...this.editor.cursorPosition.peek() };
    const selection = this.editor.selection.peek();
    draft.selection = selection
      ? Object.freeze({
        anchor: Object.freeze({ ...selection.anchor }),
        focus: Object.freeze({ ...selection.focus }),
      })
      : undefined;
  }

  #syncDirtyState(): void {
    const dirty = [...this.#drafts.values()].filter(isDraftDirty).map((draft) => draft.noteId).sort(compareText);
    this.dirtyNoteIds.value = dirty;
  }

  #syncTabs(): void {
    this.tabs.tabs.value = this.tabs.tabs.peek().map((tab) => ({
      id: tab.id,
      label: this.#tabLabel(tab.id),
    }));
  }

  #tabLabel(noteId: InkstoneNoteId): string {
    const path = this.#baseNotes.get(noteId)?.path ?? noteId;
    const basename = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
    return `${isDraftDirty(this.#drafts.get(noteId)) ? "● " : ""}${basename}`;
  }

  #snapshotState(): InkstoneSessionState {
    const openNoteIds = this.tabs.tabs.peek().map((tab) => tab.id);
    const drafts: InkstoneDraftSnapshot[] = [];
    for (const noteId of openNoteIds) {
      const draft = this.#drafts.get(noteId);
      if (!draft || !isDraftDirty(draft)) continue;
      drafts.push(Object.freeze({
        noteId,
        baseRevision: draft.baseRevision,
        source: draft.source,
        cursor: Object.freeze({ ...draft.cursor }),
      }));
    }
    const activeNoteId = this.activeNoteId.peek();
    const routeId = this.kernel.routeId.peek();
    const route = formatRouteLocation({
      routeId,
      pathParams: routeId === "note" && activeNoteId ? { noteId: activeNoteId } : {},
    });
    return Object.freeze({
      schemaVersion: INKSTONE_SESSION_SCHEMA_VERSION,
      route,
      openNoteIds: Object.freeze(openNoteIds),
      ...(activeNoteId ? { activeNoteId } : {}),
      drafts: Object.freeze(drafts),
      search: Object.freeze({
        query: this.searchQuery.peek(),
        ...(this.#searchTag ? { tag: this.#searchTag } : {}),
      }),
      vault: this.provider.snapshot(),
    });
  }

  #persistState(): void {
    if (!this.#initialized || this.#disposed) return;
    try {
      this.kernel.setState(this.#snapshotState());
    } catch {
      if (!this.conflict.peek()) this.status.value = "error";
      this.#report("session-state-rejected", "warning");
    }
  }

  #report(code: string, severity: "debug" | "info" | "warning" | "error", context?: Record<string, number>): void {
    this.diagnostics.report({
      source: "inkstone",
      code,
      severity,
      message: inkstoneDiagnosticMessage(code),
      context,
    });
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Inkstone controller is disposed.");
  }

  async #dispose(): Promise<void> {
    if (this.#disposed) return;
    if (!this.#initialized) {
      // Abort provider/index work before waiting for controller readiness.
      // This keeps dispose-during-initialization bounded for non-fixture providers.
      this.#disposed = true;
      const kernelDisposal = this.kernel.dispose();
      try {
        await this.ready;
      } catch {
        // Initialization diagnostics are already bounded by the controller.
      }
      await kernelDisposal;
      this.#disposeSignals();
      return;
    }
    try {
      this.#stashActiveCursor();
      this.#persistState();
      await this.kernel.flush();
    } finally {
      this.#disposed = true;
      await this.kernel.dispose();
      this.#disposeSignals();
    }
  }

  #disposeSignals(): void {
    this.status.value = "disposed";
    this.searchResults.dispose();
    this.search.dispose();
    this.explorer.dispose();
    this.tabs.dispose();
    this.markdown.dispose();
    this.editor.dispose();
    this.editorSource.dispose();
    this.searchRows.dispose();
    this.searchQuery.dispose();
    this.outline.dispose();
    this.backlinks.dispose();
    this.index.dispose();
    this.notes.dispose();
    this.dirtyNoteIds.dispose();
    this.activeNoteId.dispose();
    this.conflict.dispose();
    this.status.dispose();
  }
}

/** Creates and immediately begins initializing a fixture-backed Inkstone controller. */
export function createInkstoneController(options: InkstoneControllerOptions = {}): InkstoneController {
  return new InkstoneController(options);
}

/** Pure Markdown/frontmatter index used by the controller and deterministic tests. */
export function buildInkstoneIndex(notes: readonly InkstoneNote[], revision = 1): InkstoneVaultIndex {
  const scanned = notes.map(scanNote).sort((left, right) => compareText(left.note.path, right.note.path));
  const aliases = buildAliasLookup(scanned);
  const pathLookup = new Map<string, InkstoneNoteId>();
  for (const note of scanned) {
    pathLookup.set(normalizePathKey(note.note.path), note.note.id);
    pathLookup.set(normalizePathKey(removeMarkdownExtension(note.note.path)), note.note.id);
  }

  const indexed: InkstoneIndexedNote[] = [];
  const backlinks: Record<InkstoneNoteId, InkstoneBacklink[]> = Object.create(null);
  const unresolved: InkstoneUnresolvedLink[] = [];
  for (const note of scanned) backlinks[note.note.id] = [];

  for (const source of scanned) {
    const outgoing = source.links.map((link) => resolveLink(source.note.path, link, aliases, pathLookup));
    const entry: InkstoneIndexedNote = Object.freeze({
      noteId: source.note.id,
      path: source.note.path,
      title: source.metadata.title,
      metadata: Object.freeze({
        ...source.metadata,
        tags: Object.freeze(source.tags.slice()),
        aliases: Object.freeze(source.metadata.aliases.slice()),
      }),
      headings: Object.freeze(source.headings.map((heading) => Object.freeze({ ...heading }))),
      outgoing: Object.freeze(outgoing.map((link) => Object.freeze({ ...link }))),
      wordCount: source.wordCount,
    });
    indexed.push(entry);
    for (const link of outgoing) {
      if (link.resolvedNoteId) {
        backlinks[link.resolvedNoteId]!.push(Object.freeze({
          sourceNoteId: source.note.id,
          sourcePath: source.note.path,
          sourceTitle: source.metadata.title,
          label: link.label,
          line: link.line,
          ...(link.fragment ? { fragment: link.fragment } : {}),
        }));
      } else if (!link.external) {
        unresolved.push(Object.freeze({ sourceNoteId: source.note.id, target: link.target, line: link.line }));
      }
    }
  }

  for (const rows of Object.values(backlinks)) {
    rows.sort((left, right) =>
      compareText(left.sourceTitle, right.sourceTitle) || left.line - right.line ||
      compareText(left.sourceNoteId, right.sourceNoteId)
    );
    Object.freeze(rows);
  }
  unresolved.sort((left, right) =>
    compareText(left.sourceNoteId, right.sourceNoteId) || left.line - right.line ||
    compareText(left.target, right.target)
  );
  return Object.freeze({
    schemaVersion: 1,
    revision: Math.max(0, Math.floor(revision)),
    notes: Object.freeze(indexed),
    backlinks: Object.freeze(backlinks),
    unresolved: Object.freeze(unresolved),
  });
}

/** Reads the bounded fixture metadata without claiming general YAML support. */
export function parseInkstoneMetadata(source: string, path = "Untitled.md"): InkstoneNoteMetadata {
  return parseFrontmatter(source, path).metadata;
}

/** Rewrites the bounded fixture frontmatter while leaving the Markdown body intact. */
export function updateInkstoneFrontmatter(
  source: string,
  path: string,
  patch: InkstoneMetadataPatch,
): string {
  const parsed = parseFrontmatter(source, path);
  const title = patch.title === undefined
    ? parsed.metadata.title
    : patch.title === null
    ? basenameTitle(path)
    : normalizeMetadataScalar(patch.title, "title");
  const tags = patch.tags === undefined ? parsed.metadata.tags : normalizeMetadataList(patch.tags);
  const aliases = patch.aliases === undefined ? parsed.metadata.aliases : normalizeMetadataList(patch.aliases);
  const status = patch.status === undefined
    ? parsed.metadata.status
    : patch.status === null
    ? undefined
    : normalizeMetadataScalar(patch.status, "status");
  const lines = normalizeLines(source);
  const body = lines.slice(parsed.bodyStart);
  const frontmatter = [
    "---",
    `title: ${formatMetadataScalar(title)}`,
    `tags: ${formatMetadataList(tags)}`,
    `aliases: ${formatMetadataList(aliases)}`,
    ...(status ? [`status: ${formatMetadataScalar(status)}`] : []),
    "---",
  ];
  return [...frontmatter, ...body].join("\n");
}

/** Strictly normalizes persisted Inkstone state before ShowcaseKernel retains it. */
export function normalizeInkstoneSessionState(value: unknown): InkstoneSessionState {
  const record = plainRecord(value, "session");
  if (record.schemaVersion !== INKSTONE_SESSION_SCHEMA_VERSION) throw new TypeError("Invalid Inkstone session schema.");
  if (typeof record.route !== "string") throw new TypeError("Invalid Inkstone session route.");
  const location = parseRouteLocation(record.route);
  if (!INKSTONE_MANIFEST.routes.some((route) => route.id === location.routeId)) {
    throw new TypeError("Unknown Inkstone session route.");
  }
  const openNoteIds = normalizeNoteIdList(record.openNoteIds, "openNoteIds", MAX_OPEN_NOTES);
  const activeNoteId = record.activeNoteId === undefined
    ? undefined
    : normalizeSessionNoteId(record.activeNoteId, "activeNoteId");
  if (activeNoteId && !openNoteIds.includes(activeNoteId)) throw new TypeError("Active note is not open.");

  if (!Array.isArray(record.drafts) || record.drafts.length > MAX_OPEN_NOTES) {
    throw new TypeError("Invalid Inkstone drafts.");
  }
  const draftIds = new Set<string>();
  let sourceUnits = 0;
  const drafts = record.drafts.map((value, index): InkstoneDraftSnapshot => {
    const draft = plainRecord(value, `drafts[${index}]`);
    const noteId = normalizeSessionNoteId(draft.noteId, `drafts[${index}].noteId`);
    if (draftIds.has(noteId) || !openNoteIds.includes(noteId)) throw new TypeError("Invalid Inkstone draft identity.");
    draftIds.add(noteId);
    if (!Number.isSafeInteger(draft.baseRevision) || (draft.baseRevision as number) < 1) {
      throw new TypeError("Invalid Inkstone draft revision.");
    }
    if (typeof draft.source !== "string" || draft.source.length > MAX_SESSION_SOURCE) {
      throw new TypeError("Invalid Inkstone draft source.");
    }
    sourceUnits += draft.source.length;
    if (sourceUnits > MAX_SESSION_TOTAL_SOURCE) throw new TypeError("Inkstone draft budget exceeded.");
    const cursor = plainRecord(draft.cursor, `drafts[${index}].cursor`);
    if (!isNonNegativeSafeInteger(cursor.x) || !isNonNegativeSafeInteger(cursor.y)) {
      throw new TypeError("Invalid Inkstone draft cursor.");
    }
    return Object.freeze({
      noteId,
      baseRevision: draft.baseRevision as number,
      source: normalizeSource(draft.source),
      cursor: Object.freeze({ x: cursor.x as number, y: cursor.y as number }),
    });
  });

  const search = plainRecord(record.search, "search");
  const query = boundedText(search.query, MAX_SESSION_QUERY, "search query");
  const tag = search.tag === undefined ? undefined : boundedText(search.tag, MAX_SESSION_TAG, "search tag");
  const vault = normalizeVaultSnapshot(record.vault);
  sourceUnits += vault.overrides.reduce((total, override) => total + override.source.length, 0);
  if (sourceUnits > MAX_SESSION_TOTAL_SOURCE) throw new TypeError("Inkstone session source budget exceeded.");
  return Object.freeze({
    schemaVersion: INKSTONE_SESSION_SCHEMA_VERSION,
    route: formatRouteLocation(location),
    openNoteIds: Object.freeze(openNoteIds),
    ...(activeNoteId ? { activeNoteId } : {}),
    drafts: Object.freeze(drafts),
    search: Object.freeze({ query, ...(tag ? { tag } : {}) }),
    vault,
  });
}

function initialInkstoneSession(vault: InkstoneVaultSnapshot): InkstoneSessionState {
  return Object.freeze({
    schemaVersion: INKSTONE_SESSION_SCHEMA_VERSION,
    route: formatRouteLocation({ routeId: "vault" }),
    openNoteIds: Object.freeze([]),
    drafts: Object.freeze([]),
    search: Object.freeze({ query: "" }),
    vault,
  });
}

function scanNote(note: InkstoneNote): ScannedNote {
  const lines = normalizeLines(note.source);
  const frontmatter = parseFrontmatter(note.source, note.path);
  const headings: InkstoneHeading[] = [];
  const links: InkstoneLink[] = [];
  const tags = new Set(frontmatter.metadata.tags);
  const searchable: string[] = [];
  const slugCounts = new Map<string, number>();
  let fenced = false;

  for (let lineIndex = frontmatter.bodyStart; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]!;
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    searchable.push(line);

    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const text = stripInlineMarkdown(heading[2]!).trim();
      const root = slugify(text) || `heading-${lineIndex + 1}`;
      const count = (slugCounts.get(root) ?? 0) + 1;
      slugCounts.set(root, count);
      headings.push(Object.freeze({
        id: count === 1 ? root : `${root}-${count}`,
        level: heading[1]!.length,
        text,
        line: lineIndex,
      }));
    }

    for (const match of line.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const content = match[1]!.trim();
      const pipe = content.indexOf("|");
      const targetWithFragment = (pipe >= 0 ? content.slice(0, pipe) : content).trim();
      const label = (pipe >= 0 ? content.slice(pipe + 1) : targetWithFragment).trim();
      const [target, fragment] = splitFragment(targetWithFragment);
      if (target) links.push({ kind: "wiki", target, label: label || target, line: lineIndex, fragment });
    }
    for (const match of line.matchAll(/\[([^\]]+)\]\(([^)\s]+)(?:\s+[^)]*)?\)/g)) {
      const [target, fragment] = splitFragment(match[2]!.trim());
      if (target || fragment) {
        links.push({
          kind: "markdown",
          target,
          label: stripInlineMarkdown(match[1]!).trim() || target,
          line: lineIndex,
          fragment,
        });
      }
    }
    for (const match of line.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_-]+)/gu)) {
      if (match[1]) tags.add(match[1]);
    }
  }

  const body = lines.slice(frontmatter.bodyStart).join("\n");
  const parsed = parseMarkdown(body);
  const wordText = parsed.blocks.map((block) => {
    if (block.code) return block.code;
    if (block.inlines) return block.inlines.map((span) => span.text).join(" ");
    if (block.cells) return block.cells.flatMap((cell) => cell.inlines.map((span) => span.text)).join(" ");
    return "";
  }).join(" ");
  const title = frontmatter.metadata.title || headings[0]?.text || basenameTitle(note.path);
  return {
    note,
    metadata: Object.freeze({ ...frontmatter.metadata, title }),
    headings,
    links,
    tags: [...tags].map(normalizeTag).filter(Boolean).sort(compareText),
    wordCount: wordText.trim() ? wordText.trim().split(/\s+/u).length : 0,
    searchableBody: searchable.join(" ").replaceAll(/\s+/g, " ").trim(),
  };
}

function buildInkstoneSearchRows(notes: readonly InkstoneNote[], index: InkstoneVaultIndex): InkstoneSearchRow[] {
  const byId = new Map(notes.map((note) => [note.id, note]));
  return index.notes.map((indexed) => {
    const source = byId.get(indexed.noteId)?.source ?? "";
    const body = visibleMarkdownBody(source, indexed.path);
    const snippet = body.find((line) => line.trim() && !/^#{1,6}\s/.test(line.trim()))?.trim()
      .replaceAll(/\s+/g, " ").slice(0, 160) ?? "";
    return Object.freeze({
      noteId: indexed.noteId,
      title: indexed.title,
      path: indexed.path,
      tags: Object.freeze(indexed.metadata.tags.slice()),
      snippet,
      searchable: `${indexed.title} ${indexed.path} ${indexed.metadata.tags.join(" ")} ${body.join(" ")}`,
    });
  });
}

function parseFrontmatter(source: string, path: string): ParsedFrontmatter {
  const lines = normalizeLines(source);
  const values = new Map<string, string | string[]>();
  let bodyStart = 0;
  if (lines[0]?.trim() === "---") {
    const close = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
    if (close > 0) {
      bodyStart = close + 1;
      let activeList: string | undefined;
      for (let index = 1; index < close; index += 1) {
        const line = lines[index]!;
        const item = /^\s+-\s+(.+?)\s*$/.exec(line);
        if (item && activeList) {
          const current = values.get(activeList);
          if (Array.isArray(current)) current.push(unquote(item[1]!));
          continue;
        }
        const field = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*?)\s*$/.exec(line);
        if (!field) {
          activeList = undefined;
          continue;
        }
        const key = field[1]!.toLowerCase();
        const raw = field[2]!;
        if ((key === "tags" || key === "aliases") && raw === "") {
          values.set(key, []);
          activeList = key;
        } else {
          values.set(key, parseMetadataValue(raw));
          activeList = undefined;
        }
      }
    }
  }
  const titleValue = values.get("title");
  const title = typeof titleValue === "string" && titleValue.trim() ? titleValue.trim() : basenameTitle(path);
  const tags = metadataList(values.get("tags"));
  const aliases = metadataList(values.get("aliases"));
  const statusValue = values.get("status");
  const status = typeof statusValue === "string" && statusValue.trim() ? statusValue.trim() : undefined;
  return {
    metadata: Object.freeze({
      title,
      tags: Object.freeze(tags),
      aliases: Object.freeze(aliases),
      ...(status ? { status } : {}),
    }),
    bodyStart,
  };
}

function buildAliasLookup(notes: readonly ScannedNote[]): Map<string, InkstoneNoteId> {
  const candidates = new Map<string, Set<InkstoneNoteId>>();
  const add = (value: string, noteId: InkstoneNoteId) => {
    const key = normalizeLookup(value);
    if (!key) return;
    const ids = candidates.get(key) ?? new Set<InkstoneNoteId>();
    ids.add(noteId);
    candidates.set(key, ids);
  };
  for (const note of notes) {
    add(note.note.id, note.note.id);
    add(note.note.path, note.note.id);
    add(removeMarkdownExtension(note.note.path), note.note.id);
    add(basenameTitle(note.note.path), note.note.id);
    add(note.metadata.title, note.note.id);
    for (const alias of note.metadata.aliases) add(alias, note.note.id);
  }
  const output = new Map<string, InkstoneNoteId>();
  for (const [key, ids] of candidates) {
    if (ids.size === 1) output.set(key, [...ids][0]!);
  }
  return output;
}

function resolveLink(
  sourcePath: string,
  link: InkstoneLink,
  aliases: ReadonlyMap<string, InkstoneNoteId>,
  paths: ReadonlyMap<string, InkstoneNoteId>,
): InkstoneLink {
  if (isExternalTarget(link.target) || (!link.target && link.fragment)) {
    return Object.freeze({ ...link, external: true });
  }
  let noteId: InkstoneNoteId | undefined;
  if (link.kind === "wiki") {
    noteId = aliases.get(normalizeLookup(link.target)) ?? paths.get(normalizePathKey(link.target));
  } else {
    let decoded = link.target;
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return Object.freeze({ ...link });
    }
    const resolvedPath = resolveRelativePath(sourcePath, decoded);
    noteId = paths.get(normalizePathKey(resolvedPath)) ??
      paths.get(normalizePathKey(removeMarkdownExtension(resolvedPath))) ??
      aliases.get(normalizeLookup(decoded));
  }
  return Object.freeze({ ...link, ...(noteId ? { resolvedNoteId: noteId } : {}) });
}

function resolveRelativePath(sourcePath: string, target: string): string {
  const sourceParts = sourcePath.split("/");
  sourceParts.pop();
  const output = target.startsWith("/") ? [] : sourceParts;
  for (const part of target.replace(/^\/+/, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") output.pop();
    else output.push(part);
  }
  const path = output.join("/");
  return /\.[A-Za-z0-9]+$/.test(path) ? path : `${path}.md`;
}

function visibleMarkdownBody(source: string, path: string): string[] {
  const lines = normalizeLines(source);
  const bodyStart = parseFrontmatter(source, path).bodyStart;
  const output: string[] = [];
  let fenced = false;
  for (let index = bodyStart; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced) output.push(line);
  }
  return output;
}

function parseMetadataValue(raw: string): string | string[] {
  const value = raw.trim();
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    return inner ? inner.split(",").map((entry) => unquote(entry.trim())).filter(Boolean) : [];
  }
  return unquote(value);
}

function metadataList(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return normalizeMetadataList(values);
}

function normalizeMetadataList(values: readonly string[]): string[] {
  const output = new Set<string>();
  for (const value of values) {
    const normalized = normalizeMetadataScalar(value, "metadata list item");
    if (normalized) output.add(normalized);
  }
  return [...output].sort(compareText);
}

function normalizeMetadataScalar(value: string, label: string): string {
  if (typeof value !== "string" || value.includes("\n") || value.length > MAX_METADATA_VALUE) {
    throw new TypeError(`Invalid Inkstone ${label}.`);
  }
  return value.trim();
}

function formatMetadataScalar(value: string): string {
  return JSON.stringify(value);
}

function formatMetadataList(values: readonly string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    if (trimmed.startsWith('"')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === "string") return parsed;
      } catch {
        // Fall back to the bounded literal below.
      }
    }
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function splitFragment(value: string): [string, string | undefined] {
  const index = value.indexOf("#");
  if (index < 0) return [value.trim(), undefined];
  return [value.slice(0, index).trim(), value.slice(index + 1).trim() || undefined];
}

function stripInlineMarkdown(value: string): string {
  return value
    .replaceAll(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replaceAll(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replaceAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, label?: string) => label ?? target)
    .replaceAll(/[*_~`]/g, "");
}

function slugify(value: string): string {
  return value.normalize("NFKD").toLocaleLowerCase("en-US")
    .replaceAll(/\p{M}+/gu, "")
    .replaceAll(/[^\p{L}\p{N}]+/gu, "-")
    .replaceAll(/^-+|-+$/g, "");
}

function normalizeLookup(value: string): string {
  return removeMarkdownExtension(value.trim().replaceAll("\\", "/"))
    .replace(/^\/+|\/+$/g, "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US");
}

function normalizePathKey(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "").normalize("NFKC").toLocaleLowerCase("en-US");
}

function removeMarkdownExtension(value: string): string {
  return value.replace(/\.md$/i, "");
}

function basenameTitle(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  return removeMarkdownExtension(base) || "Untitled";
}

function normalizeTag(value: string): string {
  return value.trim().replace(/^#/, "");
}

function normalizedSearchTag(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new TypeError("Search tag must be a string.");
  return boundedText(normalizeTag(value), MAX_SESSION_TAG, "search tag") || undefined;
}

function normalizeLines(source: string): string[] {
  return normalizeSource(source).split("\n");
}

function normalizeSource(source: string): string {
  return source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function isExternalTarget(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) || value.startsWith("//");
}

function isDraftDirty(draft: InkstoneDraft | undefined): boolean {
  return Boolean(draft && draft.source !== draft.savedSource);
}

function uniqueKnownIds(
  values: readonly InkstoneNoteId[],
  notes: ReadonlyMap<InkstoneNoteId, InkstoneNote>,
): InkstoneNoteId[] {
  const seen = new Set<string>();
  return values.filter((value) => notes.has(value) && !seen.has(value) && Boolean(seen.add(value)));
}

function normalizeNoteIdList(value: unknown, path: string, limit: number): InkstoneNoteId[] {
  if (!Array.isArray(value) || value.length > limit) throw new TypeError(`Invalid ${path}.`);
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const id = normalizeSessionNoteId(entry, `${path}[${index}]`);
    if (seen.has(id)) throw new TypeError(`Duplicate ${path} entry.`);
    seen.add(id);
    return id;
  });
}

function normalizeSessionNoteId(value: unknown, path: string): InkstoneNoteId {
  if (typeof value !== "string" || !NOTE_ID_PATTERN.test(value)) throw new TypeError(`Invalid ${path}.`);
  return value;
}

function normalizeVaultSnapshot(value: unknown): InkstoneVaultSnapshot {
  const record = plainRecord(value, "vault");
  if (record.schemaVersion !== INKSTONE_VAULT_SCHEMA_VERSION || !Array.isArray(record.overrides)) {
    throw new TypeError("Invalid Inkstone vault snapshot.");
  }
  const seen = new Set<string>();
  const overrides = record.overrides.map((value, index): InkstoneSavedNoteOverride => {
    const override = plainRecord(value, `vault.overrides[${index}]`);
    const noteId = normalizeSessionNoteId(override.noteId, `vault.overrides[${index}].noteId`);
    if (seen.has(noteId)) throw new TypeError("Duplicate Inkstone vault override.");
    seen.add(noteId);
    if (typeof override.source !== "string" || override.source.length > MAX_SESSION_SOURCE) {
      throw new TypeError("Invalid Inkstone vault source.");
    }
    if (!Number.isSafeInteger(override.revision) || (override.revision as number) < 1) {
      throw new TypeError("Invalid Inkstone vault revision.");
    }
    if (typeof override.updatedAt !== "number" || !Number.isFinite(override.updatedAt) || override.updatedAt < 0) {
      throw new TypeError("Invalid Inkstone vault timestamp.");
    }
    return Object.freeze({
      noteId,
      source: normalizeSource(override.source),
      revision: override.revision as number,
      updatedAt: Math.floor(override.updatedAt),
    });
  });
  return Object.freeze({ schemaVersion: INKSTONE_VAULT_SCHEMA_VERSION, overrides: Object.freeze(overrides) });
}

function plainRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`Invalid ${path}.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`Invalid ${path}.`);
  return value as Record<string, unknown>;
}

function boundedText(value: unknown, limit: number, label: string): string {
  if (typeof value !== "string" || value.length > limit) throw new TypeError(`Invalid ${label}.`);
  return value;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new DOMException("Operation aborted.", "AbortError");
}

function inkstoneDiagnosticMessage(code: string): string {
  switch (code) {
    case "save-conflict":
      return "The active note changed outside this editor; the draft was preserved.";
    case "index-unresolved-links":
      return "The fixture vault contains unresolved internal links.";
    case "provider-unavailable":
      return "The fixture vault provider is unavailable.";
    case "initialization-failed":
      return "Inkstone initialization failed.";
    case "save-failed":
      return "The active note could not be saved; the draft was preserved.";
    case "session-state-rejected":
      return "The current Inkstone workspace state could not be persisted.";
    case "drafts-recovered":
      return "Unsaved Inkstone drafts were recovered from the previous session.";
    case "restored-draft-conflict":
      return "One or more recovered drafts no longer match their saved fixture revision.";
    default:
      return "Inkstone reported a bounded operational diagnostic.";
  }
}
