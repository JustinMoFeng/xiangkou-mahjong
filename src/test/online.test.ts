import { describe, expect, it } from "vitest";
import { createNewGame, discardTile } from "../game/engine";
import { createWall } from "../game/tiles";
import type { GameState, Seat, Tile, TileCode } from "../game/types";
import { applyHostPlayerAction, maskStateForSeat } from "../online/gameActions";
import { shouldApplyStateSnapshot } from "../online/protocol";
import { applySichuanHostPlayerAction, maskSichuanStateForSeat } from "../online/sichuanActions";
import { createNewGame as createSichuanGame } from "../sichuan/engine";
import { OnlineCreateRoom, OnlineJoinRoom } from "../online/OnlineRoom";
import { SichuanCreateRoom, SichuanJoinRoom } from "../online/SichuanRoom";
import { XiangkouCreateRoom, XiangkouJoinRoom } from "../online/XiangkouRoom";

const tilePool = createWall();

function tiles(codes: TileCode[]): Tile[] {
  const used = new Map<TileCode, number>();

  return codes.map((code) => {
    const copy = used.get(code) ?? 0;
    used.set(code, copy + 1);
    const tile = tilePool.find((item) => item.code === code && item.id.endsWith(`-${copy}`));
    if (!tile) {
      throw new Error(`Missing tile ${code} copy ${copy}`);
    }
    return tile;
  });
}

function onlineState(): GameState {
  const state = createNewGame(20260725, undefined, 1, ["房主", "东东", "西西", "北北"], {
    0: "human",
    1: "remote",
    2: "bot",
    3: "bot",
  });
  state.roomId = "123456";
  return state;
}

describe("online host action handling", () => {
  it("rejects a discard from a remote player when it is not their turn", () => {
    const state = onlineState();
    const tile = state.players[1].hand[0];
    const result = applyHostPlayerAction(state, { type: "discard", seat: 1, tileId: tile.id });

    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
    expect(result.ok ? "" : result.reason).toBe("还没轮到这个座位");
  });

  it("accepts a legal remote discard through the host engine", () => {
    const state = onlineState();
    state.currentSeat = 1;
    state.players[1].hand.push(state.wall.shift()!);
    const tile = state.players[1].hand[0];
    const result = applyHostPlayerAction(state, { type: "discard", seat: 1, tileId: tile.id });

    expect(result.ok).toBe(true);
    expect(result.state.players[1].discards.map((discard) => discard.id)).toContain(tile.id);
  });

  it("routes pending claims to a remote seat and accepts the matching claim", () => {
    const state = onlineState();
    const [red0, red1, red2] = tiles(["red", "red", "red"]);
    state.currentSeat = 0;
    state.players[0].hand = [red2, ...tiles(["m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "m7", "m8", "m9", "east"])];
    state.players[1].hand = [red0, red1, ...tiles(["m4", "m5", "m6", "p4", "p5", "p6", "s4", "s5", "s6", "east", "south"])];

    const pending = discardTile(state, 0, red2.id);

    expect(pending.pendingClaim?.seat).toBe<Seat>(1);
    const option = pending.pendingClaim?.options.find((item) => item.action === "pong");
    expect(option).toBeDefined();

    const result = applyHostPlayerAction(pending, { type: "claimMeld", seat: 1, optionId: option!.id });

    expect(result.ok).toBe(true);
    expect(result.state.players[1].melds[0]?.kind).toBe("pong");
  });

  it("accepts a remote added-kong action after that seat has ponged", () => {
    const state = onlineState();
    const [red0, red1, red2, red3] = tiles(["red", "red", "red", "red"]);
    state.currentSeat = 1;
    state.players[1].melds = [{ kind: "pong", tiles: [red0, red1, red2], from: 0, calledTile: red0 }];
    state.players[1].hand = [red3, ...tiles(["m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "m7"])];
    state.players[1].drawnTileId = red3.id;
    const wallBefore = state.wall.length;

    const result = applyHostPlayerAction(state, { type: "kong", seat: 1, code: "red" });

    expect(result.ok).toBe(true);
    expect(result.state.players[1].melds[0]).toMatchObject({ kind: "kong" });
    expect(result.state.players[1].melds[0].tiles).toHaveLength(4);
    expect(result.state.players[1].hand.some((tile) => tile.id === red3.id)).toBe(false);
    expect(result.state.players[1].drawnTileId).toBeDefined();
    expect(result.state.wall).toHaveLength(wallBefore - 1);
  });
});

describe("online snapshot rules", () => {
  it("ignores state snapshots on the host side", () => {
    const message = {
      type: "stateSnapshot" as const,
      roomCode: "123456",
      turn: 1,
      state: onlineState(),
    };

    expect(shouldApplyStateSnapshot("host", message)).toBe(false);
    expect(shouldApplyStateSnapshot("guest", message)).toBe(true);
  });

  it("masks other players concealed hands and keeps the guest hand visible", () => {
    const state = onlineState();
    const [spring] = tiles(["spring"]);
    state.players[0].flowers = [spring];
    const masked = maskStateForSeat(state, 1);

    expect(masked.players[1].hand.map((tile) => tile.id)).toEqual(state.players[1].hand.map((tile) => tile.id));
    expect(masked.players[0].hand.every((tile) => tile.id.startsWith("hidden-"))).toBe(true);
    expect(masked.players[0].flowers.map((tile) => tile.code)).toEqual(["spring"]);
    expect(masked.players[2].hand.every((tile) => tile.id.startsWith("hidden-"))).toBe(true);
    expect(masked.wall).toHaveLength(state.wall.length);
    expect(masked.wall.every((tile) => tile.id.startsWith("hidden-"))).toBe(true);
  });
});

describe("sichuan online host action handling", () => {
  it("accepts remote missing-suit selection", () => {
    const state = createSichuanGame(20260726, undefined, 1, ["房主", "玩家", "对家", "上家"], {
      0: "human",
      1: "remote",
      2: "bot",
      3: "bot",
    });

    const result = applySichuanHostPlayerAction(state, { type: "chooseMissing", seat: 1, suit: "s" });

    expect(result.ok).toBe(true);
    expect(result.state.players[1].missingSuit).toBe("s");
  });

  it("rejects a remote discard before it is that seat's turn", () => {
    const state = createSichuanGame(20260727, undefined, 1, ["房主", "玩家", "对家", "上家"], {
      0: "human",
      1: "remote",
      2: "bot",
      3: "bot",
    });
    state.phase = "playing";
    state.missingChosen = true;
    state.awaitingDiscard = true;
    state.players.forEach((player) => {
      player.missingSuit = "s";
    });
    const tile = state.players[1].hand[0];

    const result = applySichuanHostPlayerAction(state, { type: "discard", seat: 1, tileId: tile.id });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.reason).toBe("还没轮到这个座位出牌");
  });

  it("masks other players concealed Sichuan hands", () => {
    const state = createSichuanGame(20260728, undefined, 1, ["房主", "玩家", "对家", "上家"], {
      0: "human",
      1: "remote",
      2: "bot",
      3: "bot",
    });
    const masked = maskSichuanStateForSeat(state, 1);

    expect(masked.players[1].hand.map((tile) => tile.id)).toEqual(state.players[1].hand.map((tile) => tile.id));
    expect(masked.players[0].hand.every((tile) => tile.id.startsWith("hidden-"))).toBe(true);
    expect(masked.players[2].hand.every((tile) => tile.id.startsWith("hidden-"))).toBe(true);
    expect(masked.wall.every((tile) => tile.id.startsWith("hidden-"))).toBe(true);
  });
});

describe("online room adapters", () => {
  it("keeps Xiangkou and Sichuan wired through the generic room components", () => {
    expect(OnlineCreateRoom).toBeTypeOf("function");
    expect(OnlineJoinRoom).toBeTypeOf("function");
    expect(XiangkouCreateRoom).toBeTypeOf("function");
    expect(XiangkouJoinRoom).toBeTypeOf("function");
    expect(SichuanCreateRoom).toBeTypeOf("function");
    expect(SichuanJoinRoom).toBeTypeOf("function");
  });
});
