// Copyright 2023 Im-Beast. MIT license.

// The deterministic starter-project provider (025 §5, GLYPH-001 slice).
// File import/export codecs are separate adapters with their own
// permissions; the fixture needs none.

import type { ShowcaseProvider } from "../shared/mod.ts";
import { glyphForgeFixtureProject, type GlyphProject } from "./model.ts";

/** The fixture provider: a seeded starter project, always available. */
export interface GlyphForgeFixtureProvider extends ShowcaseProvider {
  readonly project: GlyphProject;
}

/** Creates the deterministic fixture provider. */
export function createGlyphForgeFixtureProvider(): GlyphForgeFixtureProvider {
  return {
    id: "glyphforge-fixture",
    label: "Nova starter project",
    project: glyphForgeFixtureProject(),
    capabilities: [
      { id: "glyph-project", status: "available" },
    ],
    activate: () => ({ status: "ready" }),
    dispose: () => {},
  };
}
