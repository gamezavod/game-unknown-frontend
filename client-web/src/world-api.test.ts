import { expect, test } from "vitest";
import { hexKey } from "./hex";
import type { Cell } from "./map-data";
import { renderCells } from "./world-api";

test("открытый участок заменяет туман без дубликата координат", () => {
  const home: Cell = { q: 0, r: 0, type: "grass", state: "visible", height: 1.45 };
  const revealed: Cell = { q: 1, r: 0, type: "river", state: "visible", height: 0.04 };
  const initial = { serverSavedAt: 1, cells: [home], saplings: [] };
  expect(renderCells(initial).find((cell) => hexKey(cell) === "1,0")?.type).toBe("fog");

  const updated = renderCells({
    ...initial,
    cells: [home, revealed],
    saplings: [{ q: 0, r: 0, plantedAt: 100, growthDurationMs: 60000 }],
  });
  expect(updated.filter((cell) => hexKey(cell) === "1,0")).toEqual([revealed]);
  expect(new Set(updated.map(hexKey)).size).toBe(updated.length);
  expect(updated.find((cell) => hexKey(cell) === "2,0")?.state).toBe("unexplored");
  expect(updated[0]).toMatchObject({ type: "grass", sapling: true });
  expect(home.sapling).toBeUndefined();
});
