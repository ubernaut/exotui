// Copyright 2023 Im-Beast. MIT license.
/** Actual pinned old/new codec, flow and handshake processes on private loopback TCP. */
const [oldRoot, pinnedSha] = Deno.args;
if (!oldRoot?.startsWith("/") || !/^[a-f0-9]{40}$/.test(pinnedSha ?? "")) {
  throw new Error("Usage: deno run -A scripts/remote_frame_compatibility.ts /absolute/old-checkout full-pinned-sha");
}
const root = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const peerPath = new URL("../tests/fixtures/remote_frame_peer.ts", import.meta.url).pathname;
const revision = await new Deno.Command("git", { args: ["-C", oldRoot, "rev-parse", "HEAD"] }).output();
if (!revision.success || new TextDecoder().decode(revision.stdout).trim() !== pinnedSha) {
  throw new Error("old checkout SHA does not match pin");
}
const status = await new Deno.Command("git", { args: ["-C", oldRoot, "status", "--porcelain"] }).output();
if (!status.success || status.stdout.length) throw new Error("old checkout is not clean");
const privateState = await Deno.makeTempDir({ prefix: "exotui-remote-compat-" });
const scenarios = [
  {
    name: "new-host-old-client-surrogate-boundaries",
    host: root,
    client: oldRoot,
    mode: "surrogates",
    hostAd: "optional",
    clientAd: "optional",
    version: 1,
  },
  {
    name: "old-host-new-client",
    host: oldRoot,
    client: root,
    mode: "ascii",
    hostAd: "optional",
    clientAd: "optional",
    version: 1,
  },
  {
    name: "new-host-old-client",
    host: root,
    client: oldRoot,
    mode: "ascii",
    hostAd: "optional",
    clientAd: "optional",
    version: 1,
  },
  {
    name: "new-host-new-client-unicode",
    host: root,
    client: root,
    mode: "unicode",
    hostAd: "optional",
    clientAd: "optional",
    version: 2,
  },
  {
    name: "new-host-new-client-legacy",
    host: root,
    client: root,
    mode: "ascii",
    hostAd: "optional",
    clientAd: "disabled",
    version: 1,
  },
  {
    name: "new-required-host-old-client",
    host: root,
    client: oldRoot,
    mode: "required",
    hostAd: "required",
    clientAd: "optional",
    version: 0,
  },
  {
    name: "old-host-new-required-client",
    host: oldRoot,
    client: root,
    mode: "required",
    hostAd: "optional",
    clientAd: "required",
    version: 0,
  },
];
for (const scenario of scenarios) {
  const spawn = (role: string, checkout: string, port: number, advertisement: string) =>
    new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "-A",
        "--config",
        root + "/deno.jsonc",
        peerPath,
        role,
        checkout,
        String(port),
        scenario.mode,
        advertisement,
      ],
      env: { XDG_STATE_HOME: privateState + "/" + scenario.name + "/" + role },
      stdout: "piped",
      stderr: "piped",
    }).spawn();
  const host = spawn("host", scenario.host, 0, scenario.hostAd);
  const hostLines = host.stdout.pipeThrough(new TextDecoderStream()).getReader();
  let hostOutput = "", client: Deno.ChildProcess | undefined, hostExit: Deno.CommandStatus | undefined;
  let clientExit: Deno.CommandOutput | undefined;
  const hostErrors = new Response(host.stderr).text();
  const deadline = setTimeout(() => {
    try {
      host.kill("SIGTERM");
    } catch { /* already terminal */ }
    try {
      client?.kill("SIGTERM");
    } catch { /* already terminal */ }
  }, 30_000);
  try {
    while (!hostOutput.includes("\n")) {
      const next = await hostLines.read();
      if (next.done) throw new Error("host exited before listener setup");
      hostOutput += next.value;
    }
    const firstEnd = hostOutput.indexOf("\n"), { port } = JSON.parse(hostOutput.slice(0, firstEnd));
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("invalid private listener");
    client = spawn("client", scenario.client, port, scenario.clientAd);
    const clientOutput = client.output();
    const drainHost = async () => {
      for (;;) {
        const next = await hostLines.read();
        if (next.done) return;
        hostOutput += next.value;
      }
    };
    const results = await Promise.all([host.status, clientOutput, drainHost()]);
    hostExit = results[0];
    clientExit = results[1];
    const errors = await hostErrors;
    if (!hostExit.success || !clientExit.success) {
      throw new Error(scenario.name + ": " + errors + new TextDecoder().decode(clientExit.stderr));
    }
    const hostResult = JSON.parse(hostOutput.trim().split("\n").at(-1)!);
    const clientResult = JSON.parse(new TextDecoder().decode(clientExit.stdout).trim().split("\n").at(-1)!);
    for (const result of [hostResult, clientResult]) {
      const rejecting = scenario.mode === "required";
      if (
        result.selected !== scenario.version || result.rejected !== rejecting ||
        result.frames !== (rejecting ? 0 : 10) || result.rounds !== (rejecting ? 1 : 2) ||
        result.resyncs !== (rejecting ? 0 : 2)
      ) throw new Error("incomplete compatibility scenario: " + JSON.stringify(result));
    }
    console.log(JSON.stringify({ scenario: scenario.name, pinnedSha, host: hostResult, client: clientResult }));
  } finally {
    clearTimeout(deadline);
    if (!hostExit) {
      try {
        host.kill("SIGTERM");
      } catch { /* already terminal */ }
      await host.status;
    }
    if (client && !clientExit) {
      try {
        client.kill("SIGTERM");
      } catch { /* already terminal */ }
      await client.status;
    }
    await hostLines.cancel().catch(() => {});
    hostLines.releaseLock();
    await hostErrors;
  }
}
console.log(JSON.stringify({ ok: true, scenarios: scenarios.length, pinnedSha, privateState }));
