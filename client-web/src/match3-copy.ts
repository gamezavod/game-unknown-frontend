import type { ShiftView } from "./match3-api";

const plural = new Intl.PluralRules("ru");

export function workersLabel(count: number) {
  const form = plural.select(count);
  return `${count} ${form === "one" ? "работник" : form === "few" ? "работника" : "работников"}`;
}

export function movesLabel(count: number) {
  const form = plural.select(count);
  return form === "one" ? "ход" : form === "few" ? "хода" : "ходов";
}

export function shiftMovesDescription({
  assignedWorkers,
  moveBreakdown,
}: Pick<ShiftView, "assignedWorkers" | "moveBreakdown">) {
  const workers = workersLabel(assignedWorkers);
  if (!moveBreakdown) return workers;

  const { base, forest, happiness } = moveBreakdown;
  const baseLabel = plural.select(base) === "one" ? "базовый" : "базовых";
  const summary = `${workers}: ${base} ${baseLabel} ${movesLabel(base)}.`;
  if (forest && happiness) return `${summary} Лес по соседству и счастье дают ещё ${forest + happiness}.`;
  if (forest) return `${summary} Лес по соседству даёт ещё ${forest}.`;
  if (happiness) return `${summary} Счастье даёт ещё ${happiness}.`;
  return summary;
}
