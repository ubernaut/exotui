// Copyright 2023 Im-Beast. MIT license.

// Orbital Command domain model (025 §3, vertical slice): a deterministic
// Earth-system catalog, closed-form two-body Kepler propagation on a
// caller-owned simulation clock, derived telemetry, and a renderer-neutral
// top-down orbit plot. The Three ASCII viewport (ORBIT-001/002) composes on
// top of these same positions in a later slice; nothing here needs a GPU,
// the network, or wall-clock time.

/** Version stamped into persisted Orbital Command sessions. */
export const ORBITAL_SESSION_SCHEMA_VERSION = 1 as const;

/** Earth gravitational parameter, km^3/s^2. */
export const ORBITAL_EARTH_MU = 398_600.4418;

/** Earth mean radius, km. */
export const ORBITAL_EARTH_RADIUS_KM = 6_371;

/** Classical Keplerian elements referenced to simulation epoch seconds. */
export interface OrbitalElements {
  readonly semiMajorAxisKm: number;
  readonly eccentricity: number;
  readonly inclinationDeg: number;
  readonly raanDeg: number;
  readonly argPeriapsisDeg: number;
  readonly meanAnomalyAtEpochDeg: number;
  readonly epochSeconds: number;
}

/** One orbiting object in the catalog (spacecraft or natural body). */
export interface OrbitalSatellite {
  readonly id: string;
  readonly name: string;
  readonly kind: "spacecraft" | "moon";
  readonly elements: OrbitalElements;
  readonly description: string;
}

/** One fixed ground station. */
export interface OrbitalGroundStation {
  readonly id: string;
  readonly name: string;
  readonly latitudeDeg: number;
  readonly longitudeDeg: number;
  readonly description: string;
}

/** The full deterministic catalog around one central body. */
export interface OrbitalCatalog {
  readonly centralBody: {
    readonly id: string;
    readonly name: string;
    readonly radiusKm: number;
    readonly mu: number;
  };
  readonly satellites: readonly OrbitalSatellite[];
  readonly stations: readonly OrbitalGroundStation[];
}

/** Cartesian state in the central body's inertial frame, km and km/s. */
export interface OrbitalStateVector {
  readonly positionKm: readonly [number, number, number];
  readonly velocityKmS: readonly [number, number, number];
}

/** Derived display telemetry for one satellite at one simulation time. */
export interface OrbitalTelemetry {
  readonly id: string;
  readonly altitudeKm: number;
  readonly radiusKm: number;
  readonly speedKmS: number;
  readonly periodSeconds: number;
  readonly apoapsisKm: number;
  readonly periapsisKm: number;
  readonly meanAnomalyDeg: number;
  readonly trueAnomalyDeg: number;
}

/** Time multipliers offered by the console, in simulated seconds per real second. */
export const ORBITAL_TIME_MULTIPLIERS = [1, 10, 60, 600, 3600, 21_600] as const;

/** The seeded offline catalog: Earth, the Moon, four spacecraft, two stations. */
export function orbitalCommandFixtureCatalog(): OrbitalCatalog {
  return {
    centralBody: { id: "earth", name: "Earth", radiusKm: ORBITAL_EARTH_RADIUS_KM, mu: ORBITAL_EARTH_MU },
    satellites: [
      {
        id: "iss",
        name: "ISS (Zarya)",
        kind: "spacecraft",
        description: "Crewed research station in low Earth orbit.",
        elements: {
          semiMajorAxisKm: 6_791,
          eccentricity: 0.0004,
          inclinationDeg: 51.64,
          raanDeg: 12,
          argPeriapsisDeg: 87,
          meanAnomalyAtEpochDeg: 0,
          epochSeconds: 0,
        },
      },
      {
        id: "aurora-polar",
        name: "Aurora Polar",
        kind: "spacecraft",
        description: "Sun-synchronous imaging satellite on a dawn-dusk track.",
        elements: {
          semiMajorAxisKm: 7_078,
          eccentricity: 0.0011,
          inclinationDeg: 98.2,
          raanDeg: 102,
          argPeriapsisDeg: 64,
          meanAnomalyAtEpochDeg: 145,
          epochSeconds: 0,
        },
      },
      {
        id: "relay-geo",
        name: "Relay 7 GEO",
        kind: "spacecraft",
        description: "Geostationary communications relay over 14°W.",
        elements: {
          semiMajorAxisKm: 42_164,
          eccentricity: 0.0002,
          inclinationDeg: 0.06,
          raanDeg: 0,
          argPeriapsisDeg: 0,
          meanAnomalyAtEpochDeg: 210,
          epochSeconds: 0,
        },
      },
      {
        id: "kestrel-molniya",
        name: "Kestrel Molniya",
        kind: "spacecraft",
        description: "High-latitude relay on a 12-hour Molniya orbit.",
        elements: {
          semiMajorAxisKm: 26_562,
          eccentricity: 0.74,
          inclinationDeg: 63.4,
          raanDeg: 245,
          argPeriapsisDeg: 270,
          meanAnomalyAtEpochDeg: 30,
          epochSeconds: 0,
        },
      },
      {
        id: "moon",
        name: "Moon",
        kind: "moon",
        description: "The Moon, propagated as a two-body companion.",
        elements: {
          semiMajorAxisKm: 384_400,
          eccentricity: 0.0549,
          inclinationDeg: 5.145,
          raanDeg: 125,
          argPeriapsisDeg: 318,
          meanAnomalyAtEpochDeg: 115,
          epochSeconds: 0,
        },
      },
    ],
    stations: [
      {
        id: "canaveral",
        name: "Cape Canaveral",
        latitudeDeg: 28.5,
        longitudeDeg: -80.6,
        description: "Primary launch and tracking complex.",
      },
      {
        id: "svalbard",
        name: "Svalbard Ground",
        latitudeDeg: 78.2,
        longitudeDeg: 15.4,
        description: "High-latitude polar downlink site.",
      },
    ],
  };
}

/** Orbital period from the semi-major axis, seconds. */
export function orbitalPeriodSeconds(elements: OrbitalElements, mu = ORBITAL_EARTH_MU): number {
  const a = elements.semiMajorAxisKm;
  return 2 * Math.PI * Math.sqrt((a * a * a) / mu);
}

/**
 * Solves Kepler's equation M = E − e·sinE with a fixed Newton iteration
 * count, so identical inputs give bit-identical results everywhere.
 */
export function solveEccentricAnomaly(meanAnomalyRad: number, eccentricity: number): number {
  const M = normalizeAngle(meanAnomalyRad);
  let E = eccentricity < 0.8 ? M : Math.PI;
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const f = E - eccentricity * Math.sin(E) - M;
    const fPrime = 1 - eccentricity * Math.cos(E);
    E -= f / fPrime;
  }
  return E;
}

/** Propagates classical elements to a Cartesian state at `simSeconds`. */
export function propagateOrbitalState(
  elements: OrbitalElements,
  simSeconds: number,
  mu = ORBITAL_EARTH_MU,
): OrbitalStateVector {
  const a = elements.semiMajorAxisKm;
  const e = elements.eccentricity;
  const n = Math.sqrt(mu / (a * a * a));
  const M = degToRad(elements.meanAnomalyAtEpochDeg) + n * (simSeconds - elements.epochSeconds);
  const E = solveEccentricAnomaly(M, e);
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const r = a * (1 - e * cosE);
  // Perifocal position and velocity.
  const xP = a * (cosE - e);
  const yP = a * Math.sqrt(1 - e * e) * sinE;
  const factor = Math.sqrt(mu * a) / r;
  const vxP = -factor * sinE;
  const vyP = factor * Math.sqrt(1 - e * e) * cosE;

  const cosO = Math.cos(degToRad(elements.raanDeg));
  const sinO = Math.sin(degToRad(elements.raanDeg));
  const cosI = Math.cos(degToRad(elements.inclinationDeg));
  const sinI = Math.sin(degToRad(elements.inclinationDeg));
  const cosW = Math.cos(degToRad(elements.argPeriapsisDeg));
  const sinW = Math.sin(degToRad(elements.argPeriapsisDeg));

  // Perifocal → inertial rotation Rz(Ω)·Rx(i)·Rz(ω).
  const r11 = cosO * cosW - sinO * sinW * cosI;
  const r12 = -cosO * sinW - sinO * cosW * cosI;
  const r21 = sinO * cosW + cosO * sinW * cosI;
  const r22 = -sinO * sinW + cosO * cosW * cosI;
  const r31 = sinW * sinI;
  const r32 = cosW * sinI;

  return {
    positionKm: [
      r11 * xP + r12 * yP,
      r21 * xP + r22 * yP,
      r31 * xP + r32 * yP,
    ],
    velocityKmS: [
      r11 * vxP + r12 * vyP,
      r21 * vxP + r22 * vyP,
      r31 * vxP + r32 * vyP,
    ],
  };
}

/** Derived telemetry for one satellite at one simulation time. */
export function orbitalTelemetryFor(
  satellite: OrbitalSatellite,
  simSeconds: number,
  catalog: OrbitalCatalog,
): OrbitalTelemetry {
  const { elements } = satellite;
  const mu = catalog.centralBody.mu;
  const state = propagateOrbitalState(elements, simSeconds, mu);
  const radius = Math.hypot(...state.positionKm);
  const speed = Math.hypot(...state.velocityKmS);
  const n = Math.sqrt(mu / (elements.semiMajorAxisKm ** 3));
  const meanAnomaly = normalizeAngle(
    degToRad(elements.meanAnomalyAtEpochDeg) + n * (simSeconds - elements.epochSeconds),
  );
  const E = solveEccentricAnomaly(meanAnomaly, elements.eccentricity);
  const trueAnomaly = normalizeAngle(
    2 * Math.atan2(
      Math.sqrt(1 + elements.eccentricity) * Math.sin(E / 2),
      Math.sqrt(1 - elements.eccentricity) * Math.cos(E / 2),
    ),
  );
  return {
    id: satellite.id,
    altitudeKm: radius - catalog.centralBody.radiusKm,
    radiusKm: radius,
    speedKmS: speed,
    periodSeconds: orbitalPeriodSeconds(elements, mu),
    apoapsisKm: elements.semiMajorAxisKm * (1 + elements.eccentricity),
    periapsisKm: elements.semiMajorAxisKm * (1 - elements.eccentricity),
    meanAnomalyDeg: radToDeg(meanAnomaly),
    trueAnomalyDeg: radToDeg(trueAnomaly),
  };
}

/** One plotted cell of the top-down orbit map. */
export interface OrbitalMapCell {
  readonly char: string;
  readonly role: "body" | "orbit" | "satellite" | "selected" | "moon" | "grid";
}

/** Renderer-neutral top-down (equatorial plane) orbit plot. */
export interface OrbitalMapRender {
  readonly cells: ReadonlyArray<ReadonlyArray<OrbitalMapCell | null>>;
  readonly rangeKm: number;
}

/**
 * Projects the catalog onto a top-down cell grid: the central body at the
 * center, orbit paths sampled as dots, satellites as markers. Terminal
 * cells are ~half as tall as wide, so rows compress by two.
 */
export function renderOrbitalMap(options: {
  readonly catalog: OrbitalCatalog;
  readonly simSeconds: number;
  readonly selectedId?: string;
  readonly columns: number;
  readonly rows: number;
  /** Half-width of the view in km; defaults to fitting the largest non-moon orbit. */
  readonly rangeKm?: number;
}): OrbitalMapRender {
  const { catalog, simSeconds, selectedId } = options;
  const columns = Math.max(11, options.columns);
  const rows = Math.max(7, options.rows);
  // The view fits the spacecraft by default; selecting a moon zooms out
  // so the selection is always on screen.
  const fitTargets = catalog.satellites.filter((satellite) =>
    satellite.kind === "spacecraft" || satellite.id === selectedId
  );
  const largestApoapsis = Math.max(
    catalog.centralBody.radiusKm * 2,
    ...fitTargets.map((satellite) => satellite.elements.semiMajorAxisKm * (1 + satellite.elements.eccentricity)),
  );
  const rangeKm = options.rangeKm ?? largestApoapsis * 1.12;
  const cells: (OrbitalMapCell | null)[][] = Array.from(
    { length: rows },
    () => new Array<OrbitalMapCell | null>(columns).fill(null),
  );
  const centerColumn = (columns - 1) / 2;
  const centerRow = (rows - 1) / 2;
  const kmPerColumn = (2 * rangeKm) / columns;
  // A terminal cell is roughly twice as tall as wide; two rows of km per row
  // of cells keeps circles round.
  const kmPerRow = kmPerColumn * 2;

  const place = (xKm: number, yKm: number, cell: OrbitalMapCell, overwrite: boolean): void => {
    const column = Math.round(centerColumn + xKm / kmPerColumn);
    const row = Math.round(centerRow - yKm / kmPerRow);
    if (column < 0 || column >= columns || row < 0 || row >= rows) return;
    if (!overwrite && cells[row]![column] !== null) return;
    cells[row]![column] = cell;
  };

  // Orbit paths first (lowest layer): sample each ellipse over one period.
  for (const satellite of catalog.satellites) {
    const samples = 180;
    const period = orbitalPeriodSeconds(satellite.elements, catalog.centralBody.mu);
    const role = "orbit" as const;
    for (let index = 0; index < samples; index += 1) {
      const state = propagateOrbitalState(
        satellite.elements,
        satellite.elements.epochSeconds + (period * index) / samples,
        catalog.centralBody.mu,
      );
      place(state.positionKm[0], state.positionKm[1], { char: "·", role }, false);
    }
  }

  // The central body: a marker whose disk size follows the zoom level.
  const radiusColumns = catalog.centralBody.radiusKm / kmPerColumn;
  if (radiusColumns >= 1.5) {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const xKm = (column - centerColumn) * kmPerColumn;
        const yKm = (centerRow - row) * kmPerRow;
        if (Math.hypot(xKm, yKm) <= catalog.centralBody.radiusKm) {
          cells[row]![column] = { char: "▓", role: "body" };
        }
      }
    }
  }
  place(0, 0, { char: "⊕", role: "body" }, true);

  // Satellites on top; the selected marker always wins its cell.
  for (const satellite of catalog.satellites) {
    const state = propagateOrbitalState(satellite.elements, simSeconds, catalog.centralBody.mu);
    const selected = satellite.id === selectedId;
    const char = selected ? "◉" : satellite.kind === "moon" ? "○" : "●";
    const role = selected ? "selected" : satellite.kind === "moon" ? "moon" : "satellite";
    place(state.positionKm[0], state.positionKm[1], { char, role }, true);
  }

  return { cells, rangeKm };
}

/** Formats simulation seconds as `d hh:mm:ss` for the console clock. */
export function formatOrbitalSimTime(simSeconds: number): string {
  const total = Math.max(0, Math.floor(simSeconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `T+${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function degToRad(value: number): number {
  return (value * Math.PI) / 180;
}

function radToDeg(value: number): number {
  return (value * 180) / Math.PI;
}

function normalizeAngle(value: number): number {
  const twoPi = 2 * Math.PI;
  const wrapped = value % twoPi;
  return wrapped < 0 ? wrapped + twoPi : wrapped;
}
