import type { ChipId, ShiftId } from "./match3";

// Файлы day и night экспортированы из игровых экранов Penpot.
// Идентификаторы фишек приходят с сервера и используются во всех состояниях поля.
const tiles = {
  log: ["log", "Бревно"],
  tree: ["pinecone", "Шишка"],
  leaf: ["leaf", "Лист"],
  acorn: ["acorn", "Жёлудь"],
  mushroom: ["mushroom", "Гриб"],
  wheat: ["wheat", "Колос"],
  carrot: ["carrot", "Морковь"],
  apple: ["apple", "Яблоко"],
  sunflower: ["sunflower", "Подсолнух"],
  pumpkin: ["pumpkin", "Тыква"],
  rock: ["stone-block", "Каменный блок"],
  sand: ["sand", "Песок"],
  brick: ["clay", "Глина"],
  crystal: ["quartz", "Кварц"],
  clay: ["slate", "Сланец"],
  ore: ["copper-ore", "Медная руда"],
  gem: ["amethyst", "Аметист"],
  lantern: ["mine-lantern", "Шахтный фонарь"],
  pickaxe: ["pickaxe", "Кирка"],
  gear: ["minecart", "Вагонетка"],
  sprout: ["roots", "Корни"],
  autumn: ["earth", "Ком земли"],
  pot: ["amphora", "Амфора"],
} as const satisfies Record<ChipId | "pot", readonly [string, string]>;

const digTiles: Partial<Record<ChipId | "pot", readonly [string, string]>> = {
  rock: ["pebble", "Галька"],
  brick: ["shard", "Черепок"],
};

export function match3Tile(shift: ShiftId, chip: ChipId | "pot") {
  const [file, label] = (shift === "dig" ? digTiles[chip] : undefined) ?? tiles[chip];
  return { file, label };
}

export function renderMatch3Tile(file: string, className: string) {
  const base = `${import.meta.env.BASE_URL}ui/penpot-match3`;
  return `<span class="m3-art m3-tile-art ${className}" aria-hidden="true" style="--tile-day:url('${base}/day/${file}.webp');--tile-night:url('${base}/night/${file}.webp')"></span>`;
}
