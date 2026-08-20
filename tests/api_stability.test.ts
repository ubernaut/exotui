import { assertEquals } from "./deps.ts";
import {
  apiSurfacePolicies,
  filterApiSurfacePolicies,
  filterPackageEntrypoints,
  formatPackageEntrypointMarkdown,
  packageEntrypointFor,
  packageEntrypoints,
  packageReleasePolicy,
} from "../mod.ts";
import {
  formatPackageExportValidation,
  formatPackageMetadataValidation,
  formatStableAppExportValidation,
  formatStableDemoExportValidation,
  PACKAGE_NAME,
  PACKAGE_PUBLISH_INCLUDES,
  parseStableAppExportPolicy,
  validatePackageExports,
  validatePackageMetadata,
  validateStableAppExports,
  validateStableDemoExports,
} from "../scripts/package_check.ts";

Deno.test("package entrypoint manifest separates terminal web and remote surfaces", () => {
  assertEquals(packageEntrypoints.map((entrypoint) => entrypoint.specifier), [
    ".",
    "./app",
    "./web",
    "./remote",
    "./three-ascii",
    "./viz",
    "./viz/three",
    "./showcase",
    "./theme",
    "./runtime",
    "./terminal",
    "./testing",
    "./layout/yoga",
    "./layout/taffy",
    "./layout/taffy-wasm",
  ]);
  assertEquals(packageEntrypointFor(".")?.path, "./mod.ts");
  assertEquals(packageEntrypointFor("./mod.web.ts")?.specifier, "./web");
  assertEquals(packageEntrypointFor("./mod.three_ascii.ts")?.specifier, "./three-ascii");
  assertEquals(packageEntrypointFor("./mod.theme.ts")?.specifier, "./theme");
  assertEquals(filterPackageEntrypoints({ runtime: "browser" }).map((entrypoint) => entrypoint.specifier), ["./web"]);
  assertEquals(filterPackageEntrypoints({ runtime: "terminal" }).map((entrypoint) => entrypoint.specifier), [
    ".",
    "./app",
    "./terminal",
    "./testing",
  ]);
  assertEquals(filterPackageEntrypoints({ stability: "experimental" }).map((entrypoint) => entrypoint.specifier), [
    "./remote",
    "./three-ascii",
    "./viz/three",
    "./layout/yoga",
    "./layout/taffy",
    "./layout/taffy-wasm",
  ]);
  assertEquals(filterPackageEntrypoints({ stability: "beta" }).map((entrypoint) => entrypoint.specifier), [
    "./app",
    "./web",
    "./viz",
    "./showcase",
    "./theme",
    "./runtime",
    "./terminal",
    "./testing",
  ]);
  assertEquals(formatPackageEntrypointMarkdown().includes("`./web`"), true);
  assertEquals(formatPackageEntrypointMarkdown().includes("`./three-ascii`"), true);
  assertEquals(formatPackageEntrypointMarkdown().includes("`./theme`"), true);
});

Deno.test("api surface policies mark public experimental and demo-only code", () => {
  assertEquals(filterApiSurfacePolicies({ public: true }).map((policy) => policy.pattern), [
    "mod.ts",
    "mod.app.ts",
    "mod.web.ts",
    "mod.remote.ts",
    "mod.three_ascii.ts",
    "mod.theme.ts",
    "mod.runtime.ts",
    "mod.terminal.ts",
    "mod.testing.ts",
    "src/layout/solvers/yoga.ts",
    "src/layout/taffy.ts",
    "src/three_ascii/*",
    "src/runtime/kitty_graphics.ts",
    "src/runtime/graphics_surface.ts",
  ]);
  assertEquals(filterApiSurfacePolicies({ stability: "internal" }).map((policy) => policy.pattern), [
    "app/*",
    "examples/*",
    "scripts/*",
  ]);
  assertEquals(apiSurfacePolicies.some((policy) => policy.runtime === "demo" && !policy.public), true);
});

Deno.test("package release policy lists the package quality gate", () => {
  assertEquals(packageReleasePolicy.changelogFile, "CHANGELOG.md");
  assertEquals(packageReleasePolicy.releaseChecklist.includes("deno task package-check -- --quiet"), true);
  assertEquals(packageReleasePolicy.releaseChecklist.includes("deno task unicode-data:check"), true);
  assertEquals(packageReleasePolicy.releaseChecklist.includes("deno task release-check -- --clean"), true);
  assertEquals(
    packageReleasePolicy.releaseChecklist.some((command) => command.includes("src/layout/taffy.ts")),
    true,
  );
  assertEquals(
    packageReleasePolicy.releaseChecklist.includes(
      "deno task api-inventory -- --check --quiet --fail-duplicates --min-doc-coverage=1",
    ),
    true,
  );
});

Deno.test("package metadata validation pins identity, semver, and the lean publish boundary", () => {
  const valid = validatePackageMetadata({
    name: PACKAGE_NAME,
    version: "0.1.0",
    publish: { include: [...PACKAGE_PUBLISH_INCLUDES] },
  });
  assertEquals(valid.ok, true);
  assertEquals(formatPackageMetadataValidation(valid), "ok package metadata matches release policy");

  const invalid = validatePackageMetadata({
    name: "@scope/other",
    version: "next",
    publish: { include: ["README.md", "docs/*.md", 42] },
  });
  assertEquals(invalid.ok, false);
  assertEquals(invalid.invalidName, true);
  assertEquals(invalid.invalidVersion, true);
  assertEquals(invalid.invalidPublishIncludes, true);
  assertEquals(invalid.missingPublishIncludes, [
    "CHANGELOG.md",
    "LICENSE.md",
    "mod*.ts",
    "src/**/*.ts",
  ]);
  assertEquals(invalid.unexpectedPublishIncludes, ["docs/*.md"]);
  assertEquals(formatPackageMetadataValidation(invalid).includes("invalid package version: next"), true);
});

Deno.test("package export validation compares deno export maps with the stability manifest", () => {
  const valid = validatePackageExports(
    {
      exports: {
        ".": "./mod.ts",
        "./app": "./mod.app.ts",
        "./web": "./mod.web.ts",
        "./remote": "./mod.remote.ts",
        "./three-ascii": "./mod.three_ascii.ts",
        "./viz": "./src/viz/mod.ts",
        "./showcase": "./src/showcase/mod.ts",
        "./theme": "./mod.theme.ts",
        "./runtime": "./mod.runtime.ts",
        "./terminal": "./mod.terminal.ts",
        "./testing": "./mod.testing.ts",
        "./layout/yoga": "./src/layout/solvers/yoga.ts",
        "./layout/taffy": "./src/layout/taffy.ts",
        "./layout/taffy-wasm": "./src/layout/solvers/taffy_wasm.ts",
        "./viz/three": "./src/viz/three/mod.ts",
      },
    },
    packageEntrypoints,
    { exists: () => true },
  );
  assertEquals(valid.ok, true);
  assertEquals(
    formatPackageExportValidation(valid),
    [
      "ok package exports match the stability manifest",
      "stable: ok",
      "beta: ok",
      "experimental: ok",
      "internal: ok",
    ].join("\n"),
  );

  const invalid = validatePackageExports(
    {
      exports: {
        ".": "./mod.ts",
        "./extra": "./extra.ts",
        "./web": "./wrong.ts",
      },
    },
    packageEntrypoints,
    {
      exists: (path) =>
        path !== "mod.app.ts" && path !== "mod.remote.ts" && path !== "mod.three_ascii.ts" && path !== "mod.theme.ts" &&
        path !== "mod.runtime.ts" && path !== "mod.terminal.ts" && path !== "mod.testing.ts" &&
        path !== "src/layout/solvers/yoga.ts" && path !== "src/layout/taffy.ts" &&
        path !== "src/layout/solvers/taffy_wasm.ts",
    },
  );
  assertEquals(invalid.ok, false);
  assertEquals(invalid.missingExports, [
    "./app",
    "./remote",
    "./three-ascii",
    "./viz",
    "./viz/three",
    "./showcase",
    "./theme",
    "./runtime",
    "./terminal",
    "./testing",
    "./layout/yoga",
    "./layout/taffy",
    "./layout/taffy-wasm",
  ]);
  assertEquals(invalid.mismatchedExports, [{ specifier: "./web", expected: "./mod.web.ts", actual: "./wrong.ts" }]);
  assertEquals(invalid.unexpectedExports, ["./extra"]);
  assertEquals(invalid.missingFiles, [
    "./mod.app.ts",
    "./mod.remote.ts",
    "./mod.three_ascii.ts",
    "./mod.theme.ts",
    "./mod.runtime.ts",
    "./mod.terminal.ts",
    "./mod.testing.ts",
    "./src/layout/solvers/yoga.ts",
    "./src/layout/taffy.ts",
    "./src/layout/solvers/taffy_wasm.ts",
  ]);
  assertEquals(invalid.byStability.stable.ok, true);
  assertEquals(invalid.byStability.beta.ok, false);
  assertEquals(invalid.byStability.experimental.ok, false);
  assertEquals(invalid.byStability.beta.mismatchedExports, [
    { specifier: "./web", expected: "./mod.web.ts", actual: "./wrong.ts" },
  ]);
  assertEquals(invalid.byStability.experimental.missingExports, [
    "./remote",
    "./three-ascii",
    "./viz/three",
    "./layout/yoga",
    "./layout/taffy",
    "./layout/taffy-wasm",
  ]);
});

Deno.test("package check guards stable entrypoint against new demo-only modules", () => {
  const current = validateStableDemoExports({
    modules: [
      { module: "mod.ts" },
      { module: "src/components/button.ts" },
      { module: "src/markup/demo_fixtures.ts" },
      { module: "src/three_ascii/demo_presets.ts" },
    ],
  });

  assertEquals(current.ok, true);
  assertEquals(
    formatStableDemoExportValidation(current),
    [
      "ok stable exports contain no new demo-only modules",
      "legacy allowed: src/canvas/pixel_samplers.ts, src/markup/demo_fixtures.ts, " +
      "src/three_ascii/demo_presets.ts, src/tooling/codemods.ts, src/tooling/example_registry.ts, " +
      "src/visual/downsample.ts",
    ].join("\n"),
  );

  const drift = validateStableDemoExports({
    modules: [
      { module: "mod.ts" },
      { module: "src/examples/new_widget_demo.ts" },
      { module: "src/markup/demo_fixtures.ts" },
    ],
  });

  assertEquals(drift.ok, false);
  assertEquals(drift.unexpectedModules, ["src/examples/new_widget_demo.ts"]);
  assertEquals(
    formatStableDemoExportValidation(drift).includes("unexpected stable demo export: src/examples/new_widget_demo.ts"),
    true,
  );
});

Deno.test("package check guards stable entrypoint against new app and workbench modules", () => {
  const current = validateStableAppExports({
    modules: [
      { module: "mod.ts" },
      { module: "src/app/actions.ts" },
      { module: "src/app/workbench/mod.ts" },
      { module: "src/app/workbench_terminal.ts" },
      { module: "src/components/button.ts" },
    ],
  }, {
    legacyAllowedModules: [
      "src/app/actions.ts",
      "src/app/workbench/mod.ts",
      "src/app/workbench_terminal.ts",
    ],
  });

  assertEquals(current.ok, true);
  assertEquals(current.staleAllowedModules, []);
  assertEquals(
    formatStableAppExportValidation(current),
    [
      "ok stable exports contain no new app/workbench modules",
      "legacy app modules allowed: 3",
    ].join("\n"),
  );

  const drift = validateStableAppExports({
    modules: [
      { module: "mod.ts" },
      { module: "src/app/actions.ts" },
      { module: "src/app/workbench/new_internal_helper.ts" },
      { module: "src/app/workbench_terminal.ts" },
      { module: "src/app/workbench_z_layer_experiment.ts" },
    ],
  }, {
    legacyAllowedModules: [
      "src/app/actions.ts",
      "src/app/workbench_terminal.ts",
    ],
  });

  assertEquals(drift.ok, false);
  assertEquals(drift.unexpectedModules, [
    "src/app/workbench/new_internal_helper.ts",
    "src/app/workbench_z_layer_experiment.ts",
  ]);
  assertEquals(drift.staleAllowedModules, []);
  assertEquals(
    formatStableAppExportValidation(drift).includes(
      "unexpected stable app export: src/app/workbench/new_internal_helper.ts",
    ),
    true,
  );

  const stale = validateStableAppExports({
    modules: [
      { module: "mod.ts" },
      { module: "src/app/actions.ts" },
    ],
  }, {
    legacyAllowedModules: [
      "src/app/actions.ts",
      "src/app/workbench_removed_helper.ts",
    ],
  });

  assertEquals(stale.ok, false);
  assertEquals(stale.unexpectedModules, []);
  assertEquals(stale.staleAllowedModules, ["src/app/workbench_removed_helper.ts"]);
  assertEquals(
    formatStableAppExportValidation(stale).includes(
      "stale stable app allowlist entry: src/app/workbench_removed_helper.ts",
    ),
    true,
  );
});

Deno.test("stable app export policy parses reviewable JSON allowlists", () => {
  const policy = parseStableAppExportPolicy(JSON.stringify({
    description: "compat",
    legacyAllowedModules: [
      "src/app/workbench_terminal.ts",
      "src/app/actions.ts",
    ],
  }));

  assertEquals(policy.description, "compat");
  assertEquals(policy.legacyAllowedModules, [
    "src/app/actions.ts",
    "src/app/workbench_terminal.ts",
  ]);
});
