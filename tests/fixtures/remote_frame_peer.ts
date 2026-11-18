// Copyright 2023 Im-Beast. MIT license.
// A private TCP peer importing actual codec/flow/handshake modules from the chosen checkout.
// No daemon, PTY, tmux, or shared application state is used.
import type { CellFrame, DecodeResult, EncodedFrame } from "../../src/remote/frame_codec.ts";
import type { SequencedFrame } from "../../src/remote/frame_flow.ts";

const [role, checkout, portText, mode = "ascii", advertisement = "optional"] = Deno.args;
if ((role !== "host" && role !== "client") || !checkout?.startsWith("/")) throw new Error("invalid peer arguments");
const rootUrl = new URL("file://" + checkout.replace(/\/$/, "") + "/");
const codec: typeof import("../../src/remote/frame_codec.ts") = await import(
  new URL("src/remote/frame_codec.ts", rootUrl).href
);
const flowModule: typeof import("../../src/remote/frame_flow.ts") = await import(
  new URL("src/remote/frame_flow.ts", rootUrl).href
);
const handshakeModule: typeof import("../../src/remote/handshake.ts") = await import(
  new URL("src/remote/handshake.ts", rootUrl).href
);
const current = typeof codec.negotiatedFrameCodecVersion === "function";
const capability = "cell-frame.boundaries-v2";
const manifest = {
  protocol: { major: 1, minor: 0 },
  mandatory: advertisement === "required" ? ["cell-frame", capability] : ["cell-frame"],
  optional: current && advertisement === "optional" ? [capability] : [],
};

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class Wire {
  #pending = "";
  readonly #decoder = new TextDecoder();
  constructor(readonly connection: Deno.Conn) {}
  async send(value: unknown): Promise<void> {
    const bytes = new TextEncoder().encode(JSON.stringify(value) + "\n");
    for (let offset = 0; offset < bytes.length;) offset += await this.connection.write(bytes.subarray(offset));
  }
  async next(): Promise<unknown> {
    for (;;) {
      const newline = this.#pending.indexOf("\n");
      if (newline !== -1) {
        const line = this.#pending.slice(0, newline);
        this.#pending = this.#pending.slice(newline + 1);
        return JSON.parse(line);
      }
      const bytes = new Uint8Array(8192);
      const count = await this.connection.read(bytes);
      if (count === null) throw new Error("peer closed before the expected message");
      this.#pending += this.#decoder.decode(bytes.subarray(0, count), { stream: true });
      check(this.#pending.length <= 1_048_576, "private test wire exceeded message limit");
    }
  }
}

function expectedFrame(stage: number, version: number): CellFrame {
  const columns = stage >= 4 ? 15 : 12, rows = 2;
  const cells = Array.from({ length: columns * rows }, (_, index) => ({
    char: String.fromCharCode(65 + index % 26),
    style: index % 3 ? "plain" : "\x1b[4:3;58;2;0;255;0m",
  }));
  if (version === 2) {
    const glyphs = ["ẹ́́", "क्ष", "각", "", "1️⃣", "", "👩‍💻", "", "AB", "", "\ud800", "\0"];
    glyphs.forEach((char, index) => {
      cells[index]!.char = char;
    });
  }
  if (mode === "surrogates") {
    const glyphs = [stage % 2 ? "\ud801" : "\ud800", "\udc00", "\ud802", "\udc02"];
    glyphs.forEach((char, index) => {
      cells[index] = { char, style: "same" };
    });
    cells[columns - 1] = { char: "\ud803", style: "edge" };
    cells[columns] = { char: "\udc03", style: "edge" };
  }
  if (stage) cells[cells.length - 2]!.char = String(stage);
  return { columns, rows, cells };
}

let frames = 0, rounds = 0, selected = 0, rejected = false, resyncs = 0, legacyRejected = false;

async function hostRound(connection: Deno.Conn): Promise<void> {
  const wire = new Wire(connection);
  const handshake = new handshakeModule.RemoteCapabilityHandshake({ role: "acceptor", manifest });
  const ready = handshake.receive(await wire.next());
  check(ready.response, "host did not produce a handshake response");
  await wire.send(ready.response);
  if (ready.state === "rejected") {
    rejected = true;
    return;
  }
  check(ready.state === "ready" && ready.negotiated, "host handshake not ready");
  const version = current ? codec.negotiatedFrameCodecVersion(ready.negotiated) : 1;
  selected = version;
  check(mode !== "unicode" || version === 2, "Unicode scenario failed to negotiate v2");
  const flow = flowModule.createFrameFlowController({ windowSize: 1, codecVersion: version });
  async function deliver(outbound: SequencedFrame, stage: number): Promise<SequencedFrame | undefined> {
    check(outbound.payload.version === version, "frame sent with unnegotiated codec");
    await wire.send({ type: "frame", stage, outbound });
    frames++;
    const reply = await wire.next() as { type: string; sequence: number };
    check(reply.type === "ack" && reply.sequence === outbound.sequence, "client did not acknowledge exact frame");
    return flow.ack(reply.sequence);
  }
  await deliver(flow.offer(expectedFrame(0, version))!, 0);
  const next = flow.offer(expectedFrame(1, version))!;
  check(next.payload.kind === "delta", "incremental host update was not a delta");
  check(!flow.offer(expectedFrame(2, version)) && !flow.offer(expectedFrame(3, version)), "window did not coalesce");
  if (current && version === 1) {
    try {
      flow.offer({ columns: 1, rows: 1, cells: [{ char: "", style: "plain" }] });
    } catch (error) {
      legacyRejected = error instanceof codec.FrameCodecError && error.code === "legacy-cell";
    }
    check(legacyRejected, "new host queued an unrepresentable legacy cell");
  }
  const coalesced = await deliver(next, 1);
  check(coalesced, "ack failed to release pending latest");
  await deliver(coalesced, 3);
  const resized = flow.offer(expectedFrame(4, version))!;
  check(resized.payload.kind === "full", "resize did not produce full frame");
  await deliver(resized, 4);
  const damaged = flow.offer(expectedFrame(5, version))!;
  check(damaged.payload.kind === "delta", "corruption probe needs a delta");
  await wire.send({
    type: "corrupt",
    outbound: { ...damaged, payload: { ...damaged.payload, checksum: (damaged.payload.checksum ^ 1) >>> 0 } },
  });
  const resync = await wire.next() as { type: string };
  check(resync.type === "resync", "client accepted corrupt delta");
  flow.resync();
  resyncs++;
  const fresh = flow.offer(expectedFrame(5, version))!;
  check(fresh.payload.kind === "full", "resync did not produce full frame");
  await deliver(fresh, 5);
  if (!current) {
    // Independently exercise the old decoder against an actual v2 payload sent by the new client.
    const probe = await wire.next() as { type: string; payload: EncodedFrame };
    check(probe.type === "v2-probe", "missing explicit old-codec rejection probe");
    check(!codec.decodeCellFrame(probe.payload).ok, "old codec accepted v2");
    await wire.send({ type: "v2-rejected" });
  }
  await wire.send({ type: "done" });
}

async function clientRound(connection: Deno.Conn): Promise<void> {
  const wire = new Wire(connection);
  const handshake = new handshakeModule.RemoteCapabilityHandshake({ role: "initiator", manifest });
  await wire.send(handshake.start());
  const ready = handshake.receive(await wire.next());
  if (ready.state === "rejected") {
    rejected = true;
    return;
  }
  check(ready.state === "ready" && ready.negotiated, "client handshake not ready");
  const version = current ? codec.negotiatedFrameCodecVersion(ready.negotiated) : 1;
  selected = version;
  let frame: CellFrame | undefined;
  for (const stage of [0, 1, 3, 4, 5]) {
    if (stage === 5) {
      const corrupt = await wire.next() as { type: string; outbound: SequencedFrame };
      check(corrupt.type === "corrupt" && frame, "missing corrupt-delta probe");
      const result = codec.applyCellFrameDelta(frame, corrupt.outbound.payload as never);
      check(!result.ok, "client decoded corrupt data");
      await wire.send({ type: "resync" });
      resyncs++;
    }
    const message = await wire.next() as { type: string; stage: number; outbound: SequencedFrame };
    check(message.type === "frame" && message.stage === stage, "unexpected host stage");
    const { payload } = message.outbound;
    check(payload.version === version, "client received unnegotiated codec");
    const result: DecodeResult = payload.kind === "full"
      ? codec.decodeCellFrame(payload)
      : codec.applyCellFrameDelta(frame!, payload);
    check(result.ok, "client requested resync for a valid frame: " + JSON.stringify(result));
    // The expected source cells are independent of encoder/decoder reconstruction.
    check(
      JSON.stringify(result.frame) === JSON.stringify(expectedFrame(stage, version)),
      "source cells differ after wire transport",
    );
    frame = result.frame;
    frames++;
    await wire.send({ type: "ack", sequence: message.outbound.sequence });
  }
  // The old host's last message is delayed until this probe. New hosts have no probe.
  if (current && advertisement !== "disabled" && version === 1) {
    await wire.send({ type: "v2-probe", payload: codec.encodeCellFrame(expectedFrame(0, 2)) });
    const response = await wire.next() as { type: string };
    check(response.type === "v2-rejected", "old host failed explicit version rejection");
  }
  check((await wire.next() as { type: string }).type === "done", "missing peer completion");
}

if (role === "host") {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  console.log(JSON.stringify({ port: (listener.addr as Deno.NetAddr).port }));
  try {
    const roundCount = mode === "required" ? 1 : 2;
    for (let round = 0; round < roundCount; round++) {
      const connection = await listener.accept();
      try {
        await hostRound(connection);
        rounds++;
      } finally {
        connection.close();
      }
    }
  } finally {
    listener.close();
  }
} else {
  const roundCount = mode === "required" ? 1 : 2;
  for (let round = 0; round < roundCount; round++) {
    const connection = await Deno.connect({ hostname: "127.0.0.1", port: Number(portText) });
    try {
      await clientRound(connection);
      rounds++;
    } finally {
      connection.close();
    }
  }
}
check(mode !== "required" || rejected && frames === 0, "required capability did not reject before traffic");
console.log(JSON.stringify({ role, current, rounds, frames, selected, rejected, resyncs, legacyRejected }));
