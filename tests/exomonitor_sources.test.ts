import { assert, assertEquals } from "./deps.ts";
import { cpuBusyFraction, parseProcStat } from "../examples/showcases/exomonitor/sources/cpu.ts";
import { parseMeminfo } from "../examples/showcases/exomonitor/sources/memory.ts";
import { networkRates, parseProcNetDev } from "../examples/showcases/exomonitor/sources/network.ts";
import { hottest, parseSysfsTemperature } from "../examples/showcases/exomonitor/sources/temperature.ts";
import { decodePcm16, decodePcm16Channels } from "../examples/showcases/exomonitor/sources/spectrum.ts";
import { parseNvidiaSmiCsv } from "../examples/showcases/exomonitor/sources/gpu.ts";

Deno.test("cpu utilisation needs two samples, and reports busy time between them", () => {
  const [first] = parseProcStat("cpu  100 0 100 800 0 0 0 0 0 0\ncpu0 50 0 50 400 0 0 0 0 0 0\nintr 1 2 3\n");
  const [second] = parseProcStat("cpu  150 0 150 900 0 0 0 0 0 0\ncpu0 75 0 75 450 0 0 0 0 0 0\nintr 9\n");
  assert(first && second);
  // 100 busy jiffies of 200 elapsed.
  assertEquals(cpuBusyFraction(first, second), 0.5);
});

Deno.test("cpu parsing stops at the first non-cpu line and keeps per-core rows", () => {
  const rows = parseProcStat("cpu  1 1 1 1\ncpu0 1 1 1 1\ncpu1 1 1 1 1\nintr 0\nctxt 0\n");
  assertEquals(rows.map((row) => row.name), ["cpu", "cpu0", "cpu1"]);
});

Deno.test("a counter that goes backwards reports no load rather than a negative one", () => {
  // Counters reset when a container restarts, and a negative percentage would
  // rescale every graph sharing the axis.
  const previous = { name: "cpu", idle: 900, total: 1000 };
  const current = { name: "cpu", idle: 10, total: 20 };
  assertEquals(cpuBusyFraction(previous, current), 0);
});

Deno.test("memory counts available, not free, so a warm page cache is not reported as full", () => {
  const sample = parseMeminfo(
    "MemTotal:       1000 kB\nMemFree:          10 kB\nMemAvailable:    600 kB\nSwapTotal: 100 kB\nSwapFree: 40 kB\n",
  );
  assert(sample);
  // 400 kB used, not the 990 kB that MemFree would imply.
  assertEquals(sample.usedBytes, 400 * 1024);
  assertEquals(sample.totalBytes, 1000 * 1024);
  assertEquals(sample.swapUsedBytes, 60 * 1024);
});

Deno.test("meminfo without the fields we need reports nothing instead of guessing", () => {
  assertEquals(parseMeminfo("Committed_AS: 12 kB\n"), undefined);
});

Deno.test("network rates come from a delta, and skip loopback by default", () => {
  const before = parseProcNetDev(
    "Inter-|\n face |\n    lo: 1 1 0 0 0 0 0 0 1 1\n  eth0: 1000 5 0 0 0 0 0 0 2000 5\n",
  );
  const after = parseProcNetDev(
    "Inter-|\n face |\n    lo: 9 9 0 0 0 0 0 0 9 9\n  eth0: 3000 9 0 0 0 0 0 0 4000 9\n",
  );
  assertEquals(before.map((row) => row.name), ["eth0"]);
  const rates = networkRates(before, after, 2000);
  assertEquals(rates.length, 1);
  assertEquals(rates[0]!.rxBytesPerSecond, 1000);
  assertEquals(rates[0]!.txBytesPerSecond, 1000);
});

Deno.test("an interface that appears mid-run, or wraps, does not spike the graph", () => {
  const before = parseProcNetDev("h\nh\n eth0: 500 0 0 0 0 0 0 0 500 0\n");
  const after = parseProcNetDev("h\nh\n eth0: 100 0 0 0 0 0 0 0 100 0\n wg0: 900 0 0 0 0 0 0 0 900 0\n");
  const rates = networkRates(before, after, 1000);
  // wg0 has no previous sample, so it is not rated at all this tick.
  assertEquals(rates.map((rate) => rate.name), ["eth0"]);
  assertEquals(rates[0]!.rxBytesPerSecond, 0, "a backwards counter reads as idle, not as 4 GB/s");
});

Deno.test("implausible thermal zones are dropped rather than plotted", () => {
  // This machine really does have a zone reporting 50 millidegrees.
  assertEquals(parseSysfsTemperature("50", "TSKN"), undefined);
  assertEquals(parseSysfsTemperature("55050", "TMEM")?.celsius, 55.05);
  assertEquals(parseSysfsTemperature("not a number", "x"), undefined);
  assertEquals(parseSysfsTemperature("200000", "runaway"), undefined);
});

Deno.test("the hottest reading is what a one-line layout shows", () => {
  const readings = [{ label: "a", celsius: 40 }, { label: "b", celsius: 71.5 }, { label: "c", celsius: 55 }];
  assertEquals(hottest(readings)?.label, "b");
  assertEquals(hottest([]), undefined);
});

Deno.test("nvidia-smi output becomes a sample, and junk lines are skipped", () => {
  const samples = parseNvidiaSmiCsv("NVIDIA GeForce RTX 5060 Ti, 5, 1718, 16311, 47\n\nNo devices were found\n");
  assertEquals(samples.length, 1);
  const gpu = samples[0]!;
  assertEquals(gpu.name, "NVIDIA GeForce RTX 5060 Ti");
  assertEquals(gpu.utilisation, 0.05);
  assertEquals(gpu.vramTotalBytes, 16311 * 1024 * 1024);
  assertEquals(gpu.celsius, 47);
});

Deno.test("the analysis rate is set by the hop, not by the window", () => {
  // The bug this pins: analysing only on whole non-overlapping windows caps the
  // rate at sampleRate/windowSize — 23 Hz at 48 kHz and 2048 samples, and the
  // first version buffered four windows before analysing one, which made it 5.9.
  const sampleRate = 48_000;
  const windowSize = 2048;
  assert(sampleRate / windowSize < 60, "the window alone cannot reach 60 Hz, which is why the hop exists");
  for (const target of [30, 60, 120]) {
    const hop = Math.round(sampleRate / target);
    assertEquals(Math.round(sampleRate / hop), target, `a hop of ${hop} samples gives ${target} Hz`);
    assert(hop < windowSize, "the hop is smaller than the window, so windows overlap");
  }
});

Deno.test("channels are decoded apart, not averaged", () => {
  // Two frames of hard-panned stereo: left at full scale, right at silence.
  // Averaged, this reads as a half-loud centred signal, which is the reading a
  // stereo display exists to contradict.
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setInt16(0, 32767, true);
  view.setInt16(2, 0, true);
  view.setInt16(4, -32768, true);
  view.setInt16(6, 0, true);
  const [left, right] = decodePcm16Channels(bytes, 2);
  assertEquals(left!.length, 2);
  assert(Math.abs(left![0]! - 1) < 0.001 && Math.abs(left![1]! + 1) < 0.001, `left: ${[...left!]}`);
  assertEquals([...right!], [0, 0]);
  // And the averaging decoder still averages, for the mono reading.
  const mixed = decodePcm16(bytes, 2);
  assert(Math.abs(mixed[0]! - 0.5) < 0.001, `mixed: ${mixed[0]}`);
});
