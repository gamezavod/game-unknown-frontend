export const boardSize = 8;

/** Фишки перечислены отдельно от представления: движку не важны их картинки. */
export type ChipId =
  | "log"
  | "tree"
  | "leaf"
  | "acorn"
  | "mushroom"
  | "wheat"
  | "carrot"
  | "apple"
  | "sunflower"
  | "pumpkin"
  | "rock"
  | "sand"
  | "brick"
  | "crystal"
  | "clay"
  | "ore"
  | "gem"
  | "lantern"
  | "pickaxe"
  | "gear"
  | "sprout"
  | "autumn";

export type ShiftId = "sawmill" | "farm" | "quarry" | "mine" | "dig";
export type Board = ChipId[][];

export interface Position {
  row: number;
  column: number;
}

export interface MatchThreeTheme {
  id: ShiftId;
  title: string;
  subtitle: string;
  /** То, что игрок получает за каждую главную фишку. */
  resourceName: string;
  resourcePlural: string;
  resourceAccusative: string;
  mainChip: ChipId;
  mainChipName: string;
  chips: readonly ChipId[];
  goal: number;
  bonus: number;
  moves: number;
  workers: string;
  contextEmoji: string;
  contextText: string;
  fieldNote: string;
  icon: ChipId | "pot";
  resultHelpTitle: string;
  resultHelpText: string;
  kind: "resource" | "dig";
}

export const matchThreeThemes: Record<ShiftId, MatchThreeTheme> = {
  sawmill: {
    id: "sawmill", title: "Лесопилка", subtitle: "Собираем дерево", resourceName: "дерева", resourcePlural: "бревен", resourceAccusative: "дерево",
    mainChip: "log", mainChipName: "Бревна", chips: ["log", "tree", "leaf", "acorn", "mushroom"], goal: 30, bonus: 10, moves: 24,
    workers: "2 работника: 20 базовых ходов. Лес по соседству и счастье дают ещё 4.", contextEmoji: "🌲", contextText: "Лес рядом +2 · счастье +2 хода",
    fieldNote: "Бревна дают дерево. Остальные фишки помогают.", icon: "log", resultHelpTitle: "Добыча поможет острову", resultHelpText: "Потрать ресурсы на строительство, исследования или развитие поселения.", kind: "resource",
  },
  farm: {
    id: "farm", title: "Ферма", subtitle: "Собираем урожай", resourceName: "еды", resourcePlural: "колосьев", resourceAccusative: "еду",
    mainChip: "wheat", mainChipName: "Колосья", chips: ["wheat", "carrot", "apple", "sunflower", "pumpkin"], goal: 30, bonus: 10, moves: 22,
    workers: "2 работника: 20 базовых ходов. Вода рядом и счастье дают еще 2.", contextEmoji: "💧", contextText: "Счастье +2 хода · вода рядом",
    fieldNote: "Колосья дают еду. У воды они выпадают чаще.", icon: "wheat", resultHelpTitle: "Урожай поможет острову", resultHelpText: "Еда нужна жителям, новым домам и провизии для раскопок.", kind: "resource",
  },
  quarry: {
    id: "quarry", title: "Каменоломня", subtitle: "Добываем камень", resourceName: "камня", resourcePlural: "камней", resourceAccusative: "камень",
    mainChip: "rock", mainChipName: "Камни", chips: ["rock", "sand", "brick", "crystal", "clay"], goal: 30, bonus: 10, moves: 22,
    workers: "2 работника: 20 базовых ходов. Счастье дает еще 2.", contextEmoji: "🙂", contextText: "Счастье +2 хода",
    fieldNote: "Камни пополняют запас для строительства.", icon: "rock", resultHelpTitle: "Камень поможет острову", resultHelpText: "Используй его для строительства и исследований.", kind: "resource",
  },
  mine: {
    id: "mine", title: "Рудник", subtitle: "Добываем железо", resourceName: "железа", resourcePlural: "руды", resourceAccusative: "железо",
    mainChip: "ore", mainChipName: "Руда", chips: ["ore", "gem", "lantern", "pickaxe", "gear"], goal: 30, bonus: 10, moves: 17,
    workers: "1 работник: 15 базовых ходов. Счастье дает еще 2.", contextEmoji: "🙂", contextText: "Счастье +2 хода",
    fieldNote: "Руда пополняет запас железа на острове.", icon: "pickaxe", resultHelpTitle: "Железо поможет острову", resultHelpText: "Оно пригодится для технологий и энергетических построек.", kind: "resource",
  },
  dig: {
    id: "dig", title: "Раскопки", subtitle: "Ищем древнюю находку", resourceName: "глубины", resourcePlural: "ходов расчистки", resourceAccusative: "глубину",
    mainChip: "rock", mainChipName: "Амфора", chips: ["rock", "brick", "sprout", "autumn"], goal: 1, bonus: 0, moves: 20,
    workers: "Провизия уже внесена. Глубина сохранится, если закончить смену.", contextEmoji: "🧭", contextText: "Провизия уже внесена",
    fieldNote: "Расчисти путь: амфора должна дойти до низа.", icon: "pot", resultHelpTitle: "Амфора найдена", resultHelpText: "Находка останется в коллекции острова.", kind: "dig",
  },
};

export const sawmillTheme = matchThreeThemes.sawmill;

export const chipPresentation: Record<ChipId, { emoji: string; name: string; tone: string }> = {
  log: { emoji: "🪵", name: "Бревно", tone: "sand" }, tree: { emoji: "🌲", name: "Ель", tone: "green" }, leaf: { emoji: "🍃", name: "Лист", tone: "mint" }, acorn: { emoji: "🌰", name: "Орех", tone: "blue" }, mushroom: { emoji: "🍄", name: "Гриб", tone: "cream" },
  wheat: { emoji: "🌾", name: "Колос", tone: "cream" }, carrot: { emoji: "🥕", name: "Морковь", tone: "sand" }, apple: { emoji: "🍎", name: "Яблоко", tone: "blue" }, sunflower: { emoji: "🌻", name: "Подсолнух", tone: "green" }, pumpkin: { emoji: "🎃", name: "Тыква", tone: "mint" },
  rock: { emoji: "🪨", name: "Камень", tone: "blue" }, sand: { emoji: "🏜️", name: "Песок", tone: "cream" }, brick: { emoji: "🧱", name: "Глина", tone: "sand" }, crystal: { emoji: "💎", name: "Кристалл", tone: "mint" }, clay: { emoji: "🏺", name: "Галька", tone: "green" },
  ore: { emoji: "🪨", name: "Руда", tone: "blue" }, gem: { emoji: "💎", name: "Самоцвет", tone: "mint" }, lantern: { emoji: "🔦", name: "Фонарь", tone: "cream" }, pickaxe: { emoji: "⛏️", name: "Кирка", tone: "sand" }, gear: { emoji: "⚙️", name: "Вагонетка", tone: "green" },
  sprout: { emoji: "🌱", name: "Росток", tone: "green" }, autumn: { emoji: "🍂", name: "Лист", tone: "cream" },
};

export type Random = () => number;
export function cloneBoard(board: Board): Board { return board.map((row) => [...row]); }
export function areAdjacent(a: Position, b: Position) { return Math.abs(a.row - b.row) + Math.abs(a.column - b.column) === 1; }
export function isInsideBoard(position: Position, size = boardSize) { return Number.isInteger(position.row) && Number.isInteger(position.column) && position.row >= 0 && position.row < size && position.column >= 0 && position.column < size; }

/** Возвращает соседнюю клетку по направлению свайпа, если она есть на поле. */
export function positionFromSwipe(from: Position, deltaX: number, deltaY: number, size = boardSize, threshold = 16): Position | undefined {
  if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < threshold) return undefined;
  const target = Math.abs(deltaX) >= Math.abs(deltaY) ? { row: from.row, column: from.column + Math.sign(deltaX) } : { row: from.row + Math.sign(deltaY), column: from.column };
  return isInsideBoard(target, size) ? target : undefined;
}
export function swap(board: Board, a: Position, b: Position): Board { const next = cloneBoard(board); [next[a.row][a.column], next[b.row][b.column]] = [next[b.row][b.column], next[a.row][a.column]]; return next; }
function key(position: Position) { return `${position.row}:${position.column}`; }

export function samePosition(a: Position | undefined | null, b: Position | undefined | null) {
  return !!a && !!b && a.row === b.row && a.column === b.column;
}

export function findMatches(board: Board, amphora?: Position | null): Position[] {
  const found = new Map<string, Position>();
  for (const vertical of [false, true]) {
    const lines = vertical ? board[0].length : board.length;
    const length = vertical ? board.length : board[0].length;
    for (let line = 0; line < lines; line++) {
      let run: Position[] = [];
      let last: ChipId | undefined;
      for (let index = 0; index <= length; index++) {
        const p = vertical ? { row: index, column: line } : { row: line, column: index };
        const chip = samePosition(p, amphora) ? undefined : board[p.row]?.[p.column];
        if (!chip || chip !== last) {
          if (run.length >= 3) for (const match of run) found.set(key(match), match);
          run = [];
        }
        if (chip) run.push(p);
        last = chip;
      }
    }
  }
  return [...found.values()];
}

function hasMatchAt(matches: Position[], position: Position) {
  return matches.some((p) => samePosition(p, position));
}

export function findPossibleMoves(board: Board, amphora?: Position | null): [Position, Position][] {
  const moves: [Position, Position][] = [];
  for (let row = 0; row < board.length; row++) for (let column = 0; column < board[row].length; column++) {
    const from = { row, column };
    if (samePosition(from, amphora)) continue;
    for (const to of [{ row, column: column + 1 }, { row: row + 1, column }]) {
      if (!isInsideBoard(to, board.length) || samePosition(to, amphora) || board[row][column] === board[to.row][to.column]) continue;
      const matches = findMatches(swap(board, from, to), amphora);
      if (hasMatchAt(matches, from) || hasMatchAt(matches, to)) moves.push([from, to]);
    }
  }
  return moves;
}

function randomChip(chips: readonly ChipId[], random: Random): ChipId {
  return chips[Math.floor(random() * chips.length)];
}

/** Создаёт стабильное поле, где есть хотя бы один допустимый обмен. */
export function createBoard(
  chips: readonly ChipId[], random: Random = Math.random, size = boardSize, amphora?: Position | null,
): Board {
  if (chips.length < 3) throw new Error("Для поля нужно минимум три вида фишек");
  for (let attempt = 0; attempt < 500; attempt++) {
    const board: Board = Array.from({ length: size }, () => []);
    for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
      const available = chips.filter((chip) =>
        !(column >= 2 && board[row][column - 1] === chip && board[row][column - 2] === chip) &&
        !(row >= 2 && board[row - 1][column] === chip && board[row - 2][column] === chip),
      );
      board[row][column] = randomChip(available, random);
    }
    if (findPossibleMoves(board, amphora).length) return board;
  }
  throw new Error("Не удалось создать поле с доступным ходом");
}

export function dropAndRefill(
  board: Board, cleared: readonly Position[], chips: readonly ChipId[], random: Random, mainChip?: ChipId,
): Board {
  const clearedKeys = new Set(cleared.map(key));
  const next = cloneBoard(board);
  const spawned: Position[] = [];
  for (let column = 0; column < board[0].length; column++) {
    let targetRow = board.length - 1;
    for (let row = board.length - 1; row >= 0; row--) {
      if (!clearedKeys.has(key({ row, column }))) next[targetRow--][column] = board[row][column];
    }
    for (; targetRow >= 0; targetRow--) {
      next[targetRow][column] = randomChip(chips, random);
      spawned.push({ row: targetRow, column });
    }
  }
  if (!mainChip) return next;
  let remaining = Math.min(2, 5 - next.flat().filter((chip) => chip === mainChip).length);
  if (remaining <= 0) return next;

  // Случайные совпадения обычного пополнения сохраняются.
  const naturalMatches = new Set(findMatches(next).map(key));
  const candidates = spawned.filter((p) => next[p.row][p.column] !== mainChip && !naturalMatches.has(key(p)));
  while (remaining > 0 && candidates.length) {
    const [position] = candidates.splice(Math.floor(random() * candidates.length), 1);
    const { row, column } = position;
    const previous = next[row][column];
    next[row][column] = mainChip;
    if (hasMatchAt(findMatches(next), position)) next[row][column] = previous;
    else remaining--;
  }
  return next;
}

export interface CascadeStep {
  before: Board;
  cleared: Position[];
  after: Board;
  earned: number;
  amphoraBefore: Position | null;
  amphoraAfter: Position | null;
}

export interface CascadeResult {
  board: Board;
  collected: number;
  amphora: Position | null;
  steps: CascadeStep[];
}

export interface MoveResult extends CascadeResult {
  accepted: boolean;
  swappedBoard: Board;
}

function fallAmphora(amphora: Position, cleared: Position[]): Position {
  const holesBelow = cleared.filter((p) => p.row > amphora.row && p.column === amphora.column);
  return { column: amphora.column, row: amphora.row + holesBelow.length };
}

function settle(
  board: Board, cleared: Position[], theme: MatchThreeTheme, random: Random,
  amphora: Position | null, alreadyCollected: number,
): CascadeResult {
  const steps: CascadeStep[] = [];
  const mainChip = theme.kind === "resource" ? theme.mainChip : undefined;
  let collected = 0;
  while (cleared.length && steps.length < 40) {
    const earned = mainChip
      ? cleared.filter(({ row, column }) => board[row][column] === mainChip).length
      : 0;
    const amphoraAfter = amphora && fallAmphora(amphora, cleared);
    // Скрытая под амфорой фишка перемещается вместе с ней по тем же правилам падения.
    const after = dropAndRefill(board, cleared, theme.chips, random, mainChip);
    steps.push({ before: board, cleared, after, earned, amphoraBefore: amphora, amphoraAfter });
    collected += earned;
    board = after;
    amphora = amphoraAfter;
    if (alreadyCollected + collected >= theme.goal || amphora?.row === board.length - 1) {
      return { board, collected, amphora, steps };
    }
    cleared = findMatches(board, amphora);
  }
  if (cleared.length || !findPossibleMoves(board, amphora).length) {
    const after = createBoard(theme.chips, random, board.length, amphora);
    steps.push({ before: board, cleared: [], after, earned: 0, amphoraBefore: amphora, amphoraAfter: amphora });
    board = after;
  }
  return { board, collected, amphora, steps };
}

/** Меняет две фишки и разрешает каскады в браузере. */
export function attemptMove(
  board: Board, from: Position, to: Position, theme: MatchThreeTheme = sawmillTheme,
  random: Random = Math.random, amphora: Position | null = null, alreadyCollected = 0,
): MoveResult {
  const rejected = (swappedBoard: Board): MoveResult => ({ accepted: false, board, swappedBoard, collected: 0, amphora, steps: [] });
  if (!isInsideBoard(from, board.length) || !isInsideBoard(to, board.length) || !areAdjacent(from, to) ||
      samePosition(amphora, from) || samePosition(amphora, to)) return rejected(board);
  const swappedBoard = swap(board, from, to);
  if (board[from.row][from.column] === board[to.row][to.column]) return rejected(swappedBoard);
  const cleared = findMatches(swappedBoard, amphora);
  if (!hasMatchAt(cleared, from) && !hasMatchAt(cleared, to)) return rejected(swappedBoard);
  return { accepted: true, swappedBoard, ...settle(swappedBoard, cleared, theme, random, amphora, alreadyCollected) };
}

export function strikeRow(
  board: Board, row: number, theme: MatchThreeTheme,
  random: Random = Math.random, amphora: Position | null = null, alreadyCollected = 0,
): CascadeResult {
  const cleared = board[row].map((_, column) => ({ row, column })).filter((p) => !samePosition(p, amphora));
  return settle(board, cleared, theme, random, amphora, alreadyCollected);
}

export function amphoraAtDepth(depth: number): Position {
  return { row: Math.min(boardSize - 1, 1 + depth), column: 3 };
}

export function resultReward(collected: number, theme: MatchThreeTheme = sawmillTheme) {
  const bonus = theme.kind === "resource" && collected >= theme.goal ? theme.bonus : 0;
  return { collected, bonus, total: collected + bonus, reachedGoal: theme.kind === "dig" ? collected >= theme.goal : bonus > 0 };
}
