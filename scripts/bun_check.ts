// Copyright 2026 ubernaut. MIT license.
import ts from "typescript";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const configFile = resolve(root, "tsconfig.json");
const read = ts.readConfigFile(configFile, ts.sys.readFile);
const reporter: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (name) => name,
  getCurrentDirectory: () => root,
  getNewLine: () => "\n",
};
if (read.error) {
  console.error(ts.formatDiagnosticsWithColorAndContext([read.error], reporter));
  process.exit(1);
}
const config = ts.parseJsonConfigFileContent(read.config, ts.sys, root, undefined, configFile);
const args = Bun.argv.slice(2).filter((arg) => arg !== "--");
if (args.includes("--help") || args.includes("-h")) {
  console.log(
    "usage: bun scripts/bun_check.ts [TypeScript source files]\nWithout files, checks the root tsconfig include set.",
  );
  process.exit(0);
}
const unknown = args.find((arg) => arg.startsWith("-"));
if (unknown) throw new Error(`Unsupported type-check option: ${unknown}`);
const rootNames = args.length ? args.map((path) => resolve(path)) : config.fileNames;
if (!rootNames.length) throw new Error("No source files selected for type checking");
const program = ts.createProgram({
  rootNames,
  options: { ...config.options, noEmit: true },
  projectReferences: config.projectReferences,
});
const diagnostics = [...config.errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, reporter));
  process.exit(1);
}
if (args.length) { for (const file of rootNames) console.log(`Check ${relative(process.cwd(), file)}`); }
console.log(`Bun TypeScript check passed (${rootNames.length} source roots, TypeScript ${ts.version}).`);
