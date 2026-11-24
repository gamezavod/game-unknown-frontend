/** Axial pointy-top hex coordinates mapped onto Three.js's XZ ground plane. */
export interface Axial { q: number; r: number }
export const hexDirections = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]] as const;
export const hexKey = ({ q, r }: Axial) => `${q},${r}`;
export function hexNeighbors({ q, r }: Axial): Axial[] {
  return hexDirections.map(([dq, dr]) => ({ q: q + dq, r: r + dr }));
}
export function axialToWorld({ q, r }: Axial, radius = 1): { x: number; z: number } {
  return { x: radius * Math.sqrt(3) * (q + r / 2), z: radius * 1.5 * r };
}
