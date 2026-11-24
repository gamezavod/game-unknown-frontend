import fixture from "./data/cells.json";
import { axialToWorld, type Axial } from "./hex";

export const terrainNames = {
  grass: "Луг",
  forest: "Лес",
  rock: "Горы",
  coast: "Побережье",
  water: "Вода",
  river: "Река",
  fog: "Неисследованный участок",
};
export const buildingNames = {
  townHall: "Ратуша",
  home: "Дом",
  lumbermill: "Лесопилка",
  farm: "Ферма",
  warehouse: "Склад",
};
export type Terrain = keyof typeof terrainNames;
export const isWaterTerrain = (type: Terrain) => type === "water" || type === "river";
export type Building = keyof typeof buildingNames;
export interface Cell extends Axial {
  type: Terrain;
  /** Высота верхней поверхности над уровнем моря, в единицах сцены. */
  height: number;
  state: "visible" | "unexplored";
  rotation?: number;
  /** Вариант декоративной модели (0–2), без влияния на механику. */
  variant?: number;
  building?: Building;
  /** Признак посадки для рендера, ландшафт до роста остаётся лугом. */
  sapling?: boolean;
}
export interface MapSource {
  load(): Promise<Cell[]>;
}
export const demoMapSource: MapSource = {
  async load() {
    return parseCells(fixture);
  },
};
/** Точка подключения API: источник возвращает тот же массив DTO, что и fixture. */
export function httpMapSource(url: string): MapSource {
  return {
    async load() {
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Ошибка карты: HTTP ${response.status}`);
      return parseCells(await response.json());
    },
  };
}
export function parseCells(value: unknown): Cell[] {
  if (!Array.isArray(value) || !value.length)
    throw new Error("Карта должна содержать клетки");
  const coordinates = new Set<string>();
  return value.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") throw new Error("Неверная клетка");
    const c = raw as Record<string, unknown>;
    if (
      !Number.isSafeInteger(c.q) ||
      !Number.isSafeInteger(c.r) ||
      typeof c.type !== "string" ||
      !Object.hasOwn(terrainNames, c.type) ||
      typeof c.height !== "number" ||
      !Number.isFinite(c.height) ||
      c.height < 0 ||
      (c.state !== "visible" && c.state !== "unexplored") ||
      (c.variant !== undefined &&
        (!Number.isInteger(c.variant) ||
          Number(c.variant) < 0 ||
          Number(c.variant) > 2)) ||
      (c.rotation !== undefined &&
        (typeof c.rotation !== "number" || !Number.isFinite(c.rotation))) ||
      (c.building !== undefined &&
        (typeof c.building !== "string" ||
          !Object.hasOwn(buildingNames, c.building)))
    ) {
      throw new Error("Неверные данные клетки");
    }
    const key = `${c.q},${c.r}`;
    if (coordinates.has(key)) throw new Error(`Повтор координат ${key}`);
    coordinates.add(key);
    return { ...c } as unknown as Cell;
  });
}
export function mapBounds(cells: Cell[], radius: number) {
  const points = cells.map((c) => axialToWorld(c, radius));
  const minX = Math.min(...points.map((p) => p.x)) - radius;
  const maxX = Math.max(...points.map((p) => p.x)) + radius;
  const minZ = Math.min(...points.map((p) => p.z)) - radius;
  const maxZ = Math.max(...points.map((p) => p.z)) + radius;
  return {
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    width: maxX - minX,
    depth: maxZ - minZ,
    maxHeight: Math.max(...cells.map((c) => c.height)),
  };
}
