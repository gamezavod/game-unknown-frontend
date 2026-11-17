import { expect, test } from "vitest";
import {
  attemptMove,
  createBoard,
  dropAndRefill,
  findMatches,
  findPossibleMoves,
  resultReward,
  sawmillTheme,
  type Board,
} from "./match3";

const stableBoard: Board = [
  ["tree", "log", "leaf", "mushroom", "acorn", "tree", "leaf", "acorn"],
  ["acorn", "leaf", "log", "tree", "mushroom", "acorn", "tree", "leaf"],
  ["log", "tree", "leaf", "acorn", "tree", "leaf", "mushroom", "acorn"],
  ["leaf", "mushroom", "acorn", "tree", "leaf", "acorn", "tree", "log"],
  ["tree", "acorn", "tree", "leaf", "mushroom", "tree", "leaf", "acorn"],
  ["mushroom", "tree", "leaf", "acorn", "tree", "leaf", "mushroom", "tree"],
  ["tree", "leaf", "mushroom", "tree", "leaf", "acorn", "tree", "leaf"],
  ["leaf", "acorn", "tree", "leaf", "mushroom", "tree", "leaf", "acorn"],
];

test("находит горизонтальные и вертикальные совпадения", () => {
  const board = stableBoard.map((row) => [...row]);
  board[0][0] = board[0][1] = board[0][2] = "log";
  board[2][7] = board[3][7] = board[4][7] = "mushroom";
  expect(findMatches(board)).toHaveLength(6);
});

test("неудачный обмен сохраняет поле и не принимается", () => {
  const result = attemptMove(stableBoard, { row: 0, column: 0 }, { row: 0, column: 1 });
  expect(result.accepted).toBe(false);
  expect(result.board).toEqual(stableBoard);
});

test("удачный обмен очищает бревна, заполняет поле и оставляет ход", () => {
  const board = stableBoard.map((row) => [...row]);
  board[0][0] = "log";
  board[0][1] = "log";
  board[1][2] = "log";
  let value = 0;
  const result = attemptMove(
    board,
    { row: 1, column: 2 },
    { row: 0, column: 2 },
    sawmillTheme,
    () => ((value = (value + 0.137) % 1), value),
  );
  expect(result.accepted).toBe(true);
  expect(result.collected).toBeGreaterThanOrEqual(3);
  expect(findMatches(result.board)).toEqual([]);
  expect(findPossibleMoves(result.board).length).toBeGreaterThan(0);
});

test("после очистки фишки падают в нижние свободные клетки, а верх заполняется", () => {
  const board: Board = [
    ["tree", "leaf", "acorn"],
    ["log", "tree", "leaf"],
    ["mushroom", "acorn", "log"],
  ];
  const next = dropAndRefill(
    board,
    [{ row: 2, column: 0 }, { row: 1, column: 0 }],
    sawmillTheme.chips,
    () => 0,
  );
  expect(next[2][0]).toBe("tree");
  expect(next[0][0]).toBe("log");
  expect(next[1][0]).toBe("log");
  expect(next).toHaveLength(3);
  expect(next[0]).toHaveLength(3);
});

test("новое поле стабильно и содержит допустимый ход", () => {
  let seed = 17;
  const board = createBoard(sawmillTheme.chips, () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  });
  expect(findMatches(board)).toEqual([]);
  expect(findPossibleMoves(board).length).toBeGreaterThan(0);
});

test("награда добавляет бонус только после цели", () => {
  expect(resultReward(27)).toEqual({ collected: 27, bonus: 0, total: 27, reachedGoal: false });
  expect(resultReward(30)).toEqual({ collected: 30, bonus: 10, total: 40, reachedGoal: true });
});
