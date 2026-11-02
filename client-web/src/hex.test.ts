import { expect, test } from 'vitest';
import { axialToWorld } from './hex';

test('центр и шесть соседей образуют правильный гексагон без перекрытий', () => {
  expect(axialToWorld({ q: 0, r: 0 })).toEqual({ x: 0, z: 0 });
  const ring = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  const points = ring.map(([q, r]) => axialToWorld({ q, r }, 2));
  points.forEach((p, i) => {
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(2 * Math.sqrt(3));
    const next = points[(i + 1) % points.length];
    expect(Math.hypot(p.x - next.x, p.z - next.z)).toBeCloseTo(2 * Math.sqrt(3));
  });
  expect(points[0]).toEqual({ x: 2 * Math.sqrt(3), z: 0 });
  expect(points[1].z).toBe(3);
});
