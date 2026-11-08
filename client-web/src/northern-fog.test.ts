import { expect, test } from "vitest";
import * as T from "three";
import { demoMapSource } from "./map-data";
import { fogDensityAt, fogFrontAtX, northernFogRegion } from "./northern-fog";

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
