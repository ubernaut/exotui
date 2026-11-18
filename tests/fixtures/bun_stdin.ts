// Copyright 2026 ubernaut. MIT license.
import { runtimeHost } from "../../src/runtime/host.ts";
const first = new Uint8Array(2), second = new Uint8Array(2);
const sizes = await Promise.all([runtimeHost.stdin.read(first), runtimeHost.stdin.read(second)]);
let text = new TextDecoder().decode(first.subarray(0, sizes[0] ?? 0)) +
  new TextDecoder().decode(second.subarray(0, sizes[1] ?? 0));
for (;;) {
  const buffer = new Uint8Array(32);
  const size = await runtimeHost.stdin.read(buffer);
  if (size === null) break;
  text += new TextDecoder().decode(buffer.subarray(0, size));
}
console.log(text);
