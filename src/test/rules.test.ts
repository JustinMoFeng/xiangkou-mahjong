import { describe, expect, it } from "vitest";
import {
  arrangeHand,
  canSeatAddedKong,
  canSeatConcealedKong,
  createNewGame,
  createNextRound,
  claimSelfDraw,
  claimWin,
  declareConcealedKong,
  declareAddedKong,
  discardTile,
  drawForCurrentSeat,
  getClaimOptionsForSeat,
} from "../game/engine";
import { checkStandardWin, checkWinningHand, scoreWinningHand } from "../game/rules";
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
  it("creates a 144-tile wall with eight flowers", () => {
    const wall = createWall();

    expect(wall).toHaveLength(144);
    expect(wall.filter((tile) => tile.suit === "flowers").map((tile) => tile.code)).toEqual([
      "spring",
      "summer",
      "autumn",
      "winter",
      "plum",
      "orchid",
      "bamboo",
      "chrysanthemum",
    ]);
  });

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

    expect(score.title).toBe("垃圾胡 + 门清");
    expect(score.multiplier).toBe(2);
    expect(score.details).toEqual([
      { name: "垃圾胡", multiplier: 1 },
      { name: "门清", multiplier: 1 },
    ]);
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

    expect(score.multiplier).toBe(14);
    expect(score.details.map((detail) => detail.name)).toEqual([
      "垃圾胡",
      "自摸",
      "门清",
      "碰碰胡",
      "清一色",
      "清一色翻倍",
    ]);
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

    expect(score.multiplier).toBe(4);
    expect(score.details.map((detail) => detail.name)).toContain("门清");
    expect(score.details.filter((detail) => detail.name === "字牌刻子")).toHaveLength(2);
  });

  it("recognizes seven pairs and thirteen orphans as special winning hands", () => {
    const sevenPairs = tiles(["m1", "m1", "m2", "m2", "m3", "m3", "p4", "p4", "p5", "p5", "s6", "s6", "east", "east"]);
    const thirteenOrphans = tiles([
      "m1",
      "m9",
      "p1",
      "p9",
      "s1",
      "s9",
      "east",
      "south",
      "west",
      "north",
      "red",
      "green",
      "white",
      "m1",
    ]);

    expect(checkWinningHand(sevenPairs).pattern?.kind).toBe("seven-pairs");
    expect(checkWinningHand(thirteenOrphans).pattern?.kind).toBe("thirteen-orphans");
  });

  it("scores one multiplier for each revealed flower", () => {
    const hand = tiles(["m1", "m2", "m3", "p2", "p3", "p4", "s3", "s4", "s5", "m7", "m8", "m9", "p9", "p9"]);
    const check = checkStandardWin(hand);
    const [spring, plum] = tiles(["spring", "plum"]);

    const score = scoreWinningHand({
      tiles: hand,
      winningTile: hand[13],
      kind: "discard",
      pattern: check.pattern!,
      flowers: [spring, plum],
    });

    expect(score.multiplier).toBe(4);
    expect(score.details.map((detail) => detail.name)).toContain("花牌 春");
    expect(score.details.map((detail) => detail.name)).toContain("花牌 梅");
  });

  it("replaces flowers during draw without keeping them in hand", () => {
    const state = createNewGame(51);
    const [spring, m1] = tiles(["spring", "m1"]);
    state.currentSeat = 0;
    state.pendingClaim = undefined;
    state.wall = [spring, m1];
    state.players[0].hand = tiles(["m2", "m3", "m4", "p2", "p3", "p4", "s3", "s4", "s5", "m7", "m8", "m9", "p9"]);
    state.players[0].flowers = [];
    state.players[0].drawnTileId = undefined;

    const next = drawForCurrentSeat(state);

    expect(next.players[0].flowers.map((tile) => tile.code)).toEqual(["spring"]);
    expect(next.players[0].hand.map((tile) => tile.code)).not.toContain("spring");
    expect(next.players[0].hand[next.players[0].hand.length - 1]?.id).toBe(m1.id);
    expect(next.players[0].drawnTileId).toBe(m1.id);
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

  it("upgrades a pong to an added kong and draws a replacement tile", () => {
    const state = createNewGame(39);
    const [red0, red1, red2, red3] = tiles(["red", "red", "red", "red"]);
    state.currentSeat = 0;
    state.players[0].melds = [{ kind: "pong", tiles: [red0, red1, red2], from: 1, calledTile: red0 }];
    state.players[0].hand = [red3, ...tiles(["m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "m7"])];
    state.players[0].drawnTileId = red3.id;
    const wallBefore = state.wall.length;

    expect(canSeatAddedKong(state, 0)).toEqual(["red"]);

    const next = declareAddedKong(state, 0, "red");

    expect(next.currentSeat).toBe(0);
    expect(next.players[0].melds[0]).toMatchObject({ kind: "kong" });
    expect(next.players[0].melds[0]).toMatchObject({ kongKind: "added" });
    expect(next.players[0].melds[0].tiles).toHaveLength(4);
    expect(next.players[0].hand.some((tile) => tile.id === red3.id)).toBe(false);
    expect(next.players[0].drawnTileId).toBeDefined();
    expect(next.wall).toHaveLength(wallBefore - 1);
    expect(next.recentAction).toContain("补杠");
  });

  it("lets a player make a concealed kong without breaking menqing and draws from the wall end", () => {
    const state = createNewGame(40);
    const [red0, red1, red2, red3, frontM1, m9] = tiles(["red", "red", "red", "red", "m1", "m9"]);
    state.currentSeat = 0;
    state.pendingClaim = undefined;
    state.wall = [frontM1, m9];
    state.players[0].hand = [red0, red1, red2, red3, ...tiles(["m2", "m3", "m4", "p2", "p3", "p4", "s3", "s4", "s5", "east"])];
    state.players[0].drawnTileId = red3.id;
    state.players[0].melds = [];

    expect(canSeatConcealedKong(state, 0)).toEqual(["red"]);

    const next = declareConcealedKong(state, 0, "red");

    expect(next.players[0].melds[0]).toMatchObject({ kind: "kong", kongKind: "concealed" });
    expect(next.players[0].hand.some((tile) => tile.code === "red")).toBe(false);
    expect(next.players[0].hand[next.players[0].hand.length - 1]?.id).toBe(m9.id);
    expect(next.wall.map((tile) => tile.id)).toEqual([frontM1.id]);
  });

  it("adds kong draw when winning on a supplement draw", () => {
    const state = createNewGame(42);
    const [red0, red1, red2, red3, handP9, drawP9] = tiles(["red", "red", "red", "red", "p9", "p9"]);
    state.currentSeat = 0;
    state.pendingClaim = undefined;
    state.wall = [drawP9];
    state.players[0].hand = [
      red0,
      red1,
      red2,
      red3,
      ...tiles(["m1", "m2", "m3", "p2", "p3", "p4", "s3", "s4", "s5"]),
      handP9,
    ];
    state.players[0].flowers = [];
    state.players[0].drawnTileId = red3.id;

    const afterKong = declareConcealedKong(state, 0, "red");
    const next = claimSelfDraw(afterKong, 0);

    expect(next.phase).toBe("finished");
    expect(next.winner?.details).toContainEqual({ name: "杠", multiplier: 2 });
    expect(next.winner?.details).toContainEqual({ name: "杠上开花", multiplier: 2, operation: "multiply" });
  });

  it("lets a human rob an added kong", () => {
    const state = createNewGame(44);
    const [red0, red1, red2, red3] = tiles(["red", "red", "red", "red"]);
    state.currentSeat = 1;
    state.players[1].type = "bot";
    state.players[1].melds = [{ kind: "pong", tiles: [red0, red1, red2], from: 0, calledTile: red0 }];
    state.players[1].hand = [red3, ...tiles(["m4", "m5", "m6", "p4", "p5", "p6", "s4", "s5", "s6", "east"])];
    state.players[1].drawnTileId = red3.id;
    state.players[0].hand = tiles(["m1", "m2", "m3", "p2", "p3", "p4", "s3", "s4", "s5", "m7", "m8", "m9", "red"]);

    const pending = declareAddedKong(state, 1, "red");

    expect(pending.pendingClaim?.robKong).toBe(true);
    expect(pending.pendingClaim?.options[0].label).toBe("抢杠胡");

    const next = claimWin(pending, 0);
    expect(next.phase).toBe("finished");
    expect(next.winner?.winner).toBe(0);
    expect(next.winner?.details.map((detail) => detail.name)).toContain("抢杠胡");
  });

  it("caps high-value doubled hands at twenty four multipliers", () => {
    const hand = tiles(["m1", "m1", "m1", "m3", "m3", "m3", "m5", "m5", "m5", "m9", "m9"]);
    const kongTiles = tiles(["m7", "m7", "m7", "m7"]);
    const [spring] = tiles(["spring"]);
    const check = checkWinningHand(hand);

    const score = scoreWinningHand({
      tiles: hand,
      winningTile: hand[hand.length - 1],
      kind: "self-draw",
      pattern: check.pattern!,
      melds: [
        {
          kind: "kong",
          kongKind: "concealed",
          tiles: kongTiles,
          from: 0,
          calledTile: kongTiles[0],
        },
      ],
      flowers: [spring],
      bonusEvent: "kong-draw",
    });

    expect(score.multiplier).toBe(24);
    expect(score.details).toContainEqual({ name: "封顶", multiplier: 24, operation: "cap" });
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
