import {
  arrangeHand,
  canSeatAddedKong,
  canSeatConcealedKong,
  canSeatSelfWin,
  claimMeld,
  claimSelfDraw,
  claimWin,
  declareConcealedKong,
  declareAddedKong,
  discardTile,
  passClaim,
} from "../game/engine";
import type { GameState, Seat, Tile } from "../game/types";
import type { PlayerAction } from "./protocol";

export type ActionResult =
  | {
      ok: true;
      state: GameState;
    }
  | {
      ok: false;
      reason: string;
      state: GameState;
    };

export function applyHostPlayerAction(state: GameState, action: PlayerAction): ActionResult {
  const access = validateActionAccess(state, action);
  if (!access.ok) {
    return { ok: false, reason: access.reason, state };
  }

  const next = reducePlayerAction(state, action);
  if (next === state) {
    return { ok: false, reason: "当前牌局不接受该操作", state };
  }

  return { ok: true, state: next };
}

function validateActionAccess(state: GameState, action: PlayerAction): { ok: true } | { ok: false; reason: string } {
  const player = state.players[action.seat];

  if (!player) {
    return { ok: false, reason: "座位不存在" };
  }

  if (player.type === "bot") {
    return { ok: false, reason: "机器人座位不能发送真人操作" };
  }

  if (action.type === "arrangeHand") {
    return { ok: true };
  }

  if (state.phase !== "playing") {
    return { ok: false, reason: "本局已经结束" };
  }

  if (action.type === "discard") {
    if (state.pendingClaim) {
      return { ok: false, reason: "当前有待响应操作" };
    }
    if (state.currentSeat !== action.seat) {
      return { ok: false, reason: "还没轮到这个座位" };
    }
    if (!player.hand.some((tile) => tile.id === action.tileId)) {
      return { ok: false, reason: "手牌中没有这张牌" };
    }
    return { ok: true };
  }

  if (action.type === "selfDraw") {
    if (!canSeatSelfWin(state, action.seat)) {
      return { ok: false, reason: "当前不能自摸" };
    }
    return { ok: true };
  }

  if (action.type === "kong") {
    const available =
      action.kind === "concealed" ? canSeatConcealedKong(state, action.seat) : canSeatAddedKong(state, action.seat);
    return available.includes(action.code) ? { ok: true } : { ok: false, reason: "当前不能杠这张牌" };
  }

  if (!state.pendingClaim || state.pendingClaim.seat !== action.seat) {
    return { ok: false, reason: "当前没有这个座位的响应操作" };
  }

  if (action.type === "claimWin") {
    if (!state.pendingClaim.options.some((option) => option.action === "win")) {
      return { ok: false, reason: "当前不能胡" };
    }
    return { ok: true };
  }

  if (action.type === "claimMeld") {
    const option = state.pendingClaim.options.find((item) => item.id === action.optionId);
    if (!option || option.action === "win") {
      return { ok: false, reason: "无效的吃碰杠选择" };
    }
    return { ok: true };
  }

  return { ok: true };
}

function reducePlayerAction(state: GameState, action: PlayerAction): GameState {
  switch (action.type) {
    case "discard":
      return discardTile(state, action.seat, action.tileId);
    case "claimWin":
      return claimWin(state, action.seat);
    case "claimMeld":
      return claimMeld(state, action.seat, action.optionId);
    case "passClaim":
      return passClaim(state, action.seat);
    case "selfDraw":
      return claimSelfDraw(state, action.seat);
    case "kong":
      return action.kind === "concealed"
        ? declareConcealedKong(state, action.seat, action.code)
        : declareAddedKong(state, action.seat, action.code);
    case "arrangeHand":
      return arrangeHand(state, action.seat);
  }
}

export function maskStateForSeat(state: GameState, seat: Seat): GameState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      hand: player.seat === seat ? [...player.hand] : player.hand.map((_, index) => hiddenTile(`seat-${player.seat}-${index}`)),
      drawnTileId: player.seat === seat ? player.drawnTileId : undefined,
      melds: player.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
      flowers: [...(player.flowers ?? [])],
      discards: [...player.discards],
    })),
    wall: state.wall.map((_, index) => hiddenTile(`wall-${index}`)),
    logs: [...state.logs],
    pendingClaim: state.pendingClaim
      ? {
          ...state.pendingClaim,
          options:
            state.pendingClaim.seat === seat
              ? state.pendingClaim.options.map((option) => ({
                  ...option,
                  handTileIds: [...option.handTileIds],
                  previewTileCodes: [...option.previewTileCodes],
                }))
              : [],
        }
      : undefined,
  };
}

function hiddenTile(id: string): Tile {
  return {
    id: `hidden-${id}`,
    code: "east",
    suit: "honors",
    rank: "east",
    label: "牌背",
    shortLabel: "背",
  };
}
