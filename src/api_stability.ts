// Copyright 2023 Im-Beast. MIT license.

/** Stability levels used by the package surface manifest. */
export type ApiStabilityTier = "stable" | "beta" | "experimental" | "internal";

/** Runtime target associated with a public or internal API surface. */
export type PackageRuntime = "shared" | "terminal" | "browser" | "remote" | "demo";

/** Manifest record for a Deno package export. */
export interface PackageEntrypointManifest {
  specifier:
    | "."
    | "./app"
    | "./web"
    | "./remote"
    | "./three-ascii"
    | "./theme"
    | "./runtime"
    | "./terminal"
    | "./showcase"
    | "./viz"
    | "./viz/three"
    | "./testing"
    | "./layout/yoga"
    | "./layout/taffy"
    | "./layout/taffy-wasm";
  path:
    | "./mod.ts"
    | "./mod.app.ts"
    | "./mod.web.ts"
    | "./mod.remote.ts"
    | "./mod.three_ascii.ts"
    | "./mod.theme.ts"
    | "./mod.runtime.ts"
    | "./mod.terminal.ts"
    | "./src/showcase/mod.ts"
    | "./src/viz/mod.ts"
    | "./src/viz/three/mod.ts"
    | "./mod.testing.ts"
    | "./src/layout/solvers/yoga.ts"
    | "./src/layout/taffy.ts"
    | "./src/layout/solvers/taffy_wasm.ts";
  runtime: PackageRuntime;
  stability: ApiStabilityTier;
  description: string;
  includes: readonly string[];
  excludes: readonly string[];
}

/** Query options for package entrypoint metadata. */
export interface PackageEntrypointQuery {
  runtime?: PackageRuntime;
  stability?: ApiStabilityTier;
}

/** Policy record for broader source-tree API stability. */
export interface ApiSurfacePolicy {
  pattern: string;
  runtime: PackageRuntime;
  stability: ApiStabilityTier;
  public: boolean;
  description: string;
}

/** Query options for broader source-tree API stability policy. */
export interface ApiSurfacePolicyQuery {
  runtime?: PackageRuntime;
  stability?: ApiStabilityTier;
  public?: boolean;
}

/** Release policy metadata for docs, release notes, and package checks. */
export interface PackageReleasePolicy {
  changelogFile: string;
  stableBreakingChanges: string;
  betaBreakingChanges: string;
  experimentalBreakingChanges: string;
  deprecationPolicy: string;
  releaseChecklist: readonly string[];
}

/** Public package entrypoints exposed by the Deno export map. */
export const packageEntrypoints: readonly PackageEntrypointManifest[] = [
  {
    specifier: ".",
    path: "./mod.ts",
    runtime: "terminal",
    stability: "stable",
    description:
      "Full terminal package with core TUI runtime, widgets, app primitives, themes, runtime helpers, and demos.",
    includes: [
      "terminal Tui runtime",
      "components and controllers",
      "app framework with typed forms and route locations",
      "runtime/concurrency primitives",
      "version-pinned Unicode data and UAX #29 grapheme segmentation",
      "testing and benchmark helpers",
      "Three ASCII renderer",
    ],
    excludes: ["browser-only host helpers", "remote terminal bridge transport"],
  },
  {
    specifier: "./app",
    path: "./mod.app.ts",
    runtime: "terminal",
    stability: "beta",
    description: "Focused terminal application package with opinionated lifecycle wiring and curated widgets.",
    includes: [
      "TerminalApp golden path",
      "signals and theme engine",
      "common layouts and widgets",
      "Markdown document and terminal renderer",
      "commands, routes, and app plugins",
      "advanced tiled/floating workbench window host",
    ],
    excludes: ["broad compatibility surface", "browser host helpers", "renderer internals", "demo workbench code"],
  },
  {
    specifier: "./web",
    path: "./mod.web.ts",
    runtime: "browser",
    stability: "beta",
    description: "Standalone browser-safe package for shared controllers, themes, layout, canvas sinks, and web hosts.",
    includes: [
      "platform-neutral app/controllers",
      "browser platform and Canvas2D sink",
      "DOM render target",
      "IndexedDB/Worker-capable runtime primitives",
      "typed forms/routes and temporal structural resource caches",
      "bounded async streams",
      "remote capability negotiation",
      "Three ASCII browser helpers",
    ],
    excludes: ["terminal Tui runtime", "Deno stdio lifecycle"],
  },
  {
    specifier: "./remote",
    path: "./mod.remote.ts",
    runtime: "remote",
    stability: "experimental",
    description: "Hosted terminal/client bridge protocol and browser WebSocket transport.",
    includes: [
      "strict version/capability handshake",
      "negotiated remote terminal protocol",
      "browser transport",
      "input/resize/ping message types",
    ],
    excludes: ["server-side PTY host", "standalone browser renderer"],
  },
  {
    specifier: "./three-ascii",
    path: "./mod.three_ascii.ts",
    runtime: "shared",
    stability: "experimental",
    description: "Focused Three.js/WebGPU ASCII renderer package for glyph, block, mixed, and Kitty-capable scenes.",
    includes: [
      "Acerola-style ASCII node",
      "terminal glyph modes",
      "renderer frame helpers",
      "demo presets and shared renderer options",
      "WebGPU compatibility helpers",
    ],
    excludes: ["terminal Tui runtime", "browser Canvas2D host", "workbench demo shell"],
  },
  {
    specifier: "./viz",
    path: "./src/viz/mod.ts",
    runtime: "shared",
    stability: "beta",
    // Under 120 characters: api_reference.ts emits this verbatim and cannot wrap.
    description: "Dimensional visualisations: data by rank and time, with streams, scaling and renderers.",
    includes: [
      "the rank and time data model",
      "bounded live data streams",
      "domain scaling and resampling",
      "meters, sparklines and psychographs",
      "bars, racks and waterfalls",
      "heatmaps, the 2D lattice and volume projection",
    ],
    excludes: ["the Three.js renderer", "components", "the Tui runtime"],
  },
  {
    specifier: "./viz/three",
    path: "./src/viz/three/mod.ts",
    runtime: "shared",
    stability: "experimental",
    // Under 120 characters: api_reference.ts emits this verbatim and cannot wrap.
    description: "Optional Three.js-backed visualisation scenes, rendered through the ASCII pipeline.",
    includes: [
      "the data scene contract",
      "height fields, lattices and ring stacks",
      "fitness ranking shared with ./viz",
    ],
    excludes: ["the dependency-free renderers in ./viz", "the ASCII renderer itself", "terminal mounting"],
  },
  {
    specifier: "./showcase",
    path: "./src/showcase/mod.ts",
    runtime: "shared",
    stability: "beta",
    // Kept under 120 characters: api_reference.ts emits descriptions verbatim
    // and cannot wrap them, so a longer one fails `deno fmt --check`.
    description: "The showcase kernel: manifests, providers, sessions, and a terminal store for applications.",
    includes: [
      "showcase manifest definition and validation",
      "the showcase kernel and its routes",
      "fixture and live providers",
      "session lifecycle",
      "the terminal store",
    ],
    excludes: ["the Tui runtime itself", "components", "theming"],
  },
  {
    specifier: "./theme",
    path: "./mod.theme.ts",
    runtime: "shared",
    stability: "beta",
    description: "Focused theme engines, manifests, resolvers, galleries, and GrWizard-style theme packs.",
    includes: [
      "theme engine and provider",
      "theme manifests and validation",
      "component theme bindings",
      "theme galleries and previews",
      "GrWizard palette packs",
    ],
    excludes: ["terminal Tui runtime", "browser host helpers", "demo workbench code"],
  },
  {
    specifier: "./runtime",
    path: "./mod.runtime.ts",
    runtime: "shared",
    stability: "beta",
    description: "Shared runtime primitives for scheduling, storage, workers, resources, diagnostics, and backends.",
    includes: [
      "scheduler and render loop",
      "worker pool",
      "runtime storage and diagnostics",
      "resource/cache primitives with freshness and retention policies",
      "bounded channels and disposable async-iterable operators",
      "renderer backend metadata",
    ],
    excludes: ["widgets", "terminal Tui runtime", "browser DOM host"],
  },
  {
    specifier: "./terminal",
    path: "./mod.terminal.ts",
    runtime: "terminal",
    stability: "beta",
    description: "Terminal parser, screen, shell, backend, PTY, workspace, and input-reader primitives.",
    includes: [
      "terminal screen and sequences",
      "shell and process sessions",
      "PTY/backend registry",
      "terminal workspace tabs",
      "input decoder events",
    ],
    excludes: ["component widgets", "browser host helpers", "demo workbench code"],
  },
  {
    specifier: "./testing",
    path: "./mod.testing.ts",
    runtime: "terminal",
    stability: "beta",
    description:
      "Headless terminal app pilot, snapshots, fake input events, stdout capture, and deterministic canvas helpers.",
    includes: [
      "TerminalApp interaction pilot",
      "test input factories",
      "snapshot normalization",
      "test stdout and canvas helpers",
    ],
    excludes: ["demo screenshots", "Playwright harnesses", "runtime benchmarks"],
  },
  {
    specifier: "./layout/yoga",
    path: "./src/layout/solvers/yoga.ts",
    runtime: "shared",
    stability: "experimental",
    description: "Optional Yoga-backed Flexbox solver for HTML/CSS-style layout trees.",
    includes: ["Yoga Flexbox solver", "cell-rect conversion", "text measurement hooks"],
    excludes: ["default dependency-free layout solver", "CSS parser and markup hydration helpers"],
  },
  {
    specifier: "./layout/taffy",
    path: "./src/layout/taffy.ts",
    runtime: "shared",
    stability: "experimental",
    description: "Validated opt-in adapter boundary for caller-supplied Taffy 0.12.x WASM bridges.",
    includes: [
      "versioned backend protocol",
      "caller-owned module loader",
      "host intrinsic measurement boundary",
      "terminal-cell result projection",
      "lifecycle and failure diagnostics",
    ],
    excludes: ["bundled Taffy runtime", "default solver selection", "unverified JavaScript/WASM distributions"],
  },
  {
    specifier: "./layout/taffy-wasm",
    path: "./src/layout/solvers/taffy_wasm.ts",
    runtime: "shared",
    stability: "experimental",
    description: "Real Taffy WASM layout solver over the pinned npm:taffy-layout distribution.",
    includes: [
      "flex, grid, and block solve via Taffy's own algorithms",
      "shared terminal-cell text measurement",
      "per-solve tree disposal (no Taffy handles in public API)",
    ],
    excludes: ["default solver selection", "the caller-supplied bridge protocol (see ./layout/taffy)"],
  },
] as const satisfies readonly PackageEntrypointManifest[];

/** Stability markers for public, experimental, demo, terminal-only, and web-only surfaces. */
export const apiSurfacePolicies: readonly ApiSurfacePolicy[] = [
  {
    pattern: "mod.ts",
    runtime: "terminal",
    stability: "stable",
    public: true,
    description: "Default public API. Changes should follow semver and the changelog policy.",
  },
  {
    pattern: "mod.app.ts",
    runtime: "terminal",
    stability: "beta",
    public: true,
    description: "Focused terminal app API and recommended starting point for new applications.",
  },
  {
    pattern: "mod.web.ts",
    runtime: "browser",
    stability: "beta",
    public: true,
    description: "Browser-safe public API. Intended for adoption, but still expected to evolve between minor releases.",
  },
  {
    pattern: "mod.remote.ts",
    runtime: "remote",
    stability: "experimental",
    public: true,
    description: "Remote terminal bridge API. Protocol and transport details may change while PTY hosting matures.",
  },
  {
    pattern: "mod.three_ascii.ts",
    runtime: "shared",
    stability: "experimental",
    public: true,
    description: "Focused Three ASCII package entrypoint for renderer consumers that do not need the full TUI runtime.",
  },
  {
    pattern: "mod.theme.ts",
    runtime: "shared",
    stability: "beta",
    public: true,
    description: "Focused theme package entrypoint for app authors and theme tooling.",
  },
  {
    pattern: "mod.runtime.ts",
    runtime: "shared",
    stability: "beta",
    public: true,
    description: "Focused runtime package entrypoint for framework authors.",
  },
  {
    pattern: "mod.terminal.ts",
    runtime: "terminal",
    stability: "beta",
    public: true,
    description: "Focused terminal parser/session package entrypoint for shell and multiplexer integrations.",
  },
  {
    pattern: "mod.testing.ts",
    runtime: "terminal",
    stability: "beta",
    public: true,
    description: "Focused test helper package entrypoint for downstream apps.",
  },
  {
    pattern: "src/layout/solvers/yoga.ts",
    runtime: "shared",
    stability: "experimental",
    public: true,
    description: "Optional Yoga-backed layout solver subpath. Flexbox behavior may evolve with solver integration.",
  },
  {
    pattern: "src/layout/taffy.ts",
    runtime: "shared",
    stability: "experimental",
    public: true,
    description:
      "Opt-in Taffy 0.12.x bridge protocol and adapter. No backend or WASM artifact is bundled by the package.",
  },
  {
    pattern: "src/three_ascii/*",
    runtime: "shared",
    stability: "experimental",
    public: true,
    description:
      "Three.js/WebGPU ASCII renderer internals and presets. Useful now, but renderer hooks may keep moving.",
  },
  {
    pattern: "src/runtime/kitty_graphics.ts",
    runtime: "terminal",
    stability: "experimental",
    public: true,
    description:
      "Pure Kitty graphics protocol helpers. Useful for terminal image backends, but the graphics surface API is still forming.",
  },
  {
    pattern: "src/runtime/graphics_surface.ts",
    runtime: "shared",
    stability: "experimental",
    public: true,
    description:
      "Renderer-neutral raster graphics surface abstraction. Useful for Kitty and browser backends, but lifecycle semantics may evolve.",
  },
  {
    pattern: "app/*",
    runtime: "demo",
    stability: "internal",
    public: false,
    description: "Full-screen demo apps. They are adoption examples, not semver-protected package entrypoints.",
  },
  {
    pattern: "examples/*",
    runtime: "demo",
    stability: "internal",
    public: false,
    description: "Focused runnable examples and report emitters. Reuse concepts, not file paths.",
  },
  {
    pattern: "scripts/*",
    runtime: "demo",
    stability: "internal",
    public: false,
    description: "Contributor tooling and generated-report helpers. CLI output can evolve with docs needs.",
  },
] as const satisfies readonly ApiSurfacePolicy[];

/** Release policy for stable, beta, and experimental package surfaces. */
export const packageReleasePolicy: PackageReleasePolicy = {
  changelogFile: "CHANGELOG.md",
  stableBreakingChanges: "Require a major release or an explicit pre-1.0 breaking-change note.",
  betaBreakingChanges: "Allowed in minor releases when documented with migration notes.",
  experimentalBreakingChanges: "Allowed when the changelog calls out the affected experimental surface.",
  deprecationPolicy: "Prefer one minor release of deprecation notice before removing stable public APIs.",
  releaseChecklist: [
    "deno fmt --check",
    "deno check mod.ts mod.app.ts mod.web.ts mod.remote.ts mod.three_ascii.ts mod.theme.ts mod.runtime.ts mod.terminal.ts mod.testing.ts src/layout/solvers/yoga.ts src/layout/taffy.ts",
    "deno task package-check -- --quiet",
    "deno task api-inventory -- --check --quiet --fail-duplicates --min-doc-coverage=1",
    "deno task unicode-data:check",
    "deno task benchmark",
    "deno test",
    "deno task release-check -- --clean",
  ],
};

/** Finds package entrypoint metadata by export specifier or source path. */
export function packageEntrypointFor(specifierOrPath: string): PackageEntrypointManifest | undefined {
  return packageEntrypoints.find((entrypoint) =>
    entrypoint.specifier === specifierOrPath || entrypoint.path === specifierOrPath
  );
}

/** Filters package entrypoint metadata by runtime target or stability tier. */
export function filterPackageEntrypoints(
  query: PackageEntrypointQuery = {},
): PackageEntrypointManifest[] {
  return packageEntrypoints.filter((entrypoint) =>
    (query.runtime === undefined || entrypoint.runtime === query.runtime) &&
    (query.stability === undefined || entrypoint.stability === query.stability)
  );
}

/** Filters source-tree API stability policy records. */
export function filterApiSurfacePolicies(query: ApiSurfacePolicyQuery = {}): ApiSurfacePolicy[] {
  return apiSurfacePolicies.filter((policy) =>
    (query.runtime === undefined || policy.runtime === query.runtime) &&
    (query.stability === undefined || policy.stability === query.stability) &&
    (query.public === undefined || policy.public === query.public)
  );
}

/** Formats package entrypoints as a Markdown table for docs and release notes. */
export function formatPackageEntrypointMarkdown(
  entrypoints: readonly PackageEntrypointManifest[] = packageEntrypoints,
): string {
  const lines = [
    "| Specifier | Path | Runtime | Stability | Purpose |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const entrypoint of entrypoints) {
    lines.push(
      `| \`${entrypoint.specifier}\` | \`${entrypoint.path}\` | ${entrypoint.runtime} | ${entrypoint.stability} | ${entrypoint.description} |`,
    );
  }
  return lines.join("\n");
}
