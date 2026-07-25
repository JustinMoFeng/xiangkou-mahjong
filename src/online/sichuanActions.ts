import {
  arrangeHand,
  canSeatAddedKong,
  canSeatConcealedKong,
  canSeatSelfWin,
  chooseMissingSuit,
  claimMeld,
  claimSelfDraw,
  claimWin,
  declareAddedKong,
  declareConcealedKong,
  discardTile,
  passClaim,
} from "../sichuan/engine";
import type { GameState, Seat, SuitPrefix, Tile, TileCode } from "../sichuan/types";

export type SichuanPlayerAction =
  | {
      type: "chooseMissing";
      seat: Seat;
      suit: SuitPrefix;
    }
  | {
      type: "discard";
      seat: Seat;
      tileId: string;
    }
  | {
      type: "claimWin";
      seat: Seat;
    }
  | {
      type: "claimMeld";
      seat: Seat;
      optionId: string;
    }
  | {
      type: "passClaim";
      seat: Seat;
    }
  | {
      type: "selfDraw";
      seat: Seat;
    }
  | {
      type: "kong";
      seat: Seat;
      code: TileCode;
      kind: "concealed" | "added";
    }
  | {
      type: "arrangeHand";
      seat: Seat;
    };

export type SichuanActionResult =
  | {
      ok: true;
      state: GameState;
    }
  | {
      ok: false;
      reason: string;
      state: GameState;
    };

export function applySichuanHostPlayerAction(state: GameState, action: SichuanPlayerAction): SichuanActionResult {
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

function validateActionAccess(state: GameState, action: SichuanPlayerAction): { ok: true } | { ok: false; reason: string } {
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
  if (action.type === "chooseMissing") {
    if (state.phase !== "choosing-missing") {
      return { ok: false, reason: "当前不能定缺" };
    }
    if (player.missingSuit) {
      return { ok: false, reason: "这个座位已经定缺" };
    }
    return { ok: true };
  }
  if (state.phase !== "playing") {
    return { ok: false, reason: "本局尚未进入出牌阶段" };
  }
  if (player.hasWon) {
    return { ok: false, reason: "已胡玩家不能继续操作" };
  }
  if (action.type === "discard") {
    if (state.pendingClaim) {
      return { ok: false, reason: "当前有待响应操作" };
    }
    if (state.currentSeat !== action.seat || !state.awaitingDiscard) {
      return { ok: false, reason: "还没轮到这个座位出牌" };
    }
    if (!player.hand.some((tile) => tile.id === action.tileId)) {
      return { ok: false, reason: "手牌中没有这张牌" };
    }
    return { ok: true };
  }
  if (action.type === "selfDraw") {
    return canSeatSelfWin(state, action.seat) ? { ok: true } : { ok: false, reason: "当前不能自摸" };
  }
  if (action.type === "kong") {
    const available = action.kind === "concealed" ? canSeatConcealedKong(state, action.seat) : canSeatAddedKong(state, action.seat);
    return available.includes(action.code) ? { ok: true } : { ok: false, reason: "当前不能杠这张牌" };
  }
  if (!state.pendingClaim || state.pendingClaim.seat !== action.seat) {
    return { ok: false, reason: "当前没有这个座位的响应操作" };
  }
  if (action.type === "claimWin") {
    return state.pendingClaim.options.some((option) => option.action === "win")
      ? { ok: true }
      : { ok: false, reason: "当前不能胡" };
  }
  if (action.type === "claimMeld") {
    const option = state.pendingClaim.options.find((item) => item.id === action.optionId);
    return option && option.action !== "win" ? { ok: true } : { ok: false, reason: "无效的碰杠选择" };
  }
  return { ok: true };
}

function reducePlayerAction(state: GameState, action: SichuanPlayerAction): GameState {
  switch (action.type) {
    case "chooseMissing":
      return chooseMissingSuit(state, action.seat, action.suit);
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

export function maskSichuanStateForSeat(state: GameState, seat: Seat): GameState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      hand: player.seat === seat || player.hasWon ? [...player.hand] : player.hand.map((_, index) => hiddenTile(`seat-${player.seat}-${index}`)),
      drawnTileId: player.seat === seat ? player.drawnTileId : undefined,
      melds: player.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
      discards: [...player.discards],
      winInfo: player.winInfo
        ? { ...player.winInfo, details: player.winInfo.details.map((detail) => ({ ...detail })) }
        : undefined,
    })),
    wall: state.wall.map((_, index) => hiddenTile(`wall-${index}`)),
    logs: [...state.logs],
    gangLog: state.gangLog.map((entry) => ({ ...entry, from: entry.from.map((item) => ({ ...item })) })),
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
    code: "m1",
    suit: "m",
    rank: 1,
    label: "牌背",
    shortLabel: "背",
  };
}
