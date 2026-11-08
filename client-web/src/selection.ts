import type { Ray } from "three";
import type { FogRegion } from "./northern-fog";
import { fogOpacityAlongRay } from "./fog-sampling";
import type { Cell } from "./map-data";

export function canSelectCell(
  cells: readonly Cell[],
  index: unknown,
): index is number {
  return (
    typeof index === "number" &&
    Number.isInteger(index) &&
    index >= 0 &&
    index < cells.length &&
    cells[index].state === "visible"
  );
}
/** Значения списка — исходные индексы, фильтрация не перенумеровывает карту. */
export function selectableCellIndices(cells: readonly Cell[]) {
  return cells.flatMap((_, index) =>
    canSelectCell(cells, index) ? [index] : [],
  );
}
export function createCellSelection(
  cells: readonly Cell[],
  onSelect: (index: number, cell: Cell) => void,
) {
  let selectedIndex: number | undefined;
  return {
    get selectedIndex() {
      return selectedIndex;
    },
    select(index: unknown) {
      if (!canSelectCell(cells, index)) return false;
      selectedIndex = index;
      onSelect(index, cells[index]);
      return true;
    },
  };
}

export function canPickCell(
  cells: readonly Cell[],
  index: unknown,
  ray: Ray,
  distance: number,
  fog: FogRegion,
  time = 0,
) {
  return (
    canSelectCell(cells, index) &&
    fogOpacityAlongRay(ray, distance, fog, time) < 0.35
  );
}
