import { gameRequest, withGuestWorld } from "./game-api";
import { hexKey, type Axial } from "./hex";
import { parseCells, type Cell } from "./map-data";

interface StoredWorld {
  serverSavedAt: number;
  data: string;
}

interface Sapling extends Axial {
  plantedAt: number;
  growthDurationMs: number;
}

export interface IslandSnapshot {
  serverSavedAt: number;
  cells: Cell[];
  saplings: Sapling[];
}

function readWorld(response: StoredWorld): IslandSnapshot {
  const save = JSON.parse(response.data);
  const progress = save?.progress;
  if (save?.schemaVersion !== 2 || !Number.isFinite(response.serverSavedAt) || !Array.isArray(progress?.saplings)) {
    throw new Error("Сохранение острова не поддерживается");
  }
  const cells = parseCells(progress.world?.cells);
  const saplings = progress.saplings as Sapling[];
  return {
    cells,
    saplings,
    serverSavedAt: response.serverSavedAt,
  };
}

export function renderCells(snapshot: IslandSnapshot): Cell[] {
  const planted = new Set(snapshot.saplings.map(hexKey));
  return snapshot.cells.map((cell) => planted.has(hexKey(cell)) ? { ...cell, sapling: true } : cell);
}

export const worldApi = {
  load() {
    return withGuestWorld(async () => readWorld(await gameRequest<StoredWorld>("/game/progress")));
  },
};
