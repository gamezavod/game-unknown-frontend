import {
  attemptMove,
  chipPresentation,
  createBoard,
  findPossibleMoves,
  resultReward,
  sawmillTheme,
  type Board,
  type Position,
} from "./match3";
import { match3Icons, type Match3IconName } from "./penpot-emoji";

type Screen = "hub" | "brief" | "game" | "result";
type Modal = "pause" | "rules" | "energy" | undefined;

interface Shift {
  board: Board;
  moves: number;
  wood: number;
}

const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!;

function art(name: Match3IconName, className = "") {
  const exported = match3Icons[name];
  const src = exported.startsWith("data:") ? exported : `data:image/png;base64,${exported}`;
  return `<img class="m3-art ${className}" src="${src}" alt="" aria-hidden="true">`;
}

function samePosition(a: Position | undefined, b: Position) {
  return a?.row === b.row && a.column === b.column;
}

function positionKey(position: Position) {
  return `${position.row}:${position.column}`;
}

export function mountMatchThree() {
  const root = $("#match3");
  const entry = $("#open-shifts");
  let screen: Screen = "hub";
  let modal: Modal;
  let shift: Shift | undefined;
  let selected: Position | undefined;
  let hint: Position[] = [];
  let presentationBoard: Board | undefined;
  let clearing: Position[] = [];
  let dropping: Position[] = [];
  let boardPhase: "swap" | "invalid" | "clear" | "drop" | undefined;
  let busy = false;
  let warehouseWood = 120;
  let result: ReturnType<typeof resultReward> | undefined;

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

  function gameBoard() {
    if (!shift) return "";
    const board = presentationBoard ?? shift.board;
    const hinted = new Set(hint.map(positionKey));
    const cleared = new Set(clearing.map(positionKey));
    const falling = new Set(dropping.map(positionKey));
    return `<div class="m3-board" role="grid" aria-label="Игровое поле 8 на 8">${shift.board
      .map((row, rowIndex) =>
        row
          .map((chip, column) => {
            const position = { row: rowIndex, column };
            const renderedChip = board[rowIndex][column];
            const label = chipPresentation[renderedChip];
            const classes = [
              "m3-chip",
              `m3-chip--${renderedChip}`,
              samePosition(selected, position) ? "is-selected" : "",
              hinted.has(positionKey(position)) ? "is-hinted" : "",
              cleared.has(positionKey(position)) ? "is-clearing" : "",
              falling.has(positionKey(position)) ? "is-dropping" : "",
              boardPhase === "invalid" ? "is-invalid" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return `<button class="${classes}" role="gridcell" data-cell="${rowIndex}:${column}" aria-label="${label.name}" aria-pressed="${samePosition(selected, position)}">${art(renderedChip, "m3-chip-art")}</button>`;
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
    const wood = root.querySelector<HTMLElement>("[data-match-wood]");
    const moves = root.querySelector<HTMLElement>("[data-match-moves]");
    const progress = root.querySelector<HTMLElement>("[data-match-progress]");
    if (wood) wood.textContent = `${shift.wood} / ${sawmillTheme.goal}`;
    if (moves) moves.textContent = String(shift.moves);
    if (progress)
      progress.style.width = `${Math.min(100, (shift.wood / sawmillTheme.goal) * 100)}%`;
  }

  function changedPositions(before: Board, after: Board): Position[] {
    const changed: Position[] = [];
    for (let row = 0; row < before.length; row++)
      for (let column = 0; column < before[row].length; column++)
        if (before[row][column] !== after[row][column]) changed.push({ row, column });
    return changed;
  }

  function overlay() {
    if (!modal) return "";
    const text =
      modal === "pause"
        ? `<h2>Смена на паузе</h2><p>Продолжи или заверши сейчас. Вся собранная добыча останется у тебя.</p><strong class="m3-modal-resource">${art("log", "m3-inline-art")}<span>Собрано: ${shift?.wood ?? 0} дерева</span></strong><button class="m3-primary" data-action="resume">Продолжить смену</button><button class="m3-secondary" data-action="finish">Завершить смену</button>`
        : modal === "rules"
          ? `<h2>Как играть</h2><div class="m3-rules-example">${art("rulesExample")}</div><p>Нажми на фишку, затем на соседнюю. Три одинаковых по горизонтали или вертикали исчезают. Неудачный обмен не тратит ход.</p><p>В рабочих сменах главные фишки дают по 1 ресурсу, а цель приносит бонусный ящик. Вся добыча сохраняется.</p><p>В раскопках расчищай путь под амфорой, пока она не дойдет до нижнего края. Если не успеешь, глубина сохранится.</p><button class="m3-primary" data-action="close-modal">Понятно, играем!</button>`
          : `<div class="m3-modal-icon">${art("energy")}</div><h2>Нужно больше энергии</h2><p>Молния доступна при достаточном энергоснабжении острова. Пока можно собирать обычные ряды.</p><button class="m3-primary" data-action="close-modal">Понятно</button>`;
    return `<div class="m3-modal-backdrop" role="presentation"><section class="m3-modal m3-modal--${modal}" role="dialog" aria-modal="true">${text}</section></div>`;
  }

  function render() {
    if (screen === "hub") {
      root.innerHTML = `<section class="m3-screen m3-hub">
        <header class="m3-header"><button class="m3-icon-button" data-action="close" aria-label="Вернуться на остров">‹</button><div><h1>Рабочие смены</h1><p>Ресурсы для твоего острова</p></div></header>
        <main><section class="m3-hub-intro"><b>Каждому месту — своя смена</b><p>Собирай фишки на поле 8×8. Выбери, что нужно острову сейчас.</p></section>
          <button class="m3-work-card" data-action="brief">${art("log", "m3-card-icon")}<span><b>Лесопилка</b><small>Дерево · 2 работника</small></span><i>›</i></button>
          <button class="m3-work-card" disabled>${art("farm", "m3-card-icon")}<span><b>Ферма</b><small>Еда · 2 работника</small></span><i>›</i></button>
          <button class="m3-work-card" disabled>${art("stone", "m3-card-icon")}<span><b>Каменоломня</b><small>Камень · 2 работника</small></span><i>›</i></button>
          <button class="m3-work-card" disabled>${art("mine", "m3-card-icon")}<span><b>Рудник</b><small>Железо · 1 работник</small></span><i>›</i></button>
          <button class="m3-work-card" disabled>${art("pot", "m3-card-icon")}<span><b>Раскопки</b><small>Новый участок · древняя находка</small></span><i>›</i></button>
          <button class="m3-island-button" data-action="close">На остров</button>
        </main></section>`;
    } else if (screen === "brief") {
      root.innerHTML = `<section class="m3-screen">
        <header class="m3-header"><button class="m3-icon-button" data-action="hub" aria-label="К списку смен">‹</button><div><h1>Лесопилка</h1><p>Перед началом</p></div><span class="m3-shift-mark" aria-hidden="true">Ⅱ</span></header>
        <main class="m3-brief-main"><section class="m3-brief-hero">${art("log", "m3-brief-icon")}<div><b>Собираем дерево</b><p>Смена приносит ресурсы на остров</p></div></section>
          <section class="m3-goal-card"><b>Собери 30 брёвен</b><p>Бонусный ящик за цель: +10 дерева. Вся добыча останется у тебя.</p></section>
          <section class="m3-move-card"><div><b>Ходов в смене</b><strong>${sawmillTheme.moves}</strong></div><p>2 работника: 20 базовых ходов. Лес по соседству и счастье дают еще 4.</p></section>
          <section class="m3-stock-card">${art("log", "m3-stock-art")}<div><small>На складе</small><i><em style="width:${(warehouseWood / 200) * 100}%"></em></i></div><b>${warehouseWood} / 200</b></section>
          <section class="m3-chip-list"><small>Фишки этой смены</small><div>${sawmillTheme.chips.map((chip) => `<span><b>${art(chip, "m3-chip-list-art")}</b><i>${chipPresentation[chip].name}</i></span>`).join("")}</div></section>
          <p class="m3-note">Не достигнешь цели — всё равно заберёшь добычу. Играть можно снова без ограничения попыток.</p>
          <button class="m3-primary m3-bottom-action" data-action="start">Начать смену</button>
        </main></section>`;
    } else if (screen === "game" && shift) {
      root.innerHTML = `<section class="m3-screen m3-game">
        <header class="m3-header"><button class="m3-icon-button" data-action="pause" aria-label="Поставить смену на паузу">×</button><div><h1>Лесопилка</h1><p>Собираем дерево</p></div><button class="m3-icon-button" data-action="pause" aria-label="Поставить смену на паузу">Ⅱ</button></header>
        <main><section class="m3-game-stats"><div class="m3-progress">${art("log", "m3-resource-art")}<div><small>Бревна</small><b data-match-wood>${shift.wood} / ${sawmillTheme.goal}</b><i><em data-match-progress style="width:${Math.min(100, (shift.wood / sawmillTheme.goal) * 100)}%"></em></i><small>Цель смены</small></div></div><div class="m3-moves"><small>ХОДЫ</small><b data-match-moves>${shift.moves}</b></div></section>
          <p class="m3-bonus-line">${art("tree", "m3-line-art")}Лес рядом +2 · счастье +2 хода</p>
          ${gameBoard()}
          <p class="m3-field-note">Бревна дают дерево. Остальные фишки помогают.</p>
          <nav class="m3-actions" aria-label="Действия"><button data-action="hint">${art("hint", "m3-action-art")}<span>Подсказка</span></button><button data-action="energy">${art("energy", "m3-action-art")}<span>Нет энергии</span></button><button data-action="rules">${art("rules", "m3-action-art")}<span>Правила</span></button></nav>
          <section class="m3-reward-note">${art("box", "m3-reward-art")}<span><b>Бонус за цель: +10 дерева</b><small>Вся собранная добыча останется у тебя</small></span></section>
        </main>${overlay()}</section>`;
    } else if (screen === "result" && result) {
      const title = result.reachedGoal ? "Цель выполнена!" : "Смена завершена";
      const detail = result.reachedGoal
        ? "Бонусный ящик твой. Добыча уже на складе."
        : result.collected
          ? "Цель можно выполнить в следующий раз. Собранная добыча уже у тебя."
          : "Ты ещё ничего не собрал. Можно начать новую смену.";
      const retryLabel = result.reachedGoal ? "Ещё одна смена" : "Ещё одна попытка";
      const helpTitle = result.reachedGoal
        ? "Добыча поможет острову"
        : result.collected
          ? "Собранная добыча уже на складе"
          : "Вся добыча сохраняется";
      const helpText = result.reachedGoal
        ? "Потрать ресурсы на строительство, исследования или развитие поселения."
        : result.collected
          ? "Попробуй ещё раз, когда захочешь. Ресурсы не пропадут."
          : "Нет потери ресурсов и ограничений на число попыток. Попробуй ещё раз, когда захочешь.";
      root.innerHTML = `<section class="m3-screen m3-result"><header class="m3-header"><button class="m3-icon-button" data-action="close" aria-label="Вернуться на остров">‹</button><div><h1>Лесопилка</h1><p>Итоги смены</p></div></header><main>
        <span class="m3-result-icon">${art(result.reachedGoal ? "win" : "empty")}</span><h2>${title}</h2><p class="m3-lead">${detail}</p>
        <section class="m3-result-card"><div><small>Собрано дерева</small><b>${result.collected}</b></div><div><small>${result.bonus ? "Бонус за цель" : "Бонус не получен"}</small><b>${result.bonus ? `+${result.bonus}` : "—"}</b></div><div class="m3-result-total"><small>Всего на склад</small><b>${result.total}</b></div></section>
        <section class="m3-stock">${art("log", "m3-stock-art")}<div><small>Теперь на складе</small><i><em style="width:${(warehouseWood / 200) * 100}%"></em></i></div><b>${warehouseWood} / 200</b></section>
        <section class="m3-result-help"><b>${helpTitle}</b><p>${helpText}</p></section>
        <button class="m3-primary m3-bottom-action" data-action="${result.reachedGoal ? "close" : "again"}">${result.reachedGoal ? "На остров" : retryLabel}</button><button class="m3-result-again" data-action="${result.reachedGoal ? "again" : "close"}">${result.reachedGoal ? retryLabel : "На остров"}</button>
      </main></section>`;
    }
  }

  function startShift() {
    shift = { board: createBoard(sawmillTheme.chips), moves: sawmillTheme.moves, wood: 0 };
    selected = undefined;
    hint = [];
    result = undefined;
    presentationBoard = undefined;
    clearing = [];
    dropping = [];
    boardPhase = undefined;
    screen = "game";
  }

  function finishShift() {
    if (!shift) return;
    result = resultReward(shift.wood, sawmillTheme);
    warehouseWood = Math.min(200, warehouseWood + result.total);
    modal = undefined;
    screen = "result";
  }

  const wait = (milliseconds: number) =>
    new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

  async function playCell(clicked: Position) {
    if (!shift || busy) return;
    if (!selected || samePosition(selected, clicked)) {
      selected = samePosition(selected, clicked) ? undefined : clicked;
      hint = [];
      updateGameFrame();
      return;
    }
    const from = selected;
    const move = attemptMove(shift.board, from, clicked, sawmillTheme);
    selected = undefined;
    hint = [];
    busy = true;
    presentationBoard = move.swappedBoard;
    boardPhase = move.accepted ? "swap" : "invalid";
    updateGameFrame();
    await wait(170);
    if (!move.accepted) {
      presentationBoard = undefined;
      boardPhase = undefined;
      busy = false;
      updateGameFrame();
      return;
    }
    for (const step of move.steps) {
      const earned = step.cleared.filter(
        (position) => step.before[position.row][position.column] === sawmillTheme.mainChip,
      ).length;
      presentationBoard = step.before;
      clearing = step.cleared;
      dropping = [];
      boardPhase = "clear";
      updateGameFrame();
      await wait(190);
      clearing = [];
      presentationBoard = step.after;
      boardPhase = "drop";
      dropping = changedPositions(step.before, step.after);
      shift.wood += earned;
      updateGameFrame();
      await wait(240);
      if (shift.wood >= sawmillTheme.goal) {
        shift.board = step.after;
        shift.moves--;
        presentationBoard = undefined;
        boardPhase = undefined;
        dropping = [];
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
    busy = false;
    if (shift.wood >= sawmillTheme.goal || shift.moves === 0) finishShift();
    else updateGameFrame();
  }

  root.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action], [data-cell]");
    if (!target) return;
    const action = target.dataset.action;
    if (target.dataset.cell && shift) {
      const [row, column] = target.dataset.cell.split(":").map(Number);
      void playCell({ row, column });
      return;
    } else if (action === "close") close();
    else if (action === "hub") screen = "hub";
    else if (action === "brief") screen = "brief";
    else if (action === "start") startShift();
    else if (action === "again") screen = "brief";
    else if (action === "pause") modal = "pause";
    else if (action === "resume" || action === "close-modal") modal = undefined;
    else if (action === "finish") finishShift();
    else if (action === "rules") modal = "rules";
    else if (action === "energy") modal = "energy";
    else if (action === "hint" && shift) {
      hint = findPossibleMoves(shift.board)[0] ?? [];
      selected = undefined;
      updateGameFrame();
      return;
    }
    render();
  });

  render();
}
