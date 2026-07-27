import { createNewGame as createXiangkouGame } from "../src/game/engine";
import type { GameState as XiangkouState, Seat, SeatType } from "../src/game/types";
import { nextAutoplayStep, nextSichuanAutoplayStep, type AutoplayStep } from "../src/online/autoplay";
import { applyHostPlayerAction, maskStateForSeat } from "../src/online/gameActions";
import { createNewGame as createSichuanGame } from "../src/sichuan/engine";
import { applySichuanHostPlayerAction, maskSichuanStateForSeat } from "../src/online/sichuanActions";
import type { GameState as SichuanState } from "../src/sichuan/types";

export type GameKind = "xiangkou" | "sichuan";

/** Anything the GameRoom DO needs to run a table, parameterized per game. */
export type GameAdapter<TState> = {
  kind: GameKind;
  /** Build a fresh authoritative state for a started room. */
  createGame: (input: { roomCode: string; seed: number; names: string[]; seatTypes: Partial<Record<Seat, SeatType>> }) => TState;
  /** Validate + reduce a player action. */
  applyAction: (state: TState, action: { seat: Seat } & Record<string, unknown>) => { ok: true; state: TState } | { ok: false; reason: string; state: TState };
  /** Per-seat view filter (hides other hands / wall). */
  maskForSeat: (state: TState, seat: Seat) => TState;
  /** Next automatic advance (bot turn / auto-draw), or null to wait for a client. */
  nextStep: (state: TState) => AutoplayStep<TState> | null;
  /** Turn counter for snapshot metadata. */
  getTurn: (state: TState) => number;
  /** Default seat names when a seat is empty (bot fill). */
  defaultNames: [string, string, string, string];
};

const XIANGKOU_ADAPTER: GameAdapter<XiangkouState> = {
  kind: "xiangkou",
  createGame: ({ seed, names, seatTypes }) => {
    const state = createXiangkouGame(seed, undefined, 1, names, seatTypes);
    return state;
  },
  applyAction: (state, action) => applyHostPlayerAction(state, action as never),
  maskForSeat: (state, seat) => maskStateForSeat(state, seat),
  nextStep: (state) => nextAutoplayStep(state),
  getTurn: (state) => state.turn,
  defaultNames: ["房主", "阿南", "西门杠", "北风客"],
};

const SICHUAN_ADAPTER: GameAdapter<SichuanState> = {
  kind: "sichuan",
  createGame: ({ seed, names, seatTypes }) => {
    const state = createSichuanGame(seed, undefined, 1, names, seatTypes);
    return state;
  },
  applyAction: (state, action) => applySichuanHostPlayerAction(state, action as never),
  maskForSeat: (state, seat) => maskSichuanStateForSeat(state, seat),
  nextStep: (state) => nextSichuanAutoplayStep(state),
  getTurn: (state) => state.turn,
  defaultNames: ["房主", "下家阿蜀", "对家幺鸡", "上家老川"],
};

export function getAdapter(kind: GameKind): GameAdapter<unknown> {
  return (kind === "sichuan" ? SICHUAN_ADAPTER : XIANGKOU_ADAPTER) as GameAdapter<unknown>;
}

export function normalizeKind(value: string | null | undefined): GameKind {
  return value === "sichuan" ? "sichuan" : "xiangkou";
}
