import { expect, test } from "vitest";
import { hexKey } from "./hex";
import type { Cell } from "./map-data";
import { canSelectCell } from "./selection";
import { renderCells } from "./world-api";

test("туман не добавляет геометрию закрытых клеток, открытые участки рисуются один раз", () => {
  const home: Cell = { q: 0, r: 0, type: "grass", state: "visible", height: 1.45 };
  const revealed: Cell = { q: 1, r: 0, type: "river", state: "visible", height: 0.04 };
  const initial = { serverSavedAt: 1, cells: [home], saplings: [] };
  expect(renderCells(initial)).toEqual([home]);

  const updated = renderCells({
    ...initial,
    cells: [home, revealed],
    saplings: [{ q: 0, r: 0, plantedAt: 100, growthDurationMs: 60000 }],
  });
  expect(updated.filter((cell) => hexKey(cell) === "1,0")).toEqual([revealed]);
  expect(new Set(updated.map(hexKey)).size).toBe(updated.length);
  expect(updated).toHaveLength(2);
  expect(updated[0]).toMatchObject({ type: "grass", sapling: true });
  expect(home.sapling).toBeUndefined();
});

test("силуэт становится открытой клеткой без дубликата или доступа раньше времени", () => {
  const home: Cell = { q: 0, r: 0, type: "grass", state: "visible", height: 1.45 };
  const preview: Cell = { q: 1, r: 0, type: "forest", state: "unexplored", height: 1.45 };
  const initial = { serverSavedAt: 1, cells: [home], saplings: [], fogPreview: [preview] };
  const framed = renderCells(initial);
  expect(framed).toEqual([home, preview]);
  expect(canSelectCell(framed, 1)).toBe(false);

  const opened: Cell = { ...preview, state: "visible" };
  const expanded = renderCells({ ...initial, cells: [home, opened] });
  expect(expanded).toEqual([home, opened]);
  expect(canSelectCell(expanded, 1)).toBe(true);
});
