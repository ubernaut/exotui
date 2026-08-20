// Copyright 2023 Im-Beast. MIT license.

// Scenes promoted from the neon Three.js demos, with the data put back.
//
// Those scenes are driven by a pointer signal — `{x, y, depth, twist, lift,
// pulse}` — and a phase counter: the map slab's height field is
// `sin(x) * cos(y)`, not a reading of anything. What carries over is the form.
// Each of these keeps the shape and the look and takes its geometry from a
// stream instead.
//
// Geometry is rebuilt only when the data changes shape. A monitor pushes a new
// reading of the same size sixty times a second, and allocating a mesh per
// frame is how a scene becomes the reason a terminal stutters.

import * as THREE from "three";
import type { Matrix, Volume } from "../data.ts";
import { domainOfAll, normalize, safeDomain } from "../scale.ts";
import { rampGradient } from "../theme.ts";
import { DATA_SCENES, type DataScene, type DataSceneContext, type DataSceneInstance, themeColor } from "./scene.ts";

/** A camera looking down at the origin, framed for a unit-ish scene. */
function observer(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 2.4, 4.2);
  camera.lookAt(0, 0, 0);
  return camera;
}

function litScene(theme: DataSceneContext["theme"]): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(themeColor(theme.foreground), 1.15));
  const key = new THREE.DirectionalLight(themeColor(theme.series), 1.6);
  key.position.set(2.5, 3.5, 2);
  scene.add(key);
  return scene;
}

/** Colours a vertex buffer from the values it was built from. */
function paint(colors: THREE.Float32BufferAttribute, values: readonly number[], context: DataSceneContext): void {
  const domain = safeDomain(context.domain ?? domainOfAll([values]));
  for (let index = 0; index < values.length; index += 1) {
    const [red, green, blue] = rampGradient(context.theme, normalize(values[index] ?? 0, domain));
    colors.setXYZ(index, red / 255, green / 255, blue / 255);
  }
  colors.needsUpdate = true;
}

/**
 * 2d — a matrix as a height field.
 *
 * The map slab, given something to be a map of. Rows and columns of the matrix
 * are the grid; the value is the height and the colour. It answers the question
 * a heatmap answers, with a second channel: a ridge reads as a ridge rather than
 * as a band of a slightly different shade.
 */
export const surfaceScene: DataScene<Matrix> = {
  id: "three-surface",
  label: "Surface (3D)",
  accepts: ["2d", "2dt"],
  // ASCII needs cells to say anything: the same mesh in a twenty-column box is
  // a smudge.
  minimum: { width: 24, height: 12 },
  weight: 1,
  suits: (shape) => (shape.extent?.[1] ?? 0) !== 2,
  create(context) {
    const scene = litScene(context.theme);
    const camera = observer();
    let mesh: THREE.Mesh | undefined;
    let shape = "";

    const build = (rows: number, columns: number) => {
      mesh?.geometry.dispose();
      if (mesh) scene.remove(mesh);
      const geometry = new THREE.PlaneGeometry(2.8, 2.8, Math.max(1, columns - 1), Math.max(1, rows - 1));
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position!.count * 3), 3),
      );
      mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true, transparent: true, opacity: 0.85 }),
      );
      // Laid down and turned, which is what makes a plane read as terrain.
      mesh.rotation.x = -0.95;
      mesh.rotation.z = 0.35;
      scene.add(mesh);
    };

    return {
      scene,
      camera,
      update(matrix, next) {
        const rows = matrix.length;
        const columns = rows === 0 ? 0 : Math.max(...matrix.map((row) => row.length));
        if (rows === 0 || columns === 0) return;
        const key = `${rows}x${columns}`;
        if (key !== shape) {
          shape = key;
          build(rows, columns);
        }
        const positions = mesh!.geometry.attributes.position as THREE.Float32BufferAttribute;
        const flat: number[] = [];
        const domain = safeDomain(next.domain ?? domainOfAll(matrix));
        for (let index = 0; index < positions.count; index += 1) {
          // A plane's vertices run row by row, which is the order the matrix is
          // already in.
          const row = Math.min(rows - 1, Math.floor(index / columns));
          const column = index % columns;
          const value = matrix[row]?.[column] ?? 0;
          flat.push(value);
          positions.setZ(index, normalize(value, domain) * 1.1 - 0.55);
        }
        positions.needsUpdate = true;
        mesh!.geometry.computeVertexNormals();
        paint(mesh!.geometry.attributes.color as THREE.Float32BufferAttribute, flat, next);
      },
      dispose() {
        mesh?.geometry.dispose();
        (mesh?.material as THREE.Material | undefined)?.dispose();
      },
    } satisfies DataSceneInstance<Matrix>;
  },
};

/**
 * 3d — a volume as a lattice of points.
 *
 * The wireframe lattice chamber, filled with something. Every cell that carries
 * a value becomes a point, placed where it sits in the volume and coloured by
 * how much it carries; empty cells are absent rather than dim, because a cube
 * of faint points is a fog that hides whatever is inside it.
 */
export const latticeScene: DataScene<Volume> = {
  id: "three-lattice",
  label: "Lattice (3D)",
  accepts: ["3d", "3dt"],
  minimum: { width: 24, height: 12 },
  weight: 1,
  suits: (shape) => shape.extent?.[2] !== 3,
  create(context) {
    const scene = litScene(context.theme);
    const camera = observer();
    const geometry = new THREE.BufferGeometry();
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, opacity: 0.9 }),
    );
    scene.add(points);

    return {
      scene,
      camera,
      update(volume, next) {
        const domain = safeDomain(next.domain ?? domainOfAll(volume));
        const positions: number[] = [];
        const colors: number[] = [];
        const depths = volume.length;
        for (let z = 0; z < depths; z += 1) {
          const plane = volume[z] ?? [];
          for (let y = 0; y < plane.length; y += 1) {
            const line = plane[y] ?? [];
            for (let x = 0; x < line.length; x += 1) {
              const raw = line[x] ?? 0;
              if (raw <= 0) continue;
              const span = (value: number, of: number) => (of <= 1 ? 0 : (value / (of - 1)) * 2 - 1);
              positions.push(span(x, line.length) * 1.3, span(y, plane.length) * 1.3, span(z, depths) * 1.3);
              const [red, green, blue] = rampGradient(next.theme, normalize(raw, domain));
              colors.push(red / 255, green / 255, blue / 255);
            }
          }
        }
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeBoundingSphere();
      },
      dispose() {
        geometry.dispose();
        (points.material as THREE.Material).dispose();
      },
    } satisfies DataSceneInstance<Volume>;
  },
};

/**
 * 2d — a matrix as a stack of rings.
 *
 * The A.T. field rings, made to carry a reading. Each row of the matrix is a
 * ring and each column a step around it, so the wrap puts the last column next
 * to the first — right for anything periodic, and wrong for anything that is
 * not, which is why it is offered rather than chosen.
 */
export const ringScene: DataScene<Matrix> = {
  id: "three-rings",
  label: "Rings (3D)",
  accepts: ["2d", "2dt"],
  minimum: { width: 24, height: 12 },
  weight: 0.9,
  suits: (shape) => (shape.extent?.[1] ?? 0) !== 2,
  create(context) {
    const scene = litScene(context.theme);
    const camera = observer();
    const group = new THREE.Group();
    scene.add(group);
    let rings: THREE.LineLoop[] = [];
    let shape = "";

    const build = (count: number, steps: number) => {
      for (const ring of rings) {
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
        group.remove(ring);
      }
      rings = Array.from({ length: count }, () => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(steps * 3), 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(steps * 3), 3));
        const loop = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ vertexColors: true }));
        group.add(loop);
        return loop;
      });
    };

    return {
      scene,
      camera,
      update(matrix, next) {
        const count = matrix.length;
        const steps = count === 0 ? 0 : Math.max(...matrix.map((row) => row.length));
        if (count === 0 || steps === 0) return;
        const key = `${count}x${steps}`;
        if (key !== shape) {
          shape = key;
          build(count, steps);
        }
        const domain = safeDomain(next.domain ?? domainOfAll(matrix));
        for (let index = 0; index < count; index += 1) {
          const values = matrix[index] ?? [];
          const loop = rings[index]!;
          const positions = loop.geometry.attributes.position as THREE.Float32BufferAttribute;
          const colors = loop.geometry.attributes.color as THREE.Float32BufferAttribute;
          const axis = count <= 1 ? 0 : (index / (count - 1)) * 2 - 1;
          for (let step = 0; step < steps; step += 1) {
            const heat = normalize(values[step] ?? 0, domain);
            const theta = (step / steps) * Math.PI * 2;
            // A modest wobble: letting the value swing the radius end to end
            // makes every ring a different irregular shape and the stack reads
            // as one tangle.
            const radius = 0.9 + heat * 0.5;
            positions.setXYZ(step, Math.cos(theta) * radius, axis * 1.1, Math.sin(theta) * radius);
            const [red, green, blue] = rampGradient(next.theme, heat);
            colors.setXYZ(step, red / 255, green / 255, blue / 255);
          }
          positions.needsUpdate = true;
          colors.needsUpdate = true;
          loop.geometry.computeBoundingSphere();
        }
      },
      dispose() {
        for (const ring of rings) {
          ring.geometry.dispose();
          (ring.material as THREE.Material).dispose();
        }
      },
    } satisfies DataSceneInstance<Matrix>;
  },
};

DATA_SCENES.push(
  surfaceScene as unknown as DataScene<never>,
  latticeScene as unknown as DataScene<never>,
  ringScene as unknown as DataScene<never>,
);
