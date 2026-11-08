import { axialToWorld } from "./hex";
import type { Cell } from "./map-data";

export interface TreePlacement {
  x: number;
  z: number;
  scale: number;
  rotation: number;
  species: "A" | "B";
}
/** Детерминированные небольшие рощи; никаких изменений клеток и игрового состояния. */
export function forestLayout(cell: Cell): TreePlacement[] {
  const seed = Math.abs(cell.q * 73 + cell.r * 37 + (cell.variant ?? 0) * 11);
  const count = seed % 7 === 0 ? 1 : 2 + (seed % 3);
  return Array.from({ length: count }, (_, i) => {
    const angle = seed * 0.71 + i * 2.39996;
    const radius = i === 0 ? 0.16 : 0.4 + ((seed + i * 13) % 4) * 0.12;
    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      scale: 0.72 + ((seed + i * 17) % 8) * 0.09,
      rotation: angle,
      species: (seed + i) % 5 === 0 ? "B" : "A",
    };
  });
}
export function mountainLayout(cells: Cell[], radius: number) {
  const rocks = cells.filter(
    (c) => c.type === "rock" && c.state === "visible" && !c.building,
  );
  const remaining = new Map(rocks.map((c) => [`${c.q},${c.r}`, c]));
  const groups: Cell[][] = [];
  const directions = [
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
  ];
  while (remaining.size) {
    const first = remaining.values().next().value!;
    remaining.delete(`${first.q},${first.r}`);
    const group = [first];
    for (let i = 0; i < group.length; i++)
      for (const [q, r] of directions) {
        const key = `${group[i].q + q},${group[i].r + r}`,
          next = remaining.get(key);
        if (next) {
          group.push(next);
          remaining.delete(key);
        }
      }
    groups.push(group);
  }
  const middleR = cells.reduce((s, c) => s + c.r, 0) / cells.length;
  const northern = groups.filter(
    (g) => g.reduce((s, c) => s + c.r, 0) / g.length < middleR,
  );
  const main = [...northern].sort((a, b) => b.length - a.length)[0];
  const result = new Map<
    string,
    { scale: number; x: number; z: number; rotation: number }
  >();
  for (const group of groups) {
    const points = group.map((c) => axialToWorld(c, radius));
    const center = {
      x: points.reduce((s, p) => s + p.x, 0) / points.length,
      z: points.reduce((s, p) => s + p.z, 0) / points.length,
    };
    const peak = points.reduce(
      (best, p, i) =>
        Math.hypot(p.x - center.x, p.z - center.z) <
        Math.hypot(points[best].x - center.x, points[best].z - center.z)
          ? i
          : best,
      0,
    );
    group.forEach((c, i) => {
      const seed = Math.abs(c.q * 17 + c.r * 31),
        rear = c.r < middleR;
      result.set(`${c.q},${c.r}`, {
        scale:
          group === main
            ? i === peak
              ? 2.05
              : 1.5 + (seed % 3) * 0.1
            : rear
              ? 1.12 + (seed % 3) * 0.12
              : 0.82 + (seed % 3) * 0.1,
        x: Math.sin(seed * 0.8) * 0.2,
        z: Math.cos(seed * 0.6) * 0.22,
        rotation: ((c.rotation ?? 0) * Math.PI) / 180 + (seed % 5) * 0.13,
      });
    });
  }
  return result;
}
