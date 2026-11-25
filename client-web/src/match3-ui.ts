import { renderArt } from "./ui-art";
import { syncBrowserTheme } from "./theme";
import { penpotVectors } from "./penpot-vectors";
import { match3Tile, renderMatch3Chip, renderMatch3Tile } from "./penpot-match3-tiles";
import { movesLabel, shiftMovesDescription, workersLabel } from "./match3-copy";
import {
  amphoraAtDepth,
  areAdjacent,
  attemptMove,
  boardSize,
  createBoard,
  findPossibleMoves,
  matchThreeThemes,
  positionFromSwipe,
  resultReward,
  samePosition,
  strikeRow,
  type Board,
  type CascadeResult,
  type CascadeStep,
  type ChipId,
  type MatchThreeTheme,
  type Position,
  type ShiftId,
} from "./match3";
import {
  match3Api,
  Match3ApiError,
  newMatch3RunId,
  type ClientResult,
  type Goal,
  type Match3Result,
  type Match3State,
  type ShiftView,
  type Warehouse,
} from "./match3-api";
import { match3Icons, type Match3IconName } from "./penpot-emoji";

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

interface LocalRun extends ClientResult {
  board: Board;
  goal: Goal;
  movesTotal: number;
  lightningEnabled: boolean;
  pending?: boolean;
  paused?: boolean;
  pendingPause?: boolean;
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

function art(name: Match3IconName, className = "") {
  return renderArt(match3Icons[name], className);
}

function controlIcon(name: "back" | "next") {
  return renderArt(penpotVectors[name], "m3-control-art");
}

function stockCard(theme: MatchThreeTheme, label: string, amount: number, limit: number) {
  const icon = renderMatch3Chip(theme.id, theme.kind === "dig" ? "pot" : theme.mainChip, "m3-stock-art");
  const percent = limit > 0 ? Math.min(100, (amount / limit) * 100) : 0;
  return `<section class="m3-stock-card">${icon}<div class="m3-stock-details"><div><small>${label}</small><b>${amount} / ${limit}</b></div><i><em style="width:${percent}%"></em></i></div></section>`;
}

const shiftControls = {
  pause: "M6 3.33v9.34m4-9.34v9.34",
  hint: "M6 12h4m-3.33 2.67h2.66M5.67 10.33C5 9.33 3.33 8.6 3.33 6.33a4.67 4.67 0 0 1 9.34 0c0 2.27-1.67 3-2.34 4",
  lightning: "M8.67 1.33l-6 7.34h4.66l-.66 6 6.66-8H8.67l.66-5.34Z",
} as const;

function shiftControl(name: keyof typeof shiftControls) {
  return `<svg class="m3-shift-control" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${shiftControls[name]}"/></svg>`;
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
  let serverSavedAt = 0;
  let serverShifts: Match3State["shifts"] = [];
  let activeRun: LocalRun | undefined;
  let storageKey: string | undefined;
  let excavationSiteId: string | undefined;
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
  const open = () => {
    root.hidden = false;
    document.body.classList.add("match3-open");
    modal = undefined;
    syncBrowserTheme();
    render();
    if (!preview) void perform(loadState);
  };
  entry.addEventListener("click", open);

  function potPosition() {
    return shift?.amphora ?? undefined;
  }

  function stockFor(id: ShiftId) {
    return id === "dig" ? { amount: 0, limit: 0 } : warehouse[resources[id]];
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
    const themeId = shift.theme.id;
    const hinted = new Set(hint.map(positionKey));
    const falling = new Set(dropping.map(positionKey));
    const cleared = new Set(clearing.map(positionKey));
    const pot = potPosition();
    return `<div class="m3-board" role="grid" aria-label="Игровое поле 8 на 8">${shift.board
      .map((row, rowIndex) =>
        row
          .map((_, column) => {
            const position = { row: rowIndex, column };
            const isPot = samePosition(pot, position);
            const renderedChip = board[rowIndex][column];
            const { file, label } = match3Tile(themeId, isPot ? "pot" : renderedChip);
            const swapTarget =
              swapping && samePosition(swapping[0], position)
                ? swapping[1]
                : swapping && samePosition(swapping[1], position)
                  ? swapping[0]
                  : undefined;
            const swapX = swapTarget
              ? swapTarget.column > column
                ? "calc(100% + var(--m3-tile-gap))"
                : swapTarget.column < column
                  ? "calc(-100% - var(--m3-tile-gap))"
                  : "0px"
              : "0px";
            const swapY = swapTarget
              ? swapTarget.row > rowIndex
                ? "calc(100% + var(--m3-tile-gap))"
                : swapTarget.row < rowIndex
                  ? "calc(-100% - var(--m3-tile-gap))"
                  : "0px"
              : "0px";
            const swapStyle = swapTarget
              ? ` style="--swap-x:${swapX};--swap-y:${swapY};--drop-delay:${rowIndex * 8}ms"`
              : falling.has(positionKey(position))
                ? ` style="--drop-delay:${rowIndex * 8}ms"`
                : "";
            const classes = [
              "m3-chip",
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
            const content = renderMatch3Tile(file, "m3-chip-art");
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
    const movesCaption = root.querySelector<HTMLElement>("[data-match-moves-label]");
    const progress = root.querySelector<HTMLElement>("[data-match-progress]");
    if (amount)
      amount.textContent =
        shift.theme.kind === "dig"
          ? `${shift.digDepth >= shift.digTarget ? 1 : 0} / 1`
          : `${shift.collected} / ${shift.theme.goal}`;
    if (moves) moves.textContent = String(shift.moves);
    if (movesCaption) movesCaption.textContent = movesLabel(shift.moves);
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
    if (shift.theme.kind === "resource" && shift.collected >= shift.theme.goal) return "Цель выполнена! Открываем бонусный ящик.";
    if (clearing.length) return "Совпадение! Фишки исчезают.";
    if (boardPhase === "drop") return "Новые фишки заполняют поле.";
    if (selected) return "Выбери соседнюю фишку для обмена.";
    if (shift.theme.id === "sawmill" && shift.moves === 1)
      return `Последний ход: собери ещё ${Math.max(0, shift.theme.goal - shift.collected)} бревна для бонуса.`;
    return shift.theme.kind === "dig" ? shift.theme.fieldNote : "";
  }

  function gameContext() {
    if (!shift) return "";
    return shift.lightningCharges > 0 && !shift.lightningArmed
      ? "Энергии хватает · молния доступна"
      : shift.theme.contextText;
  }

  function lightningLabel() {
    if (!shift?.lightningEnabled) return "Нет энергии";
    return `Молния · ${shift.lightningCharges}`;
  }

  function updateGameActions() {
    if (!shift) return;
    const banner = root.querySelector<HTMLElement>("[data-match-banner]");
    const note = root.querySelector<HTMLElement>("[data-match-field-note]");
    const lightning = root.querySelector<HTMLButtonElement>('[data-action="lightning"]');
    const label = lightning?.querySelector("[data-lightning-label]");
    if (banner) banner.textContent = gameContext();
    if (note) note.textContent = gameInstruction();
    if (lightning) {
      lightning.classList.toggle("is-powered", shift.lightningCharges > 0);
      lightning.setAttribute("aria-pressed", String(shift.lightningArmed));
    }
    if (label) label.textContent = lightningLabel();
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
      noEnergy: { icon: "lightning", title: "Нужно больше энергии", body: "Молния доступна при достаточном энергоснабжении острова. Пока можно собирать обычные ряды.", action: "Понятно" },
      noCharges: { icon: "lightning", title: "Молния уже использована", body: "В этой смене заряд закончился. Продолжай собирать ряды. Новый заряд будет в следующей смене.", action: "Понятно" },
      storageFull: { icon: "box", title: `Склад ${theme.resourceName} заполнен`, body: "Потрать накопленное или построй ещё склад. Смена станет доступна, когда освободится место.", action: "К складу" },
      noWorkers: { icon: "worker", title: "Нужны работники", body: "Без работников смена не начнётся. Назначь хотя бы одного жителя в лесопилку.", action: "Назначить работников" },
      hint: { icon: "hint", title: "Как найти ход", body: "Найди две одинаковые фишки рядом. Поменяй соседнюю фишку так, чтобы собрать ряд из трёх или больше.", action: "Понятно" },
    } as const;
    let content: string;
    if (modal === "pause") {
      const pauseStatus = activeRun?.pendingPause ? "Сохраняем прогресс…" : activeRun?.paused ? "Прогресс сохранён" : "Добыча сохранится";
      const toIsland = activeRun?.paused ? '<button class="m3-secondary" data-action="close">На остров</button>' : '';
      content = `<button class="m3-secondary m3-pause-rules" data-action="rules">Правила</button><h2>Смена на паузе</h2><p>Продолжи или заверши сейчас. Вся собранная добыча останется у тебя.</p><strong class="m3-modal-resource">${art("backpack", "m3-inline-art")}<span>${pauseStatus}</span></strong><button class="m3-primary" data-action="resume">Продолжить смену</button><button class="m3-secondary" data-action="finish">Завершить смену</button>${toIsland}`;
    } else if (modal === "rules") {
      const apple = renderMatch3Chip("farm", "apple", "m3-rule-chip");
      content = `<h2>Как играть</h2><div class="m3-rules-example" aria-hidden="true">${apple.repeat(3)}</div><p>Нажми на фишку, затем на соседнюю. Три одинаковых по горизонтали или вертикали исчезают. Неудачный обмен не тратит ход.</p><p>В рабочих сменах главные фишки дают по 1 ресурсу, а цель приносит бонусный ящик. Вся добыча сохраняется.</p><p>В раскопках расчищай путь под амфорой, пока она не дойдёт до нижнего края. Если не успеешь, глубина сохранится.</p><button class="m3-primary" data-action="close-modal">Понятно, играем!</button>`;
    } else {
      const info = details[modal];
      const icon = info.icon === "lightning" || info.icon === "hint" ? shiftControl(info.icon) : art(info.icon);
      content = `<div class="m3-modal-icon">${icon}</div><h2>${info.title}</h2><p>${info.body}</p><button class="m3-primary" data-action="close-modal">${info.action}</button>`;
    }
    return `<div class="m3-modal-backdrop" role="presentation"><section class="m3-modal m3-modal--${modal}" role="dialog" aria-modal="true" aria-label="${modal === "pause" ? "Смена на паузе" : modal === "rules" ? "Как играть" : details[modal].title}">${content}</section></div>`;
  }

  function hubCard(id: ShiftId, detail: string) {
    const { icon, title } = matchThreeThemes[id];
    const rules = serverShifts.find((item) => item.shiftId === id);
    if (rules && id !== "dig") {
      const resource = detail.split(" · ")[0];
      detail = `${resource} · ${workersLabel(rules.assignedWorkers)}`;
    }
    const iconArt = renderMatch3Chip(id, icon, "m3-card-icon");
    return `<button class="m3-work-card" data-action="brief" data-shift="${id}">${iconArt}<span><b>${title}</b><small>${detail}</small></span><i>${controlIcon("next")}</i></button>`;
  }

  function renderHub() {
    root.innerHTML = `<section class="m3-screen m3-hub${nightClass()}">
      <header class="m3-header"><button class="m3-icon-button" data-action="close" aria-label="Вернуться на остров">${controlIcon("back")}</button><div><h1>Рабочие смены</h1><p>Ресурсы для твоего острова</p></div></header>
      <main><section class="m3-hub-intro"><b>Каждому месту — своя смена</b><p>Собирай фишки на поле 8×8. Выбери, что нужно острову сейчас.</p></section>
        ${hubCard("sawmill", "Дерево · 2 работника")}
        ${hubCard("farm", "Еда · 2 работника")}
        ${hubCard("quarry", "Камень · 2 работника")}
        ${hubCard("mine", "Железо · 1 работник")}
        ${hubCard("dig", "Новый участок · древняя находка")}
      </main>
      <footer class="m3-screen-actions"><button class="m3-secondary" data-action="close">На остров</button></footer>
    </section>`;
  }

  function renderBrief() {
    const theme = selectedTheme;
    const { amount, limit } = stockFor(theme.id);
    const rules = serverShifts.find((item) => item.shiftId === theme.id);
    const digTarget = rules?.goal.targetDepth ?? 6;
    const moveDescription = theme.kind === "resource" && rules ? shiftMovesDescription(rules) : theme.workers;
    const goalText =
      theme.kind === "dig"
        ? "Опусти амфору к нижнему краю"
        : `Собери ${theme.goal} ${theme.resourcePlural}`;
    const bonusText =
      theme.kind === "dig"
        ? "Провизия уже внесена. Глубина сохранится, даже если не успеешь."
        : `Бонусный ящик за цель: +${theme.bonus} ${theme.resourceName}. Вся добыча останется у тебя.`;
    root.innerHTML = `<section class="m3-screen m3-brief${nightClass()}">
      <header class="m3-header"><button class="m3-icon-button" data-action="hub" aria-label="К списку смен">${controlIcon("back")}</button><div><h1>${theme.title}</h1><p>Перед началом</p></div></header>
      <main class="m3-brief-main"><section class="m3-brief-hero">${renderMatch3Chip(theme.id, theme.icon, "m3-brief-icon")}<div><b>${theme.subtitle}</b><p>Смена приносит ресурсы на остров</p></div></section>
        <section class="m3-goal-card"><b>${goalText}</b><p>${bonusText}</p></section>
        <section class="m3-move-card"><div><b>Ходов в смене</b><strong>${theme.moves}</strong></div><p>${moveDescription}</p></section>
        ${theme.kind === "dig" ? stockCard(theme, "Глубина раскопок", savedDigDepth, digTarget) : stockCard(theme, "На складе", amount, limit)}
        <p class="m3-note">${theme.kind === "dig" ? "Не успеешь за смену — продолжишь с той же глубины." : "Не достигнешь цели — всё равно заберёшь добычу. Играть можно снова без ограничения попыток."}</p>
      </main>
      <footer class="m3-screen-actions"><button class="m3-primary" data-action="start">Начать смену</button></footer>
    </section>`;
  }

  function renderGame() {
    if (!shift) return;
    const theme = shift.theme;
    const isDig = theme.kind === "dig";
    const currentValue = isDig ? Number(shift.digDepth >= shift.digTarget) : shift.collected;
    const goalArt = renderMatch3Chip(theme.id, isDig ? "pot" : theme.mainChip, "m3-resource-art");
    const progress = isDig ? shift.digDepth / shift.digTarget : shift.collected / theme.goal;
    root.innerHTML = `<section class="m3-screen m3-game${nightClass()}" data-shift="${theme.id}">
      <header class="m3-game-heading">
        <h1>${theme.title}</h1>
        <button class="m3-shift-button" data-action="pause">${shiftControl("pause")}Пауза</button>
        <p data-match-banner>${gameContext()}</p>
      </header>
      <main>
        <section class="m3-game-panel" aria-label="Цель и поле смены">
          <div class="m3-game-stats">
            <div class="m3-progress">${goalArt}<div class="m3-goal-text">
              <small>${theme.mainChipName}</small><b data-match-amount>${currentValue} / ${theme.goal}</b>
              <i><em data-match-progress style="width:${Math.min(100, progress * 100)}%"></em></i>
              ${isDig ? "<small>Опусти к нижнему краю</small>" : ""}
            </div></div>
            <div class="m3-moves"><b data-match-moves>${shift.moves}</b><small data-match-moves-label>${movesLabel(shift.moves)}</small></div>
          </div>
          ${gameBoard()}
        </section>
        <p class="m3-field-note" data-match-field-note aria-live="polite">${gameInstruction()}</p>
        <div class="m3-actions">
          <div class="m3-reward-note"><small>${isDig ? "Награда" : "Бонус за цель"}</small><strong>${isDig ? "Новый участок" : `+${theme.bonus} ${theme.resourceName}`}</strong></div>
          <button class="m3-shift-button" data-action="hint">${shiftControl("hint")}Подсказка</button>
          <button class="m3-shift-button m3-lightning${shift.lightningCharges > 0 ? " is-powered" : ""}" data-action="lightning" aria-pressed="${shift.lightningArmed}">${shiftControl("lightning")}<span data-lightning-label>${lightningLabel()}</span></button>
        </div>
      </main>
    </section>`;
  }

  function renderResult() {
    if (!result) return;
    const { theme, reward, digFound } = result;
    const { amount, limit } = stockFor(theme.id);
    if (theme.kind === "dig" && digFound) {
      root.innerHTML = `<section class="m3-screen m3-result m3-dig-result${nightClass()}"><header class="m3-header"><button class="m3-icon-button" data-action="close" aria-label="Вернуться на остров">${controlIcon("back")}</button><div><h1>Раскопки</h1><p>Итоги смены</p></div></header><main>
        <section class="m3-dig-result-hero"><span class="m3-result-icon">${renderMatch3Chip(theme.id, theme.icon, "m3-result-art")}</span><h2>Участок открыт!</h2><p class="m3-lead">Амфора добавлена в находки. На острове стала доступна новая территория.</p></section>
        <section class="m3-dig-discovery">${art("resultTree", "m3-dig-tree")}<span><b>Новый участок</b><p>Новые места для построек и развития острова.</p></span></section>
        <section class="m3-dig-info"><b>Амфора найдена</b><p>Находка останется в коллекции острова.</p></section>
      </main>
      <footer class="m3-screen-actions">
        <button class="m3-primary" data-action="close">На остров</button>
        <button class="m3-secondary" data-action="again">Ещё одна смена</button>
      </footer></section>`;
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
        : "Ты ещё ничего не собрал. Можно начать новую смену.";
    const helpTitle = theme.kind === "dig" ? "Можно продолжить раскопки" : reachedGoal ? theme.resultHelpTitle : "Вся добыча сохраняется";
    const helpText = theme.kind === "dig" ? "Провизия за этот участок уже внесена." : reachedGoal ? theme.resultHelpText : "Нет потери ресурсов и ограничений на число попыток. Попробуй ещё раз, когда захочешь.";
    root.innerHTML = `<section class="m3-screen m3-result${nightClass()}"><header class="m3-header"><button class="m3-icon-button" data-action="close" aria-label="Вернуться на остров">${controlIcon("back")}</button><div><h1>${reachedGoal ? theme.title : "Итоги смены"}</h1><p>${reachedGoal ? "Итоги смены" : "Добыча сохранена"}</p></div></header><main>
      <section class="m3-result-hero${reachedGoal ? "" : " m3-result-hero--plain"}"><span class="m3-result-icon">${art(reachedGoal ? "win" : "basket")}</span><h2>${title}</h2><p class="m3-lead">${detail}</p></section>
      ${theme.kind === "resource" && (reachedGoal || reward.overflow > 0) ? `<section class="m3-result-card"><div><small>Собрано ${theme.resourceName}</small><b>${reward.collected}</b></div><div><small>${reward.bonus ? "Бонус за цель" : "Бонус не получен"}</small><b>${reward.bonus ? `+${reward.bonus}` : "—"}</b></div><div class="m3-result-total"><small>Всего на склад</small><b>${reward.credited}</b></div>${reward.overflow ? `<small>Не поместилось: ${reward.overflow}</small>` : ""}</section>
      ${stockCard(theme, "Теперь на складе", amount, limit)}` : ""}
      <section class="m3-result-help"><b>${helpTitle}</b><p>${helpText}</p></section>
    </main>
    <footer class="m3-screen-actions">
      <button class="m3-primary" data-action="${reachedGoal ? "close" : "hub"}">${reachedGoal ? "На остров" : "Выбрать смену"}</button>
      <button class="m3-secondary" data-action="${reachedGoal ? "again" : "close"}">${reachedGoal ? "Ещё одна смена" : "На остров"}</button>
    </footer></section>`;
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

  function rememberRun(run?: LocalRun) {
    activeRun = run;
    if (!storageKey) return;
    try {
      if (run) sessionStorage.setItem(storageKey, JSON.stringify(run));
      else sessionStorage.removeItem(storageKey);
    } catch {
      // Если хранилище недоступно, смена живёт до обновления вкладки.
    }
  }

  function readLocalRun(): LocalRun | undefined {
    if (!storageKey) return undefined;
    try {
      const run = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as LocalRun | null;
      if (run && Object.hasOwn(matchThreeThemes, run.shiftId) && run.board.length === boardSize &&
          run.board.every((row) => row.length === boardSize && row.every((chip) => matchThreeThemes[run.shiftId].chips.includes(chip)))) {
        return run;
      }
    } catch {
      // Повреждённое сохранение этой вкладки не мешает открыть список смен.
    }
    return undefined;
  }

  function showRun(run: LocalRun) {
    const theme = themeFor(run.shiftId, { goal: run.goal, moves: run.movesTotal });
    selectedTheme = theme;
    shift = {
      theme,
      board: run.board,
      moves: run.movesLeft,
      collected: run.collected,
      digDepth: run.digDepth,
      digTarget: run.goal.targetDepth ?? 6,
      amphora: theme.kind === "dig" ? amphoraAtDepth(run.digDepth) : null,
      lightningCharges: run.chargesLeft,
      lightningEnabled: run.lightningEnabled,
      lightningArmed: false,
    };
    selected = undefined;
    hint = [];
    modal = run.paused ? "pause" : undefined;
    screen = "game";
  }

  function showResult(saved: Match3Result) {
    rememberRun();
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
    if (saved.serverSavedAt >= serverSavedAt) {
      serverSavedAt = saved.serverSavedAt;
      warehouse = saved.warehouse;
      if (saved.dig) savedDigDepth = saved.dig.savedDepth;
      publishWarehouse();
    }
    if (saved.dig?.revealedCell) {
      window.dispatchEvent(new CustomEvent("match3:cell-revealed", { detail: saved.dig.revealedCell }));
    }
    const stock = saved.resourceId ? warehouse[saved.resourceId] : undefined;
    modal = stock && stock.amount >= stock.limit ? "storageFull" : undefined;
    screen = "result";
  }

  async function loadState(next: "hub" | "brief" = "hub") {
    const state = await match3Api.state();
    const key = "match3:run:" + state.playerId;
    const currentRun = key === storageKey ? activeRun : undefined;
    storageKey = key;
    const local = currentRun ?? readLocalRun();
    serverSavedAt = state.serverSavedAt;
    warehouse = state.warehouse;
    serverShifts = state.shifts;
    savedDigDepth = state.digDepth;
    excavationSiteId = state.excavation?.siteId;
    lastLightningYield = undefined;
    clearAnimation();
    publishWarehouse();

    const serverRun = state.activeRun;
    const useLocal = local && (local.pending || local.pendingPause || (serverRun
      ? serverRun.runId === local.runId && serverRun.revision === local.legacyRevision
      : local.legacyRevision === undefined && (local.shiftId !== "dig" ||
        (local.excavationSiteId === excavationSiteId && local.digStartDepth === savedDigDepth))));
    if (useLocal) {
      rememberRun(local);
      showRun(local);
      if (!root.hidden) {
        if (local.pending || shiftEnded(local)) await saveResult();
        else if (local.pendingPause) await savePause();
      }
    } else if (serverRun) {
      const rules = state.shifts.find((item) => item.shiftId === serverRun.shiftId);
      const run: LocalRun = {
        runId: serverRun.runId, shiftId: serverRun.shiftId, board: serverRun.board, goal: serverRun.goal,
        movesLeft: serverRun.movesLeft, chargesLeft: serverRun.chargesLeft, collected: serverRun.collected,
        digDepth: serverRun.digDepth, legacyRevision: serverRun.revision,
        excavationSiteId: serverRun.shiftId === "dig" ? excavationSiteId : undefined,
        digStartDepth: serverRun.shiftId === "dig" ? savedDigDepth : undefined,
        movesTotal: rules?.moves ?? serverRun.movesLeft,
        lightningEnabled: (rules?.charges ?? serverRun.chargesLeft) > 0,
        paused: serverRun.clientManaged,
      };
      rememberRun(run);
      showRun(run);
    } else {
      rememberRun();
      const id = selectedTheme.id;
      selectedTheme = themeFor(id, serverShifts.find((item) => item.shiftId === id));
      modal = undefined;
      screen = next;
    }
  }

  function shiftEnded(run: LocalRun) {
    return run.movesLeft === 0 || (run.shiftId === "dig"
      ? run.digDepth >= (run.goal.targetDepth ?? 6)
      : run.collected >= run.goal.target);
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
      const retry = activeRun?.pending ? saveResult : activeRun?.pendingPause ? savePause : undefined;
      if (error instanceof Match3ApiError && error.retryable) {
        issue = {
          message: "Сервер не ответил. Попробуй ещё раз.",
          retry: retry ?? operation,
        };
      } else if (error instanceof Match3ApiError && retry && [
        "stale_revision", "active_run", "excavation_changed", "idempotency_conflict", "run_finished",
      ].includes(error.code)) {
        rememberRun();
        try {
          await loadState();
          issue = { message: "Состояние смены изменилось в другой вкладке. Данные обновлены." };
        } catch {
          issue = { message: "Не удалось обновить список смен.", retry: loadState };
        }
      } else if (error instanceof Match3ApiError && errorModals[error.code] && !retry) {
        modal = errorModals[error.code];
      } else {
        if (!(error instanceof Match3ApiError)) console.error(error);
        issue = {
          message: activeRun?.pending
            ? "Не удалось сохранить итог смены."
            : activeRun?.pendingPause ? "Не удалось сохранить прогресс смены." : "Не удалось загрузить рабочие смены.",
          retry: retry ?? loadState,
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
    const rules = serverShifts.find((item) => item.shiftId === id);
    if (!rules?.available) {
      const reason = rules?.reasons[0];
      modal = reason && errorModals[reason.code];
      if (!modal) issue = { message: reason?.code === "no_excavation_site"
        ? "Сейчас нет доступного участка для раскопок."
        : "Не удалось загрузить правила смены.", retry: () => loadState("brief") };
      render();
      return;
    }
    const depth = id === "dig" ? savedDigDepth : 0;
    const amphora = id === "dig" ? amphoraAtDepth(depth) : null;
    const run: LocalRun = {
      runId: newMatch3RunId(), shiftId: id, goal: rules.goal,
      board: createBoard(selectedTheme.chips, Math.random, boardSize, amphora),
      movesLeft: rules.moves, movesTotal: rules.moves, chargesLeft: rules.charges,
      lightningEnabled: rules.charges > 0, collected: 0, digDepth: depth,
      excavationSiteId: id === "dig" ? excavationSiteId : undefined,
      digStartDepth: id === "dig" ? depth : undefined,
    };
    lastLightningYield = undefined;
    rememberRun(run);
    showRun(run);
    render();
  }

  function resultPayload(run: LocalRun): ClientResult {
    const { board, goal, movesTotal, lightningEnabled, pending, pendingPause, paused, ...payload } = run;
    return payload;
  }

  async function savePause() {
    if (!activeRun) return;
    const run = { ...activeRun, paused: true, pendingPause: true };
    rememberRun(run);
    modal = "pause";
    render();
    const saved = await match3Api.pause(resultPayload(run), run.board);
    if (run.shiftId === "dig") {
      savedDigDepth = saved.digDepth;
      excavationSiteId = saved.excavationSiteId ?? undefined;
    }
    rememberRun({
      ...run, runId: saved.runId, legacyRevision: saved.revision, pendingPause: undefined,
      excavationSiteId: saved.excavationSiteId ?? undefined,
      digStartDepth: run.shiftId === "dig" ? saved.digDepth : undefined,
    });
  }

  async function saveResult() {
    if (!activeRun) return;
    const run = activeRun;
    if (!run.pending) rememberRun({ ...run, pending: true });
    showResult(await match3Api.saveResult(resultPayload(run)));
  }

  const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

  async function playSteps(steps: CascadeStep[]) {
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
      if (step.amphoraAfter && !samePosition(step.amphoraBefore, step.amphoraAfter)) {
        dropping.push(step.amphoraAfter);
      }
      boardPhase = "drop";
      shift.collected += step.earned;
      shift.amphora = step.amphoraAfter;
      if (step.amphoraAfter) shift.digDepth = step.amphoraAfter.row - 1;
      updateGameFrame();
      await wait(300);
    }
  }

  function applyCascade(run: LocalRun, cascade: CascadeResult, movesLeft: number, chargesLeft: number) {
    const next: LocalRun = {
      ...run, board: cascade.board, movesLeft, chargesLeft,
      collected: run.collected + cascade.collected,
      digDepth: cascade.amphora ? cascade.amphora.row - 1 : 0,
    };
    rememberRun(next);
    return next;
  }

  async function showCascade(next: LocalRun, steps: CascadeStep[]) {
    if (!shift) return;
    shift.moves = next.movesLeft;
    shift.lightningCharges = next.chargesLeft;
    await playSteps(steps);
    showRun(next);
    if (shiftEnded(next)) {
      clearAnimation();
      updateGameFrame();
      await saveResult();
    }
  }

  function useLightning() {
    const run = activeRun;
    if (!run || !shift || busy || run.pending || shiftEnded(run)) return;
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
    const { row } = selected;
    selected = undefined;
    hint = [];
    shift.lightningArmed = false;
    const current = shift;
    return perform(async () => {
      const cascade = strikeRow(run.board, row, current.theme, Math.random, current.amphora, run.collected);
      const next = applyCascade(run, cascade, run.movesLeft, run.chargesLeft - 1);
      await showCascade(next, cascade.steps);
      lastLightningYield = current.theme.id === "sawmill" ? cascade.collected : undefined;
    });
  }

  function playMove(from: Position, to: Position) {
    const run = activeRun;
    if (!run || !shift || busy || run.pending || shiftEnded(run) || samePosition(potPosition(), from) || samePosition(potPosition(), to)) return;
    if (shift.lightningArmed) {
      selected = to;
      return useLightning();
    }
    selected = undefined;
    lastLightningYield = undefined;
    hint = [];
    const current = shift;
    return perform(async () => {
      const move = attemptMove(run.board, from, to, current.theme, Math.random, current.amphora, run.collected);
      const next = move.accepted ? applyCascade(run, move, run.movesLeft - 1, run.chargesLeft) : run;
      presentationBoard = run.board;
      swapping = [from, to];
      boardPhase = "swap";
      updateGameFrame();
      await wait(180);
      if (move.accepted) {
        await showCascade(next, move.steps);
      } else {
        presentationBoard = move.swappedBoard;
        boardPhase = "return";
        updateGameFrame();
        await wait(160);
      }
    });
  }

  function showHint() {
    if (!shift || !activeRun || activeRun.pending || shiftEnded(activeRun)) return;
    hint = findPossibleMoves(shift.board, shift.amphora)[0] ?? [];
    selected = undefined;
    shift.lightningArmed = false;
    updateGameFrame();
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
      if (!preview) startShift();
      return;
    } else if (action === "again") {
      if (preview) screen = "brief";
      else {
        void perform(() => loadState("brief"));
        return;
      }
    }
    else if (action === "pause") {
      if (activeRun) {
        void perform(savePause);
        return;
      }
      modal = "pause";
    } else if (action === "resume") {
      if (activeRun) rememberRun({ ...activeRun, paused: false });
      modal = undefined;
    } else if (action === "close-modal") {
      modal = activeRun?.paused ? "pause" : undefined;
    }
    else if (action === "finish") {
      if (activeRun) void perform(saveResult);
      return;
    } else if (action === "rules") modal = "rules";
    else if (action === "lightning") {
      void useLightning();
      return;
    }
    else if (action === "hint" && shift) {
      showHint();
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
        amphora: selectedTheme.kind === "dig" ? amphoraAtDepth(depth) : null,
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
}
