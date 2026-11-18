// Copyright 2026 ubernaut. MIT license.
// Verify a consumer of the actual npm tarball, outside the checkout and its import maps.
import { runtimeHost } from "../src/runtime/host.ts";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await runtimeHost.makeTempDir({ prefix: "exotui-bun-consumer-" });
async function run(command: string, args: string[], cwd: string): Promise<string> {
  const result = await new runtimeHost.Command(command, { args, cwd }).output();
  const stdout = new TextDecoder().decode(result.stdout);
  if (!result.success) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.code})\n${stdout}\n${new TextDecoder().decode(result.stderr)}`,
    );
  }
  return stdout;
}
try {
  const packed = JSON.parse(await run("npm", ["pack", "--json", "--pack-destination", directory], root)) as {
    filename: string;
    files: { path: string }[];
  }[];
  const artifact = packed[0]!;
  if (!artifact.files.some((file) => file.path === "src/three_ascii/assets/fillASCII.png")) {
    throw new Error("Packed consumer is missing Three glyph atlases");
  }
  const consumer = join(directory, "consumer");
  await runtimeHost.mkdir(consumer);
  await runtimeHost.writeTextFile(
    join(consumer, "package.json"),
    JSON.stringify({
      name: "exotui-bun-consumer-check",
      private: true,
      type: "module",
      dependencies: { "@ubernaut/exotui": `file:${join(directory, artifact.filename)}` },
      devDependencies: { "@types/bun": "1.4.0", "@webgpu/types": "0.1.69", typescript: "6.0.3" },
    }),
  );
  await run(runtimeHost.execPath(), ["install"], consumer);
  const manifest = JSON.parse(await runtimeHost.readTextFile(join(root, "package.json"))) as {
    exports: Record<string, string>;
  };
  const imports = Object.keys(manifest.exports).map((key, index) => {
    const name = key === "." ? "@ubernaut/exotui" : `@ubernaut/exotui${key.slice(1)}`;
    return `import * as entry${index} from ${JSON.stringify(name)};`;
  });
  const inspections = Object.keys(manifest.exports).map((_key, index) => `Object.keys(entry${index}).length`);
  await runtimeHost.writeTextFile(
    join(consumer, "consumer.ts"),
    [
      ...imports,
      'import { createTestTerminalApp } from "@ubernaut/exotui/testing";',
      'import type { RuntimeStdin, RuntimeStdout } from "@ubernaut/exotui/runtime";',
      "const portableTypes: [RuntimeStdin | undefined, RuntimeStdout | undefined] = [undefined, undefined];",
      "void portableTypes;",
      "const harness = await createTestTerminalApp({});",
      "harness.destroy();",
      `console.log(JSON.stringify([${inspections.join(",")} ]));`,
    ].join("\n"),
  );
  await runtimeHost.writeTextFile(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        module: "Preserve",
        moduleResolution: "Bundler",
        allowImportingTsExtensions: true,
        noEmit: true,
        strict: true,
        skipLibCheck: true,
        types: ["bun", "@webgpu/types"],
        lib: ["ESNext", "DOM", "DOM.Iterable"],
      },
      include: ["consumer.ts"],
    }),
  );
  await run(runtimeHost.execPath(), ["./node_modules/typescript/bin/tsc", "--noEmit"], consumer);
  const result = await run(runtimeHost.execPath(), ["./consumer.ts"], consumer);
  console.log(
    `Packed Bun consumer: ${imports.length} entrypoints, strict types and headless app lifecycle passed. ${result.trim()}`,
  );
} finally {
  await runtimeHost.remove(directory, { recursive: true });
}
