import { gameRequest, withGuestWorld } from "./game-api";
import { hexNeighbors, hexKey, type Axial } from "./hex";
import { parseCells, type Cell } from "./map-data";

export type ForestAction = "chopForest" | "plantForest";

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
  activeSite?: Axial;
}

function readWorld(response: StoredWorld): IslandSnapshot {
  const save = JSON.parse(response.data);
  const progress = save?.progress;
  if (save?.schemaVersion !== 2 || !Number.isFinite(response.serverSavedAt) || !Array.isArray(progress?.saplings)) {
    throw new Error("Сохранение острова не поддерживается");
  }
  const cells = parseCells(progress.world?.cells);
  const saplings = progress.saplings as Sapling[];
  const activeSite = progress.activeExcavation && progress.excavationSites.find(
    (site: Axial & { id: string }) => site.id === progress.activeExcavation.siteId,
  );
  return {
    cells,
    saplings,
    serverSavedAt: response.serverSavedAt,
    activeSite: activeSite ? { q: activeSite.q, r: activeSite.r } : undefined,
  };
}

/** API хранит только открытые клетки. Прибрежный ряд тумана строится для отображения. */
export function renderCells(snapshot: IslandSnapshot): Cell[] {
  const occupied = new Set(snapshot.cells.map(hexKey));
  const fog: Cell[] = [];
  for (const cell of snapshot.cells) {
    for (const position of hexNeighbors(cell)) {
      const key = hexKey(position);
      if (occupied.has(key)) continue;
      occupied.add(key);
      fog.push({ ...position, height: 0.12, type: "fog", state: "unexplored" });
    }
  }
  const planted = new Set(snapshot.saplings.map(hexKey));
  return [...snapshot.cells.map((cell) => planted.has(hexKey(cell)) ? { ...cell, sapling: true } : cell), ...fog];
}

export const worldApi = {
  load() {
    return withGuestWorld(async () => readWorld(await gameRequest<StoredWorld>("/game/progress")));
  },
  async forest(type: ForestAction, { q, r }: Axial, expectedServerSavedAt: number) {
    return readWorld(await gameRequest<StoredWorld>("/game/actions", {
      action: { type, position: { q, r } },
      expectedServerSavedAt,
    }));
  },
};
