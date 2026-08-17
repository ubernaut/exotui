// Copyright 2023 Im-Beast. MIT license.

// The Orbital Command 3D observatory scene (ORBIT-001 slice): a real
// Three.js scene — Earth, seeded starfield, per-satellite orbit lines,
// and live spacecraft markers — rendered through the library's Three
// ASCII pipeline. Positions come from the same Kepler propagation the
// 2D map and telemetry use, so every view agrees. One scene unit is
// 10,000 km; the camera orbits under keyboard control.

import {
  AmbientLight,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
} from "three";
import { type OrbitalCatalog, orbitalPeriodSeconds, type OrbitalSatellite, propagateOrbitalState } from "./model.ts";

/** Scene scale: kilometers per Three.js unit. */
export const ORBITAL_VIEWPORT_KM_PER_UNIT = 10_000;

/** Keyboard-driven orbital camera state. */
export interface OrbitalViewportCamera {
  azimuthRad: number;
  elevationRad: number;
  distanceUnits: number;
}

/** The constructed viewport scene with its live handles. */
export interface OrbitalViewportBundle {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly cameraState: OrbitalViewportCamera;
  /** Repositions spacecraft and selection emphasis for one frame. */
  update(simSeconds: number, selectedId: string): void;
  dispose(): void;
}

const SATELLITE_COLOR = new Color("#69d2ff");
const MOON_COLOR = new Color("#c8c8d4");
const SELECTED_COLOR = new Color("#ffd166");
const ORBIT_COLOR = new Color("#2a5f7a");
const ORBIT_SELECTED_COLOR = new Color("#e0b34a");

/** Builds the observatory scene for a catalog. */
export function createOrbitalViewportScene(catalog: OrbitalCatalog): OrbitalViewportBundle {
  const scene = new Scene();
  scene.background = new Color("#05070d");
  const camera = new PerspectiveCamera(40, 1, 0.05, 400);
  const cameraState: OrbitalViewportCamera = {
    azimuthRad: 0.7,
    elevationRad: 0.45,
    distanceUnits: 11,
  };

  scene.add(new AmbientLight(new Color("#5a6a7a"), 1.1));
  const sun = new DirectionalLight(new Color("#fff2d8"), 2.4);
  sun.position.set(30, 12, 18);
  scene.add(sun);

  // Earth.
  const earthRadius = catalog.centralBody.radiusKm / ORBITAL_VIEWPORT_KM_PER_UNIT;
  const earth = new Mesh(
    new SphereGeometry(earthRadius, 48, 32),
    new MeshStandardMaterial({
      color: new Color("#2f6db8"),
      emissive: new Color("#0a1d33"),
      roughness: 0.7,
    }),
  );
  scene.add(earth);

  // A deterministic starfield (hash noise, no Math.random).
  const starPositions: number[] = [];
  for (let index = 0; index < 420; index += 1) {
    const a = hashUnit(index, 1) * Math.PI * 2;
    const b = Math.acos(hashUnit(index, 2) * 2 - 1);
    const radius = 160 + hashUnit(index, 3) * 120;
    starPositions.push(
      radius * Math.sin(b) * Math.cos(a),
      radius * Math.cos(b),
      radius * Math.sin(b) * Math.sin(a),
    );
  }
  const starGeometry = new BufferGeometry();
  starGeometry.setAttribute("position", new Float32BufferAttribute(starPositions, 3));
  const stars = new Points(
    starGeometry,
    new PointsMaterial({ color: new Color("#9fb4c8"), size: 0.4, sizeAttenuation: false }),
  );
  scene.add(stars);

  // Orbit lines and satellite markers.
  const markers = new Map<string, Mesh>();
  const orbits = new Map<string, Line>();
  for (const satellite of catalog.satellites) {
    const line = new Line(orbitLineGeometry(satellite, catalog), new LineBasicMaterial({ color: ORBIT_COLOR }));
    orbits.set(satellite.id, line);
    scene.add(line);

    const isMoon = satellite.kind === "moon";
    const marker = new Mesh(
      isMoon ? new SphereGeometry(1_737 / ORBITAL_VIEWPORT_KM_PER_UNIT, 20, 14) : new OctahedronGeometry(0.09),
      new MeshStandardMaterial({
        color: isMoon ? MOON_COLOR : SATELLITE_COLOR,
        emissive: isMoon ? new Color("#22222a") : new Color("#0a3242"),
        roughness: 0.5,
      }),
    );
    markers.set(satellite.id, marker);
    scene.add(marker);
  }

  const update = (simSeconds: number, selectedId: string): void => {
    // Earth turns once per sidereal day of simulated time.
    earth.rotation.y = (simSeconds / 86_164) * Math.PI * 2;
    for (const satellite of catalog.satellites) {
      const marker = markers.get(satellite.id)!;
      const state = propagateOrbitalState(satellite.elements, simSeconds, catalog.centralBody.mu);
      marker.position.set(
        state.positionKm[0] / ORBITAL_VIEWPORT_KM_PER_UNIT,
        state.positionKm[2] / ORBITAL_VIEWPORT_KM_PER_UNIT,
        state.positionKm[1] / ORBITAL_VIEWPORT_KM_PER_UNIT,
      );
      const selected = satellite.id === selectedId;
      const material = marker.material as MeshStandardMaterial;
      material.color.copy(
        selected ? SELECTED_COLOR : satellite.kind === "moon" ? MOON_COLOR : SATELLITE_COLOR,
      );
      material.emissive.copy(selected ? new Color("#5a4310") : new Color("#0a3242"));
      if (satellite.kind !== "moon") {
        const scale = selected ? 1.7 : 1;
        marker.scale.set(scale, scale, scale);
      }
      const orbit = orbits.get(satellite.id)!;
      (orbit.material as LineBasicMaterial).color.copy(selected ? ORBIT_SELECTED_COLOR : ORBIT_COLOR);
    }
    applyCamera(camera, cameraState);
  };
  applyCamera(camera, cameraState);

  return {
    scene,
    camera,
    cameraState,
    update,
    dispose: () => {
      scene.traverse((object: unknown) => {
        const mesh = object as Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = (mesh as Mesh).material;
        if (material && !Array.isArray(material)) material.dispose();
      });
      scene.clear();
    },
  };
}

/** Applies the keyboard camera state onto the perspective camera. */
export function applyCamera(camera: PerspectiveCamera, state: OrbitalViewportCamera): void {
  const elevation = Math.max(-1.35, Math.min(1.35, state.elevationRad));
  state.elevationRad = elevation;
  state.distanceUnits = Math.max(1.2, Math.min(80, state.distanceUnits));
  const horizontal = Math.cos(elevation) * state.distanceUnits;
  camera.position.set(
    Math.cos(state.azimuthRad) * horizontal,
    Math.sin(elevation) * state.distanceUnits,
    Math.sin(state.azimuthRad) * horizontal,
  );
  camera.lookAt(0, 0, 0);
}

/** One sampled orbit ellipse as a closed line geometry. */
function orbitLineGeometry(satellite: OrbitalSatellite, catalog: OrbitalCatalog): BufferGeometry {
  const samples = 128;
  const period = orbitalPeriodSeconds(satellite.elements, catalog.centralBody.mu);
  const positions: number[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const state = propagateOrbitalState(
      satellite.elements,
      satellite.elements.epochSeconds + (period * index) / samples,
      catalog.centralBody.mu,
    );
    positions.push(
      state.positionKm[0] / ORBITAL_VIEWPORT_KM_PER_UNIT,
      state.positionKm[2] / ORBITAL_VIEWPORT_KM_PER_UNIT,
      state.positionKm[1] / ORBITAL_VIEWPORT_KM_PER_UNIT,
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}

/** Deterministic noise in [0,1) for the starfield. */
function hashUnit(a: number, b: number): number {
  let h = (a * 374761393) ^ (b * 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
