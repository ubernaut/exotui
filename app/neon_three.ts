import * as THREE from "three";
import { neonColors as colors } from "./styles.ts";
import type { ThreeSceneMode, ThreeSceneSignal } from "./types.ts";

function neonLine(color: string) {
  return new THREE.LineBasicMaterial({ color });
}

function addBoxWire(group: THREE.Group, size: number, color: string) {
  const wire = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)),
    neonLine(color),
  );
  group.add(wire);
  return wire;
}

function addPanel(
  group: THREE.Group,
  width: number,
  height: number,
  color: string,
  position: [number, number, number],
  opacity = 0.72,
) {
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
    }),
  );
  panel.position.set(...position);
  group.add(panel);
  return panel;
}

function addWirePanel(
  group: THREE.Group,
  width: number,
  height: number,
  color: string,
  position: [number, number, number],
) {
  const panel = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, 0.04)),
    neonLine(color),
  );
  panel.position.set(...position);
  group.add(panel);
  return panel;
}

function addSolidBox(
  group: THREE.Group,
  width: number,
  height: number,
  depth: number,
  color: string,
  position: [number, number, number],
  opacity = 0.82,
) {
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity }),
  );
  box.position.set(...position);
  group.add(box);
  return box;
}

function createPolyline(points: THREE.Vector3[], color: string) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, neonLine(color));
}

function createHelix(color: string, radius: number, turns: number, height: number) {
  const points: number[] = [];
  const count = 220;
  for (let index = 0; index < count; index += 1) {
    const t = (index / (count - 1)) * Math.PI * 2 * turns;
    points.push(Math.cos(t) * radius, (index / (count - 1) - 0.5) * height, Math.sin(t) * radius);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return new THREE.Line(geometry, neonLine(color));
}

function createPointsShell() {
  const geometry = new THREE.BufferGeometry();
  const points: number[] = [];
  for (let index = 0; index < 90; index += 1) {
    const t = (index / 89) * Math.PI * 2;
    points.push(
      Math.cos(t) * 1.45 * Math.sin(index * 0.19),
      Math.sin(t * 0.7) * 1.2,
      Math.sin(t) * 1.45 * Math.cos(index * 0.13),
    );
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: colors.amber, size: 0.04 }));
}

function createMapSlabMesh() {
  const geometry = new THREE.PlaneGeometry(2.8, 2.8, 16, 16);
  const positions = geometry.attributes.position as THREE.Float32BufferAttribute;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    positions.setZ(index, Math.sin(x * 2.6) * 0.22 + Math.cos(y * 2.8) * 0.17);
  }
  positions.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({
    color: colors.phosphor,
    wireframe: true,
    transparent: true,
    opacity: 0.82,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -0.85;
  mesh.rotation.z = 0.4;
  return mesh;
}

function createWaveRibbon(color: string, count = 96) {
  const points = new Array<THREE.Vector3>(count);
  for (let index = 0; index < count; index += 1) {
    const x = (index / (count - 1) - 0.5) * 4.2;
    const y = Math.sin(index * 0.28) * 0.42 + Math.sin(index * 0.071) * 0.18;
    points[index] = new THREE.Vector3(x, y, Math.cos(index * 0.19) * 0.22);
  }
  return createPolyline(points, color);
}

function createLissajousTrace(color: string, scaleX: number, scaleY: number, phase = 0) {
  const points = new Array<THREE.Vector3>(180);
  for (let index = 0; index < points.length; index += 1) {
    const t = (index / 179) * Math.PI * 2;
    points[index] = new THREE.Vector3(
      Math.sin(t * 3 + phase) * scaleX,
      Math.sin(t * 4 + phase * 0.7) * scaleY,
      Math.cos(t * 5 + phase) * 0.18,
    );
  }
  return createPolyline(points, color);
}

function createReticle(color: string, radius: number) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.018, 12, 96),
    new THREE.MeshBasicMaterial({ color, wireframe: true }),
  );
  group.add(ring);
  const horizontal = createPolyline(
    [new THREE.Vector3(-radius * 1.45, 0, 0), new THREE.Vector3(radius * 1.45, 0, 0)],
    color,
  );
  const vertical = createPolyline(
    [new THREE.Vector3(0, -radius * 1.45, 0), new THREE.Vector3(0, radius * 1.45, 0)],
    color,
  );
  group.add(horizontal, vertical);
  return group;
}

function createGrid(width: number, height: number, columns: number, rows: number, color: string) {
  const grid = new THREE.Group();
  for (let column = 0; column <= columns; column += 1) {
    const x = (column / columns - 0.5) * width;
    grid.add(createPolyline([new THREE.Vector3(x, -height / 2, 0), new THREE.Vector3(x, height / 2, 0)], color));
  }
  for (let row = 0; row <= rows; row += 1) {
    const y = (row / rows - 0.5) * height;
    grid.add(createPolyline([new THREE.Vector3(-width / 2, y, 0), new THREE.Vector3(width / 2, y, 0)], color));
  }
  return grid;
}

function createContourField(color: string, layers = 9): THREE.Group {
  const field = new THREE.Group();
  for (let layer = 0; layer < layers; layer += 1) {
    const points = new Array<THREE.Vector3>(90);
    for (let index = 0; index < points.length; index += 1) {
      const t = (index / 89) * Math.PI * 2;
      const radius = 0.5 + layer * 0.14 + Math.sin(index * 0.33 + layer) * 0.05;
      points[index] = new THREE.Vector3(
        Math.cos(t) * radius * (0.78 + layer * 0.035),
        Math.sin(t) * radius * (1.05 - layer * 0.025),
        Math.sin(t * 2.7 + layer) * 0.05,
      );
    }
    const line = createPolyline(points, color);
    line.position.set(-1.25 + layer * 0.055, 0.2 - layer * 0.025, -0.2 + layer * 0.018);
    field.add(line);
  }
  return field;
}

function createSegmentBoard(color: string): THREE.Group {
  const board = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const segmentSpecs: Array<[number, number, number, number]> = [
    [0, 0.48, 0.62, 0.08],
    [0, 0, 0.62, 0.08],
    [0, -0.48, 0.62, 0.08],
    [-0.34, 0.24, 0.08, 0.48],
    [0.34, 0.24, 0.08, 0.48],
    [-0.34, -0.24, 0.08, 0.48],
    [0.34, -0.24, 0.08, 0.48],
  ];
  segmentSpecs.forEach(([x, y, width, height], index) => {
    const segment = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.05), material.clone());
    segment.position.set(x, y, index * 0.006);
    board.add(segment);
  });
  return board;
}

function createHexTile(color: string) {
  const tile = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.08, 6),
    new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.9 }),
  );
  tile.rotation.x = Math.PI / 2;
  return tile;
}

function createTopologyNode(color: string, radius = 0.09) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 12),
    new THREE.MeshBasicMaterial({ color, wireframe: true }),
  );
}

interface NeonThreeSceneOptions {
  wireframeThickness?: number;
}

export interface NeonThreeSceneBundle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  tick: (time: number, signal: ThreeSceneSignal) => void;
  dispose: () => void;
}

interface StudioCameraFraming {
  cameraY: number;
  cameraZ: number;
  groupScale: number;
}

function studioCameraFramingForAspect(aspect: number): StudioCameraFraming {
  const wide = Math.max(0, aspect - 1.25);
  const tall = Math.max(0, 1.05 - aspect);
  return {
    cameraY: 1.18 - Math.min(0.28, wide * 0.18) + Math.min(0.18, tall * 0.22),
    cameraZ: 6.25 - Math.min(1.05, wide * 1.15) + Math.min(0.65, tall * 1.1),
    groupScale: 1 + Math.min(0.24, wide * 0.22),
  };
}

const modeLabels = {
  lattice: "LATTICE",
  atfield: "AT-FIELD",
  hexshell: "HEX SHELL",
  capture: "CAPTURE",
  mapslab: "MAP SLAB",
  solenoid: "SOLENOID",
  studio: "ACEROLA",
  emergency: "EMERGENCY",
  counter: "COUNTER",
  plug: "TEST PLUG",
  surveillance: "SURVEIL",
  relay: "RELAY",
  rack: "RACK",
  scope: "SCOPE",
  biosignal: "BIOSIGNAL",
  harmonic: "HARMONIC",
  psychograph: "PSYCHO",
  field: "FIELD",
  heat: "HEX FIELD",
  route: "ROUTE",
  topology: "TOPOLOGY",
  command: "COMMAND",
  launch: "LAUNCH",
  magi: "MAGI",
  target: "TARGET",
  waveform: "WAVEFORM",
  angel: "ANGEL",
  gate: "GATE",
} as const satisfies Record<ThreeSceneMode, string>;

export function neonThreeSceneModeLabel(mode: ThreeSceneMode): string {
  return modeLabels[mode];
}

const asciiWireOverlays = new WeakSet<THREE.Object3D>();

function asciiWireRadius(thickness = 2): number {
  return Math.max(0.002, Math.min(0.04, thickness * 0.0045));
}

function materialColor(material: THREE.Material | THREE.Material[] | undefined): string {
  const selected = Array.isArray(material) ? material[0] : material;
  const color = (selected as { color?: THREE.Color } | undefined)?.color;
  return color ? `#${color.getHexString()}` : colors.phosphor;
}

function isWireframeMaterial(material: THREE.Material | THREE.Material[] | undefined): boolean {
  const selected = Array.isArray(material) ? material[0] : material;
  return Boolean((selected as { wireframe?: boolean } | undefined)?.wireframe);
}

function createThickSegmentsFromGeometry(
  geometry: THREE.BufferGeometry,
  segmented: boolean,
  color: string,
  radius: number,
): THREE.Group | undefined {
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!positions || positions.count < 2) return undefined;

  const overlay = new THREE.Group();
  asciiWireOverlays.add(overlay);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 });
  const maxSegments = Math.min(segmented ? positions.count / 2 : positions.count - 1, 520);
  const segmentGeometry = new THREE.CylinderGeometry(radius, radius, 1, 6, 1, false);
  const segments = new THREE.InstancedMesh(segmentGeometry, material, maxSegments);
  asciiWireOverlays.add(segments);
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const midpoint = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const scale = new THREE.Vector3(1, 1, 1);
  const matrix = new THREE.Matrix4();
  let segmentCount = 0;

  for (let index = 0; index < maxSegments; index += 1) {
    const startIndex = segmented ? index * 2 : index;
    const endIndex = segmented ? startIndex + 1 : index + 1;
    start.fromBufferAttribute(positions, startIndex);
    end.fromBufferAttribute(positions, endIndex);
    direction.subVectors(end, start);
    const length = direction.length();
    if (length <= 0.0001) continue;

    midpoint.copy(start).add(end).multiplyScalar(0.5);
    quaternion.setFromUnitVectors(up, direction.normalize());
    scale.set(1, length, 1);
    matrix.compose(midpoint, quaternion, scale);
    segments.setMatrixAt(segmentCount, matrix);
    segmentCount += 1;
  }

  if (segmentCount === 0) {
    segmentGeometry.dispose();
    material.dispose();
    return undefined;
  }

  segments.count = segmentCount;
  segments.instanceMatrix.needsUpdate = true;
  overlay.add(segments);
  return overlay;
}

function addAsciiWireOverlays(root: THREE.Object3D, thickness = 2): void {
  if (thickness <= 0.55) return;
  const radius = asciiWireRadius(thickness);
  const overlays: Array<{ parent: THREE.Object3D; overlay: THREE.Object3D }> = [];

  root.traverse((object: THREE.Object3D) => {
    if (asciiWireOverlays.has(object)) return;
    if (object instanceof THREE.LineSegments) {
      const overlay = createThickSegmentsFromGeometry(object.geometry, true, materialColor(object.material), radius);
      if (overlay) overlays.push({ parent: object, overlay });
      return;
    }
    if (object instanceof THREE.Line) {
      const overlay = createThickSegmentsFromGeometry(object.geometry, false, materialColor(object.material), radius);
      if (overlay) overlays.push({ parent: object, overlay });
      return;
    }
    if (object instanceof THREE.Mesh && isWireframeMaterial(object.material)) {
      const edges = new THREE.EdgesGeometry(object.geometry);
      const overlay = createThickSegmentsFromGeometry(edges, true, materialColor(object.material), radius);
      edges.dispose();
      if (overlay) overlays.push({ parent: object, overlay });
    }
  });

  for (const { parent, overlay } of overlays) {
    parent.add(overlay);
  }
}

export function createNeonThreeScene(mode: ThreeSceneMode, options: NeonThreeSceneOptions = {}): NeonThreeSceneBundle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(colors.void);
  const group = new THREE.Group();
  scene.add(new THREE.AmbientLight("#ffffff", 1.15));
  scene.add(group);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0.1, 5.8);

  const tickBase = (time: number) => {
    group.rotation.y = time * 0.00018;
    group.rotation.x = Math.sin(time * 0.00013) * 0.24;
  };

  const bundle = (() => {
    switch (mode) {
      case "lattice": {
        const wires = [1.1, 1.7, 2.3].map((size, index) => {
          const wire = addBoxWire(group, size, index === 1 ? colors.phosphor : colors.signal);
          wire.rotation.x = index * 0.4;
          wire.rotation.y = index * 0.5;
          return wire;
        });
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            tickBase(time);
            wires.forEach((wire, index) => {
              const factor = 1 + signal.depth * 0.18 * ((index + 1) / wires.length);
              wire.scale.setScalar(factor);
              wire.rotation.z = signal.twist * 0.4 * (index + 1);
              wire.position.y = signal.lift * 0.16 * (index - 1);
            });
          },
        };
      }
      case "atfield": {
        const rings = [0.8, 1.25, 1.7].map((radius, index) => {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(radius, 0.04, 18, 84),
            new THREE.MeshBasicMaterial({
              color: [colors.amber, colors.phosphor, colors.signal][index],
              transparent: true,
              opacity: 0.9,
              wireframe: true,
            }),
          );
          ring.rotation.x = Math.PI / 2;
          group.add(ring);
          return ring;
        });
        const axis = createHelix(colors.violet, 0.34, 1.5, 2.8);
        axis.rotation.z = Math.PI / 2;
        group.add(axis);
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            tickBase(time);
            rings.forEach((ring, index) => {
              const scale = 1 + signal.depth * 0.14 * (index + 1);
              ring.scale.setScalar(scale);
              ring.rotation.z = time * 0.0004 * (index + 1) + signal.twist * 0.6 * (index + 1);
            });
            axis.rotation.y = time * 0.0009 + signal.twist * 0.9;
            axis.scale.setScalar(1 + signal.pulse * 0.12);
            axis.position.y = signal.lift * 0.25;
          },
        };
      }
      case "hexshell": {
        const mesh = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.65, 0)),
          neonLine(colors.phosphor),
        );
        const shellPoints = createPointsShell();
        group.add(mesh, shellPoints);
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            tickBase(time);
            mesh.rotation.z = signal.twist * 0.9;
            mesh.scale.setScalar(1 + signal.depth * 0.16);
            shellPoints.rotation.y = time * 0.0006 + signal.twist * 0.8;
            shellPoints.rotation.x = signal.lift * 0.7;
            shellPoints.position.y = signal.lift * 0.2;
          },
        };
      }
      case "capture": {
        const outer = addBoxWire(group, 2.2, colors.amber);
        const inner = addBoxWire(group, 1.28, colors.signal);
        const axis = createHelix(colors.alarm, 0.55, 3, 2.4);
        axis.rotation.z = Math.PI / 2;
        group.add(axis);
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            tickBase(time);
            outer.rotation.z = time * 0.0004 + signal.twist * 0.8;
            inner.rotation.x = time * 0.0007 - signal.lift * 0.8;
            outer.scale.setScalar(1 + signal.depth * 0.16);
            inner.scale.setScalar(1 + signal.pulse * 0.18);
            axis.rotation.y = time * 0.0008 + signal.twist * 0.8;
            axis.position.y = signal.lift * 0.26;
          },
        };
      }
      case "mapslab": {
        const slab = createMapSlabMesh();
        group.add(slab);
        group.position.y = -0.1;
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            tickBase(time);
            slab.rotation.z = 0.4 + signal.twist * 0.22;
            slab.rotation.x = -0.85 + signal.lift * 0.12;
            slab.scale.set(1 + signal.depth * 0.22, 1 + signal.depth * 0.12, 1);
            slab.position.z = signal.pulse * 0.16;
          },
        };
      }
      case "solenoid": {
        const helixA = createHelix(colors.phosphor, 0.78, 4.5, 3.2);
        const helixB = createHelix(colors.alarm, 1.02, 4.5, 3.2);
        helixB.rotation.y = Math.PI / 2;
        group.add(helixA, helixB);
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            tickBase(time);
            helixA.rotation.y = time * 0.0009 + signal.twist;
            helixB.rotation.x = time * 0.0007 - signal.lift;
            helixA.scale.setScalar(1 + signal.depth * 0.12);
            helixB.scale.setScalar(1 + signal.pulse * 0.18);
            helixA.position.x = signal.twist * -0.35;
            helixB.position.x = signal.twist * 0.35;
          },
        };
      }
      case "studio": {
        scene.background = new THREE.Color("#071017");
        scene.clear();
        scene.add(new THREE.AmbientLight(new THREE.Color("#71828a"), 1.5));

        const keyLight = new THREE.DirectionalLight(new THREE.Color("#fff1c4"), 2.6);
        keyLight.position.set(5, 6, 3);
        scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(new THREE.Color("#7fc0ff"), 1.1);
        fillLight.position.set(-4, 2, 5);
        scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(new THREE.Color("#ff4fd8"), 0.85);
        rimLight.position.set(-3, 4, -2);
        scene.add(rimLight);
        scene.add(group);
        camera.position.set(0, 1.18, 6.25);

        const torus = new THREE.Mesh(
          new THREE.TorusKnotGeometry(1.25, 0.45, 96, 18),
          new THREE.MeshPhongMaterial({
            color: new THREE.Color("#9cff3a"),
            emissive: new THREE.Color("#163a05"),
            shininess: 60,
            specular: new THREE.Color("#ffffff"),
          }),
        );
        torus.position.set(-1.35, 1.3, 0.2);
        group.add(torus);

        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.9, 32, 24),
          new THREE.MeshPhongMaterial({
            color: new THREE.Color("#1ee7d2"),
            emissive: new THREE.Color("#052f2a"),
            shininess: 100,
            specular: new THREE.Color("#d7f6ff"),
          }),
        );
        sphere.position.set(1.9, 0.7, -0.6);
        group.add(sphere);

        const block = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 1.2, 1.2),
          new THREE.MeshPhongMaterial({
            color: new THREE.Color("#ff4fd8"),
            emissive: new THREE.Color("#3a042e"),
            shininess: 48,
          }),
        );
        block.position.set(0.4, 2.55, -1.9);
        block.rotation.set(0.5, 0.4, 0.2);
        group.add(block);

        const floorGrid = createGrid(7.2, 3.8, 14, 8, "#254a58");
        floorGrid.rotation.x = -Math.PI / 2;
        floorGrid.position.set(0, -0.76, 1.55);
        scene.add(floorGrid);

        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            const seconds = time * 0.001;
            group.rotation.y = seconds * 0.22 + signal.twist * 0.3;
            torus.rotation.x += 0.028 + signal.pulse * 0.01;
            torus.rotation.y += 0.044 + signal.depth * 0.01;
            sphere.position.y = 0.7 + Math.sin(seconds * 1.1) * (0.2 + signal.depth * 0.1);
            sphere.rotation.y += 0.055;
            block.rotation.x += 0.035 + signal.lift * 0.01;
            block.rotation.z += 0.025 + signal.twist * 0.01;
            const framing = studioCameraFramingForAspect(camera.aspect);
            camera.position.y = framing.cameraY;
            camera.position.z = framing.cameraZ;
            group.scale.setScalar(framing.groupScale);
          },
        };
      }
      case "emergency": {
        camera.position.set(0, 0.2, 6.2);
        const stripes: THREE.Mesh[] = new Array(10);
        for (let index = 0; index < stripes.length; index++) {
          const color = index % 2 === 0 ? colors.alarm : colors.void;
          const stripe = addPanel(group, 0.32, 3.4, color, [(index - 4.5) * 0.48, 0, 0], index % 2 === 0 ? 0.94 : 0.35);
          stripe.rotation.z = Math.PI / 4;
          stripes[index] = stripe;
        }
        const topRail = addWirePanel(group, 4.8, 0.42, colors.amber, [0, 1.48, 0.12]);
        const bottomRail = addWirePanel(group, 4.8, 0.42, colors.amber, [0, -1.48, 0.12]);
        const warning = addWirePanel(group, 1.9, 0.82, colors.alarm, [0, 0, 0.22]);
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            const seconds = time * 0.001;
            group.rotation.y = signal.twist * 0.24;
            group.rotation.x = Math.sin(seconds * 0.7) * 0.08;
            stripes.forEach((stripe, index) => {
              stripe.position.x = ((index - 4.5) * 0.48 + (seconds * (signal.pressed ? 1.4 : 0.48)) % 0.96) - 0.48;
              stripe.scale.y = 1 + signal.pulse * 0.18;
            });
            topRail.scale.x = 1 + signal.depth * 0.08;
            bottomRail.scale.x = 1 + signal.depth * 0.08;
            warning.scale.setScalar(1 + Math.sin(seconds * 5.5) * 0.08 + signal.pulse * 0.08);
          },
        };
      }
      case "counter": {
        camera.position.set(0, 0.1, 6.2);
        const backplate = addWirePanel(group, 4.5, 2.5, colors.signal, [0, 0, -0.12]);
        const boards = [-1.4, 0, 1.4].map((x, index) => {
          const board = createSegmentBoard(index === 1 ? colors.phosphor : colors.amber);
          board.position.set(x, 0.14, 0.08);
          group.add(board);
          addWirePanel(group, 1.0, 1.35, index === 1 ? colors.phosphor : colors.alarm, [x, 0.14, 0.02]);
          return board;
        });
        const rails = [-1.05, 1.18].map((y) =>
          createPolyline([new THREE.Vector3(-2.25, y, 0), new THREE.Vector3(2.25, y, 0)], colors.alarm)
        );
        group.add(...rails);
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            const seconds = time * 0.001;
            group.rotation.y = signal.twist * 0.2;
            group.rotation.x = signal.lift * 0.08;
            backplate.scale.x = 1 + signal.depth * 0.08;
            boards.forEach((board, boardIndex) => {
              board.children.forEach((segment: THREE.Object3D, segmentIndex: number) => {
                segment.visible = ((Math.floor(seconds * 3 + boardIndex) + segmentIndex) % 5) !== 0 || signal.pressed;
              });
              board.scale.setScalar(1 + signal.pulse * (0.03 + boardIndex * 0.01));
            });
            rails.forEach((rail, index) => {
              rail.position.x = Math.sin(seconds * 1.5 + index) * 0.08 * (1 + signal.depth);
            });
          },
        };
      }
      case "plug": {
        camera.position.set(0, 0.28, 6.7);
        const separators = [-0.78, 0.78].map((x) => addWirePanel(group, 0.04, 2.8, colors.alarm, [x, 0, 0.18]));
        const plugs = [-1.45, 0, 1.45].map((x, index) => {
          const plug = new THREE.Mesh(
            new THREE.CylinderGeometry(0.32, 0.38, 2.65, 32, 4),
            new THREE.MeshBasicMaterial({
              color: [colors.signal, colors.phosphor, colors.amber][index],
              wireframe: true,
              transparent: true,
              opacity: 0.92,
            }),
          );
          plug.position.set(x, -0.08, 0);
          group.add(plug);
          addWirePanel(group, 0.9, 2.95, index === 1 ? colors.phosphor : colors.alarm, [x, 0, -0.08]);
          const plate = addSolidBox(group, 0.78, 0.22, 0.05, colors.alarm, [x, -1.12, 0.18], 0.9);
          return { plug, plate };
        });
        const scan = addPanel(group, 4.4, 0.18, colors.signal, [0, 0.95, 0.24], 0.48);
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            const seconds = time * 0.001;
            group.rotation.y = signal.twist * 0.18;
            group.rotation.x = signal.lift * 0.1;
            plugs.forEach(({ plug, plate }, index) => {
              plug.rotation.y = seconds * (0.25 + index * 0.08);
              plug.position.y = -0.08 + Math.sin(seconds * 1.1 + index) * 0.08 + signal.lift * 0.16;
              plug.scale.setScalar(1 + signal.pulse * 0.06 * (index + 1));
              plate.scale.x = 0.72 + signal.depth * 0.28 + Math.sin(seconds * 2.2 + index) * 0.06;
            });
            separators.forEach((separator, index) => {
              separator.scale.y = 1 + signal.depth * 0.1 + Math.sin(seconds * 3 + index) * 0.03;
            });
            scan.position.y = 0.95 - ((seconds * (0.32 + signal.pulse * 0.25)) % 2.2);
          },
        };
      }
      case "surveillance": {
        camera.position.set(0, 0.05, 6.5);
        const grid = createGrid(4.7, 2.85, 5, 4, colors.phosphor);
        grid.position.z = -0.24;
        group.add(grid);
        const contours = createContourField(colors.phosphor, 12);
        contours.position.set(-1.25, 0.15, 0.08);
        group.add(contours);
        const livePanel = addWirePanel(group, 0.94, 0.52, colors.alarm, [1.55, 1.05, 0.2]);
        const target = createReticle(colors.alarm, 0.28);
        target.position.set(-1.58, 0.42, 0.28);
        group.add(target);
        const silhouettes = [-0.45, 0.15, 0.72].map((x, index) =>
          addSolidBox(group, 0.28 + index * 0.08, 0.44 + index * 0.04, 0.08, colors.void, [x, -1.02, 0.26], 0.96)
        );
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            const seconds = time * 0.001;
            group.rotation.y = signal.twist * 0.12;
            grid.position.x = Math.sin(seconds * 0.45) * 0.08;
            contours.children.forEach((child: THREE.Object3D, index: number) => {
              child.rotation.z = Math.sin(seconds * 0.35 + index * 0.4) * 0.12;
              child.scale.setScalar(1 + signal.depth * 0.08 + Math.sin(seconds * 0.8 + index) * 0.025);
            });
            livePanel.scale.setScalar(1 + (signal.pressed ? 0.12 : 0.04) * Math.sin(seconds * 5.5));
            target.rotation.z = seconds * 0.9;
            target.position.x = -1.58 + signal.twist * 0.3;
            target.position.y = 0.42 + signal.lift * 0.2;
            silhouettes.forEach((silhouette, index) => {
              silhouette.scale.y = 1 + signal.pulse * 0.08 * (index + 1);
            });
          },
        };
      }
      case "relay": {
        camera.position.set(0, 0.05, 6.4);
        const busLines: THREE.Line[] = new Array(12);
        for (let index = 0; index < busLines.length; index++) {
          const y = (index % 6 - 2.5) * 0.42;
          const x = index < 6 ? -1.3 : 1.3;
          const line = createPolyline(
            [
              new THREE.Vector3(x - 0.52, y, -0.1),
              new THREE.Vector3(x - 0.18, y, -0.1),
              new THREE.Vector3(x - 0.18, y - 0.24, -0.1),
              new THREE.Vector3(x + 0.52, y - 0.24, -0.1),
            ],
            colors.alarm,
          );
          group.add(line);
          busLines[index] = line;
        }
        const bars: { bar: ReturnType<typeof addSolidBox>; baseY: number }[] = new Array(30);
        for (let index = 0; index < bars.length; index++) {
          const column = index % 5;
          const row = Math.floor(index / 5);
          const x = (column - 2) * 0.8 + (row % 2) * 0.18;
          const y = 1.1 - row * 0.45;
          const bar = addSolidBox(group, 0.66, 0.15, 0.08, colors.phosphor, [x, y, 0.1], 0.96);
          bar.rotation.z = -0.55;
          bars[index] = { bar, baseY: y };
        }
        const nodes: THREE.Mesh[] = new Array(bars.length);
        for (let index = 0; index < bars.length; index++) {
          const { bar } = bars[index];
          nodes[index] = addSolidBox(
            group,
            0.1,
            0.1,
            0.1,
            index % 4 === 0 ? colors.amber : colors.alarm,
            [bar.position.x - 0.32, bar.position.y - 0.18, 0.18],
            0.92,
          );
        }
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            const seconds = time * 0.001;
            group.rotation.y = signal.twist * 0.16;
            bars.forEach(({ bar, baseY }, index) => {
              const phase = seconds * 2.2 + index * 0.28;
              bar.position.y = baseY + Math.sin(phase) * 0.04 * signal.depth;
              bar.scale.x = 0.82 + signal.depth * 0.28 + Math.max(0, Math.sin(phase)) * 0.18;
              bar.material.opacity = 0.74 + Math.max(0, Math.sin(phase)) * 0.24;
            });
            nodes.forEach((node, index) => {
              node.scale.setScalar(0.75 + Math.max(0, Math.sin(seconds * 3.1 + index)) * (0.4 + signal.pulse * 0.3));
            });
            busLines.forEach((line, index) => {
              line.position.x = Math.sin(seconds * 0.8 + index) * 0.04 * signal.depth;
            });
          },
        };
      }
      case "rack": {
        camera.position.set(0, 0.15, 6.3);
        addWirePanel(group, 4.4, 2.8, colors.alarm, [0, 0, -0.14]);
        const cells: THREE.Mesh[] = new Array(48);
        for (let index = 0; index < cells.length; index++) {
          const column = index % 8;
          const row = Math.floor(index / 8);
          const color = index % 5 === 0 ? colors.alarm : index % 3 === 0 ? colors.amber : colors.phosphor;
          cells[index] = addSolidBox(
            group,
            0.34,
            0.12,
            0.08,
            color,
            [(column - 3.5) * 0.5, 1.08 - row * 0.42, 0.06],
            0.9,
          );
        }
        const rails = [-2.25, 2.25].map((x) => addWirePanel(group, 0.18, 2.95, colors.signal, [x, 0, 0.02]));
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            const seconds = time * 0.001;
            group.rotation.y = signal.twist * 0.14;
            cells.forEach((cell, index) => {
              const value = 0.45 + Math.max(0, Math.sin(seconds * (1.5 + (index % 7) * 0.12) + index)) * 0.7;
              cell.scale.x = value + signal.depth * 0.16;
              cell.scale.y = 1 + signal.pulse * 0.08 * ((index % 4) + 1);
            });
            rails.forEach((rail, index) => {
              rail.scale.y = 1 + Math.sin(seconds * 2 + index) * 0.04 + signal.pulse * 0.08;
            });
          },
        };
      }
      case "scope": {
        camera.position.set(0, 0.05, 6.4);
        const grid = createGrid(4.8, 2.7, 10, 6, colors.violet);
        grid.position.z = -0.18;
        group.add(grid);
        const ribbons = [colors.signal, colors.phosphor, colors.amber, colors.alarm].map((color, index) => {
          const ribbon = createWaveRibbon(color, 128);
          ribbon.position.y = (index - 1.5) * 0.42;
          group.add(ribbon);
          return ribbon;
        });
        const thresholds = [-1.7, 1.7].map((x) =>
          createPolyline([new THREE.Vector3(x, -1.35, 0.08), new THREE.Vector3(x, 1.35, 0.08)], colors.alarm)
        );
        group.add(...thresholds);
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            const seconds = time * 0.001;
            group.rotation.x = signal.lift * 0.12;
            group.rotation.y = signal.twist * 0.16;
            ribbons.forEach((ribbon, index) => {
              ribbon.position.x = ((seconds * (0.18 + index * 0.04)) % 0.7) - 0.35;
              ribbon.scale.y = 0.75 + signal.pulse * (0.26 + index * 0.08);
              ribbon.rotation.z = Math.sin(seconds * 0.9 + index) * 0.08;
            });
            thresholds.forEach((threshold, index) => {
              threshold.position.x = Math.sin(seconds * 0.75 + index * Math.PI) * 0.18 * signal.depth;
            });
          },
        };
      }
      case "biosignal": {
        camera.position.set(0, 0.02, 6.2);
        const grid = createGrid(4.8, 2.7, 12, 5, colors.phosphor);
        grid.position.z = -0.22;
        group.add(grid);
        const traces = [colors.phosphor, colors.signal, colors.amber].map((color, index) => {
          const trace = createWaveRibbon(color, 140);
          trace.position.y = 0.72 - index * 0.7;
          group.add(trace);
          return trace;
        });
        const scan = addPanel(group, 0.12, 2.7, colors.signal, [-2.1, 0, 0.16], 0.42);
        const markers: THREE.Mesh[] = new Array(12);
        for (let index = 0; index < markers.length; index++) {
          markers[index] = addSolidBox(
            group,
            0.08,
            0.18,
            0.06,
            index % 4 === 0 ? colors.alarm : colors.phosphor,
            [-2.1 + index * 0.38, -1.16, 0.22],
            0.88,
          );
        }
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            const seconds = time * 0.001;
            group.rotation.x = signal.lift * 0.1;
            group.rotation.y = signal.twist * 0.12;
            traces.forEach((trace, index) => {
              trace.position.x = ((seconds * (0.22 + index * 0.05)) % 0.8) - 0.4;
              trace.scale.y = 0.72 + signal.pulse * (0.22 + index * 0.1);
              trace.rotation.z = Math.sin(seconds * 1.1 + index) * 0.06;
            });
            scan.position.x = -2.1 + ((seconds * (0.8 + signal.pulse * 0.5)) % 4.2);
            markers.forEach((marker, index) => {
              marker.scale.y = 0.65 + Math.max(0, Math.sin(seconds * 3 + index)) * (0.8 + signal.depth * 0.4);
            });
          },
        };
      }
      case "harmonic": {
        camera.position.set(0, 0.12, 6.5);
        const rings = [0.62, 1.05, 1.52, 1.96].map((radius, index) => {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(radius, 0.018 + index * 0.006, 16, 96),
            new THREE.MeshBasicMaterial({
              color: [colors.violet, colors.signal, colors.phosphor, colors.amber][index],
              wireframe: true,
              transparent: true,
              opacity: 0.86,
            }),
          );
          ring.rotation.x = Math.PI / 2 + index * 0.18;
          group.add(ring);
          return ring;
        });
        const traces = [
          createLissajousTrace(colors.violet, 1.85, 0.95, 0),
          createLissajousTrace(colors.phosphor, 1.45, 1.15, 0.7),
          createLissajousTrace(colors.alarm, 1.1, 0.62, 1.4),
        ];
        traces.forEach((trace) => group.add(trace));
        const core = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.22, 0),
          new THREE.MeshBasicMaterial({ color: colors.amber, wireframe: true }),
        );
        group.add(core);
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            const seconds = time * 0.001;
            group.rotation.y = signal.twist * 0.22;
            group.rotation.x = Math.sin(seconds * 0.35) * 0.08 + signal.lift * 0.08;
            rings.forEach((ring, index) => {
              ring.rotation.z = seconds * (0.26 + index * 0.12) * (index % 2 === 0 ? 1 : -1);
              ring.scale.setScalar(0.9 + signal.depth * 0.12 * (index + 1));
            });
            traces.forEach((trace, index) => {
              trace.rotation.z = seconds * (0.18 + index * 0.08);
              trace.scale.setScalar(0.9 + signal.pulse * (0.1 + index * 0.06));
            });
            core.scale.setScalar(1 + signal.pulse * 0.55);
          },
        };
      }
      case "psychograph": {
        camera.position.set(0, 0.06, 6.3);
        const backing = addWirePanel(group, 4.6, 2.65, colors.amber, [0, 0, -0.18]);
        const scribbles: THREE.Line[] = new Array(7);
        for (let index = 0; index < scribbles.length; index++) {
          const trace = createLissajousTrace(
            index % 2 === 0 ? colors.amber : index % 3 === 0 ? colors.alarm : colors.violet,
            1.0 + index * 0.16,
            0.46 + (index % 4) * 0.17,
            index * 0.58,
          );
          trace.position.z = index * 0.025;
          group.add(trace);
          scribbles[index] = trace;
        }
        const nodes: ReturnType<typeof createTopologyNode>[] = new Array(10);
        for (let index = 0; index < nodes.length; index++) {
          const node = createTopologyNode(index % 3 === 0 ? colors.alarm : colors.amber, 0.055);
          node.position.set(Math.sin(index * 1.7) * 1.8, Math.cos(index * 1.1) * 0.96, 0.2);
          group.add(node);
          nodes[index] = node;
        }
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            const seconds = time * 0.001;
            group.rotation.y = signal.twist * 0.18;
            backing.scale.x = 1 + signal.depth * 0.08;
            scribbles.forEach((trace, index) => {
              trace.rotation.z = Math.sin(seconds * (0.35 + index * 0.05) + index) * (0.18 + signal.depth * 0.12);
              trace.scale.x = 0.78 + signal.pulse * 0.2 + index * 0.02;
              trace.scale.y = 0.72 + signal.depth * 0.18;
            });
            nodes.forEach((node, index) => {
              node.position.x = Math.sin(seconds * 0.8 + index * 1.7) * (1.4 + signal.depth * 0.45);
              node.position.y = Math.cos(seconds * 0.9 + index * 1.1) * (0.72 + signal.pulse * 0.24);
              node.scale.setScalar(0.7 + Math.max(0, Math.sin(seconds * 2.3 + index)) * 0.55);
            });
          },
        };
      }
      case "field": {
        camera.position.set(0, 0.08, 6.2);
        const reticles = [0.5, 0.9, 1.32, 1.74].map((radius, index) => {
          const reticle = createReticle([colors.signal, colors.phosphor, colors.amber, colors.alarm][index], radius);
          reticle.rotation.x = Math.PI / 2;
          group.add(reticle);
          return reticle;
        });
        const shell = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.58, 1),
          new THREE.MeshBasicMaterial({ color: colors.phosphor, wireframe: true, transparent: true, opacity: 0.92 }),
        );
        group.add(shell);
        const clampRails = [-1.95, 1.95].map((x) => addWirePanel(group, 0.32, 2.8, colors.alarm, [x, 0, 0.12]));
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            const seconds = time * 0.001;
            group.rotation.y = signal.twist * 0.22;
            reticles.forEach((reticle, index) => {
              reticle.rotation.z = seconds * (0.22 + index * 0.1) * (index % 2 === 0 ? 1 : -1);
              reticle.scale.setScalar(1 + signal.depth * 0.08 * (index + 1));
            });
            shell.position.set((signal.x - 0.5) * 1.2, (0.5 - signal.y) * 0.85, signal.pulse * 0.18);
            shell.rotation.x = seconds * 0.7;
            shell.rotation.y = seconds * 0.9;
            shell.scale.setScalar(1 + signal.pulse * 0.25);
            clampRails.forEach((rail, index) => {
              rail.position.x = (index === 0 ? -1.95 : 1.95) + (index === 0 ? signal.depth : -signal.depth) * 0.18;
            });
          },
        };
      }
      case "heat": {
        camera.position.set(0, 0.15, 6.0);
        const tiles: ReturnType<typeof createHexTile>[] = new Array(55);
        for (let index = 0; index < tiles.length; index++) {
          const row = Math.floor(index / 11);
          const column = index % 11;
          const color = index % 7 === 0 ? colors.alarm : index % 3 === 0 ? colors.amber : colors.phosphor;
          const tile = createHexTile(color);
          tile.position.set((column - 5) * 0.36 + (row % 2) * 0.18, 1.0 - row * 0.36, 0);
          group.add(tile);
          tiles[index] = tile;
        }
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            const seconds = time * 0.001;
            group.rotation.x = -0.18 + signal.lift * 0.18;
            group.rotation.y = signal.twist * 0.22;
            tiles.forEach((tile, index) => {
              const pulse = Math.max(0, Math.sin(seconds * 1.8 + index * 0.31));
              tile.position.z = pulse * 0.24 * (0.4 + signal.depth);
              tile.scale.setScalar(0.82 + pulse * 0.36 + signal.pulse * 0.08);
            });
          },
        };
      }
      case "route": {
        camera.position.set(0, 0.2, 6.4);
        const tracks = [-0.95, -0.35, 0.28, 0.92].map((y, index) => {
          const points = [
            new THREE.Vector3(-2.1, y, 0),
            new THREE.Vector3(-0.75, y + Math.sin(index) * 0.18, 0.08),
            new THREE.Vector3(0.1, y - 0.28, 0.02),
            new THREE.Vector3(1.25, y + 0.22, 0.1),
            new THREE.Vector3(2.08, y, 0),
          ];
          const line = createPolyline(points, index % 2 === 0 ? colors.phosphor : colors.alarm);
          group.add(line);
          return line;
        });
        const switches = [-1.15, 0.05, 1.18].map((x, index) =>
          addWirePanel(group, 0.38, 0.74, index === 1 ? colors.amber : colors.signal, [x, -0.08 + index * 0.34, 0.18])
        );
        const plug = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.18, 0.72, 16),
          new THREE.MeshBasicMaterial({ color: colors.amber, wireframe: true }),
        );
        plug.rotation.z = Math.PI / 2;
        group.add(plug);
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            const seconds = time * 0.001;
            group.rotation.y = signal.twist * 0.16;
            tracks.forEach((track, index) => {
              track.position.z = Math.sin(seconds * 1.2 + index) * 0.12 * signal.depth;
            });
            switches.forEach((entry, index) => {
              entry.rotation.z = (index - 1) * 0.16 + signal.twist * 0.2;
              entry.scale.y = 1 + signal.pulse * 0.12;
            });
            plug.position.x = -1.8 + ((seconds * (0.38 + signal.pulse * 0.28)) % 3.6);
            plug.position.y = Math.sin(seconds * 1.1) * 0.34;
          },
        };
      }
      case "topology": {
        camera.position.set(0, 0.1, 6.4);
        const positions = [
          [-1.75, 0.85, 0.12],
          [-0.95, 0.12, -0.05],
          [-1.45, -0.78, 0.18],
          [0.0, 0.72, 0.08],
          [0.28, -0.18, 0.22],
          [0.98, -0.88, -0.02],
          [1.4, 0.36, 0.16],
          [1.82, 1.0, -0.04],
        ] as const;
        const nodes = positions.map(([x, y, z], index) => {
          const node = createTopologyNode(
            index % 3 === 0 ? colors.amber : colors.phosphor,
            index % 4 === 0 ? 0.13 : 0.1,
          );
          node.position.set(x, y, z);
          group.add(node);
          return node;
        });
        const links = [
          [0, 1],
          [1, 2],
          [1, 3],
          [3, 4],
          [4, 5],
          [4, 6],
          [6, 7],
          [2, 5],
        ].map(([a, b], index) => {
          const link = createPolyline(
            [
              new THREE.Vector3(...positions[a]),
              new THREE.Vector3(...positions[b]),
            ],
            index % 3 === 0 ? colors.alarm : colors.signal,
          );
          group.add(link);
          return link;
        });
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            const seconds = time * 0.001;
            group.rotation.y = signal.twist * 0.2;
            group.rotation.x = signal.lift * 0.1;
            nodes.forEach((node, index) => {
              const pulse = Math.max(0, Math.sin(seconds * 2.2 + index * 0.7));
              node.scale.setScalar(0.8 + pulse * 0.45 + signal.pulse * 0.12);
              node.position.z = positions[index]![2] + pulse * 0.18 * signal.depth;
            });
            links.forEach((link, index) => {
              link.position.z = Math.sin(seconds * 1.3 + index) * 0.05 * signal.depth;
            });
          },
        };
      }
      case "command": {
        camera.position.set(0, 0.45, 7.0);
        const wall = [-1.55, -0.5, 0.55, 1.55].map((x, index) => {
          const panel = addWirePanel(group, 0.9, 1.78, index % 2 === 0 ? colors.signal : colors.phosphor, [x, 0.35, 0]);
          panel.rotation.y = (x / 1.55) * -0.24;
          return panel;
        });
        const redBlocks: THREE.Mesh[] = new Array(9);
        for (let index = 0; index < redBlocks.length; index++) {
          const x = -1.75 + (index % 3) * 1.12 + (index > 5 ? 0.22 : 0);
          const y = 0.92 - Math.floor(index / 3) * 0.62;
          const block = addSolidBox(group, 0.28 + (index % 2) * 0.14, 0.22, 0.08, colors.alarm, [x, y, 0.22], 0.88);
          block.rotation.z = index % 2 === 0 ? 0.08 : -0.18;
          redBlocks[index] = block;
        }
        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(5.2, 2.4, 4, 2),
          new THREE.MeshBasicMaterial({ color: colors.violet, wireframe: true, transparent: true, opacity: 0.35 }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -1.12;
        floor.position.z = 0.5;
        group.add(floor);
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            const seconds = time * 0.001;
            group.rotation.y = signal.twist * 0.12;
            wall.forEach((panel, index) => {
              panel.scale.y = 1 + signal.depth * 0.06 + Math.sin(seconds * 0.9 + index) * 0.02;
            });
            redBlocks.forEach((block, index) => {
              block.position.z = 0.22 + Math.max(0, Math.sin(seconds * 1.7 + index)) * 0.12;
              block.scale.setScalar(1 + signal.pulse * 0.05);
            });
            floor.rotation.z = signal.twist * 0.08;
          },
        };
      }
      case "launch": {
        camera.position.set(0, 0.4, 6.8);
        const shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(0.86, 1.08, 3.2, 36, 4, true),
          new THREE.MeshBasicMaterial({ color: colors.signal, wireframe: true, transparent: true, opacity: 0.85 }),
        );
        shaft.rotation.x = Math.PI / 2;
        group.add(shaft);
        const plug = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.34, 2.6, 24, 2, false),
          new THREE.MeshBasicMaterial({ color: colors.alarm, wireframe: true }),
        );
        plug.rotation.x = Math.PI / 2;
        group.add(plug);
        const rails = [-1.35, -0.78, 0.78, 1.35].map((x) =>
          createPolyline([new THREE.Vector3(x, -1.65, 0.3), new THREE.Vector3(x, 1.65, -0.3)], colors.amber)
        );
        group.add(...rails);
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            tickBase(time);
            shaft.rotation.z = time * 0.00035 + signal.twist * 0.25;
            plug.position.y = signal.lift * 0.55;
            plug.scale.setScalar(1 + signal.pulse * 0.1);
            rails.forEach((rail, index) => {
              rail.position.z = Math.sin(time * 0.001 + index) * 0.12 * signal.depth;
            });
          },
        };
      }
      case "magi": {
        camera.position.set(0, 0.25, 6.3);
        const panels = [
          addWirePanel(group, 1.52, 2.1, colors.alarm, [-1.42, 0.08, 0]),
          addWirePanel(group, 1.52, 2.1, colors.signal, [0, 0.08, 0.1]),
          addWirePanel(group, 1.52, 2.1, colors.phosphor, [1.42, 0.08, 0]),
        ];
        const nodes: THREE.Mesh[] = new Array(18);
        for (let index = 0; index < nodes.length; index++) {
          const node = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, 0.1, 0.04),
            new THREE.MeshBasicMaterial({ color: index % 3 === 0 ? colors.amber : colors.phosphor }),
          );
          node.position.set((index % 6 - 2.5) * 0.42, 1.1 - Math.floor(index / 6) * 0.45, 0.2);
          group.add(node);
          nodes[index] = node;
        }
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            group.rotation.y = signal.twist * 0.32;
            group.rotation.x = signal.lift * 0.12;
            panels.forEach((panel, index) => {
              panel.rotation.y = (index - 1) * 0.18 + signal.twist * 0.16;
              panel.scale.y = 1 + signal.depth * 0.12 * (index + 1);
            });
            nodes.forEach((node, index) => {
              node.scale.x = 0.5 + ((Math.sin(time * 0.002 + index) + 1) / 2) * (0.5 + signal.pulse);
            });
          },
        };
      }
      case "target": {
        camera.position.set(0, 0.05, 6.1);
        const reticles = [0.72, 1.18, 1.62].map((radius, index) => {
          const reticle = createReticle([colors.phosphor, colors.amber, colors.alarm][index], radius);
          reticle.rotation.x = Math.PI / 2;
          group.add(reticle);
          return reticle;
        });
        const target = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.42, 0),
          new THREE.MeshBasicMaterial({ color: colors.signal, wireframe: true }),
        );
        group.add(target);
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            group.rotation.y = signal.twist * 0.38;
            reticles.forEach((reticle, index) => {
              reticle.rotation.z = time * 0.00035 * (index + 1) * (index % 2 === 0 ? 1 : -1);
              reticle.scale.setScalar(1 + signal.depth * 0.08 * (index + 1));
            });
            target.position.set((signal.x - 0.5) * 1.8, (0.5 - signal.y) * 1.2, signal.pulse * 0.35);
            target.rotation.y = time * 0.0011;
          },
        };
      }
      case "waveform": {
        camera.position.set(0, 0, 6.4);
        const ribbons = [colors.signal, colors.alarm, colors.amber].map((color, index) => {
          const ribbon = createWaveRibbon(color);
          ribbon.position.y = (index - 1) * 0.55;
          group.add(ribbon);
          return ribbon;
        });
        const grid = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.PlaneGeometry(4.6, 2.4, 12, 6)),
          neonLine(colors.violet),
        );
        grid.rotation.x = 0.08;
        group.add(grid);
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            group.rotation.x = signal.lift * 0.16;
            group.rotation.y = signal.twist * 0.24;
            ribbons.forEach((ribbon, index) => {
              ribbon.position.x = Math.sin(time * 0.0014 + index) * 0.38;
              ribbon.scale.y = 0.8 + signal.pulse * (0.4 + index * 0.18);
              ribbon.rotation.z = Math.sin(time * 0.0009 + index) * 0.12;
            });
          },
        };
      }
      case "angel": {
        camera.position.set(0, 0.15, 6.5);
        const core = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.7, 1),
          new THREE.MeshBasicMaterial({ color: colors.alarm, wireframe: true }),
        );
        group.add(core);
        const helixA = createHelix(colors.signal, 0.55, 2.7, 3.4);
        const helixB = createHelix(colors.amber, 0.9, 1.7, 3.2);
        helixA.rotation.z = Math.PI / 2;
        helixB.rotation.z = Math.PI / 2;
        const wings = [-1, 1].map((side) => {
          const wing = createPolyline(
            [
              new THREE.Vector3(0.25 * side, -0.4, 0),
              new THREE.Vector3(1.05 * side, 0.1, 0.18),
              new THREE.Vector3(1.55 * side, 0.82, -0.1),
              new THREE.Vector3(0.68 * side, 0.48, 0.22),
            ],
            colors.phosphor,
          );
          group.add(wing);
          return wing;
        });
        group.add(helixA, helixB);
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            tickBase(time);
            core.rotation.x = time * 0.0008 + signal.lift * 0.5;
            core.rotation.y = time * 0.001 + signal.twist;
            core.scale.setScalar(1 + signal.pulse * 0.22);
            helixA.rotation.y = time * 0.0009;
            helixB.rotation.x = time * 0.0007;
            wings.forEach((wing, index) => {
              wing.rotation.z = (index === 0 ? 1 : -1) * (0.18 + signal.depth * 0.22);
            });
          },
        };
      }
      case "gate": {
        camera.position.set(0, 0.15, 6.0);
        const gates: THREE.Mesh[] = new Array(8);
        for (let index = 0; index < gates.length; index++) {
          const gate = addPanel(
            group,
            0.34,
            2.8,
            index % 2 === 0 ? colors.signal : colors.alarm,
            [(index - 3.5) * 0.42, 0, 0],
            0.86,
          );
          gates[index] = gate;
        }
        const clamps = [-1.72, 1.72].map((x) => addWirePanel(group, 0.44, 3.25, colors.amber, [x, 0, 0.18]));
        return {
          tick: (time: number, signal: ThreeSceneSignal) => {
            group.rotation.y = signal.twist * 0.2;
            gates.forEach((gate, index) => {
              const open = Math.sin(time * 0.0012 + index * 0.65) * 0.18 + signal.depth * 0.16;
              gate.position.x = (index - 3.5) * 0.42 + (index < 4 ? -open : open);
              gate.scale.y = 1 + signal.pulse * 0.12;
            });
            clamps.forEach((clamp, index) => {
              clamp.position.x = (index === 0 ? -1.72 : 1.72) + (index === 0 ? -signal.depth : signal.depth) * 0.14;
            });
          },
        };
      }
    }
  })();

  addAsciiWireOverlays(scene, options.wireframeThickness ?? 2);

  return {
    scene,
    camera,
    tick: bundle.tick,
    dispose: () => releaseScene(scene),
  };
}

function releaseScene(root: THREE.Object3D) {
  // ThreeAsciiObject tears down its renderer first. Disposing WebGPU-backed
  // materials after that triggers a Three.js NodeManager crash during layout
  // switches, so we only detach the graph and let GC reclaim the scene objects.
  root.clear();
}
