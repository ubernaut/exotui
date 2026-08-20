// Copyright 2023 Im-Beast. MIT license.

// The Three.js-backed visualisations. Geometry is built from data without a
// renderer, which is exactly the part worth testing: whether the scene is a
// picture of the numbers, or a decoration that ignores them.

import { assert, assertEquals } from "./deps.ts";
import type { BufferAttribute, Group, Mesh, Object3D, Points } from "three";
import { defaultVisualizationTheme } from "../src/viz/theme.ts";
import { fitDataScenes, latticeScene, ringScene, surfaceScene, themeColor } from "../src/viz/three/mod.ts";

const CONTEXT = { theme: defaultVisualizationTheme(), domain: { min: 0, max: 1 } };

function childWhere(scene: { children: readonly Object3D[] }, is: (child: Object3D) => boolean): Object3D {
  const found = scene.children.find(is);
  if (!found) throw new Error("the scene never added the object under test");
  return found;
}

function meshOf(scene: { children: readonly Object3D[] }): Mesh {
  return childWhere(scene, (child) => (child as Mesh).isMesh) as Mesh;
}

function attribute(geometry: Mesh["geometry"], name: string): BufferAttribute {
  return geometry.attributes[name] as BufferAttribute;
}

Deno.test("a height field has a vertex per cell of the matrix", () => {
  const instance = surfaceScene.create(CONTEXT);
  instance.update(Array.from({ length: 12 }, () => new Array(18).fill(0.5)), CONTEXT);
  assertEquals(attribute(meshOf(instance.scene).geometry, "position").count, 12 * 18);
  // A differently shaped reading rebuilds rather than writing past the end.
  instance.update(Array.from({ length: 5 }, () => new Array(7).fill(0.5)), CONTEXT);
  assertEquals(attribute(meshOf(instance.scene).geometry, "position").count, 5 * 7);
  instance.dispose();
});

Deno.test("the height of a vertex is the value, not a wave", () => {
  // The scene this came from set z to `sin(x) * cos(y)` — the same picture
  // whatever the data. A flat field must be flat and a peak must be a peak.
  const instance = surfaceScene.create(CONTEXT);
  const flat = Array.from({ length: 4 }, () => new Array(4).fill(0.5));
  instance.update(flat, CONTEXT);
  const level = attribute(meshOf(instance.scene).geometry, "position");
  const heights = Array.from({ length: level.count }, (_, index) => level.getZ(index));
  assert(heights.every((height) => Math.abs(height - heights[0]!) < 1e-6), "a flat field is flat");

  const peaked = flat.map((row) => [...row]);
  peaked[2]![2] = 1;
  instance.update(peaked, CONTEXT);
  const raised = attribute(meshOf(instance.scene).geometry, "position");
  const peak = raised.getZ(2 * 4 + 2);
  assert(peak > raised.getZ(0), `the peak should stand above the plain: ${peak} vs ${raised.getZ(0)}`);
  instance.dispose();
});

Deno.test("a lattice draws the cells that carry something and no others", () => {
  const instance = latticeScene.create(CONTEXT);
  const empty = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => new Array(5).fill(0)));
  instance.update(empty, CONTEXT);
  const points = childWhere(instance.scene, (child) => (child as Points).isPoints === true) as Points;
  assertEquals(attribute(points.geometry, "position").count, 0, "an empty volume is empty, not a fog");

  const shell = empty.map((plane, z) =>
    plane.map((line, y) => line.map((_, x) => (Math.abs(Math.hypot(x - 2, y - 2, z - 2) - 1.6) < 0.6 ? 1 : 0)))
  );
  instance.update(shell, CONTEXT);
  const occupied = shell.flat(2).filter((value) => value > 0).length;
  assertEquals(attribute(points.geometry, "position").count, occupied);
  assertEquals(attribute(points.geometry, "color").count, occupied, "a colour per point");
  instance.dispose();
});

Deno.test("a ring stack has a loop per row and closes each one", () => {
  const instance = ringScene.create(CONTEXT);
  instance.update(Array.from({ length: 6 }, () => new Array(24).fill(0.4)), CONTEXT);
  const group = childWhere(instance.scene, (child) => (child as Group).isGroup === true) as Group;
  assertEquals(group.children.length, 6);
  const loop = group.children[0] as Mesh;
  assertEquals(attribute(loop.geometry, "position").count, 24);
  // A LineLoop joins its last point to its first, which is what makes the wrap
  // put the last column beside the first.
  assertEquals((loop as unknown as { isLineLoop?: boolean }).isLineLoop, true);
  instance.dispose();
});

Deno.test("scenes are ranked by the same rules as the cell renderers", () => {
  const roomy = { width: 60, height: 24 };
  assertEquals(fitDataScenes({ kind: "2d", extent: [12, 18] }, roomy).map((fit) => fit.id), [
    "three-surface",
    "three-rings",
  ]);
  assertEquals(fitDataScenes({ kind: "3d", extent: [8, 8, 8] }, roomy).map((fit) => fit.id), ["three-lattice"]);
  // ASCII needs cells to say anything, so a small box is offered nothing.
  assertEquals(fitDataScenes({ kind: "2d", extent: [12, 18] }, { width: 16, height: 6 }).length, 0);
  // And a shape a scene cannot read is not offered it: a matrix of pairs is a
  // scatter, not a height field.
  assertEquals(fitDataScenes({ kind: "2d", extent: [50, 2] }, roomy).length, 0);
});

Deno.test("a theme colour survives the trip to Three.js", () => {
  assertEquals(themeColor([255, 0, 0]), 0xff0000);
  assertEquals(themeColor([0, 128, 255]), 0x0080ff);
});
