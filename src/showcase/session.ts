// Copyright 2023 Im-Beast. MIT license.

import {
  type MarkupWindowSnapshot,
  normalizeMarkupWindowSnapshot,
  normalizeTiledWorkspaceSnapshot,
  TILED_WORKSPACE_SNAPSHOT_VERSION,
  type TiledWorkspaceLayoutNode,
  type TiledWorkspaceLayoutState,
  type TiledWorkspaceSnapshot,
} from "../../mod.ts";
import type { ShowcaseManifest } from "./manifest.ts";

/** Stable schema name for persisted showcase sessions. */
export const SHOWCASE_SESSION_SCHEMA = "deno-tui.showcase-session" as const;

/** Current showcase session schema version. */
export const SHOWCASE_SESSION_VERSION = 2 as const;

/** Legacy tiled-only showcase session version accepted by the V2 migration. */
export const SHOWCASE_SESSION_V1_VERSION = 1 as const;

/** JSON-safe data accepted by session persistence. */
export type ShowcaseJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly ShowcaseJsonValue[]
  | { readonly [key: string]: ShowcaseJsonValue };

/** Versioned persisted state shared by all showcases. */
export interface ShowcaseSession<TState = ShowcaseJsonValue> {
  readonly schema: typeof SHOWCASE_SESSION_SCHEMA;
  readonly schemaVersion: typeof SHOWCASE_SESSION_VERSION;
  readonly showcaseId: string;
  readonly showcaseVersion: string;
  readonly providerId: string;
  readonly routeId: string;
  readonly workspace: TiledWorkspaceSnapshot;
  /** Markup window state without a duplicate tiled snapshot; `workspace` remains the one canonical tiled payload. */
  readonly windowing?: ShowcaseWindowingSnapshot;
  readonly appState: TState;
  readonly savedAt: number;
}

/** Persisted markup-window state whose tiled tree is stored once in `ShowcaseSession.workspace`. */
export type ShowcaseWindowingSnapshot = Omit<MarkupWindowSnapshot, "workspace">;

/** Converts a live markup snapshot into a detached JSON-safe windowing payload. */
export function createShowcaseWindowingSnapshot(snapshot: MarkupWindowSnapshot): ShowcaseWindowingSnapshot {
  const normalized = normalizeMarkupWindowSnapshot(snapshot);
  if (!normalized.ok) invalid("invalid-session", "$.windowing");
  return compactSessionWindowing(normalized.snapshot);
}

/** Identity and app-state validation needed to restore a session. */
export interface ShowcaseSessionNormalizationOptions<TState> {
  readonly manifest: ShowcaseManifest;
  readonly providerId: string;
  readonly normalizeState: (value: unknown) => TState;
}

/** Input used to construct a session without trusting caller-owned data. */
export interface CreateShowcaseSessionInput<TState> extends ShowcaseSessionNormalizationOptions<TState> {
  readonly routeId: string;
  readonly workspace: TiledWorkspaceSnapshot;
  readonly windowing?: ShowcaseWindowingSnapshot;
  readonly appState: TState;
  readonly savedAt: number;
}

/** Content-safe session validation failure. */
export class ShowcaseSessionError extends TypeError {
  constructor(readonly code: "invalid-json" | "invalid-session" | "session-mismatch", readonly path: string) {
    super(`Showcase session ${code} at ${path}.`);
    this.name = "ShowcaseSessionError";
  }
}

/** Constructs a detached, validated session. */
export function createShowcaseSession<TState>(input: CreateShowcaseSessionInput<TState>): ShowcaseSession<TState> {
  return normalizeShowcaseSession({
    schema: SHOWCASE_SESSION_SCHEMA,
    schemaVersion: SHOWCASE_SESSION_VERSION,
    showcaseId: input.manifest.id,
    showcaseVersion: input.manifest.appVersion,
    providerId: input.providerId,
    routeId: input.routeId,
    workspace: input.workspace,
    ...(input.windowing === undefined ? {} : { windowing: input.windowing }),
    appState: input.appState,
    savedAt: input.savedAt as number,
  }, input);
}

/** Parses and validates an untrusted JSON session. */
export function parseShowcaseSession<TState>(
  text: string,
  options: ShowcaseSessionNormalizationOptions<TState>,
): ShowcaseSession<TState> {
  if (typeof text !== "string" || text.length > 8_000_000) invalid("invalid-json", "$.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    invalid("invalid-json", "$");
  }
  return normalizeShowcaseSession(value, options);
}

/** Validates identities and normalizes all nested session data. */
export function normalizeShowcaseSession<TState>(
  value: unknown,
  options: ShowcaseSessionNormalizationOptions<TState>,
): ShowcaseSession<TState> {
  const input = recordShape(value, "$", [
    "schema",
    "schemaVersion",
    "showcaseId",
    "showcaseVersion",
    "providerId",
    "routeId",
    "workspace",
    "windowing",
    "appState",
    "savedAt",
  ], [
    "schema",
    "schemaVersion",
    "showcaseId",
    "showcaseVersion",
    "providerId",
    "routeId",
    "workspace",
    "appState",
    "savedAt",
  ]);
  if (
    input.schema !== SHOWCASE_SESSION_SCHEMA ||
    (input.schemaVersion !== SHOWCASE_SESSION_VERSION && input.schemaVersion !== SHOWCASE_SESSION_V1_VERSION)
  ) {
    invalid("invalid-session", "$.schemaVersion");
  }
  if (input.schemaVersion === SHOWCASE_SESSION_V1_VERSION && Object.hasOwn(input, "windowing")) {
    invalid("invalid-session", "$.windowing");
  }
  if (
    input.showcaseId !== options.manifest.id || input.showcaseVersion !== options.manifest.appVersion ||
    input.providerId !== options.providerId
  ) {
    invalid("session-mismatch", "$.identity");
  }
  if (typeof input.routeId !== "string" || !options.manifest.routes.some((route) => route.id === input.routeId)) {
    invalid("invalid-session", "$.routeId");
  }
  if (!Number.isSafeInteger(input.savedAt) || (input.savedAt as number) < 0) {
    invalid("invalid-session", "$.savedAt");
  }

  const workspace = normalizeSessionWorkspace(input.workspace);
  const windowing = input.windowing === undefined ? undefined : normalizeSessionWindowing(input.windowing, workspace);

  let normalizedState: TState;
  try {
    normalizedState = options.normalizeState(cloneShowcaseJsonValue(input.appState, "$.appState") as unknown);
  } catch {
    invalid("invalid-session", "$.appState");
  }
  const appState = cloneShowcaseJsonValue(normalizedState, "$.appState") as TState;

  return deepFreeze({
    schema: SHOWCASE_SESSION_SCHEMA,
    schemaVersion: SHOWCASE_SESSION_VERSION,
    showcaseId: options.manifest.id,
    showcaseVersion: options.manifest.appVersion,
    providerId: options.providerId,
    routeId: input.routeId,
    workspace,
    ...(windowing === undefined ? {} : { windowing }),
    appState,
    savedAt: input.savedAt as number,
  });
}

/** Serializes a normalized session deterministically enough for store adapters. */
export function stringifyShowcaseSession<TState>(session: ShowcaseSession<TState>): string {
  return JSON.stringify(session);
}

/** Strictly clones JSON-safe data, rejecting accessors, cycles, sparse arrays, and exotic prototypes. */
export function cloneShowcaseJsonValue<T>(value: T, path = "$", maxDepth = 64): T {
  const seen = new WeakSet<object>();
  let nodes = 0;
  const visit = (input: unknown, currentPath: string, depth: number): unknown => {
    nodes += 1;
    if (nodes > 100_000 || depth > maxDepth) invalid("invalid-session", currentPath);
    if (input === null || typeof input === "boolean" || typeof input === "string") return input;
    if (typeof input === "number") {
      if (!Number.isFinite(input)) invalid("invalid-session", currentPath);
      return input;
    }
    if (!input || typeof input !== "object") invalid("invalid-session", currentPath);
    if (seen.has(input)) invalid("invalid-session", currentPath);
    seen.add(input);

    if (Array.isArray(input)) {
      if (
        input.length > 100_000 || Object.getOwnPropertySymbols(input).length > 0 ||
        Object.getOwnPropertyNames(input).length !== input.length + 1
      ) {
        invalid("invalid-session", currentPath);
      }
      const output: unknown[] = [];
      for (let index = 0; index < input.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
        if (!descriptor?.enumerable || !("value" in descriptor)) invalid("invalid-session", currentPath);
        output.push(visit(descriptor.value, `${currentPath}[${index}]`, depth + 1));
      }
      seen.delete(input);
      return output;
    }

    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) invalid("invalid-session", currentPath);
    if (Object.getOwnPropertySymbols(input).length > 0) invalid("invalid-session", currentPath);
    const output: Record<string, unknown> = {};
    for (const key of Object.getOwnPropertyNames(input)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        invalid("invalid-session", currentPath);
      }
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) invalid("invalid-session", currentPath);
      output[key] = visit(descriptor.value, `${currentPath}.${key}`, depth + 1);
    }
    seen.delete(input);
    return output;
  };
  return visit(value, path, 0) as T;
}

function exactRecord(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  return recordShape(value, path, keys, keys);
}

function recordShape(
  value: unknown,
  path: string,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("invalid-session", path);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid("invalid-session", path);
  if (Object.getOwnPropertySymbols(value).length > 0) invalid("invalid-session", path);
  const record = value as Record<string, unknown>;
  const expected = new Set(allowedKeys);
  for (const key of Object.getOwnPropertyNames(record)) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!expected.has(key) || !descriptor?.enumerable || !("value" in descriptor)) invalid("invalid-session", path);
  }
  for (const key of requiredKeys) if (!Object.hasOwn(record, key)) invalid("invalid-session", `${path}.${key}`);
  return record;
}

function normalizeSessionWindowing(
  value: unknown,
  workspace: TiledWorkspaceSnapshot,
): ShowcaseWindowingSnapshot {
  let clone: unknown;
  try {
    clone = cloneShowcaseJsonValue(value, "$.windowing");
  } catch {
    invalid("invalid-session", "$.windowing");
  }
  if (!clone || typeof clone !== "object" || Array.isArray(clone)) {
    invalid("invalid-session", "$.windowing");
  }
  if (Object.hasOwn(clone, "workspace")) {
    invalid("invalid-session", "$.windowing.workspace");
  }
  const normalized = normalizeMarkupWindowSnapshot({
    ...(clone as Record<string, unknown>),
    workspace,
  });
  if (!normalized.ok) invalid("invalid-session", "$.windowing");
  return compactSessionWindowing(normalized.snapshot);
}

function compactSessionWindowing(snapshot: MarkupWindowSnapshot): ShowcaseWindowingSnapshot {
  return deepFreeze({
    version: snapshot.version,
    compactMode: snapshot.compactMode,
    windowIds: [...snapshot.windowIds],
    minimizedWindowIds: [...snapshot.minimizedWindowIds],
    closedWindowIds: [...snapshot.closedWindowIds],
    ...(snapshot.maximizedWindowId === undefined ? {} : { maximizedWindowId: snapshot.maximizedWindowId }),
    ...(snapshot.activeWindowId === undefined ? {} : { activeWindowId: snapshot.activeWindowId }),
    focusOrderWindowIds: [...snapshot.focusOrderWindowIds],
    placements: snapshot.placements.map((placement) => ({
      id: placement.id,
      placement: placement.placement,
      ...(placement.floatingRect === undefined ? {} : { floatingRect: { ...placement.floatingRect } }),
      ...(placement.restoreRect === undefined ? {} : { restoreRect: { ...placement.restoreRect } }),
      ...(placement.snapTarget === undefined ? {} : { snapTarget: { ...placement.snapTarget } }),
      alwaysOnTop: placement.alwaysOnTop,
      ...(placement.groupId === undefined ? {} : { groupId: placement.groupId }),
    })),
    modals: snapshot.modals.map((modal) => ({ ...modal })),
  });
}

function normalizeSessionWorkspace(value: unknown): TiledWorkspaceSnapshot {
  const input = exactRecord(value, "$.workspace", ["version", "gap", "layout"]);
  if (input.version !== TILED_WORKSPACE_SNAPSHOT_VERSION) invalid("invalid-session", "$.workspace.version");
  if (typeof input.gap !== "number" || !Number.isFinite(input.gap) || input.gap < 0) {
    invalid("invalid-session", "$.workspace.gap");
  }
  const layoutInput = recordShape(input.layout, "$.workspace.layout", ["root", "activePaneId"], []);
  if (layoutInput.activePaneId !== undefined && !workspaceString(layoutInput.activePaneId)) {
    invalid("invalid-session", "$.workspace.layout.activePaneId");
  }
  const root = layoutInput.root === undefined
    ? undefined
    : cloneWorkspaceNode(layoutInput.root, "$.workspace.layout.root", new WeakSet(), { count: 0 }, 0);
  const layout: TiledWorkspaceLayoutState = {
    ...(root ? { root } : {}),
    ...(typeof layoutInput.activePaneId === "string" ? { activePaneId: layoutInput.activePaneId } : {}),
  };
  let normalized: TiledWorkspaceSnapshot;
  try {
    normalized = normalizeTiledWorkspaceSnapshot({
      version: TILED_WORKSPACE_SNAPSHOT_VERSION,
      gap: input.gap,
      layout,
    });
  } catch {
    invalid("invalid-session", "$.workspace");
  }
  return {
    version: TILED_WORKSPACE_SNAPSHOT_VERSION,
    gap: normalized.gap,
    layout: compactWorkspaceLayout(normalized.layout),
  };
}

function cloneWorkspaceNode(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
  nodes: { count: number },
  depth: number,
): TiledWorkspaceLayoutNode {
  if (!value || typeof value !== "object" || depth > 64 || ++nodes.count > 10_000 || seen.has(value)) {
    invalid("invalid-session", path);
  }
  seen.add(value);
  const base = recordShape(value, path, [
    "kind",
    "id",
    "windowId",
    "minWidth",
    "minHeight",
    "direction",
    "ratio",
    "first",
    "second",
  ], ["kind", "id"]);
  if (!workspaceString(base.id)) invalid("invalid-session", `${path}.id`);
  if (base.kind === "pane") {
    for (const key of ["direction", "ratio", "first", "second"] as const) {
      if (Object.hasOwn(base, key)) invalid("invalid-session", path);
    }
    if (!workspaceString(base.windowId)) invalid("invalid-session", `${path}.windowId`);
    const minWidth = optionalWorkspaceMinimum(base.minWidth, `${path}.minWidth`);
    const minHeight = optionalWorkspaceMinimum(base.minHeight, `${path}.minHeight`);
    return {
      kind: "pane",
      id: base.id,
      windowId: base.windowId,
      ...(minWidth === undefined ? {} : { minWidth }),
      ...(minHeight === undefined ? {} : { minHeight }),
    };
  }
  if (base.kind !== "split") invalid("invalid-session", `${path}.kind`);
  for (const key of ["windowId", "minWidth", "minHeight"] as const) {
    if (Object.hasOwn(base, key)) invalid("invalid-session", path);
  }
  if (base.direction !== "row" && base.direction !== "column") invalid("invalid-session", `${path}.direction`);
  if (typeof base.ratio !== "number" || !Number.isFinite(base.ratio)) invalid("invalid-session", `${path}.ratio`);
  if (!Object.hasOwn(base, "first") || !Object.hasOwn(base, "second")) invalid("invalid-session", path);
  return {
    kind: "split",
    id: base.id,
    direction: base.direction,
    ratio: base.ratio,
    first: cloneWorkspaceNode(base.first, `${path}.first`, seen, nodes, depth + 1),
    second: cloneWorkspaceNode(base.second, `${path}.second`, seen, nodes, depth + 1),
  };
}

function compactWorkspaceLayout(layout: TiledWorkspaceLayoutState): TiledWorkspaceLayoutState {
  return {
    ...(layout.root ? { root: compactWorkspaceNode(layout.root) } : {}),
    ...(layout.activePaneId ? { activePaneId: layout.activePaneId } : {}),
  };
}

function compactWorkspaceNode(node: TiledWorkspaceLayoutNode): TiledWorkspaceLayoutNode {
  if (node.kind === "split") {
    return { ...node, first: compactWorkspaceNode(node.first), second: compactWorkspaceNode(node.second) };
  }
  return {
    kind: "pane",
    id: node.id,
    windowId: node.windowId,
    ...(node.minWidth === undefined ? {} : { minWidth: node.minWidth }),
    ...(node.minHeight === undefined ? {} : { minHeight: node.minHeight }),
  };
}

function optionalWorkspaceMinimum(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) invalid("invalid-session", path);
  return value;
}

function workspaceString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && value.trim() === value;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function invalid(code: ShowcaseSessionError["code"], path: string): never {
  throw new ShowcaseSessionError(code, path);
}
