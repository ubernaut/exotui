#!/usr/bin/env node
import { spawn } from "node:child_process";
import { ensureBinary } from "../lib/binary.mjs";

try {
  const binary = await ensureBinary();
  const child = spawn(binary, process.argv.slice(2), { stdio: "inherit" });
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
  const handlers = new Map(
    signals.map((signal) => [signal, () => child.kill(signal)]),
  );
  for (const [signal, handler] of handlers) process.on(signal, handler);
  const cleanup = () => {
    for (const [signal, handler] of handlers) process.off(signal, handler);
  };
  child.once("error", (error) => {
    cleanup();
    console.error(`exomux: ${error.message}`);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    cleanup();
    if (signal && process.platform !== "win32") {
      process.kill(process.pid, signal);
    } else process.exitCode = code ?? 1;
  });
} catch (error) {
  console.error(`exomux: ${error.message}`);
  process.exitCode = 1;
}
