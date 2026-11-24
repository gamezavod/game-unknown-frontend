import type { Board, ChipId, Position, ShiftId } from "./match3";
import type { Axial } from "./hex";
import { gameRequest as request, withGuestWorld } from "./game-api";
export { GameApiError as Match3ApiError } from "./game-api";

export type ResourceId = "wood" | "food" | "stone" | "iron";
export type Warehouse = Record<ResourceId, { amount: number; limit: number }>;

interface Goal {
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
  charges: number;
  assignedWorkers: number;
}

export interface Match3Result {
  runId: string;
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
  amphora: Position | null;
  revision: number;
  status: "active" | "finished";
  result: Match3Result | null;
}

export interface Match3State {
  warehouse: Warehouse;
  digDepth: number;
  shifts: ShiftView[];
  activeRun: Match3Run | null;
  lastResult: Match3Result | null;
}

export interface Match3Step {
  kind: "match" | "lightning" | "reshuffle";
  before: Board;
  cleared: Position[];
  after: Board;
  earned: number;
  amphoraBefore: Position | null;
  amphoraAfter: Position | null;
}

interface MoveResponse extends Match3Run {
  accepted: boolean;
  rejectionReason: string | null;
  swappedBoard: Board;
  steps: Match3Step[];
}

interface HintResponse {
  available: boolean;
  revision: number;
  from: Position | null;
  to: Position | null;
}

export function match3RequestKey() {
  // getRandomValues работает и по HTTP в локальной сети.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

const prefix = "/game/match3";
const runPath = (runId: string) => `${prefix}/runs/${encodeURIComponent(runId)}`;

export const match3Api = {
  state() {
    return withGuestWorld(() => request<Match3State>(`${prefix}/state`));
  },
  start(shiftId: ShiftId, key: string, target?: Axial) {
    return request<Match3Run>(`${prefix}/runs`, { shiftId, target }, key);
  },
  move(run: Match3Run, from: Position, to: Position, key: string) {
    return request<MoveResponse>(`${runPath(run.runId)}/moves`, { from, to, expectedRevision: run.revision }, key);
  },
  hint(run: Match3Run) {
    return request<HintResponse>(`${runPath(run.runId)}/hint`);
  },
  lightning(run: Match3Run, row: number, key: string) {
    return request<Match3Run & { steps: Match3Step[] }>(`${runPath(run.runId)}/lightning`, { row, expectedRevision: run.revision }, key);
  },
  finish(run: Match3Run, key: string) {
    return request<Match3Result>(`${runPath(run.runId)}/finish`, { expectedRevision: run.revision }, key);
  },
};
