import { expect, test } from "vitest";
import { TapGesture } from "./gestures";
test("короткий tap выбирает клетку, drag туда и обратно — нет", () => {
  const g = new TapGesture();
  g.down(1, 10, 10, 0);
  expect(g.up(1, 12, 11, 100)).toBe(true);
  g.down(2, 10, 10, 200);
  g.move(2, 40, 10);
  expect(g.up(2, 10, 10, 300)).toBe(false);
});
test("после pinch ни один из двух пальцев не выбирает клетку", () => {
  const g = new TapGesture();
  g.down(1, 10, 10, 0);
  g.down(2, 30, 10, 10);
  expect(g.up(2, 30, 10, 50)).toBe(false);
  expect(g.up(1, 10, 10, 80)).toBe(false);
  g.down(3, 10, 10, 100);
  expect(g.up(3, 10, 10, 200)).toBe(true);
});
test("cancel и долгое нажатие не выбирают клетку", () => {
  const g = new TapGesture();
  g.down(1, 0, 0, 0);
  g.cancel();
  expect(g.up(1, 0, 0, 20)).toBe(false);
  g.down(2, 0, 0, 30);
  expect(g.up(2, 0, 0, 600)).toBe(false);
});
