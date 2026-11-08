import { expect, test } from "vitest";
import { demoMapSource } from "./map-data";
import { forestLayout, mountainLayout } from "./scenery";

test("лес имеет просветы и разные размеры рощ, без изменений исходных клеток", async () => {
  const cells = await demoMapSource.load(),
    before = JSON.stringify(cells);
  const groves = cells.filter((c) => c.type === "forest").map(forestLayout);
  expect(new Set(groves.map((g) => g.length)).size).toBeGreaterThan(2);
  const trees = groves.flat();
  expect(
    Math.max(...trees.map((t) => t.scale)) -
      Math.min(...trees.map((t) => t.scale)),
  ).toBeGreaterThan(0.4);
  expect(trees.every((t) => Math.hypot(t.x, t.z) < 1)).toBe(true);
  expect(JSON.stringify(cells)).toBe(before);
});

test("горные группы имеют главную вершину и разные масштабы", async () => {
  const cells = await demoMapSource.load(),
    before = JSON.stringify(cells),
    mountains = mountainLayout(cells, 1.25);
  const scales = [...mountains.values()]
    .map((p) => p.scale)
    .sort((a, b) => b - a);
  expect(mountains.size).toBe(
    cells.filter((c) => c.type === "rock" && c.state === "visible").length,
  );
  expect(scales[0] - scales[1]).toBeGreaterThan(0.2);
  expect(scales[0] - scales.at(-1)!).toBeGreaterThan(0.8);
  expect(JSON.stringify(cells)).toBe(before);
});
