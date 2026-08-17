import { assert, assertEquals, assertNotEquals } from "../deps.ts";
import { MemoryStore } from "../../mod.ts";
import {
  createOrbitalCommandController,
  normalizeOrbitalCommandState,
  ORBITAL_EARTH_MU,
  ORBITAL_TIME_MULTIPLIERS,
  orbitalCommandFixtureCatalog,
  orbitalPeriodSeconds,
  orbitalTelemetryFor,
  propagateOrbitalState,
  renderOrbitalMap,
} from "../../examples/showcases/orbital_command/mod.ts";

Deno.test("orbital propagation is deterministic and physically consistent", () => {
  const catalog = orbitalCommandFixtureCatalog();
  const iss = catalog.satellites.find((satellite) => satellite.id === "iss")!;

  const first = propagateOrbitalState(iss.elements, 5_000);
  const second = propagateOrbitalState(iss.elements, 5_000);
  assertEquals(first, second, "identical inputs give identical states");

  // Vis-viva: v^2 = mu (2/r - 1/a) at any point on the orbit.
  const r = Math.hypot(...first.positionKm);
  const v = Math.hypot(...first.velocityKmS);
  const visViva = ORBITAL_EARTH_MU * (2 / r - 1 / iss.elements.semiMajorAxisKm);
  assert(Math.abs(v * v - visViva) / visViva < 1e-6, "velocity honors vis-viva");

  // One full period returns the spacecraft to its starting state.
  const period = orbitalPeriodSeconds(iss.elements);
  const start = propagateOrbitalState(iss.elements, 0);
  const closed = propagateOrbitalState(iss.elements, period);
  for (let axis = 0; axis < 3; axis += 1) {
    assert(Math.abs(closed.positionKm[axis]! - start.positionKm[axis]!) < 1, "orbit closes after one period");
  }
});

Deno.test("fixture telemetry matches the catalog's advertised orbits", () => {
  const catalog = orbitalCommandFixtureCatalog();
  const iss = catalog.satellites.find((satellite) => satellite.id === "iss")!;
  const geo = catalog.satellites.find((satellite) => satellite.id === "relay-geo")!;
  const molniya = catalog.satellites.find((satellite) => satellite.id === "kestrel-molniya")!;

  const issTelemetry = orbitalTelemetryFor(iss, 1_234, catalog);
  assert(issTelemetry.altitudeKm > 380 && issTelemetry.altitudeKm < 460, "ISS flies in low Earth orbit");
  assert(Math.abs(issTelemetry.periodSeconds - 5_570) < 60, "ISS period is ~93 minutes");

  const geoTelemetry = orbitalTelemetryFor(geo, 0, catalog);
  assert(Math.abs(geoTelemetry.periodSeconds - 86_164) < 120, "GEO period is one sidereal day");

  const molniyaTelemetry = orbitalTelemetryFor(molniya, 0, catalog);
  assert(molniyaTelemetry.apoapsisKm > 45_000, "Molniya apoapsis reaches high altitude");
  assert(molniyaTelemetry.periapsisKm < 8_000, "Molniya periapsis dips low");
});

Deno.test("the orbit map renders deterministically with body, paths, and markers", () => {
  const catalog = orbitalCommandFixtureCatalog();
  const render = renderOrbitalMap({
    catalog,
    simSeconds: 3_600,
    selectedId: "relay-geo",
    columns: 60,
    rows: 24,
  });
  assertEquals(render.cells.length, 24);
  assertEquals(render.cells[0]!.length, 60);

  const glyphs = new Map<string, number>();
  for (const row of render.cells) {
    for (const cell of row) {
      if (cell) glyphs.set(cell.char, (glyphs.get(cell.char) ?? 0) + 1);
    }
  }
  assertEquals(glyphs.get("⊕"), 1, "one central body marker");
  assertEquals(glyphs.get("◉"), 1, "one selected marker");
  assert((glyphs.get("·") ?? 0) > 50, "orbit paths are sampled");
  assert((glyphs.get("●") ?? 0) >= 2, "unselected spacecraft render");

  const again = renderOrbitalMap({
    catalog,
    simSeconds: 3_600,
    selectedId: "relay-geo",
    columns: 60,
    rows: 24,
  });
  assertEquals(render, again, "identical time renders identical maps");

  const later = renderOrbitalMap({ catalog, simSeconds: 7_200, selectedId: "relay-geo", columns: 60, rows: 24 });
  assertNotEquals(render.cells, later.cells, "time moves the spacecraft");
});

Deno.test("the controller clock advances, pauses, steps, scrubs, and cycles multipliers", async () => {
  const controller = createOrbitalCommandController();
  try {
    await controller.kernel.ready;
    assertEquals(controller.simSeconds(), 0);
    assertEquals(controller.multiplier(), 60);

    controller.advance(1_000);
    assertEquals(controller.simSeconds(), 60, "one real second at x60 is one simulated minute");

    controller.togglePause();
    controller.advance(5_000);
    assertEquals(controller.simSeconds(), 60, "a paused clock ignores advance");
    controller.togglePause();

    controller.step(-3_600);
    assertEquals(controller.simSeconds(), 0, "stepping clamps at T+0");
    controller.scrubTo(86_400);
    assertEquals(controller.simSeconds(), 86_400);

    const first = ORBITAL_TIME_MULTIPLIERS[0]!;
    controller.scrubTo(0);
    while (controller.multiplier() !== first) controller.cycleMultiplier(1);
    controller.cycleMultiplier(-1);
    assertEquals(controller.multiplier(), ORBITAL_TIME_MULTIPLIERS.at(-1), "the multiplier ladder wraps");
  } finally {
    await controller.dispose();
  }
});

Deno.test("selection cycles spacecraft and moons but never ground stations", async () => {
  const controller = createOrbitalCommandController();
  try {
    await controller.kernel.ready;
    assertEquals(controller.selectedId(), "iss");
    const seen = new Set<string>();
    for (let index = 0; index < 10; index += 1) seen.add(controller.selectNext(1));
    assert(seen.has("relay-geo") && seen.has("moon"), "cycling reaches every satellite");
    assert(!seen.has("canaveral") && !seen.has("svalbard"), "stations are informational only");
    assertEquals(controller.select("canaveral"), false);
    assertEquals(controller.select("aurora-polar"), true);
    assertEquals(controller.selectedTelemetry()?.id, "aurora-polar");
  } finally {
    await controller.dispose();
  }
});

Deno.test("console state persists through the kernel and survives a relaunch", async () => {
  const store = new MemoryStore<unknown>();
  const first = createOrbitalCommandController({ store });
  await first.kernel.ready;
  first.scrubTo(12_345);
  first.select("kestrel-molniya");
  first.cycleMultiplier(1);
  first.togglePause();
  await first.dispose();

  const second = createOrbitalCommandController({ store });
  try {
    await second.kernel.ready;
    assertEquals(second.simSeconds(), 12_345);
    assertEquals(second.selectedId(), "kestrel-molniya");
    assertEquals(second.multiplier(), 600);
    assertEquals(second.paused(), true);
  } finally {
    await second.dispose();
  }
});

Deno.test("restored sessions normalize strictly", () => {
  const defaults = normalizeOrbitalCommandState(undefined);
  assertEquals(defaults.selectedId, "iss");
  assertEquals(normalizeOrbitalCommandState({ schemaVersion: 99, simSeconds: 10 }), defaults);
  const normalized = normalizeOrbitalCommandState({
    schemaVersion: 1,
    simSeconds: -5,
    multiplier: 999,
    paused: "yes",
    selectedId: 42,
  });
  assertEquals(normalized.simSeconds, 0);
  assertEquals(normalized.multiplier, 60);
  assertEquals(normalized.paused, false);
  assertEquals(normalized.selectedId, "iss");
});

Deno.test("the 3D observatory scene builds, tracks selection, and clamps its camera", async () => {
  const { applyCamera, createOrbitalViewportScene, ORBITAL_VIEWPORT_KM_PER_UNIT } = await import(
    "../../examples/showcases/orbital_command/viewport_scene.ts"
  );
  const catalog = orbitalCommandFixtureCatalog();
  const bundle = createOrbitalViewportScene(catalog);
  try {
    // One marker and one orbit line per satellite, plus Earth/stars/lights.
    assert(bundle.scene.children.length >= catalog.satellites.length * 2 + 3);

    bundle.update(3_600, "relay-geo");
    const iss = catalog.satellites.find((satellite) => satellite.id === "iss")!;
    const expected = propagateOrbitalState(iss.elements, 3_600);
    const marker = bundle.scene.children.find((child: { position: { x: number; y: number } }) =>
      Math.abs(child.position.x - expected.positionKm[0] / ORBITAL_VIEWPORT_KM_PER_UNIT) < 1e-6 &&
      Math.abs(child.position.y - expected.positionKm[2] / ORBITAL_VIEWPORT_KM_PER_UNIT) < 1e-6
    );
    assert(marker, "the ISS marker sits exactly on its propagated position");

    bundle.cameraState.elevationRad = 9;
    bundle.cameraState.distanceUnits = 0.01;
    applyCamera(bundle.camera, bundle.cameraState);
    assert(bundle.cameraState.elevationRad <= 1.35, "elevation clamps");
    assert(bundle.cameraState.distanceUnits >= 1.2, "zoom clamps");
  } finally {
    bundle.dispose();
  }
});

Deno.test("terminal-cell picking agrees with the projected scene (ORBIT-004)", async () => {
  const { createOrbitalViewportScene, ORBITAL_VIEWPORT_KM_PER_UNIT } = await import(
    "../../examples/showcases/orbital_command/viewport_scene.ts"
  );
  const { Vector3 } = await import("three");
  const catalog = orbitalCommandFixtureCatalog();
  const bundle = createOrbitalViewportScene(catalog);
  try {
    bundle.update(3_600, "iss");
    const columns = 96;
    const rows = 28;
    // Project a marker through the same cell-shape-aware aspect the ASCII
    // renderer maintains; the cell under that projection must pick it.
    bundle.camera.aspect = (columns * 0.5) / rows;
    bundle.camera.updateProjectionMatrix();
    const geo = catalog.satellites.find((satellite) => satellite.id === "relay-geo")!;
    const state = propagateOrbitalState(geo.elements, 3_600, catalog.centralBody.mu);
    const projected = new Vector3(
      state.positionKm[0] / ORBITAL_VIEWPORT_KM_PER_UNIT,
      state.positionKm[2] / ORBITAL_VIEWPORT_KM_PER_UNIT,
      state.positionKm[1] / ORBITAL_VIEWPORT_KM_PER_UNIT,
    ).project(bundle.camera);
    assert(Math.abs(projected.x) < 0.95 && Math.abs(projected.y) < 0.95, "the GEO relay is on-screen");
    const cell = {
      x: Math.floor(((projected.x + 1) / 2) * columns),
      y: Math.floor(((1 - projected.y) / 2) * rows),
    };
    assertEquals(bundle.pick(cell, { columns, rows }), "relay-geo", "the cell under the marker picks it");
    assertEquals(
      bundle.pick(cell, { columns, rows }),
      bundle.pick(cell, { columns, rows }),
      "picking is deterministic",
    );

    // The mapping tracks the camera: after an orbit swing the marker picks
    // from its new cell, and its old cell no longer names it uniquely.
    bundle.cameraState.azimuthRad += 1.2;
    bundle.update(3_600, "iss");
    bundle.camera.aspect = (columns * 0.5) / rows;
    bundle.camera.updateProjectionMatrix();
    const moved = new Vector3(
      state.positionKm[0] / ORBITAL_VIEWPORT_KM_PER_UNIT,
      state.positionKm[2] / ORBITAL_VIEWPORT_KM_PER_UNIT,
      state.positionKm[1] / ORBITAL_VIEWPORT_KM_PER_UNIT,
    ).project(bundle.camera);
    const movedCell = {
      x: Math.floor(((moved.x + 1) / 2) * columns),
      y: Math.floor(((1 - moved.y) / 2) * rows),
    };
    assertEquals(bundle.pick(movedCell, { columns, rows }), "relay-geo");

    // A click far from every marker picks nothing.
    assertEquals(bundle.pick({ x: 0, y: 0 }, { columns, rows }), undefined, "empty space misses");
  } finally {
    bundle.dispose();
  }
});
