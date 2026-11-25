import type { Board, ChipId, ShiftId } from "./match3";
import type { Axial } from "./hex";
import { gameRequest as request, withGuestWorld } from "./game-api";
export { GameApiError as Match3ApiError } from "./game-api";

export type ResourceId = "wood" | "food" | "stone" | "iron";
export type Warehouse = Record<ResourceId, { amount: number; limit: number }>;

export interface Goal {
  type: "collect" | "amphora";
  chipId: ChipId | null;
  target: number;
  bonus: number;
  targetDepth: number | null;
}

export interface ShiftView {
  shiftId: ShiftId;
  goal: Goal;
  moves: number;
  moveBreakdown?: {
    base: number;
    forest: number;
    happiness: number;
  };
  charges: number;
  assignedWorkers: number;
  available: boolean;
  reasons: { code: string; message: string }[];
}

export interface Match3Result {
  serverSavedAt: number;
  shiftId: ShiftId;
  resourceId: ResourceId | null;
  collected: number;
  bonus: number;
  credited: number;
  overflow: number;
  goalReached: boolean;
  warehouse: Warehouse;
  dig: { savedDepth: number; revealedCell: Axial | null } | null;
}

export interface Match3Run {
  runId: string;
  shiftId: ShiftId;
  board: Board;
  goal: Goal;
  movesLeft: number;
  chargesLeft: number;
  collected: number;
  digDepth: number;
  revision: number;
  clientManaged: boolean;
  excavationSiteId: string | null;
}

export interface Match3State {
  playerId: string;
  serverSavedAt: number;
  warehouse: Warehouse;
  digDepth: number;
  excavation: { siteId: string } | null;
  shifts: ShiftView[];
  activeRun: Match3Run | null;
}

export interface ClientResult {
  runId: string;
  shiftId: ShiftId;
  movesLeft: number;
  chargesLeft: number;
  collected: number;
  digDepth: number;
  digStartDepth?: number;
  excavationSiteId?: string;
  legacyRevision?: number;
}

export function newMatch3RunId() {
  // getRandomValues работает и по HTTP в локальной сети.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

const prefix = "/game/match3";
export const match3Api = {
  state() {
    return withGuestWorld(() => request<Match3State>(`${prefix}/state`));
  },
  pause(result: ClientResult, board: Board) {
    return request<Match3Run>(`${prefix}/pause`, { ...result, board });
  },
  saveResult(result: ClientResult) {
    return request<Match3Result>(`${prefix}/results`, result);
  },
};
