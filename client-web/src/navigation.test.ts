import { expect, test } from "vitest";
import * as T from "three";
import { demoMapSource } from "./map-data";
import {
  cameraPanBounds,
  fitIslandCamera,
  openIslandNavigation,
  fogScreenFraction,
  southernWaterFraction,
} from "./camera";
import { northernFogRegion } from "./northern-fog";

async function setup(width = 390, height = 844, zoom = 1) {
  const cells = await demoMapSource.load(),
    open = openIslandNavigation(cells, 1.25),
    fog = northernFogRegion(cells, 1.25, 28);
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  const target = fitIslandCamera(
    camera,
    new T.Box3(new T.Vector3(-14, -0.2, -11), new T.Vector3(14, 6, 11)),
    width,
    height,
  );
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
  return { cells, open, fog, camera, target };
}
function move(camera: T.OrthographicCamera, target: T.Vector3, z: number) {
  const delta = z - target.z;
  camera.position.z += delta;
  target.z = z;
  camera.updateMatrixWorld(true);
}

test("пределы открытой области не включают закрытую землю и воду", async () => {
  const { cells } = await setup();
  const open = openIslandNavigation(cells, 1.25);
  const extended = openIslandNavigation(
    [
      ...cells,
      { q: 100, r: -100, height: 1, type: "grass", state: "unexplored" },
      { q: -100, r: 100, height: 0, type: "water", state: "visible" },
    ],
    1.25,
  );
  expect(extended.bounds).toEqual(open.bounds);
  expect(extended.shore).toEqual(open.shore);
});
for (const zoom of [1, 2, 3])
  test(`север и юг ограничены долями кадра при zoom ${zoom}`, async () => {
    const { open, fog, camera, target } = await setup(390, 844, zoom);
    const limits = cameraPanBounds(camera, target, open, fog);
    expect(limits.minZ).toBeLessThanOrEqual(limits.maxZ);
    expect(limits.minX).toBeGreaterThan(open.bounds.min.x);
    expect(limits.maxX).toBeLessThan(open.bounds.max.x);
    if (zoom === 1) expect(limits.constrained).toBe(false);
    if (!limits.constrained) {
      move(camera, target, limits.minZ);
      expect(fogScreenFraction(camera, fog)).toBeLessThan(0.462);
      move(camera, target, limits.maxZ);
      expect(southernWaterFraction(camera, open)).toBeLessThan(0.355);
    }
    expect(limits.minZ).toBeGreaterThanOrEqual(open.bounds.min.z);
    expect(limits.maxZ).toBeLessThanOrEqual(open.bounds.max.z);
  });
for (const [width, height] of [
  [320, 568],
  [844, 390],
  [390, 844],
])
  test(`при отдалении диапазон сжимается, не меняя зум ${width}×${height}`, async () => {
    const { open, fog, camera, target } = await setup(width, height, 0.5);
    const limits = cameraPanBounds(camera, target, open, fog);
    expect(camera.zoom).toBe(0.5);
    expect(limits.minZ).toBeLessThanOrEqual(limits.maxZ);
    expect(limits.maxX - limits.minX).toBeLessThan(
      open.bounds.max.x - open.bounds.min.x,
    );
    if (limits.constrained) expect(limits.minZ).toBe(limits.maxZ);
  });

test("быстрый боковой жест рассчитывает север/юг после бокового ограничения, не сдвигая камеру сам", async () => {
  const { open, fog, camera, target } = await setup(390, 844, 2);
  const normal = cameraPanBounds(camera, target, open, fog);
  const delta = normal.maxX - target.x;
  target.x = normal.maxX;
  camera.position.x += delta;
  camera.updateMatrixWorld(true);
  const edge = cameraPanBounds(camera, target, open, fog);
  target.x += 100;
  camera.position.x += 100;
  camera.updateMatrixWorld(true);
  const before = camera.position.clone(),
    overshoot = cameraPanBounds(camera, target, open, fog);
  expect(overshoot.minZ).toBeCloseTo(edge.minZ);
  expect(overshoot.maxZ).toBeCloseTo(edge.maxZ);
  expect(camera.position).toEqual(before);
});
