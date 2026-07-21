import { describe, expect, it } from "vitest";
import { arrangeHand, createNewGame, createNextRound, discardTile, drawForCurrentSeat, getClaimOptionsForSeat } from "../game/engine";
import { checkStandardWin, scoreWinningHand } from "../game/rules";
import { createWall } from "../game/tiles";
import type { Tile, TileCode } from "../game/types";

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

describe("mahjong rules", () => {
  it("allows a low-value garbage hand to win at one multiplier", () => {
    const hand = tiles(["m1", "m2", "m3", "p2", "p3", "p4", "s3", "s4", "s5", "m7", "m8", "m9", "p9", "p9"]);
    const check = checkStandardWin(hand);

    expect(check.canWin).toBe(true);
    expect(check.pattern).toBeDefined();

    const score = scoreWinningHand({
      tiles: hand,
      winningTile: hand[hand.length - 1],
      kind: "discard",
      pattern: check.pattern!,
    });

    expect(score.title).toBe("垃圾胡");
    expect(score.multiplier).toBe(1);
    expect(score.details).toEqual([{ name: "垃圾胡", multiplier: 1 }]);
  });

  it("rejects a non-winning shape", () => {
    const hand = tiles(["m1", "m1", "m1", "m2", "m3", "m4", "p2", "p3", "p5", "s1", "s2", "s3", "east", "red"]);

    expect(checkStandardWin(hand).canWin).toBe(false);
  });

  it("adds self draw, all triplets, pure suit, and honor triplet multipliers", () => {
    const hand = tiles(["m1", "m1", "m1", "m3", "m3", "m3", "m5", "m5", "m5", "m7", "m7", "m7", "m9", "m9"]);
    const check = checkStandardWin(hand);

    expect(check.canWin).toBe(true);

    const score = scoreWinningHand({
      tiles: hand,
      winningTile: hand[13],
      kind: "self-draw",
      pattern: check.pattern!,
    });

    expect(score.multiplier).toBe(8);
    expect(score.details.map((detail) => detail.name)).toEqual(["垃圾胡", "自摸", "碰碰胡", "清一色"]);
  });

  it("adds one multiplier for each honor triplet", () => {
    const hand = tiles(["east", "east", "east", "red", "red", "red", "m2", "m3", "m4", "p2", "p3", "p4", "s9", "s9"]);
    const check = checkStandardWin(hand);

    expect(check.canWin).toBe(true);

    const score = scoreWinningHand({
      tiles: hand,
      winningTile: hand[13],
      kind: "discard",
      pattern: check.pattern!,
    });

    expect(score.multiplier).toBe(3);
    expect(score.details.filter((detail) => detail.name === "字牌刻子")).toHaveLength(2);
  });

  it("keeps the drawn tile at the far right until a discard or arrange action", () => {
    const state = createNewGame(7);
    const human = state.players[0];

    expect(human.drawnTileId).toBeDefined();
    expect(human.hand[human.hand.length - 1]?.id).toBe(human.drawnTileId);

    const firstTileId = human.hand[0].id;
    const afterDiscard = discardTile(state, 0, firstTileId);

    expect(afterDiscard.players[0].drawnTileId).toBeUndefined();
    expect(afterDiscard.players[0].hand).toHaveLength(13);
  });

  it("places a newly drawn tile at the far right on a later human turn", () => {
    const state = arrangeHand(createNewGame(11), 0);
    const firstTileId = state.players[0].hand[0].id;
    const afterDiscard = discardTile(state, 0, firstTileId);
    const humanTurn = {
      ...afterDiscard,
      currentSeat: 0 as const,
      pendingClaim: undefined,
    };
    const afterDraw = drawForCurrentSeat(humanTurn);

    expect(afterDraw.players[0].drawnTileId).toBeDefined();
    expect(afterDraw.players[0].hand[afterDraw.players[0].hand.length - 1]?.id).toBe(afterDraw.players[0].drawnTileId);
  });

  it("returns every possible chow combination and only from the previous seat", () => {
    const state = createNewGame(23);
    const [p3, p4, p5, p6, p7] = tiles(["p3", "p4", "p5", "p6", "p7"]);
    state.players[0].hand = [p3, p4, p6, p7];
    const options = getClaimOptionsForSeat(state, 0, 3, p5).filter((option) => option.action === "chow");

    expect(options.map((option) => option.previewTileCodes.join(","))).toEqual(["p3,p4,p5", "p4,p5,p6", "p5,p6,p7"]);
    expect(options.every((option) => option.handTileIds.length === 2)).toBe(true);
    expect(getClaimOptionsForSeat(state, 0, 2, p5).filter((option) => option.action === "chow")).toHaveLength(0);
  });

  it("returns pong and kong options with concrete highlighted hand tiles", () => {
    const state = createNewGame(29);
    const [red0, red1, red2, red3] = tiles(["red", "red", "red", "red"]);
    state.players[0].hand = [red0, red1, red2];
    const options = getClaimOptionsForSeat(state, 0, 1, red3);

    const pong = options.find((option) => option.action === "pong");
    const kong = options.find((option) => option.action === "kong");

    expect(pong?.handTileIds).toHaveLength(2);
    expect(kong?.handTileIds).toHaveLength(3);
    expect(kong?.previewTileCodes).toEqual(["red", "red", "red", "red"]);
  });

  it("lets bots pong from real hand tiles when no one can win", () => {
    const state = createNewGame(31);
    const [red0, red1, red2] = tiles(["red", "red", "red"]);
    state.currentSeat = 0;
    state.players[0].hand = [red2, ...tiles(["m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "m7", "m8", "m9", "east"])];
    state.players[1].hand = [red0, red1, ...tiles(["m4", "m5", "m6", "p4", "p5", "p6", "s4", "s5", "s6", "east", "south"])];
    const next = discardTile(state, 0, red2.id);

    expect(next.players[1].melds[0]?.kind).toBe("pong");
    expect(next.players[1].melds[0]?.tiles.map((tile) => tile.code)).toEqual(["red", "red", "red"]);
    expect(next.players[1].hand.filter((tile) => tile.code === "red")).toHaveLength(0);
    expect(next.currentSeat).toBe(1);
  });

  it("lets bots kong when they hold three matching hand tiles", () => {
    const state = createNewGame(37);
    const [red0, red1, red2, red3] = tiles(["red", "red", "red", "red"]);
    state.currentSeat = 0;
    state.players[0].hand = [red3, ...tiles(["m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "m7", "m8", "m9", "east"])];
    state.players[1].hand = [red0, red1, red2, ...tiles(["m4", "m5", "m6", "p4", "p5", "p6", "s4", "s5", "s6", "east"])];
    const next = discardTile(state, 0, red3.id);

    expect(next.players[1].melds[0]?.kind).toBe("kong");
    expect(next.players[1].melds[0]?.tiles).toHaveLength(4);
    expect(next.players[1].hand.filter((tile) => tile.code === "red")).toHaveLength(0);
  });

  it("prioritizes a bot win over a human chow option", () => {
    const state = createNewGame(41);
    const [p3, p4, p5, p6, p7] = tiles(["p3", "p4", "p5", "p6", "p7"]);
    state.currentSeat = 3;
    state.players[3].hand = [p5, ...tiles(["m1", "m2", "m3", "s1", "s2", "s3", "east", "east", "south", "south", "red", "green", "white"])];
    state.players[0].hand = [p3, p4, p6, p7, ...tiles(["m7", "m8", "m9", "s7", "s8", "s9", "east", "red", "green"])];
    state.players[1].hand = tiles(["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "p1", "p1", "p3", "p4"]);
    const next = discardTile(state, 3, p5.id);

    expect(next.phase).toBe("finished");
    expect(next.winner?.winner).toBe(1);
    expect(next.pendingClaim).toBeUndefined();
  });

  it("carries scores into the next round and increments the round number", () => {
    const state = createNewGame(43);
    state.players[0].score = 21000;
    state.players[1].score = 29000;
    const next = createNextRound(state, 44);

    expect(next.roundNumber).toBe(state.roundNumber + 1);
    expect(next.players.map((player) => player.score)).toEqual([21000, 29000, 25000, 25000]);
    expect(next.phase).toBe("playing");
  });

  it("ends the whole game when a player reaches zero or below", () => {
    const state = createNewGame(47);
    const [p3, p4, p5, p6, p7] = tiles(["p3", "p4", "p5", "p6", "p7"]);
    state.currentSeat = 3;
    state.players[3].score = 500;
    state.players[3].hand = [p5, ...tiles(["m1", "m2", "m3", "s1", "s2", "s3", "east", "east", "south", "south", "red", "green", "white"])];
    state.players[0].hand = [p3, p4, p6, p7, ...tiles(["m7", "m8", "m9", "s7", "s8", "s9", "east", "red", "green"])];
    state.players[1].hand = tiles(["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "p1", "p1", "p3", "p4"]);

    const next = discardTile(state, 3, p5.id);

    expect(next.phase).toBe("finished");
    expect(next.gameOverReason).toBe("bankrupt");
    expect(next.players[3].score).toBeLessThanOrEqual(0);
  });
});
