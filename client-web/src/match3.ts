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
  | "digRock"
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
    workers: "2 работника: 20 базовых ходов. Лес по соседству и счастье дают еще 4.", contextEmoji: "🌲", contextText: "Лес рядом +2 · счастье +2 хода",
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
    mainChip: "digRock", mainChipName: "Амфора", chips: ["digRock", "brick", "sprout", "autumn", "rock"], goal: 1, bonus: 0, moves: 20,
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
  digRock: { emoji: "🪨", name: "Камень", tone: "blue" }, sprout: { emoji: "🌱", name: "Росток", tone: "green" }, autumn: { emoji: "🍂", name: "Лист", tone: "cream" },
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

export function findMatches(board: Board): Position[] {
  const found = new Map<string, Position>();
  const addRun = (positions: Position[]) => { if (positions.length >= 3) positions.forEach((position) => found.set(key(position), position)); };
  for (let row = 0; row < board.length; row++) {
    let run: Position[] = [];
    for (let column = 0; column <= board[row].length; column++) { const chip = board[row][column]; if (run.length && chip !== board[run[0].row][run[0].column]) { addRun(run); run = []; } if (column < board[row].length) run.push({ row, column }); }
  }
  for (let column = 0; column < board[0].length; column++) {
    let run: Position[] = [];
    for (let row = 0; row <= board.length; row++) { const chip = board[row]?.[column]; if (run.length && chip !== board[run[0].row][run[0].column]) { addRun(run); run = []; } if (row < board.length) run.push({ row, column }); }
  }
  return [...found.values()];
}
export function findPossibleMoves(board: Board): [Position, Position][] {
  const moves: [Position, Position][] = [];
  for (let row = 0; row < board.length; row++) for (let column = 0; column < board[row].length; column++) {
    const from = { row, column };
    for (const to of [{ row, column: column + 1 }, { row: row + 1, column }]) if (isInsideBoard(to, board.length) && findMatches(swap(board, from, to)).length) moves.push([from, to]);
  }
  return moves;
}
function randomChip(chips: readonly ChipId[], random: Random): ChipId { return chips[Math.floor(random() * chips.length)] ?? chips[0]; }

/** Создает стабильное поле, где есть хотя бы один допустимый обмен. */
export function createBoard(chips: readonly ChipId[], random: Random = Math.random, size = boardSize): Board {
  if (chips.length < 3) throw new Error("Для поля нужно минимум три вида фишек");
  for (let attempt = 0; attempt < 500; attempt++) {
    const board: Board = Array.from({ length: size }, () => []);
    for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
      let chip = randomChip(chips, random), safety = 0;
      while (safety++ < 20 && ((column >= 2 && board[row][column - 1] === chip && board[row][column - 2] === chip) || (row >= 2 && board[row - 1][column] === chip && board[row - 2][column] === chip))) chip = randomChip(chips, random);
      board[row][column] = chip;
    }
    if (findPossibleMoves(board).length) return board;
  }
  throw new Error("Не удалось создать поле с доступным ходом");
}
export function dropAndRefill(board: Board, cleared: readonly Position[], chips: readonly ChipId[], random: Random): Board {
  const clearedKeys = new Set(cleared.map(key));
  const next: Board = Array.from({ length: board.length }, () => Array.from({ length: board[0].length }, () => chips[0]));
  for (let column = 0; column < board[0].length; column++) {
    const stack: ChipId[] = [];
    for (let row = board.length - 1; row >= 0; row--) if (!clearedKeys.has(key({ row, column }))) stack.push(board[row][column]);
    for (let row = board.length - 1; row >= 0; row--) next[row][column] = stack.shift() ?? randomChip(chips, random);
  }
  return next;
}
export interface CascadeStep { before: Board; cleared: Position[]; after: Board; }
export interface MoveResult { accepted: boolean; board: Board; swappedBoard: Board; cleared: Position[]; collected: number; cascades: number; steps: CascadeStep[]; }

/** Меняет две фишки и синхронно разрешает все каскады до стабильного поля. */
export function attemptMove(board: Board, from: Position, to: Position, theme: MatchThreeTheme = sawmillTheme, random: Random = Math.random): MoveResult {
  const rejected = (swappedBoard: Board): MoveResult => ({ accepted: false, board: cloneBoard(board), swappedBoard, cleared: [], collected: 0, cascades: 0, steps: [] });
  if (!isInsideBoard(from, board.length) || !isInsideBoard(to, board.length) || !areAdjacent(from, to)) return rejected(cloneBoard(board));
  let next = swap(board, from, to); const swappedBoard = cloneBoard(next); let matches = findMatches(next);
  if (!matches.length) return rejected(swappedBoard);
  let collected = 0, cascades = 0; const cleared: Position[] = [], steps: CascadeStep[] = [];
  while (matches.length && cascades < 40) {
    cascades++;
    matches.forEach((position) => { if (next[position.row][position.column] === theme.mainChip) collected++; cleared.push(position); });
    const before = cloneBoard(next), clearedThisStep = matches.map((position) => ({ ...position }));
    next = dropAndRefill(next, clearedThisStep, theme.chips, random); steps.push({ before, cleared: clearedThisStep, after: cloneBoard(next) }); matches = findMatches(next);
  }
  if (matches.length || !findPossibleMoves(next).length) next = createBoard(theme.chips, random, board.length);
  return { accepted: true, board: next, swappedBoard, cleared, collected, cascades, steps };
}
export function resultReward(collected: number, theme: MatchThreeTheme = sawmillTheme) {
  const bonus = theme.kind === "resource" && collected >= theme.goal ? theme.bonus : 0;
  return { collected, bonus, total: collected + bonus, reachedGoal: theme.kind === "dig" ? collected >= theme.goal : bonus > 0 };
}

/**
 * В раскопках амфора продвигается только когда очищена клетка прямо под неи.
 * Так игрок строит путь вниз, а не просто делает произвольные совпадения.
 */
export function nextDigDepth(
  depth: number,
  cleared: readonly Position[],
  column = 3,
) {
  const potRow = Math.min(boardSize - 1, 1 + depth);
  const pathRow = potRow + 1;
  if (pathRow >= boardSize) return depth;
  return cleared.some((position) => position.row === pathRow && position.column === column)
    ? Math.min(boardSize - 2, depth + 1)
    : depth;
}
