import { renderArt } from "./ui-art";
import { syncBrowserTheme } from "./theme";
import type { Axial } from "./hex";
import { penpotVectors } from "./penpot-vectors";
import {
  areAdjacent,
  chipPresentation,
  createBoard,
  matchThreeThemes,
  positionFromSwipe,
  resultReward,
  type Board,
  type ChipId,
  type MatchThreeTheme,
  type Position,
  type ShiftId,
} from "./match3";
import {
  match3Api,
  Match3ApiError,
  match3RequestKey,
  type Match3Result,
  type Match3Run,
  type Match3State,
  type Match3Step,
  type ShiftView,
  type Warehouse,
} from "./match3-api";
import { match3Icons, type Match3IconName } from "./penpot-emoji";
import {
  penpotMatch3Icons,
  type PenpotMatch3IconName,
} from "./penpot-match3-icons";
import { penpotHomeIcons } from "./penpot-home-icons";

type Screen = "hub" | "brief" | "game" | "result";
type Modal = "pause" | "rules" | "storageFull" | "noCharges" | "noEnergy" | "noWorkers" | "hint" | undefined;

interface Shift {
  board: Board;
  moves: number;
  collected: number;
  theme: MatchThreeTheme;
  /** Сколько рядов амфора уже прошла в текущих раскопках. */
  digDepth: number;
  digTarget: number;
  amphora: Position | null;
  /** Заряд молнии очищает выбранный ряд без траты хода. */
  lightningCharges: number;
  lightningEnabled: boolean;
  /** После нажатия молнии следующая выбранная фишка задает очищаемый ряд. */
  lightningArmed: boolean;
}

interface ResultState {
  reward: Pick<Match3Result, "collected" | "bonus" | "credited" | "overflow"> & { reachedGoal: boolean };
  theme: MatchThreeTheme;
  digFound: boolean;
}

const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const resources = { sawmill: "wood", farm: "food", quarry: "stone", mine: "iron" } as const;
const initialWarehouse: Warehouse = {
  wood: { amount: 120, limit: 200 },
  food: { amount: 80, limit: 200 },
  stone: { amount: 60, limit: 200 },
  iron: { amount: 0, limit: 200 },
};

function workersLabel(count: number) {
  const last = count % 10;
  const tens = count % 100;
  if (tens >= 11 && tens <= 14) return `${count} работников`;
  if (last === 1) return `${count} работник`;
  return `${count} ${last >= 2 && last <= 4 ? "работника" : "работников"}`;
}
const exportedChipIcons: Partial<Record<ChipId | "pot", Match3IconName>> = {
  log: "log",
  tree: "tree",
  leaf: "leaf",
  acorn: "acorn",
  mushroom: "mushroom",
  pot: "pot",
};

const penpotChipIcons: Partial<Record<ChipId, PenpotMatch3IconName>> = {
  wheat: "wheat",
  carrot: "carrot",
  apple: "apple",
  sunflower: "sunflower",
  pumpkin: "pumpkin",
  rock: "rock",
  sand: "sand",
  brick: "brick",
  crystal: "crystal",
  clay: "clay",
  ore: "rock",
  gem: "gem",
  lantern: "lantern",
  pickaxe: "pickaxe",
  gear: "gear",
  sprout: "sprout",
  autumn: "autumn",
};

function art(name: Match3IconName, className = "") {
  return renderArt(match3Icons[name], className);
}

function penpotArt(name: PenpotMatch3IconName, className = "") {
  return renderArt(penpotMatch3Icons[name], className);
}

function homeArt(name: keyof typeof penpotHomeIcons, className = "") {
  return renderArt(penpotHomeIcons[name], className);
}

function controlIcon(name: "back" | "pause" | "next") {
  return renderArt(penpotVectors[name], "m3-control-art");
}

function chipArt(chip: ChipId, className = "") {
  const exported = exportedChipIcons[chip];
  if (exported) return art(exported, className);
  const penpotIcon = penpotChipIcons[chip];
  if (penpotIcon) return penpotArt(penpotIcon, className);
  return "";
}

function themeArt(theme: MatchThreeTheme, className = "") {
  return theme.icon === "pot" ? art("pot", className) : chipArt(theme.icon, className);
}

function contextArt(theme: MatchThreeTheme, className = "") {
  const name =
    theme.id === "farm"
      ? "water"
      : theme.id === "dig"
        ? "compass"
        : theme.id === "quarry" || theme.id === "mine"
          ? "happy"
          : undefined;
  return name ? penpotArt(name, className) : chipArt("tree", className);
}

function samePosition(a: Position | undefined, b: Position) {
  return a?.row === b.row && a.column === b.column;
}

function positionKey(position: Position) {
  return `${position.row}:${position.column}`;
}

function resultLabel(theme: MatchThreeTheme) {
  return theme.kind === "dig" ? "Участок открыт!" : "Цель выполнена!";
}

export function mountMatchThree() {
  const root = $("#match3");
  const entry = $("#open-shifts");
  const preview = import.meta.env.DEV && new URLSearchParams(location.search).has("match3-preview");
  let screen: Screen = "hub";
  let modal: Modal;
  let selectedTheme: MatchThreeTheme = matchThreeThemes.sawmill;
  let digTargetCell: Axial | undefined;
  let shift: Shift | undefined;
  let selected: Position | undefined;
  let hint: Position[] = [];
  let presentationBoard: Board | undefined;
  let clearing: Position[] = [];
  let dropping: Position[] = [];
  let swapping: [Position, Position] | undefined;
  let boardPhase: "swap" | "return" | "clear" | "drop" | undefined;
  let busy = false;
  let lastLightningYield: number | undefined;
  let warehouse = initialWarehouse;
  let serverShifts: Match3State["shifts"] = [];
  let activeRun: Match3Run | null = null;
  let issue: { message: string; retry?: () => Promise<void> } | undefined;
  /** Раскопки сохраняют прогресс, если в смене закончились ходы. */
  let savedDigDepth = 0;
  let result: ResultState | undefined;
  let swipeStart:
    | { position: Position; clientX: number; clientY: number; pointerId: number }
    | undefined;

  const nightClass = () => (document.body.classList.contains("night") ? " m3-screen--night" : "");

  const publishWarehouse = () => {
    window.dispatchEvent(new CustomEvent("match3:warehouse", { detail: warehouse }));
  };

  const close = () => {
    root.hidden = true;
    modal = undefined;
    issue = undefined;
    document.body.classList.remove("match3-open");
    syncBrowserTheme();
  };
  const open = (target?: Axial) => {
    digTargetCell = target;
    if (target && !activeRun) {
      selectedTheme = matchThreeThemes.dig;
      screen = "brief";
    }
    root.hidden = false;
    document.body.classList.add("match3-open");
    modal = undefined;
    syncBrowserTheme();
    render();
    if (!preview) void perform(() => loadState(target ? "brief" : "hub"));
  };
  entry.addEventListener("click", () => open());

  function potPosition() {
    return shift?.amphora ?? undefined;
  }

  function stockFor(id: ShiftId) {
    return id === "dig" ? { amount: 0, limit: 0 } : warehouse[resources[id]];
  }

  function stockPercent(id: ShiftId) {
    const { amount, limit } = stockFor(id);
    return limit ? Math.min(100, (amount / limit) * 100) : 0;
  }

  function themeFor(id: ShiftId, rules?: Pick<ShiftView, "goal" | "moves">): MatchThreeTheme {
    const base = matchThreeThemes[id];
    return rules ? {
      ...base,
      mainChip: rules.goal.chipId ?? base.mainChip,
      goal: rules.goal.target,
      bonus: rules.goal.bonus,
      moves: rules.moves,
    } : base;
  }

  function gameBoard() {
    if (!shift) return "";
    const board = presentationBoard ?? shift.board;
    const hinted = new Set(hint.map(positionKey));
    const falling = new Set(dropping.map(positionKey));
    const cleared = new Set(clearing.map(positionKey));
    const pot = potPosition();
    return `<div class="m3-board" role="grid" aria-label="Игровое поле 8 на 8">${shift.board
      .map((row, rowIndex) =>
        row
          .map((chip, column) => {
            const position = { row: rowIndex, column };
            const isPot = samePosition(pot, position);
            const renderedChip = board[rowIndex][column];
            const label = isPot ? "Амфора" : chipPresentation[renderedChip].name;
            const swapTarget =
              swapping && samePosition(swapping[0], position)
                ? swapping[1]
                : swapping && samePosition(swapping[1], position)
                  ? swapping[0]
                  : undefined;
            const swapX = swapTarget
              ? swapTarget.column > column
                ? "calc(100% + 2px)"
                : swapTarget.column < column
                  ? "calc(-100% - 2px)"
                  : "0px"
              : "0px";
            const swapY = swapTarget
              ? swapTarget.row > rowIndex
                ? "calc(100% + 2px)"
                : swapTarget.row < rowIndex
                  ? "calc(-100% - 2px)"
                  : "0px"
              : "0px";
            const swapStyle = swapTarget
              ? ` style="--swap-x:${swapX};--swap-y:${swapY};--drop-delay:${rowIndex * 8}ms"`
              : falling.has(positionKey(position))
                ? ` style="--drop-delay:${rowIndex * 8}ms"`
                : "";
            const classes = [
              "m3-chip",
              `m3-chip--${chipPresentation[renderedChip].tone}`,
              isPot ? "m3-chip--pot" : "",
              samePosition(selected, position) ? "is-selected" : "",
              hinted.has(positionKey(position)) ? "is-hinted" : "",
              cleared.has(positionKey(position)) ? "is-clearing" : "",
              falling.has(positionKey(position)) ? "is-dropping" : "",
              boardPhase === "swap" && swapTarget ? "is-swapping" : "",
              boardPhase === "return" && swapTarget ? "is-returning" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const content = isPot ? art("pot", "m3-chip-art") : chipArt(renderedChip, "m3-chip-art");
            return `<button class="${classes}"${swapStyle} role="gridcell" data-cell="${rowIndex}:${column}" aria-label="${label}" aria-pressed="${samePosition(selected, position)}"${isPot ? " disabled" : ""}>${content}</button>`;
          })
          .join(""),
      )
      .join("")}</div>`;
  }

  function updateGameFrame() {
    if (!shift || screen !== "game" || !root.querySelector(".m3-game")) {
      render();
      return;
    }
    const currentBoard = root.querySelector(".m3-board");
    if (currentBoard) {
      const template = document.createElement("template");
      template.innerHTML = gameBoard();
      currentBoard.replaceWith(template.content.firstElementChild!);
    }
    const amount = root.querySelector<HTMLElement>("[data-match-amount]");
    const moves = root.querySelector<HTMLElement>("[data-match-moves]");
    const progress = root.querySelector<HTMLElement>("[data-match-progress]");
    if (amount)
      amount.textContent =
        shift.theme.kind === "dig"
          ? `${shift.digDepth >= shift.digTarget ? 1 : 0} / 1`
          : `${shift.collected} / ${shift.theme.goal}`;
    if (moves) moves.textContent = String(shift.moves);
    if (progress) {
      const value =
        shift.theme.kind === "dig"
          ? Math.min(100, (shift.digDepth / shift.digTarget) * 100)
          : Math.min(100, (shift.collected / shift.theme.goal) * 100);
      progress.style.width = `${value}%`;
    }
    updateGameActions();
  }

  function gameInstruction() {
    if (!shift) return "";
    if (lastLightningYield !== undefined)
      return `Молния собрала ${lastLightningYield} ${lastLightningYield === 1 ? "бревно" : lastLightningYield >= 2 && lastLightningYield <= 4 ? "бревна" : "брёвен"}. Ход не потрачен.`;
    if (shift.lightningArmed) return "Выбери ряд: молния соберёт все его фишки.";
    if (shift.lightningCharges > 0) return "Энергии хватает: молния очистит выбранный ряд.";
    if (shift.theme.id === "sawmill" && shift.moves === 1 && !selected)
      return `Последний ход: собери ещё ${Math.max(0, shift.theme.goal - shift.collected)} бревна для бонуса.`;
    return shift.theme.fieldNote;
  }

  function updateGameActions() {
    if (!shift) return;
    const banner = root.querySelector<HTMLElement>("[data-match-banner]");
    const note = root.querySelector<HTMLElement>("[data-match-field-note]");
    const lightningLabel = root.querySelector<HTMLElement>("[data-lightning-label]");
    if (banner) banner.textContent = shift.lightningCharges > 0 && !shift.lightningArmed
      ? "Энергии хватает · молния доступна" : shift.theme.contextText;
    if (note) note.textContent = gameInstruction();
    if (lightningLabel) lightningLabel.textContent = shift.lightningEnabled
      ? `Молния · ${shift.lightningCharges}` : "Нет энергии";
  }

  function changedPositions(before: Board, after: Board): Position[] {
    const changed: Position[] = [];
    for (let row = 0; row < before.length; row++)
      for (let column = 0; column < before[row].length; column++)
        if (before[row][column] !== after[row][column])
          changed.push({ row, column });
    return changed;
  }

  function overlay() {
    if (issue) {
      const retry = issue.retry
        ? '<button class="m3-primary" data-action="retry">Повторить</button><button class="m3-secondary" data-action="close">На остров</button>'
        : '<button class="m3-primary" data-action="close-issue">Понятно</button>';
      return `<div class="m3-modal-backdrop"><section class="m3-modal" role="alertdialog" aria-modal="true" aria-label="Рабочие смены"><p>${issue.message}</p>${retry}</section></div>`;
    }
    if (!modal) return "";
    const theme = screen === "brief" ? selectedTheme : shift?.theme ?? selectedTheme;
    const details = {
      noEnergy: { icon: "energy", title: "Нужно больше энергии", body: "Молния доступна при достаточном энергоснабжении острова. Пока можно собирать обычные ряды.", action: "Понятно" },
      noCharges: { icon: "energy", title: "Молния уже использована", body: "В этой смене заряд закончился. Продолжай собирать ряды. Новый заряд будет в следующей смене.", action: "Понятно" },
      storageFull: { icon: "box", title: `Склад ${theme.resourceName} заполнен`, body: "Потрать накопленное или построй ещё склад. Смена станет доступна, когда освободится место.", action: "К складу" },
      noWorkers: { icon: "worker", title: "Нужны работники", body: "Без работников смена не начнётся. Назначь хотя бы одного жителя в лесопилку.", action: "Назначить работников" },
      hint: { icon: "hint", title: "Как найти ход", body: "Найди две одинаковые фишки рядом. Поменяй соседнюю фишку так, чтобы собрать ряд из трёх или больше.", action: "Понятно" },
    } as const;
    let content: string;
    if (modal === "pause") {
      content = `<h2>Смена на паузе</h2><p>Продолжи или заверши сейчас. Вся собранная добыча останется у тебя.</p><strong class="m3-modal-resource">${art("backpack", "m3-inline-art")}<span>Добыча сохранится</span></strong><button class="m3-primary" data-action="resume">Продолжить смену</button><button class="m3-secondary" data-action="finish">Завершить смену</button>`;
    } else if (modal === "rules") {
      content = `<h2>Как играть</h2><div class="m3-rules-example">${art("rulesExample")}</div><p>Нажми на фишку, затем на соседнюю. Три одинаковых по горизонтали или вертикали исчезают. Неудачный обмен не тратит ход.</p><p>В рабочих сменах главные фишки дают по 1 ресурсу, а цель приносит бонусный ящик. Вся добыча сохраняется.</p><p>В раскопках расчищай путь под амфорой, пока она не дойдёт до нижнего края. Если не успеешь, глубина сохранится.</p><button class="m3-primary" data-action="close-modal">Понятно, играем!</button>`;
    } else {
      const info = details[modal];
      content = `<div class="m3-modal-icon">${art(info.icon)}</div><h2>${info.title}</h2><p>${info.body}</p><button class="m3-primary" data-action="close-modal">${info.action}</button>`;
    }
    return `<div class="m3-modal-backdrop" role="presentation"><section class="m3-modal m3-modal--${modal}" role="dialog" aria-modal="true" aria-label="${modal === "pause" ? "Смена на паузе" : modal === "rules" ? "Как играть" : details[modal].title}">${content}</section></div>`;
  }

  function hubCard(id: ShiftId, icon: ChipId | "pot", title: string, detail: string) {
    const rules = serverShifts.find((item) => item.shiftId === id);
    if (rules && id !== "dig") {
      const resource = detail.split(" · ")[0];
      detail = `${resource} · ${workersLabel(rules.assignedWorkers)}`;
    }
    return `<button class="m3-work-card" data-action="brief" data-shift="${id}">${icon === "pot" ? art("pot", "m3-card-icon") : chipArt(icon, "m3-card-icon")}<span><b>${title}</b><small>${detail}</small></span><i>${controlIcon("next")}</i></button>`;
  }

  function renderHub() {
    root.innerHTML = `<section class="m3-screen m3-hub${nightClass()}">
      <header class="m3-header"><button class="m3-icon-button" data-action="close" aria-label="Вернуться на остров">${controlIcon("back")}</button><div><h1>Рабочие смены</h1><p>Ресурсы для твоего острова</p></div></header>
      <main><section class="m3-hub-intro"><b>Каждому месту — своя смена</b><p>Собирай фишки на поле 8×8. Выбери, что нужно острову сейчас.</p></section>
        ${hubCard("sawmill", "log", "Лесопилка", "Дерево · 2 работника")}
        ${hubCard("farm", "wheat", "Ферма", "Еда · 2 работника")}
        ${hubCard("quarry", "rock", "Каменоломня", "Камень · 2 работника")}
        ${hubCard("mine", "pickaxe", "Рудник", "Железо · 1 работник")}
        ${hubCard("dig", "pot", "Раскопки", "Новый участок · древняя находка")}
        <button class="m3-island-button" data-action="close">На остров</button>
      </main></section>`;
  }

  function renderBrief() {
    const theme = selectedTheme;
    const { amount, limit } = stockFor(theme.id);
    const rules = serverShifts.find((item) => item.shiftId === theme.id);
    const digTarget = rules?.goal.targetDepth ?? 6;
    const staff = theme.kind === "resource" && rules ? workersLabel(rules.assignedWorkers) : theme.workers;
    const goalText =
      theme.kind === "dig"
        ? "Опусти амфору к нижнему краю"
        : `Собери ${theme.goal} ${theme.resourcePlural}`;
    const bonusText =
      theme.kind === "dig"
        ? "Провизия уже внесена. Глубина сохранится, даже если не успеешь."
        : `Бонусный ящик за цель: +${theme.bonus} ${theme.resourceName}. Вся добыча останется у тебя.`;
    root.innerHTML = `<section class="m3-screen m3-brief${nightClass()}">
      <header class="m3-header"><button class="m3-icon-button" data-action="hub" aria-label="К списку смен">${controlIcon("back")}</button><div><h1>${theme.title}</h1><p>Перед началом</p></div><span class="m3-shift-mark" aria-hidden="true">${controlIcon("pause")}</span></header>
      <main class="m3-brief-main"><section class="m3-brief-hero">${themeArt(theme, "m3-brief-icon")}<div><b>${theme.subtitle}</b><p>Смена приносит ресурсы на остров</p></div></section>
        <section class="m3-goal-card"><b>${goalText}</b><p>${bonusText}</p></section>
        <section class="m3-move-card"><div><b>Ходов в смене</b><strong>${theme.moves}</strong></div><p>${staff}</p></section>
        ${theme.kind === "dig" ? `<section class="m3-stock-card m3-stock-card--dig">${art("pot", "m3-stock-art")}<div><small>Глубина раскопок</small><i><em style="width:${(savedDigDepth / digTarget) * 100}%"></em></i></div><b>${savedDigDepth} / ${digTarget}</b></section>` : `<section class="m3-stock-card">${chipArt(theme.mainChip, "m3-stock-art")}<div><small>На складе</small><i><em style="width:${stockPercent(theme.id)}%"></em></i></div><b>${amount} / ${limit}</b></section>`}
        <p class="m3-note">${theme.kind === "dig" ? "Не успеешь за смену — продолжишь с той же глубины." : "Не достигнешь цели — все равно заберешь добычу. Играть можно снова без ограничения попыток."}</p>
        <button class="m3-primary m3-bottom-action" data-action="start">Начать смену</button>
      </main></section>`;
  }

  function renderGame() {
    if (!shift) return;
    const theme = shift.theme;
    const currentValue = theme.kind === "dig" ? (shift.digDepth >= shift.digTarget ? 1 : 0) : shift.collected;
    const goalHint = theme.kind === "dig" ? "Опусти к нижнему краю" : "Цель смены";
    const bannerText = shift.lightningCharges > 0 && !shift.lightningArmed ? "Энергии хватает · молния доступна" : theme.contextText;
    const fieldNote = gameInstruction();
    root.innerHTML = `<section class="m3-screen m3-game m3-game--${theme.id}${nightClass()}">
      <header class="m3-header"><button class="m3-icon-button" data-action="pause" aria-label="Поставить смену на паузу">${controlIcon("back")}</button><div><h1>${theme.title}</h1><p>${theme.subtitle}</p></div><button class="m3-icon-button" data-action="pause" aria-label="Поставить смену на паузу">${controlIcon("pause")}</button></header>
      <main><section class="m3-game-stats"><div class="m3-progress">${theme.kind === "dig" ? art("pot", "m3-resource-art") : chipArt(theme.mainChip, "m3-resource-art")}<div><small>${theme.mainChipName}</small><b data-match-amount>${currentValue} / ${theme.goal}</b><i><em data-match-progress style="width:${theme.kind === "dig" ? (shift.digDepth / shift.digTarget) * 100 : Math.min(100, (shift.collected / theme.goal) * 100)}%"></em></i><small>${goalHint}</small></div></div><div class="m3-moves"><small>ХОДЫ</small><b data-match-moves>${shift.moves}</b></div></section>
        <p class="m3-bonus-line">${contextArt(theme, "m3-line-art")}<span data-match-banner>${bannerText}</span></p>
        ${gameBoard()}
        <p class="m3-field-note" data-match-field-note>${fieldNote}</p>
        <nav class="m3-actions" aria-label="Действия"><button data-action="hint">${art("hint", "m3-action-art")}<span>Подсказка</span></button><button data-action="lightning">${art("energy", "m3-action-art")}<span data-lightning-label>${shift.lightningEnabled ? `Молния · ${shift.lightningCharges}` : "Нет энергии"}</span></button><button data-action="rules">${art("rules", "m3-action-art")}<span>Правила</span></button></nav>
        <section class="m3-reward-note">${theme.kind === "dig" ? penpotArt("map", "m3-reward-art") : art("box", "m3-reward-art")}<span><b>${theme.kind === "dig" ? "Награда: новый участок" : `Бонус за цель: +${theme.bonus} ${theme.resourceName}`}</b><small>${theme.kind === "dig" ? "Глубина сохранится, даже если не успеешь" : "Вся собранная добыча останется у тебя"}</small></span></section>
      </main></section>`;
  }

  function renderResult() {
    if (!result) return;
    const { theme, reward, digFound } = result;
    const { amount, limit } = stockFor(theme.id);
    if (theme.kind === "dig" && digFound) {
      root.innerHTML = `<section class="m3-screen m3-result m3-dig-result${nightClass()}"><header class="m3-header"><button class="m3-icon-button" data-action="close" aria-label="Вернуться на остров">${controlIcon("back")}</button><div><h1>Раскопки</h1><p>Итоги смены</p></div></header><main>
        <section class="m3-dig-result-hero"><span class="m3-result-icon">${art("pot")}</span><h2>Участок открыт!</h2><p class="m3-lead">Амфора добавлена в находки. Открыта новая территория.</p></section>
        <section class="m3-dig-discovery">${penpotArt("resultTree", "m3-dig-tree")}<span><b>Новый участок</b><p>Новые места для построек и развития острова.</p></span></section>
        <section class="m3-dig-info"><b>Амфора найдена</b><p>Находка останется в коллекции острова.</p></section>
        <button class="m3-primary m3-bottom-action" data-action="close">На остров</button><button class="m3-result-again" data-action="again">Ещё одна смена</button>
      </main></section>`;
      return;
    }
    const reachedGoal = reward.reachedGoal;
    const title = reachedGoal ? resultLabel(theme) : "Смена завершена";
    const detail = theme.kind === "dig"
      ? "Глубина раскопок сохранена. Продолжи с того же места в следующей смене."
      : reachedGoal
      ? "Бонусный ящик твой. Добыча уже на складе."
      : reward.credited
        ? "Цель можно выполнить в следующий раз. Собранная добыча уже у тебя."
        : "Ты еще ничего не собрал. Можно начать новую смену.";
    const retryLabel = reachedGoal ? "Ещё одна смена" : "Ещё одна попытка";
    const helpTitle = theme.kind === "dig" ? "Можно продолжить раскопки" : reachedGoal ? theme.resultHelpTitle : "Вся добыча сохраняется";
    const helpText = theme.kind === "dig" ? "Провизия за этот участок уже внесена." : reachedGoal ? theme.resultHelpText : "Попробуй ещё раз, когда захочешь.";
    root.innerHTML = `<section class="m3-screen m3-result${nightClass()}"><header class="m3-header"><button class="m3-icon-button" data-action="close" aria-label="Вернуться на остров">${controlIcon("back")}</button><div><h1>${reachedGoal ? theme.title : "Итоги смены"}</h1><p>${reachedGoal ? "Итоги смены" : "Добыча сохранена"}</p></div></header><main>
      <section class="m3-result-hero${reachedGoal ? "" : " m3-result-hero--plain"}">${reachedGoal ? `<span class="m3-result-icon">${art("win")}</span>` : `<span class="m3-result-icon m3-result-icon--basket">${homeArt("basket")}</span>`}<h2>${title}</h2><p class="m3-lead">${detail}</p></section>
      ${theme.kind === "resource" && reward.collected > 0 ? `<section class="m3-result-card"><div><small>Собрано ${theme.resourceName}</small><b>${reward.collected}</b></div><div><small>${reward.bonus ? "Бонус за цель" : "Бонус не получен"}</small><b>${reward.bonus ? `+${reward.bonus}` : "—"}</b></div><div class="m3-result-total"><small>Всего на склад</small><b>${reward.credited}</b>${reward.overflow ? `<small>Не поместилось: ${reward.overflow}</small>` : ""}</div></section>
      <section class="m3-stock">${chipArt(theme.mainChip, "m3-stock-art")}<div><small>Теперь на складе</small><i><em style="width:${stockPercent(theme.id)}%"></em></i></div><b>${amount} / ${limit}</b></section>` : ""}
      <section class="m3-result-help"><b>${helpTitle}</b><p>${helpText}</p></section>
      <button class="m3-primary m3-bottom-action" data-action="${reachedGoal ? "close" : "hub"}">${reachedGoal ? "На остров" : "Выбрать смену"}</button><button class="m3-result-again" data-action="${reachedGoal ? "again" : "close"}">${reachedGoal ? retryLabel : "На остров"}</button>
    </main></section>`;
  }

  function render() {
    if (screen === "hub") renderHub();
    else if (screen === "brief") renderBrief();
    else if (screen === "game") renderGame();
    else renderResult();
    root.querySelector(".m3-screen")?.insertAdjacentHTML("beforeend", overlay());
  }

  function clearAnimation() {
    presentationBoard = undefined;
    clearing = [];
    dropping = [];
    swapping = undefined;
    boardPhase = undefined;
  }

  function showRun(run: Match3Run) {
    const rules = serverShifts.find((item) => item.shiftId === run.shiftId);
    const theme = themeFor(run.shiftId, { goal: run.goal, moves: rules?.moves ?? run.movesLeft });
    activeRun = run;
    selectedTheme = theme;
    shift = {
      theme,
      board: run.board,
      moves: run.movesLeft,
      collected: run.collected,
      digDepth: run.digDepth,
      digTarget: run.goal.targetDepth ?? 6,
      amphora: run.amphora,
      lightningCharges: run.chargesLeft,
      lightningEnabled: run.chargesLeft > 0 || (rules?.charges ?? 0) > 0,
      lightningArmed: false,
    };
    selected = undefined;
    hint = [];
    modal = undefined;
    screen = "game";
  }

  function showResult(saved: Match3Result, settledNow: boolean) {
    activeRun = null;
    selectedTheme = themeFor(saved.shiftId, serverShifts.find((item) => item.shiftId === saved.shiftId));
    result = {
      theme: selectedTheme,
      digFound: saved.shiftId === "dig" && saved.goalReached,
      reward: {
        collected: saved.collected,
        bonus: saved.bonus,
        credited: saved.credited,
        overflow: saved.overflow,
        reachedGoal: saved.goalReached,
      },
    };
    if (settledNow) {
      warehouse = saved.warehouse;
      if (saved.dig) savedDigDepth = saved.dig.savedDepth;
      publishWarehouse();
      if (saved.dig?.revealedCell) {
        window.dispatchEvent(new CustomEvent("match3:cell-revealed", { detail: saved.dig.revealedCell }));
      }
    }
    const stock = saved.resourceId ? warehouse[saved.resourceId] : undefined;
    modal = settledNow && stock && stock.amount >= stock.limit ? "storageFull" : undefined;
    screen = "result";
  }

  async function loadState(next: "hub" | "brief" | "result" = "hub") {
    const state = await match3Api.state();
    warehouse = state.warehouse;
    serverShifts = state.shifts;
    activeRun = state.activeRun;
    savedDigDepth = state.digDepth;
    lastLightningYield = undefined;
    clearAnimation();
    publishWarehouse();
    if (activeRun) {
      digTargetCell = undefined;
      showRun(activeRun);
    } else if (next === "result" && state.lastResult) {
      showResult(state.lastResult, false);
    } else {
      const id = selectedTheme.id;
      selectedTheme = themeFor(id, serverShifts.find((item) => item.shiftId === id));
      modal = undefined;
      screen = next === "brief" || (digTargetCell && !root.hidden) ? "brief" : "hub";
    }
  }

  const errorModals: Partial<Record<string, Modal>> = {
    warehouse_full: "storageFull",
    no_workers: "noWorkers",
    no_charges: "noCharges",
    no_energy: "noEnergy",
  };

  async function perform(operation: () => Promise<void>) {
    if (busy) return;
    busy = true;
    issue = undefined;
    root.setAttribute("aria-busy", "true");
    try {
      await operation();
    } catch (error) {
      if (error instanceof Match3ApiError && errorModals[error.code]) {
        modal = errorModals[error.code];
      } else if (error instanceof Match3ApiError && [
        "stale_revision", "active_run", "run_finished", "run_not_found", "world_not_found",
      ].includes(error.code)) {
        const restore = () => loadState(screen === "game" ? "result" : "hub");
        try {
          await restore();
          if (error.code === "stale_revision" && screen === "game") {
            issue = { message: "Поле обновилось. Проверь фишки и сделай ход ещё раз." };
          }
        } catch {
          issue = { message: "Не удалось обновить состояние смены.", retry: restore };
        }
      } else if (error instanceof Match3ApiError && error.retryable) {
        issue = { message: "Сервер не ответил. Попробуй ещё раз.", retry: operation };
      } else {
        if (!(error instanceof Match3ApiError)) console.error(error);
        issue = {
          message: error instanceof Match3ApiError && error.code === "no_excavation_site"
            ? "Сейчас нет доступного участка для раскопок."
            : error instanceof Match3ApiError && error.code === "unfinished_excavation"
              ? "Сначала закончи раскопки на начатом участке."
            : "Не удалось выполнить действие. Вернись к списку смен и попробуй ещё раз.",
        };
      }
    } finally {
      busy = false;
      root.removeAttribute("aria-busy");
      clearAnimation();
      render();
    }
  }

  function startShift() {
    const id = selectedTheme.id;
    const key = match3RequestKey();
    const target = id === "dig" ? digTargetCell : undefined;
    return perform(async () => {
      const run = await match3Api.start(id, key, target);
      digTargetCell = undefined;
      lastLightningYield = undefined;
      showRun(run);
    });
  }

  function finishShift() {
    const run = activeRun;
    if (!run) return;
    const key = match3RequestKey();
    return perform(async () => {
      showResult(await match3Api.finish(run, key), true);
    });
  }

  const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

  async function playSteps(steps: Match3Step[]) {
    if (!shift) return;
    for (const step of steps) {
      swapping = undefined;
      if (step.cleared.length) {
        shift.amphora = step.amphoraBefore;
        presentationBoard = step.before;
        clearing = step.cleared;
        dropping = [];
        boardPhase = "clear";
        updateGameFrame();
        await wait(180);
      }
      clearing = [];
      presentationBoard = step.after;
      dropping = changedPositions(step.before, step.after);
      boardPhase = "drop";
      shift.collected += step.earned;
      shift.amphora = step.amphoraAfter;
      if (step.amphoraAfter) shift.digDepth = step.amphoraAfter.row - 1;
      updateGameFrame();
      await wait(300);
    }
  }

  function settleRun(run: Match3Run) {
    if (run.result) showResult(run.result, true);
    else showRun(run);
  }

  function useLightning() {
    const run = activeRun;
    if (!run || !shift || busy) return;
    if (shift.lightningCharges < 1) {
      modal = shift.lightningEnabled ? "noCharges" : "noEnergy";
      render();
      return;
    }
    if (!selected) {
      shift.lightningArmed = true;
      hint = [];
      updateGameFrame();
      return;
    }
    const row = selected.row;
    const key = match3RequestKey();
    selected = undefined;
    hint = [];
    shift.lightningArmed = false;
    return perform(async () => {
      const response = await match3Api.lightning(run, row, key);
      if (shift) shift.lightningCharges = response.chargesLeft;
      await playSteps(response.steps);
      lastLightningYield = response.steps.reduce((sum, step) => sum + step.earned, 0);
      settleRun(response);
    });
  }

  function playMove(from: Position, to: Position) {
    const run = activeRun;
    if (!run || !shift || busy || samePosition(potPosition(), from) || samePosition(potPosition(), to)) return;
    if (shift.lightningArmed) {
      selected = to;
      return useLightning();
    }
    selected = undefined;
    lastLightningYield = undefined;
    hint = [];
    const key = match3RequestKey();
    return perform(async () => {
      const response = await match3Api.move(run, from, to, key);
      if (response.accepted || response.rejectionReason === "no_match") {
        presentationBoard = run.board;
        swapping = [from, to];
        boardPhase = "swap";
        updateGameFrame();
        await wait(180);
        if (!response.accepted) {
          presentationBoard = response.swappedBoard;
          boardPhase = "return";
          updateGameFrame();
          await wait(160);
        }
      }
      if (shift) shift.moves = response.movesLeft;
      await playSteps(response.steps);
      settleRun(response);
    });
  }

  function showHint() {
    const run = activeRun;
    if (!run) return;
    return perform(async () => {
      const response = await match3Api.hint(run);
      if (response.revision !== run.revision || !response.available) {
        await loadState("result");
        return;
      }
      hint = response.from && response.to ? [response.from, response.to] : [];
      selected = undefined;
      if (shift) shift.lightningArmed = false;
    });
  }

  async function playCell(clicked: Position) {
    if (!shift || busy || samePosition(potPosition(), clicked)) return;
    if (shift.lightningArmed) {
      selected = clicked;
      void useLightning();
      return;
    }
    lastLightningYield = undefined;
    if (!selected || samePosition(selected, clicked) || !areAdjacent(selected, clicked)) {
      selected = samePosition(selected, clicked) ? undefined : clicked;
      hint = [];
      updateGameFrame();
      updateGameActions();
      return;
    }
    await playMove(selected, clicked);
  }

  root.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action], [data-cell]");
    if (!target || busy || ((issue || modal) && !target.closest(".m3-modal"))) return;
    const action = target.dataset.action;
    if (target.dataset.cell && shift) {
      const [row, column] = target.dataset.cell.split(":").map(Number);
      void playCell({ row, column });
      return;
    }
    if (action === "close") close();
    else if (action === "retry" && issue?.retry) {
      void perform(issue.retry);
      return;
    } else if (action === "close-issue") issue = undefined;
    else if (action === "hub") {
      digTargetCell = undefined;
      if (preview) screen = "hub";
      else {
        void perform(loadState);
        return;
      }
    }
    else if (action === "brief") {
      const id = target.dataset.shift as ShiftId;
      selectedTheme = themeFor(id, serverShifts.find((item) => item.shiftId === id));
      screen = "brief";
    } else if (action === "start") {
      if (!preview) void startShift();
      return;
    } else if (action === "again") {
      if (preview) screen = "brief";
      else {
        void perform(() => loadState("brief"));
        return;
      }
    }
    else if (action === "pause") modal = "pause";
    else if (action === "resume" || action === "close-modal") modal = undefined;
    else if (action === "finish") {
      void finishShift();
      return;
    } else if (action === "rules") modal = "rules";
    else if (action === "lightning") {
      void useLightning();
      return;
    }
    else if (action === "hint" && shift) {
      void showHint();
      return;
    }
    render();
  });

  root.addEventListener("pointerdown", (event) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!cell || !shift || busy || issue || modal || cell.hasAttribute("disabled") || (event.pointerType === "mouse" && event.button !== 0)) return;
    const [row, column] = cell.dataset.cell!.split(":").map(Number);
    swipeStart = { position: { row, column }, clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId };
  });
  root.addEventListener("pointerup", (event) => {
    const start = swipeStart;
    swipeStart = undefined;
    if (!start || start.pointerId !== event.pointerId || !shift || busy || issue || modal) return;
    const target = positionFromSwipe(start.position, event.clientX - start.clientX, event.clientY - start.clientY, shift.board.length);
    if (!target) return;
    event.preventDefault();
    void playMove(start.position, target);
  });
  root.addEventListener("pointercancel", () => { swipeStart = undefined; });
  // Фиксированные состояния для визуальной проверки. В production ветка удаляется Vite.
  if (preview) {
    window.addEventListener("match3:preview", (event) => {
      const fixture = (event as CustomEvent<{
        theme: ShiftId; night: boolean; screen: Screen; modal?: Modal;
        board?: (ChipId | "digRock")[][]; moves?: number; collected?: number; depth?: number;
        charges?: number; lightningEnabled?: boolean; armed?: boolean; selected?: Position; hint?: Position[]; lightningYield?: number;
        clearing?: Position[]; stock?: number; won?: boolean;
      }>).detail;
      if (busy) throw new Error("Дождитесь окончания анимации перед предпросмотром");
      document.body.classList.toggle("night", fixture.night);
      open();
      root.classList.add("m3-preview");
      selectedTheme = matchThreeThemes[fixture.theme];
      screen = fixture.screen;
      modal = fixture.modal;
      const depth = fixture.depth ?? 0;
      shift = {
        theme: selectedTheme,
        board: fixture.board?.map((row) => row.map((chip) => chip === "digRock" ? "rock" : chip)) ?? createBoard(selectedTheme.chips),
        moves: fixture.moves ?? selectedTheme.moves, collected: fixture.collected ?? 0,
        digDepth: depth, digTarget: 6,
        amphora: selectedTheme.kind === "dig" ? { row: Math.min(7, 1 + depth), column: 3 } : null,
        lightningCharges: fixture.charges ?? 0,
        lightningEnabled: fixture.lightningEnabled ?? (fixture.charges ?? 0) > 0,
        lightningArmed: fixture.armed ?? false,
      };
      lastLightningYield = fixture.lightningYield;
      selected = fixture.selected;
      hint = fixture.hint ?? [];
      clearing = fixture.clearing ?? [];
      presentationBoard = undefined;
      dropping = [];
      swapping = undefined;
      boardPhase = undefined;
      if (fixture.theme !== "dig") {
        warehouse = { ...warehouse, [resources[fixture.theme]]: { amount: fixture.stock ?? 120, limit: 200 } };
      }
      const reward = resultReward(fixture.won ? selectedTheme.goal : (fixture.collected ?? 0), selectedTheme);
      result = fixture.screen === "result" ? {
        theme: selectedTheme, digFound: fixture.theme === "dig" && !!fixture.won,
        reward: { ...reward, credited: reward.total, overflow: 0 },
      } : undefined;
      render();
      root.scrollTop = 0;
    });
  }
  publishWarehouse();
  render();
  if (!preview) void perform(loadState);
  return { openDig: (target: Axial) => open(target) };
}
