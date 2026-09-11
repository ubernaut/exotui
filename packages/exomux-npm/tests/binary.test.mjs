import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assetFor, assets, ensureBinary, packageRoot, readRelease, releaseBase } from "../lib/binary.mjs";
import { preparePackage } from "../../../scripts/prepare_exomux_npm.mjs";

const body = Buffer.from("verified executable fixture");
const entry = {
  sha256: createHash("sha256").update(body).digest("hex"),
  size: body.length,
};

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "exomux npm test "));
  t.after(() => rm(root, { recursive: true, force: true }));
  const release = {
    version: "0.3.1",
    tag: "v0.7.2",
    assets: Object.fromEntries(
      Object.values(assets).map((asset) => [asset, { ...entry }]),
    ),
  };
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ version: release.version }),
  );
  await writeFile(join(root, "release.json"), JSON.stringify(release));
  return {
    root,
    release,
    cache: join(root, "cache"),
    platform: "linux",
    arch: "x64",
  };
}

test("selects release assets by OS and CPU and rejects unsupported combinations", () => {
  assert.equal(assetFor("linux", "x64"), "exomux-linux-x86_64");
  assert.equal(assetFor("darwin", "arm64"), "exomux-macos-aarch64");
  assert.equal(assetFor("darwin", "x64"), "exomux-macos-x86_64");
  assert.equal(assetFor("win32", "x64"), "exomux-windows-x86_64.exe");
  for (
    const [os, arch] of [["linux", "arm64"], ["win32", "arm64"], [
      "freebsd",
      "x64",
    ]]
  ) {
    assert.throws(() => assetFor(os, arch), /No exomux binary.*Deno\/source/);
  }
});

test("downloads the pinned release, verifies it, and reuses the cache offline", async (t) => {
  const options = await fixture(t);
  let calls = 0;
  const fetchImpl = (url, init) => {
    calls++;
    assert.equal(url, `${releaseBase}/v0.7.2/exomux-linux-x86_64`);
    assert.ok(init.signal instanceof AbortSignal);
    return new Response(body);
  };
  const path = await ensureBinary({ ...options, fetchImpl });
  assert.deepEqual(await readFile(path), body);
  if (process.platform !== "win32") {
    assert.equal((await stat(path)).mode & 0o777, 0o755);
  }
  assert.equal(await ensureBinary({ ...options, fetchImpl }), path);
  assert.equal(calls, 1);
});

test("detects same-size cache corruption and downloads a verified replacement", async (t) => {
  const options = await fixture(t);
  let calls = 0;
  const fetchImpl = () => {
    calls++;
    return new Response(body);
  };
  const path = await ensureBinary({ ...options, fetchImpl });
  await writeFile(path, Buffer.alloc(body.length, 0));
  await ensureBinary({ ...options, fetchImpl });
  assert.equal(calls, 2);
  assert.deepEqual(await readFile(path), body);
});

for (
  const [name, response, message] of [
    ["HTTP error", () => new Response("missing", { status: 404 }), /HTTP 404/],
    [
      "wrong checksum",
      () => new Response(Buffer.alloc(body.length)),
      /Checksum\/size mismatch/,
    ],
    [
      "truncated download",
      () => new Response(body.subarray(0, 3)),
      /Checksum\/size mismatch/,
    ],
    [
      "oversized download",
      () => new Response(Buffer.concat([body, body])),
      /exceeds expected size/,
    ],
    ["connection failure", () => {
      throw new Error("connection interrupted");
    }, /connection interrupted/],
    ["interrupted body", () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(body.subarray(0, 3));
            controller.error(new Error("stream interrupted"));
          },
        }),
      ), /stream interrupted/],
  ]
) {
  test(`${name} never leaves an executable or partial download in the cache`, async (t) => {
    const options = await fixture(t);
    await assert.rejects(
      ensureBinary({ ...options, fetchImpl: response }),
      message,
    );
    assert.deepEqual(await readdir(join(options.cache, entry.sha256)), []);
    const path = await ensureBinary({
      ...options,
      fetchImpl: () => new Response(body),
    });
    assert.deepEqual(await readFile(path), body);
  });
}

test("simultaneous first launches converge on the same verified binary", async (t) => {
  const options = await fixture(t);
  const paths = await Promise.all(
    Array.from({ length: 3 }, () =>
      ensureBinary({
        ...options,
        fetchImpl: () => new Response(body),
      })),
  );
  assert.equal(new Set(paths).size, 1);
  assert.deepEqual(await readdir(join(options.cache, entry.sha256)), [
    "exomux-linux-x86_64",
  ]);
  assert.deepEqual(await readFile(paths[0]), body);
});

test("missing and mismatched release metadata fails before any download", async (t) => {
  const options = await fixture(t);
  await writeFile(
    join(options.root, "package.json"),
    JSON.stringify({ version: "9.9.9" }),
  );
  await assert.rejects(
    ensureBinary(options),
    /Invalid exomux release metadata/,
  );
  await rm(join(options.root, "release.json"));
  await assert.rejects(
    readRelease(options.root),
    /release metadata is missing/,
  );
});

test("release staging requires every platform and derives the npm version from exomux", async (t) => {
  const options = await fixture(t);
  const repository = join(options.root, "repository");
  await cp(packageRoot, join(repository, "packages/exomux-npm"), {
    recursive: true,
  });
  await mkdir(join(repository, "packages/exomux"));
  await writeFile(
    join(repository, "packages/exomux/deno.json"),
    JSON.stringify({ version: "0.3.1" }),
  );
  await writeFile(join(repository, "LICENSE.md"), "MIT fixture");
  const binaries = join(options.root, "binaries");
  await mkdir(binaries);
  const output = join(options.root, "staged");
  await assert.rejects(
    preparePackage({ repository, binaries, output, tag: "v0.7.2" }),
    /ENOENT/,
  );
  for (const asset of Object.values(assets)) {
    await writeFile(join(binaries, asset), body);
  }
  await preparePackage({ repository, binaries, output, tag: "v0.7.2" });
  const pkg = JSON.parse(await readFile(join(output, "package.json"), "utf8"));
  assert.equal(pkg.version, "0.3.1");
  assert.equal(pkg.private, undefined);
  assert.equal((await readRelease(output)).tag, "v0.7.2");
  assert.equal(pkg.bin.exomux, "bin/exomux.mjs");
  assert.equal(
    await readFile(join(output, "LICENSE.md"), "utf8"),
    "MIT fixture",
  );
  await assert.rejects(
    preparePackage({ repository, binaries, output, tag: "v0.7.2" }),
    /EEXIST/,
  );
});
