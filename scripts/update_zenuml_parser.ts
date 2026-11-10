// Copyright 2026 ExotUI contributors. MIT license.
// Reproducible development-only extraction of the pinned official grammar. No
// SDK/private parser modification, inferred syntax or runtime network fetching.
import * as esbuild from "esbuild";
import { findPackageJSON } from "node:module";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

const version = "3.50.1", runtimeVersion = "4.11.0";
const mapHash = "fb802022484672fc66957b7aa2b62ba7f387eed1581b031fe5da29f4e1fc3390";
const files = {
  "sequenceLexer.js": "5957961a6245c5ba679ea4bef06a0e5cb48fd357ed4bfc938dd475ae46706656",
  "sequenceParserListener.js": "20b925ecafa638178453909802b45b3bef07394bba3235ba2f9e84114a7076fa",
  "sequenceParser.js": "4ba2e378d04e4bf3398873d5cd857bbb62c1eb30a676fc3db4e1dda164b5f60b",
};
const metadata = findPackageJSON("@zenuml/core", import.meta.url);
if (!metadata) throw new Error("Cache the pinned @zenuml/core dependency before generating its grammar.");
const root = dirname(metadata);
if (JSON.parse(await Deno.readTextFile(metadata)).version !== version) throw new Error("Unexpected ZenUML version.");
const raw = await Deno.readTextFile(resolve(root, "dist/zenuml.esm.mjs.map"));
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
if (hash(raw) !== mapHash) throw new Error("Pinned ZenUML source-map integrity differs.");
const map = JSON.parse(raw) as { sources: string[]; sourcesContent: string[] };
const sources = new Map<string, string>();
for (const [name, expected] of Object.entries(files)) {
  const source = map.sourcesContent[map.sources.indexOf(`../src/generated-parser/${name}`)];
  if (!source || hash(source) !== expected) throw new Error(`Pinned ZenUML grammar integrity differs: ${name}`);
  sources.set(name, source);
}
const runtimeMetadata = findPackageJSON("antlr4", resolve(root, "dist/zenuml.esm.mjs"));
if (!runtimeMetadata || JSON.parse(await Deno.readTextFile(runtimeMetadata)).version !== runtimeVersion) {
  throw new Error("Unexpected ANTLR runtime version.");
}
const license = await Deno.readTextFile(resolve(root, "LICENSE"));
if (!license.includes("Copyright (c) 2022 Peng Xiao")) throw new Error("Missing reviewed ZenUML MIT license.");
// Full upstream BSD notice remains in the distributable, even though the
// minifier removes individual runtime file comments. See antlr.org/license.html.
const antlrLicense = `Copyright (c) 2012 Terence Parr and Sam Harwell
Copyright (c) 2012-2022 The ANTLR Project. All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:
1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
3. Neither the name of the author nor the names of its contributors may be used
   to endorse or promote products derived from this software without specific
   prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`;

// Match the upstream RootContext SLL/LL algorithm and public parse acceptance.
// Lexer failures are intentionally not parser diagnostics in that API. Capture
// only the first parser diagnostic, as consumed by the extension boundary. Each
// request has a disposable worker realm: DFA/tree/error state cannot accumulate.
const entry = `import antlr4 from "antlr4";
import Lexer from "./sequenceLexer.js";
import Parser from "./sequenceParser.js";
self.onmessage = ({ data: source }) => {
  let first;
  const make = () => {
    const lexer = new Lexer(new antlr4.InputStream(source));
    lexer.removeErrorListeners();
    const parser = new Parser(new antlr4.CommonTokenStream(lexer));
    parser.removeErrorListeners();
    return parser;
  };
  try {
    const fast = make();
    fast._interp.predictionMode = antlr4.atn.PredictionMode.SLL;
    fast._errHandler = new antlr4.error.BailErrorStrategy();
    try { fast.prog(); self.postMessage({ pass: true }); return; }
    catch { /* Upstream LL fallback, not a second grammar. */ }
    const parser = make();
    parser.addErrorListener({
      syntaxError(_recognizer, _symbol, line, column, msg) {
        if (!first) first = { line, column, msg };
      },
      reportAmbiguity() {}, reportAttemptingFullContext() {}, reportContextSensitivity() {}
    });
    const result = parser._syntaxErrors ? null : parser.prog();
    self.postMessage({ pass: !first && result !== null, error: first });
  } catch { self.postMessage({ pass: false }); }
};`;
const build = await esbuild.build({
  stdin: { contents: entry, sourcefile: "zenuml-validation-entry.js" },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  target: "es2022",
  minify: true,
  legalComments: "none",
  plugins: [{
    name: "pinned-zenuml-grammar",
    setup(builder) {
      builder.onResolve(
        { filter: /^antlr4$/ },
        () => ({ path: resolve(dirname(runtimeMetadata), "src/antlr4/index.js") }),
      );
      builder.onResolve({ filter: /^\.\/sequence(?:Lexer|Parser|ParserListener)\.js$/ }, ({ path }) => ({
        path: path.slice(2),
        namespace: "zenuml-grammar",
      }));
      builder.onLoad(
        { filter: /.*/, namespace: "zenuml-grammar" },
        ({ path }) => ({ contents: sources.get(path), loader: "js" }),
      );
    },
  }],
});
esbuild.stop();
const script = build.outputFiles![0]!.text;
if (script.length > 512 * 1024) throw new RangeError("ZenUML validation worker exceeds its reviewed byte budget.");
const notice = `${license.trim()}\n\n${antlrLicense}`;
const worker = `/*!\n${notice}\n*/\n${script}`;
const output = `// deno-fmt-ignore-file\n// Generated by scripts/update_zenuml_parser.ts. Do not hand edit.\n` +
  `// @zenuml/core@${version}, antlr4@${runtimeVersion}; source map SHA-256 ${mapHash}.\n` +
  `// Exact unmodified grammar source hashes: ${JSON.stringify(files)}\n` +
  `/*\n${notice}\n*/\nexport const ZENUML_VALIDATION_WORKER: string = ${JSON.stringify(worker)};\n`;
const destination = new URL("../src/content/mermaid_zenuml_data.ts", import.meta.url);
if (Deno.args.includes("--check")) {
  if (await Deno.readTextFile(destination) !== output) {
    throw new Error("Generated ZenUML parser differs from pinned sources.");
  }
} else await Deno.writeTextFile(destination, output);
console.log(
  JSON.stringify({
    version,
    runtimeVersion,
    grammarFiles: sources.size,
    workerBytes: worker.length,
    sha256: hash(worker),
  }),
);
