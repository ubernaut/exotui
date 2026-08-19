// Copyright 2023 Im-Beast. MIT license.

/** Stable schema name for showcase manifests. */
export const SHOWCASE_MANIFEST_SCHEMA = "deno-tui.showcase" as const;

/** Current showcase manifest schema version. */
export const SHOWCASE_MANIFEST_VERSION = 1 as const;

/** One route exposed by a showcase. */
export interface ShowcaseRouteManifest {
  readonly id: string;
  readonly title: string;
}

/** Hosts on which a showcase is intentionally available. This is descriptive, not an enforcement boundary. */
export interface ShowcaseManifestHosts {
  readonly terminal: boolean;
  readonly browser: boolean;
}

/** Author-facing input accepted by {@link defineShowcaseManifest}. */
export interface ShowcaseManifestInput {
  readonly id: string;
  readonly title: string;
  readonly appVersion: string;
  readonly routes: readonly ShowcaseRouteManifest[];
  readonly initialRouteId: string;
  readonly requiredCapabilities?: readonly string[];
  readonly optionalCapabilities?: readonly string[];
  readonly hosts?: Partial<ShowcaseManifestHosts>;
}

/** Validated, detached, deeply immutable showcase metadata. */
export interface ShowcaseManifest extends ShowcaseManifestInput {
  readonly schema: typeof SHOWCASE_MANIFEST_SCHEMA;
  readonly schemaVersion: typeof SHOWCASE_MANIFEST_VERSION;
  readonly requiredCapabilities: readonly string[];
  readonly optionalCapabilities: readonly string[];
  readonly hosts: ShowcaseManifestHosts;
}

/** Stable validation failure that never includes arbitrary manifest contents. */
export class ShowcaseManifestError extends TypeError {
  constructor(readonly code: "invalid-manifest", readonly path: string) {
    super(`Invalid showcase manifest at ${path}.`);
    this.name = "ShowcaseManifestError";
  }
}

/** Builds and validates a versioned showcase manifest. */
export function defineShowcaseManifest(input: ShowcaseManifestInput): ShowcaseManifest {
  const author = dataRecordShape(input, "$", [
    "id",
    "title",
    "appVersion",
    "routes",
    "initialRouteId",
    "requiredCapabilities",
    "optionalCapabilities",
    "hosts",
  ], ["id", "title", "appVersion", "routes", "initialRouteId"]);
  const hostInput = author.hosts === undefined
    ? {}
    : dataRecordShape(author.hosts, "$.hosts", ["terminal", "browser"], []);
  if (hostInput.terminal !== undefined && typeof hostInput.terminal !== "boolean") invalid("$.hosts.terminal");
  if (hostInput.browser !== undefined && typeof hostInput.browser !== "boolean") invalid("$.hosts.browser");
  return normalizeShowcaseManifest({
    schema: SHOWCASE_MANIFEST_SCHEMA,
    schemaVersion: SHOWCASE_MANIFEST_VERSION,
    id: author.id,
    title: author.title,
    appVersion: author.appVersion,
    routes: author.routes,
    initialRouteId: author.initialRouteId,
    requiredCapabilities: author.requiredCapabilities ?? [],
    optionalCapabilities: author.optionalCapabilities ?? [],
    hosts: {
      terminal: hostInput.terminal ?? true,
      browser: hostInput.browser ?? false,
    },
  });
}

/** Validates and defensively clones a complete persisted manifest. */
export function normalizeShowcaseManifest(value: unknown): ShowcaseManifest {
  const input = dataRecord(value, "$", [
    "schema",
    "schemaVersion",
    "id",
    "title",
    "appVersion",
    "routes",
    "initialRouteId",
    "requiredCapabilities",
    "optionalCapabilities",
    "hosts",
  ]);
  if (input.schema !== SHOWCASE_MANIFEST_SCHEMA || input.schemaVersion !== SHOWCASE_MANIFEST_VERSION) {
    invalid("$.schemaVersion");
  }

  const id = identifier(input.id, "$.id");
  const title = boundedString(input.title, "$.title", 1, 160);
  const appVersion = boundedString(input.appVersion, "$.appVersion", 1, 64);
  const routeInputs = dataArray(input.routes, "$.routes", 1, 128);
  const routeIds = new Set<string>();
  const routes = routeInputs.map((value, index) => {
    const route = dataRecord(value, `$.routes[${index}]`, ["id", "title"]);
    const routeId = identifier(route.id, `$.routes[${index}].id`);
    if (routeIds.has(routeId)) invalid(`$.routes[${index}].id`);
    routeIds.add(routeId);
    return Object.freeze({
      id: routeId,
      title: boundedString(route.title, `$.routes[${index}].title`, 1, 160),
    });
  });

  const initialRouteId = identifier(input.initialRouteId, "$.initialRouteId");
  if (!routeIds.has(initialRouteId)) invalid("$.initialRouteId");
  const requiredCapabilities = identifierList(input.requiredCapabilities, "$.requiredCapabilities");
  const optionalCapabilities = identifierList(input.optionalCapabilities, "$.optionalCapabilities");
  const required = new Set(requiredCapabilities);
  if (optionalCapabilities.some((capability) => required.has(capability))) {
    invalid("$.optionalCapabilities");
  }

  const hostsInput = dataRecord(input.hosts, "$.hosts", ["terminal", "browser"]);
  if (typeof hostsInput.terminal !== "boolean" || typeof hostsInput.browser !== "boolean") {
    invalid("$.hosts");
  }

  return Object.freeze({
    schema: SHOWCASE_MANIFEST_SCHEMA,
    schemaVersion: SHOWCASE_MANIFEST_VERSION,
    id,
    title,
    appVersion,
    routes: Object.freeze(routes),
    initialRouteId,
    requiredCapabilities: Object.freeze(requiredCapabilities),
    optionalCapabilities: Object.freeze(optionalCapabilities),
    hosts: Object.freeze({ terminal: hostsInput.terminal, browser: hostsInput.browser }),
  });
}

function identifierList(value: unknown, path: string): string[] {
  const values = dataArray(value, path, 0, 256);
  const seen = new Set<string>();
  return values.map((entry, index) => {
    const id = identifier(entry, `${path}[${index}]`);
    if (seen.has(id)) invalid(`${path}[${index}]`);
    seen.add(id);
    return id;
  });
}

function identifier(value: unknown, path: string): string {
  const result = boundedString(value, path, 1, 128);
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,127})$/.test(result)) invalid(path);
  return result;
}

function boundedString(value: unknown, path: string, minimum: number, maximum: number): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || value.trim() !== value) {
    invalid(path);
  }
  return value;
}

function dataRecord(value: unknown, path: string, allowedKeys: readonly string[]): Record<string, unknown> {
  return dataRecordShape(value, path, allowedKeys, allowedKeys);
}

function dataRecordShape(
  value: unknown,
  path: string,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(path);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid(path);
  if (Object.getOwnPropertySymbols(value).length > 0) invalid(path);
  const record = value as Record<string, unknown>;
  const allowed = new Set(allowedKeys);
  for (const key of Object.getOwnPropertyNames(record)) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!allowed.has(key) || !descriptor?.enumerable || !("value" in descriptor)) invalid(path);
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(record, key)) invalid(`${path}.${key}`);
  }
  return record;
}

function dataArray(value: unknown, path: string, minimum: number, maximum: number): unknown[] {
  if (
    !Array.isArray(value) || value.length < minimum || value.length > maximum ||
    Object.getOwnPropertySymbols(value).length > 0 || Object.getOwnPropertyNames(value).length !== value.length + 1
  ) {
    invalid(path);
  }
  const output: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid(`${path}[${index}]`);
    output.push(descriptor.value);
  }
  return output;
}

function invalid(path: string): never {
  throw new ShowcaseManifestError("invalid-manifest", path);
}
