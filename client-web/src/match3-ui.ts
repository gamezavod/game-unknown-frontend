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
type Modal = "pause" | "rules" | "storageFull" | "noCharges" | undefined;

interface Shift {
  board: Board;
  moves: number;
  collected: number;
  theme: MatchThreeTheme;
  /** Сколько рядов амфора уже прошла в текущих раскопках. */
  digDepth: number;
  /** Заряд молнии очищает выбранный ряд без траты хода. */
  lightningCharges: number;
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
  const exported = match3Icons[name];
  const src = exported.startsWith("data:") ? exported : `data:image/png;base64,${exported}`;
  return `<img class="m3-art ${className}" src="${src}" alt="" aria-hidden="true">`;
}

function penpotArt(name: PenpotMatch3IconName, className = "") {
  return `<img class="m3-art ${className}" src="data:image/png;base64,${penpotMatch3Icons[name]}" alt="" aria-hidden="true">`;
}

function homeArt(name: keyof typeof penpotHomeIcons, className = "") {
  return `<img class="m3-art ${className}" src="data:image/png;base64,${penpotHomeIcons[name]}" alt="" aria-hidden="true">`;
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
  };
  const open = () => {
    root.hidden = false;
    screen = "hub";
    modal = undefined;
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

  function updateGameActions() {
    if (!shift) return;
    const lightningAvailable = shift.lightningCharges > 0;
    const banner = root.querySelector<HTMLElement>("[data-match-banner]");
    const note = root.querySelector<HTMLElement>("[data-match-field-note]");
    const lightningLabel = root.querySelector<HTMLElement>("[data-lightning-label]");
    if (banner) banner.textContent = shift.theme.contextText;
    if (note)
      note.textContent = lightningAvailable
        ? shift.lightningArmed
          ? "Выбери фишку: молния очистит весь ее ряд без траты хода."
          : selected
            ? "Молния очистит выбранный ряд без траты хода."
            : "Выбери фишку, затем нажми молнию."
        : shift.theme.fieldNote;
    if (lightningLabel)
      lightningLabel.textContent = lightningAvailable
        ? shift.lightningArmed
          ? "Выбери ряд"
          : `Молния · ${shift.lightningCharges}`
        : "Нет энергии";
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
    // Окно заполненного склада может открыться еще до создания смены.
    const theme = shift?.theme ?? selectedTheme;
    const text =
      modal === "pause" && shift
        ? `<h2>Смена на паузе</h2><p>Продолжи или заверши сейчас. Вся собранная добыча останется у тебя.</p><strong class="m3-modal-resource">${themeArt(theme, "m3-inline-art")}<span>Собрано: ${theme.kind === "dig" ? `пройдено ${shift.digDepth} из 6 рядов` : `${shift.collected} ${theme.resourceName}`}</span></strong><button class="m3-primary" data-action="resume">Продолжить смену</button><button class="m3-secondary" data-action="finish">Завершить смену</button>`
        : modal === "rules"
          ? `<h2>Как играть</h2><div class="m3-rules-example">${art("rulesExample")}</div><p>Нажми на фишку, затем на соседнюю. Три одинаковых по горизонтали или вертикали исчезают. Неудачный обмен не тратит ход.</p><p>В рабочих сменах главные фишки дают по 1 ресурсу, а цель приносит бонус. Вся добыча сохраняется.</p><p>В раскопках расчищай путь под амфорой, пока она не дойдет до нижнего края. Если не успеешь, глубина сохранится.</p><button class="m3-primary" data-action="close-modal">Понятно, играем!</button>`
          : modal === "storageFull"
            ? `<div class="m3-modal-icon">${art("box")}</div><h2>Склад ${theme.resourceName} заполнен</h2><p>Потрать накопленное или построй еще склад. Смена станет доступна, когда освободится место.</p><button class="m3-primary" data-action="close-modal">К складу</button>`
            : `<div class="m3-modal-icon">${art("energy")}</div><h2>Зарядов нет</h2><p>Молния появится, когда на острове будет достаточно энергии. Пока можно собирать обычные ряды.</p><button class="m3-primary" data-action="close-modal">Понятно</button>`;
    return `<div class="m3-modal-backdrop" role="presentation"><section class="m3-modal m3-modal--${modal}" role="dialog" aria-modal="true">${text}</section></div>`;
  }

  function hubCard(id: ShiftId, icon: ChipId | "pot", title: string, detail: string) {
    return `<button class="m3-work-card" data-action="brief" data-shift="${id}">${icon === "pot" ? art("pot", "m3-card-icon") : chipArt(icon, "m3-card-icon")}<span><b>${title}</b><small>${detail}</small></span><i>›</i></button>`;
  }

  function renderHub() {
    root.innerHTML = `<section class="m3-screen m3-hub${nightClass()}">
      <header class="m3-header"><button class="m3-icon-button" data-action="close" aria-label="Вернуться на остров">‹</button><div><h1>Рабочие смены</h1><p>Ресурсы для твоего острова</p></div></header>
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
      <header class="m3-header"><button class="m3-icon-button" data-action="hub" aria-label="К списку смен">‹</button><div><h1>${theme.title}</h1><p>Перед началом</p></div><span class="m3-shift-mark" aria-hidden="true">Ⅱ</span></header>
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
    const bannerText = theme.contextText;
    const fieldNote = lightningAvailable
      ? shift.lightningArmed
        ? "Выбери фишку: молния очистит весь ее ряд без траты хода."
        : selected
          ? "Молния очистит выбранный ряд без траты хода."
          : "Выбери фишку, затем нажми молнию."
      : theme.fieldNote;
    root.innerHTML = `<section class="m3-screen m3-game${nightClass()}">
      <header class="m3-header"><button class="m3-icon-button" data-action="pause" aria-label="Поставить смену на паузу">×</button><div><h1>${theme.title}</h1><p>${theme.subtitle}</p></div><button class="m3-icon-button" data-action="pause" aria-label="Поставить смену на паузу">Ⅱ</button></header>
      <main><section class="m3-game-stats"><div class="m3-progress">${themeArt(theme, "m3-resource-art")}<div><small>${theme.mainChipName}</small><b data-match-amount>${currentValue} / ${theme.goal}</b><i><em data-match-progress style="width:${theme.kind === "dig" ? (shift.digDepth / 6) * 100 : Math.min(100, (shift.collected / theme.goal) * 100)}%"></em></i><small>${goalHint}</small></div></div><div class="m3-moves"><small>ХОДЫ</small><b data-match-moves>${shift.moves}</b></div></section>
        <p class="m3-bonus-line">${contextArt(theme, "m3-line-art")}<span data-match-banner>${bannerText}</span></p>
        ${gameBoard()}
        <p class="m3-field-note" data-match-field-note>${fieldNote}</p>
        <nav class="m3-actions" aria-label="Действия"><button data-action="hint">${art("hint", "m3-action-art")}<span>Подсказка</span></button><button data-action="lightning">${art("energy", "m3-action-art")}<span data-lightning-label>${lightningAvailable ? `Молния · ${shift.lightningCharges}` : "Нет энергии"}</span></button><button data-action="rules">${art("rules", "m3-action-art")}<span>Правила</span></button></nav>
        <section class="m3-reward-note">${theme.kind === "dig" ? penpotArt("map", "m3-reward-art") : art("box", "m3-reward-art")}<span><b>${theme.kind === "dig" ? "Награда: новый участок" : `Бонус за цель: +${theme.bonus} ${theme.resourceName}`}</b><small>${theme.kind === "dig" ? "Глубина сохранится, даже если не успеешь" : "Вся собранная добыча останется у тебя"}</small></span></section>
      </main>${overlay()}</section>`;
  }

  function renderResult() {
    if (!result) return;
    const { theme, reward, digFound } = result;
    if (theme.kind === "dig" && digFound) {
      root.innerHTML = `<section class="m3-screen m3-result m3-dig-result${nightClass()}"><header class="m3-header"><button class="m3-icon-button" data-action="close" aria-label="Вернуться на остров">‹</button><div><h1>Раскопки</h1><p>Итоги смены</p></div></header><main>
        <section class="m3-dig-result-hero"><span class="m3-result-icon">${art("pot")}</span><h2>Участок открыт!</h2><p class="m3-lead">Амфора добавлена в находки. На острове стала доступна новая территория.</p></section>
        <section class="m3-dig-discovery">${penpotArt("resultTree", "m3-dig-tree")}<span><b>Лес и река</b><p>Новые места для построек и развития острова.</p></span></section>
        <section class="m3-dig-info"><b>Амфора найдена</b><p>Находка останется в коллекции острова.</p></section>
        <button class="m3-primary m3-bottom-action" data-action="close">На остров</button><button class="m3-result-again" data-action="again">Еще одна смена</button>
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
    const retryLabel = reachedGoal ? "Еще одна смена" : "Еще одна попытка";
    const helpTitle = reachedGoal ? theme.resultHelpTitle : reward.collected ? "Собранная добыча уже на складе" : "Вся добыча сохраняется";
    const helpText = reachedGoal ? theme.resultHelpText : reward.collected ? "Попробуй еще раз, когда захочешь. Ресурсы не пропадут." : "Нет потери ресурсов и ограничений на число попыток. Попробуй еще раз, когда захочешь.";
    root.innerHTML = `<section class="m3-screen m3-result${nightClass()}"><header class="m3-header"><button class="m3-icon-button" data-action="close" aria-label="Вернуться на остров">‹</button><div><h1>${theme.title}</h1><p>Итоги смены</p></div></header><main>
      <section class="m3-result-hero${reachedGoal ? "" : " m3-result-hero--plain"}">${reachedGoal ? `<span class="m3-result-icon">${art("win")}</span>` : `<span class="m3-result-icon m3-result-icon--basket">${homeArt("basket")}</span>`}<h2>${title}</h2><p class="m3-lead">${detail}</p></section>
      <section class="m3-result-card"><div><small>Собрано ${theme.resourceName}</small><b>${reward.collected}</b></div><div><small>${reward.bonus ? "Бонус за цель" : "Бонус не получен"}</small><b>${reward.bonus ? `+${reward.bonus}` : "—"}</b></div><div class="m3-result-total"><small>Всего на склад</small><b>${reward.total}</b></div></section>
      <section class="m3-stock">${themeArt(theme, "m3-stock-art")}<div><small>Теперь на складе</small><i><em style="width:${(warehouse[theme.id] / 200) * 100}%"></em></i></div><b>${warehouse[theme.id]} / 200</b></section>
      <section class="m3-result-help"><b>${helpTitle}</b><p>${helpText}</p></section>
      <button class="m3-primary m3-bottom-action" data-action="${reachedGoal ? "close" : "again"}">${reachedGoal ? "На остров" : retryLabel}</button><button class="m3-result-again" data-action="${reachedGoal ? "again" : "close"}">${reachedGoal ? retryLabel : "На остров"}</button>
    </main></section>`;
  }

  function render() {
    if (screen === "hub") renderHub();
    else if (screen === "brief") renderBrief();
    else if (screen === "game") renderGame();
    else renderResult();
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
      lightningArmed: false,
    };
    selected = undefined;
    hint = [];
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
      modal = "noCharges";
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
  publishWarehouse();
  render();
}
