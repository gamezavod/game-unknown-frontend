import { expect, test } from "vitest";
import { shiftMovesDescription } from "./match3-copy";

test.each([
  [2, 20, 2, 2, "2 работника: 20 базовых ходов. Лес по соседству и счастье дают ещё 4."],
  [2, 20, 0, 2, "2 работника: 20 базовых ходов. Счастье даёт ещё 2."],
  [1, 15, 2, 0, "1 работник: 15 базовых ходов. Лес по соседству даёт ещё 2."],
  [11, 65, 0, 0, "11 работников: 65 базовых ходов."],
  [0, 0, 0, 0, "0 работников: 0 базовых ходов."],
])("подставляет разбивку для %i работников и %i базовых ходов", (assignedWorkers, base, forest, happiness, expected) => {
  expect(shiftMovesDescription({ assignedWorkers, moveBreakdown: { base, forest, happiness } })).toBe(expected);
});

test("показывает число работников при ответе прежней версии API", () => {
  expect(shiftMovesDescription({ assignedWorkers: 2 })).toBe("2 работника");
});
