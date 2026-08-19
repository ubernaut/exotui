// Copyright 2023 Im-Beast. MIT license.

// The deterministic offline catalog provider (025 §3, ORBIT-006 slice).
// Live ephemeris/network providers are separate adapters with their own
// preflight capabilities; this fixture needs no permissions at all.

import type { ShowcaseProvider } from "../../../src/showcase/mod.ts";
import { type OrbitalCatalog, orbitalCommandFixtureCatalog } from "./model.ts";

/** The fixture provider: the seeded Earth-system catalog, always available. */
export interface OrbitalFixtureProvider extends ShowcaseProvider {
  readonly catalog: OrbitalCatalog;
}

/** Creates the deterministic fixture provider. */
export function createOrbitalFixtureProvider(): OrbitalFixtureProvider {
  return {
    id: "orbital-fixture",
    label: "Seeded Earth-system catalog",
    catalog: orbitalCommandFixtureCatalog(),
    capabilities: [
      { id: "orbital-catalog", status: "available" },
      { id: "live-ephemeris", status: "unavailable", reason: "Fixture provider is offline by design." },
    ],
    activate: () => ({ status: "ready" }),
    dispose: () => {},
  };
}
