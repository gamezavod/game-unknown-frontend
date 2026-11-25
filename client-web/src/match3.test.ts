import { expect, test } from "vitest";
import {
  attemptMove,
  boardSize,
  createBoard,
  chipPresentation,
  dropAndRefill,
  findMatches,
  findPossibleMoves,
  matchThreeThemes,
  positionFromSwipe,
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

test("свайп выбирает одну соседнюю клетку по главному направлению", () => {
  expect(positionFromSwipe({ row: 3, column: 3 }, 24, 8)).toEqual({ row: 3, column: 4 });
  expect(positionFromSwipe({ row: 3, column: 3 }, -4, -24)).toEqual({ row: 2, column: 3 });
  expect(positionFromSwipe({ row: 3, column: 3 }, 10, 2)).toBeUndefined();
  expect(positionFromSwipe({ row: 0, column: 0 }, -24, 0)).toBeUndefined();
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

test("амфора падает на число очищенных фишек ниже в своём столбце", () => {
  const dig = matchThreeThemes.dig;
  const board: Board = Array.from({ length: boardSize }, (_, row) =>
    Array.from({ length: boardSize }, (_, column) => dig.chips[(row * 2 + column) % dig.chips.length]),
  );
  board[4][3] = board[5][3] = "rock";
  const amphora = { row: 1, column: 3 };
  let seed = 17;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const result = attemptMove(board, { row: 6, column: 4 }, { row: 6, column: 3 }, dig, random, amphora);
  expect(result.accepted).toBe(true);
  expect(result.steps[0].cleared).toEqual([4, 5, 6].map((row) => ({ row, column: 3 })));
  expect(result.steps[0].amphoraAfter).toEqual({ row: 4, column: 3 });
  expect(result.steps[0].after[4][3]).toBe(board[1][3]);
  expect(findPossibleMoves(board, amphora).flat()).not.toContainEqual(amphora);
  expect(attemptMove(board, amphora, { row: 1, column: 4 }, dig, random, amphora).accepted).toBe(false);
});

test.each(["sawmill", "farm", "quarry", "mine"] as const)(
  "%s пополняет редкий ресурс в случайных местах без готовой тройки",
  (id) => {
    const { chips, mainChip } = matchThreeThemes[id];
    const others = chips.filter((chip) => chip !== mainChip);
    const board: Board = Array.from({ length: boardSize }, (_, row) =>
      Array.from({ length: boardSize }, (_, column) => others[(row + column) % others.length]),
    );
    const cleared = board[0].map((_, column) => ({ row: boardSize - 1, column }));
    const refill = (selection: number) => {
      let draw = 0;
      return dropAndRefill(board, cleared, chips, () =>
        draw < boardSize ? (chips.indexOf(others[draw++ % others.length]) + 0.5) / chips.length : selection,
      mainChip);
    };
    const first = refill(0);
    const second = refill(0.99);
    expect(first[0].filter((chip) => chip === mainChip)).toHaveLength(2);
    expect(second[0].filter((chip) => chip === mainChip)).toHaveLength(2);
    expect(first[0]).not.toEqual(second[0]);
    expect(findMatches(first)).toEqual([]);
    expect(findMatches(second)).toEqual([]);
  },
);

test("добавленная фишка не достраивает имеющуюся пару до тройки", () => {
  const { chips, mainChip } = sawmillTheme;
  const other = chips.filter((chip) => chip !== mainChip);
  const board: Board = Array.from({ length: boardSize }, (_, row) =>
    Array.from({ length: boardSize }, (_, column) => other[(row + column) % other.length]),
  );
  board[0][0] = board[0][1] = mainChip;
  const cleared = board[0].slice(2).map((_, index) => ({ row: 0, column: index + 2 }));
  let column = 2;
  const after = dropAndRefill(board, cleared, chips, () =>
    column < boardSize ? (chips.indexOf(other[column++ % other.length]) + 0.5) / chips.length : 0,
  mainChip);
  expect(after[0][2]).not.toBe(mainChip);
  expect(after.flat().filter((chip) => chip === mainChip)).toHaveLength(4);
  expect(findMatches(after)).toEqual([]);
});

test("для всех пяти смен создается стабильное поле 8 на 8", () => {
  for (const theme of Object.values(matchThreeThemes)) {
    let seed = 7;
    const board = createBoard(theme.chips, () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    });
    expect(board).toHaveLength(boardSize);
    expect(board.every((row) => row.length === boardSize)).toBe(true);
    expect(findMatches(board)).toEqual([]);
    expect(findPossibleMoves(board).length).toBeGreaterThan(0);
  }
});

test("в одной смене нет разных типов фишек с одинаковым изображением", () => {
  for (const theme of Object.values(matchThreeThemes)) {
    const images = theme.chips.map((chip) => chipPresentation[chip].emoji);
    expect(new Set(images).size, theme.id).toBe(theme.chips.length);
  }
});

test("в раскопках горизонтальные и вертикальные ряды камней совпадают", () => {
  const board: Board = [
    ["rock", "rock", "rock", "brick"],
    ["brick", "sprout", "autumn", "rock"],
    ["sprout", "autumn", "brick", "rock"],
    ["autumn", "brick", "sprout", "rock"],
  ];
  expect(matchThreeThemes.dig.chips.filter((chip) => chipPresentation[chip].name === "Камень")).toEqual(["rock"]);
  expect(findMatches(board)).toEqual(expect.arrayContaining([
    { row: 0, column: 0 }, { row: 0, column: 1 }, { row: 0, column: 2 },
    { row: 1, column: 3 }, { row: 2, column: 3 }, { row: 3, column: 3 },
  ]));
  expect(findMatches(board)).toHaveLength(6);
});

test("обмен в раскопках собирает ряд камней", () => {
  const board: Board = [
    ["rock", "rock", "brick", "autumn"],
    ["brick", "sprout", "rock", "rock"],
    ["sprout", "autumn", "brick", "sprout"],
    ["autumn", "brick", "sprout", "brick"],
  ];
  let seed = 17;
  const move = attemptMove(board, { row: 1, column: 2 }, { row: 0, column: 2 }, matchThreeThemes.dig, () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  });
  expect(findMatches(board)).toEqual([]);
  expect(move.accepted).toBe(true);
  expect(move.steps[0].cleared).toEqual([
    { row: 0, column: 0 }, { row: 0, column: 1 }, { row: 0, column: 2 },
  ]);
  expect(findMatches(move.board)).toEqual([]);
});

test("темы совпадают с правилами смен из макетов", () => {
  expect(matchThreeThemes.farm).toMatchObject({ goal: 30, bonus: 10, moves: 22, mainChipName: "Колосья" });
  expect(matchThreeThemes.quarry).toMatchObject({ goal: 30, bonus: 10, moves: 22, mainChipName: "Камни" });
  expect(matchThreeThemes.mine).toMatchObject({ goal: 30, bonus: 10, moves: 17, mainChipName: "Руда", icon: "pickaxe" });
  expect(matchThreeThemes.dig).toMatchObject({ goal: 1, moves: 20, kind: "dig" });
  expect(resultReward(1, matchThreeThemes.dig)).toEqual({ collected: 1, bonus: 0, total: 1, reachedGoal: true });
});
