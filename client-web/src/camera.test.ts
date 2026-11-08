import { expect, test } from "vitest";
import * as T from "three";
import { fitIslandCamera } from "./camera";

// Включаем высокие здания и карту вдали от начала координат.
const bounds = new T.Box3(
  new T.Vector3(110, -0.2, -70),
  new T.Vector3(132, 5, -51),
);
for (const [width, height] of [
  [1440, 1000],
  [390, 844],
  [844, 390],
  [320, 568],
]) {
  test(`остров целиком вписан с водой вокруг на экране ${width}×${height}`, () => {
    const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    camera.zoom = 3;
    const center = fitIslandCamera(camera, bounds, width, height);
    expect(center).toEqual(bounds.getCenter(new T.Vector3()));
    expect(camera.zoom).toBe(1);
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const point = new T.Vector3(x, y, z).project(camera);
          expect(Math.abs(point.x)).toBeLessThan(0.98);
          expect(Math.abs(point.y)).toBeLessThan(0.98);
          expect(Math.abs(point.z)).toBeLessThan(1);
        }
  });
}

test("неровный остров занимает почти всю ширину портретного кадра и смещён ниже центра", () => {
  const points = [
    [-12, 0, -4],
    [8, 0, -5],
    [14, 0, 0],
    [10, 0, 6],
    [-11, 0, 5],
    [0, 5, 0],
  ].map((p) => new T.Vector3(...(p as [number, number, number])));
  const box = new T.Box3().setFromPoints(points);
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  fitIslandCamera(camera, box, 390, 844, points);
  const projected = points.map((p) => p.clone().project(camera));
  const minX = Math.min(...projected.map((p) => p.x)),
    maxX = Math.max(...projected.map((p) => p.x));
  expect(maxX - minX).toBeGreaterThan(1.9);
  expect(minX).toBeGreaterThan(-1);
  expect(maxX).toBeLessThan(1);
  const centerY =
    (Math.min(...projected.map((p) => p.y)) +
      Math.max(...projected.map((p) => p.y))) /
    2;
  expect(centerY).toBeLessThan(-0.08);
});
