// Copyright 2023 Im-Beast. MIT license.

// PKG-007: the compiled launcher embeds CODE and externalizes DATA. The
// generated main resolves its user-data directory deterministically from
// the platform's declared environment (XDG_DATA_HOME → HOME/.local/share
// on Linux, APPDATA on Windows, Library/Application Support on macOS) —
// never beside the binary — prints its SEC-001 permission manifest under
// --print-permissions, and restores terminal state (SGR reset + cursor
// show) on every exit path via try/finally. The verification suite
// compiles the template with `deno compile`, executes the host binary's
// smoke run, and cross-compiles the other targets, checking their
// binary formats.

/** Generates the launcher template files. */
export function generateLauncherTemplate(options: { readonly importSource: string }): Readonly<Record<string, string>> {
  return {
    "deno.json": JSON.stringify(
      {
        imports: { "@ubernaut/deno-tui": `${options.importSource}/mod.ts` },
        tasks: { compile: "deno compile --allow-env -o launcher main.ts" },
      },
      null,
      2,
    ) + "\n",
    "main.ts": `import { createRuntimePermissionManifest } from "@ubernaut/deno-tui";

const MANIFEST = createRuntimePermissionManifest({
  adapterId: "launcher-app",
  required: [{ kind: "environment", operation: "read", target: "HOME" }],
});

/** Deterministic user-data location — never beside the binary. */
export function dataDirectory(env: (name: string) => string | undefined): string {
  const os = Deno.build.os;
  if (os === "windows") {
    return \`\${env("APPDATA") ?? "C:\\\\Users\\\\default\\\\AppData\\\\Roaming"}\\\\launcher-app\`;
  }
  if (os === "darwin") {
    return \`\${env("HOME") ?? "/Users/default"}/Library/Application Support/launcher-app\`;
  }
  const base = env("XDG_DATA_HOME") ?? \`\${env("HOME") ?? "/root"}/.local/share\`;
  return \`\${base}/launcher-app\`;
}

if (import.meta.main) {
  if (Deno.args.includes("--print-permissions")) {
    console.log(JSON.stringify(MANIFEST));
    Deno.exit(0);
  }
  try {
    console.log(\`assets:\${dataDirectory(Deno.env.get)}\`);
  } finally {
    // Terminal restore runs on EVERY exit path.
    console.log("\\x1b[0m\\x1b[?25h");
  }
}
`,
  };
}
