// Copyright 2023 Im-Beast. MIT license.

// Renderer-neutral Orbital Command controller: the shared showcase kernel
// owns manifest/provider/persistence lifecycle; this controller owns the
// simulation clock (caller-advanced, never wall-clock), catalog selection,
// telemetry derivation, and the top-down map projection.

import { type AsyncStore, DiagnosticsCollector, Signal } from "../../../mod.ts";
import { defineShowcaseManifest, ShowcaseKernel, type ShowcaseProvider } from "../shared/mod.ts";
import {
  formatOrbitalSimTime,
  ORBITAL_SESSION_SCHEMA_VERSION,
  ORBITAL_TIME_MULTIPLIERS,
  type OrbitalCatalog,
  type OrbitalMapRender,
  type OrbitalSatellite,
  type OrbitalTelemetry,
  orbitalTelemetryFor,
  renderOrbitalMap,
} from "./model.ts";
import { createOrbitalFixtureProvider } from "./fixture_provider.ts";

/** Persisted Orbital Command app state (JSON-safe). */
export interface OrbitalCommandState {
  readonly schemaVersion: typeof ORBITAL_SESSION_SCHEMA_VERSION;
  readonly simSeconds: number;
  readonly multiplier: number;
  readonly paused: boolean;
  readonly selectedId: string;
}

/** Construction options. */
export interface OrbitalCommandControllerOptions {
  readonly store?: AsyncStore<unknown>;
  readonly diagnostics?: DiagnosticsCollector;
  readonly provider?: ShowcaseProvider & { readonly catalog: OrbitalCatalog };
  readonly persistenceDebounceMs?: number;
}

/** The versioned Orbital Command manifest. */
export const ORBITAL_COMMAND_MANIFEST = defineShowcaseManifest({
  id: "orbital-command",
  title: "Orbital Command",
  appVersion: "0.1.0",
  routes: [{ id: "observatory", title: "Observatory" }],
  initialRouteId: "observatory",
  requiredCapabilities: ["orbital-catalog"],
  hosts: { terminal: true, browser: false },
});

function defaultOrbitalState(): OrbitalCommandState {
  return {
    schemaVersion: ORBITAL_SESSION_SCHEMA_VERSION,
    simSeconds: 0,
    multiplier: 60,
    paused: false,
    selectedId: "iss",
  };
}

/** Strict app-state normalization for restored sessions. */
export function normalizeOrbitalCommandState(value: unknown): OrbitalCommandState {
  const defaults = defaultOrbitalState();
  if (!value || typeof value !== "object") return defaults;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== ORBITAL_SESSION_SCHEMA_VERSION) return defaults;
  const simSeconds = typeof record.simSeconds === "number" && Number.isFinite(record.simSeconds)
    ? Math.max(0, record.simSeconds)
    : defaults.simSeconds;
  const multiplier = ORBITAL_TIME_MULTIPLIERS.includes(record.multiplier as never)
    ? record.multiplier as number
    : defaults.multiplier;
  const paused = typeof record.paused === "boolean" ? record.paused : defaults.paused;
  const selectedId = typeof record.selectedId === "string" && record.selectedId.length <= 64
    ? record.selectedId
    : defaults.selectedId;
  return { schemaVersion: ORBITAL_SESSION_SCHEMA_VERSION, simSeconds, multiplier, paused, selectedId };
}

/** One row of the selectable catalog listing. */
export interface OrbitalCatalogRow {
  readonly id: string;
  readonly label: string;
  readonly kind: "spacecraft" | "moon" | "station";
  readonly selectable: boolean;
}

/** The Orbital Command controller. */
export class OrbitalCommandController {
  readonly kernel: ShowcaseKernel<OrbitalCommandState, ShowcaseProvider>;
  readonly catalog: OrbitalCatalog;
  /** Bumped whenever simulation time or selection changes (drives repaints). */
  readonly revision = new Signal(0);

  #simSeconds: number;
  #multiplier: number;
  #paused: boolean;
  #selectedId: string;

  constructor(options: OrbitalCommandControllerOptions = {}) {
    const provider = options.provider ?? createOrbitalFixtureProvider();
    this.catalog = provider.catalog;
    this.kernel = new ShowcaseKernel({
      manifest: ORBITAL_COMMAND_MANIFEST,
      provider,
      initialState: defaultOrbitalState(),
      normalizeState: normalizeOrbitalCommandState,
      store: options.store,
      diagnostics: options.diagnostics,
      persistenceDebounceMs: options.persistenceDebounceMs ?? 0,
    });
    const state = this.kernel.appState.peek();
    this.#simSeconds = state.simSeconds;
    this.#multiplier = state.multiplier;
    this.#paused = state.paused;
    this.#selectedId = state.selectedId;
    // A restored session may arrive after construction; adopt it once.
    this.kernel.ready.then(() => {
      const restored = this.kernel.appState.peek();
      this.#simSeconds = restored.simSeconds;
      this.#multiplier = restored.multiplier;
      this.#paused = restored.paused;
      this.#selectedId = restored.selectedId;
      this.#bump();
    }).catch(() => {});
  }

  /** The caller-owned clock: advances simulation by real elapsed ms. */
  advance(elapsedMs: number): void {
    if (this.#paused || elapsedMs <= 0) return;
    this.#simSeconds += (elapsedMs / 1000) * this.#multiplier;
    this.#bump();
  }

  /** Steps simulated time directly (scrub/step controls); clamps at zero. */
  step(simSecondsDelta: number): void {
    this.#simSeconds = Math.max(0, this.#simSeconds + simSecondsDelta);
    this.#bump();
  }

  scrubTo(simSeconds: number): void {
    this.#simSeconds = Math.max(0, simSeconds);
    this.#bump();
  }

  togglePause(): boolean {
    this.#paused = !this.#paused;
    this.#bump();
    return this.#paused;
  }

  /** Cycles the time multiplier through the offered ladder. */
  cycleMultiplier(direction: 1 | -1 = 1): number {
    const index = ORBITAL_TIME_MULTIPLIERS.indexOf(this.#multiplier as never);
    const next = (index + direction + ORBITAL_TIME_MULTIPLIERS.length) % ORBITAL_TIME_MULTIPLIERS.length;
    this.#multiplier = ORBITAL_TIME_MULTIPLIERS[next]!;
    this.#bump();
    return this.#multiplier;
  }

  simSeconds(): number {
    return this.#simSeconds;
  }

  multiplier(): number {
    return this.#multiplier;
  }

  paused(): boolean {
    return this.#paused;
  }

  simClockLabel(): string {
    return formatOrbitalSimTime(this.#simSeconds);
  }

  /** Ordered, selectable catalog rows: spacecraft, moons, then stations. */
  catalogRows(): OrbitalCatalogRow[] {
    const rows: OrbitalCatalogRow[] = [];
    for (const satellite of this.catalog.satellites) {
      if (satellite.kind !== "spacecraft") continue;
      rows.push({ id: satellite.id, label: satellite.name, kind: "spacecraft", selectable: true });
    }
    for (const satellite of this.catalog.satellites) {
      if (satellite.kind !== "moon") continue;
      rows.push({ id: satellite.id, label: satellite.name, kind: "moon", selectable: true });
    }
    for (const station of this.catalog.stations) {
      rows.push({ id: station.id, label: station.name, kind: "station", selectable: false });
    }
    return rows;
  }

  selectedId(): string {
    return this.#selectedId;
  }

  selectedSatellite(): OrbitalSatellite | undefined {
    return this.catalog.satellites.find((satellite) => satellite.id === this.#selectedId);
  }

  /** Selects a satellite by id; station rows are informational only. */
  select(id: string): boolean {
    if (!this.catalog.satellites.some((satellite) => satellite.id === id)) return false;
    this.#selectedId = id;
    this.#bump();
    return true;
  }

  /** Moves the selection through the selectable rows. */
  selectNext(direction: 1 | -1 = 1): string {
    const selectable = this.catalogRows().filter((row) => row.selectable);
    const index = selectable.findIndex((row) => row.id === this.#selectedId);
    const next = selectable[(index + direction + selectable.length) % selectable.length];
    if (next) this.select(next.id);
    return this.#selectedId;
  }

  /** Telemetry for the selected satellite at the current simulation time. */
  selectedTelemetry(): OrbitalTelemetry | undefined {
    const satellite = this.selectedSatellite();
    if (!satellite) return undefined;
    return orbitalTelemetryFor(satellite, this.#simSeconds, this.catalog);
  }

  /** The top-down map projection at the current simulation time. */
  mapRender(columns: number, rows: number, rangeKm?: number): OrbitalMapRender {
    return renderOrbitalMap({
      catalog: this.catalog,
      simSeconds: this.#simSeconds,
      selectedId: this.#selectedId,
      columns,
      rows,
      ...(rangeKm !== undefined ? { rangeKm } : {}),
    });
  }

  /** Persists the live console state through the kernel. */
  persist(): void {
    this.kernel.setState({
      schemaVersion: ORBITAL_SESSION_SCHEMA_VERSION,
      simSeconds: this.#simSeconds,
      multiplier: this.#multiplier,
      paused: this.#paused,
      selectedId: this.#selectedId,
    });
  }

  async dispose(): Promise<void> {
    this.persist();
    await this.kernel.dispose();
    this.revision.dispose();
  }

  #bump(): void {
    this.revision.value = this.revision.peek() + 1;
  }
}

/** Creates the Orbital Command controller. */
export function createOrbitalCommandController(
  options: OrbitalCommandControllerOptions = {},
): OrbitalCommandController {
  return new OrbitalCommandController(options);
}
