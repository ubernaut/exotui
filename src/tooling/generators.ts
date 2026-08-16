// Copyright 2023 Im-Beast. MIT license.

// PKG-002: generators PROPOSE, the host confirms. Each artifact kind
// (widget, controller, command, route, theme, worker, test, example)
// generates named files plus an EXPLICIT export-line instruction — the
// barrel update is intentional, never a silent append. Planning against
// existing files classifies every path as create / identical / conflict,
// where a conflict carries the diff and applying a plan REFUSES to
// overwrite conflicts unless the host confirms each one. Names pass the
// API policy (kebab-case files, PascalCase types, create* factories)
// before anything generates.

/** Generator kinds. */
export type ArtifactKind =
  | "widget"
  | "controller"
  | "command"
  | "route"
  | "theme"
  | "worker"
  | "test"
  | "example";

/** One generated artifact. */
export interface GeneratedArtifact {
  readonly kind: ArtifactKind;
  readonly files: Readonly<Record<string, string>>;
  /** The intentional export update: file and exact line to add. */
  readonly exportInstruction?: { readonly file: string; readonly line: string };
}

/** API policy validation. */
export function validateArtifactName(name: string): string | undefined {
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
    return `name "${name}" must be kebab-case (api policy)`;
  }
  return undefined;
}

function pascal(name: string): string {
  return name.split("-").map((part) => part[0]!.toUpperCase() + part.slice(1)).join("");
}

function camel(name: string): string {
  const cased = pascal(name);
  return cased[0]!.toLowerCase() + cased.slice(1);
}

/** Generates one artifact's files and export instruction. */
export function generateArtifact(kind: ArtifactKind, name: string): GeneratedArtifact {
  const invalid = validateArtifactName(name);
  if (invalid) throw new TypeError(invalid);
  const type = pascal(name);
  const factory = `create${type}`;
  const modulePath = `src/${kind === "example" ? "examples" : "app"}/${name.replaceAll("-", "_")}.ts`;
  const testPath = `tests/${name.replaceAll("-", "_")}.test.ts`;

  const moduleSource = `// Copyright 2023 Im-Beast. MIT license.

/** ${type} ${kind}. */
export interface ${type} {
  readonly name: string;
}

/** Creates the ${name} ${kind}. */
export function ${factory}(): ${type} {
  return { name: "${name}" };
}
`;
  const testSource = `import { ${factory} } from "../${modulePath.replace("src/", "src/")}";

Deno.test("${name} ${kind} constructs", () => {
  if (${factory}().name !== "${name}") {
    throw new Error("construction failed");
  }
});
`;
  const files: Record<string, string> = { [modulePath]: moduleSource };
  if (kind !== "test") files[testPath] = testSource;
  return {
    kind,
    files,
    exportInstruction: kind === "example" || kind === "test" ? undefined : {
      file: "src/app/mod.ts",
      line: `export * from "./${name.replaceAll("-", "_")}.ts";`,
    },
  };
}

/** One planned file action. */
export type PlannedFile =
  | { readonly path: string; readonly action: "create"; readonly contents: string }
  | { readonly path: string; readonly action: "identical" }
  | { readonly path: string; readonly action: "conflict"; readonly contents: string; readonly diff: readonly string[] };

/** Plans generation against existing file contents. */
export function planGeneration(
  artifact: GeneratedArtifact,
  existing: Readonly<Record<string, string | undefined>>,
): PlannedFile[] {
  return Object.entries(artifact.files).map(([path, contents]) => {
    const current = existing[path];
    if (current === undefined) return { path, action: "create", contents };
    if (current === contents) return { path, action: "identical" };
    const diff: string[] = [];
    const currentLines = current.split("\n");
    const nextLines = contents.split("\n");
    for (let index = 0; index < Math.max(currentLines.length, nextLines.length); index += 1) {
      if (currentLines[index] === nextLines[index]) continue;
      if (currentLines[index] !== undefined) diff.push(`-${index + 1}: ${currentLines[index]}`);
      if (nextLines[index] !== undefined) diff.push(`+${index + 1}: ${nextLines[index]}`);
    }
    return { path, action: "conflict", contents, diff };
  });
}

/** Applies a plan; conflicts write ONLY with per-file confirmation. */
export function applyPlan(
  plan: readonly PlannedFile[],
  options: {
    write(path: string, contents: string): void;
    confirmOverwrite?(path: string, diff: readonly string[]): boolean;
  },
): { written: string[]; skippedConflicts: string[] } {
  const written: string[] = [];
  const skippedConflicts: string[] = [];
  for (const file of plan) {
    if (file.action === "identical") continue;
    if (file.action === "create") {
      options.write(file.path, file.contents);
      written.push(file.path);
      continue;
    }
    // Conflict: an edited file is NEVER overwritten without confirmation.
    if (options.confirmOverwrite?.(file.path, file.diff) === true) {
      options.write(file.path, file.contents);
      written.push(file.path);
    } else {
      skippedConflicts.push(file.path);
    }
  }
  return { written, skippedConflicts };
}
