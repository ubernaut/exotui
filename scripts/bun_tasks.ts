// Copyright 2026 ubernaut. MIT license.
// Reuse the repository's task catalog; translate host-runtime commands without losing shell persistence branches.
import { parse } from "./vendor/jsonc/mod.ts";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

interface Token {
  value: string;
  start: number;
  end: number;
}
/** Token positions retain the original shell spelling, including substitutions and quoted arguments. */
export function shellTaskTokens(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    if (/\s/.test(source[index]!)) {
      index++;
      continue;
    }
    const start = index;
    let value = "", quote = "";
    while (index < source.length) {
      const char = source[index]!;
      if (!quote && /\s/.test(char)) break;
      if (char === "\\" && quote !== "'") {
        index++;
        value += source[index++] ?? "";
        continue;
      }
      if (char === "'" || char === '"') {
        if (!quote) {
          quote = char;
          index++;
          continue;
        }
        if (quote === char) {
          quote = "";
          index++;
          continue;
        }
      }
      value += char;
      index++;
    }
    if (quote) throw new SyntaxError("Unterminated task shell quote");
    tokens.push({ value, start, end: index });
  }
  return tokens;
}
function quote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

/** Translate executable invocations; Deno's formatter/publisher/graph inspector remain explicit Deno maintenance tools. */
export function translateBunTask(source: string, executable = process.execPath): string {
  const tokens = shellTaskTokens(source);
  const edits: { start: number; end: number; text: string }[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if ((token.value === "sh" || token.value === "bash") && tokens[index + 1]?.value === "-c" && tokens[index + 2]) {
      const body = tokens[index + 2]!;
      edits.push({ start: body.start, end: body.end, text: quote(translateBunTask(body.value, executable)) });
      index += 2;
      continue;
    }
    if (token.value !== "deno") continue;
    const action = tokens[index + 1]?.value;
    if (action === "run") {
      let end = index + 2;
      const retained: string[] = [];
      while (tokens[end]?.value.startsWith("-")) {
        const item = tokens[end]!;
        if (item.value === "--") {
          end++;
          break;
        }
        if (["--config", "-c", "--import-map", "--lock", "--location"].includes(item.value)) {
          end += 2;
          continue;
        }
        if (item.value === "--watch" || item.value.startsWith("--watch=")) retained.push(item.value);
        else if (
          !/^(?:-A|-q|--allow-|--deny-|--unstable|--no-check|--no-prompt|--no-remote|--cached-only|--reload|--quiet|--config=|--import-map=|--lock=|--node-modules-dir|--conditions=)/
            .test(item.value)
        ) {
          throw new Error(`Unsupported Deno run flag in Bun task: ${item.value}`);
        }
        end++;
      }
      edits.push({
        start: token.start,
        end: tokens[end - 1]!.end,
        text: [quote(executable), "run", ...retained.map(quote)].join(" "),
      });
      index = end - 1;
    } else if (action === "task") {
      let end = index + 2;
      let cwd: string | undefined;
      if (tokens[end]?.value === "--cwd") {
        cwd = tokens[end + 1]!.value;
        end += 2;
      }
      edits.push({
        start: token.start,
        end: tokens[end - 1]!.end,
        text: [quote(executable), "run", ...(cwd ? ["--cwd", quote(cwd)] : [])].join(" "),
      });
      index = end - 1;
    } else if (action === "test" || action === "check") {
      let end = index + 2;
      while (tokens[end]?.value.startsWith("-")) {
        if (["--config", "-c"].includes(tokens[end]!.value)) end += 2;
        else end++;
      }
      const script = action === "test" ? "./scripts/bun_test_runner.ts" : "./scripts/bun_check.ts";
      edits.push({ start: token.start, end: tokens[end - 1]!.end, text: `${quote(executable)} ${quote(script)}` });
      index = end - 1;
    }
  }
  let translated = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    translated = translated.slice(0, edit.start) + edit.text + translated.slice(edit.end);
  }
  return translated;
}

if (import.meta.main) {
  const [task, ...forwarded] = Bun.argv.slice(2);
  if (forwarded[0] === "--") forwarded.shift();
  const root = fileURLToPath(new URL("../", import.meta.url));
  const config = parse(await Bun.file(resolve(root, "deno.jsonc")).text()) as { tasks?: Record<string, string> };
  if (!task || task === "--list") {
    console.log(Object.keys(config.tasks ?? {}).join("\n"));
  } else {
    const command = config.tasks?.[task];
    if (!command) throw new Error(`Unknown task: ${task}`);
    const translated = translateBunTask(command);
    const shell = [translated, ...forwarded.map(quote)].join(" ");
    const child = Bun.spawn(["sh", "-c", shell], { cwd: root, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
    process.exit(await child.exited);
  }
}
