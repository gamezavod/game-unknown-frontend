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
          expect(Math.abs(point.x)).toBeLessThan(0.92);
          expect(Math.abs(point.y)).toBeLessThan(0.92);
          expect(Math.abs(point.z)).toBeLessThan(1);
        }
  });
}
