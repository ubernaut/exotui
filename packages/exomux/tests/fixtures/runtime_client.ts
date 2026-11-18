// Copyright 2026 ubernaut. MIT license.
// Run by check_runtime_compat.ts under each runtime, outside the test runner.
import { runtimeHost } from "@ubernaut/exotui/runtime";
import { connectExomuxWebSocket, readExomuxHostDescriptor } from "../../client.ts";
import { verifyNativeJobControl } from "./native_job_control.ts";

const descriptor = await readExomuxHostDescriptor(runtimeHost.args[0]!);
if (!descriptor) throw new Error("Private test daemon descriptor is missing");
const connect = () =>
  connectExomuxWebSocket({
    url: descriptor.url,
    authToken: descriptor.token,
    flowControlledReplay: descriptor.flowControlledReplay,
    requestTimeoutMs: 5_000,
  });
let client = await connect();
try {
  const spawned = await client.spawn({
    command: "/bin/sh",
    args: [
      "-c",
      'test -t 0 || exit 42; stty -echo; printf "CROSS_READY\\n"; while IFS= read -r line; do printf "CROSS_INPUT:%s\\n" "$line"; stty size; done',
    ],
    columns: 83,
    rows: 29,
  });
  let output = "";
  const initial = await client.attach(spawned.id, {
    sinceSequence: 0,
    onOutput: (frame) => {
      output += decode(frame.data);
    },
  });
  output += initial.replay.map((frame) => decode(frame.data)).join("");
  await waitFor(() => output.includes("CROSS_READY"));
  await client.resize(spawned.id, 107, 37);
  await client.input(spawned.id, "cross-runtime\n");
  await waitFor(() => output.includes("CROSS_INPUT:cross-runtime") && output.includes("37 107"));
  await client.detach(spawned.id);
  await client.dispose();
  client = await connect();
  const replay = await client.attach(spawned.id, { sinceSequence: 0, onOutput() {} });
  const retained = replay.replay.map((frame) => decode(frame.data)).join("");
  if (!retained.includes("CROSS_READY") || !retained.includes("CROSS_INPUT:cross-runtime")) {
    throw new Error("Cross-runtime reattach lost scrollback");
  }
  await client.kill(spawned.id);
  if ((await client.list()).length !== 0) throw new Error("Cross-runtime kill retained a terminated session");
  const jobControl = await verifyNativeJobControl(client);
  console.log(
    JSON.stringify({
      client: runtimeHost.runtime,
      input: true,
      resize: [107, 37],
      replay: true,
      cleanup: true,
      jobControl,
    }),
  );
} finally {
  await client.dispose();
}
function decode(data: string | Uint8Array): string {
  return typeof data === "string" ? data : new TextDecoder().decode(data);
}
async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out receiving real cross-runtime PTY output");
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
}
