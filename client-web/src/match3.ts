export const boardSize = 8;

export type ChipId = "log" | "tree" | "leaf" | "acorn" | "mushroom";
export type Board = ChipId[][];

export interface Position {
  row: number;
  column: number;
}

export interface MatchThreeTheme {
  id: string;
  title: string;
  resourceName: string;
  mainChip: ChipId;
  chips: readonly ChipId[];
  goal: number;
  bonus: number;
  moves: number;
}

export const sawmillTheme: MatchThreeTheme = {
  id: "sawmill",
  title: "Лесопилка",
  resourceName: "дерева",
  mainChip: "log",
  chips: ["log", "tree", "leaf", "acorn", "mushroom"],
  goal: 30,
  bonus: 10,
  moves: 24,
};

export const chipPresentation: Record<ChipId, { emoji: string; name: string }> = {
  log: { emoji: "🪵", name: "Бревно" },
  tree: { emoji: "🌲", name: "Ель" },
  leaf: { emoji: "🍃", name: "Лист" },
  acorn: { emoji: "🌰", name: "Орех" },
  mushroom: { emoji: "🍄", name: "Гриб" },
};

export type Random = () => number;

export function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

export function areAdjacent(a: Position, b: Position) {
  return Math.abs(a.row - b.row) + Math.abs(a.column - b.column) === 1;
}

export function isInsideBoard(position: Position, size = boardSize) {
  return (
    Number.isInteger(position.row) &&
    Number.isInteger(position.column) &&
    position.row >= 0 &&
    position.row < size &&
    position.column >= 0 &&
    position.column < size
  );
}

export function swap(board: Board, a: Position, b: Position): Board {
  const next = cloneBoard(board);
  [next[a.row][a.column], next[b.row][b.column]] = [
    next[b.row][b.column],
    next[a.row][a.column],
  ];
  return next;
}

function key(position: Position) {
  return `${position.row}:${position.column}`;
}

export function findMatches(board: Board): Position[] {
  const found = new Map<string, Position>();
  const addRun = (positions: Position[]) => {
    if (positions.length >= 3)
      positions.forEach((position) => found.set(key(position), position));
  };
  for (let row = 0; row < board.length; row++) {
    let run: Position[] = [];
    for (let column = 0; column <= board[row].length; column++) {
      const chip = board[row][column];
      if (run.length && chip !== board[run[0].row][run[0].column]) {
        addRun(run);
        run = [];
      }
      if (column < board[row].length) run.push({ row, column });
    }
  }
  for (let column = 0; column < board[0].length; column++) {
    let run: Position[] = [];
    for (let row = 0; row <= board.length; row++) {
      const chip = board[row]?.[column];
      if (run.length && chip !== board[run[0].row][run[0].column]) {
        addRun(run);
        run = [];
      }
      if (row < board.length) run.push({ row, column });
    }
  }
  return [...found.values()];
}

export function findPossibleMoves(board: Board): [Position, Position][] {
  const moves: [Position, Position][] = [];
  for (let row = 0; row < board.length; row++) {
    for (let column = 0; column < board[row].length; column++) {
      const from = { row, column };
      for (const to of [
        { row, column: column + 1 },
        { row: row + 1, column },
      ]) {
        if (!isInsideBoard(to, board.length)) continue;
        if (findMatches(swap(board, from, to)).length) moves.push([from, to]);
      }
    }
  }
  return moves;
}

function randomChip(chips: readonly ChipId[], random: Random): ChipId {
  return chips[Math.floor(random() * chips.length)] ?? chips[0];
}

/** Создает стабильное поле, где есть хотя бы один допустимый обмен. */
export function createBoard(
  chips: readonly ChipId[],
  random: Random = Math.random,
  size = boardSize,
): Board {
  if (chips.length < 3) throw new Error("Для поля нужно минимум три вида фишек");
  for (let attempt = 0; attempt < 500; attempt++) {
    const board: Board = Array.from({ length: size }, () => []);
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        let chip = randomChip(chips, random);
        let safety = 0;
        while (
          safety++ < 20 &&
          ((column >= 2 &&
            board[row][column - 1] === chip &&
            board[row][column - 2] === chip) ||
            (row >= 2 &&
              board[row - 1][column] === chip &&
              board[row - 2][column] === chip))
        )
          chip = randomChip(chips, random);
        board[row][column] = chip;
      }
    }
    if (findPossibleMoves(board).length) return board;
  }
  throw new Error("Не удалось создать поле с доступным ходом");
}

export function dropAndRefill(
  board: Board,
  cleared: readonly Position[],
  chips: readonly ChipId[],
  random: Random,
): Board {
  const clearedKeys = new Set(cleared.map(key));
  const next: Board = Array.from({ length: board.length }, () =>
    Array.from({ length: board[0].length }, () => "log" as ChipId),
  );
  for (let column = 0; column < board[0].length; column++) {
    const stack: ChipId[] = [];
    for (let row = board.length - 1; row >= 0; row--) {
      if (!clearedKeys.has(key({ row, column }))) stack.push(board[row][column]);
    }
    for (let row = board.length - 1; row >= 0; row--)
      next[row][column] = stack.shift() ?? randomChip(chips, random);
  }
  return next;
}

export interface MoveResult {
  accepted: boolean;
  board: Board;
  /** Поле сразу после обмена — кадр для анимации перемещения. */
  swappedBoard: Board;
  cleared: Position[];
  collected: number;
  cascades: number;
  steps: CascadeStep[];
}

export interface CascadeStep {
  before: Board;
  cleared: Position[];
  after: Board;
}

/** Меняет две фишки и синхронно разрешает все каскады до стабильного поля. */
export function attemptMove(
  board: Board,
  from: Position,
  to: Position,
  theme: MatchThreeTheme = sawmillTheme,
  random: Random = Math.random,
): MoveResult {
  if (
    !isInsideBoard(from, board.length) ||
    !isInsideBoard(to, board.length) ||
    !areAdjacent(from, to)
  )
    return {
      accepted: false,
      board: cloneBoard(board),
      swappedBoard: cloneBoard(board),
      cleared: [],
      collected: 0,
      cascades: 0,
      steps: [],
    };
  let next = swap(board, from, to);
  const swappedBoard = cloneBoard(next);
  let matches = findMatches(next);
  if (!matches.length)
    return {
      accepted: false,
      board: cloneBoard(board),
      swappedBoard,
      cleared: [],
      collected: 0,
      cascades: 0,
      steps: [],
    };
  let collected = 0;
  let cascades = 0;
  const cleared: Position[] = [];
  const steps: CascadeStep[] = [];
  // Случайная генерация почти никогда не зацикливается, но лимит защищает
  // игру от неисправного или детерминированного источника случайности.
  while (matches.length && cascades < 40) {
    cascades++;
    matches.forEach((position) => {
      if (next[position.row][position.column] === theme.mainChip) collected++;
      cleared.push(position);
    });
    const before = cloneBoard(next);
    const clearedThisStep = matches.map((position) => ({ ...position }));
    next = dropAndRefill(next, clearedThisStep, theme.chips, random);
    steps.push({ before, cleared: clearedThisStep, after: cloneBoard(next) });
    matches = findMatches(next);
  }
  if (matches.length || !findPossibleMoves(next).length)
    next = createBoard(theme.chips, random, board.length);
  return { accepted: true, board: next, swappedBoard, cleared, collected, cascades, steps };
}

export function resultReward(collected: number, theme: MatchThreeTheme = sawmillTheme) {
  const bonus = collected >= theme.goal ? theme.bonus : 0;
  return { collected, bonus, total: collected + bonus, reachedGoal: bonus > 0 };
}
