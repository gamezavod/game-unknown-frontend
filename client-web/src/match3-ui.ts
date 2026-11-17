import { renderArt } from "./ui-art";
import { penpotVectors } from "./penpot-vectors";
import {
  attemptMove,
  chipPresentation,
  createBoard,
  dropAndRefill,
  findPossibleMoves,
  matchThreeThemes,
  nextDigDepth,
  positionFromSwipe,
  resultReward,
  type Board,
  type ChipId,
  type MatchThreeTheme,
  type Position,
  type ShiftId,
} from "./match3";
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
  /** Заряд молнии очищает выбранный ряд без траты хода. */
  lightningCharges: number;
  lightningEnabled: boolean;
  /** После нажатия молнии следующая выбранная фишка задает очищаемый ряд. */
  lightningArmed: boolean;
}

interface ResultState {
  reward: ReturnType<typeof resultReward>;
  theme: MatchThreeTheme;
  digFound: boolean;
}

const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!;
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
  digRock: "rock",
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
  let screen: Screen = "hub";
  let modal: Modal;
  let selectedTheme: MatchThreeTheme = matchThreeThemes.sawmill;
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
  const warehouse: Record<ShiftId, number> = {
    sawmill: 120,
    farm: 80,
    quarry: 60,
    mine: 0,
    dig: 0,
  };
  /** Раскопки сохраняют прогресс, если в смене закончились ходы. */
  let savedDigDepth = 0;
  let result: ResultState | undefined;
  let swipeStart:
    | { position: Position; clientX: number; clientY: number; pointerId: number }
    | undefined;

  const nightClass = () => (document.body.classList.contains("night") ? " m3-screen--night" : "");
  const setBrowserChrome = (color: string, scheme: "light" | "dark" = "light") => {
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", color);
    document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')?.setAttribute("content", scheme);
    // На iOS 26 цвет безопасной зоны берется из html/body, а не из theme-color.
    document.documentElement.style.backgroundColor = color;
    document.body.style.backgroundColor = color;
    document.documentElement.style.colorScheme = scheme;
  };

  const publishWarehouse = () => {
    window.dispatchEvent(new CustomEvent("match3:warehouse", {
      detail: {
        wood: warehouse.sawmill,
        food: warehouse.farm,
        stone: warehouse.quarry,
        iron: warehouse.mine,
      },
    }));
  };

  const close = () => {
    root.hidden = true;
    modal = undefined;
    document.body.classList.remove("match3-open");
    setBrowserChrome(
      document.body.classList.contains("night") ? "#102a40" : "#bdd6d3",
      document.body.classList.contains("night") ? "dark" : "light",
    );
  };
  const open = () => {
    root.hidden = false;
    document.body.classList.add("match3-open");
    screen = "hub";
    modal = undefined;
    setBrowserChrome(
      document.body.classList.contains("night") ? "#0d202b" : "#f1f5ef",
      document.body.classList.contains("night") ? "dark" : "light",
    );
    render();
  };
  entry.addEventListener("click", open);

  function potPosition(current = shift) {
    if (!current || current.theme.kind !== "dig") return undefined;
    return { row: Math.min(7, 1 + current.digDepth), column: 3 };
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
          ? `${shift.digDepth >= 6 ? 1 : 0} / 1`
          : `${shift.collected} / ${shift.theme.goal}`;
    if (moves) moves.textContent = String(shift.moves);
    if (progress) {
      const value =
        shift.theme.kind === "dig"
          ? Math.min(100, (shift.digDepth / 6) * 100)
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
    const stock = warehouse[theme.id];
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
        <section class="m3-move-card"><div><b>Ходов в смене</b><strong>${theme.moves}</strong></div><p>${theme.workers}</p></section>
        ${theme.kind === "dig" ? `<section class="m3-stock-card m3-stock-card--dig">${art("pot", "m3-stock-art")}<div><small>Глубина раскопок</small><i><em style="width:${(savedDigDepth / 6) * 100}%"></em></i></div><b>${savedDigDepth} / 6</b></section>` : `<section class="m3-stock-card">${themeArt(theme, "m3-stock-art")}<div><small>На складе</small><i><em style="width:${(stock / 200) * 100}%"></em></i></div><b>${stock} / 200</b></section>`}
        <p class="m3-note">${theme.kind === "dig" ? "Не успеешь за смену — продолжишь с той же глубины." : "Не достигнешь цели — все равно заберешь добычу. Играть можно снова без ограничения попыток."}</p>
        <button class="m3-primary m3-bottom-action" data-action="start">Начать смену</button>
      </main></section>`;
  }

  function renderGame() {
    if (!shift) return;
    const theme = shift.theme;
    const currentValue = theme.kind === "dig" ? (shift.digDepth >= 6 ? 1 : 0) : shift.collected;
    const goalHint = theme.kind === "dig" ? "Опусти к нижнему краю" : "Цель смены";
    const lightningAvailable = shift.lightningCharges > 0;
    const bannerText = shift.lightningCharges > 0 && !shift.lightningArmed ? "Энергии хватает · молния доступна" : theme.contextText;
    const fieldNote = gameInstruction();
    root.innerHTML = `<section class="m3-screen m3-game m3-game--${theme.id}${nightClass()}">
      <header class="m3-header"><button class="m3-icon-button" data-action="pause" aria-label="Поставить смену на паузу">${controlIcon("back")}</button><div><h1>${theme.title}</h1><p>${theme.subtitle}</p></div><button class="m3-icon-button" data-action="pause" aria-label="Поставить смену на паузу">${controlIcon("pause")}</button></header>
      <main><section class="m3-game-stats"><div class="m3-progress">${themeArt(theme, "m3-resource-art")}<div><small>${theme.mainChipName}</small><b data-match-amount>${currentValue} / ${theme.goal}</b><i><em data-match-progress style="width:${theme.kind === "dig" ? (shift.digDepth / 6) * 100 : Math.min(100, (shift.collected / theme.goal) * 100)}%"></em></i><small>${goalHint}</small></div></div><div class="m3-moves"><small>ХОДЫ</small><b data-match-moves>${shift.moves}</b></div></section>
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
    if (theme.kind === "dig" && digFound) {
      root.innerHTML = `<section class="m3-screen m3-result m3-dig-result${nightClass()}"><header class="m3-header"><button class="m3-icon-button" data-action="close" aria-label="Вернуться на остров">${controlIcon("back")}</button><div><h1>Раскопки</h1><p>Итоги смены</p></div></header><main>
        <section class="m3-dig-result-hero"><span class="m3-result-icon">${art("pot")}</span><h2>Участок открыт!</h2><p class="m3-lead">Амфора добавлена в находки. На острове стала доступна новая территория.</p></section>
        <section class="m3-dig-discovery">${penpotArt("resultTree", "m3-dig-tree")}<span><b>Лес и река</b><p>Новые места для построек и развития острова.</p></span></section>
        <section class="m3-dig-info"><b>Амфора найдена</b><p>Находка останется в коллекции острова.</p></section>
        <button class="m3-primary m3-bottom-action" data-action="close">На остров</button><button class="m3-result-again" data-action="again">Ещё одна смена</button>
      </main></section>`;
      return;
    }
    const reachedGoal = reward.reachedGoal;
    const title = reachedGoal ? resultLabel(theme) : "Смена завершена";
    const detail = reachedGoal
      ? "Бонусный ящик твой. Добыча уже на складе."
      : reward.collected
        ? "Цель можно выполнить в следующий раз. Собранная добыча уже у тебя."
        : "Ты еще ничего не собрал. Можно начать новую смену.";
    const retryLabel = reachedGoal ? "Ещё одна смена" : "Ещё одна попытка";
    const helpTitle = reachedGoal ? theme.resultHelpTitle : "Вся добыча сохраняется";
    const helpText = reachedGoal ? theme.resultHelpText : "Нет потери ресурсов и ограничений на число попыток. Попробуй ещё раз, когда захочешь.";
    root.innerHTML = `<section class="m3-screen m3-result${nightClass()}"><header class="m3-header"><button class="m3-icon-button" data-action="close" aria-label="Вернуться на остров">${controlIcon("back")}</button><div><h1>${reachedGoal ? theme.title : "Итоги смены"}</h1><p>${reachedGoal ? "Итоги смены" : "Добыча сохранена"}</p></div></header><main>
      <section class="m3-result-hero${reachedGoal ? "" : " m3-result-hero--plain"}">${reachedGoal ? `<span class="m3-result-icon">${art("win")}</span>` : `<span class="m3-result-icon m3-result-icon--basket">${homeArt("basket")}</span>`}<h2>${title}</h2><p class="m3-lead">${detail}</p></section>
      ${reachedGoal ? `<section class="m3-result-card"><div><small>Собрано ${theme.resourceName}</small><b>${reward.collected}</b></div><div><small>${reward.bonus ? "Бонус за цель" : "Бонус не получен"}</small><b>${reward.bonus ? `+${reward.bonus}` : "—"}</b></div><div class="m3-result-total"><small>Всего на склад</small><b>${reward.total}</b></div></section>
      <section class="m3-stock">${themeArt(theme, "m3-stock-art")}<div><small>Теперь на складе</small><i><em style="width:${(warehouse[theme.id] / 200) * 100}%"></em></i></div><b>${warehouse[theme.id]} / 200</b></section>` : ""}
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

  function startShift() {
    if (selectedTheme.kind === "resource" && warehouse[selectedTheme.id] >= 200) {
      modal = "storageFull";
      render();
      return;
    }
    shift = {
      board: createBoard(selectedTheme.chips),
      moves: selectedTheme.moves,
      collected: 0,
      theme: selectedTheme,
      digDepth: selectedTheme.kind === "dig" ? savedDigDepth : 0,
      // В прототипе лесопилка начинает с одним зарядом, чтобы механику можно было проверить.
      lightningCharges: selectedTheme.id === "sawmill" ? 1 : 0,
      lightningEnabled: selectedTheme.id === "sawmill",
      lightningArmed: false,
    };
    selected = undefined;
    hint = [];
    lastLightningYield = undefined;
    result = undefined;
    presentationBoard = undefined;
    clearing = [];
    dropping = [];
    swapping = undefined;
    boardPhase = undefined;
    screen = "game";
  }

  function finishShift() {
    if (!shift) return;
    const reachedDigEnd = shift.theme.kind === "dig" && shift.digDepth >= 6;
    let storageJustFilled = false;
    const reward = resultReward(
      shift.theme.kind === "dig" ? (reachedDigEnd ? 1 : 0) : shift.collected,
      shift.theme,
    );
    if (shift.theme.kind === "dig") {
      if (reachedDigEnd) savedDigDepth = 0;
      else savedDigDepth = Math.max(savedDigDepth, shift.digDepth);
    } else {
      warehouse[shift.theme.id] = Math.min(200, warehouse[shift.theme.id] + reward.total);
      storageJustFilled = warehouse[shift.theme.id] >= 200;
      publishWarehouse();
    }
    result = { reward, theme: shift.theme, digFound: reachedDigEnd };
    modal = storageJustFilled ? "storageFull" : undefined;
    screen = "result";
    render();
  }

  const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

  async function useLightning() {
    if (!shift || busy) return;
    if (shift.lightningCharges < 1) {
      modal = shift.lightningEnabled ? "noCharges" : "noEnergy";
      render();
      return;
    }
    if (!selected) {
      shift.lightningArmed = true;
      hint = [];
      updateGameActions();
      return;
    }
    busy = true;
    const cleared = shift.board[selected.row].map((_, column) => ({ row: selected!.row, column }));
    const earned = cleared.filter((position) => shift!.board[position.row][position.column] === shift!.theme.mainChip).length;
    presentationBoard = shift.board;
    clearing = cleared;
    boardPhase = "clear";
    updateGameFrame();
    await wait(180);
    const after = dropAndRefill(shift.board, cleared, shift.theme.chips, Math.random);
    clearing = [];
    presentationBoard = after;
    dropping = changedPositions(shift.board, after);
    boardPhase = "drop";
    shift.lightningCharges--;
    shift.lightningArmed = false;
    shift.collected += earned;
    lastLightningYield = earned;
    selected = undefined;
    updateGameFrame();
    updateGameActions();
    await wait(300);
    shift.board = after;
    presentationBoard = undefined;
    dropping = [];
    boardPhase = undefined;
    busy = false;
    if (shift.collected >= shift.theme.goal) finishShift();
    else {
      updateGameFrame();
      updateGameActions();
    }
  }

  async function playMove(from: Position, clicked: Position) {
    lastLightningYield = undefined;
    if (!shift || busy || samePosition(potPosition(), from) || samePosition(potPosition(), clicked)) return;
    selected = undefined;
    hint = [];
    busy = true;
    const move = attemptMove(shift.board, from, clicked, shift.theme);
    presentationBoard = shift.board;
    swapping = [from, clicked];
    boardPhase = "swap";
    updateGameFrame();
    await wait(180);
    if (!move.accepted) {
      presentationBoard = move.swappedBoard;
      boardPhase = "return";
      updateGameFrame();
      await wait(160);
      presentationBoard = undefined;
      swapping = undefined;
      boardPhase = undefined;
      busy = false;
      updateGameFrame();
      return;
    }
    for (const step of move.steps) {
      const earned = step.cleared.filter((position) => step.before[position.row][position.column] === shift!.theme.mainChip).length;
      presentationBoard = step.before;
      clearing = step.cleared;
      dropping = [];
      boardPhase = "clear";
      updateGameFrame();
      await wait(180);
      clearing = [];
      presentationBoard = step.after;
      boardPhase = "drop";
      dropping = changedPositions(step.before, step.after);
      if (shift.theme.kind === "dig") shift.digDepth = nextDigDepth(shift.digDepth, step.cleared);
      else shift.collected += earned;
      updateGameFrame();
      await wait(300);
      const reachedGoal = shift.theme.kind === "dig" ? shift.digDepth >= 6 : shift.collected >= shift.theme.goal;
      if (reachedGoal) {
        shift.board = step.after;
        shift.moves--;
        presentationBoard = undefined;
        boardPhase = undefined;
        dropping = [];
        swapping = undefined;
        busy = false;
        finishShift();
        return;
      }
    }
    shift.board = move.board;
    shift.moves--;
    presentationBoard = undefined;
    boardPhase = undefined;
    dropping = [];
    swapping = undefined;
    busy = false;
    if (shift.moves === 0) finishShift();
    else updateGameFrame();
  }

  async function playCell(clicked: Position) {
    if (!shift || busy || samePosition(potPosition(), clicked)) return;
    if (shift.lightningArmed) {
      selected = clicked;
      void useLightning();
      return;
    }
    lastLightningYield = undefined;
    if (!selected || samePosition(selected, clicked)) {
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
    if (!target) return;
    const action = target.dataset.action;
    if (target.dataset.cell && shift) {
      const [row, column] = target.dataset.cell.split(":").map(Number);
      void playCell({ row, column });
      return;
    }
    if (action === "close") close();
    else if (action === "hub") screen = "hub";
    else if (action === "brief") {
      selectedTheme = matchThreeThemes[target.dataset.shift as ShiftId] ?? matchThreeThemes.sawmill;
      screen = "brief";
    } else if (action === "start") startShift();
    else if (action === "again") screen = "brief";
    else if (action === "pause") modal = "pause";
    else if (action === "resume" || action === "close-modal") modal = undefined;
    else if (action === "finish") {
      finishShift();
      return;
    } else if (action === "rules") modal = "rules";
    else if (action === "lightning") {
      void useLightning();
      return;
    }
    else if (action === "hint" && shift) {
      hint = findPossibleMoves(shift.board)[0] ?? [];
      selected = undefined;
      updateGameFrame();
      return;
    }
    render();
  });

  root.addEventListener("pointerdown", (event) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!cell || !shift || busy || cell.hasAttribute("disabled") || (event.pointerType === "mouse" && event.button !== 0)) return;
    const [row, column] = cell.dataset.cell!.split(":").map(Number);
    swipeStart = { position: { row, column }, clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId };
  });
  root.addEventListener("pointerup", (event) => {
    const start = swipeStart;
    swipeStart = undefined;
    if (!start || start.pointerId !== event.pointerId || !shift || busy) return;
    const target = positionFromSwipe(start.position, event.clientX - start.clientX, event.clientY - start.clientY, shift.board.length);
    if (!target) return;
    event.preventDefault();
    void playMove(start.position, target);
  });
  root.addEventListener("pointercancel", () => { swipeStart = undefined; });
  // Фиксированные состояния для визуальной проверки. В production ветка удаляется Vite.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("match3-preview")) {
    window.addEventListener("match3:preview", (event) => {
      const fixture = (event as CustomEvent<{
        theme: ShiftId; night: boolean; screen: Screen; modal?: Modal;
        board?: Board; moves?: number; collected?: number; depth?: number;
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
      shift = {
        theme: selectedTheme, board: fixture.board ?? createBoard(selectedTheme.chips),
        moves: fixture.moves ?? selectedTheme.moves, collected: fixture.collected ?? 0,
        digDepth: fixture.depth ?? 0, lightningCharges: fixture.charges ?? 0,
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
      warehouse[fixture.theme] = fixture.stock ?? 120;
      result = fixture.screen === "result" ? {
        theme: selectedTheme, digFound: fixture.theme === "dig" && !!fixture.won,
        reward: resultReward(fixture.won ? selectedTheme.goal : (fixture.collected ?? 0), selectedTheme),
      } : undefined;
      render();
      root.scrollTop = 0;
    });
  }
  publishWarehouse();
  render();
}
