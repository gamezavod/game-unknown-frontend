/** Axial pointy-top hex coordinates mapped onto Three.js's XZ ground plane. */
export interface Axial { q: number; r: number }
export function axialToWorld({ q, r }: Axial, radius = 1): { x: number; z: number } {
  return { x: radius * Math.sqrt(3) * (q + r / 2), z: radius * 1.5 * r };
}
