import { expect, test } from "vitest";
import * as T from "three";
import { demoMapSource, mapBounds } from "./map-data";
import { fogDensityAt, fogFrontAtX, northernFogRegion } from "./northern-fog";
import { cameraPanBounds, fitIslandCamera } from "./camera";

test("северный туман закрывает землю и высокие объекты, юг остаётся ясным", async () => {
  const cells = await demoMapSource.load(),
    r = northernFogRegion(cells, 1.25, 28);
  for (const height of [0, 2, 5])
    expect(
      fogDensityAt(r, new T.Vector3(0, height, r.opaqueZ - 2)),
    ).toBeGreaterThan(0.8);
  expect(fogDensityAt(r, new T.Vector3(0, 3, r.frontZ + 3))).toBe(0);
  const edge = [-10, -4, 0, 5, 11].map((x) => fogFrontAtX(r, x));
  expect(Math.max(...edge) - Math.min(...edge)).toBeGreaterThan(0.8);
});

test("туман переносится вместе с картой по Z, без привязки к кадру", async () => {
  const cells = await demoMapSource.load(),
    original = northernFogRegion(cells, 1.25, 28);
  const moved = northernFogRegion(
    cells.map((c) => ({ ...c, r: c.r + 10 })),
    1.25,
    28,
  );
  const shift = 10 * 1.25 * 1.5;
  expect(moved.frontZ - original.frontZ).toBeCloseTo(shift);
  expect(
    fogDensityAt(original, new T.Vector3(2, 3, original.frontZ - 2)),
  ).toBeCloseTo(
    fogDensityAt(moved, new T.Vector3(2, 3, original.frontZ - 2 + shift)),
  );
});

for (const zoom of [1, 0.5])
  test(`северный предел камеры допускает полностью закрытый туманом кадр при zoom ${zoom}`, async () => {
    const cells = await demoMapSource.load(),
      map = mapBounds(cells, 1.25),
      fog = northernFogRegion(cells, 1.25, 28);
    const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    const target = fitIslandCamera(
      camera,
      new T.Box3(new T.Vector3(-14, -0.2, -11), new T.Vector3(14, 6, 11)),
      390,
      844,
    );
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    const limits = cameraPanBounds(camera, target, map, fog);
    const offset = limits.minZ - target.z;
    camera.position.z += offset;
    target.z += offset;
    camera.updateMatrixWorld(true);
    const ray = camera.getWorldDirection(new T.Vector3());
    for (const x of [-1, 0, 1])
      for (const y of [-1, 0, 1]) {
        const p = new T.Vector3(x, y, 0).unproject(camera);
        p.addScaledVector(ray, (fog.topY - 1.5 - p.y) / ray.y);
        expect(fogDensityAt(fog, p)).toBeGreaterThan(0.9);
      }
  });
