// Copyright 2023 Im-Beast. MIT license.

// PKG-009: a clean consumer can verify artifact digest, source revision,
// builder identity, and dependency inventory.

import { assert, assertEquals } from "./deps.ts";
import { buildProvenance, buildSpdxDocument, type DependencyEntry, verifyAttestations } from "../mod.ts";

const DEPENDENCIES: DependencyEntry[] = [
  { name: "crayon", specifier: "https://deno.land/x/crayon/mod.ts" },
  { name: "@sigma/pty-ffi", specifier: "jsr:@sigma/pty-ffi@0.42.0" },
];
const ARTIFACT = new TextEncoder().encode("the release artifact bytes");
const REVISION = "db2403f6aaaa";
const BUILDER = "https://github.com/ubernaut/exotui/.github/workflows/release.yml@refs/tags/v1";

async function attested() {
  const provenance = await buildProvenance({
    artifactName: "exotui-mod.tar",
    artifactBytes: ARTIFACT,
    sourceRevision: REVISION,
    builderIdentity: BUILDER,
    dependencies: DEPENDENCIES,
  });
  const spdx = buildSpdxDocument({
    name: "exotui",
    namespace: "https://github.com/ubernaut/exotui/spdx/v1",
    dependencies: DEPENDENCIES,
  });
  return { provenance, spdx };
}

Deno.test("a clean consumer verifies all four claims from raw inputs", async () => {
  const { provenance, spdx } = await attested();
  assertEquals(spdx.spdxVersion, "SPDX-2.3");
  assertEquals(spdx.packages.map((entry) => entry.name), ["@sigma/pty-ffi", "crayon"]); // sorted
  assertEquals(provenance.predicateType, "https://slsa.dev/provenance/v1");

  const verified = await verifyAttestations({
    artifactBytes: ARTIFACT,
    provenance,
    spdx,
    expectedRevision: REVISION,
    expectedBuilder: BUILDER,
    dependencies: DEPENDENCIES,
  });
  assert(verified.ok);
});

Deno.test("every tampered claim fails with its name", async () => {
  const { provenance, spdx } = await attested();
  const base = {
    artifactBytes: ARTIFACT,
    provenance,
    spdx,
    expectedRevision: REVISION,
    expectedBuilder: BUILDER,
    dependencies: DEPENDENCIES,
  };

  const wrongBytes = await verifyAttestations({ ...base, artifactBytes: new TextEncoder().encode("substituted") });
  assert(!wrongBytes.ok && wrongBytes.claim === "artifact-digest");

  const wrongRevision = await verifyAttestations({ ...base, expectedRevision: "deadbeef" });
  assert(!wrongRevision.ok && wrongRevision.claim === "source-revision");

  const wrongBuilder = await verifyAttestations({ ...base, expectedBuilder: "https://evil.example/builder" });
  assert(!wrongBuilder.ok && wrongBuilder.claim === "builder-identity");

  const extraDependency = await verifyAttestations({
    ...base,
    dependencies: [...DEPENDENCIES, { name: "smuggled", specifier: "npm:smuggled@1" }],
  });
  assert(!extraDependency.ok && extraDependency.claim === "dependency-inventory");

  const lyingSbom = await verifyAttestations({
    ...base,
    spdx: buildSpdxDocument({ name: "exotui", namespace: "ns", dependencies: [DEPENDENCIES[0]!] }),
  });
  assert(!lyingSbom.ok && lyingSbom.claim === "dependency-inventory");
});
