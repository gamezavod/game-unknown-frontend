import { expect, test } from "vitest";
import {
  demoMapSource,
  httpMapSource,
  mapBounds,
  parseCells,
} from "./map-data";
import { vi } from "vitest";
const cell = { q: 0, r: 0, height: 0.5, type: "grass", state: "visible" };
test("проверка контракта отклоняет повреждённые данные и дубликаты", () => {
  for (const value of [
    [],
    null,
    [cell, cell],
    [{ ...cell, q: 0.5 }],
    [{ ...cell, height: NaN }],
    [{ ...cell, building: "unknown" }],
    [{ ...cell, type: "constructor" }],
  ])
    expect(() => parseCells(value)).toThrow();
  expect(parseCells([cell])).toEqual([cell]);
});
test("тестовая карта загружается через общий контракт", async () => {
  const cells = await demoMapSource.load();
  expect(cells.filter((c) => c.building)).toHaveLength(5);
  expect(new Set(cells.map((c) => c.type))).toEqual(
    new Set(["grass", "forest", "rock", "coast"]),
  );
});
test("рамка карты следует данным, включая остров вне начала координат", () => {
  const cells = parseCells([{ ...cell, q: 100, r: -30 }]);
  const b = mapBounds(cells, 2);
  expect(b.centerX).toBeCloseTo(2 * Math.sqrt(3) * 85);
  expect(b.centerZ).toBe(-90);
  expect(b.width).toBe(4);
  expect(b.depth).toBe(4);
});
test("HTTP-источник проверяет ответ сервера и обрабатывает HTTP-ошибку", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => [cell] })
    .mockResolvedValueOnce({ ok: false, status: 503 });
  vi.stubGlobal("fetch", fetch);
  try {
    expect(await httpMapSource("/api/map").load()).toEqual([cell]);
    await expect(httpMapSource("/api/map").load()).rejects.toThrow("HTTP 503");
  } finally {
    vi.unstubAllGlobals();
  }
});
