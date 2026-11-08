import { expect, test, vi } from "vitest";
import * as T from "three";
import type { Cell } from "./map-data";
import {
  canSelectCell,
  canPickCell,
  createCellSelection,
  selectableCellIndices,
} from "./selection";
const cells: Cell[] = [
  { q: 0, r: 0, height: 1, type: "grass", state: "visible" },
  { q: 0, r: -1, height: 1, type: "forest", state: "unexplored" },
  { q: 1, r: 0, height: 1, type: "coast", state: "visible" },
];

test("сам выбор отвергает закрытую клетку и сохраняет предыдущий выбор и UI", () => {
  const onSelect = vi.fn(),
    selection = createCellSelection(cells, onSelect);
  expect(selection.select(0)).toBe(true);
  expect(selection.select(1)).toBe(false);
  expect(selection.selectedIndex).toBe(0);
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(selection.select(2)).toBe(true);
  expect(selection.selectedIndex).toBe(2);
});
test("ошибочный индекс не сбрасывает выделение", () => {
  const callback = vi.fn(),
    selection = createCellSelection(cells, callback);
  selection.select(2);
  for (const index of [-1, 3, NaN, Infinity, 1.5, "0", null, undefined])
    expect(selection.select(index)).toBe(false);
  expect(selection.selectedIndex).toBe(2);
  expect(callback).toHaveBeenCalledTimes(1);
});
test("список Участки содержит только открытые клетки и исходные индексы", () => {
  expect(selectableCellIndices(cells)).toEqual([0, 2]);
  expect(
    selectableCellIndices(cells.map((c) => ({ ...c, state: "unexplored" }))),
  ).toEqual([]);
  expect(canSelectCell(cells, 1)).toBe(false);
});
test("тап по туману не выбирает даже открытую клетку за ним", () => {
  const fog = { frontZ: 0, transition: 3, bottomY: -1, topY: 10, opaqueZ: -5 };
  const hiddenRay = new T.Ray(
    new T.Vector3(0, 30, -10),
    new T.Vector3(0, -1, 0),
  );
  const clearRay = new T.Ray(new T.Vector3(0, 30, 10), new T.Vector3(0, -1, 0));
  expect(canPickCell(cells, 0, hiddenRay, 30, fog)).toBe(false);
  expect(canPickCell(cells, 0, clearRay, 30, fog)).toBe(true);
  expect(canPickCell(cells, 1, clearRay, 30, fog)).toBe(false);
  // Ближний объект перед объёмом остаётся доступным.
  expect(canPickCell(cells, 0, hiddenRay, 5, fog)).toBe(true);
});
