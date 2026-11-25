import { gameRequest, withGuestWorld } from "./game-api";
import { hexKey, type Axial } from "./hex";
import { parseCells, type Cell } from "./map-data";

interface StoredWorld {
  serverSavedAt: number;
  data: string;
  fogPreview?: unknown;
}

interface Sapling extends Axial {
  plantedAt: number;
  growthDurationMs: number;
}

export interface IslandSnapshot {
  serverSavedAt: number;
  cells: Cell[];
  saplings: Sapling[];
  fogPreview?: Cell[];
  generatorVersion?: number;
}

function readWorld(response: StoredWorld): IslandSnapshot {
  const save = JSON.parse(response.data);
  const progress = save?.progress;
  if (save?.schemaVersion !== 2 || !Number.isFinite(response.serverSavedAt) || !Array.isArray(progress?.saplings)) {
    throw new Error("Сохранение острова не поддерживается");
  }
  const cells = parseCells(progress.world?.cells);
  const saplings = progress.saplings as Sapling[];
  const fogPreview = response.fogPreview === undefined ? undefined : parseCells(response.fogPreview, true);
  if (fogPreview?.some((cell) => cell.state !== "unexplored" || cell.building || cell.type === "fog" || cell.type === "water")) {
    throw new Error("Неверные данные о границе тумана");
  }
  return {
    cells,
    saplings,
    fogPreview,
    generatorVersion: progress.world.generatorVersion,
    serverSavedAt: response.serverSavedAt,
  };
}

/** Силуэты относятся к сцене и не входят в сохранённую территорию. */
export function renderCells(snapshot: IslandSnapshot): Cell[] {
  const planted = new Set(snapshot.saplings.map(hexKey));
  const opened = new Set(snapshot.cells.map(hexKey));
  return [
    ...snapshot.cells.map((cell) => planted.has(hexKey(cell)) ? { ...cell, sapling: true } : cell),
    ...(snapshot.fogPreview ?? []).filter((cell) => !opened.has(hexKey(cell))),
  ];
}

export const worldApi = {
  load() {
    return withGuestWorld(async () => readWorld(await gameRequest<StoredWorld>("/game/progress")));
  },
};
